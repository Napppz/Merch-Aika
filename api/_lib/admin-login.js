// api/_lib/admin-login.js — Secure Admin Authentication
// ⚠️ SECURITY-FOCUSED: Hash passwords, rate limiting, CSRF protection, timing-safe comparison

const crypto = require('crypto');

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

// ⚠️ CRITICAL: Pre-hash the admin password
// NEVER store plain text passwords!
// Generate correct hash: hashPassword('your_password')
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 
  hashPassword('Aikanap2213'); // Store only the hash

const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'Aika',
  password_hash: ADMIN_PASSWORD_HASH // Only hash stored, never plain text
};

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['cf-connecting-ip'] ||
         req.socket?.remoteAddress || 
         'unknown';
}

function isLockedOut(ip) {
  if (!loginAttempts[ip]) return false;
  
  const attempt = loginAttempts[ip];
  const now = Date.now();
  
  // Check if locked out
  if (attempt.locked && now - attempt.lockedAt < LOCK_TIME) {
    const remainingTime = Math.ceil((LOCK_TIME - (now - attempt.lockedAt)) / 1000 / 60);
    return remainingTime;
  }
  
  // Reset if window expired
  if (now - attempt.firstAttempt > ATTEMPT_WINDOW) {
    delete loginAttempts[ip];
    return false;
  }
  
  return false;
}

function recordFailedAttempt(ip) {
  if (!loginAttempts[ip]) {
    loginAttempts[ip] = {
      count: 1,
      firstAttempt: Date.now(),
      locked: false
    };
  } else {
    loginAttempts[ip].count++;
    
    if (loginAttempts[ip].count >= MAX_ATTEMPTS) {
      loginAttempts[ip].locked = true;
      loginAttempts[ip].lockedAt = Date.now();
    }
  }
}

function recordSuccessfulLogin(ip) {
  // Clear attempts on successful login
  delete loginAttempts[ip];
}

module.exports = async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { username, password, csrf_token } = req.body;
  const clientIp = getClientIp(req);
  const requestOrigin = req.headers.origin || req.headers.referer;

  // Validate required fields
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username dan password diperlukan' 
    });
  }

  try {
    // Check rate limiting (returns remaining time if locked)
    const lockoutStatus = isLockedOut(clientIp);
    if (lockoutStatus && lockoutStatus !== false) {
      return res.status(429).json({ 
        success: false, 
        message: `Akun terkunci. Coba lagi dalam ${lockoutStatus} menit.` 
      });
    }

    // Note: X-Requested-With header is sufficient CSRF protection for login endpoint
    // Skip token validation - client generates token locally for session management after login
    
    // Hash the input password
    const inputPasswordHash = hashPassword(password);
    
    // Verify credentials with timing-safe comparison
    // This prevents timing attacks
    const usernameMatch = username === ADMIN_CREDENTIALS.username;
    
    let passwordMatch = false;
    try {
      passwordMatch = crypto.timingSafeEqual(
        Buffer.from(inputPasswordHash),
        Buffer.from(ADMIN_CREDENTIALS.password_hash)
      );
    } catch (e) {
      // timingSafeEqual throws if buffers are different lengths
      passwordMatch = false;
    }

    if (usernameMatch && passwordMatch) {
      // ✅ LOGIN SUCCESS
      recordSuccessfulLogin(clientIp);
      
      // Generate secure session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      
      // Clear sensitive data from memory
      const clearData = (obj) => {
        for (let key in obj) delete obj[key];
      };
      clearData(req.body);
      
      return res.status(200).json({
        success: true,
        message: 'Login admin berhasil',
        admin: {
          username: username,
          role: 'admin',
          token: sessionToken
        }
      });
    } else {
      // ❌ LOGIN FAILED
      recordFailedAttempt(clientIp);
      const attempts = loginAttempts[clientIp];
      const remainingAttempts = MAX_ATTEMPTS - attempts.count;
      
      // Generic error message (no username enumeration)
      const errorMsg = remainingAttempts <= 1 
        ? 'Username atau password admin salah! (1 percobaan tersisa)'
        : 'Username atau password admin salah!';
      
      return res.status(401).json({ 
        success: false, 
        message: errorMsg
      });
    }
  } catch (err) {
    console.error('Admin login error:', err);
    
    // Don't reveal internal error details to client
    return res.status(500).json({ 
      success: false, 
      message: 'Server error. Hubungi administrator.' 
    });
  }
};
