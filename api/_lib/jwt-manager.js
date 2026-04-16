// JWT Token Management untuk Admin
// Utilities untuk generate, verify, dan manage session tokens

const crypto = require('crypto');
const { getRequiredEnv } = require('./env');

// Config JWT (gunakan secret dari env untuk production)
const JWT_SECRET = getRequiredEnv('JWT_SECRET');
const JWT_EXPIRY = 24 * 60 * 60 * 1000; // 24 jam dalam milliseconds

// Simple JWT implementation (production: gunakan jsonwebtoken library)
function generateJWT(payload) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const now = Date.now();
  const claims = {
    ...payload,
    iat: Math.floor(now / 1000),  // Issued at
    exp: Math.floor((now + JWT_EXPIRY) / 1000)  // Expires in 24 hours
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
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const message = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(message)
      .digest('base64url');
    
    if (signature !== expectedSignature) {
      console.log('❌ JWT Signature invalid');
      return null;
    }
    
    // Decode payload
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
    
    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      console.log('❌ JWT Expired');
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
  JWT_EXPIRY
};
