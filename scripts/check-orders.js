require('dotenv').config({ path: '.env.local' });
const { query } = require('../api/_lib/_db');

async function checkRecentOrders() {
  const res = await query('SELECT id, "customerName", email, status, items, date FROM orders ORDER BY date DESC LIMIT 5');
  console.log(JSON.stringify(res.rows, null, 2));
}

checkRecentOrders().catch(console.error);
