const { query } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email parameter makes is required' });
  }

  try {
    const result = await query(
      `SELECT
         o.id,
         o."customerName",
         o.email,
         o.address,
         o.status,
         o.total,
         o.items,
         o.shipping,
         o.date,
         o.updated_at,
         r.id as review_id
       FROM orders o 
       LEFT JOIN reviews r ON r.order_id = o.id 
       WHERE LOWER(o.email) = $1 
       ORDER BY o.date DESC`,
      [email.toLowerCase()]
    );

    // Fetch all products to match gdrive_link securely
    const productsRes = await query(`SELECT id, gdrive_link, is_photopack, category FROM products`);
    const productMap = {};
    productsRes.rows.forEach(p => {
      productMap[p.id] = p;
    });

    const enrichedOrders = result.rows.map(order => {
      let items = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items) : []);
      const isVerified = ['paid', 'completed', 'shipped'].includes(String(order.status).toLowerCase());

      items = items.map(item => {
        const prod = productMap[item.id] || {};
        const isPhotopack = prod.is_photopack || prod.category === 'Photopack' || item.is_photopack || item.category === 'Photopack';

        if (isPhotopack) {
          if (isVerified) {
            return {
              ...item,
              is_photopack: true,
              gdrive_link: prod.gdrive_link || item.gdrive_link || null,
              gdrive_status: 'verified'
            };
          } else {
            return {
              ...item,
              is_photopack: true,
              gdrive_link: null, // Hidden until admin verification!
              gdrive_status: 'pending_verification'
            };
          }
        }
        return item;
      });

      return {
        ...order,
        items
      };
    });

    return res.status(200).json(enrichedOrders);
  } catch (err) {
    console.error('Fetch user orders error:', err.message);
    return res.status(500).json({ error: 'Terjadi kesalahan server', detail: err.message });
  }
};
