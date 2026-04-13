// api/login.js — Login dengan JWT & rate limiting
const { query } = require('./_db');
const { verifyPassword, issueToken } = require('./auth-utils');
const { securityHeaders, loginLimiter, validateRequest } = require('./security-middleware');
const Joi = require('joi');

// Validasi schema (fleksibel: bisa email atau username)
const loginSchema = Joi.object({
  identifier: Joi.string()
    .min(3)
    .required()
    .messages({
      'string.min': 'Email atau username tidak valid'
    }),
  password: Joi.string()
    .min(10)
    .required()
    .messages({
      'string.min': 'Password tidak valid'
    }),
  rememberMe: Joi.boolean().optional()
});

module.exports = async function handler(req, res) {
  // Security headers
  securityHeaders(req, res);

  // CORS dengan whitelist
  const allowedOrigins = [
    'https://merch-aika.vercel.app',
    'https://www.merch-aika.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Apply rate limiter (5 attempts per 15 min)
    await new Promise((resolve, reject) => {
      loginLimiter(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Validate request body
    const { error, value } = loginSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validasi gagal',
        details: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message
        }))
      });
    }

    const { identifier, password, rememberMe } = value;

    // Find user by email or username
    const userResult = await query(
      `SELECT id, username, email, phone, password_hash, role, verified, avatar, created_at, last_login
       FROM users 
       WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)
       LIMIT 1`,
      [identifier]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal if user exists (security best practice)
      return res.status(401).json({
        success: false,
        error: 'Email/username atau password salah'
      });
    }

    const user = userResult.rows[0];

    // Verify password menggunakan bcrypt
    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Email/username atau password salah'
      });
    }

    if (!user.verified) {
      return res.status(403).json({
        success: false,
        error: 'Email belum diverifikasi. Periksa email Anda.'
      });
    }

    // Generate JWT token
    const token = issueToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'user'
    });

    // Update last_login
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    ).catch(err => console.log('Update last_login failed:', err.message));

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (user_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [user.id, 'LOGIN_SUCCESS', JSON.stringify({ identifier, ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress })]
    ).catch(err => console.log('Audit log failed:', err.message));

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      token,
      expiresIn: 86400, // 24 hours in seconds
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role || 'user',
        createdAt: user.created_at
      }
    });

  } catch (rateLimitErr) {
    // Rate limiter error (too many attempts)
    if (rateLimitErr.message && rateLimitErr.message.includes('limit')) {
      return res.status(429).json({
        success: false,
        error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.'
      });
    }

    console.error('Login error:', rateLimitErr.message);
    return res.status(500).json({
      success: false,
      error: 'Gagal login'
    });
  }
};
