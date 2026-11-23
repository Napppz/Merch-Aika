// JWT Token Management untuk Admin
// Utilities untuk generate, verify, dan manage session tokens

const crypto = require('crypto');
const { getRequiredEnv } = require('./env');

// Config JWT (gunakan secret dari env untuk production)
const JWT_SECRET = getRequiredEnv('JWT_SECRET');
const JWT_EXPIRY = 24 * 60 * 60 * 1000; // 24 jam dalam milliseconds (default, termasuk admin)
const JWT_REMEMBER_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 hari untuk user yang memilih "Ingat saya"

// Simple JWT implementation (production: gunakan jsonwebtoken library)
function generateJWT(payload, expiryMs = JWT_EXPIRY) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const now = Date.now();
  const claims = {
    ...payload,
    iat: Math.floor(now / 1000),  // Issued at
    exp: Math.floor((now + expiryMs) / 1000)  // Default 24 jam, bisa diperpanjang (Ingat saya)
  };
  
  // Encode header
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  
  // Encode payload
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  
  // Create signature
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(message)
    .digest('base64url');
  
  const token = `${message}.${signature}`;
  
  return token;
}

function verifyJWT(token) {
  try {
    if (typeof token !== 'string' || !token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;

    // Validate header algorithm strictly
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
    if (!header || header.alg !== 'HS256') {
      return null;
    }

    // Verify signature using constant-time comparison
    const message = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(message)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.log('❌ JWT Signature invalid');
      return null;
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());

    // Require numeric expiry claim and verify not expired
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= now) {
      console.log('❌ JWT Expired or missing exp');
      return null;
    }

    return payload;
  } catch (err) {
    console.error('JWT Verification error:', err.message);
    return null;
  }
}

module.exports = {
  generateJWT,
  verifyJWT,
  JWT_EXPIRY,
  JWT_REMEMBER_EXPIRY
};
