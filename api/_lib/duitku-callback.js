const crypto = require('crypto');
const { query } = require('./_db');
const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const data = req.body;
    
    // Duitku akan mengirimkan: merchantCode, amount, merchantOrderId, signature, reference, resultCode
    const { merchantCode, amount, merchantOrderId, signature, reference, resultCode } = data;

    // Secret Key API Key
    const apiKey = process.env.DUITKU_API_KEY || 'd4d0dfa28fa1bb2d3a9f68cbb1381360';
    const activeMerchant = process.env.DUITKU_MERCHANT_CODE || merchantCode;

    // Rumus Signature Callback Duitku: MD5(merchantCode + amount + merchantOrderId + apiKey)
    const signatureStr = activeMerchant + amount + merchantOrderId + apiKey;
    const calcSignature = crypto.createHash('md5').update(signatureStr).digest('hex');

    // Validasi Signature
    if (calcSignature.toLowerCase() !== signature.toLowerCase()) {
      return res.status(400).json({ error: 'Bad Signature' });
    }

    // Logika Status Berdasarkan ResultCode Duitku
    let newStatus = 'pending_payment';
    
    if (resultCode === '00' || resultCode === '01') {
      // 00 atau 01 : SUCCESS
      newStatus = 'Dikemas';
      
      // Update Database
      await query(`UPDATE orders SET status = $1 WHERE id = $2`, [newStatus, merchantOrderId]);
      
      // Mengirimkan notifikasi email suksesnya pesanan bisa ditambahkan di sini
      try {
        const oRes = await query('SELECT * FROM orders WHERE id = $1', [merchantOrderId]);
        if (oRes.rows.length > 0) {
          const ord = oRes.rows[0];
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.EMAIL_USER || process.env.SMTP_USER,
              pass: process.env.EMAIL_PASS || process.env.SMTP_PASS,
            },
          });
          const msg = `Pesanan Aika Sesilia (Order ID: #${merchantOrderId}) berhasil dibayar via Duitku sebesar Rp ${amount} dan sedang diproses. Terima kasih!`;
          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: ord.email,
            subject: `Pesanan Berhasil Dibayar #${merchantOrderId}`,
            text: msg
          });
        }
      } catch(e) { }
      
      return res.status(200).json({ status: 'Success process payment' });

    } else if (resultCode === '02') {
      // 02 : FAILED / EXPIRED / CANCELED
      newStatus = 'Cancelled';
      await query(`UPDATE orders SET status = $1 WHERE id = $2`, [newStatus, merchantOrderId]);
      return res.status(200).json({ status: 'Order failed updated' });
    }

    // Unhandled Code (eg. Pending is not normally sent via callback)
    res.status(200).json({ status: 'Ignored code' });

  } catch (err) {
    console.error('Duitku Callback Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};