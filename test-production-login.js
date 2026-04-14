// Test Admin Login - Production Vercel API
const https = require('https');
const crypto = require('crypto');

const USERNAME = 'Aika';
const PASSWORD = 'Aikanap2213';

// Hash password dengan salt yang sama
function hashPassword(password) {
  const salt = 'aika_sesilia_salt_2024_secure';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

console.log('\n' + '='.repeat(70));
console.log('🔍 TESTING ADMIN LOGIN - PRODUCTION (VERCEL)');
console.log('='.repeat(70) + '\n');

console.log('Credentials:');
console.log('  Username: ' + USERNAME);
console.log('  Password: ' + PASSWORD);
console.log('  Password Hash: ' + hashPassword(PASSWORD));
console.log('\n' + '='.repeat(70) + '\n');

// Prepare request
const payload = JSON.stringify({
  username: USERNAME,
  password: PASSWORD
});

const options = {
  hostname: 'merch-aika.vercel.app',
  path: '/api/admin-login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-Requested-With': 'XMLHttpRequest'
  }
};

console.log('📡 Making request to:', 'https://' + options.hostname + options.path);
console.log('\n');

const req = https.request(options, (res) => {
  let data = '';
  
  console.log('✅ Connected! Status:', res.statusCode, res.statusMessage);
  console.log('\n');
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('--- RESPONSE BODY ---\n');
    try {
      const jsonData = JSON.parse(data);
      console.log(JSON.stringify(jsonData, null, 2));
      
      console.log('\n' + '='.repeat(70) + '\n');
      
      if (res.statusCode === 200 && jsonData.success) {
        console.log('🎉 ✅ LOGIN BERHASIL!\n');
        console.log('Admin ID:', jsonData.admin.id);
        console.log('Username:', jsonData.admin.username);
        console.log('Role:', jsonData.admin.role);
        console.log('Token Length:', jsonData.admin.token.length);
        console.log('Token Preview:', jsonData.admin.token.substring(0, 30) + '...\n');
        console.log('SESSION DATA STORED:');
        console.log('  localStorage.aika_admin_logged = "true"');
        console.log('  localStorage.aika_admin_user = ' + JSON.stringify({
          id: jsonData.admin.id,
          username: jsonData.admin.username,
          role: jsonData.admin.role,
          loginTime: Date.now()
        }) + '\n');
        console.log('✓ Should redirect to /admin/dashboard.html');
      } else if (res.statusCode === 401) {
        console.log('❌ LOGIN FAILED - Invalid Credentials\n');
        console.log('Error:', jsonData.message);
        console.log('\nPossible causes:');
        console.log('  1. Username Aika tidak ada di database');
        console.log('  2. Password Aikanap2213 salah/tidak match');
        console.log('  3. Admin status tidak "active"');
      } else if (res.statusCode === 429) {
        console.log('⚠️  TOO MANY LOGIN ATTEMPTS\n');
        console.log('Error:', jsonData.message);
        console.log('Action: Tunggu 15 menit sebelum mencoba lagi');
      } else {
        console.log('❌ SERVER ERROR\n');
        console.log('Status:', res.statusCode);
        console.log('Error:', jsonData.message || 'Unknown error');
      }
    } catch (e) {
      console.log('❌ Failed to parse JSON');
      console.log('Error:', e.message);
      console.log('Raw response:', data.substring(0, 200));
    }
    
    console.log('\n' + '='.repeat(70) + '\n');
  });
});

req.on('error', (error) => {
  console.error('❌ REQUEST ERROR:', error.message);
  console.error('\nPossible causes:');
  console.error('  1. Network error / No internet');
  console.error('  2. Vercel API is down');
  console.error('  3. CORS issue');
  console.error('  4. Domain not accessible');
});

req.on('timeout', () => {
  console.error('❌ REQUEST TIMEOUT - API tidak merespons');
  req.destroy();
});

req.setTimeout(5000); // 5 second timeout

console.log('Sending POST request...\n');
req.write(payload);
req.end();
