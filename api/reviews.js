const db = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { rows } = await db.query('SELECT * FROM reviews ORDER BY date DESC LIMIT 10');
      return res.status(200).json(rows);
    } 
    
    if (req.method === 'POST') {
      const { order_id, customer_name, rating, comment } = req.body;
      
      if (!order_id || !rating) {
        return res.status(400).json({ error: 'Order ID dan Rating wajib diisi' });
      }

      // Check if order is already reviewed
      const existing = await db.query('SELECT id FROM reviews WHERE order_id = $1', [order_id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Pesanan ini sudah diulas' });
      }

      const { rows } = await db.query(
        `INSERT INTO reviews (order_id, customer_name, rating, comment) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [order_id, customer_name || 'Anonymous', parseInt(rating), comment || '']
      );
      
      return res.status(201).json(rows[0]);
    }

    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
