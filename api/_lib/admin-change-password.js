const crypto = require('crypto');
const db = require('./_db');
const { requireAdmin } = require('./admin-auth');

function hashPassword(password) {
  const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function verifyHash(inputHash, storedHash) {
  try {
    return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
  } catch (error) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const adminSession = requireAdmin(req, res);
  if (!adminSession) return;

  const { currentPassword, newPassword, confirmPassword } = req.body || {};

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Password lama, password baru, dan konfirmasi password wajib diisi'
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password baru minimal 8 karakter'
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Konfirmasi password baru tidak cocok'
    });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Password baru harus berbeda dari password lama'
    });
  }

  try {
    const currentHash = hashPassword(currentPassword);
    const newHash = hashPassword(newPassword);
    const adminResult = await db.query(
      `SELECT id, username, password_hash, role, status
       FROM admins
       WHERE (id = $1 OR username = $2)
       ORDER BY id ASC
       LIMIT 1`,
      [adminSession.adminId, adminSession.username]
    );
    const admin = adminResult.rows[0];

    if (admin) {
      if (admin.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Akun admin tidak aktif'
        });
      }

      if (!verifyHash(currentHash, admin.password_hash)) {
        return res.status(401).json({
          success: false,
          message: 'Password lama salah'
        });
      }

      await db.query(
        'UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, admin.id]
      );

      return res.status(200).json({
        success: true,
        message: 'Password admin berhasil diperbarui'
      });
    }

    const envUsername = process.env.ADMIN_USERNAME || 'Aika';
    const envPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!envPasswordHash || adminSession.username !== envUsername) {
      return res.status(404).json({
        success: false,
        message: 'Data admin tidak ditemukan'
      });
    }

    if (!verifyHash(currentHash, envPasswordHash)) {
      return res.status(401).json({
        success: false,
        message: 'Password lama salah'
      });
    }

    await db.query(
      `INSERT INTO admins (username, password_hash, role, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           status = 'active',
           updated_at = NOW()`,
      [envUsername, newHash, adminSession.role || 'superadmin']
    );

    return res.status(200).json({
      success: true,
      message: 'Password admin berhasil diperbarui'
    });
  } catch (error) {
    console.error('Admin change password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengubah password admin'
    });
  }
};
