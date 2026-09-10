require('dotenv').config({ path: '.env.local' });
const assert = require('assert');
const db = require('../api/_lib/_db');
const { generateJWT } = require('../api/_lib/jwt-manager');

async function testVulnerability1() {
  console.log('\n--- [TEST 1] Testing Sensitive File Access Blocking ---');
  const sensitivePaths = [
    '/.env.local',
    '/.env',
    '/server.js',
    '/package.json',
    '/package-lock.json',
    '/api/_lib/jwt-manager.js',
    '/scripts/test-stock-flow.js'
  ];

  for (const p of sensitivePaths) {
    const res = await fetch(`http://localhost:3000${p}`);
    console.log(`GET ${p} -> Status: ${res.status}`);
    assert.strictEqual(res.status, 403, `Expected 403 for ${p}, got ${res.status}`);
  }

  const normalRes = await fetch('http://localhost:3000/index.html');
  console.log(`GET /index.html -> Status: ${normalRes.status}`);
  assert.strictEqual(normalRes.status, 200, 'Expected 200 for /index.html');
  console.log('✓ TEST 1 PASSED: All sensitive files are blocked with 403 Forbidden.');
}

async function testVulnerability3() {
  console.log('\n--- [TEST 2] Testing Photopack Google Drive Link Protection ---');
  // 1. Unauthenticated request with admin=true
  const unauthRes = await fetch('http://localhost:3000/api/products?admin=true');
  const unauthProducts = await unauthRes.json();
  const unauthHasGdrive = unauthProducts.some(p => 'gdrive_link' in p && p.gdrive_link);
  console.log(`Unauthenticated GET /api/products?admin=true -> gdrive_link leaked: ${unauthHasGdrive}`);
  assert.strictEqual(unauthHasGdrive, false, 'Unauthenticated user must NOT receive gdrive_link');

  // 2. Authenticated request with valid admin token
  const adminToken = generateJWT({ adminId: 'admin-test', type: 'admin' });
  const authRes = await fetch('http://localhost:3000/api/products?admin=true', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const authProducts = await authRes.json();
  const authHasGdrive = authProducts.some(p => 'gdrive_link' in p);
  console.log(`Admin GET /api/products?admin=true with token -> gdrive_link accessible: ${authHasGdrive}`);
  assert.strictEqual(authHasGdrive, true, 'Admin with valid token MUST receive gdrive_link');
  console.log('✓ TEST 2 PASSED: gdrive_link is strictly protected by admin token verification.');
}

async function testVulnerability4() {
  console.log('\n--- [TEST 3] Testing Order Status & Price Tampering Prevention ---');
  const pRes = await db.query('SELECT id, name, price, stock FROM products WHERE stock >= 2 LIMIT 1;');
  if (!pRes.rows.length) {
    console.log('Skipping order tampering test: no products in DB');
    return;
  }
  const prod = pRes.rows[0];
  const officialPrice = Number(prod.price);
  console.log(`Target Product: "${prod.name}" (Official Price: Rp ${officialPrice}, Stock: ${prod.stock})`);

  const fakeOrderId = 'TEST-TAMPER-' + Date.now();
  // Attacker attempts: status = 'completed', item price = 100, grand total = 100
  const fakePayload = {
    id: fakeOrderId,
    customerName: 'Hacker Tamper Test',
    email: 'hacker@test.local',
    address: 'Cyber Street 101',
    status: 'completed', // Attacker trying to spoof completed status
    total: 100,         // Attacker trying to spoof 100 IDR total
    items: [
      { id: prod.id, name: prod.name, qty: 1, price: 100 } // Attacker spoofing item price
    ],
    shipping: {
      method: 'jne',
      price: 15000,
      discount: { code: 'FAKE_DISCOUNT_999999', amount: 500000 } // Fake voucher
    }
  };

  const createRes = await fetch('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fakePayload)
  });

  assert.strictEqual(createRes.status, 201, `Expected 201 Created, got ${createRes.status}`);
  const createdOrder = await createRes.json();

  console.log('Returned Order from Server:');
  console.log(`- Status: "${createdOrder.status}" (Expected: "pending")`);
  console.log(`- Total: Rp ${createdOrder.total} (Expected: officialPrice ${officialPrice} + 15000 shipping = ${officialPrice + 15000})`);

  // Verify in database
  const dbOrderRes = await db.query('SELECT id, status, total, items, shipping FROM orders WHERE id = $1', [fakeOrderId]);
  assert.strictEqual(dbOrderRes.rows.length, 1, 'Order must exist in database');
  const dbOrder = dbOrderRes.rows[0];

  assert.strictEqual(dbOrder.status, 'pending', 'Order status in DB MUST be forced to "pending"');
  const expectedTotal = officialPrice + 15000;
  assert.strictEqual(Number(dbOrder.total), expectedTotal, `Order total in DB MUST be ${expectedTotal}, got ${dbOrder.total}`);

  const parsedItems = typeof dbOrder.items === 'string' ? JSON.parse(dbOrder.items) : dbOrder.items;
  assert.strictEqual(Number(parsedItems[0].price), officialPrice, 'Item price in DB items MUST match official DB price');

  console.log('✓ Database verification successful: status is "pending", total and item prices are recalculating correctly.');

  // Cleanup test order and restore stock
  await db.query('DELETE FROM orders WHERE id = $1', [fakeOrderId]);
  await db.query('UPDATE products SET stock = stock + 1 WHERE id = $1', [prod.id]);
  console.log('✓ Cleaned up test order and restored stock.');
  console.log('✓ TEST 3 PASSED: Order status and price tampering successfully neutralized!');
}

async function runAll() {
  try {
    await testVulnerability1();
    await testVulnerability3();
    await testVulnerability4();
    console.log('\n🎉 ALL SECURITY FIX TESTS COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runAll();
