const { query } = require('./_db');
const { requireUserOrAdmin } = require('./user-auth');

let ensuredAddressColumns = false;

async function ensureAddressColumns() {
  if (ensuredAddressColumns) return;
  await query(`
    ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS province VARCHAR(100);
  `);
  ensuredAddressColumns = true;
}

function cleanStr(val, maxLen = 500) {
  if (val === null || val === undefined) return '';
  return String(val).trim().slice(0, maxLen);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = cleanStr(req.headers['x-user-email'] || req.query.email || req.body?.user_email, 255).toLowerCase();

  if (!email) {
    return res.status(401).json({ error: 'Unauthorized: Missing email' });
  }

  // 🔐 Keamanan: Wajibkan token autentikasi yang sah milik akun ini (atau admin)
  const auth = requireUserOrAdmin(req, res, email);
  if (!auth) return;

  try {
    await ensureAddressColumns();

    if (req.method === 'GET') {
      const { rows } = await query(`
        SELECT
          id,
          user_email,
          label,
          recipient_name,
          phone,
          province,
          city,
          postal_code,
          full_address,
          is_primary,
          created_at,
          updated_at
        FROM user_addresses
        WHERE LOWER(user_email) = LOWER($1)
        ORDER BY is_primary DESC, updated_at DESC, id DESC
      `, [email]);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const label = cleanStr(req.body?.label || 'Rumah', 100) || 'Rumah';
      const recipientName = cleanStr(req.body?.recipient_name, 150);
      const phone = cleanStr(req.body?.phone, 50);
      const province = cleanStr(req.body?.province, 100) || null;
      const city = cleanStr(req.body?.city, 100) || null;
      const postalCode = cleanStr(req.body?.postal_code, 20) || null;
      const fullAddress = cleanStr(req.body?.full_address || req.body?.address, 2000);
      let isPrimary = Boolean(req.body?.is_primary);

      if (!recipientName || !fullAddress) {
        return res.status(400).json({ error: 'Nama penerima dan alamat lengkap wajib diisi.' });
      }

      // Jika user belum punya alamat sama sekali, otomatis jadikan alamat utama
      const countRes = await query(
        'SELECT COUNT(*)::int AS total FROM user_addresses WHERE LOWER(user_email) = LOWER($1)',
        [email]
      );
      if ((countRes.rows[0]?.total || 0) === 0) {
        isPrimary = true;
      }

      if (isPrimary) {
        await query('UPDATE user_addresses SET is_primary = FALSE WHERE LOWER(user_email) = LOWER($1)', [email]);
      }

      const { rows } = await query(`
        INSERT INTO user_addresses (
          user_email, label, recipient_name, phone, province, city, postal_code, full_address, is_primary
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [email, label, recipientName, phone || null, province, city, postalCode, fullAddress, isPrimary]);

      return res.status(201).json({ message: 'Address added', address: rows[0] });
    }

    if (req.method === 'PUT') {
      const id = req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'ID alamat wajib disertakan.' });
      }

      // Ambil alamat eksisting agar mendukung partial update (mis. set primary cepat)
      const existingRes = await query(
        'SELECT * FROM user_addresses WHERE id = $1 AND LOWER(user_email) = LOWER($2)',
        [id, email]
      );
      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: 'Alamat tidak ditemukan.' });
      }
      const existing = existingRes.rows[0];

      const label = req.body?.label !== undefined ? (cleanStr(req.body.label, 100) || 'Rumah') : existing.label;
      const recipientName = req.body?.recipient_name !== undefined ? cleanStr(req.body.recipient_name, 150) : existing.recipient_name;
      const phone = req.body?.phone !== undefined ? (cleanStr(req.body.phone, 50) || null) : existing.phone;
      const province = req.body?.province !== undefined ? (cleanStr(req.body.province, 100) || null) : existing.province;
      const city = req.body?.city !== undefined ? (cleanStr(req.body.city, 100) || null) : existing.city;
      const postalCode = req.body?.postal_code !== undefined ? (cleanStr(req.body.postal_code, 20) || null) : existing.postal_code;
      const fullAddress = (req.body?.full_address !== undefined || req.body?.address !== undefined)
        ? cleanStr(req.body.full_address ?? req.body.address, 2000)
        : existing.full_address;
      const isPrimary = req.body?.is_primary !== undefined ? Boolean(req.body.is_primary) : Boolean(existing.is_primary);

      if (!recipientName || !fullAddress) {
        return res.status(400).json({ error: 'Nama penerima dan alamat lengkap wajib diisi.' });
      }

      if (isPrimary) {
        await query('UPDATE user_addresses SET is_primary = FALSE WHERE LOWER(user_email) = LOWER($1)', [email]);
      }

      const { rows } = await query(`
        UPDATE user_addresses
        SET label = $1,
            recipient_name = $2,
            phone = $3,
            province = $4,
            city = $5,
            postal_code = $6,
            full_address = $7,
            is_primary = $8,
            updated_at = NOW()
        WHERE id = $9 AND LOWER(user_email) = LOWER($10)
        RETURNING *
      `, [label, recipientName, phone, province, city, postalCode, fullAddress, isPrimary, id, email]);

      return res.status(200).json({ message: 'Address updated', address: rows[0] });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'ID alamat wajib disertakan.' });
      }

      const delRes = await query(
        'DELETE FROM user_addresses WHERE id = $1 AND LOWER(user_email) = LOWER($2) RETURNING is_primary',
        [id, email]
      );

      if (delRes.rows[0]?.is_primary) {
        await query(`
          UPDATE user_addresses
          SET is_primary = TRUE, updated_at = NOW()
          WHERE id = (
            SELECT id FROM user_addresses
            WHERE LOWER(user_email) = LOWER($1)
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
          )
        `, [email]);
      }

      return res.status(200).json({ message: 'Address deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Address API error:', err);
    return res.status(500).json({ error: 'Gagal memproses alamat.' });
  }
};
