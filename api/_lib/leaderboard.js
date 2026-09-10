const { query } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const limit = parseInt(req.query.limit) || 10;
      
      // Fetch top buyers - aggregate by email and username
      const result = await query(`
        SELECT 
          u.email,
          u.username,
          u.avatar,
          COUNT(o.id) as total_orders,
          SUM(o.total) as total_spent,
          SUM((SELECT COUNT(*) FROM jsonb_array_elements(o.items))) as total_items,
          MAX(o.date) as last_order_date
        FROM orders o
        LEFT JOIN users u ON u.email = o.email
        WHERE o.status IN ('paid', 'shipped', 'completed')
        GROUP BY u.email, u.username, u.avatar
        ORDER BY total_spent DESC, total_orders DESC
        LIMIT $1
      `, [limit]);

function maskEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2 ? name[0] + '***' : name.slice(0, 2) + '***' + name.slice(-1);
  return `${maskedName}@${domain}`;
}

      const leaderboard = result.rows.map((row, index) => ({
        rank: index + 1,
        email: maskEmail(row.email),
        username: row.username || 'Anonymous',
        avatar: row.avatar || null,
        total_spent: parseInt(row.total_spent) || 0,
        total_orders: parseInt(row.total_orders) || 0,
        total_items: parseInt(row.total_items) || 0,
        last_order_date: row.last_order_date
      }));

      return res.status(200).json({
        success: true,
        count: leaderboard.length,
        data: leaderboard
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('Leaderboard API error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
