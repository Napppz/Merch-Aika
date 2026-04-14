// api/_lib/admin-auth.js — Admin Token Validation Middleware
// SECURE: Server-side token validation untuk melindungi admin endpoints

const crypto = require('crypto');

// In-memory token store (use Redis in production for scalability)
// Format: { token: { username, created_at, ip, user_agent } }
const adminTokens = {};
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createAdminToken(username, clientIp, userAgent) {
  const token = generateToken();
  adminTokens[token] = {
    username,
    created_at: Date.now(),
    ip: clientIp,
    user_agent: userAgent,
    expires_at: Date.now() + TOKEN_EXPIRY
  };
  return token;
}

function validateAdminToken(token, clientIp) {
  if (!token || !adminTokens[token]) {
    return { valid: false, message: 'Token tidak ditemukan' };
  }

  const tokenData = adminTokens[token];

  // Check expiry
  if (Date.now() > tokenData.expires_at) {
    delete adminTokens[token];
    return { valid: false, message: 'Token sudah expired' };
  }

  // Check IP (prevent token theft)
  if (tokenData.ip !== clientIp) {
    delete adminTokens[token];
    return { valid: false, message: 'IP mismatch - possible token hijacking' };
  }

  return { valid: true, username: tokenData.username };
}

function revokeAdminToken(token) {
  if (adminTokens[token]) {
    delete adminTokens[token];
    return true;
  }
  return false;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['cf-connecting-ip'] ||
         req.socket?.remoteAddress || 
         'unknown';
}

function verifyAdminRequest(req, res) {
  const token = req.headers['x-admin-token'] || 
                req.body?.admin_token ||
                req.query?.admin_token;

  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  const validation = validateAdminToken(token, clientIp);

  if (!validation.valid) {
    res.setHeader('Content-Type', 'application/json');
    res.status(401).json({
      success: false,
      message: 'Admin authentication failed: ' + validation.message,
      error: 'UNAUTHORIZED'
    });
    return null;
  }

  return { username: validation.username, token, clientIp, userAgent };
}

module.exports = {
  generateToken,
  createAdminToken,
  validateAdminToken,
  revokeAdminToken,
  verifyAdminRequest,
  getClientIp,
  getTokenStore: () => adminTokens // For debugging only
};
