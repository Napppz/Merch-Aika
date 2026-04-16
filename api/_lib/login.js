// api/_lib/login.js — Vercel Serverless Function
// Autentikasi user dengan email/username + password
// 🔐 SECURITY: Rate limiting, timing-safe comparison, CORS whitelist, security headers

const { query } = require('./_db');
const crypto = require('crypto');
const { getPasswordSalt } = require('./env');

// ════════════════════════════════════════════════════════════════
// RATE LIMITING (In-memory + use Redis in production)
// ════════════════════════════════════════════════════════════════
const loginAttempts = {};
const MAX_USER_ATTEMPTS = 5;
const USER_LOCK_TIME = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['cf-connecting-ip'] ||
         req.socket?.remoteAddress || 
         'unknown';
}

function isUserLockedOut(ip) {
  if (!loginAttempts[ip]) return false;
  
  const attempt = loginAttempts[ip];
  const now = Date.now();
  
  if (attempt.locked && now - attempt.lockedAt < USER_LOCK_TIME) {
    const remainingTime = Math.ceil((USER_LOCK_TIME - (now - attempt.lockedAt)) / 1000 / 60);
    return remainingTime;
  }
  
  if (now - attempt.firstAttempt > ATTEMPT_WINDOW) {
    delete loginAttempts[ip];
    return false;
  }
  
  return false;
}

function recordFailedLoginAttempt(ip) {
  if (!loginAttempts[ip]) {
    loginAttempts[ip] = {
      count: 1,
      firstAttempt: Date.now(),
      locked: false
    };
  } else {
    loginAttempts[ip].count++;
    
    if (loginAttempts[ip].count >= MAX_USER_ATTEMPTS) {
      loginAttempts[ip].locked = true;
      loginAttempts[ip].lockedAt = Date.now();
      console.log(`[SECURITY] IP ${ip} locked out after ${MAX_USER_ATTEMPTS} failed login attempts`);
    }
  }
}

function recordSuccessLoginAttempt(ip) {
  delete loginAttempts[ip];
}

// ════════════════════════════════════════════════════════════════
// PASSWORD HASHING & VERIFICATION
// ════════════════════════════════════════════════════════════════
function hashPassword(password) {
  const salt = getPasswordSalt();
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function verifyPassword(inputHash, storedHash) {
  try {
    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(inputHash),
      Buffer.from(storedHash)
    );
  } catch (e) {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════
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

  const { identifier, password } = req.body;
  const clientIp = getClientIp(req);

  if (!identifier || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email/username dan password diperlukan' 
    });
  }

  try {
    // ─── RATE LIMITING CHECK ───
    const lockoutStatus = isUserLockedOut(clientIp);
    if (lockoutStatus && lockoutStatus !== false) {
      return res.status(429).json({ 
        success: false, 
        message: `Terlalu banyak percobaan login. Tunggu ${lockoutStatus} menit.` 
      });
    }

    // ─── QUERY USER (first check if exists) ───
    const userCheck = await query(
      `SELECT id, username, email, phone, verified, avatar, created_at, password_hash
       FROM users
       WHERE email = $1 OR username = $1`,
      [identifier.toLowerCase()]
    );

    if (userCheck.rows.length === 0) {
      // User tidak ditemukan - tapi tetap kirim generic error
      recordFailedLoginAttempt(clientIp);
      return res.status(401).json({ 
        success: false, 
        message: 'Email/username atau password salah!' 
      });
    }

    const user = userCheck.rows[0];
    
    // ─── VERIFY PASSWORD (timing-safe) ───
    const inputHash = hashPassword(password);
    const passwordMatch = verifyPassword(inputHash, user.password_hash);

    if (!passwordMatch) {
      recordFailedLoginAttempt(clientIp);
      return res.status(401).json({ 
        success: false, 
        message: 'Email/username atau password salah!' 
      });
    }

    // ─── CHECK EMAIL VERIFICATION ───
    if (!user.verified) {
      recordFailedLoginAttempt(clientIp);
      return res.status(403).json({ 
        success: false, 
        message: 'Akun belum diverifikasi. Periksa email kamu.' 
      });
    }

    // ─── LOGIN SUCCESS ───
    recordSuccessLoginAttempt(clientIp);

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
    console.error('[LOGIN] Error:', err.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
};
