// api/login.js — Vercel Serverless Function
// Autentikasi user dengan email/username + password

const { query } = require('./_db');
const crypto = require('crypto');

function hashPassword(password) {
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

  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ success: false, message: 'Email/username dan password diperlukan' });
  }

  try {
    const hashedPw = hashPassword(password);
    const result = await query(
      `SELECT id, username, email, phone, verified, avatar, created_at
       FROM users
       WHERE (email = $1 OR username = $1) AND password_hash = $2`,
      [identifier.toLowerCase(), hashedPw]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Email/username atau password salah!' });
    }

    const user = result.rows[0];

    if (!user.verified) {
      return res.status(403).json({ success: false, message: 'Akun belum diverifikasi. Periksa email kamu.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        createdAt: user.created_at,
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
};
