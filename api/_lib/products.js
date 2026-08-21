const db = require('./_db');
const { getCache, setCache, invalidateCache } = require('./cache');
const { requireAdmin } = require('./admin-auth');

let ensuredColumns = false;

async function ensureProductColumns() {
  if (ensuredColumns) return;
  await db.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS gdrive_link TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS cosplayer_name VARCHAR(100);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_photopack BOOLEAN DEFAULT FALSE;
  `);
  ensuredColumns = true;
}

module.exports = async (req, res) => {
  const { method } = req;
  
  try {
    await ensureProductColumns();

    if (method === 'GET') {
      const isAdminReq = req.query.admin === 'true';
      
      // ✅ Try cache first for public GET requests
      if (!isAdminReq) {
        const cached = getCache('products_all');
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          return res.status(200).json(cached);
        }
      }

      res.setHeader('X-Cache', 'MISS');
      const selectFields = isAdminReq
        ? `id, name, category, description, price, "oldPrice", stock, badge, image, sizes, gdrive_link, cosplayer_name, is_photopack, created_at`
        : `id, name, category, description, price, "oldPrice", stock, badge, image, sizes, cosplayer_name, is_photopack, created_at`;

      const { rows } = await db.query(`
        SELECT ${selectFields}
        FROM products
        ORDER BY created_at DESC
      `);
      
      if (!isAdminReq) {
        setCache('products_all', rows, 3600);
      }
      return res.status(200).json(rows);
    } 
    
    if (method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const { id, name, category, description, price, oldPrice, stock, badge, image, sizes, gdrive_link, cosplayer_name, is_photopack } = req.body;
      
      const isPhotopackBool = is_photopack === true || is_photopack === 'true' || category === 'Photopack';

      const { rows } = await db.query(
        `INSERT INTO products (id, name, category, description, price, "oldPrice", stock, badge, image, sizes, gdrive_link, cosplayer_name, is_photopack) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          id, name, category, description, price, oldPrice, stock, badge, image, sizes || null,
          gdrive_link || null, cosplayer_name || null, isPhotopackBool
        ]
      );
      
      invalidateCache('products_*');
      return res.status(201).json(rows[0]);
    }

    if (method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const { id, name, category, description, price, oldPrice, stock, badge, image, sizes, gdrive_link, cosplayer_name, is_photopack } = req.body;
      
      const isPhotopackBool = is_photopack === true || is_photopack === 'true' || category === 'Photopack';

      const { rows } = await db.query(
        `UPDATE products 
         SET name = $1, category = $2, description = $3, price = $4, "oldPrice" = $5, stock = $6, badge = $7, image = $8, sizes = $9,
             gdrive_link = $10, cosplayer_name = $11, is_photopack = $12
         WHERE id = $13 RETURNING *`,
        [
          name, category, description, price, oldPrice, stock, badge, image, sizes || null,
          gdrive_link || null, cosplayer_name || null, isPhotopackBool, id
        ]
      );
      
      invalidateCache('products_*');
      return res.status(200).json(rows[0]);
    }

    if (method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const { id } = req.query;
      await db.query(`DELETE FROM products WHERE id = $1`, [id]);
      
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
