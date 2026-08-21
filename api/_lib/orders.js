const db = require('./_db');
const { requireAdmin, verifyAdminToken } = require('./admin-auth');
const { createMailTransport, getRequiredEnv } = require('./env');

function getMailTransport() {
  return createMailTransport();
}

const ORDER_LIST_COLUMNS = `
  id,
  "customerName",
  email,
  address,
  status,
  total,
  items,
  shipping,
  date,
  updated_at
`;

const ORDER_DETAIL_COLUMNS = `
  ${ORDER_LIST_COLUMNS},
  payment_proof
`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-user-email');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { method } = req;

  try {
    if (method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const { id } = req.query;
      const sql = id
        ? `SELECT ${ORDER_DETAIL_COLUMNS} FROM orders WHERE id = $1`
        : `SELECT ${ORDER_LIST_COLUMNS} FROM orders ORDER BY date DESC`;
      const params = id ? [id] : [];
      const { rows } = await db.query(sql, params);
      if (id) {
        if (!rows.length) return res.status(404).json({ error: 'Order not found' });
        return res.status(200).json(rows[0]);
      }
      return res.status(200).json(rows);
    }

    if (method === 'POST') {
      const { id, customerName, email, address, status, total, items, shipping } = req.body;
      const { rows } = await db.query(
        `INSERT INTO orders (id, "customerName", email, address, status, total, items, shipping) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${ORDER_LIST_COLUMNS}`,
        [id, customerName, email, address, status, total, typeof items === 'string' ? items : JSON.stringify(items), typeof shipping === 'string' ? shipping : JSON.stringify(shipping)]
      );

      // (1/2) Kirim Notifikasi Email - Pesanan Baru ke Customer
      try {
        const transporter = getMailTransport();
        const emailUser = getRequiredEnv('EMAIL_USER');
        await transporter.sendMail({
          from: `"Aika Sesilia" <${emailUser}>`,
          to: email, // Email pembeli
          replyTo: emailUser,
          subject: `[Aika Sesilia] Pesanan #${id} Diterima 📦`,
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
        const transporter = getMailTransport();
        const emailUser = getRequiredEnv('EMAIL_USER');
        const adminEmail = process.env.ADMIN_EMAIL || emailUser;
        const itemsArray = Array.isArray(items) ? items : (typeof items === 'string' ? JSON.parse(items) : []);
        const itemsHTML = itemsArray
          .map(item => `<li>${item.name}${item.size ? ` (Size ${item.size})` : ''} &times; ${item.qty} = Rp ${(item.price * item.qty).toLocaleString('id-ID')}</li>`)
          .join('');
        await transporter.sendMail({
          from: `"Aika Sesilia" <${emailUser}>`,
          to: adminEmail,
          replyTo: emailUser,
          subject: `[ADMIN] Pesanan Baru #${id} dari ${customerName}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #ff6b6b;">📦 Pesanan Baru Masuk!</h2>
              <p>Ada pesanan baru yang perlu diproses.</p>
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
              <p style="color:#666;margin-top:1.5rem;">Status: <strong style="color:#ff9800;">&#9203; MENUNGGU PEMBAYARAN</strong></p>
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
      const { id, status, resi, userEmail } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'Order ID is required' });
      }

      const adminUser = verifyAdminToken(req);
      
      // Ambil data order yg sekarang
      const d = await db.query(`SELECT ${ ORDER_DETAIL_COLUMNS } FROM orders WHERE id = $1`, [id]);
      if(d.rows.length === 0) return res.status(404).json({error: 'Order not found'});
      let order = d.rows[0];

      // Jika BUKAN admin, perbolehkan customer mengonfirmasi pesanan yang sudah dikirim ('completed')
      if (!adminUser) {
        if (status !== 'completed') {
          return res.status(403).json({ error: 'Hanya admin yang dapat mengubah status ini' });
        }

        const reqEmail = (req.headers['x-user-email'] || userEmail || req.query?.email || '').toLowerCase().trim();
        if (reqEmail && order.email && reqEmail !== order.email.toLowerCase().trim()) {
          return res.status(403).json({ error: 'Tidak memiliki izin untuk mengonfirmasi pesanan ini' });
        }

        const { rows } = await db.query(
          `UPDATE orders SET status = $1 WHERE id = $2 RETURNING ${ ORDER_DETAIL_COLUMNS } `,
          ['completed', id]
        );

        return res.status(200).json(rows[0]);
      }

      req.admin = adminUser;

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
        `UPDATE orders SET status = $1, shipping = $2 WHERE id = $3 RETURNING ${ ORDER_DETAIL_COLUMNS } `,
        [status, JSON.stringify(order.shipping), id]
      );
      
      order = rows[0];

      // Fetch photopack details for email if order status is paid
      let gdriveLinksHTML = '';
      if (status === 'paid' && order.email) {
        try {
          const itemsArr = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items) : []);
          const productsRes = await db.query(`SELECT id, name, gdrive_link, is_photopack, category FROM products`);
          const prodMap = {};
          productsRes.rows.forEach(p => { prodMap[p.id] = p; });

          const photopackLinks = [];
          itemsArr.forEach(item => {
            const prod = prodMap[item.id] || {};
            if (prod.is_photopack || prod.category === 'Photopack' || item.is_photopack) {
              const link = prod.gdrive_link || item.gdrive_link;
              if (link) {
                photopackLinks.push({ name: item.name || prod.name, link });
              }
            }
          });

          if (photopackLinks.length > 0) {
            gdriveLinksHTML = `
              <div style="background:#e0f2fe; padding:1.5rem; border-left: 4px solid #0284c7; border-radius:6px; margin:1.5rem 0;">
                <h3 style="margin:0 0 0.5rem 0; color:#0369a1;">📸 Link Akses Google Drive Photopack Anda</h3>
                <p style="margin:0 0 1rem 0; font-size:0.9rem; color:#0c4a6e;">Selamat! Admin telah memverifikasi pembayaran Anda. Klik link di bawah ini untuk mengunduh/melihat photopack Anda:</p>
                <ul style="margin:0; padding-left:1.2rem; color:#0369a1;">
                  ${photopackLinks.map(p => `<li style="margin-bottom:0.5rem;"><strong>${p.name}:</strong> <a href="${p.link}" target="_blank" style="color:#0284c7; font-weight:bold; text-decoration:underline;">${p.link}</a></li>`).join('')}
                </ul>
              </div>
            `;
          }

          const transporter = getMailTransport();
          const emailUser = getRequiredEnv('EMAIL_USER');
          await transporter.sendMail({
            from: `"Aika Sesilia" <${emailUser}>`,
            to: order.email,
            subject: `✅ Pembayaran Dikonfirmasi - Pesanan #${order.id} ${photopackLinks.length > 0 ? '📸 Photopack Siap Diunduh' : 'Sedang Dikemas'} 📦`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #4caf50;">✅ Pembayaran Dikonfirmasi!</h2>
                <p>Halo ${order.customerName},</p>
                <p>Pembayaran Anda untuk pesanan <strong>#${order.id}</strong> telah berhasil kami verifikasi.</p>
                
                ${gdriveLinksHTML}

                <div style="background:#f0f8f0; padding:1.5rem; border-left: 4px solid #4caf50; border-radius:4px; margin:1.5rem 0;">
                  <p style="margin:0;font-weight:bold;color:#333;">Status: Pembayaran Diverifikasi Admin</p>
                  <p style="margin:0.5rem 0; font-size:0.9rem; color:#666;">Terima kasih telah melakukan pembelian di Aika Sesilia Official Store.</p>
                </div>
                
                <p><strong>Detail Pesanan:</strong></p>
                <p>Total Pembayaran: <strong>Rp ${(order.total || 0).toLocaleString('id-ID')}</strong></p>
                
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
          const transporter = getMailTransport();
          const emailUser = getRequiredEnv('EMAIL_USER');
          const trackNo = resi ? resi : (order.shipping && typeof order.shipping === 'object' && order.shipping.resi) ? order.shipping.resi : '[Menunggu Resi JNE]';

          await transporter.sendMail({
            from: `"Aika Sesilia" <${emailUser}>`,
            to: order.email,
            subject: `Hore! Pesanan #${order.id} Telah Dikirim 🚚`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #29b6f6;">Pesanan Meluncur, ${order.customerName}!</h2>
                <p>Paket Merchandise Anda telah diserahkan ke jasa kirim.</p>
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
    res.status(405).end(`Method ${ method } Not Allowed`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
