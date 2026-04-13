const { query } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Basic auth - expect email in query or manual header for now (later upgrade to JWT)
  const email = req.headers['x-user-email'] || req.query.email;
  
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized: Missing email' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await query(`
        SELECT c.id as cart_id, p.id, p.name, p.price, p.image, c.quantity as qty
        FROM carts c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_email = $1
      `, [email]);
      return res.status(200).json(rows);
    } 
    
    else if (req.method === 'POST') {
      const { product_id, quantity } = req.body;
      
      // Upsert cart item
      const { rows } = await query(`
        INSERT INTO carts (user_email, product_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_email, product_id)
        DO UPDATE SET quantity = carts.quantity + EXCLUDED.quantity, updated_at = NOW()
        RETURNING *
      `, [email, product_id, quantity || 1]);
      
      return res.status(200).json({ message: 'Item added to cart', item: rows[0] });
    }
    
    else if (req.method === 'PUT') {
        const { product_id, quantity } = req.body;
        
        // Update specific quantity
        const { rows } = await query(`
          UPDATE carts SET quantity = $1, updated_at = NOW()
          WHERE user_email = $2 AND product_id = $3
          RETURNING *
        `, [quantity, email, product_id]);
        
        return res.status(200).json({ message: 'Cart updated', item: rows[0] });
    }

    else if (req.method === 'DELETE') {
      const { product_id } = req.query;
      
      if (product_id) {
          await query('DELETE FROM carts WHERE user_email = $1 AND product_id = $2', [email, product_id]);
          return res.status(200).json({ message: 'Item removed from cart' });
      } else {
          // Clear cart
          await query('DELETE FROM carts WHERE user_email = $1', [email]);
          return res.status(200).json({ message: 'Cart cleared' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Cart API error:', err);
    return res.status(500).json({ error: 'Gagal memproses keranjang.' });
  }
};
