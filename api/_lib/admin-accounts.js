const crypto = require('crypto');
const db = require('./_db');
const { requireFullAdmin } = require('./admin-auth');
const { getPasswordSalt } = require('./env');

function hashPassword(password) {
  const salt = getPasswordSalt();
  return crypto.createHmac('sha256', salt).update(String(password)).digest('hex');
}

async function ensureAdminsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'superadmin',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      last_login TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

function normalizeUsername(raw) {
  return String(raw || '').trim();
}

function validateUsername(username) {
  if (!username || username.length < 3 || username.length > 40) {
    return 'Username minimal 3 karakter dan maksimal 40 karakter.';
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return 'Username hanya boleh berisi huruf, angka, titik (.), underscore (_), atau strip (-).';
  }
  const superUsername = String(process.env.ADMIN_USERNAME || 'Aika').trim().toLowerCase();
  if (username.toLowerCase() === superUsername) {
    return 'Username tersebut sudah dipakai untuk akun Superadmin.';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password minimal 8 karakter.';
  }
  if (password.length > 128) {
    return 'Password maksimal 128 karakter.';
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const superAdmin = requireFullAdmin(req, res);
  if (!superAdmin) return;

  try {
    await ensureAdminsTable();

    if (req.method === 'GET') {
      const { rows } = await db.query(
        `SELECT id, username, role, status, last_login, created_at, updated_at
         FROM admins
         WHERE role = 'nobar_admin'
         ORDER BY id ASC`
      );
      return res.status(200).json({
        success: true,
        accounts: rows
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const username = normalizeUsername(body.username);
      const password = body.password;

      const userErr = validateUsername(username);
      if (userErr) {
        return res.status(400).json({ success: false, message: userErr });
      }

      const passErr = validatePassword(password);
      if (passErr) {
        return res.status(400).json({ success: false, message: passErr });
      }

      const existing = await db.query(
        'SELECT id, role FROM admins WHERE LOWER(username) = LOWER($1) LIMIT 1',
        [username]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Username "${username}" sudah terdaftar.`
        });
      }

      const passwordHash = hashPassword(password);
      const inserted = await db.query(
        `INSERT INTO admins (username, password_hash, role, status, created_at, updated_at)
         VALUES ($1, $2, 'nobar_admin', 'active', NOW(), NOW())
         RETURNING id, username, role, status, last_login, created_at, updated_at`,
        [username, passwordHash]
      );

      return res.status(201).json({
        success: true,
        message: `Akun Admin Nobar "${username}" berhasil dibuat.`,
        account: inserted.rows[0]
      });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const accountId = parseInt(body.id, 10);
      if (!Number.isFinite(accountId) || accountId <= 0) {
        return res.status(400).json({ success: false, message: 'ID akun tidak valid.' });
      }

      const existing = await db.query(
        'SELECT id, username, role, status FROM admins WHERE id = $1 LIMIT 1',
        [accountId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Akun admin tidak ditemukan.' });
      }

      const target = existing.rows[0];
      if (target.role !== 'nobar_admin') {
        return res.status(403).json({
          success: false,
          message: 'Hanya akun Panitia / Admin Nobar yang dapat diubah melalui menu ini.'
        });
      }

      const updates = [];
      const params = [];

      if (body.status !== undefined) {
        const nextStatus = String(body.status).trim().toLowerCase();
        if (nextStatus !== 'active' && nextStatus !== 'inactive') {
          return res.status(400).json({ success: false, message: 'Status akun harus active atau inactive.' });
        }
        params.push(nextStatus);
        updates.push(`status = $${params.length}`);
      }

      if (body.newPassword !== undefined && body.newPassword !== '') {
        const passErr = validatePassword(body.newPassword);
        if (passErr) {
          return res.status(400).json({ success: false, message: passErr });
        }
        params.push(hashPassword(body.newPassword));
        updates.push(`password_hash = $${params.length}`);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Tidak ada perubahan yang dikirim (isi status atau password baru).'
        });
      }

      params.push(accountId);
      const updated = await db.query(
        `UPDATE admins
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING id, username, role, status, last_login, created_at, updated_at`,
        params
      );

      const actionLabel = body.newPassword
        ? `Password akun "${target.username}" berhasil diperbarui.`
        : `Status akun "${target.username}" diubah menjadi ${updated.rows[0].status === 'active' ? 'Aktif' : 'Nonaktif'}.`;

      return res.status(200).json({
        success: true,
        message: actionLabel,
        account: updated.rows[0]
      });
    }

    if (req.method === 'DELETE') {
      const rawId = (req.query && req.query.id) || (req.body && req.body.id);
      const accountId = parseInt(rawId, 10);
      if (!Number.isFinite(accountId) || accountId <= 0) {
        return res.status(400).json({ success: false, message: 'ID akun tidak valid.' });
      }

      const existing = await db.query(
        'SELECT id, username, role FROM admins WHERE id = $1 LIMIT 1',
        [accountId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Akun admin tidak ditemukan.' });
      }
      if (existing.rows[0].role !== 'nobar_admin') {
        return res.status(403).json({
          success: false,
          message: 'Akun Superadmin tidak dapat dihapus.'
        });
      }

      await db.query("DELETE FROM admins WHERE id = $1 AND role = 'nobar_admin'", [accountId]);
      return res.status(200).json({
        success: true,
        message: `Akun Admin Nobar "${existing.rows[0].username}" berhasil dihapus.`
      });
    }

    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  } catch (err) {
    console.error('[API /api/admin-accounts Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat mengelola akun admin.'
    });
  }
};
