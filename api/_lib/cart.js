const { query } = require('./_db');

let ensuredCartSizeSupport = false;

async function ensureCartSizeSupport() {
  if (ensuredCartSizeSupport) return;

  await query('ALTER TABLE carts ADD COLUMN IF NOT EXISTS size TEXT');
  await query('ALTER TABLE carts DROP CONSTRAINT IF EXISTS carts_user_product_unique');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS carts_user_product_size_unique ON carts (user_email, product_id, COALESCE(size, \'\'))');

  ensuredCartSizeSupport = true;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Basic auth - expect email in query or manual header for now (later upgrade to JWT)
  const email = req.headers['x-user-email'] || req.query.email;
  
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized: Missing email' });
  }

  try {
    await ensureCartSizeSupport();

    if (req.method === 'GET') {
      const { rows } = await query(`
        SELECT c.id as cart_id, p.id, p.name, p.price, p.image, p.sizes, c.quantity as qty, c.size
        FROM carts c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_email = $1
      `, [email]);
      return res.status(200).json(rows);
    } 
    
    else if (req.method === 'POST') {
      const { product_id, quantity, size } = req.body;
      const normalizedSize = typeof size === 'string' ? size.trim() : '';

      const existing = await query(`
        SELECT id, quantity
        FROM carts
        WHERE user_email = $1 AND product_id = $2 AND COALESCE(size, '') = $3
        LIMIT 1
      `, [email, product_id, normalizedSize]);

      let rows;
      if (existing.rows.length) {
        ({ rows } = await query(`
          UPDATE carts
          SET quantity = quantity + $1, size = $2, updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `, [quantity || 1, normalizedSize || null, existing.rows[0].id]));
      } else {
        ({ rows } = await query(`
          INSERT INTO carts (user_email, product_id, quantity, size)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [email, product_id, quantity || 1, normalizedSize || null]));
      }
      
      return res.status(200).json({ message: 'Item added to cart', item: rows[0] });
    }
    
    else if (req.method === 'PUT') {
        const { product_id, quantity, size } = req.body;
        const normalizedSize = typeof size === 'string' ? size.trim() : '';
        
        // Update specific quantity
        const { rows } = await query(`
          UPDATE carts SET quantity = $1, updated_at = NOW()
          WHERE user_email = $2 AND product_id = $3 AND COALESCE(size, '') = $4
          RETURNING *
        `, [quantity, email, product_id, normalizedSize]);
        
        return res.status(200).json({ message: 'Cart updated', item: rows[0] });
    }

    else if (req.method === 'DELETE') {
      const { product_id, size } = req.query;
      const normalizedSize = typeof size === 'string' ? size.trim() : '';
      
      if (product_id) {
          await query('DELETE FROM carts WHERE user_email = $1 AND product_id = $2 AND COALESCE(size, \'\') = $3', [email, product_id, normalizedSize]);
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
