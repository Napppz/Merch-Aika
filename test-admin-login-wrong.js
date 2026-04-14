// test-admin-login-wrong-password.js — Test with wrong password
const adminHandler = require('./api/_lib/admin-login.js');

// Mock request with WRONG password
const mockReq = {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'origin': 'http://localhost:3000'
  },
  socket: {
    remoteAddress: '127.0.0.1'
  },
  body: {
    username: 'Aika',
    password: 'wrongPassword123' // ❌ WRONG PASSWORD
  }
};

// Mock response
const mockRes = {
  statusCode: 200,
  headers: {},
  setHeader(key, val) {
    this.headers[key] = val;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    console.log('\n❌ LOGIN TEST RESULT (WRONG PASSWORD):\n');
    console.log('Status:', this.statusCode);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (!data.success) {
      console.log('\n✅ Correctly rejected! Invalid password detected.');
    }
  },
  end() {}
};

// Run test
console.log('🧪 Testing admin login with WRONG password...');
console.log('Username: Aika');
console.log('Password: wrongPassword123\n');

adminHandler(mockReq, mockRes)
  .then(() => {
    console.log('\n✅ Handler executed successfully');
  })
  .catch(err => {
    console.error('\n❌ Error:', err.message);
  });
