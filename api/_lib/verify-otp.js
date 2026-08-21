// api/_lib/verify-otp.js — Vercel Serverless Function
// Verifikasi OTP code dari email dan set user.verified = true
// 🔐 SECURITY: Rate limiting, CORS whitelist, security headers

const { query } = require('./_db');

// ════════════════════════════════════════════════════════════════
// RATE LIMITING (Per IP + Email kombinasi)
// ════════════════════════════════════════════════════════════════
const verifyAttempts = {};
const MAX_VERIFY_ATTEMPTS = 10;
const VERIFY_LOCK_TIME = 10 * 60 * 1000; // 10 minutes
const ATTEMPT_WINDOW = 5 * 60 * 1000;

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['cf-connecting-ip'] ||
         req.socket?.remoteAddress || 
         'unknown';
}

function getRateLimitKey(req, email) {
  const ip = getClientIp(req);
  const cleanEmail = (email || '').toLowerCase().trim();
  return cleanEmail ? `${ip}:${cleanEmail}` : ip;
}

function isVerifyLockedOut(key) {
  if (!verifyAttempts[key]) return false;
  
  const attempt = verifyAttempts[key];
  const now = Date.now();
  
  if (attempt.locked && now - attempt.lockedAt < VERIFY_LOCK_TIME) {
    const remainingTime = Math.ceil((VERIFY_LOCK_TIME - (now - attempt.lockedAt)) / 1000 / 60);
    return remainingTime;
  }
  
  if (now - attempt.firstAttempt > ATTEMPT_WINDOW) {
    delete verifyAttempts[key];
    return false;
  }
  
  return false;
}

function recordFailedVerifyAttempt(key) {
  if (!verifyAttempts[key]) {
    verifyAttempts[key] = {
      count: 1,
      firstAttempt: Date.now(),
      locked: false
    };
  } else {
    verifyAttempts[key].count++;
    
    if (verifyAttempts[key].count >= MAX_VERIFY_ATTEMPTS) {
      verifyAttempts[key].locked = true;
      verifyAttempts[key].lockedAt = Date.now();
      console.log(`[SECURITY] Key ${key} locked out after ${MAX_VERIFY_ATTEMPTS} failed OTP verification attempts`);
    }
  }
}

function recordSuccessVerify(key) {
  delete verifyAttempts[key];
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
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
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

  const rawEmail = req.body.email;
  const rawCode = req.body.code;

  if (!rawEmail || !rawCode) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email dan kode OTP diperlukan' 
    });
  }

  const cleanEmail = String(rawEmail).trim().toLowerCase();
  const cleanCode = String(rawCode).trim();
  const rateLimitKey = getRateLimitKey(req, cleanEmail);

  try {
    // ─── RATE LIMITING CHECK ───
    const lockoutStatus = isVerifyLockedOut(rateLimitKey);
    if (lockoutStatus && lockoutStatus !== false) {
      return res.status(429).json({ 
        success: false, 
        message: `Terlalu banyak percobaan verifikasi. Tunggu ${lockoutStatus} menit.` 
      });
    }

    // ─── CHECK IF USER EXISTS AND NOT YET VERIFIED ───
    const userRes = await query(
      'SELECT id, verified FROM users WHERE LOWER(email) = LOWER($1)',
      [cleanEmail]
    );

    if (userRes.rows.length === 0) {
      recordFailedVerifyAttempt(rateLimitKey);
      return res.status(404).json({ 
        success: false, 
        message: 'Email tidak terdaftar' 
      });
    }

    const user = userRes.rows[0];

    if (user.verified) {
      // Already verified - no need to verify again
      recordSuccessVerify(rateLimitKey);
      return res.status(200).json({ 
        success: true, 
        message: 'Akun sudah diverifikasi sebelumnya. Silakan login.' 
      });
    }

    // ─── VERIFY OTP CODE ───
    const otpRes = await query(
      `SELECT expires_at FROM otp_codes 
       WHERE LOWER(email) = LOWER($1) AND code = $2 AND expires_at > NOW()`,
      [cleanEmail, cleanCode]
    );

    if (otpRes.rows.length === 0) {
      recordFailedVerifyAttempt(rateLimitKey);
      return res.status(401).json({ 
        success: false, 
        message: 'Kode OTP tidak valid atau sudah kadaluarsa' 
      });
    }

    // ─── SET USER AS VERIFIED ───
    await query(
      'UPDATE users SET verified = TRUE, verified_at = NOW() WHERE id = $1',
      [user.id]
    );

    // ─── DELETE USED OTP CODE ───
    await query(
      'DELETE FROM otp_codes WHERE LOWER(email) = LOWER($1)',
      [cleanEmail]
    ).catch(() => {});

    // ─── SUCCESS ───
    recordSuccessVerify(rateLimitKey);

    return res.status(200).json({
      success: true,
      message: 'Email berhasil diverifikasi! Silakan login dengan akun kamu.'
    });

  } catch (err) {
    console.error('[VERIFY-OTP] Error:', err.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    });
  }
};
