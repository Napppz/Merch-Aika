// api/_lib/admin-login.js — Secure Admin Authentication (Database-backed)
// ⚠️ SECURITY-FOCUSED: Password hashes stored in Neon DB, JWT tokens, rate limiting

const crypto = require('crypto');
const db = require('./_db');
const { generateJWT } = require('./jwt-manager');

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
      // Log suspicious activity
      console.log(`[SECURITY] IP ${ip} locked out after ${MAX_ATTEMPTS} failed attempts`);
    }
  }
}

function recordSuccessfulLogin(ip, adminId) {
  // Clear attempts on successful login
  delete loginAttempts[ip];
  
  // Update last_login timestamp in database
  db.query(
    'UPDATE admins SET last_login = NOW() WHERE id = $1',
    [adminId]
  ).catch(err => console.error('Failed to update last_login:', err));
}

module.exports = async function handler(req, res) {
  // Security headers
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { username, password } = req.body;
  const clientIp = getClientIp(req);

  // Validate required fields
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username dan password diperlukan' 
    });
  }

  try {
    // Check rate limiting
    const lockoutStatus = isLockedOut(clientIp);
    if (lockoutStatus && lockoutStatus !== false) {
      return res.status(429).json({ 
        success: false, 
        message: `Akun terkunci. Coba lagi dalam ${lockoutStatus} menit.` 
      });
    }

    // Query admin dari Neon database
    const result = await db.query(
      'SELECT id, username, password_hash, role, status FROM admins WHERE username = $1 AND status = $2',
      [username, 'active']
    );

    if (result.rows.length === 0) {
      // Admin not found or inactive
      recordFailedAttempt(clientIp);
      return res.status(401).json({ 
        success: false, 
        message: 'Username atau password admin salah!' 
      });
    }

    const admin = result.rows[0];
    
    // Hash input password dan bandingkan
    const inputPasswordHash = hashPassword(password);
    
    let passwordMatch = false;
    try {
      passwordMatch = crypto.timingSafeEqual(
        Buffer.from(inputPasswordHash),
        Buffer.from(admin.password_hash)
      );
    } catch (e) {
      passwordMatch = false;
    }

    if (!passwordMatch) {
      // Password salah
      recordFailedAttempt(clientIp);
      return res.status(401).json({ 
        success: false, 
        message: 'Username atau password admin salah!' 
      });
    }

    // ✅ LOGIN SUCCESS - Generate JWT token
    recordSuccessfulLogin(clientIp, admin.id);
    
    const jwtToken = generateJWT({
      adminId: admin.id,
      username: admin.username,
      role: admin.role,
      type: 'admin'
    });
    
    // Clear sensitive data from memory
    const clearData = (obj) => {
      for (let key in obj) delete obj[key];
    };
    clearData(req.body);
    
    return res.status(200).json({
      success: true,
      message: 'Login admin berhasil',
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        token: jwtToken
      }
    });

  } catch (err) {
    console.error('Admin login error:', err);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Server error. Hubungi administrator.' 
    });
  }
};
