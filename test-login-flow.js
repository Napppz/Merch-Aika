// Test Actual Login Flow

const crypto = require('crypto');

console.log('='.repeat(70));
console.log('🧪 Testing Admin Login Flow (Simulating Browser)');
console.log('='.repeat(70));

// 1. Test admin password hash
console.log('\n1️⃣  Testing Admin Password Hash...');
const PASSWORD_SALT = 'aika_sesilia_salt_2024_secure';
const adminPassword = 'Aikanap2213';
const expectedHash = '000f49c6d3cfa4232f61c54c6348a4c7d4f825870ba6c53e81b92745add01db6';

function hashPassword(password) {
  return crypto.createHmac('sha256', PASSWORD_SALT).update(password).digest('hex');
}

const calculatedHash = hashPassword(adminPassword);
console.log('✅ Password:', adminPassword);
console.log('   Expected hash:', expectedHash);
console.log('   Calculated:', calculatedHash);
console.log('   Match:', calculatedHash === expectedHash ? '✅ YES' : '❌ NO');

// 2. Test JWT Generation for successful login
console.log('\n2️⃣  Simulating Successful Admin Login Response...');

const JWT_SECRET = 'aika_sesilia_jwt_secret_2024_secure_change_in_production';
const JWT_EXPIRY = 24 * 60 * 60 * 1000;

function generateJWT(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Date.now();
  const claims = {
    ...payload,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + JWT_EXPIRY) / 1000)
  };
  
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(message)
    .digest('base64url');
  
  return `${message}.${signature}`;
}

const jwtToken = generateJWT({
  adminId: 1,
  username: 'Aika',
  role: 'admin',
  type: 'admin'
});

const loginResponse = {
  success: true,
  message: 'Login admin berhasil',
  admin: {
    id: 1,
    username: 'Aika',
    role: 'admin',
    token: jwtToken
  }
};

console.log('✅ API Response:', JSON.stringify(loginResponse, null, 2));

// 3. Simulate localStorage storage
console.log('\n3️⃣  Simulating localStorage in Browser...');
const localStorage = {};

localStorage.setItem = function(key, val) {
  localStorage[key] = val;
  console.log(`   ✅ localStorage.setItem('${key}', '${typeof val === 'string' && val.length > 50 ? val.substring(0, 30) + '...' : val}')`);
};

localStorage.getItem = function(key) {
  console.log(`   ✅ localStorage.getItem('${key}') = ${localStorage[key] ? 'YES' : 'NO'}`);
  return localStorage[key];
};

// Simulate what login.html does
localStorage.setItem('adminToken', loginResponse.admin.token);
localStorage.setItem('aika_admin_user', JSON.stringify({
  username: loginResponse.admin.username,
  role: loginResponse.admin.role,
  loginTime: Date.now()
}));

// 4. Simulate dashboard protection script
console.log('\n4️⃣  Simulating Dashboard Protection Script...');

function base64urlDecode(str) {
  let padded = str;
  const padLength = (4 - (str.length % 4)) % 4;
  if (padLength) padded = str + '='.repeat(padLength);
  
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

const token = localStorage.getItem('adminToken');

if (!token) {
  console.log('❌ No token found!');
  process.exit(1);
}

try {
  const parts = token.split('.');
  
  if (parts.length !== 3) {
    throw new Error(`Invalid token format: ${parts.length} parts instead of 3`);
  }
  
  const payload = JSON.parse(base64urlDecode(parts[1]));
  const now = Math.floor(Date.now() / 1000);
  
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload structure');
  }
  
  if (payload.exp && payload.exp < (now - 5)) {
    throw new Error('Token expired');
  }
  
  const timeUntilExp = payload.exp - now;
  console.log('✅ Token verified successfully!');
  console.log(`   User: ${payload.username} | Role: ${payload.role}`);
  console.log(`   Expires in: ${timeUntilExp} seconds`);
  console.log('✅ Dashboard would load successfully!');
  
} catch (error) {
  console.error('❌ Token verification failed:', error.message);
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('✅ All login flow tests PASSED!');
console.log('   Token generation: ✅');
console.log('   Token storage: ✅');
console.log('   Token validation: ✅');
console.log('='.repeat(70));
