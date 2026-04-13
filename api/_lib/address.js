const { query } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = req.headers['x-user-email'] || req.query.email;
  
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized: Missing email' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT * FROM user_addresses WHERE user_email = $1 ORDER BY is_primary DESC, created_at DESC', [email]);
      return res.status(200).json(rows);
    } 
    
    else if (req.method === 'POST') {
      const { label, recipient_name, phone, full_address, city, postal_code, is_primary } = req.body;
      
      // Jika set primary, pastikan yang lain di false
      if (is_primary) {
        await query('UPDATE user_addresses SET is_primary = FALSE WHERE user_email = $1', [email]);
      }

      const { rows } = await query(`
        INSERT INTO user_addresses (user_email, label, recipient_name, phone, full_address, city, postal_code, is_primary)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [email, label, recipient_name, phone, full_address, city, postal_code, is_primary || false]);
      
      return res.status(201).json({ message: 'Address added', address: rows[0] });
    }
    
    else if (req.method === 'PUT') {
        const { id, label, recipient_name, phone, full_address, city, postal_code, is_primary } = req.body;
        
        if (is_primary) {
            await query('UPDATE user_addresses SET is_primary = FALSE WHERE user_email = $1', [email]);
        }
        
        const { rows } = await query(`
          UPDATE user_addresses 
          SET label = $1, recipient_name = $2, phone = $3, full_address = $4, city = $5, postal_code = $6, is_primary = $7, updated_at = NOW()
          WHERE id = $8 AND user_email = $9
          RETURNING *
        `, [label, recipient_name, phone, full_address, city, postal_code, is_primary || false, id, email]);
        
        return res.status(200).json({ message: 'Address updated', address: rows[0] });
    }

    else if (req.method === 'DELETE') {
      const { id } = req.query;
      
      await query('DELETE FROM user_addresses WHERE id = $1 AND user_email = $2', [id, email]);
      return res.status(200).json({ message: 'Address deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Address API error:', err);
    return res.status(500).json({ error: 'Gagal memproses alamat.' });
  }
};
