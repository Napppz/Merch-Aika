// Test Local Login API
// Jalankan: node test-login-api.js

const http = require('http');
const crypto = require('crypto');

// Import handler
const handler = require('./api/_lib/admin-login.js');

// Test data
const testUsername = 'Aika';
const testPassword = 'Aikanap2213';

// Create mock request
const mockReq = {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-forwarded-for': '127.0.0.1'
  },
  body: {
    username: testUsername,
    password: testPassword,
    csrf_token: null
  },
  socket: {
    remoteAddress: '127.0.0.1'
  }
};

// Create mock response
let responseData = {};
const mockRes = {
  status: function(code) {
    responseData.status = code;
    return this;
  },
  json: function(data) {
    responseData.body = data;
    return this;
  },
  setHeader: function(key, value) {
    if (!responseData.headers) responseData.headers = {};
    responseData.headers[key] = value;
    return this;
  },
  end: function() {
    return this;
  }
};

console.log('\n=== TESTING ADMIN LOGIN LOCALLY ===\n');
console.log('📝 Input Data:');
console.log(`   Username: "${testUsername}"`);
console.log(`   Password: "${testPassword}"`);

// Set env vars for testing
process.env.PASSWORD_SALT = 'aika_sesilia_salt_2024_secure';
process.env.ADMIN_PASSWORD_HASH = '000f49c6d3cfa4232f61c54c6348a4c7d4f825870ba6c53e81b92745add01db6';
process.env.DEBUG_ADMIN_LOGIN = 'true';

console.log('\n🔐 Environment:');
console.log(`   PASSWORD_SALT: ${process.env.PASSWORD_SALT}`);
console.log(`   ADMIN_PASSWORD_HASH: ${process.env.ADMIN_PASSWORD_HASH}`);

// Calculate what hash should be
function hashPassword(password) {
  const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

const inputHash = hashPassword(testPassword);
console.log(`\n📊 Hash Calculation:`);
console.log(`   Input password hash: ${inputHash}`);
console.log(`   Expected hash:       ${process.env.ADMIN_PASSWORD_HASH}`);
console.log(`   Match: ${inputHash === process.env.ADMIN_PASSWORD_HASH ? '✅ YES' : '❌ NO'}`);

// Call handler
console.log('\n🚀 Running handler...\n');

handler(mockReq, mockRes).then(() => {
  console.log('\n=== RESPONSE ===');
  console.log(`Status: ${responseData.status}`);
  console.log(`Body:`, JSON.stringify(responseData.body, null, 2));
  
  if (responseData.status === 200) {
    console.log('\n✅ LOGIN BERHASIL!');
    console.log('Masalahnya ada di environment Vercel.');
  } else {
    console.log('\n❌ LOGIN GAGAL');
    console.log('Ada masalah di logic login atau hash tidak cocok.');
  }
}).catch(err => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
});
