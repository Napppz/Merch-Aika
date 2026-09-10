const { query } = require('./_db');
const crypto = require('crypto');
const { getPasswordSalt } = require('./env');
const { requireUserOrAdmin } = require('./user-auth');

function hashPassword(password) {
  const salt = getPasswordSalt();
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userEmail = (req.headers['x-user-email'] || req.query.email || req.body?.email || '').trim().toLowerCase();

  if (!userEmail) {
    return res.status(400).json({ success: false, error: 'Email user diperlukan' });
  }

  // 🔐 Keamanan: Wajibkan token login sah milik akun ini (atau admin)
  const auth = requireUserOrAdmin(req, res, userEmail);
  if (!auth) return;

  // ── GET USER PROFILE ──
  if (req.method === 'GET') {
    try {
      const result = await query(
        'SELECT id, username, email, phone, verified, avatar, created_at FROM users WHERE LOWER(email) = LOWER($1)',
        [userEmail]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
      }

      const user = result.rows[0];
      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone || '',
          verified: user.verified,
          avatar: user.avatar,
          createdAt: user.created_at
        }
      });
    } catch (err) {
      console.error('Fetch user profile error:', err.message);
      return res.status(500).json({ success: false, error: 'Gagal mengambil data profil' });
    }
  }

  // ── UPDATE USER PROFILE ──
  if (req.method === 'PUT' || req.method === 'POST') {
    const { username, phone, currentPassword, newPassword } = req.body || {};

    if (!username) {
      return res.status(400).json({ success: false, error: 'Nama pengguna tidak boleh kosong' });
    }

    try {
      let updateResult;
      const cleanPhone = phone ? String(phone).trim() : null;
      const cleanUsername = String(username).trim();

      if (newPassword && String(newPassword).trim().length > 0) {
        const trimmedNewPass = String(newPassword).trim();
        if (trimmedNewPass.length < 6) {
          return res.status(400).json({ success: false, error: 'Password baru minimal 6 karakter' });
        }

        // 🔐 Verifikasi password saat ini jika bukan admin
        if (auth.type !== 'admin') {
          if (!currentPassword) {
            return res.status(400).json({
              success: false,
              error: 'Password saat ini wajib diisi untuk mengubah password'
            });
          }

          const userRow = await query(
            'SELECT password_hash FROM users WHERE LOWER(email) = LOWER($1)',
            [userEmail]
          );

          if (!userRow.rows.length) {
            return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
          }

          const currentHash = hashPassword(String(currentPassword).trim());
          const storedHash = userRow.rows[0].password_hash;

          let isMatch = false;
          try {
            isMatch = crypto.timingSafeEqual(Buffer.from(currentHash), Buffer.from(storedHash));
          } catch (_) {
            isMatch = false;
          }

          if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Password saat ini salah' });
          }
        }

        const passwordHash = hashPassword(trimmedNewPass);
        updateResult = await query(
          `UPDATE users 
           SET username = $1, phone = $2, password_hash = $3, updated_at = NOW() 
           WHERE LOWER(email) = LOWER($4) 
           RETURNING id, username, email, phone`,
          [cleanUsername, cleanPhone, passwordHash, userEmail]
        );
      } else {
        updateResult = await query(
          `UPDATE users 
           SET username = $1, phone = $2, updated_at = NOW() 
           WHERE LOWER(email) = LOWER($3) 
           RETURNING id, username, email, phone`,
          [cleanUsername, cleanPhone, userEmail]
        );
      }

      if (updateResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
      }

      const updatedUser = updateResult.rows[0];
      return res.status(200).json({
        success: true,
        message: 'Profil dan pengaturan berhasil diperbarui',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          phone: updatedUser.phone || ''
        }
      });
    } catch (err) {
      console.error('Update user profile error:', err.message);
      return res.status(500).json({ success: false, error: 'Gagal memperbarui profil: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
