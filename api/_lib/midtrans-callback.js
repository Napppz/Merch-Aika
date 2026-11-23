const crypto = require('crypto');
const { query } = require('./_db');
const { createMailTransport, getRequiredEnv } = require('./env');
const { escapeHtml } = require('./order-lifecycle');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const data = req.body || {};

    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = data;
    if (!order_id || !status_code || !gross_amount || !signature_key) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    const serverKey = getRequiredEnv('MIDTRANS_SERVER_KEY');

    // SHA512(order_id+status_code+gross_amount+ServerKey)
    const signatureStr = String(order_id) + String(status_code) + String(gross_amount) + serverKey;
    const calcSignature = crypto.createHash('sha512').update(signatureStr).digest('hex');

    // Validasi Signature menggunakan constant-time comparison
    const calcBuf = Buffer.from(calcSignature, 'utf8');
    const providedBuf = Buffer.from(String(signature_key), 'utf8');
    if (calcBuf.length !== providedBuf.length || !crypto.timingSafeEqual(calcBuf, providedBuf)) {
      return res.status(400).json({ error: 'Bad Signature' });
    }

    // Pastikan order ada di DB dan nominal gross_amount cocok dengan total pesanan
    const oRes = await query('SELECT * FROM orders WHERE id = $1', [String(order_id)]);
    if (!oRes.rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const ord = oRes.rows[0];
    const paidAmount = Math.round(Number(gross_amount) || 0);
    const expectedTotal = Math.round(Number(ord.total) || 0);
    if (paidAmount !== expectedTotal) {
      console.error(`[MIDTRANS] Amount mismatch for ${order_id}: paid=${paidAmount}, expected=${expectedTotal}`);
      return res.status(400).json({ error: 'Amount mismatch' });
    }

    const isSettled = transaction_status === 'settlement'
      || (transaction_status === 'capture' && (!fraud_status || fraud_status === 'accept'));

    if (isSettled) {
      await query(`UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1`, [String(order_id)]);

      // Kirim Notifikasi
      try {
        const recipientEmail = ord.email || (ord.contact && ord.contact.email);
        if (recipientEmail) {
          const transporter = createMailTransport();
          const parsedItems = Array.isArray(ord.items) ? ord.items : (typeof ord.items === 'string' ? JSON.parse(ord.items || '[]') : Object.values(ord.items || {}));
          const itemsHtml = parsedItems.map(i => `<li>${escapeHtml(i.name || 'Produk')} (x${parseInt(i.qty, 10) || 1}) - Rp ${(parseInt(i.price, 10) || 0).toLocaleString('id-ID')}</li>`).join('');
          const safeName = escapeHtml(ord.customerName || (ord.contact && ord.contact.name) || 'Pelanggan');
          await transporter.sendMail({
            from: `"Aika Sesilia" <${getRequiredEnv('EMAIL_USER')}>`,
            to: recipientEmail,
            subject: 'Pembayaran Diterima - Aika Sesilia',
            html: `<h2>Terima Kasih, ${safeName}!</h2>
                  <p>Pembayaran Anda untuk Order <b>#${escapeHtml(order_id)}</b> telah kami terima dan pesanan Anda sedang kami kemas.</p>
                  <h3>Detail Pesanan:</h3><ul>${itemsHtml}</ul>
                  <p>Total: Rp ${paidAmount.toLocaleString('id-ID')}</p>`
          });
        }
      } catch (e) {
        console.error('Info Email Midtrans Err:', e.message);
      }
    } else if (transaction_status === 'cancel' || transaction_status === 'expire' || transaction_status === 'deny') {
      await query(`UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [String(order_id)]);
    }

    return res.status(200).json({ success: true, message: 'Midtrans Webhook Received' });

  } catch (err) {
    console.error('Midtrans Callback Error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
