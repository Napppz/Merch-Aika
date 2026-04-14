const db = require('./_db');
const { getCache, setCache, invalidateCache } = require('./cache');

module.exports = async (req, res) => {
  const { method } = req;
  
  try {
    if (method === 'GET') {
      // ✅ Try cache first (reduces database transfer by ~50%)
      const cached = getCache('products_all');
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cached);
      }

      res.setHeader('X-Cache', 'MISS');
      const { rows } = await db.query('SELECT * FROM products ORDER BY created_at DESC');
      
      // ✅ Cache for 1 hour (products don't change often)
      setCache('products_all', rows, 3600);
      return res.status(200).json(rows);
    } 
    
    if (method === 'POST') {
      const { id, name, category, description, price, oldPrice, stock, badge, image } = req.body;
      const { rows } = await db.query(
        `INSERT INTO products (id, name, category, description, price, "oldPrice", stock, badge, image) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, name, category, description, price, oldPrice, stock, badge, image]
      );
      
      // ✅ Invalidate cache when product added
      invalidateCache('products_*');
      return res.status(201).json(rows[0]);
    }

    if (method === 'PUT') {
      const { id, name, category, description, price, oldPrice, stock, badge, image } = req.body;
      const { rows } = await db.query(
        `UPDATE products SET name = $1, category = $2, description = $3, price = $4, "oldPrice" = $5, stock = $6, badge = $7, image = $8 
         WHERE id = $9 RETURNING *`,
        [name, category, description, price, oldPrice, stock, badge, image, id]
      );
      
      // ✅ Invalidate cache when product updated
      invalidateCache('products_*');
      return res.status(200).json(rows[0]);
    }

    if (method === 'DELETE') {
      const { id } = req.query;
      await db.query(`DELETE FROM products WHERE id = $1`, [id]);
      
      // ✅ Invalidate cache when product deleted
      invalidateCache('products_*');
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
