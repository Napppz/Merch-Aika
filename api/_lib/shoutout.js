const { query } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      // Submit/Create shoutout
      const { name, message, email } = req.body;
      
      if (!name || !message || !email) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
      }

      if (message.length < 10 || message.length > 500) {
        return res.status(400).json({ error: 'Pesan harus 10-500 karakter' });
      }

      // Create shoutouts table if not exists
      await query(`
        CREATE TABLE IF NOT EXISTS shoutouts (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          email VARCHAR(255),
          avatar LONGTEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'pending'
        )
      `);

      // Insert shoutout
      const result = await query(
        `INSERT INTO shoutouts (name, message, email, status)
         VALUES ($1, $2, $3, 'approved')
         RETURNING *`,
        [name, message, email]
      );

      return res.status(201).json({
        success: true,
        message: 'Ucapan berhasil disimpan',
        data: result.rows[0]
      });

    } else if (req.method === 'GET') {
      // Get shoutouts
      const limit = parseInt(req.query.limit) || 20;
      
      // Create table if not exists
      await query(`
        CREATE TABLE IF NOT EXISTS shoutouts (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          email VARCHAR(255),
          avatar LONGTEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'pending'
        )
      `);

      const result = await query(
        `SELECT * FROM shoutouts 
         WHERE status = 'approved'
         ORDER BY created_at DESC 
         LIMIT $1`,
        [limit]
      );

      return res.status(200).json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('Shoutout API error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
