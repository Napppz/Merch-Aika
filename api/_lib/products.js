const db = require('./_db');

module.exports = async (req, res) => {
  const { method } = req;
  
  try {
    if (method === 'GET') {
      const { rows } = await db.query('SELECT * FROM products ORDER BY created_at DESC');
      return res.status(200).json(rows);
    } 
    
    if (method === 'POST') {
      const { id, name, category, description, price, oldPrice, stock, badge, image } = req.body;
      const { rows } = await db.query(
        `INSERT INTO products (id, name, category, description, price, "oldPrice", stock, badge, image) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, name, category, description, price, oldPrice, stock, badge, image]
      );
      return res.status(201).json(rows[0]);
    }

    if (method === 'PUT') {
      const { id, name, category, description, price, oldPrice, stock, badge, image } = req.body;
      const { rows } = await db.query(
        `UPDATE products SET name = $1, category = $2, description = $3, price = $4, "oldPrice" = $5, stock = $6, badge = $7, image = $8 
         WHERE id = $9 RETURNING *`,
        [name, category, description, price, oldPrice, stock, badge, image, id]
      );
      return res.status(200).json(rows[0]);
    }

    if (method === 'DELETE') {
      const { id } = req.query;
      await db.query(`DELETE FROM products WHERE id = $1`, [id]);
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
