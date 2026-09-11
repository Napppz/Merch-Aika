require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const assert = require('assert');
const db = require('../../api/_lib/_db');

async function run() {
  console.log('🧪 Starting Daily Sequential Invoice Verification Test...');

  // 1. Fetch any valid product from database with available stock
  const pRes = await db.query('SELECT id, name, price, stock FROM products WHERE stock > 5 LIMIT 1');
  if (!pRes.rows.length) {
    console.log('No products found to test.');
    process.exit(1);
  }
  const testProduct = pRes.rows[0];

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const todayKey = formatter.format(new Date());
  const compactToday = todayKey.replace(/-/g, '');

  console.log(`📅 Testing for dateKey: ${todayKey} (Compact: ${compactToday})`);

  // Clear test date keys if needed
  const testSimulatedDateKey = '2099-12-31';
  const testSimulatedCompact = '20991231';
  await db.query('DELETE FROM invoice_daily_sequences WHERE date_key = $1', [testSimulatedDateKey]);

  // Test the generator function logic directly
  const orderHandler = require('../../api/_lib/orders');

  // Helper to create order via handler mock
  async function simulateCreateOrder(payload) {
    return new Promise((resolve, reject) => {
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-suite': 'true' },
        body: payload
      };
      const res = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(data) { resolve({ statusCode: this.statusCode, data }); },
        end() { resolve({ statusCode: this.statusCode }); }
      };
      orderHandler(req, res).catch(reject);
    });
  }

  // Create Order 1
  const payload1 = {
    customerName: 'Invoice Test 1',
    email: 'test-inv1@example.com',
    address: 'Jl. Test Invoice 1',
    items: [{ id: testProduct.id, name: testProduct.name, price: testProduct.price, qty: 1 }],
    shipping: { method: 'cod_event', price: 0 }
  };

  const res1 = await simulateCreateOrder(payload1);
  assert.strictEqual(res1.statusCode, 201, `Expected 201, got ${res1.statusCode}: ${JSON.stringify(res1.data)}`);
  const order1 = res1.data;
  console.log(`✅ Order 1 Created: ${order1.id}`);
  assert(order1.id.startsWith(`INV-${compactToday}-`), `Expected ${order1.id} to start with INV-${compactToday}-`);

  const num1 = parseInt(order1.id.split('-').pop(), 10);

  // Create Order 2
  const payload2 = {
    customerName: 'Invoice Test 2',
    email: 'test-inv2@example.com',
    address: 'Jl. Test Invoice 2',
    items: [{ id: testProduct.id, name: testProduct.name, price: testProduct.price, qty: 1 }],
    shipping: { method: 'cod_event', price: 0 }
  };

  const res2 = await simulateCreateOrder(payload2);
  assert.strictEqual(res2.statusCode, 201, `Expected 201, got ${res2.statusCode}`);
  const order2 = res2.data;
  console.log(`✅ Order 2 Created: ${order2.id}`);
  assert(order2.id.startsWith(`INV-${compactToday}-`), `Expected ${order2.id} to start with INV-${compactToday}-`);

  const num2 = parseInt(order2.id.split('-').pop(), 10);
  assert.strictEqual(num2, num1 + 1, `Order 2 number (${num2}) must be exactly Order 1 number (${num1}) + 1`);

  // Test Daily Reset Simulation
  console.log('🔄 Testing Daily Reset Simulation on a new date...');
  const resetRes1 = await db.query(
    `INSERT INTO invoice_daily_sequences (date_key, last_seq, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (date_key)
     DO UPDATE SET last_seq = invoice_daily_sequences.last_seq + 1, updated_at = NOW()
     RETURNING last_seq;`,
    [testSimulatedDateKey]
  );
  const resetSeq1 = parseInt(resetRes1.rows[0].last_seq, 10);
  assert.strictEqual(resetSeq1, 1, `First order of a new day must start at 1, got ${resetSeq1}`);
  console.log(`✅ Simulated New Day First Order Sequence: ${String(resetSeq1).padStart(2, '0')} (INV-${testSimulatedCompact}-01)`);

  const resetRes2 = await db.query(
    `INSERT INTO invoice_daily_sequences (date_key, last_seq, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (date_key)
     DO UPDATE SET last_seq = invoice_daily_sequences.last_seq + 1, updated_at = NOW()
     RETURNING last_seq;`,
    [testSimulatedDateKey]
  );
  const resetSeq2 = parseInt(resetRes2.rows[0].last_seq, 10);
  assert.strictEqual(resetSeq2, 2, `Second order of the day must increment to 2, got ${resetSeq2}`);
  console.log(`✅ Simulated New Day Second Order Sequence: ${String(resetSeq2).padStart(2, '0')} (INV-${testSimulatedCompact}-02)`);

  // Clean up test data
  console.log('🧹 Cleaning up test data...');
  await db.query('DELETE FROM orders WHERE id IN ($1, $2)', [order1.id, order2.id]);
  await db.query('UPDATE products SET stock = stock + 2 WHERE id = $1', [testProduct.id]);
  await db.query('DELETE FROM invoice_daily_sequences WHERE date_key = $1', [testSimulatedDateKey]);

  console.log('🎉 ALL DAILY INVOICE TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
