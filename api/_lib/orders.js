const db = require('./_db');
const { requireAdmin, verifyAdminToken } = require('./admin-auth');
const { requireUserOrAdmin } = require('./user-auth');
const env = require('./env');
const { getRequiredEnv } = env;
const { invalidateCache } = require('./cache');
const { resolveShippingCost } = require('./shipping-rates');
const {
  escapeHtml,
  dispatchBackgroundTask,
  ensureOrderPaymentColumns,
  ensureOrderHistoryTable,
  recordOrderStatusHistory,
  getOrderStatusHistory,
  aggregatePhysicalItemQuantities,
  expireStalePendingOrders
} = require('./order-lifecycle');

function getMailTransport() {
  return env.createMailTransport();
}

function resolveSiteBaseUrl(req) {
  const configured = String(process.env.PUBLIC_SITE_URL || process.env.SITE_URL || '').trim();
  if (/^https?:\/\/[a-z0-9.-]+(?::\d+)?/i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }

  const origin = String((req && req.headers && req.headers.origin) || '').trim();
  if (/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) {
    return origin.replace(/\/+$/, '');
  }

  const host = String((req && req.headers && req.headers.host) || '').trim();
  if (/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
    return `${isLocal ? 'http' : 'https'}://${host}`;
  }

  return 'https://merch-aika.vercel.app';
}

async function sendOrderCompletedReviewEmail(order, req) {
  const transporter = getMailTransport();
  const emailUser = getRequiredEnv('EMAIL_USER');
  const baseUrl = resolveSiteBaseUrl(req);
  const reviewUrl = `${baseUrl}/profile.html?tab=orders&review=${encodeURIComponent(String(order.id || ''))}`;

  const safeCustomerName = escapeHtml(order.customerName || 'Pelanggan');
  const safeOrderId = escapeHtml(order.id);
  const safeReviewUrl = escapeHtml(reviewUrl);

  let itemsArr = [];
  try {
    itemsArr = Array.isArray(order.items)
      ? order.items
      : (typeof order.items === 'string' ? JSON.parse(order.items || '[]') : []);
  } catch (_) {
    itemsArr = [];
  }

  const itemsListHtml = itemsArr.length > 0
    ? `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; margin:18px 0;">
        <p style="margin:0 0 8px 0; font-size:13px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px;">Ringkasan Pesanan #${safeOrderId}</p>
        <ul style="margin:0; padding-left:18px; color:#1e293b; font-size:14px;">
          ${itemsArr.map(it => {
            const qty = Math.max(1, parseInt(it.qty, 10) || 1);
            const sizeLabel = it.size ? ` (Size ${escapeHtml(it.size)})` : '';
            return `<li style="margin-bottom:4px;"><strong>${escapeHtml(it.name || 'Produk')}</strong>${sizeLabel} &times; ${qty}</li>`;
          }).join('')}
        </ul>
        <p style="margin:10px 0 0 0; font-size:14px; color:#0284c7; font-weight:700;">Total Pesanan: Rp ${(Number(order.total) || 0).toLocaleString('id-ID')}</p>
      </div>
    `
    : '';

  const plainText = [
    `Halo ${order.customerName || 'Pelanggan'},`,
    '',
    `Yeay! Pesanan kamu #${order.id} di Aika Sesilia Official Store telah SELESAI.`,
    'Terima kasih banyak sudah berbelanja dan mendukung Aika Sesilia!',
    '',
    'Jangan lupa berikan Rating Bintang 5 (⭐⭐⭐⭐⭐) dan ulasan terbaikmu di website kami ya:',
    reviewUrl,
    '',
    'Cara memberi ulasan:',
    `1. Buka link di atas atau masuk ke halaman Profil -> Riwayat Pesanan`,
    `2. Cari pesanan #${order.id} lalu klik tombol "⭐ Beri Ulasan"`,
    '3. Pilih rating Bintang 5 dan tulis kesanmu!',
    '',
    'Salam hangat,',
    'Aika Sesilia Official Store'
  ].join('\n');

  await transporter.sendMail({
    from: `"Aika Sesilia" <${emailUser}>`,
    to: order.email,
    replyTo: emailUser,
    subject: `🎉 Pesanan #${order.id} Selesai! Jangan Lupa Kasih Rating Bintang 5 Ya ⭐⭐⭐⭐⭐`,
    text: plainText,
    html: `
      <div style="margin:0; padding:24px 12px; background-color:#f4f7fa; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#1e293b;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(15, 23, 42, 0.06);">
          <div style="background:#0f172a; padding:26px 24px; text-align:center; border-bottom:3px solid #29b6f6;">
            <h1 style="margin:0; color:#ffffff; font-size:21px; font-weight:800; letter-spacing:0.6px;">✦ AIKA SESILIA</h1>
            <p style="margin:4px 0 0 0; color:#38bdf8; font-size:13px;">Official Merchandise &amp; Digital Store</p>
          </div>

          <div style="padding:28px 26px;">
            <div style="display:inline-block; background:#dcfce7; color:#15803d; font-weight:700; font-size:12px; padding:5px 12px; border-radius:50px; margin-bottom:14px;">
              ✅ PESANAN SELESAI
            </div>

            <h2 style="margin:0 0 12px 0; color:#0f172a; font-size:20px; line-height:1.35;">
              Terima Kasih Banyak, ${safeCustomerName}! 💙
            </h2>

            <p style="margin:0 0 14px 0; color:#475569; font-size:15px; line-height:1.6;">
              Pesanan kamu dengan nomor <strong>#${safeOrderId}</strong> kini telah dinyatakan <strong>Selesai</strong>. Semoga kamu suka dengan merchandise / koleksi dari <strong>Aika Sesilia</strong>!
            </p>

            ${itemsListHtml}

            <div style="background:linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border:1px solid #fcd34d; border-radius:12px; padding:20px; text-align:center; margin:22px 0;">
              <div style="font-size:26px; letter-spacing:4px; margin-bottom:6px;">⭐⭐⭐⭐⭐</div>
              <h3 style="margin:0 0 8px 0; color:#92400e; font-size:17px; font-weight:800;">
                Jangan Lupa Kasih Rating Bintang 5 Ya!
              </h3>
              <p style="margin:0 0 18px 0; color:#78350f; font-size:14px; line-height:1.55;">
                Yuk luangkan waktu sebentar untuk memberikan <strong>Rating Bintang 5</strong> dan tulis kesanmu di website! Setiap ulasanmu sangat berarti untuk mendukung Aika Sesilia ✨
              </p>
              <a href="${safeReviewUrl}" target="_blank" style="display:inline-block; background:#0284c7; color:#ffffff; text-decoration:none; font-size:15px; font-weight:700; padding:13px 26px; border-radius:50px; box-shadow:0 4px 12px rgba(2, 132, 199, 0.3);">
                ⭐ Beri Rating Bintang 5 di Website →
              </a>
            </div>

            <p style="margin:0; color:#64748b; font-size:13px; line-height:1.6; text-align:center;">
              Atau buka website lalu masuk ke menu <strong>Profil &gt; Riwayat Pesanan</strong> dan klik tombol <strong>⭐ Beri Ulasan</strong> pada pesanan <strong>#${safeOrderId}</strong>.
            </p>
          </div>

          <div style="background:#f8fafc; padding:18px 24px; text-align:center; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px;">
            Terima kasih atas dukungan hangatmu untuk Aika Sesilia! 💙<br/>
            &copy; ${new Date().getFullYear()} Aika Sesilia Official Store
          </div>
        </div>
      </div>
    `
  });
}

const ORDER_LIST_COLUMNS = `
  id,
  "customerName",
  email,
  phone,
  address,
  notes,
  status,
  total,
  items,
  shipping,
  (payment_proof IS NOT NULL AND payment_proof <> '') AS has_payment_proof,
  (pelunasan_proof IS NOT NULL AND pelunasan_proof <> '') AS has_pelunasan_proof,
  date,
  updated_at
`;

const ORDER_DETAIL_COLUMNS = `
  ${ORDER_LIST_COLUMNS},
  payment_proof,
  pelunasan_proof
`;

const VALID_ORDER_STATUSES = new Set([
  'pending',
  'payment_pending',
  'paid',
  'shipped',
  'completed',
  'cancelled'
]);

const VALID_PAYMENT_ACTIONS = new Set([
  'request_reupload_initial',
  'verify_pelunasan',
  'reject_pelunasan'
]);

const SIZE_SURCHARGE_RULES = {
  'Pakaian Kaos': { XL: 15000, XXL: 25000, XXXL: 30000 },
  'Haori': { XL: 50000, XXL: 50000, XXXL: 50000 }
};

function getItemSizeTag(prod) {
  if (!prod) return '';
  const rawTag = String(prod.tag || '').trim();
  if (rawTag) {
    if (/haori/i.test(rawTag)) return 'Haori';
    if (/kaos/i.test(rawTag)) return 'Pakaian Kaos';
    return rawTag;
  }
  const name = String(prod.name || '').toLowerCase();
  const category = String(prod.category || '').toLowerCase();
  if (name.includes('haori')) return 'Haori';
  if (name.includes('kaos') || name.includes('t-shirt') || name.includes('tshirt') || category === 'pakaian') {
    return 'Pakaian Kaos';
  }
  return '';
}

function getItemSizeSurcharge(prod, size) {
  if (!prod || !size) return 0;
  const tag = getItemSizeTag(prod);
  const rules = SIZE_SURCHARGE_RULES[tag];
  if (!rules) return 0;
  const key = String(size).trim().toUpperCase();
  return rules[key] || 0;
}

async function evaluateVoucherInTransaction(runner, { code, subtotal, email }) {
  if (!code || typeof code !== 'string') {
    return { discountAmount: 0, code: null };
  }
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    return { discountAmount: 0, code: null };
  }

  // Kunci transaksi berdasarkan kode voucher agar kuota & batas 1x/akun bebas dari race-condition
  await runner.query("SELECT pg_advisory_xact_lock(hashtext('voucher:' || $1))", [normalizedCode]);

  let vouchers = [];
  try {
    const result = await runner.query("SELECT value FROM settings WHERE key = 'vouchers'");
    if (!result.rows.length) return { discountAmount: 0, code: null };
    const parsed = JSON.parse(result.rows[0].value || '[]');
    vouchers = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading vouchers in transaction:', err.message);
    return { discountAmount: 0, code: null };
  }

  const voucher = vouchers.find(v => (v.code || '').trim().toUpperCase() === normalizedCode);
  if (!voucher || voucher.isActive === false) {
    return { discountAmount: 0, code: null };
  }

  const now = new Date();
  if (voucher.startsAt && new Date(voucher.startsAt) > now) {
    return { discountAmount: 0, code: null };
  }
  if (voucher.expiresAt && new Date(voucher.expiresAt) < now) {
    return { discountAmount: 0, code: null };
  }

  const minPurchase = Math.max(0, parseInt(voucher.minPurchase, 10) || 0);
  if (subtotal < minPurchase) {
    return { discountAmount: 0, code: null };
  }

  const maxUses = voucher.maxUses === '' || voucher.maxUses == null
    ? null
    : Math.max(1, parseInt(voucher.maxUses, 10) || 1);
  const oncePerUser = Boolean(voucher.oncePerUser);

  if (maxUses !== null || oncePerUser) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const usageRes = await runner.query(
      `SELECT
         COUNT(*)::int AS total_used,
         COUNT(*) FILTER (WHERE $2 <> '' AND LOWER(TRIM(email)) = $2)::int AS user_used
       FROM orders
       WHERE status <> 'cancelled'
         AND UPPER(TRIM(COALESCE(shipping->'discount'->>'code', ''))) = $1`,
      [normalizedCode, cleanEmail]
    );
    const totalUsed = Number(usageRes.rows[0]?.total_used) || 0;
    const userUsed = Number(usageRes.rows[0]?.user_used) || 0;

    if (maxUses !== null && totalUsed >= maxUses) {
      throw createHttpError(
        400,
        `Maaf, kuota pemakaian voucher "${normalizedCode}" sudah habis (${maxUses}x pemakaian).`
      );
    }

    if (oncePerUser && cleanEmail && userUsed >= 1) {
      throw createHttpError(
        400,
        `Voucher "${normalizedCode}" hanya berlaku 1x per akun dan sudah pernah digunakan oleh akun ini.`
      );
    }
  }

  let discount = 0;
  if (voucher.type === 'percent') {
    discount = Math.round((subtotal * Math.min(100, Math.max(0, parseInt(voucher.value, 10) || 0))) / 100);
  } else {
    discount = Math.max(0, parseInt(voucher.value, 10) || 0);
  }

  if (voucher.maxDiscount != null && voucher.maxDiscount !== '') {
    const maxD = Math.max(0, parseInt(voucher.maxDiscount, 10) || 0);
    if (discount > maxD) discount = maxD;
  }

  const finalDiscount = Math.min(discount, subtotal);
  return {
    discountAmount: finalDiscount,
    code: finalDiscount > 0 ? normalizedCode : null
  };
}

let invoiceSeqTableEnsured = false;

async function ensureInvoiceSequenceTable() {
  if (invoiceSeqTableEnsured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS invoice_daily_sequences (
      date_key VARCHAR(10) PRIMARY KEY,
      last_seq INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  invoiceSeqTableEnsured = true;
}

async function generateDailyInvoiceId(runner = db) {
  await ensureInvoiceSequenceTable();
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const dateKey = formatter.format(now); // e.g. "2026-09-12"
  const compactDate = dateKey.replace(/-/g, ''); // "20260912"

  const res = await runner.query(
    `INSERT INTO invoice_daily_sequences (date_key, last_seq, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (date_key)
     DO UPDATE SET last_seq = invoice_daily_sequences.last_seq + 1, updated_at = NOW()
     RETURNING last_seq;`,
    [dateKey]
  );

  const seq = parseInt(res.rows[0].last_seq, 10) || 1;
  const formattedSeq = String(seq).padStart(2, '0');

  return `INV-${compactDate}-${formattedSeq}`;
}

function buildFallbackHistory(order) {
  const entries = [
    {
      id: 0,
      order_id: order.id,
      from_status: null,
      to_status: 'pending',
      actor_type: 'customer',
      actor_name: order.email || order.customerName || 'Pembeli',
      note: 'Pesanan dibuat (tercatat sebelum riwayat detail diaktifkan)',
      created_at: order.date
    }
  ];
  if (order.status && order.status !== 'pending') {
    entries.push({
      id: 1,
      order_id: order.id,
      from_status: 'pending',
      to_status: order.status,
      actor_type: 'system',
      actor_name: 'Sistem / Admin',
      note: `Status terakhir tercatat: ${order.status}`,
      created_at: order.updated_at || order.date
    });
  }
  return entries;
}

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-user-email');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { method } = req;

  try {
    if (method === 'GET') {
      if (!requireAdmin(req, res)) return;

      await ensureOrderPaymentColumns(db);
      // Auto-cancel pesanan 'pending' tanpa bukti bayar yang sudah lewat 24 jam
      await expireStalePendingOrders();

      const { id } = req.query;
      const sql = id
        ? `SELECT ${ORDER_DETAIL_COLUMNS} FROM orders WHERE id = $1`
        : `SELECT ${ORDER_LIST_COLUMNS} FROM orders ORDER BY date DESC`;
      const params = id ? [id] : [];
      const { rows } = await db.query(sql, params);
      if (id) {
        if (!rows.length) return res.status(404).json({ error: 'Order not found' });
        const orderRow = rows[0];
        let statusHistory = await getOrderStatusHistory(orderRow.id);
        if (!statusHistory.length) {
          statusHistory = buildFallbackHistory(orderRow);
        }
        return res.status(200).json({
          ...orderRow,
          status_history: statusHistory
        });
      }
      return res.status(200).json(rows);
    }

    if (method === 'POST') {
      await ensureOrderPaymentColumns(db);
      // Bebaskan stok dari pesanan 'pending' tanpa bukti bayar yang sudah lewat 24 jam
      await expireStalePendingOrders();

      const { id, customerName, email, address, items, shipping, note, notes, phone } = req.body || {};
      const cleanName = String(customerName || '').trim();
      const cleanEmail = String(email || '').trim();
      const cleanAddress = String(address || '').trim();
      const buyerNotes = (notes != null ? notes : (note != null ? note : '')).toString().trim();
      const buyerPhone = (phone != null ? phone : '').toString().trim();

      if (!cleanName || !cleanEmail || !cleanAddress) {
        return res.status(400).json({ error: 'Nama pelanggan, email, dan alamat pengiriman wajib diisi.' });
      }

      let parsedItems = [];
      try {
        parsedItems = Array.isArray(items) ? items : (typeof items === 'string' ? JSON.parse(items || '[]') : []);
      } catch (_) {
        return res.status(400).json({ error: 'Format daftar item pesanan tidak valid.' });
      }

      const validRawItems = parsedItems.filter(it => it && it.id);
      if (!validRawItems.length) {
        return res.status(400).json({ error: 'Pesanan harus memiliki setidaknya 1 item produk.' });
      }

      // 1. Ambil metadata produk dari database untuk hitung harga resmi, varian size, dan kategori
      const uniqueProductIds = [...new Set(validRawItems.map(it => String(it.id)))];
      const prodRes = await db.query(
        'SELECT id, name, price, stock, is_photopack, tag, category FROM products WHERE id = ANY($1::text[])',
        [uniqueProductIds]
      );
      const prodMap = new Map(prodRes.rows.map(p => [String(p.id), p]));

      let subtotal = 0;
      let totalSizeSurcharge = 0;
      let allPhotopack = true;
      const sanitizedItems = [];
      const physicalQtyByProductId = new Map();

      for (const item of validRawItems) {
        const prod = prodMap.get(String(item.id));
        if (!prod) {
          return res.status(400).json({
            error: `Produk "${item.name || item.id}" tidak ditemukan di database.`
          });
        }

        const requestedQty = Math.max(1, parseInt(item.qty, 10) || 1);
        const isPhotopack = Boolean(prod.is_photopack || prod.category === 'Photopack');

        if (!isPhotopack) {
          allPhotopack = false;
          const prevQty = physicalQtyByProductId.get(prod.id) || 0;
          physicalQtyByProductId.set(prod.id, prevQty + requestedQty);
        }

        const officialPrice = Number(prod.price) || 0;
        const sizeSurcharge = getItemSizeSurcharge(prod, item.size);

        subtotal += officialPrice * requestedQty;
        totalSizeSurcharge += sizeSurcharge * requestedQty;

        const sanitizedItem = {
          ...item,
          id: prod.id,
          name: prod.name,
          price: officialPrice,
          qty: requestedQty,
          is_photopack: isPhotopack
        };
        // Keamanan: buang link gdrive dari objek item yang disimpan di order
        delete sanitizedItem.gdrive_link;

        sanitizedItems.push(sanitizedItem);
      }

      // Pre-check ketersediaan stok agregat sebelum masuk transaksi
      for (const [productId, totalRequestedQty] of physicalQtyByProductId.entries()) {
        const prod = prodMap.get(productId);
        const availableStock = parseInt(prod.stock, 10) || 0;
        if (availableStock <= 0) {
          return res.status(400).json({
            error: `Maaf, stok produk "${prod.name}" sudah habis (0 tersisa). Pesanan tidak dapat diproses.`
          });
        }
        if (totalRequestedQty > availableStock) {
          return res.status(400).json({
            error: `Stok produk "${prod.name}" tidak mencukupi (tersisa: ${availableStock}, Anda memesan: ${totalRequestedQty}).`
          });
        }
      }

      // 2. Validasi ongkos kirim JNE secara resmi di server (tidak mempercayai shipObj.price dari browser)
      let shipObj = {};
      try {
        shipObj = typeof shipping === 'string' ? JSON.parse(shipping || '{}') : { ...(shipping || {}) };
      } catch (_) {
        shipObj = {};
      }

      const shippingCheck = resolveShippingCost({
        shipObj,
        address: cleanAddress,
        allPhotopack
      });

      if (!shippingCheck.ok) {
        return res.status(400).json({ error: shippingCheck.error });
      }

      const shippingCost = shippingCheck.cost;
      if (shippingCheck.city) shipObj.city = shippingCheck.city;
      if (shippingCheck.province) shipObj.province = shippingCheck.province;

      const requestedVoucherCode = shipObj.discount && shipObj.discount.code
        ? String(shipObj.discount.code).trim().toUpperCase()
        : '';
      const isDp = Boolean(shipObj.paymentScheme === 'dp50' || shipObj.isDp);

      // Status pesanan baru SELALU 'pending' untuk mencegah manipulasi status
      const initialStatus = 'pending';

      await ensureOrderHistoryTable(db);
      await ensureInvoiceSequenceTable();

      // 3. Transaksi Atomik: Kunci & validasi kuota voucher + Potong stok + Buat Invoice + Simpan Order + Catat History
      const {
        createdOrder,
        verifiedTotal,
        dpAmount,
        remainingAmount
      } = await db.withTransaction(async (client) => {
        let discountAmount = 0;
        if (requestedVoucherCode) {
          const voucherEval = await evaluateVoucherInTransaction(client, {
            code: requestedVoucherCode,
            subtotal,
            email: cleanEmail
          });
          discountAmount = voucherEval.discountAmount;
          if (discountAmount > 0 && voucherEval.code) {
            shipObj.discount = {
              code: voucherEval.code,
              amount: discountAmount
            };
          } else {
            shipObj.discount = null;
          }
        } else {
          shipObj.discount = null;
        }

        const txVerifiedTotal = Math.max(0, subtotal + shippingCost + totalSizeSurcharge - discountAmount);
        const txDpAmount = isDp ? Math.ceil(txVerifiedTotal * 0.5) : txVerifiedTotal;
        const txRemainingAmount = isDp ? Math.max(0, txVerifiedTotal - txDpAmount) : 0;

        shipObj.price = shippingCost;
        shipObj.sizeSurcharge = totalSizeSurcharge;
        shipObj.isDp = isDp;
        shipObj.dpPercent = isDp ? 50 : 100;
        shipObj.dpAmount = txDpAmount;
        shipObj.remainingAmount = txRemainingAmount;
        shipObj.originalTotal = txVerifiedTotal;
        if (isDp) {
          shipObj.pelunasanStatus = 'unpaid';
        }

        for (const [productId, totalRequestedQty] of physicalQtyByProductId.entries()) {
          const deductRes = await client.query(
            `UPDATE products
             SET stock = stock - $1, updated_at = NOW()
             WHERE id = $2 AND COALESCE(is_photopack, FALSE) = FALSE AND stock >= $1
             RETURNING id, stock`,
            [totalRequestedQty, productId]
          );

          if (!deductRes.rows.length) {
            const latestRes = await client.query('SELECT name, stock FROM products WHERE id = $1', [productId]);
            const latestProd = latestRes.rows[0] || prodMap.get(productId) || { name: productId, stock: 0 };
            const remaining = Math.max(0, parseInt(latestProd.stock, 10) || 0);
            const msg = remaining <= 0
              ? `Maaf, stok produk "${latestProd.name}" baru saja habis (0 tersisa). Pesanan dibatalkan otomatis.`
              : `Stok produk "${latestProd.name}" tidak mencukupi (tersisa: ${remaining}, Anda memesan: ${totalRequestedQty}).`;
            throw createHttpError(400, msg);
          }
        }

        let orderId = id;
        // Gunakan ID pengujian hanya jika diawali TEST-, selain itu buat nomor invoice berurutan resmi
        if (!orderId || !String(orderId).startsWith('TEST-')) {
          orderId = await generateDailyInvoiceId(client);
        }

        const insertRes = await client.query(
          `INSERT INTO orders (id, "customerName", email, address, status, total, items, shipping, notes, phone)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${ORDER_LIST_COLUMNS}`,
          [
            orderId,
            cleanName,
            cleanEmail,
            cleanAddress,
            initialStatus,
            txVerifiedTotal,
            JSON.stringify(sanitizedItems),
            JSON.stringify(shipObj),
            buyerNotes || null,
            buyerPhone || null
          ]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, actor_type, actor_name, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            orderId,
            null,
            initialStatus,
            'customer',
            cleanEmail || cleanName,
            isDp ? 'Pesanan dibuat (Skema DP 50%)' : 'Pesanan dibuat (Bayar Penuh 100%)'
          ]
        );

        return {
          createdOrder: insertRes.rows[0],
          verifiedTotal: txVerifiedTotal,
          dpAmount: txDpAmount,
          remainingAmount: txRemainingAmount
        };
      });

      if (physicalQtyByProductId.size > 0) {
        invalidateCache('products_*');
      }

      // 4. Kirim Notifikasi Email di Belakang Layar (Non-blocking & HTML-escaped)
      const isDummyEmail = !cleanEmail || cleanEmail.endsWith('@example.com') || cleanEmail.endsWith('.local') || cleanEmail.endsWith('@test.com');
      const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(req.headers && req.headers['x-test-suite']);

      if (!isDummyEmail && !isTestEnv) {
        const orderId = createdOrder.id;
        const safeName = escapeHtml(cleanName);
        const safeEmail = escapeHtml(cleanEmail);
        const safePhone = escapeHtml(buyerPhone || '-');
        const safeAddress = escapeHtml(cleanAddress);
        const safeNotes = escapeHtml(buyerNotes || '-');
        const safeOrderId = escapeHtml(orderId);
        const itemsHTML = sanitizedItems
          .map(item => `<li>${escapeHtml(item.name)}${item.size ? ` (Size ${escapeHtml(item.size)})` : ''} &times; ${item.qty} = Rp ${(item.price * item.qty).toLocaleString('id-ID')}</li>`)
          .join('');

        await dispatchBackgroundTask(async () => {
          const transporter = getMailTransport();
          const emailUser = getRequiredEnv('EMAIL_USER');
          const adminEmail = process.env.ADMIN_EMAIL || emailUser;

          const sendCustomerMail = transporter.sendMail({
            from: `"Aika Sesilia" <${emailUser}>`,
            to: cleanEmail,
            replyTo: emailUser,
            subject: `[Aika Sesilia] Pesanan #${orderId} Diterima ${isDp ? '(DP 50%) ' : ''}📦`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #29b6f6;">Halo, ${safeName}!</h2>
                <p>Terima kasih telah berbelanja di Aika Sesilia Merch.</p>
                <p>Pesanan Anda dengan nomor <strong>#${safeOrderId}</strong> telah diterima dan sedang menunggu verifikasi pembayaran ${isDp ? '<strong>DP 50% (Uang Muka)</strong>' : ''}.</p>
                <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:1rem;margin:1rem 0;">
                  <p style="margin:0 0 0.5rem 0;"><strong>Total Nilai Pesanan: Rp ${verifiedTotal.toLocaleString('id-ID')}</strong></p>
                  ${isDp ? `
                    <p style="margin:0 0 0.5rem 0;color:#0284c7;font-size:1.1rem;"><strong>Tagihan DP 50% (Harus Ditransfer): Rp ${dpAmount.toLocaleString('id-ID')}</strong></p>
                    <p style="margin:0;color:#64748b;font-size:0.9rem;">Sisa Tagihan Pelunasan: Rp ${remainingAmount.toLocaleString('id-ID')} (dibayarkan saat pesanan siap dikirim / COD)</p>
                  ` : `
                    <p style="margin:0;color:#0284c7;font-size:1.1rem;"><strong>Total Pembayaran: Rp ${verifiedTotal.toLocaleString('id-ID')}</strong></p>
                  `}
                </div>
                <p>Silakan selesaikan pembayaran dalam waktu 24 jam melalui website untuk melanjutkan.</p>
                <p>Terima kasih atas kepercayaan Anda!</p>
                <br/>
                <p>Salam hangat,<br/>Aika Sesilia</p>
              </div>
            `
          }).catch(err => console.error('Gagal mengirim email ke customer:', err.message));

          const sendAdminMail = transporter.sendMail({
            from: `"Aika Sesilia" <${emailUser}>`,
            to: adminEmail,
            replyTo: emailUser,
            subject: `[ADMIN] Pesanan Baru #${orderId} ${isDp ? '(DP 50%) ' : ''}dari ${cleanName}`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #ff6b6b;">📦 Pesanan Baru Masuk! ${isDp ? '<span style="font-size:0.8em;color:#29b6f6;">(SKEMA DP 50%)</span>' : ''}</h2>
                <p>Ada pesanan baru yang perlu diproses.</p>
                <table style="width:100%;border-collapse:collapse;margin-bottom:1rem;">
                  <tr style="background:#e8e8e8;">
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">No. Pesanan</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;"><strong>#${safeOrderId}</strong></td>
                  </tr>
                  <tr>
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Nama Pelanggan</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;">${safeName}</td>
                  </tr>
                  <tr style="background:#e8e8e8;">
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Email</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;">${safeEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">No. HP / WhatsApp</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;">${safePhone}</td>
                  </tr>
                  <tr style="background:#e8e8e8;">
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Alamat Pengiriman</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;">${safeAddress}</td>
                  </tr>
                  <tr>
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Catatan Pembeli</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;color:#d97706;font-weight:bold;">${safeNotes}</td>
                  </tr>
                  <tr style="background:#e8e8e8;">
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Total Nilai Pesanan</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;color:#ff6b6b;font-weight:bold;">Rp ${verifiedTotal.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr>
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Skema Pembayaran</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;color:#29b6f6;font-weight:bold;">${isDp ? '⚡ DP 50% (Uang Muka)' : '💎 Full Payment (100%)'}</td>
                  </tr>
                  ${isDp ? `
                  <tr style="background:#e8e8e8;">
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Nominal DP 50%</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;color:#4caf50;font-weight:bold;">Rp ${dpAmount.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr>
                    <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Sisa Pelunasan Nanti</td>
                    <td style="padding:0.8rem;border:1px solid #ddd;color:#ff9800;font-weight:bold;">Rp ${remainingAmount.toLocaleString('id-ID')}</td>
                  </tr>
                  ` : ''}
                </table>
                <h3 style="color:#333;">Item Pesanan:</h3>
                <ul style="background:#fff; padding:1.5rem; border-left: 4px solid #ff6b6b; border-radius:4px;">
                  ${itemsHTML}
                </ul>
                <p style="color:#666;margin-top:1.5rem;">Status: <strong style="color:#ff9800;">&#9203; MENUNGGU PEMBAYARAN ${isDp ? 'DP' : ''}</strong></p>
                <p style="font-size:0.9rem;color:#999;margin-top:2rem;">Email ini dikirim otomatis oleh sistem. Mohon segera verifikasi pembayaran pesanan ini.</p>
              </div>
            `
          }).catch(err => console.error('Gagal mengirim email ke admin:', err.message));

          await Promise.allSettled([sendCustomerMail, sendAdminMail]);
        }, 'order-created-emails');
      }

      return res.status(201).json(createdOrder);
    }

    if (method === 'PUT') {
      const { id, status: rawStatus, resi, paymentAction, actionNote } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'Order ID is required' });
      }
      const cleanPaymentAction = paymentAction ? String(paymentAction).trim() : '';
      if (cleanPaymentAction && !VALID_PAYMENT_ACTIONS.has(cleanPaymentAction)) {
        return res.status(400).json({ error: 'Aksi pembayaran tidak valid' });
      }
      if (!cleanPaymentAction && (!rawStatus || !VALID_ORDER_STATUSES.has(rawStatus))) {
        return res.status(400).json({ error: 'Status pesanan tidak valid' });
      }
      if (cleanPaymentAction && rawStatus && !VALID_ORDER_STATUSES.has(rawStatus)) {
        return res.status(400).json({ error: 'Status pesanan tidak valid' });
      }

      await ensureOrderPaymentColumns(db);
      await ensureOrderHistoryTable(db);
      const adminUser = verifyAdminToken(req);

      // Ambil data order yang sekarang
      const d = await db.query(`SELECT ${ORDER_DETAIL_COLUMNS} FROM orders WHERE id = $1`, [id]);
      if (d.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
      let order = d.rows[0];

      // Jika BUKAN admin, hanya perbolehkan pemilik pesanan (dengan JWT valid) mengonfirmasi pesanan yang sudah dikirim/dibayar menjadi 'completed'
      if (!adminUser) {
        if (cleanPaymentAction || rawStatus !== 'completed') {
          return res.status(403).json({ error: 'Hanya admin yang dapat mengubah status ini' });
        }

        const userAuth = requireUserOrAdmin(req, res, order.email);
        if (!userAuth) return;

        if (order.status === 'completed') {
          return res.status(200).json(order);
        }

        if (!['shipped', 'paid'].includes(order.status)) {
          return res.status(400).json({
            error: 'Pesanan hanya dapat dikonfirmasi selesai setelah pembayaran diverifikasi atau paket dikirim.'
          });
        }

        const updatedCustomerOrder = await db.withTransaction(async (client) => {
          const { rows } = await client.query(
            `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1 RETURNING ${ORDER_DETAIL_COLUMNS}`,
            [id]
          );
          await recordOrderStatusHistory(client, {
            orderId: id,
            fromStatus: order.status,
            toStatus: 'completed',
            actorType: 'customer',
            actorName: userAuth.email || order.email,
            note: 'Pesanan dikonfirmasi diterima/selesai oleh pembeli'
          });
          return rows[0];
        });

        const isDummyCustomerEmail = !updatedCustomerOrder.email
          || updatedCustomerOrder.email.endsWith('@example.com')
          || updatedCustomerOrder.email.endsWith('.local')
          || updatedCustomerOrder.email.endsWith('@test.com');
        const isCustomerTestEnv = process.env.NODE_ENV === 'test' || Boolean(req.headers && req.headers['x-test-suite']);

        if (!isDummyCustomerEmail && !isCustomerTestEnv) {
          await dispatchBackgroundTask(async () => {
            await sendOrderCompletedReviewEmail(updatedCustomerOrder, req);
          }, 'order-status-completed-customer-email');
        }

        return res.status(200).json(updatedCustomerOrder);
      }

      req.admin = adminUser;
      const cleanResi = typeof resi === 'string' ? resi.trim() : '';
      const cleanActionNote = typeof actionNote === 'string' ? actionNote.trim().slice(0, 400) : '';

      // Transaksi atomik untuk perubahan status / aksi pembayaran oleh Admin
      const { updatedOrder, stockChanged, prevStatus, finalStatus, appliedNote } = await db.withTransaction(async (client) => {
        const lockRes = await client.query(
          `SELECT status, items, shipping FROM orders WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!lockRes.rows.length) {
          throw createHttpError(404, 'Order not found');
        }

        const locked = lockRes.rows[0];
        const prevStatus = locked.status;
        let shipData = {};
        try {
          shipData = typeof locked.shipping === 'string'
            ? JSON.parse(locked.shipping || '{}')
            : { ...(locked.shipping || {}) };
        } catch (_) {
          shipData = {};
        }

        const isDpOrder = Boolean(shipData.paymentScheme === 'dp50' || shipData.isDp);
        let status = rawStatus || prevStatus;
        let noteForAction = '';

        if (cleanPaymentAction === 'request_reupload_initial') {
          status = 'pending';
          noteForAction = cleanActionNote || 'Bukti pembayaran kurang jelas atau nominal belum sesuai. Mohon unggah ulang bukti transfer yang benar.';
          shipData.reuploadRequested = true;
          shipData.reuploadNote = noteForAction;
          shipData.reuploadRequestedAt = new Date().toISOString();
        } else if (cleanPaymentAction === 'verify_pelunasan') {
          if (!isDpOrder) {
            throw createHttpError(400, 'Pesanan ini bukan skema DP 50%, tidak memiliki tagihan pelunasan.');
          }
          if (prevStatus === 'cancelled') {
            throw createHttpError(400, 'Tidak dapat memverifikasi pelunasan pada pesanan yang sudah dibatalkan.');
          }
          shipData.pelunasanStatus = 'verified';
          shipData.pelunasanVerifiedAt = new Date().toISOString();
          delete shipData.pelunasanRejectNote;
          noteForAction = cleanActionNote
            ? `Pelunasan sisa 50% diverifikasi admin (${cleanActionNote})`
            : 'Pelunasan sisa 50% diverifikasi admin (Lunas 100%)';
        } else if (cleanPaymentAction === 'reject_pelunasan') {
          if (!isDpOrder) {
            throw createHttpError(400, 'Pesanan ini bukan skema DP 50%.');
          }
          noteForAction = cleanActionNote || 'Bukti pelunasan belum sesuai, mohon unggah ulang bukti transfer sisa 50%.';
          shipData.pelunasanStatus = 'rejected';
          shipData.pelunasanRejectNote = noteForAction;
          shipData.pelunasanRejectedAt = new Date().toISOString();
        } else if (status === 'paid' && shipData.reuploadRequested) {
          shipData.reuploadRequested = false;
          delete shipData.reuploadNote;
        }

        const prevResi = shipData.resi || '';
        if (cleanResi) {
          shipData.resi = cleanResi;
        }

        let didChangeStock = false;
        const qtyByProduct = aggregatePhysicalItemQuantities(locked.items);

        // 1. Jika baru berubah menjadi 'cancelled', kembalikan stok fisik
        if (status === 'cancelled' && prevStatus !== 'cancelled') {
          for (const [productId, totalQty] of qtyByProduct.entries()) {
            await client.query(
              `UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND COALESCE(is_photopack, FALSE) = FALSE`,
              [totalQty, productId]
            );
            didChangeStock = true;
          }
        }
        // 2. Jika pesanan yang sudah 'cancelled' diaktifkan kembali oleh admin, potong kembali stok fisik secara atomik
        else if (prevStatus === 'cancelled' && status !== 'cancelled') {
          for (const [productId, totalQty] of qtyByProduct.entries()) {
            const deductRes = await client.query(
              `UPDATE products
               SET stock = stock - $1, updated_at = NOW()
               WHERE id = $2 AND COALESCE(is_photopack, FALSE) = FALSE AND stock >= $1
               RETURNING id`,
              [totalQty, productId]
            );
            if (!deductRes.rows.length) {
              throw createHttpError(400, `Tidak dapat mengaktifkan kembali pesanan yang dibatalkan karena stok produk (${productId}) sudah tidak mencukupi.`);
            }
            didChangeStock = true;
          }
        }

        const updateRes = await client.query(
          `UPDATE orders
           SET status = $1, shipping = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING ${ORDER_DETAIL_COLUMNS}`,
          [status, JSON.stringify(shipData), id]
        );

        const adminActor = adminUser.username || String(adminUser.adminId) || 'Admin';
        if (cleanPaymentAction) {
          const historyMsg = cleanPaymentAction === 'request_reupload_initial'
            ? `Admin meminta upload ulang bukti bayar awal: ${noteForAction}`
            : cleanPaymentAction === 'verify_pelunasan'
              ? noteForAction
              : `Bukti pelunasan ditolak admin (diminta upload ulang): ${noteForAction}`;

          await recordOrderStatusHistory(client, {
            orderId: id,
            fromStatus: prevStatus,
            toStatus: status,
            actorType: 'admin',
            actorName: adminActor,
            note: historyMsg
          });
        } else if (prevStatus !== status || (cleanResi && cleanResi !== prevResi)) {
          let historyNote = 'Status pesanan diperbarui oleh admin';
          if (status === 'paid') {
            historyNote = isDpOrder
              ? 'Pembayaran DP 50% diverifikasi oleh admin (status: Dikemas)'
              : 'Pembayaran diverifikasi oleh admin (status: Dikemas)';
          } else if (status === 'shipped') {
            historyNote = cleanResi
              ? `Pesanan dikirim (No. Resi: ${cleanResi})`
              : 'Pesanan ditandai telah dikirim';
          } else if (status === 'completed') {
            historyNote = 'Pesanan ditandai selesai oleh admin';
          } else if (status === 'cancelled') {
            historyNote = 'Pesanan dibatalkan oleh admin (stok produk dikembalikan)';
          }

          await recordOrderStatusHistory(client, {
            orderId: id,
            fromStatus: prevStatus,
            toStatus: status,
            actorType: 'admin',
            actorName: adminActor,
            note: historyNote
          });
        }

        return {
          updatedOrder: updateRes.rows[0],
          stockChanged: didChangeStock,
          prevStatus,
          finalStatus: status,
          appliedNote: noteForAction
        };
      });

      order = updatedOrder;
      const status = finalStatus;
      if (stockChanged) {
        invalidateCache('products_*');
      }

      const isDummyEmail = !order.email || order.email.endsWith('@example.com') || order.email.endsWith('.local') || order.email.endsWith('@test.com');
      const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(req.headers && req.headers['x-test-suite']);
      const shouldSendCompletedEmail = !cleanPaymentAction && status === 'completed' && prevStatus !== 'completed';
      const shouldSendPaymentActionEmail = Boolean(cleanPaymentAction);
      const shouldSendStatusEmail = !cleanPaymentAction && (status === 'paid' || status === 'shipped' || shouldSendCompletedEmail);

      if (!isDummyEmail && !isTestEnv && (shouldSendPaymentActionEmail || shouldSendStatusEmail)) {
        await dispatchBackgroundTask(async () => {
          const transporter = getMailTransport();
          const emailUser = getRequiredEnv('EMAIL_USER');
          const safeCustomerName = escapeHtml(order.customerName);
          const safeOrderId = escapeHtml(order.id);
          const baseUrl = resolveSiteBaseUrl(req);
          const safeOrdersUrl = escapeHtml(`${baseUrl}/profile.html?tab=orders`);
          const parsedShip = typeof order.shipping === 'string'
            ? JSON.parse(order.shipping || '{}')
            : (order.shipping || {});
          const isDpMail = Boolean(parsedShip.paymentScheme === 'dp50' || parsedShip.isDp);
          const dpAmtMail = Number(parsedShip.dpAmount) || Math.ceil((Number(order.total) || 0) * 0.5);
          const remAmtMail = Number(parsedShip.remainingAmount) || Math.max(0, (Number(order.total) || 0) - dpAmtMail);

          if (cleanPaymentAction === 'request_reupload_initial') {
            await transporter.sendMail({
              from: `"Aika Sesilia" <${emailUser}>`,
              to: order.email,
              subject: `⚠️ Mohon Upload Ulang Bukti Pembayaran - Pesanan #${order.id}`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #d97706;">⚠️ Permintaan Upload Ulang Bukti Pembayaran</h2>
                  <p>Halo ${safeCustomerName},</p>
                  <p>Admin kami telah memeriksa bukti pembayaran untuk pesanan <strong>#${safeOrderId}</strong> (stok pesanan Anda <strong>tetap aman &amp; tidak dibatalkan</strong>), namun kami memerlukan unggahan ulang bukti transfer:</p>
                  <div style="background:#fffbeb; border-left:4px solid #f59e0b; padding:1rem 1.25rem; border-radius:6px; margin:1.2rem 0;">
                    <p style="margin:0; font-weight:bold; color:#92400e;">Catatan Admin:</p>
                    <p style="margin:0.4rem 0 0 0; color:#78350f;">${escapeHtml(appliedNote)}</p>
                  </div>
                  <p>Silakan buka halaman Riwayat Pesanan di bawah ini lalu klik tombol <strong>🔄 Upload Ulang Bukti Bayar</strong>:</p>
                  <p style="margin:1.25rem 0;">
                    <a href="${safeOrdersUrl}" target="_blank" style="display:inline-block; background:#0284c7; color:#fff; text-decoration:none; font-weight:bold; padding:12px 22px; border-radius:8px;">📤 Upload Ulang Bukti Pembayaran →</a>
                  </p>
                  <p>Salam hangat,<br/><strong>Aika Sesilia</strong></p>
                </div>
              `
            });
            return;
          }

          if (cleanPaymentAction === 'reject_pelunasan') {
            await transporter.sendMail({
              from: `"Aika Sesilia" <${emailUser}>`,
              to: order.email,
              subject: `⚠️ Mohon Upload Ulang Bukti Pelunasan Sisa 50% - Pesanan #${order.id}`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #d97706;">⚠️ Bukti Pelunasan Sisa 50% Perlu Diunggah Ulang</h2>
                  <p>Halo ${safeCustomerName},</p>
                  <p>Bukti pelunasan sisa 50% (<strong>Rp ${remAmtMail.toLocaleString('id-ID')}</strong>) untuk pesanan <strong>#${safeOrderId}</strong> belum dapat diverifikasi:</p>
                  <div style="background:#fffbeb; border-left:4px solid #f59e0b; padding:1rem 1.25rem; border-radius:6px; margin:1.2rem 0;">
                    <p style="margin:0; font-weight:bold; color:#92400e;">Catatan Admin:</p>
                    <p style="margin:0.4rem 0 0 0; color:#78350f;">${escapeHtml(appliedNote)}</p>
                  </div>
                  <p style="margin:1.25rem 0;">
                    <a href="${safeOrdersUrl}" target="_blank" style="display:inline-block; background:#0284c7; color:#fff; text-decoration:none; font-weight:bold; padding:12px 22px; border-radius:8px;">💳 Upload Ulang Bukti Pelunasan →</a>
                  </p>
                  <p>Salam hangat,<br/><strong>Aika Sesilia</strong></p>
                </div>
              `
            });
            return;
          }

          if (cleanPaymentAction === 'verify_pelunasan') {
            let gdriveLinksHTML = '';
            const itemsArr = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items || '[]') : []);
            const productsRes = await db.query('SELECT id, name, gdrive_link, is_photopack, category FROM products');
            const prodMap = {};
            productsRes.rows.forEach(p => { prodMap[p.id] = p; });
            const photopackLinks = [];
            itemsArr.forEach(item => {
              const prod = prodMap[item.id] || {};
              if (prod.is_photopack || prod.category === 'Photopack' || item.is_photopack) {
                const rawLink = String(prod.gdrive_link || item.gdrive_link || '').trim();
                if (/^https?:\/\//i.test(rawLink)) {
                  photopackLinks.push({ name: item.name || prod.name, link: rawLink });
                }
              }
            });
            if (photopackLinks.length > 0) {
              gdriveLinksHTML = `
                <div style="background:#e0f2fe; padding:1.5rem; border-left: 4px solid #0284c7; border-radius:6px; margin:1.5rem 0;">
                  <h3 style="margin:0 0 0.5rem 0; color:#0369a1;">📸 Link Akses Google Drive Photopack Anda</h3>
                  <ul style="margin:0; padding-left:1.2rem; color:#0369a1;">
                    ${photopackLinks.map(p => `<li style="margin-bottom:0.5rem;"><strong>${escapeHtml(p.name)}:</strong> <a href="${escapeHtml(p.link)}" target="_blank" style="color:#0284c7; font-weight:bold; text-decoration:underline;">${escapeHtml(p.link)}</a></li>`).join('')}
                  </ul>
                </div>
              `;
            }

            await transporter.sendMail({
              from: `"Aika Sesilia" <${emailUser}>`,
              to: order.email,
              subject: `✅ Pelunasan 100% Dikonfirmasi - Pesanan #${order.id}`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #16a34a;">✅ Pesanan Anda Telah Lunas 100%!</h2>
                  <p>Halo ${safeCustomerName},</p>
                  <p>Pelunasan sisa 50% (<strong>Rp ${remAmtMail.toLocaleString('id-ID')}</strong>) untuk pesanan <strong>#${safeOrderId}</strong> telah berhasil diverifikasi oleh admin.</p>
                  ${gdriveLinksHTML}
                  <div style="background:#f0fdf4; padding:1.25rem; border-left: 4px solid #16a34a; border-radius:4px; margin:1.25rem 0;">
                    <p style="margin:0; font-weight:bold; color:#15803d;">Status Pembayaran: LUNAS 100% (Total Rp ${(order.total || 0).toLocaleString('id-ID')})</p>
                  </div>
                  <p>Terima kasih atas kepercayaan Anda berbelanja di Aika Sesilia!</p>
                  <p>Salam hangat,<br/><strong>Aika Sesilia</strong></p>
                </div>
              `
            });
            return;
          }

          if (status === 'paid') {
            let gdriveLinksHTML = '';
            if (!isDpMail || parsedShip.pelunasanStatus === 'verified') {
              const itemsArr = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items || '[]') : []);
              const productsRes = await db.query('SELECT id, name, gdrive_link, is_photopack, category FROM products');
              const prodMap = {};
              productsRes.rows.forEach(p => { prodMap[p.id] = p; });

              const photopackLinks = [];
              itemsArr.forEach(item => {
                const prod = prodMap[item.id] || {};
                if (prod.is_photopack || prod.category === 'Photopack' || item.is_photopack) {
                  const rawLink = String(prod.gdrive_link || item.gdrive_link || '').trim();
                  if (/^https?:\/\//i.test(rawLink)) {
                    photopackLinks.push({ name: item.name || prod.name, link: rawLink });
                  }
                }
              });

              if (photopackLinks.length > 0) {
                gdriveLinksHTML = `
                  <div style="background:#e0f2fe; padding:1.5rem; border-left: 4px solid #0284c7; border-radius:6px; margin:1.5rem 0;">
                    <h3 style="margin:0 0 0.5rem 0; color:#0369a1;">📸 Link Akses Google Drive Photopack Anda</h3>
                    <p style="margin:0 0 1rem 0; font-size:0.9rem; color:#0c4a6e;">Selamat! Admin telah memverifikasi pembayaran Anda. Klik link di bawah ini untuk mengunduh/melihat photopack Anda:</p>
                    <ul style="margin:0; padding-left:1.2rem; color:#0369a1;">
                      ${photopackLinks.map(p => `<li style="margin-bottom:0.5rem;"><strong>${escapeHtml(p.name)}:</strong> <a href="${escapeHtml(p.link)}" target="_blank" style="color:#0284c7; font-weight:bold; text-decoration:underline;">${escapeHtml(p.link)}</a></li>`).join('')}
                    </ul>
                  </div>
                `;
              }
            }

            await transporter.sendMail({
              from: `"Aika Sesilia" <${emailUser}>`,
              to: order.email,
              subject: `✅ Pembayaran ${isDpMail ? 'DP 50% ' : ''}Dikonfirmasi - Pesanan #${order.id} ${gdriveLinksHTML ? '📸 Photopack Siap Diunduh' : 'Sedang Dikemas'} 📦`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #4caf50;">✅ Pembayaran ${isDpMail ? 'DP 50% ' : ''}Dikonfirmasi!</h2>
                  <p>Halo ${safeCustomerName},</p>
                  <p>Pembayaran ${isDpMail ? `<strong>DP 50% (Rp ${dpAmtMail.toLocaleString('id-ID')})</strong> ` : ''}Anda untuk pesanan <strong>#${safeOrderId}</strong> telah berhasil kami verifikasi.</p>
                  ${gdriveLinksHTML}
                  <div style="background:#f0f8f0; padding:1.5rem; border-left: 4px solid #4caf50; border-radius:4px; margin:1.5rem 0;">
                    <p style="margin:0;font-weight:bold;color:#333;">Status: ${isDpMail ? 'DP 50% Terverifikasi (Pesanan Dikemas)' : 'Pembayaran Diverifikasi Admin'}</p>
                    <p style="margin:0.5rem 0; font-size:0.9rem; color:#666;">Terima kasih telah melakukan pembelian di Aika Sesilia Official Store.</p>
                    ${isDpMail && parsedShip.pelunasanStatus !== 'verified' ? `
                      <p style="margin:0.8rem 0 0 0; font-size:0.9rem; color:#0369a1;">
                        <strong>💳 Pelunasan Sisa 50% (Rp ${remAmtMail.toLocaleString('id-ID')}):</strong> Anda kini dapat melakukan pelunasan dan mengunggah bukti transfer kedua kapan saja melalui halaman <a href="${safeOrdersUrl}" style="color:#0284c7;font-weight:bold;">Profil &gt; Riwayat Pesanan</a>.
                      </p>
                    ` : ''}
                  </div>
                  <p><strong>Detail Pesanan:</strong></p>
                  <p>Total Nilai Pesanan: <strong>Rp ${(order.total || 0).toLocaleString('id-ID')}</strong></p>
                  <p style="margin-top:1.5rem;">Terima kasih telah berbelanja di Aika Sesilia! Jika ada pertanyaan, hubungi kami.</p>
                  <p>Salam hangat,<br/><strong>Aika Sesilia</strong></p>
                </div>
              `
            });
          } else if (status === 'shipped') {
            const rawTrackNo = cleanResi || (order.shipping && typeof order.shipping === 'object' && order.shipping.resi) || '[Menunggu Resi JNE]';
            const safeTrackNo = escapeHtml(rawTrackNo);

            await transporter.sendMail({
              from: `"Aika Sesilia" <${emailUser}>`,
              to: order.email,
              subject: `Hore! Pesanan #${order.id} Telah Dikirim 🚚`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #29b6f6;">Pesanan Meluncur, ${safeCustomerName}!</h2>
                  <p>Paket Merchandise Anda telah diserahkan ke jasa kirim.</p>
                  <p>Status: <strong>DIKIRIM</strong></p>
                  <p>No. Resi Pengiriman: <strong style="color:#111;">${safeTrackNo}</strong></p>
                  <p>Anda bisa melacak resi tersebut melalui website resmi JNE.</p>
                  <p>Terima kasih atas dukungannya ke Aika Sesilia!</p>
                </div>
              `
            });
          } else if (shouldSendCompletedEmail) {
            await sendOrderCompletedReviewEmail(order, req);
          }
        }, `order-status-${cleanPaymentAction || status}-email`);
      }

      return res.status(200).json(order);
    }

    if (method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const { id } = req.query;
      if (id === 'ALL') {
        await db.query('DELETE FROM orders');
      } else {
        await db.query('DELETE FROM orders WHERE id = $1', [id]);
      }
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
