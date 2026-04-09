const db = require('./_db');

module.exports = async (req, res) => {
  const { method } = req;
  
  try {
    if (method === 'GET') {
      const { rows } = await db.query('SELECT * FROM orders ORDER BY date DESC');
      return res.status(200).json(rows);
    } 
    
    if (method === 'POST') {
      const { id, customerName, email, address, status, total, items, shipping } = req.body;
      const { rows } = await db.query(
        `INSERT INTO orders (id, "customerName", email, address, status, total, items, shipping) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, customerName, email, address, status, total, typeof items === 'string' ? items : JSON.stringify(items), typeof shipping === 'string' ? shipping : JSON.stringify(shipping)]
      );
      return res.status(201).json(rows[0]);
    }

    if (method === 'PUT') {
      const { id, status } = req.body;
      const { rows } = await db.query(
        `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`,
        [status, id]
      );
      return res.status(200).json(rows[0]);
    }

    if (method === 'DELETE') {
      const { id } = req.query;
      if (id === 'ALL') {
        await db.query(`DELETE FROM orders`);
      } else {
        await db.query(`DELETE FROM orders WHERE id = $1`, [id]);
      }
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
