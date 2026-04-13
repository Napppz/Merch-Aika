// Security utilities untuk password hashing & JWT
const bcrypt = require('bcryptjs');  // Pure JS, works on Vercel
const jwt = require('jsonwebtoken');

/**
 * ✅ Hash password dengan bcrypt (12 rounds = strong)
 * Secure against brute-force attacks
 */
async function hashPassword(password) {
  if (!password || password.length < 10) {
    throw new Error('Password minimal 10 karakter');
  }
  return await bcrypt.hash(password, 12); // 12 rounds = strong
}

/**
 * ✅ Verify password against hash
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * ✅ Generate JWT token dengan expiration
 * Token berlaku 24 jam
 */
function issueToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET tidak di-set');
  
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'user'
    },
    secret,
    { expiresIn: '24h' } // 24 jam expiration
  );
}

/**
 * ✅ Verify & decode JWT token
 */
function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET tidak di-set');
  
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('Token sudah expired. Silakan login lagi.');
    }
    throw new Error('Token invalid');
  }
}

/**
 * ✅ Middleware untuk verify JWT di API endpoints
 */
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token diperlukan' });
  }
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  requireAuth
};
