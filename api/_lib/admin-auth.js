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

function requireAdmin(req, res) {
  const token = getAdminToken(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Admin authentication required'
    });
    return null;
  }

  const payload = verifyJWT(token);
  if (!payload || payload.type !== 'admin' || !payload.adminId) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired admin session'
    });
    return null;
  }

  req.admin = payload;
  return payload;
}

module.exports = {
  getAdminToken,
  requireAdmin
};
