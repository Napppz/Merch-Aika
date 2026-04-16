const db = require('./_db');
const { requireAdmin } = require('./admin-auth');

const SETTINGS_KEY = 'vouchers';

function normalizeCode(code = '') {
  return String(code).trim().toUpperCase();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeVoucher(input = {}) {
  const code = normalizeCode(input.code);
  const type = input.type === 'percent' ? 'percent' : 'fixed';
  const label = String(input.label || code).trim();
  const description = String(input.description || '').trim();
  const value = Math.max(0, parseInt(input.value, 10) || 0);
  const minPurchase = Math.max(0, parseInt(input.minPurchase, 10) || 0);
  const maxDiscount = input.maxDiscount === '' || input.maxDiscount == null
    ? null
    : Math.max(0, parseInt(input.maxDiscount, 10) || 0);
  const startsAt = parseDate(input.startsAt)?.toISOString() || null;
  const expiresAt = parseDate(input.expiresAt)?.toISOString() || null;
  const isActive = input.isActive !== false;

  return {
    code,
    label,
    description,
    type,
    value,
    minPurchase,
    maxDiscount,
    startsAt,
    expiresAt,
    isActive,
    updatedAt: new Date().toISOString()
  };
}

function validateVoucher(voucher) {
  if (!voucher.code) return 'Kode voucher wajib diisi';
  if (!/^[A-Z0-9_-]{3,30}$/.test(voucher.code)) {
    return 'Kode voucher hanya boleh huruf, angka, strip, atau underscore';
  }
  if (!voucher.label) return 'Label voucher wajib diisi';
  if (voucher.value <= 0) return 'Nilai voucher harus lebih dari 0';
  if (voucher.type === 'percent' && voucher.value > 100) {
    return 'Voucher persen maksimal 100';
  }
  if (voucher.startsAt && voucher.expiresAt && new Date(voucher.startsAt) > new Date(voucher.expiresAt)) {
    return 'Tanggal mulai tidak boleh melebihi tanggal berakhir';
  }
  return null;
}

function isVoucherActive(voucher, now = new Date()) {
  if (!voucher || voucher.isActive === false) return false;
  const startsAt = parseDate(voucher.startsAt);
  const expiresAt = parseDate(voucher.expiresAt);
  if (startsAt && startsAt > now) return false;
  if (expiresAt && expiresAt < now) return false;
  return true;
}

function toPublicVoucher(voucher) {
  return {
    code: voucher.code,
    label: voucher.label,
    description: voucher.description,
    type: voucher.type,
    value: voucher.value,
    minPurchase: voucher.minPurchase || 0,
    maxDiscount: voucher.maxDiscount ?? null,
    startsAt: voucher.startsAt,
    expiresAt: voucher.expiresAt,
    isActive: voucher.isActive !== false
  };
}

async function ensureSettingsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(50) PRIMARY KEY,
      value TEXT
    );
  `);
}

async function getStoredVouchers() {
  await ensureSettingsTable();
  const result = await db.query('SELECT value FROM settings WHERE key = $1', [SETTINGS_KEY]);
  if (!result.rows.length) return [];

  try {
    const parsed = JSON.parse(result.rows[0].value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function saveStoredVouchers(vouchers) {
  await db.query(
    `INSERT INTO settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SETTINGS_KEY, JSON.stringify(vouchers)]
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const authResult = requireAdmin(req, {
        status: () => ({ json: () => null })
      });

      const vouchers = await getStoredVouchers();
      const sorted = vouchers.sort((a, b) => a.code.localeCompare(b.code));

      if (authResult) {
        return res.status(200).json({ success: true, vouchers: sorted });
      }

      const active = sorted.filter(voucher => isVoucherActive(voucher)).map(toPublicVoucher);
      return res.status(200).json({ success: true, vouchers: active });
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) return;

      const voucher = sanitizeVoucher(req.body || {});
      const validationError = validateVoucher(voucher);
      if (validationError) {
        return res.status(400).json({ success: false, error: validationError });
      }

      const vouchers = await getStoredVouchers();
      if (vouchers.some(item => normalizeCode(item.code) === voucher.code)) {
        return res.status(400).json({ success: false, error: 'Kode voucher sudah ada' });
      }

      vouchers.push({
        ...voucher,
        createdAt: new Date().toISOString()
      });
      await saveStoredVouchers(vouchers);

      return res.status(201).json({ success: true, voucher });
    }

    if (req.method === 'PUT') {
      if (!requireAdmin(req, res)) return;

      const voucher = sanitizeVoucher(req.body || {});
      const validationError = validateVoucher(voucher);
      if (validationError) {
        return res.status(400).json({ success: false, error: validationError });
      }

      const vouchers = await getStoredVouchers();
      const index = vouchers.findIndex(item => normalizeCode(item.code) === voucher.code);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'Voucher tidak ditemukan' });
      }

      vouchers[index] = {
        ...vouchers[index],
        ...voucher
      };
      await saveStoredVouchers(vouchers);

      return res.status(200).json({ success: true, voucher: vouchers[index] });
    }

    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;

      const code = normalizeCode(req.query.code || req.body?.code || '');
      if (!code) {
        return res.status(400).json({ success: false, error: 'Kode voucher wajib diisi' });
      }

      const vouchers = await getStoredVouchers();
      const filtered = vouchers.filter(item => normalizeCode(item.code) !== code);
      if (filtered.length === vouchers.length) {
        return res.status(404).json({ success: false, error: 'Voucher tidak ditemukan' });
      }

      await saveStoredVouchers(filtered);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Vouchers API Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
