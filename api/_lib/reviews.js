const db = require('./_db');
const { getCache, setCache, invalidateCache } = require('./cache');
const { hasR2Config, parseDataUrlImage, uploadImageBuffer } = require('./r2-storage');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email');

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
      const { order_id, customer_name, rating, comment } = req.body || {};
      const cleanOrderId = typeof order_id === 'string' ? order_id.trim() : '';
      const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 600) : '';
      const cleanCustomerName = typeof customer_name === 'string' && customer_name.trim()
        ? customer_name.trim().slice(0, 100)
        : 'Anonymous';
      const parsedRating = parseInt(rating, 10);

      if (!cleanOrderId || !Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({ error: 'Order ID dan Rating (1-5) wajib diisi' });
      }

      if (!cleanComment) {
        return res.status(400).json({ error: 'Pesan & kesan ulasan wajib diisi' });
      }

      // Pastikan tabel reviews memiliki kolom avatar
      try {
        await db.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS avatar TEXT');
      } catch (e) { }

      // Check if order is already reviewed
      const existing = await db.query('SELECT id FROM reviews WHERE order_id = $1', [cleanOrderId]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Pesanan ini sudah diulas' });
      }

      let avatarValue = req.body.avatar || '';

      if (typeof avatarValue === 'string' && avatarValue.startsWith('data:image/') && hasR2Config()) {
        const { buffer, mimeType } = parseDataUrlImage(avatarValue);
        const uploaded = await uploadImageBuffer({
          buffer,
          mimeType,
          fileName: `review-avatar-${cleanOrderId}`,
          folder: 'review-avatars',
          prefix: String(cleanOrderId)
        });
        avatarValue = uploaded.imageUrl;
      }

      const { rows } = await db.query(
        `INSERT INTO reviews (order_id, customer_name, rating, comment, avatar) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [cleanOrderId, cleanCustomerName, parsedRating, cleanComment, avatarValue]
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
