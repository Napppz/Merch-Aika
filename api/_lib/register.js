// api/_lib/register.js — Vercel Serverless Function
// Menyimpan data user baru ke Neon PostgreSQL
// 🔐 SECURITY: Force verified=false, CORS whitelist, security headers

const { query } = require('./_db');
const crypto = require('crypto');
const { getPasswordSalt } = require('./env');

function hashPassword(password) {
  // Menggunakan SHA-256 + salt untuk keamanan
  // Di produksi sebaiknya gunakan bcrypt
  const salt = getPasswordSalt();
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

module.exports = async function handler(req, res) {
  // ─── SECURITY HEADERS ───
  const allowedOrigins = [
    'https://merch-aika.vercel.app',
    'https://aika-sesilia.vercel.app',
    'http://localhost:3000',
    'http://localhost:5000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { username, email, phone, password } = req.body;
  
  // ⚠️ SECURITY: DO NOT accept 'verified' from client - ALWAYS force to false
  // User MUST go through email verification process

  // Validasi
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
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

    // Simpan user dengan verified = FALSE (harus OTP verification dulu)
    const hashedPw = hashPassword(password);
    const result = await query(
      `INSERT INTO users (username, email, phone, password_hash, verified, created_at)
       VALUES ($1, $2, $3, $4, FALSE, NOW())
       RETURNING id, username, email, phone, created_at`,
      [username.toLowerCase(), email.toLowerCase(), phone || null, hashedPw]
    );

    const newUser = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Akun berhasil dibuat. Verifikasi email kamu untuk melanjutkan.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      }
    });

  } catch (err) {
    console.error('[REGISTER] Error:', err.message);
    return res.status(500).json({ error: 'Terjadi kesalahan server', detail: err.message });
  }
};
