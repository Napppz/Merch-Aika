const crypto = require('crypto');
const { query } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { orderId, amount, items, customerName, email, phone } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Parameter pembayaran tidak lengkap' });
    }

    // Mengambil kredensial API Duitku dari .env atau menggunakan data Anda untuk test
    // Disarankan memakai env variables pada Production!
    const apiKey = process.env.DUITKU_API_KEY || 'd4d0dfa28fa1bb2d3a9f68cbb1381360';
    // Anda membutuhkan Merchant Code, silakan sesuaikan dengan punya Anda
    const merchantCode = process.env.DUITKU_MERCHANT_CODE || 'DXXXX'; 
    const envStr = (process.env.DUITKU_ENV || 'sandbox').toLowerCase();
    const isSandbox = envStr !== 'production';

    const baseUrl = isSandbox 
      ? 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry' 
      : 'https://app-prod.duitku.com/webapi/api/merchant/v2/inquiry';

    // Generate Timestamp (Unix Time dalam ms) & Signature
    const timestamp = Date.now();
    const signaturePlain = merchantCode + timestamp + apiKey;
    const signature = crypto.createHash('sha256').update(signaturePlain).digest('hex');

    // Mendapatkan URL website ini (Host) untuk dimasukkan ke Return / Callback URL Duitku
    const host = req.headers.origin || req.headers.host || 'merch-aika.vercel.app';
    const baseUrlHost = `${host.startsWith('http') ? host : 'https://' + host}`;
    const callbackUrl = `${baseUrlHost}/api/duitku-callback`;
    const returnUrl = `${baseUrlHost}/order-success.html?id=${orderId}`;

    // Item Detail Mapping
    const itemDetails = (items || []).map(i => ({
      name: i.name,
      price: parseInt(i.price) || 0,
      quantity: parseInt(i.qty) || 1
    }));
    
    // Asumsi biaya ongkir dll ditambahkan sebagai item jika total berbeda
    const calculatedSum = itemDetails.reduce((s, i) => s + (i.price * i.quantity), 0);
    if (calculatedSum < amount) {
      itemDetails.push({ name: "Biaya Pengiriman & Lainnya", price: (amount - calculatedSum), quantity: 1 });
    }

    // Buat data request untuk Duitku
    const payload = {
      merchantCode: merchantCode,
      paymentAmount: parseInt(amount),
      merchantOrderId: orderId,
      productDetails: `Pembayaran Pesanan Aika Sesilia #${orderId}`,
      customerVaName: customerName || 'Pelanggan Aika',
      email: email || 'buyer@example.com',
      phoneNumber: phone || '08123456789',
      itemDetails: itemDetails,
      callbackUrl: callbackUrl,
      returnUrl: returnUrl,
      signature: signature,
      timestamp: timestamp,
      expiryPeriod: 60 // Expire in 60 minutes
    };

    // Panggil API Duitku
    const dtRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const dtData = await dtRes.json();

    if (dtData.statusCode === "00") {
      // Jika berhasil, update status pesanan di database kita ke 'pending_payment'
      await query(`UPDATE orders SET status = 'pending_payment' WHERE id = $1`, [orderId]);
      
      // Kirim link pembayaran (paymentUrl) ke website
      return res.status(200).json({ paymentUrl: dtData.paymentUrl });
    } else {
      return res.status(400).json({ error: dtData.statusMessage || 'Kredensial/Konfigurasi Duitku salah' });
    }

  } catch (err) {
    console.error('Duitku API Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};