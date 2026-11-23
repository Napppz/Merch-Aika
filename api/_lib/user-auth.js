const { verifyJWT } = require('./jwt-manager');

function getTokenFromReq(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  if (req.body && typeof req.body.token === 'string') {
    return req.body.token.trim();
  }

  return null;
}

function verifyUserAuth(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;
  const payload = verifyJWT(token);
  if (!payload) return null;

  if (payload.type === 'admin' && payload.adminId) {
    return payload;
  }
  if (payload.type === 'user' && payload.email) {
    return payload;
  }
  return null;
}

function requireUserOrAdmin(req, res, targetEmail = null, options = {}) {
  const auth = verifyUserAuth(req);
  if (!auth) {
    res.status(401).json({
      success: false,
      error: 'Autentikasi login diperlukan'
    });
    return null;
  }

  // Full admin memiliki hak akses penuh; nobar_admin dibatasi kecuali endpoint mengizinkan eksplisit
  if (auth.type === 'admin') {
    if (auth.role === 'nobar_admin' && !options.allowNobarAdmin) {
      res.status(403).json({
        success: false,
        error: 'Akses ditolak: Akun admin khusus Nobar tidak memiliki akses ke data akun toko'
      });
      return null;
    }
    req.admin = auth;
    req.userAuth = auth;
    return auth;
  }

  // User biasa hanya boleh mengakses datanya sendiri
  if (targetEmail) {
    const cleanTarget = String(targetEmail).trim().toLowerCase();
    const userEmail = String(auth.email).trim().toLowerCase();
    if (cleanTarget && userEmail !== cleanTarget) {
      res.status(403).json({
        success: false,
        error: 'Akses ditolak: Anda tidak memiliki izin untuk mengakses data akun ini'
      });
      return null;
    }
  }

  req.userAuth = auth;
  return auth;
}

module.exports = {
  getTokenFromReq,
  verifyUserAuth,
  requireUserOrAdmin
};
