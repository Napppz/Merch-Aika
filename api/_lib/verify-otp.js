// api/_lib/verify-otp.js — Vercel Serverless Function
// Verifikasi OTP code dari email dan set user.verified = true
// 🔐 SECURITY: Rate limiting, CORS whitelist, security headers

const { query } = require('./_db');

// ════════════════════════════════════════════════════════════════
// RATE LIMITING
// ════════════════════════════════════════════════════════════════
const verifyAttempts = {};
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFY_LOCK_TIME = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW = 5 * 60 * 1000;

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['cf-connecting-ip'] ||
         req.socket?.remoteAddress || 
         'unknown';
}

function isVerifyLockedOut(ip) {
  if (!verifyAttempts[ip]) return false;
  
  const attempt = verifyAttempts[ip];
  const now = Date.now();
  
  if (attempt.locked && now - attempt.lockedAt < VERIFY_LOCK_TIME) {
    const remainingTime = Math.ceil((VERIFY_LOCK_TIME - (now - attempt.lockedAt)) / 1000 / 60);
    return remainingTime;
  }
  
  if (now - attempt.firstAttempt > ATTEMPT_WINDOW) {
    delete verifyAttempts[ip];
    return false;
  }
  
  return false;
}

function recordFailedVerifyAttempt(ip) {
  if (!verifyAttempts[ip]) {
    verifyAttempts[ip] = {
      count: 1,
      firstAttempt: Date.now(),
      locked: false
    };
  } else {
    verifyAttempts[ip].count++;
    
    if (verifyAttempts[ip].count >= MAX_VERIFY_ATTEMPTS) {
      verifyAttempts[ip].locked = true;
      verifyAttempts[ip].lockedAt = Date.now();
      console.log(`[SECURITY] IP ${ip} locked out after ${MAX_VERIFY_ATTEMPTS} failed OTP verification attempts`);
    }
  }
}

function recordSuccessVerify(ip) {
  delete verifyAttempts[ip];
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

  const { email, code } = req.body;
  const clientIp = getClientIp(req);

  if (!email || !code) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email dan kode OTP diperlukan' 
    });
  }

  try {
    // ─── RATE LIMITING CHECK ───
    const lockoutStatus = isVerifyLockedOut(clientIp);
    if (lockoutStatus && lockoutStatus !== false) {
      return res.status(429).json({ 
        success: false, 
        message: `Terlalu banyak percobaan verifikasi. Tunggu ${lockoutStatus} menit.` 
      });
    }

    // ─── CHECK IF USER EXISTS AND NOT YET VERIFIED ───
    const userRes = await query(
      'SELECT id, verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userRes.rows.length === 0) {
      recordFailedVerifyAttempt(clientIp);
      return res.status(404).json({ 
        success: false, 
        message: 'Email tidak terdaftar' 
      });
    }

    const user = userRes.rows[0];

    if (user.verified) {
      // Already verified - no need to verify again
      return res.status(400).json({ 
        success: false, 
        message: 'Akun sudah diverifikasi sebelumnya' 
      });
    }

    // ─── VERIFY OTP CODE ───
    const otpRes = await query(
      `SELECT expires_at FROM otp_codes 
       WHERE email = $1 AND code = $2 AND expires_at > NOW()`,
      [email.toLowerCase(), code]
    );

    if (otpRes.rows.length === 0) {
      recordFailedVerifyAttempt(clientIp);
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
      'DELETE FROM otp_codes WHERE email = $1',
      [email.toLowerCase()]
    ).catch(() => {});

    // ─── SUCCESS ───
    recordSuccessVerify(clientIp);

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
