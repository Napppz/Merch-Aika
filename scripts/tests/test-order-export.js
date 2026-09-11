require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
require('dotenv').config();
const http = require('http');
const { generateJWT } = require('../../api/_lib/jwt-manager');

function request(options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data
        });
      });
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runTests() {
  console.log('--- TESTING ORDER EXPORT (ALL ORDERS CSV & DISABLE 1-1 CSV) ---');
  let passed = 0;
  let failed = 0;

  const adminToken = generateJWT({ adminId: 'admin-test', type: 'admin' });

  // 1. Unauthenticated request to /api/order-export
  try {
    const res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/order-export',
      method: 'GET'
    });
    if (res.status === 401) {
      console.log('✅ Test 1 Passed: Unauthenticated export blocked (401)');
      passed++;
    } else {
      console.error(`❌ Test 1 Failed: Expected 401, got ${res.status}`);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 1 Error:', err.message);
    failed++;
  }

  // 2. Export ALL orders as CSV with Admin Token
  try {
    const res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/order-export?all=true',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const isCsv = res.headers['content-type'] && res.headers['content-type'].includes('text/csv');
    const hasHeader = res.data.includes('Order ID') && res.data.includes('Nama Customer') && res.data.includes('Total Pesanan (Rp)');
    const hasBom = res.data.charCodeAt(0) === 0xFEFF;

    if (res.status === 200 && isCsv && hasHeader && hasBom) {
      console.log('✅ Test 2 Passed: Export ALL orders as CSV returned 200 OK with valid headers and UTF-8 BOM');
      console.log('   Preview CSV Header Row:', res.data.slice(1, 120).split('\n')[0]);
      passed++;
    } else {
      console.error(`❌ Test 2 Failed: status=${res.status}, isCsv=${isCsv}, hasHeader=${hasHeader}, hasBom=${hasBom}`);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 2 Error:', err.message);
    failed++;
  }

  // 3. Export filtered by status as CSV
  try {
    const res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/order-export?status=paid',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const isCsv = res.headers['content-type'] && res.headers['content-type'].includes('text/csv');
    const disposition = res.headers['content-disposition'] || '';

    if (res.status === 200 && isCsv && disposition.includes('pesanan-paid-aika-')) {
      console.log('✅ Test 3 Passed: Export filtered orders by status (paid) returned 200 with status-specific filename');
      passed++;
    } else {
      console.error(`❌ Test 3 Failed: status=${res.status}, disposition=${disposition}`);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 3 Error:', err.message);
    failed++;
  }

  // 4. Attempt 1-by-1 CSV export (should be rejected with 400)
  try {
    const res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/order-export?id=any-order-id&format=csv',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    let json = {};
    try { json = JSON.parse(res.data); } catch(e) {}

    if (res.status === 400 && json.error && json.error.includes('1 per 1')) {
      console.log('✅ Test 4 Passed: 1-by-1 CSV export correctly disabled (400 Bad Request):', json.error);
      passed++;
    } else {
      console.error(`❌ Test 4 Failed: status=${res.status}, body=${res.data}`);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 4 Error:', err.message);
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
