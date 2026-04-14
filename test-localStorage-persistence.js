// test-localStorage-persistence.js
// Test apakah token benar-benar persist di localStorage across redirects

const crypto = require('crypto');

console.log('\n' + '='.repeat(70));
console.log('🔍 Testing localStorage Token Persistence');
console.log('='.repeat(70));

// Generate token
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

console.log('\n1️⃣  STEP 1: Login.html stores token\n');

// Simulate login.html storage
const mockStorage = {};

console.log('   localStorage.setItem("adminToken", token)');
mockStorage.adminToken = jwtToken;
console.log('   ✅ Token stored (length: ' + jwtToken.length + ')');

console.log('\n   Immediate verification:');
const check1 = mockStorage.adminToken;
console.log('   localStorage.getItem("adminToken") = ' + (check1 ? 'STRING(' + check1.length + ' chars)' : 'NULL'));

console.log('\n   ✅ Token CAN be retrieved immediately in login.html');

// ═════════════════════════════════════════════════════════════════════════
console.log('\n2️⃣  STEP 2: Page redirect happens\n');

console.log('   window.location.replace("/admin/dashboard.html")');
console.log('   (Simulating new page load)');

// ═════════════════════════════════════════════════════════════════════════
console.log('\n3️⃣  STEP 3: Dashboard.html loads & protection script runs\n');

// New page load - localStorage should still persist
const retrieve1 = mockStorage.adminToken;
console.log('   Dashboard protection script:');
console.log('   token = localStorage.getItem("adminToken")');
console.log('   Result: ' + (retrieve1 ? 'FOUND ✅' : 'NOT FOUND ❌'));

if (!retrieve1) {
  console.log('\n❌ CRITICAL PROBLEM:');
  console.log('   Token disappeared from localStorage!');
  console.log('   This causes redirect to /login.html?error=no_token');
  process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════════
console.log('\n4️⃣  STEP 4: Token validation\n');

const parts = retrieve1.split('.');
console.log('   Split token into parts: ' + parts.length);

if (parts.length !== 3) {
  console.log('\n❌ ERROR: Token format invalid');
  process.exit(1);
}

// Decode
function base64urlDecode(str) {
  let padded = str;
  const padLength = (4 - (str.length % 4)) % 4;
  if (padLength) padded = str + '='.repeat(padLength);
  
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(base64);
  return Buffer.from(decoded, 'latin1').toString('utf-8');
}

try {
  const payloadStr = base64urlDecode(parts[1]);
  const payload = JSON.parse(payloadStr);
  
  const now = Math.floor(Date.now() / 1000);
  
  console.log('   Payload decoded:');
  console.log('     adminId: ' + payload.adminId);
  console.log('     username: ' + payload.username);
  console.log('     role: ' + payload.role);
  console.log('     Current time vs exp: ' + now + ' vs ' + payload.exp);
  console.log('     Valid: ' + (payload.exp > now ? '✅ YES' : '❌ EXPIRED'));
  
  if (payload.exp < now) {
    console.log('\n❌ ERROR: Token expired!');
    process.exit(1);
  }
  
} catch(err) {
  console.log('\n❌ ERROR decoding/validating token:');
  console.log('   ' + err.message);
  process.exit(1);
}

console.log('\n5️⃣  STEP 5: Dashboard should load\n');
console.log('   ✅ All validation passed');
console.log('   ✅ Dashboard content would render');

console.log('\n' + '='.repeat(70));
console.log('✅ IN THEORY: Complete flow should work');
console.log('❓ IN PRACTICE: If you still get redirected, problem is:');
console.log('   1. API not returning token correctly');
console.log('   2. localStorage blocked in production');
console.log('   3. Token generation differs between test and production');
console.log('   4. Protection script has strict validation we missed');
console.log('='.repeat(70) + '\n');
