const { securityCheck } = require('./_lib/security-middleware');

const INTERNAL_HELPER_MODULES = new Set([
  '_db',
  'admin-auth',
  'cache',
  'env',
  'jwt-manager',
  'multipart',
  'nobar-qr',
  'order-lifecycle',
  'r2-storage',
  'security-middleware',
  'shipping-rates',
  'user-auth'
]);

module.exports = async function handler(req, res) {
  // Security checks for all endpoints
  // - Payload limit: 15MB max
  // - Request timeout: 30 seconds max
  const isSafe = securityCheck(req, res, {
    maxPayloadMB: 15,
    timeoutSeconds: 30
  });
  
  if (!isSafe) {
    return; // Response already sent by security check
  }

  // Extract route from URL path or query parameter
  // In Vercel, the dynamic segment [route] comes as part of req.url
  let route = req.query.route;
  
  // If not in query, try to extract from URL path
  if (!route) {
    const pathMatch = req.url?.match(/\/api\/([^/?]+)/);
    route = pathMatch ? pathMatch[1] : null;
  }
  
  if (!route) {
    return res.status(400).json({ error: 'Rute tidak lengkap' });
  }

  const normalizedRoute = String(route).trim();
  if (!/^[a-z0-9-]+$/.test(normalizedRoute) || normalizedRoute.startsWith('_') || INTERNAL_HELPER_MODULES.has(normalizedRoute)) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
  }

  try {
    // Import dan jalankan file dari folder _lib
    const fn = require(`./_lib/${normalizedRoute}.js`);
    if (typeof fn !== 'function') {
      return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
    }
    return await fn(req, res);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
    }
    console.error(`Error executing ${normalizedRoute}:`, err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
