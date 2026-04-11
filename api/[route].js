module.exports = async function handler(req, res) {
  const route = req.query.route;
  
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