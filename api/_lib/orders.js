const db = require('./_db');
const { requireAdmin } = require('./admin-auth');
const { createMailTransport, getRequiredEnv } = require('./env');

const transporter = createMailTransport();

module.exports = async (req, res) => {
  const { method } = req;
  
  try {
    if (method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const { rows } = await db.query('SELECT * FROM orders ORDER BY date DESC');
      return res.status(200).json(rows);
    } 
    
    if (method === 'POST') {
      const { id, customerName, email, address, status, total, items, shipping } = req.body;
      const { rows } = await db.query(
        `INSERT INTO orders (id, "customerName", email, address, status, total, items, shipping) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, customerName, email, address, status, total, typeof items === 'string' ? items : JSON.stringify(items), typeof shipping === 'string' ? shipping : JSON.stringify(shipping)]
      );

      // (1/2) Kirim Notifikasi Email - Pesanan Baru ke Customer
      try {
        await transporter.sendMail({
          from: '"Aika Sesilia Merch" <noreply@aikamerch.com>',
          to: email, // Email pembeli
          subject: `Terima Kasih, ${customerName}! Pesanan #${id} Diterima 📦`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #29b6f6;">Halo, ${customerName}!</h2>
              <p>Terima kasih telah berbelanja di Aika Sesilia Merch.</p>
              <p>Pesanan Anda dengan nomor <strong>#${id}</strong> telah diterima dan sedang menunggu pembayaran.</p>
              <p><strong>Total Pembayaran: Rp ${total.toLocaleString('id-ID')}</strong></p>
              <p>Silakan selesaikan pembayaran melalui aplikasi atau website untuk melanjutkan.</p>
              <p>Terima kasih atas kepercayaan Anda!</p>
              <br/>
              <p>Salam hangat,<br/>Aika Sesilia</p>
            </div>
          `
        });
      } catch (mailErr) {
        console.error('Gagal mengirim email ke customer:', mailErr.message);
      }

      // (1b) Kirim Notifikasi Email ke Admin
      try {
        const adminEmail = process.env.ADMIN_EMAIL || getRequiredEnv('EMAIL_USER');
        const itemsHTML = (Array.isArray(items) ? items : (typeof items === 'string' ? JSON.parse(items) : []))
          .map(item => `<li>${item.name} × ${item.qty} = Rp ${(item.price * item.qty).toLocaleString('id-ID')}</li>`)
          .join('');
        
        await transporter.sendMail({
          from: '"Aika Sesilia Merch" <noreply@aikamerch.com>',
          to: adminEmail,
          subject: `🚨 Pesanan Baru #${id} - Menunggu Pembayaran`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background:#f5f5f5; padding:2rem; border-radius:8px;">
              <h2 style="color: #ff6b6b; border-bottom: 2px solid #ff6b6b; padding-bottom:1rem;">⚠️ PESANAN BARU MASUK</h2>
              
              <h3 style="color:#333;margin-top:1.5rem;">Informasi Pesanan:</h3>
              <table style="width:100%;border-collapse:collapse;margin-bottom:1rem;">
                <tr style="background:#e8e8e8;">
                  <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">No. Pesanan</td>
                  <td style="padding:0.8rem;border:1px solid #ddd;"><strong>#${id}</strong></td>
                </tr>
                <tr>
                  <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Nama Pelanggan</td>
                  <td style="padding:0.8rem;border:1px solid #ddd;">${customerName}</td>
                </tr>
                <tr style="background:#e8e8e8;">
                  <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Email</td>
                  <td style="padding:0.8rem;border:1px solid #ddd;">${email}</td>
                </tr>
                <tr>
                  <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Alamat Pengiriman</td>
                  <td style="padding:0.8rem;border:1px solid #ddd;">${address}</td>
                </tr>
                <tr style="background:#e8e8e8;">
                  <td style="padding:0.8rem;border:1px solid #ddd;font-weight:bold;">Total</td>
                  <td style="padding:0.8rem;border:1px solid #ddd;color:#ff6b6b;font-weight:bold;">Rp ${total.toLocaleString('id-ID')}</td>
                </tr>
              </table>
              
              <h3 style="color:#333;">Item Pesanan:</h3>
              <ul style="background:#fff; padding:1.5rem; border-left: 4px solid #ff6b6b; border-radius:4px;">
                ${itemsHTML}
              </ul>
              
              <p style="color:#666;margin-top:1.5rem;">Status: <strong style="color:#ff9800;">⏳ MENUNGGU PEMBAYARAN</strong></p>
              <p style="font-size:0.9rem;color:#999;margin-top:2rem;">Email ini dikirim otomatis oleh sistem. Mohon segera verifikasi pembayaran pesanan ini.</p>
            </div>
          `
        });
      } catch (mailErr) {
        console.error('Gagal mengirim email ke admin:', mailErr.message);
      }

      return res.status(201).json(rows[0]);
    }

    if (method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const { id, status, resi } = req.body; // resi dari admin jika ada
      
      // Ambil data order yg sekarang
      const d = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
      if(d.rows.length === 0) return res.status(404).json({error: 'Order not found'});
      let order = d.rows[0];

      // Update resi ke kolom JSON shipping
      if(resi && order.shipping) {
        try {
          if (typeof order.shipping === 'string') {
            order.shipping = JSON.parse(order.shipping);
          }
          order.shipping.resi = resi;
        } catch(e) {}
      }

      const { rows } = await db.query(
        `UPDATE orders SET status = $1, shipping = $2 WHERE id = $3 RETURNING *`,
        [status, JSON.stringify(order.shipping), id]
      );
      
      order = rows[0];

      // (2/2) Kirim Notifikasi Email - Pembayaran Dikonfirmasi
      if (status === 'paid' && order.email) {
        try {
          await transporter.sendMail({
            from: '"Aika Sesilia Merch" <noreply@aikamerch.com>',
            to: order.email,
            subject: `✅ Pembayaran Dikonfirmasi - Pesanan #${order.id} Sedang Dikemas 📦`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #4caf50;">✅ Pembayaran Dikonfirmasi!</h2>
                <p>Halo ${order.customerName},</p>
                <p>Pembayaran Anda untuk pesanan <strong>#${order.id}</strong> telah berhasil kami verifikasi.</p>
                
                <div style="background:#f0f8f0; padding:1.5rem; border-left: 4px solid #4caf50; border-radius:4px; margin:1.5rem 0;">
                  <p style="margin:0;font-weight:bold;color:#333;">Status: Sedang Dikemas</p>
                  <p style="margin:0.5rem 0; font-size:0.9rem; color:#666;">Tim kami sedang menyiapkan paket Anda. Kami akan mengirimkan nomor resi dalam waktu 1-2 hari kerja.</p>
                </div>
                
                <p><strong>Detail Pesanan:</strong></p>
                <p>Total Pembayaran: <strong>Rp ${order.total.toLocaleString('id-ID')}</strong></p>
                
                <p style="margin-top:1.5rem;">Terima kasih telah berbelanja di Aika Sesilia! Jika ada pertanyaan, hubungi kami.</p>
                <p>Salam hangat,<br/><strong>Aika Sesilia</strong></p>
              </div>
            `
          });
        } catch (mailErr) {
          console.error('Email konfirmasi pembayaran gagal:', mailErr.message);
        }
      }

      // (3/3) Kirim Notifikasi Email - Pesanan Dikirim
      if (status === 'shipped') {
        try {
          // (Opsional) Resi JNE jika admin memasukkannya via UI
          const trackNo = resi ? resi : (order.shipping && typeof order.shipping === 'object' && order.shipping.resi) ? order.shipping.resi : '[Menunggu Resi JNE]';

          await transporter.sendMail({
            from: '"Aika Sesilia Merch" <noreply@aikamerch.com>',
            to: order.email,
            subject: `Hore! Pesanan #${order.id} Telah Dikirim 🚚`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #29b6f6;">Pesanan Meluncur, ${order.customerName}!</h2>
                <p>Paket *merchandise* Anda telah diserahkan ke jasa kirim.</p>
                <p>Status: <strong>DIKIRIM</strong></p>
                <p>No. Resi Pengiriman: <strong style="color:#111;">${trackNo}</strong></p>
                <p>Anda bisa melacak resi tersebut melalui website resmi JNE.</p>
                <p>Terima kasih atas dukungannya ke Aika Sesilia!</p>
              </div>
            `
          });
        } catch (mailErr) {
          console.error('Gagal mengirim email (PUT):', mailErr.message);
        }
      }

      return res.status(200).json(rows[0]);
    }

    if (method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const { id } = req.query;
      if (id === 'ALL') {
        await db.query(`DELETE FROM orders`);
      } else {
        await db.query(`DELETE FROM orders WHERE id = $1`, [id]);
      }
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
