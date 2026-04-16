const { query } = require('./_db');
const fs = require('fs');
const path = require('path');
const { createMailTransport, getRequiredEnv } = require('./env');

const transporter = createMailTransport();

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const { orderId, base64Image, email, customerName } = req.body;

      if (!orderId || !base64Image || !email) {
        return res.status(400).json({ error: 'Missing required fields: orderId, base64Image, email' });
      }

      // Validasi base64 image
      if (!base64Image.startsWith('data:image')) {
        return res.status(400).json({ error: 'Invalid image format. Must be base64' });
      }

      // Extract MIME type dan data
      const matches = base64Image.match(/^data:image\/([^;]+);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: 'Invalid base64 format' });
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const allowedTypes = ['jpeg', 'jpg', 'png', 'gif'];

      if (!allowedTypes.includes(mimeType)) {
        return res.status(400).json({ error: `File type ${mimeType} not allowed` });
      }

      // Konversi base64 ke buffer dan hitung ukuran
      const buffer = Buffer.from(base64Data, 'base64');
      const fileSizeMB = buffer.length / (1024 * 1024);

      if (fileSizeMB > 10) {
        return res.status(400).json({ error: 'File size exceeds 10MB limit' });
      }

      // Update order status to "payment_pending" dan simpan bukti
      const { rows } = await query(
        `UPDATE orders 
         SET status = $1, payment_proof = $2, updated_at = NOW() 
         WHERE id = $3 
         RETURNING *`,
        ['payment_pending', base64Image, orderId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = rows[0];

      // Email ke Admin - Bukti Pembayaran Diterima
      try {
        const adminEmail = process.env.ADMIN_EMAIL || getRequiredEnv('EMAIL_USER');
        
        await transporter.sendMail({
          from: '"Aika Sesilia Merch" <noreply@aikamerch.com>',
          to: adminEmail,
          subject: `✅ Bukti Pembayaran Diterima - Pesanan #${orderId}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background:#f5f5f5; padding:2rem; border-radius:8px;">
              <h2 style="color: #4caf50; border-bottom: 2px solid #4caf50; padding-bottom:1rem;">✅ BUKTI PEMBAYARAN MASUK</h2>
              
              <p style="margin: 1rem 0;"><strong>Pelanggan:</strong> ${customerName} (${email})</p>
              <p style="margin: 1rem 0;"><strong>No. Pesanan:</strong> #${orderId}</p>
              <p style="margin: 1rem 0;"><strong>Total:</strong> Rp ${order.total?.toLocaleString('id-ID') || '-'}</p>
              
              <div style="background:#fff; padding:1.5rem; border-left: 4px solid #4caf50; border-radius:4px; margin:1.5rem 0;">
                <p style="margin:0;font-weight:bold;color:#333;">📸 Screenshot Transfer:</p>
                <p style="margin:0.5rem 0; font-size:0.9rem; color:#666;">Bukti pembayaran telah diterima dan tersimpan di database.</p>
                <p style="margin:1rem 0; padding:1rem; background:#fffbea; border-radius:4px; font-size:0.85rem; color:#666;">
                  <strong>⚠️ Harap verifikasi:</strong> Cek di dashboard admin untuk melihat screenshot bukti transfer sebelum mengkonfirmasi pembayaran.
                </p>
              </div>
              
              <p style="margin-top:1.5rem; font-size:0.9rem;"><strong>Status:</strong> <span style="color:#ff9800; font-weight:bold;">⏳ MENUNGGU VERIFIKASI</span></p>
              <p style="font-size:0.85rem;color:#999;margin-top:2rem;">Email ini dikirim otomatis. Mohon segera verifikasi pembayaran.</p>
            </div>
          `,
          // Jika ingin attach image, bisa tambah attachments:
          // attachments: [{
          //   filename: `bukti-${orderId}.${mimeType}`,
          //   content: Buffer.from(base64Data, 'base64')
          // }]
        });
      } catch (mailErr) {
        console.error('Email to admin failed:', mailErr.message);
      }

      // Konfirmasi ke Customer
      try {
        await transporter.sendMail({
          from: '"Aika Sesilia Merch" <noreply@aikamerch.com>',
          to: email,
          subject: `✅ Bukti Pembayaran Diterima - Pesanan #${orderId}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #4caf50;">Bukti Pembayaran Kami Terima!</h2>
              <p>Halo ${customerName},</p>
              <p>Terima kasih! Kami telah menerima bukti pembayaran Anda untuk pesanan <strong>#${orderId}</strong>.</p>
              
              <div style="background:#f0f8f0; padding:1.5rem; border-left: 4px solid #4caf50; border-radius:4px; margin:1.5rem 0;">
                <p style="margin:0;font-weight:bold;color:#333;">Status: Sedang Diverifikasi</p>
                <p style="margin:0.5rem 0; font-size:0.9rem; color:#666;">Tim kami akan memverifikasi pembayaran Anda dalam 1-2 jam kerja.</p>
              </div>
              
              <p style="margin-top:1.5rem;">Anda akan menerima email konfirmasi pembayaran setelah diverifikasi.</p>
              <p>Jika ada pertanyaan, jangan ragu untuk menghubungi kami.</p>
              <br/>
              <p>Terima kasih,<br/><strong>Aika Sesilia</strong></p>
            </div>
          `
        });
      } catch (mailErr) {
        console.error('Email to customer failed:', mailErr.message);
      }

      return res.status(200).json({
        message: 'Payment proof uploaded successfully',
        order: {
          id: order.id,
          status: order.status,
          customerName: order.customerName,
          email: order.email,
          total: order.total
        }
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('Payment proof API error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
