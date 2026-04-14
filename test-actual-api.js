// test-actual-api.js
// Test actual API endpoint

const http = require('http');

console.log('\n' + '='.repeat(70));
console.log('🧪 Testing Actual Admin Login API');
console.log('='.repeat(70));

// Simulate POST request ke /api/admin-login
const postData = JSON.stringify({
  username: 'Aika',
  password: 'Aikanap2213'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin-login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'X-Requested-With': 'XMLHttpRequest'
  }
};

console.log('\n📤 Sending request to:', options.hostname + ':' + options.port + options.path);
console.log('   Method:', options.method);
console.log('   Body:', postData);

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n📥 API Response:');
    console.log('   Status:', res.statusCode);
    console.log('   Headers:', JSON.stringify(res.headers, null, 2));
    
    try {
      const jsonData = JSON.parse(data);
      console.log('   Body:', JSON.stringify(jsonData, null, 2));
      
      if (jsonData.success && jsonData.admin && jsonData.admin.token) {
        console.log('\n✅ TOKEN RECEIVED:');
        console.log('   Length:', jsonData.admin.token.length);
        console.log('   First 40 chars:', jsonData.admin.token.substring(0, 40));
        console.log('   Parts count:', jsonData.admin.token.split('.').length);
      } else {
        console.log('\n❌ No token in response!');
      }
    } catch(err) {
      console.log('   Raw:', data);
      console.log('\n❌ Failed to parse JSON:', err.message);
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ Request failed:', error.message);
  console.error('\n💡 Is the server running on localhost:3000?');
});

req.write(postData);
req.end();

setTimeout(() => {
  console.log('\n⏱️  Test completed');
}, 3000);
