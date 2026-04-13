// Security middleware untuk semua API endpoints
const rateLimit = require('express-rate-limit');

/**
 * ✅ CORS Whitelist - hanya allow domain sendiri
 */
function corsWhitelist(req, res) {
  const allowedOrigins = [
    'https://merch-aika.vercel.app',
    'https://www.merch-aika.vercel.app',
    'http://localhost:3000', // development
    'http://localhost:5173'  // development
  ];
  
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
}

/**
 * ✅ Security Headers
 */
function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;");
}

/**
 * ✅ Rate Limiting - Login attempts
 * Max 5 attempts per 15 menit
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5, // Max 5 attempts
  keyGenerator: (req) => {
    // Rate limit by email/username, bukan IP (agar support load balancer)
    return req.body.identifier || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Terlalu banyak attempt login. Coba lagi dalam 15 menit.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  },
  skip: (req) => {
    // Skip rate limit di development
    return process.env.NODE_ENV === 'development';
  }
});

/**
 * ✅ Rate Limiting - Register attempts
 * Max 3 attempts per jam
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 3, // Max 3 registrations
  keyGenerator: (req) => req.body.email || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Terlalu banyak attempt register. Coba lagi 1 jam.'
    });
  }
});

/**
 * ✅ Rate Limiting - API endpoints umum
 * Max 100 requests per 15 menit
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: (req, res) => {
    res.status(429).json({ error: 'Terlalu banyak request. Coba lagi nanti.' });
  }
});

/**
 * ✅ Request validation middleware
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      return res.status(400).json({
        error: 'Validasi gagal',
        details: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message
        }))
      });
    }
    
    req.body = value;
    next();
  };
}

module.exports = {
  corsWhitelist,
  securityHeaders,
  loginLimiter,
  registerLimiter,
  apiLimiter,
  validateRequest
};
