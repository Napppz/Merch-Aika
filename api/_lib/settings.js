const { requireAdmin } = require('./admin-auth');
const db = require('./_db');
const { hasR2Config, parseDataUrlImage, uploadImageBuffer } = require('./r2-storage');

module.exports = async function handler(req, res) {
  try {
    // Pastikan tabel settings ada
    await db.query(`CREATE TABLE IF NOT EXISTS settings (key VARCHAR(50) PRIMARY KEY, value TEXT);`);

    if (req.method === 'GET') {
      const result = await db.query('SELECT key, value FROM settings');
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
        let heroImageValue = hero_image;

        if (typeof hero_image === 'string' && hero_image.startsWith('data:image/') && hasR2Config()) {
          const { buffer, mimeType } = parseDataUrlImage(hero_image);
          const uploaded = await uploadImageBuffer({
            buffer,
            mimeType,
            fileName: 'hero-image',
            folder: 'settings',
            prefix: 'hero'
          });
          heroImageValue = uploaded.imageUrl;
        }

        await db.query(
          `INSERT INTO settings (key, value) VALUES ('hero_image', $1) 
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
          [heroImageValue]
        );
        return res.status(200).json({ message: 'Settings updated', hero_image: heroImageValue });
      }
      return res.status(200).json({ message: 'Settings updated' });
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    console.error('Settings API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
