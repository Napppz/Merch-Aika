const db = require('./_db');
const { invalidateCache } = require('./cache');
const { requireAdmin, verifyAdminToken } = require('./admin-auth');
const { expireStalePendingOrders } = require('./order-lifecycle');

let ensuredColumns = false;

async function ensureProductColumns() {
  if (ensuredColumns) return;
  await db.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS tag TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS gdrive_link TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS cosplayer_name VARCHAR(100);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_photopack BOOLEAN DEFAULT FALSE;
  `);
  ensuredColumns = true;
}

function isSafeImageSrc(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(javascript|vbscript|file):/i.test(trimmed)) return false;
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith('/') || trimmed.startsWith('images/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return true;
  return false;
}

function normalizeProductImages(imagesInput, fallbackImage) {
  let rawList = [];
  if (Array.isArray(imagesInput)) {
    rawList = imagesInput;
  } else if (typeof imagesInput === 'string' && imagesInput.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(imagesInput);
      if (Array.isArray(parsed)) rawList = parsed;
    } catch (_) {
      rawList = [];
    }
  }

  const seen = new Set();
  const cleaned = [];

  for (const candidate of rawList) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!isSafeImageSrc(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
    if (cleaned.length >= 12) break;
  }

  const fallback = typeof fallbackImage === 'string' ? fallbackImage.trim() : '';
  if (cleaned.length === 0 && isSafeImageSrc(fallback)) {
    cleaned.push(fallback);
  }

  const primaryImage = cleaned[0] || '';
  return {
    primaryImage,
    imagesArray: cleaned
  };
}

function formatProductRow(row) {
  if (!row) return row;
  const { primaryImage, imagesArray } = normalizeProductImages(row.images, row.image);
  return {
    ...row,
    image: primaryImage || row.image || '',
    images: imagesArray
  };
}

module.exports = async (req, res) => {
  const { method } = req;
  
  try {
    await ensureProductColumns();

    if (method === 'GET') {
      // Pulihkan stok dari pesanan 'pending' tanpa bukti bayar yang sudah lewat 24 jam
      await expireStalePendingOrders();

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const adminUser = verifyAdminToken(req);
      const isAdminReq = req.query.admin === 'true' && !!adminUser;

      const selectFields = isAdminReq
        ? `id, name, category, description, price, "oldPrice", stock, badge, image, images, sizes, tag, gdrive_link, cosplayer_name, is_photopack, created_at`
        : `id, name, category, description, price, "oldPrice", stock, badge, image, images, sizes, tag, cosplayer_name, is_photopack, created_at`;

      const { rows } = await db.query(`
        SELECT ${selectFields}
        FROM products
        ORDER BY created_at DESC
      `);
      
      return res.status(200).json(rows.map(formatProductRow));
    } 
    
    if (method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const { id, name, category, description, price, oldPrice, stock, badge, image, images, sizes, tag, gdrive_link, cosplayer_name, is_photopack } = req.body;
      
      const isPhotopackBool = is_photopack === true || is_photopack === 'true' || category === 'Photopack';
      const { primaryImage, imagesArray } = normalizeProductImages(images, image);

      const { rows } = await db.query(
        `INSERT INTO products (id, name, category, description, price, "oldPrice", stock, badge, image, images, sizes, tag, gdrive_link, cosplayer_name, is_photopack) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15) RETURNING *`,
        [
          id, name, category, description, price, oldPrice, stock, badge, primaryImage, JSON.stringify(imagesArray), sizes || null,
          tag || null, gdrive_link || null, cosplayer_name || null, isPhotopackBool
        ]
      );
      
      invalidateCache('products_*');
      return res.status(201).json(formatProductRow(rows[0]));
    }

    if (method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const { id, name, category, description, price, oldPrice, stock, badge, image, images, sizes, tag, gdrive_link, cosplayer_name, is_photopack } = req.body;
      
      const isPhotopackBool = is_photopack === true || is_photopack === 'true' || category === 'Photopack';
      const { primaryImage, imagesArray } = normalizeProductImages(images, image);

      const { rows } = await db.query(
        `UPDATE products 
         SET name = $1, category = $2, description = $3, price = $4, "oldPrice" = $5, stock = $6, badge = $7, image = $8, images = $9::jsonb, sizes = $10,
             tag = $11, gdrive_link = $12, cosplayer_name = $13, is_photopack = $14, updated_at = NOW()
         WHERE id = $15 RETURNING *`,
        [
          name, category, description, price, oldPrice, stock, badge, primaryImage, JSON.stringify(imagesArray), sizes || null,
          tag || null, gdrive_link || null, cosplayer_name || null, isPhotopackBool, id
        ]
      );
      
      invalidateCache('products_*');
      return res.status(200).json(formatProductRow(rows[0]));
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
