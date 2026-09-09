// api/_lib/google-auth.js — Vercel Serverless Function
// Autentikasi Google Sign-In (OAuth 2.0 / Google Identity Services)
// Menangani auto-registration dan account linking ke database Neon PostgreSQL

const { query } = require('./_db');
const crypto = require('crypto');
const { getPasswordSalt } = require('./env');

function hashPassword(password) {
  const salt = getPasswordSalt();
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

module.exports = async function handler(req, res) {
  // ─── SECURITY & CORS HEADERS ───
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ─── GET: Mengembalikan Public Client ID untuk Frontend ───
  if (req.method === 'GET') {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    return res.status(200).json({
      success: true,
      configured: !!clientId,
      clientId: clientId
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { credential, demoUser } = req.body || {};

  try {
    let googleUser = null;

    // 1. Verifikasi Google ID Token asli jika ada credential
    if (credential) {
      // Verifikasi token melalui endpoint resmi Google Tokeninfo
      const googleVerifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
      const googleRes = await fetch(googleVerifyUrl);
      
      if (!googleRes.ok) {
        const errData = await googleRes.json().catch(() => ({}));
        return res.status(401).json({
          success: false,
          error: 'Token Google tidak valid atau sudah kadaluarsa',
          details: errData.error_description || errData.error
        });
      }

      const payload = await googleRes.json();

      // Pastikan email terverifikasi oleh Google
      const isEmailVerified = payload.email_verified === 'true' || payload.email_verified === true;
      if (!isEmailVerified) {
        return res.status(400).json({
          success: false,
          error: 'Email Google Anda belum diverifikasi oleh Google'
        });
      }

      // Validasi aud (Audience) jika GOOGLE_CLIENT_ID sudah dikonfigurasi
      const configuredClientId = process.env.GOOGLE_CLIENT_ID;
      if (configuredClientId && payload.aud !== configuredClientId) {
        return res.status(401).json({
          success: false,
          error: 'Client ID token tidak cocok dengan konfigurasi server'
        });
      }

      googleUser = {
        sub: payload.sub,
        email: String(payload.email).trim().toLowerCase(),
        name: payload.name || payload.given_name || payload.email.split('@')[0],
        picture: payload.picture || null
      };
    } 
    // 2. Mode Demo (untuk testing lokal jika Client ID belum dipasang)
    else if (demoUser && (!process.env.GOOGLE_CLIENT_ID || process.env.ALLOW_DEMO_AUTH === 'true')) {
      googleUser = {
        sub: demoUser.sub || `demo_google_${Date.now()}`,
        email: String(demoUser.email).trim().toLowerCase(),
        name: demoUser.name || 'Pengguna Google Demo',
        picture: demoUser.picture || null
      };
    } else {
      return res.status(400).json({
        success: false,
        error: 'Kredensial token Google diperlukan'
      });
    }

    const { sub, email, name, picture } = googleUser;

    // 3. Cek apakah user sudah terdaftar di database
    const existingUserRes = await query(
      'SELECT id, username, email, phone, avatar, verified, google_id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    let loggedInUser = null;
    let isNewUser = false;

    if (existingUserRes.rows.length > 0) {
      // ─── SKENARIO A: ACCOUNT LINKING (User sudah ada) ───
      const user = existingUserRes.rows[0];

      // Update google_id, pastikan verified = TRUE, dan isi avatar jika belum ada
      const updateRes = await query(
        `UPDATE users 
         SET google_id = COALESCE(google_id, $1),
             verified = TRUE,
             verified_at = COALESCE(verified_at, NOW()),
             avatar = COALESCE(avatar, $2),
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, username, email, phone, avatar, verified`,
        [sub, picture, user.id]
      );

      loggedInUser = updateRes.rows[0];
      isNewUser = false;
    } else {
      // ─── SKENARIO B: AUTO-REGISTRATION (User baru) ───
      // Buat username ramah sistem dari nama / email
      let baseUsername = (name || email.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 16);

      if (baseUsername.length < 3) baseUsername = 'user_' + baseUsername;

      // Pastikan username unik di tabel users
      let uniqueUsername = baseUsername;
      let counter = 1;
      while (true) {
        const checkUname = await query(
          'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
          [uniqueUsername]
        );
        if (checkUname.rows.length === 0) break;
        uniqueUsername = `${baseUsername.slice(0, 12)}_${Math.floor(100 + Math.random() * 900)}`;
        counter++;
        if (counter > 5) {
          uniqueUsername = `user_${Date.now().toString().slice(-6)}`;
          break;
        }
      }

      // Password acak aman (karena user menggunakan OAuth)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPw = hashPassword(randomPassword);

      const insertRes = await query(
        `INSERT INTO users (username, email, avatar, google_id, auth_provider, verified, verified_at, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'google', TRUE, NOW(), $5, NOW(), NOW())
         RETURNING id, username, email, phone, avatar, verified`,
        [uniqueUsername, email, picture, sub, hashedPw]
      );

      loggedInUser = insertRes.rows[0];
      isNewUser = true;
    }

    return res.status(200).json({
      success: true,
      message: isNewUser ? 'Akun berhasil dibuat dengan Google!' : 'Berhasil masuk dengan Google!',
      isNewUser,
      user: {
        id: loggedInUser.id,
        username: loggedInUser.username,
        email: loggedInUser.email,
        phone: loggedInUser.phone || '',
        avatar: loggedInUser.avatar || picture || null,
        verified: loggedInUser.verified
      }
    });

  } catch (err) {
    console.error('[GOOGLE-AUTH] Server error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Terjadi kesalahan saat memproses autentikasi Google',
      details: err.message
    });
  }
};
