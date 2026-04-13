const { query } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = req.headers['x-user-email'] || req.query.email;
  
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized: Missing email' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT avatar FROM users WHERE email = $1', [email]);
      if (rows.length && rows[0].avatar) {
          return res.status(200).json({ avatar: rows[0].avatar });
      }
      return res.status(404).json({ error: 'Avatar not found' });
    } 
    
    else if (req.method === 'POST') {
      // Body payload contains the base64 avatar (if replacing base64 localStorage)
      const { avatar } = req.body;
      
      const { rows } = await query(`
        UPDATE users SET avatar = $1, updated_at = NOW()
        WHERE email = $2
        RETURNING avatar
      `, [avatar, email]);
      
      return res.status(200).json({ message: 'Avatar updated', avatar: rows[0].avatar });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Avatar API error:', err);
    return res.status(500).json({ error: 'Gagal memproses avatar.' });
  }
};
