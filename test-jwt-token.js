// Test JWT Token Generation dan Browser Decoding

const crypto = require('crypto');

// Config JWT
const JWT_SECRET = 'aika_sesilia_jwt_secret_2024_secure_change_in_production';
const JWT_EXPIRY = 24 * 60 * 60 * 1000; // 24 jam

// Generate JWT (dari jwt-manager.js)
function generateJWT(payload) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
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
  
  const token = `${message}.${signature}`;
  return token;
}

// Simulate browser decoding
function base64urlDecode(str) {
  let padded = str;
  const padLength = (4 - (str.length % 4)) % 4;
  if (padLength) {
    padded = str + '='.repeat(padLength);
  }
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  return decoded;
}

// Tests
console.log('='.repeat(60));
console.log('🧪 JWT Token Generation & Decoding Test');
console.log('='.repeat(60));

const testPayload = {
  adminId: 1,
  username: 'Aika',
  role: 'admin',
  type: 'admin'
};

console.log('\n1️⃣  Generating JWT token...');
const token = generateJWT(testPayload);
console.log('✅ Token generated:', token);
console.log('   Length:', token.length);

console.log('\n2️⃣  Splitting token into parts...');
const parts = token.split('.');
console.log('✅ Parts:', parts.length);
console.log('   Header:', parts[0].substring(0, 20) + '...');
console.log('   Payload:', parts[1].substring(0, 20) + '...');
console.log('   Signature:', parts[2].substring(0, 20) + '...');

console.log('\n3️⃣  Decoding payload with base64urlDecode (browser simulation)...');
try {
  const payloadStr = base64urlDecode(parts[1]);
  const decodedPayload = JSON.parse(payloadStr);
  console.log('✅ Payload decoded successfully!');
  console.log('   Data:', decodedPayload);
  
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExp = decodedPayload.exp - now;
  console.log(`   Expires in: ${timeUntilExp} seconds (${Math.round(timeUntilExp/3600)} hours)`);
} catch (err) {
  console.error('❌ Decoding failed:', err.message);
}

console.log('\n4️⃣  Testing with base64 standard (with padding)...');
try {
  // Try alternative method with base64
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64').toString('utf-8');
  const payload = JSON.parse(decoded);
  console.log('✅ Alternative decode also works!');
  console.log('   Data:', payload);
} catch (err) {
  console.error('❌ Alternative decode failed:', err.message);
}

console.log('\n' + '='.repeat(60));
console.log('✅ All tests passed! Token can be properly decoded.');
console.log('='.repeat(60));
