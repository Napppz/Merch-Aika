const crypto = require('crypto');
const { query } = require('./_db');
const { getRequiredEnv } = require('./env');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { orderId, amount, items, customerName, email, phone } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Parameter pembayaran tidak lengkap' });
    }

    const serverKey = getRequiredEnv('MIDTRANS_SERVER_KEY');
    
    // Kita arahkan paksa ke URL API Sandbox
    const isProd = false; 
    
    const apiUrl = isProd 
      ? 'https://app.midtrans.com/snap/v1/transactions' 
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    // Item Detail Mapping
    const itemDetails = (items || []).map(i => ({
      id: i.id || 'item',
      price: parseInt(i.price) || 0,
      quantity: parseInt(i.qty) || 1,
      name: (i.name || 'Produk').substring(0, 50)
    }));
    
    const calculatedSum = itemDetails.reduce((s, i) => s + (i.price * i.quantity), 0);
    if (calculatedSum < amount) {
      itemDetails.push({ 
        id: 'ongkir', 
        price: (amount - calculatedSum), 
        quantity: 1, 
        name: "Biaya Pengiriman & Lainnya" 
      });
    }

    const payload = {
      transaction_details: {
        order_id: String(orderId),
        gross_amount: parseInt(amount)
      },
      customer_details: {
        first_name: customerName || 'Pelanggan',
        email: email || 'buyer@example.com',
        phone: phone || '08123456789'
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
      // Update status pesanan
      await query(`UPDATE orders SET status = 'pending_payment' WHERE id = $1`, [String(orderId)]);
      
      // Kembalikan token ke frontend untuk Snap JS
      return res.status(200).json({ token: dtData.token, redirect_url: dtData.redirect_url });
    } else {
      console.error('Midtrans Rejected:', dtData);
      return res.status(400).json({ error: (dtData.error_messages ? dtData.error_messages[0] : 'Gagal membuat tagihan Midtrans') });
    }

  } catch (err) {
    console.error('Midtrans API Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};
