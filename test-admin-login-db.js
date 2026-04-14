// test-admin-login-db.js — Test new database-backed admin login
const adminHandler = require('./api/_lib/admin-login.js');

// Mock request
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
    password: 'Aikanap2213'
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
    console.log('\n✅ LOGIN TEST RESULT:\n');
    console.log('Status:', this.statusCode);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.admin?.token) {
      console.log('\n🎉 Success! JWT Token generated:', data.admin.token.substring(0, 50) + '...');
    }
  },
  end() {}
};

// Run test
console.log('🧪 Testing database-backed admin login...');
console.log('Username: Aika');
console.log('Password: Aikanap2213\n');

adminHandler(mockReq, mockRes)
  .then(() => {
    console.log('\n✅ Handler executed successfully');
  })
  .catch(err => {
    console.error('\n❌ Error:', err.message);
  });
