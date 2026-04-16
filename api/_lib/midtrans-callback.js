const crypto = require('crypto');
const { query } = require('./_db');
const { createMailTransport, getRequiredEnv } = require('./env');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const data = req.body;
    
    const { order_id, status_code, gross_amount, signature_key, transaction_status } = data;

    const serverKey = getRequiredEnv('MIDTRANS_SERVER_KEY');

    // SHA512(order_id+status_code+gross_amount+ServerKey)
    const signatureStr = order_id + status_code + gross_amount + serverKey;
    const calcSignature = crypto.createHash('sha512').update(signatureStr).digest('hex');

    // Validasi Signature
    if (calcSignature !== signature_key) {
      return res.status(400).json({ error: 'Bad Signature' });
    }

    // Logika Status
    let newStatus = 'pending_payment';
    
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      newStatus = 'Dikemas';
      
      await query(`UPDATE orders SET status = $1 WHERE id = $2`, [newStatus, order_id]);
      
      // Kirim Notifikasi (Biarkan yang lama)
      try {
        const oRes = await query('SELECT * FROM orders WHERE id = $1', [order_id]);
        if (oRes.rows.length > 0) {
          const ord = oRes.rows[0];
          const transporter = createMailTransport();
          const itemsHtml = Object.values(ord.items || {}).map(i => `<li>${i.name} (x${i.qty}) - Rp ${parseInt(i.price).toLocaleString('id-ID')}</li>`).join('');
          await transporter.sendMail({
            from: `"Aika Sesilia" <${getRequiredEnv('EMAIL_USER')}>`,
            to: ord.contact.email,
            subject: 'Pembayaran Diterima - Aika Sesilia',
            html: `<h2>Terima Kasih, ${ord.contact.name}!</h2>
                  <p>Pembayaran Anda untuk Order <b>#${order_id}</b> telah kami terima dan pesanan Anda sedang kami kemas.</p>
                  <h3>Detail Pesanan:</h3><ul>${itemsHtml}</ul>
                  <p>Total: Rp ${parseInt(gross_amount).toLocaleString('id-ID')}</p>`
          });
        }
      } catch (e) {
        console.error('Info Email Midtrans Err:', e.message);
      }
    } else if (transaction_status === 'cancel' || transaction_status === 'expire' || transaction_status === 'deny') {
      newStatus = 'Dibatalkan';
      await query(`UPDATE orders SET status = $1 WHERE id = $2`, [newStatus, order_id]);
    } 

    return res.status(200).json({ success: true, message: 'Midtrans Webhook Received' });

  } catch (err) {
    console.error('Midtrans Callback Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};
