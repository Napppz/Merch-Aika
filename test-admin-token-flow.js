// Simulate complete admin login flow with token validation
// Test: token generated > stored > loaded > validated

const crypto = require('crypto');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. GENERATE TOKEN (simulating API response)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const JWT_SECRET = 'aika_sesilia_jwt_secret_2024_secure_change_in_production';
const JWT_EXPIRY = 24 * 60 * 60 * 1000; // 24 jam

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

console.log('\n📨 STEP 1: API Returns Token');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const apiResponse = {
  success: true,
  admin: {
    id: 1,
    username: 'Aika',
    role: 'admin',
    token: generateJWT({
      adminId: 1,
      username: 'Aika',
      role: 'admin',
      type: 'admin'
    })
  }
};

console.log('✅ API Response:');
console.log('  - success:', apiResponse.success);
console.log('  - admin.id:', apiResponse.admin.id);
console.log('  - admin.username:', apiResponse.admin.username);
console.log('  - admin.role:', apiResponse.admin.role);
console.log('  - admin.token length:', apiResponse.admin.token.length);
console.log('  - admin.token:', apiResponse.admin.token.substring(0, 50) + '...');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. SIMULATE BROWSER STORING IN LOCALSTORAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('\n💾 STEP 2: Login.html Stores Token in localStorage');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const simulatedLocalStorage = {};

// Simulate: localStorage.setItem('adminToken', token)
simulatedLocalStorage['adminToken'] = apiResponse.admin.token;
simulatedLocalStorage['aika_admin_user'] = JSON.stringify({
  username: apiResponse.admin.username,
  role: apiResponse.admin.role,
  loginTime: Date.now()
});

console.log('✅ Stored in localStorage:');
console.log('  - adminToken:', simulatedLocalStorage['adminToken'].substring(0, 50) + '...');
console.log('  - adminToken length:', simulatedLocalStorage['adminToken'].length);
console.log('  - aika_admin_user:', simulatedLocalStorage['aika_admin_user']);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. SIMULATE DASHBOARD PROTECTION SCRIPT VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('\n🔐 STEP 3: Dashboard Protection Script Validates Token');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const token = simulatedLocalStorage['adminToken'];

console.log('📋 Token from localStorage:');
console.log('  - Exists:', token ? '✅ YES' : '❌ NO');
console.log('  - Length:', token ? token.length : '?');

// Check token format
const parts = token.split('.');
console.log('\n✔️ Token Format Check:');
console.log('  - Parts count:', parts.length, parts.length === 3 ? '✅ CORRECT' : '❌ WRONG');

if (parts.length === 3) {
  const [headerB64, payloadB64, signatureB64] = parts;
  
  // Decode payload
  console.log('\n📖 Decode Payload:');
  try {
    let padded = payloadB64;
    const padLength = (4 - (payloadB64.length % 4)) % 4;
    if (padLength) padded = payloadB64 + '='.repeat(padLength);
    
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded);
    
    console.log('  ✅ Decoded successfully');
    console.log('  - adminId:', payload.adminId, payload.adminId ? '✅' : '❌');
    console.log('  - username:', payload.username, payload.username ? '✅' : '❌');
    console.log('  - role:', payload.role, payload.role ? '✅' : '❌');
    console.log('  - type:', payload.type, payload.type ? '✅' : '❌');
    console.log('  - iat:', payload.iat);
    console.log('  - exp:', payload.exp);
    
    // Check expiry
    console.log('\n⏰ Expiry Check:');
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp - now;
    console.log('  - Current time:', now);
    console.log('  - Token exp:', payload.exp);
    console.log('  - Expires in:', expiresIn, 'seconds (~' + Math.round(expiresIn/3600) + ' hours)');
    
    if (payload.exp < now) {
      console.log('  ❌ TOKEN EXPIRED');
    } else {
      console.log('  ✅ TOKEN VALID');
    }
    
    // Validate required fields
    console.log('\n✅ Field Validation:');
    console.log('  - adminId exists:', payload.adminId ? '✅' : '❌');
    console.log('  - username exists:', payload.username ? '✅' : '❌');
    console.log('  - role exists:', payload.role ? '✅' : '❌');
    console.log('  - payload is object:', typeof payload === 'object' ? '✅' : '❌');
    
    // Final verdict
    console.log('\n🎯 FINAL VALIDATION:');
    if (
      payload && 
      typeof payload === 'object' &&
      payload.adminId && 
      payload.username &&
      !isNaN(payload.exp) &&
      payload.exp >= now
    ) {
      console.log('  ✅✅✅ TOKEN VALID - Dashboard should LOAD ✅✅✅');
    } else {
      console.log('  ❌ TOKEN INVALID - Dashboard will REDIRECT');
      if (!payload.adminId) console.log('    Reason: Missing adminId');
      if (!payload.username) console.log('    Reason: Missing username');
      if (payload.exp < now) console.log('    Reason: Token expired');
    }
    
  } catch (err) {
    console.log('  ❌ Failed to decode payload');
    console.log('  Error:', err.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. SUMMARY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('\n' + '━'.repeat(60));
console.log('📊 COMPLETE FLOW TEST');
console.log('━'.repeat(60));
console.log('✅ Token generated from API');
console.log('✅ Token stored in localStorage');
console.log('✅ Token retrieved from localStorage');
console.log('✅ Token format validated');
console.log('✅ Token payload decoded');
console.log('✅ Token fields validated');
console.log('✅ Token expiry validated');
console.log('\n🎉 IF ALL ABOVE CHECKS PASSED → Dashboard SHOULD LOAD!');
console.log('\nIF Dashboard still redirects on production:');
console.log('  1. Check browser console during login (F12)');
console.log('  2. Visit /admin/debug.html to see detailed error');
console.log('  3. Report error message to developer');
console.log('━'.repeat(60) + '\n');
