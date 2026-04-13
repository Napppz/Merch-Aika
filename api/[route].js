module.exports = async function handler(req, res) {
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

  try {
    // Import dan jalankan file dari folder _lib
    const fn = require(`./_lib/${route}.js`);
    return await fn(req, res);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return res.status(404).json({ error: `Endpoint /api/${route} tidak ditemukan di peladen` });
    }
    console.error(`Error executing ${route}:`, err);
    res.status(500).json({ error: err.message || 'Internal Server Error dari Global Router' });
  }
};