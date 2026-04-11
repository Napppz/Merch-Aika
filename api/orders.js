const db = require('./_db');
const nodemailer = require('nodemailer');

// Konfigurasi Email Pengirim (Ganti dengan Email & App Password Anda nanti)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'aika.sesilia.merch@gmail.com', // Ganti email toko Anda
    pass: process.env.EMAIL_PASS || 'your-app-password-here'        // Bikin App Password di Google Account
  }
});

module.exports = async (req, res) => {
  const { method } = req;
  
  try {
    if (method === 'GET') {
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

      // (1/2) Kirim Notifikasi Email - Pesanan Baru / Dikemas
      try {
        await transporter.sendMail({
          from: '"Aika Sesilia Merch" <noreply@aikamerch.com>',
          to: email, // Email pembeli
          subject: `Terima Kasih, ${customerName}! Pesanan #${id} Sedang Dikemas 📦`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #29b6f6;">Halo, ${customerName}!</h2>
              <p>Terima kasih telah berbelanja di Aika Sesilia Merch.</p>
              <p>Pesanan Anda dengan nomor <strong>#${id}</strong> saat ini sedang <strong>DIKEMAS</strong> oleh tim kami dan akan segera diurus pengirimannya.</p>
              <p>Total Belanja: <strong>Rp ${total.toLocaleString('id-ID')}</strong></p>
              <p>Silakan tunggu email selanjutnya ketika resi sudah tersedia.</p>
              <br/>
              <p>Salam hangat,<br/>Aika Sesilia</p>
            </div>
          `
        });
      } catch (mailErr) {
        console.error('Gagal mengirim email (POST):', mailErr.message);
      }

      return res.status(201).json(rows[0]);
    }

    if (method === 'PUT') {
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

      // (2/2) Kirim Notifikasi Email - Pesanan Dikirim
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
