// api/_lib/wishlist.js — Vercel Serverless Function
// Mengelola produk favorit (Wishlist) pengguna di Neon PostgreSQL

const { query } = require('./_db');
const { requireUserOrAdmin } = require('./user-auth');

module.exports = async (req, res) => {
  // CORS & Security headers
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawEmail = req.headers?.['x-user-email'] || req.query?.email || req.body?.email;
  if (!rawEmail) {
    return res.status(401).json({ success: false, error: 'Email pengguna diperlukan' });
  }

  const cleanEmail = String(rawEmail).trim().toLowerCase();

  // 🔐 Keamanan: Wajibkan token autentikasi yang sah milik akun ini (atau admin)
  const auth = requireUserOrAdmin(req, res, cleanEmail);
  if (!auth) return;

  try {
    // ─── GET: Ambil daftar wishlist pengguna ───
    if (req.method === 'GET') {
      const idsOnly = req.query?.idsOnly === 'true';

      if (idsOnly) {
        const { rows } = await query(
          'SELECT product_id FROM wishlists WHERE LOWER(user_email) = LOWER($1)',
          [cleanEmail]
        );
        return res.status(200).json({ success: true, productIds: rows.map(r => r.product_id) });
      }

      // Ambil lengkap dengan relasi tabel products
      const { rows } = await query(`
        SELECT 
          w.id AS wishlist_id,
          w.product_id,
          w.created_at,
          COALESCE(p.name, 'Produk Merchandise') AS name,
          COALESCE(p.price, 0) AS price,
          COALESCE(p.image, '') AS image,
          COALESCE(p.category, 'Merchandise') AS category,
          COALESCE(p.description, '') AS description,
          COALESCE(p.is_photopack, false) AS is_photopack
        FROM wishlists w
        LEFT JOIN products p ON (p.id = w.product_id)
        WHERE LOWER(w.user_email) = LOWER($1)
        ORDER BY w.created_at DESC
      `, [cleanEmail]);

      return res.status(200).json({
        success: true,
        items: rows.map(r => ({
          id: r.product_id,
          wishlistId: r.wishlist_id,
          name: r.name,
          price: Number(r.price),
          image: r.image,
          category: r.category,
          description: r.description,
          isPhotopack: r.is_photopack,
          createdAt: r.created_at
        }))
      });
    }

    // ─── POST: Tambah produk ke wishlist ───
    if (req.method === 'POST') {
      const productId = req.body?.product_id || req.body?.id;
      if (!productId) {
        return res.status(400).json({ success: false, error: 'product_id diperlukan' });
      }

      const cleanProductId = String(productId).trim();

      const { rows } = await query(`
        INSERT INTO wishlists (user_email, product_id, created_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_email, product_id) DO NOTHING
        RETURNING *
      `, [cleanEmail, cleanProductId]);

      return res.status(201).json({
        success: true,
        message: 'Produk berhasil ditambahkan ke favorit',
        item: rows[0] || null
      });
    }

    // ─── DELETE: Hapus produk dari wishlist ───
    if (req.method === 'DELETE') {
      const productId = req.query.product_id || req.query.id || req.body?.product_id || req.body?.id;
      if (!productId) {
        return res.status(400).json({ success: false, error: 'product_id diperlukan' });
      }

      const cleanProductId = String(productId).trim();

      await query(
        'DELETE FROM wishlists WHERE LOWER(user_email) = LOWER($1) AND product_id = $2',
        [cleanEmail, cleanProductId]
      );

      return res.status(200).json({
        success: true,
        message: 'Produk berhasil dihapus dari favorit'
      });
    }

    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[WISHLIST-API] Error:', err);
    return res.status(500).json({ success: false, error: 'Gagal memproses data wishlist', details: err.message });
  }
};
