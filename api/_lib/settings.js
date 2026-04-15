const { Pool } = require('@neondatabase/serverless');
const { requireAdmin } = require('./admin-auth');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1yVLlBYH3qCM@ep-nameless-voice-ank083j1-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({ connectionString });

module.exports = async function handler(req, res) {
  try {
    // Pastikan tabel settings ada
    await pool.query(`CREATE TABLE IF NOT EXISTS settings (key VARCHAR(50) PRIMARY KEY, value TEXT);`);

    if (req.method === 'GET') {
      const result = await pool.query('SELECT * FROM settings');
      const settings = {};
      result.rows.forEach(row => {
        settings[row.key] = row.value;
      });
      return res.status(200).json(settings);
    } 
    
    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) {
        return;
      }
      const { hero_image } = req.body;
      if (hero_image) {
        await pool.query(
          `INSERT INTO settings (key, value) VALUES ('hero_image', $1) 
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
          [hero_image]
        );
      }
      return res.status(200).json({ message: 'Settings updated' });
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    console.error('Settings API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
