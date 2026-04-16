const { query } = require('./_db');
const crypto = require('crypto');
const { getPasswordSalt } = require('./env');

function hashPassword(password) {
  // Menggunakan SHA-256 + salt untuk keamanan
  const salt = getPasswordSalt();
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token dan password baru diperlukan' });
  }

  try {
    // Pastikan tabelnya bisa di query 
    const checkTable = await query(`
       SELECT EXISTS (
         SELECT FROM information_schema.tables 
         WHERE  table_name   = 'password_reset_tokens'
       );
    `);
    
    if(!checkTable.rows[0].exists) {
      return res.status(400).json({ error: 'Sistem Belum Siap (Hubungi Admin)' });
    }

    // Cari Token (yang belum diclaim)
    const tokenRes = await query('SELECT * FROM password_reset_tokens WHERE token = $1', [token]);
    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: 'Link reset tidak valid atau sudah usang.' });
    }

    const entry = tokenRes.rows[0];

    // Cek Expired (Kadaluarsa)
    if (new Date() > new Date(entry.expires_at)) {
      return res.status(400).json({ error: 'Waktu reset password sudah habis (lewat 15 menit), coba minta link lagi.' });
    }

    // Hash password menggunakan SHA-256 (sama seperti saat register & login)
    const hashed = hashPassword(newPassword);

    // Update password di tabel Users
    await query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashed, entry.email]);

    // Hapus Token dari tabel biar ngga dipakai dua kali
    await query('DELETE FROM password_reset_tokens WHERE email = $1', [entry.email]);

    res.status(200).json({ success: true, message: 'Password berhasil diperbarui!' });
  } catch (err) {
    console.error('Update Password error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to reset password' });
  }
};
