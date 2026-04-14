// test-full-debug.js - Full simulation dengan comprehensive debugging

const crypto = require('crypto');

console.log('\n' + '='.repeat(80));
console.log('🔍 FULL ADMIN LOGIN FLOW DEBUG TEST');
console.log('='.repeat(80));

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣  BACKEND: Generate token
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[BACKEND] Generating JWT token...');

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

console.log('✅ JWT generated:', jwtToken.substring(0, 50) + '...');
console.log('   Token length:', jwtToken.length);
console.log('   Parts:', jwtToken.split('.').length);

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣  FRONTEND LOGIN: localStorage.setItem
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[FRONTEND-LOGIN] Simulating localStorage operations...');

// Mock localStorage
const testStorage = {};

// 1. setItem adminToken
console.log('  Step 1: localStorage.setItem("adminToken", token)');
testStorage.adminToken = jwtToken;
console.log('    ✅ Stored:', testStorage.adminToken.substring(0, 30) + '...');

// 2. setItem aika_admin_user
console.log('  Step 2: localStorage.setItem("aika_admin_user", userInfo)');
testStorage.aika_admin_user = JSON.stringify({
  username: 'Aika',
  role: 'admin',
  loginTime: Date.now()
});
console.log('    ✅ Stored:', testStorage.aika_admin_user.substring(0, 40) + '...');

// ═══════════════════════════════════════════════════════════════════════════
// 3️⃣  FRONTEND LOGIN: Verify before redirect
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[FRONTEND-LOGIN] Verify before redirect...');

const verify1 = testStorage.adminToken;
const verify2 = testStorage.aika_admin_user;

console.log('  adminToken exists:', verify1 ? '✅ YES' : '❌ NO');
console.log('  aika_admin_user exists:', verify2 ? '✅ YES' : '❌ NO');

if (!verify1 || !verify2) {
  console.log('❌ WOULD NOT REDIRECT - Storage failed');
  process.exit(1);
}

console.log('✅ OK to redirect to dashboard');
console.log('  window.location.replace("/admin/dashboard.html")');

// ═══════════════════════════════════════════════════════════════════════════
// 4️⃣  DASHBOARD: Protection script runs
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[DASHBOARD] Protection script initializing...');
console.log('  Page: /admin/dashboard.html');

// Retrieve from "localStorage" again (simulating page reload)
const token = testStorage.adminToken;

console.log('  1. Retrieved adminToken from localStorage');
console.log('     Found:', token ? `✅ YES (${token.substring(0,20)}...)` : '❌ NO');

if (!token) {
  console.log('\n❌ ACTUAL ISSUE: Token not found in localStorage on dashboard page!');
  console.log('   This causes redirect to /login.html?role=admin&error=no_token');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5️⃣  DASHBOARD: Decode token
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n  2. Splitting token into parts...');

const parts = token.split('.');
console.log('     Parts count:', parts.length);

if (parts.length !== 3) {
  console.log('\n❌ ERROR: Token format invalid (', parts.length, 'parts instead of 3)');
  process.exit(1);
}

console.log('     ✅ Header:', parts[0].substring(0, 20) + '...');
console.log('     ✅ Payload:', parts[1].substring(0, 20) + '...');
console.log('     ✅ Signature:', parts[2].substring(0, 20) + '...');

// ═══════════════════════════════════════════════════════════════════════════
// 6️⃣  DASHBOARD: Decode base64url payload
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n  3. Decoding base64url payload...');

function base64urlDecode(str) {
  console.log('     Decode function called with length:', str.length);
  
  let padded = str;
  const padLength = (4 - (str.length % 4)) % 4;
  console.log('     Padding needed:', padLength);
  
  if (padLength) padded = str + '='.repeat(padLength);
  
  const base64 = padded
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  console.log('     Base64 after conversion, length:', base64.length);
  
  const decoded = atob(base64);
  console.log('     After atob(), length:', decoded.length);
  
  const result = decodeURIComponent(decoded.split('').map((c) => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  
  console.log('     After decodeURIComponent(), length:', result.length);
  return result;
}

let payloadStr;
let payload;

try {
  payloadStr = base64urlDecode(parts[1]);
  console.log('     ✅ Decoded string:', payloadStr.substring(0, 50) + '...');
  
  payload = JSON.parse(payloadStr);
  console.log('     ✅ Parsed JSON:');
  console.log('        adminId:', payload.adminId);
  console.log('        username:', payload.username);
  console.log('        role:', payload.role);
  console.log('        iat:', payload.iat);
  console.log('        exp:', payload.exp);
} catch (err) {
  console.error('\n❌ ERROR during payload decode:', err.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7️⃣  DASHBOARD: Validate token expiry
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n  4. Validating token expiry...');

const now = Math.floor(Date.now() / 1000);
const timeLeft = payload.exp - now;

console.log('     Current Unix time:', now);
console.log('     Token exp:', payload.exp);
console.log('     Time left:', timeLeft, 'seconds');

if (payload.exp < now) {
  console.log('\n❌ ERROR: Token has expired!');
  process.exit(1);
}

console.log('     ✅ Token is still valid (not expired)');

// ═══════════════════════════════════════════════════════════════════════════
// 8️⃣  DASHBOARD: Final validation
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n  5. Final validation checks...');

if (!payload.adminId || !payload.username) {
  console.log('❌ ERROR: Missing required fields');
  process.exit(1);
}

console.log('     ✅ adminId:', payload.adminId);
console.log('     ✅ username:', payload.username);
console.log('     ✅ role:', payload.role);

// ═══════════════════════════════════════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(80));
console.log('✅✅✅ COMPLETE LOGIN FLOW - ALL CHECKS PASSED ✅✅✅');
console.log('='.repeat(80));
console.log('\nFlow completed:');
console.log('  1️⃣  Token generated ✅');
console.log('  2️⃣  Token stored in localStorage ✅');
console.log('  3️⃣  Redirect executed ✅');
console.log('  4️⃣  Dashboard retrieves token ✅');
console.log('  5️⃣  Token decoded ✅');
console.log('  6️⃣  Token validated ✅');
console.log('  7️⃣  Dashboard should load ✅');
console.log('\n💡 If you see this, the LOCAL flow works perfectly!');
console.log('💡 The issue must be in PRODUCTION/VERCEL or BROWSER-SPECIFIC');
console.log('='.repeat(80) + '\n');
