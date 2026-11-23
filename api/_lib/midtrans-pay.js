const { query } = require('./_db');
const { getRequiredEnv } = require('./env');
const { requireUserOrAdmin } = require('./user-auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { orderId } = req.body || {};

    if (!orderId) {
      return res.status(400).json({ error: 'Parameter orderId diperlukan' });
    }

    // Ambil data pesanan resmi dari database (jangan percaya amount/items dari client)
    const orderRes = await query(
      `SELECT id, "customerName", email, phone, total, items, status FROM orders WHERE id = $1`,
      [String(orderId).trim()]
    );
    if (!orderRes.rows.length) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    }

    const order = orderRes.rows[0];
    const auth = requireUserOrAdmin(req, res, order.email);
    if (!auth) return;

    if (!['pending', 'pending_payment'].includes(String(order.status || '').toLowerCase())) {
      return res.status(409).json({ error: 'Status pesanan tidak lagi mengizinkan pembuatan tagihan baru' });
    }

    const officialAmount = Math.round(Number(order.total) || 0);
    if (officialAmount <= 0) {
      return res.status(400).json({ error: 'Nominal pesanan tidak valid' });
    }

    const serverKey = getRequiredEnv('MIDTRANS_SERVER_KEY');
    const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';

    const apiUrl = isProd
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    let dbItems = [];
    try {
      dbItems = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
    } catch (_) {
      dbItems = [];
    }

    const itemDetails = dbItems.map(i => ({
      id: String(i.id || 'item').slice(0, 50),
      price: Math.max(0, Math.round(Number(i.price) || 0)),
      quantity: Math.max(1, parseInt(i.qty, 10) || 1),
      name: String(i.name || 'Produk').substring(0, 50)
    }));

    const calculatedSum = itemDetails.reduce((s, i) => s + (i.price * i.quantity), 0);
    const diff = officialAmount - calculatedSum;
    if (diff > 0) {
      itemDetails.push({
        id: 'ongkir',
        price: diff,
        quantity: 1,
        name: 'Biaya Pengiriman & Lainnya'
      });
    } else if (diff < 0) {
      // Gunakan satu baris ringkasan jika terdapat diskon agar cocok persis dengan gross_amount
      itemDetails.length = 0;
      itemDetails.push({
        id: String(order.id).slice(0, 50),
        price: officialAmount,
        quantity: 1,
        name: `Pesanan #${order.id}`.slice(0, 50)
      });
    }

    const payload = {
      transaction_details: {
        order_id: String(order.id),
        gross_amount: officialAmount
      },
      customer_details: {
        first_name: order.customerName || 'Pelanggan',
        email: order.email || 'buyer@example.com',
        phone: order.phone || ''
      },
      item_details: itemDetails
    };

    const authString = Buffer.from(serverKey + ':').toString('base64');

    const dtRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${authString}`
      },
      body: JSON.stringify(payload)
    });

    const dtData = await dtRes.json();

    if (dtRes.ok && dtData.token) {
      await query(`UPDATE orders SET status = 'pending_payment' WHERE id = $1`, [String(order.id)]);
      return res.status(200).json({ token: dtData.token, redirect_url: dtData.redirect_url });
    } else {
      console.error('Midtrans Rejected:', dtData);
      return res.status(400).json({ error: (dtData.error_messages ? dtData.error_messages[0] : 'Gagal membuat tagihan Midtrans') });
    }

  } catch (err) {
    console.error('Midtrans API Error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
