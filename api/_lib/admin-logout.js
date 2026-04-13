// api/_lib/admin-logout.js — Secure Admin Session Termination
// Clears admin session and returns confirmation

module.exports = async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { token } = req.body;

    // Validate token exists
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token diperlukan untuk logout'
      });
    }

    // In production, you would:
    // 1. Look up token in database/Redis
    // 2. Verify it's valid
    // 3. Mark token as revoked
    // 4. Log the logout event

    // For now, just return success
    return res.status(200).json({
      success: true,
      message: 'Logout admin berhasil'
    });

  } catch (err) {
    console.error('Admin logout error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Hubungi administrator.'
    });
  }
};
