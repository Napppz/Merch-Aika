// api/register.js — Registration dengan bcrypt & validation
const { query } = require('./_db');
const { hashPassword, issueToken } = require('./auth-utils');
const { securityHeaders, registerLimiter, validateRequest } = require('./security-middleware');
const Joi = require('joi');

// Validasi schema
const registerSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.alphanum': 'Username hanya boleh alfanumerik',
      'string.min': 'Username minimal 3 karakter',
      'string.max': 'Username maksimal 30 karakter'
    }),
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Email tidak valid'
    }),
  phone: Joi.string()
    .pattern(/^(\+62|0)[0-9]{9,12}$/)
    .optional()
    .messages({
      'string.pattern.base': 'No HP tidak valid. Format: 08xx atau +62xx'
    }),
  password: Joi.string()
    .min(6)
    .required()
    .messages({
      'string.min': 'Password minimal 6 karakter'
    }),
  confirmPassword: Joi.string()
    .required()
    .valid(Joi.ref('password'))
    .messages({
      'any.only': 'Password tidak cocok'
    }),
  verified: Joi.boolean().required()
});

module.exports = async function handler(req, res) {
  // Security headers
  securityHeaders(req, res);
  
  // Apply rate limiter
  await new Promise((resolve, reject) => {
    registerLimiter(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // CORS - lebih fleksibel untuk development & production
  const allowedOrigins = [
    'https://merch-aika.vercel.app',
    'https://www.merch-aika.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost',
    'http://127.0.0.1'
  ];
  
  const origin = req.headers.origin;
  
  // Allow if in whitelist or if it's localhost-like
  if (allowedOrigins.includes(origin) || 
      (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('vercel.app')))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body, {
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

    const { username, email, phone, password, verified } = value;

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Email belum diverifikasi. Periksa email Anda.'
      });
    }

    // Cek duplicate
    const existing = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)',
      [email, username]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email atau username sudah terdaftar'
      });
    }

    // Hash password dengan bcrypt (12 rounds)
    const hashedPw = await hashPassword(password);

    // Simpan user
    const result = await query(
      `INSERT INTO users (username, email, phone, password_hash, verified, created_at)
       VALUES (LOWER($1), LOWER($2), $3, $4, true, NOW())
       RETURNING id, username, email, phone, created_at`,
      [username, email, phone || null, hashedPw]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Gagal membuat akun'
      });
    }

    const newUser = result.rows[0];

    // Generate JWT token
    const token = issueToken({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: 'user'
    });

    // Hapus OTP yang sudah dipakai
    await query('DELETE FROM otp_codes WHERE email = LOWER($1)', [email]).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Akun berhasil dibuat',
      token,
      expiresIn: 86400, // 24 hours in seconds
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        createdAt: newUser.created_at
      }
    });

  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Gagal membuat akun'
    });
  }
};
