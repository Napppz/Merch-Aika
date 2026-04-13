const { query } = require('./_db');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user-email');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = req.headers['x-user-email'] || req.query.email || req.body?.email;
  
  if (!email) {
    return res.status(401).json({ error: 'Email diperlukan' });
  }

  try {
    if (req.method === 'GET') {
      // GET - Retrieve avatar
      const { rows } = await query(
        'SELECT avatar FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'User tidak ditemukan' });
      }

      const avatar = rows[0].avatar;
      return res.status(200).json({ 
        success: true,
        avatar: avatar || null,
        message: avatar ? 'Avatar ditemukan' : 'User belum punya avatar'
      });
    } 
    
    else if (req.method === 'POST') {
      // POST - Upload/Update avatar
      const { avatar } = req.body;

      if (!avatar) {
        return res.status(400).json({ error: 'Avatar data diperlukan' });
      }

      // Validate base64 image format
      if (!avatar.startsWith('data:image/')) {
        return res.status(400).json({ 
          error: 'Format gambar tidak valid. Gunakan JPG, PNG, atau WebP.' 
        });
      }

      // Check file size (base64 encoded adalah ~1.33x lebih besar)
      // Max 5MB raw = ~6.65MB base64
      const maxSize = 6.5 * 1024 * 1024;
      if (avatar.length > maxSize) {
        return res.status(413).json({ 
          error: `Ukuran foto terlalu besar (${Math.round(avatar.length / 1024 / 1024)}MB). Maksimal 5MB.` 
        });
      }

      // Validate image types
      const allowedTypes = ['data:image/jpeg', 'data:image/png', 'data:image/webp', 'data:image/gif'];
      if (!allowedTypes.some(type => avatar.startsWith(type))) {
        return res.status(400).json({ 
          error: 'Tipe gambar hanya boleh: JPG, PNG, WebP, atau GIF' 
        });
      }

      // Find user first
      const userCheck = await query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );

      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User tidak ditemukan' });
      }

      const userId = userCheck.rows[0].id;

      // Update avatar in database
      const { rows } = await query(
        `UPDATE users SET avatar = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING avatar`,
        [avatar, userId]
      );

      if (rows.length === 0) {
        return res.status(500).json({ error: 'Gagal menyimpan avatar' });
      }

      return res.status(200).json({ 
        success: true,
        message: 'Foto profil berhasil diperbarui!',
        avatar: rows[0].avatar 
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Avatar API error:', err);
    return res.status(500).json({ 
      error: 'Gagal memproses avatar: ' + err.message 
    });
  }
};
