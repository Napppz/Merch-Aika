const db = require('./_db');
const { getCache, setCache, invalidateCache } = require('./cache');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      // ✅ Try cache first (reduces database transfer by ~50%)
      const cached = getCache('reviews_latest');
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cached);
      }

      res.setHeader('X-Cache', 'MISS');
      const { rows } = await db.query('SELECT * FROM reviews ORDER BY date DESC LIMIT 10');
      
      // ✅ Cache for 10 minutes (reviews update periodically)
      setCache('reviews_latest', rows, 600);
      return res.status(200).json(rows);
    } 
    
    if (req.method === 'POST') {
      const { order_id, customer_name, rating, comment } = req.body;
      
      if (!order_id || !rating) {
        return res.status(400).json({ error: 'Order ID dan Rating wajib diisi' });
      }

      // Pastikan tabel reviews memiliki kolom avatar
      try {
        await db.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS avatar TEXT');
      } catch(e) { }

      // Check if order is already reviewed
      const existing = await db.query('SELECT id FROM reviews WHERE order_id = $1', [order_id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Pesanan ini sudah diulas' });
      }

      const avatarBase64 = req.body.avatar || '';

      const { rows } = await db.query(
        `INSERT INTO reviews (order_id, customer_name, rating, comment, avatar) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [order_id, customer_name || 'Anonymous', parseInt(rating), comment || '', avatarBase64]
      );
      
      // ✅ Invalidate cache when new review added
      invalidateCache('reviews_*');
      
      return res.status(201).json(rows[0]);
    }

    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
