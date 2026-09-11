/**
 * migrate-order-invoice-ids.js
 * Migrates existing orders from legacy IDs (e.g. ORD-xxx, ORD-DIGITAL-xxx)
 * to sequential daily invoice IDs (e.g. INV-YYYYMMDD-01) grouped chronologically by order date in WIB.
 */

require('dotenv').config({ path: '.env.local' });
const db = require('../../api/_lib/_db');

async function migrate() {
  console.log('🚀 Starting migration of existing orders to daily sequential invoice format (INV-YYYYMMDD-01)...');

  // 1. Fetch all orders ordered chronologically
  const ordersRes = await db.query('SELECT id, date FROM orders ORDER BY date ASC, id ASC');
  const orders = ordersRes.rows;
  console.log(`📋 Found ${orders.length} orders to process.`);

  if (!orders.length) {
    console.log('No orders to migrate.');
    process.exit(0);
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const dailyCounts = {};
  const migrationPlan = [];

  for (const order of orders) {
    const orderDate = new Date(order.date);
    const dateKey = formatter.format(orderDate); // e.g. "2026-08-21"
    const compactDate = dateKey.replace(/-/g, ''); // "20260821"

    dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
    const seq = dailyCounts[dateKey];
    const newId = `INV-${compactDate}-${String(seq).padStart(2, '0')}`;

    migrationPlan.push({
      oldId: order.id,
      newId,
      dateKey,
      seq,
      date: order.date
    });
  }

  console.log('\n--- Migration Plan ---');
  migrationPlan.forEach((item, i) => {
    console.log(`${i + 1}. [${item.date.toISOString()}] ${item.oldId}  --->  ${item.newId}`);
  });
  console.log('----------------------\n');

  // 2. Perform migration in a database transaction
  console.log('⏳ Executing updates in PostgreSQL...');
  await db.query('BEGIN');

  try {
    for (const item of migrationPlan) {
      if (item.oldId === item.newId) continue;

      // Update reviews table if any review references this oldId
      const revRes = await db.query('UPDATE reviews SET order_id = $1 WHERE order_id = $2', [item.newId, item.oldId]);
      if (revRes.rowCount > 0) {
        console.log(`  ↪ Updated review reference for ${item.newId}`);
      }

      // Update orders table
      await db.query('UPDATE orders SET id = $1 WHERE id = $2', [item.newId, item.oldId]);
    }

    // 3. Update invoice_daily_sequences table to reflect the last sequence for each date
    await db.query(`
      CREATE TABLE IF NOT EXISTS invoice_daily_sequences (
        date_key VARCHAR(10) PRIMARY KEY,
        last_seq INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    for (const [dateKey, maxSeq] of Object.entries(dailyCounts)) {
      await db.query(
        `INSERT INTO invoice_daily_sequences (date_key, last_seq, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (date_key)
         DO UPDATE SET last_seq = GREATEST(invoice_daily_sequences.last_seq, EXCLUDED.last_seq), updated_at = NOW();`,
        [dateKey, maxSeq]
      );
    }

    await db.query('COMMIT');
    console.log('✅ COMMIT: All orders successfully migrated to new format!');
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('❌ ROLLBACK: Migration failed:', err.message);
    process.exit(1);
  }

  // 4. Verify migrated orders
  const verifyRes = await db.query('SELECT id, date FROM orders ORDER BY date ASC');
  console.log('\n--- Current Orders in Database ---');
  verifyRes.rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.id} (${r.date.toISOString()})`);
  });

  console.log('\n🎉 Migration completed successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
