const db = require('../api/_lib/_db');

async function main() {
  console.log('--- 1. Testing Stock Deduction ---');
  const pRes = await db.query("SELECT id, name, stock FROM products WHERE stock >= 5 LIMIT 1;");
  if (!pRes.rows.length) {
    console.log('No product with stock >= 5');
    process.exit(0);
  }
  const prod = pRes.rows[0];
  const initialStock = prod.stock;
  console.log(`Product: ${prod.name}, Initial Stock: ${initialStock}`);

  const testOrderId = 'TEST-STOCK-' + Date.now();
  const orderRes = await fetch('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testOrderId,
      customerName: 'Test Stock User',
      email: 'stock@test.com',
      address: 'Jl. Test 123',
      status: 'pending',
      total: 100000,
      items: [{ id: prod.id, name: prod.name, qty: 1, price: 100000 }],
      shipping: { price: 10000 }
    })
  });

  if (!orderRes.ok) {
    const errText = await orderRes.text();
    console.error('Order creation failed:', errText);
    process.exit(1);
  }

  const afterRes = await db.query('SELECT stock FROM products WHERE id = $1;', [prod.id]);
  const newStock = afterRes.rows[0].stock;
  console.log(`New Stock after order: ${newStock}`);

  if (newStock === initialStock - 1) {
    console.log('✓ SUCCESS: Stock deducted by 1!');
  } else {
    console.error(`✗ FAILED: Expected ${initialStock - 1}, got ${newStock}`);
    process.exit(1);
  }

  // Restore and cleanup
  await db.query('UPDATE products SET stock = $1 WHERE id = $2;', [initialStock, prod.id]);
  await db.query('DELETE FROM orders WHERE id = $1;', [testOrderId]);
  console.log('✓ Restored product stock and cleaned test order.');

  console.log('🎉 ALL TESTS PASSED!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
