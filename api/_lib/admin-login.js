// api/admin-login.js — Admin Authentication
// Admin credentials stored as environment variables or hardcoded (change to environment variables for production)

const crypto = require('crypto');

// Admin credentials (ideally from environment variables)
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'Aika',
  password_hash: process.env.ADMIN_PASSWORD_HASH || 'Aikanap2213' // In production, this should be hashed
};

function hashPassword(password) {
  const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password diperlukan' });
  }

  try {
    // Simple authentication (for production, use a proper admin table)
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password_hash) {
      return res.status(200).json({
        success: true,
        message: 'Login admin berhasil',
        admin: {
          username: username,
          role: 'admin'
        }
      });
    } else {
      return res.status(401).json({ success: false, message: 'Username atau password admin salah!' });
    }
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
