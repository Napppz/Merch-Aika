// api/_lib/admin-login.js — Secure Admin Authentication
// 🔒 SECURITY: Server-side token validation, rate limiting, timing-safe comparison
// ⚠️ FIXED: Removed hardcoded password fallback - must use env vars only

const crypto = require('crypto');
const { createAdminToken, getClientIp } = require('./admin-auth');

// In-memory rate limiting (use Redis in production)
const loginAttempts = {};
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes lockout
const ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes attempt window

// Proper password hashing function (HMAC-SHA256 with salt)
function hashPassword(password) {
  const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

// 🔒 CRITICAL SECURITY: Password must be set via environment variable
// NO HARDCODED FALLBACK - this prevents unauthorized access
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!ADMIN_PASSWORD_HASH) {
  console.error('❌ CRITICAL SECURITY ERROR:');
  console.error('ADMIN_PASSWORD_HASH environment variable is NOT set!');
  console.error('Admin login will FAIL. Fix this immediately:');
  console.error('1. Generate hash: node -e "const crypto=require(\'crypto\'); const h=crypto.createHmac(\'sha256\', \'aika_sesilia_salt_2024_secure\').update(\'YOUR_SECURE_PASSWORD\').digest(\'hex\'); console.log(h)"');
  console.error('2. Set in Vercel: Project > Settings > Environment Variables');
}

function isLockedOut(ip) {
  if (!loginAttempts[ip]) return false;
  const attempt = loginAttempts[ip];
  const now = Date.now();
  
  if (attempt.locked && now - attempt.lockedAt < LOCK_TIME) {
    const remainingTime = Math.ceil((LOCK_TIME - (now - attempt.lockedAt)) / 1000 / 60);
    return remainingTime;
  }
  
  if (now - attempt.firstAttempt > ATTEMPT_WINDOW) {
    delete loginAttempts[ip];
    return false;
  }
  
  return false;
}

function recordFailedAttempt(ip) {
  if (!loginAttempts[ip]) {
    loginAttempts[ip] = { count: 1, firstAttempt: Date.now(), locked: false };
  } else {
    loginAttempts[ip].count++;
    if (loginAttempts[ip].count >= MAX_ATTEMPTS) {
      loginAttempts[ip].locked = true;
      loginAttempts[ip].lockedAt = Date.now();
    }
  }
}

function recordSuccessfulLogin(ip) {
  delete loginAttempts[ip];
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { username, password } = req.body;
  const clientIp = getClientIp(req);

  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username dan password diperlukan' 
    });
  }

  if (!ADMIN_PASSWORD_HASH) {
    return res.status(503).json({
      success: false,
      message: 'Admin authentication tidak tersedia'
    });
  }

  try {
    const lockoutStatus = isLockedOut(clientIp);
    if (lockoutStatus !== false) {
      return res.status(429).json({ 
        success: false, 
        message: `Akun terkunci. Coba lagi dalam ${lockoutStatus} menit.` 
      });
    }

    const inputPasswordHash = hashPassword(password);
    const usernameMatch = username === (process.env.ADMIN_USERNAME || 'Aika');
    
    let passwordMatch = false;
    try {
      passwordMatch = crypto.timingSafeEqual(
        Buffer.from(inputPasswordHash),
        Buffer.from(ADMIN_PASSWORD_HASH)
      );
    } catch (e) {
      passwordMatch = false;
    }

    if (usernameMatch && passwordMatch) {
      recordSuccessfulLogin(clientIp);
      const sessionToken = createAdminToken(username, clientIp, req.headers['user-agent'] || '');
      
      for (let key in req.body) delete req.body[key];
      
      return res.status(200).json({
        success: true,
        message: 'Login admin berhasil',
        admin: { username, role: 'admin', token: sessionToken }
      });
    } else {
      recordFailedAttempt(clientIp);
      const attempts = loginAttempts[clientIp];
      const remaining = MAX_ATTEMPTS - attempts.count;
      
      return res.status(401).json({ 
        success: false, 
        message: remaining <= 1 
          ? 'Username atau password admin salah! (1 percobaan tersisa)'
          : 'Username atau password admin salah!'
      });
    }
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error'
    });
  }
};
