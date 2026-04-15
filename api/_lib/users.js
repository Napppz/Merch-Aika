const { query } = require('./_db');
const { requireAdmin } = require('./admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!requireAdmin(req, res)) {
    return;
  }

  try {
    const result = await query(
      'SELECT id, username, email, phone, verified, created_at FROM users ORDER BY created_at DESC'
    );
    
    return res.status(200).json({
      success: true,
      users: result.rows
    });
  } catch (err) {
    console.error('Fetch users error:', err.message);
    return res.status(500).json({ error: 'Terjadi kesalahan server', detail: err.message });
  }
};
