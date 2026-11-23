const db = require('./_db');
const { getCache, setCache, invalidateCache } = require('./cache');
const { requireUserOrAdmin } = require('./user-auth');

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
      const { rows } = await db.query(`
        SELECT 
          r.id,
          r.customer_name,
          r.order_id,
          r.rating,
          r.comment,
          r.date,
          COALESCE(NULLIF(u.avatar, ''), NULLIF(r.avatar, '')) as avatar
        FROM reviews r
        LEFT JOIN orders o ON o.id = r.order_id
        LEFT JOIN users u ON (u.email = o.email OR LOWER(u.username) = LOWER(r.customer_name))
        ORDER BY r.date DESC
        LIMIT 25
      `);

      // ✅ Cache for 10 minutes (reviews update periodically)
      setCache('reviews_latest', rows, 600);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const auth = requireUserOrAdmin(req, res);
      if (!auth) return;

      const { order_id, customer_name, rating, comment } = req.body || {};
      const cleanOrderId = typeof order_id === 'string' ? order_id.trim() : '';
      const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 600) : '';
      const parsedRating = parseInt(rating, 10);

      if (!cleanOrderId || !Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({ error: 'Order ID dan Rating (1-5) wajib diisi' });
      }

      if (!cleanComment) {
        return res.status(400).json({ error: 'Pesan & kesan ulasan wajib diisi' });
      }

      // Pastikan order ada, milik pengguna yang login (kecuali Full Admin), dan sudah dibayar/selesai
      const orderRes = await db.query(
        'SELECT id, email, status, "customerName" FROM orders WHERE id = $1',
        [cleanOrderId]
      );
      if (!orderRes.rows.length) {
        return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
      }

      const targetOrder = orderRes.rows[0];
      if (auth.type !== 'admin') {
        const ownerEmail = String(targetOrder.email || '').trim().toLowerCase();
        const callerEmail = String(auth.email || '').trim().toLowerCase();
        if (!ownerEmail || ownerEmail !== callerEmail) {
          return res.status(403).json({ error: 'Anda hanya dapat mengulas pesanan milik akun Anda sendiri' });
        }
      }

      const orderStatus = String(targetOrder.status || '').toLowerCase();
      if (!['paid', 'shipped', 'completed'].includes(orderStatus)) {
        return res.status(400).json({ error: 'Ulasan hanya dapat dikirim untuk pesanan yang sudah terverifikasi atau selesai' });
      }

      const cleanCustomerName = typeof customer_name === 'string' && customer_name.trim()
        ? customer_name.trim().slice(0, 100)
        : (auth.username || targetOrder.customerName || 'Pelanggan').slice(0, 100);

      // Pastikan tabel reviews memiliki kolom avatar
      try {
        await db.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS avatar TEXT');
      } catch (e) { }

      // Check if order is already reviewed
      const existing = await db.query('SELECT id FROM reviews WHERE order_id = $1', [cleanOrderId]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Pesanan ini sudah diulas' });
      }

      // Ambil avatar resmi dari akun user di DB (tidak menerima upload file/URL bebas dari body review)
      let avatarValue = '';
      if (targetOrder.email) {
        const userRes = await db.query(
          'SELECT avatar FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
          [targetOrder.email]
        );
        if (userRes.rows.length && typeof userRes.rows[0].avatar === 'string') {
          avatarValue = userRes.rows[0].avatar;
        }
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
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
