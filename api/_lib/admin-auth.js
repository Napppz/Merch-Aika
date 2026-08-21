const { verifyJWT } = require('./jwt-manager');

function getAdminToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  if (req.body && typeof req.body.token === 'string') {
    return req.body.token.trim();
  }

  return null;
}

function verifyAdminToken(req) {
  const token = getAdminToken(req);
  if (!token) return null;
  const payload = verifyJWT(token);
  if (!payload || payload.type !== 'admin' || !payload.adminId) {
    return null;
  }
  return payload;
}

function requireAdmin(req, res) {
  const payload = verifyAdminToken(req);
  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Admin authentication required'
    });
    return null;
  }

  req.admin = payload;
  return payload;
}

module.exports = {
  getAdminToken,
  verifyAdminToken,
  requireAdmin
};

