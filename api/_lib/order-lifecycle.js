const db = require('./_db');
const { invalidateCache } = require('./cache');

const UNPAID_ORDER_EXPIRY_HOURS = 24;
const EXPIRY_SWEEP_THROTTLE_MS = 60 * 1000; // Max 1 sweep per 60s per server instance

let historyTableEnsured = false;
let orderPaymentColsEnsured = false;
let lastExpirySweepAt = 0;

async function ensureOrderPaymentColumns(runner = db) {
  if (orderPaymentColsEnsured) return;
  await runner.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS pelunasan_proof TEXT;
  `);
  orderPaymentColsEnsured = true;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Runs non-critical async work (such as sending emails) in the background
 * without blocking the HTTP response to the buyer/admin.
 * - Uses Vercel's native waitUntil context when running on Vercel Serverless.
 * - Uses setImmediate fire-and-forget when running on a persistent Node/Express server.
 * - Falls back to bounded parallel execution on unknown serverless environments.
 */
async function dispatchBackgroundTask(taskFn, label = 'background-task') {
  const runSafely = async () => {
    try {
      await taskFn();
    } catch (err) {
      console.error(`[${label}] error:`, err?.message || err);
    }
  };

  // 1. Check Vercel native request context waitUntil
  try {
    const vercelCtxSymbol = Symbol.for('@vercel/request-context');
    const vercelCtx = globalThis[vercelCtxSymbol]?.get?.();
    if (vercelCtx && typeof vercelCtx.waitUntil === 'function') {
      vercelCtx.waitUntil(runSafely());
      return;
    }
  } catch (_) {}

  // 2. Persistent Node/Express process (local dev, VPS, Railway, Render, etc.)
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!isServerless) {
    setImmediate(() => {
      runSafely();
    });
    return;
  }

  // 3. Fallback for serverless without waitUntil: cap wait time to 4s so checkout never hangs
  let timer;
  await Promise.race([
    runSafely(),
    new Promise((resolve) => {
      timer = setTimeout(resolve, 4000);
    })
  ]);
  if (timer) clearTimeout(timer);
}

async function ensureOrderHistoryTable(runner = db) {
  if (historyTableEnsured) return;
  await runner.query(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id BIGSERIAL PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status VARCHAR(50),
      to_status VARCHAR(50) NOT NULL,
      actor_type VARCHAR(20) NOT NULL DEFAULT 'system',
      actor_name TEXT,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id
      ON order_status_history(order_id, created_at ASC);
  `);
  historyTableEnsured = true;
}

async function recordOrderStatusHistory(runner, {
  orderId,
  fromStatus = null,
  toStatus,
  actorType = 'system',
  actorName = null,
  note = null
}) {
  if (!orderId || !toStatus) return;
  await ensureOrderHistoryTable(runner);
  await runner.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, actor_type, actor_name, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      String(orderId),
      fromStatus ? String(fromStatus) : null,
      String(toStatus),
      String(actorType || 'system'),
      actorName ? String(actorName) : null,
      note ? String(note) : null
    ]
  );
}

async function getOrderStatusHistory(orderId) {
  if (!orderId) return [];
  await ensureOrderHistoryTable(db);
  const { rows } = await db.query(
    `SELECT id, order_id, from_status, to_status, actor_type, actor_name, note, created_at
     FROM order_status_history
     WHERE order_id = $1
     ORDER BY created_at ASC, id ASC`,
    [String(orderId)]
  );
  return rows;
}

/**
 * Aggregates physical (non-photopack) quantities by product ID from an order's items array.
 */
function aggregatePhysicalItemQuantities(itemsRaw) {
  let items = [];
  if (Array.isArray(itemsRaw)) {
    items = itemsRaw;
  } else if (typeof itemsRaw === 'string') {
    try {
      items = JSON.parse(itemsRaw || '[]');
    } catch (_) {
      items = [];
    }
  }

  const qtyByProductId = new Map();
  for (const it of items) {
    if (!it || !it.id || it.is_photopack || it.category === 'Photopack') continue;
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    qtyByProductId.set(it.id, (qtyByProductId.get(it.id) || 0) + qty);
  }
  return qtyByProductId;
}

/**
 * Automatically cancels orders that remain in 'pending' status WITH NO payment proof
 * for longer than maxAgeHours (default 24h), and restores their locked physical product stock.
 * Never touches 'payment_pending' (where buyer already uploaded proof) or paid/shipped/completed orders.
 */
async function expireStalePendingOrders({ force = false, maxAgeHours = UNPAID_ORDER_EXPIRY_HOURS } = {}) {
  const now = Date.now();
  if (!force && now - lastExpirySweepAt < EXPIRY_SWEEP_THROTTLE_MS) {
    return { skipped: true, cancelledCount: 0, cancelledIds: [] };
  }
  lastExpirySweepAt = now;

  try {
    await ensureOrderHistoryTable(db);

    const cancelledIds = await db.withTransaction(async (client) => {
      const staleRes = await client.query(
        `SELECT id, items, status
         FROM orders
         WHERE status = 'pending'
           AND (payment_proof IS NULL OR payment_proof = '')
           AND date < NOW() - ($1::numeric * INTERVAL '1 hour')
         FOR UPDATE SKIP LOCKED`,
        [Number(maxAgeHours) || UNPAID_ORDER_EXPIRY_HOURS]
      );

      if (!staleRes.rows.length) {
        return [];
      }

      const ids = [];
      for (const order of staleRes.rows) {
        await client.query(
          `UPDATE orders
           SET status = 'cancelled', updated_at = NOW()
           WHERE id = $1`,
          [order.id]
        );

        const qtyByProduct = aggregatePhysicalItemQuantities(order.items);
        for (const [productId, totalQty] of qtyByProduct.entries()) {
          await client.query(
            `UPDATE products
             SET stock = stock + $1, updated_at = NOW()
             WHERE id = $2 AND COALESCE(is_photopack, FALSE) = FALSE`,
            [totalQty, productId]
          );
        }

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, actor_type, actor_name, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            order.id,
            order.status || 'pending',
            'cancelled',
            'system',
            'Sistem Otomatis',
            `Dibatalkan otomatis karena belum mengunggah bukti pembayaran dalam ${maxAgeHours} jam (stok dikembalikan)`
          ]
        );

        ids.push(order.id);
      }

      return ids;
    });

    if (cancelledIds.length > 0) {
      invalidateCache('products_*');
      console.log(`[Auto-Expire] Cancelled ${cancelledIds.length} unpaid pending order(s): ${cancelledIds.join(', ')}`);
    }

    return { skipped: false, cancelledCount: cancelledIds.length, cancelledIds };
  } catch (err) {
    console.error('[Auto-Expire] Error expiring stale orders:', err.message);
    return { skipped: false, cancelledCount: 0, cancelledIds: [], error: err.message };
  }
}

module.exports = {
  UNPAID_ORDER_EXPIRY_HOURS,
  escapeHtml,
  dispatchBackgroundTask,
  ensureOrderPaymentColumns,
  ensureOrderHistoryTable,
  recordOrderStatusHistory,
  getOrderStatusHistory,
  aggregatePhysicalItemQuantities,
  expireStalePendingOrders
};
