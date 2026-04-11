// api/register.js — Vercel Serverless Function
// Menyimpan data user baru ke Neon PostgreSQL

const { query } = require('./_db');
const crypto = require('crypto');

function hashPassword(password) {
  // Menggunakan SHA-256 + salt untuk keamanan
  // Di produksi sebaiknya gunakan bcrypt
  const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { username, email, phone, password, verified } = req.body;

  // Validasi
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }
  if (!verified) {
    return res.status(400).json({ error: 'Email belum diverifikasi' });
  }

  try {
    // Cek duplicate
    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email atau username sudah terdaftar' });
    }

    // Simpan user
    const hashedPw = hashPassword(password);
    const result = await query(
      `INSERT INTO users (username, email, phone, password_hash, verified, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       RETURNING id, username, email, phone, created_at`,
      [username.toLowerCase(), email.toLowerCase(), phone || null, hashedPw]
    );

    const newUser = result.rows[0];

    // Hapus OTP yang sudah dipakai
    await query('DELETE FROM otp_codes WHERE email = $1', [email.toLowerCase()]).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Akun berhasil dibuat',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      }
    });

  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Terjadi kesalahan server', detail: err.message });
  }
};
