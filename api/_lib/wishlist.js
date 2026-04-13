const { query } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = req.headers['x-user-email'] || req.query.email;
  
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized: Missing email' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT product_id FROM wishlists WHERE user_email = $1', [email]);
      const productIds = rows.map(r => r.product_id);
      return res.status(200).json(productIds);
    } 
    
    else if (req.method === 'POST') {
      const { product_id } = req.body;
      
      const { rows } = await query(`
        INSERT INTO wishlists (user_email, product_id)
        VALUES ($1, $2)
        ON CONFLICT (user_email, product_id) DO NOTHING
        RETURNING *
      `, [email, product_id]);
      
      return res.status(201).json({ message: 'Added to wishlist', item: rows[0] });
    }

    else if (req.method === 'DELETE') {
      const { product_id } = req.query;
      
      await query('DELETE FROM wishlists WHERE user_email = $1 AND product_id = $2', [email, product_id]);
      return res.status(200).json({ message: 'Removed from wishlist' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Wishlist API error:', err);
    return res.status(500).json({ error: 'Gagal memproses wishlist.' });
  }
};
