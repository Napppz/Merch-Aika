const { query } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email parameter makes is required' });
  }

  try {
    const result = await query(
      `SELECT o.*, 
       (SELECT r.id FROM reviews r WHERE r.order_id = o.id LIMIT 1) as review_id 
       FROM orders o 
       WHERE o.email = $1 
       ORDER BY o.date DESC`,
      [email]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Fetch user orders error:', err.message);
    return res.status(500).json({ error: 'Terjadi kesalahan server', detail: err.message });
  }
};
