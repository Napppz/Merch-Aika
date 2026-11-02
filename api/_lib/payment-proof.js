const db = require('./_db');
const { createMailTransport, getRequiredEnv } = require('./env');
const { parseDataUrlImage, uploadImageBuffer } = require('./r2-storage');
const { requireUserOrAdmin } = require('./user-auth');
const {
  escapeHtml,
  dispatchBackgroundTask,
  ensureOrderHistoryTable,
  recordOrderStatusHistory
} = require('./order-lifecycle');

function getMailTransportSafe() {
  try {
    return createMailTransport();
  } catch (err) {
    console.warn('Mail transport disabled for payment-proof:', err.message);
    return null;
  }
}

function hasR2Config() {
  return [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL'
  ].every((key) => typeof process.env[key] === 'string' && process.env[key].trim() !== '');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId, base64Image, email, customerName } = req.body || {};

    if (!orderId || !base64Image) {
      return res.status(400).json({ error: 'Missing required fields: orderId, base64Image' });
    }

    // 1. Ambil pesanan terlebih dahulu untuk validasi kepemilikan & status sebelum memproses upload
    const existingRes = await db.query(
      'SELECT id, "customerName", email, status, total, shipping, payment_proof FROM orders WHERE id = $1',
      [String(orderId)]
    );

    if (!existingRes.rows.length) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    }

    const existingOrder = existingRes.rows[0];

    // 2. Wajibkan autentikasi token JWT milik pemilik pesanan (atau Admin)
    const auth = requireUserOrAdmin(req, res, existingOrder.email);
    if (!auth) return;

    // 3. Kunci status pesanan: pembeli hanya boleh mengunggah bukti bayar saat status masih 'pending'
    if (auth.type !== 'admin' && existingOrder.status !== 'pending') {
      return res.status(409).json({
        error: 'Bukti pembayaran sudah pernah diunggah atau status pesanan tidak lagi mengizinkan pengunggahan bukti.'
      });
    }

    // 4. Validasi format & ukuran gambar base64
    if (typeof base64Image !== 'string' || !base64Image.startsWith('data:image')) {
      return res.status(400).json({ error: 'Invalid image format. Must be base64' });
    }

    const matches = base64Image.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid base64 format' });
    }

    const mimeType = String(matches[1] || '').toLowerCase();
    const base64Data = matches[2];
    const allowedTypes = ['jpeg', 'jpg', 'png', 'webp'];

    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: `File type ${mimeType} not allowed. Use JPG, PNG, or WebP.` });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const fileSizeMB = buffer.length / (1024 * 1024);

    if (fileSizeMB > 5) {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }

    // 5. Unggah bukti pembayaran ke Cloudflare R2 (atau fallback ke database)
    let paymentProofValue = base64Image;
    let paymentProofStorage = 'database';

    if (hasR2Config()) {
      const { buffer: imageBuffer, mimeType: parsedMimeType } = parseDataUrlImage(base64Image);
      const uploaded = await uploadImageBuffer({
        buffer: imageBuffer,
        mimeType: parsedMimeType,
        fileName: `payment-proof-${existingOrder.id}.${mimeType}`,
        folder: 'payment-proofs',
        prefix: String(existingOrder.id)
      });
      paymentProofValue = uploaded.imageUrl;
      paymentProofStorage = 'r2';
    } else {
      console.warn('R2 config missing for payment-proof upload. Falling back to database storage.');
    }

    await ensureOrderHistoryTable(db);

    // 6. Update status ke 'payment_pending' secara atomik & catat ke riwayat status pesanan
    const order = await db.withTransaction(async (client) => {
      const updateSql = auth.type === 'admin'
        ? `UPDATE orders
           SET status = 'payment_pending', payment_proof = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING *`
        : `UPDATE orders
           SET status = 'payment_pending', payment_proof = $1, updated_at = NOW()
           WHERE id = $2 AND status = 'pending'
           RETURNING *`;

      const { rows } = await client.query(updateSql, [paymentProofValue, existingOrder.id]);
      if (!rows.length) {
        const conflictErr = new Error('Bukti pembayaran sudah diproses sebelumnya.');
        conflictErr.statusCode = 409;
        throw conflictErr;
      }

      await recordOrderStatusHistory(client, {
        orderId: existingOrder.id,
        fromStatus: existingOrder.status,
        toStatus: 'payment_pending',
        actorType: auth.type === 'admin' ? 'admin' : 'customer',
        actorName: auth.username || auth.email || existingOrder.email,
        note: 'Bukti pembayaran diunggah (menunggu verifikasi admin)'
      });

      return rows[0];
    });

    // 7. Kirim email ke Admin & Pembeli secara paralel di belakang layar (non-blocking & HTML-escaped)
    const recipientEmail = order.email || email;
    const isDummyEmail = !recipientEmail || recipientEmail.endsWith('@example.com') || recipientEmail.endsWith('.local') || recipientEmail.endsWith('@test.com');
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(req.headers && req.headers['x-test-suite']);

    if (!isDummyEmail && !isTestEnv) {
      const shipObj = typeof order.shipping === 'string' ? JSON.parse(order.shipping || '{}') : (order.shipping || {});
      const isDp = shipObj.paymentScheme === 'dp50';
      const dpAmount = shipObj.dpAmount || Math.ceil((order.total || 0) * 0.5);
      const remainingAmount = shipObj.remainingAmount || Math.max(0, (order.total || 0) - dpAmount);

      const displayCustomerName = order.customerName || customerName || 'Pelanggan';
      const safeCustomerName = escapeHtml(displayCustomerName);
      const safeRecipientEmail = escapeHtml(recipientEmail);
      const safeOrderId = escapeHtml(order.id);

      await dispatchBackgroundTask(async () => {
        const transporter = getMailTransportSafe();
        if (!transporter) return;

        const emailUser = getRequiredEnv('EMAIL_USER');
        const adminEmail = process.env.ADMIN_EMAIL || emailUser;

        const sendAdminMail = transporter.sendMail({
          from: `"Aika Sesilia" <${emailUser}>`,
          to: adminEmail,
          replyTo: emailUser,
          subject: `[Aika Sesilia] Bukti Pembayaran Masuk ${isDp ? '(DP 50%) ' : ''}- Pesanan #${order.id}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background:#f5f5f5; padding:2rem; border-radius:8px;">
              <h2 style="color: #4caf50; border-bottom: 2px solid #4caf50; padding-bottom:1rem;">✅ BUKTI PEMBAYARAN MASUK ${isDp ? '(DP 50%)' : ''}</h2>
              <p style="margin: 0.8rem 0;"><strong>Pelanggan:</strong> ${safeCustomerName} (${safeRecipientEmail})</p>
              <p style="margin: 0.8rem 0;"><strong>No. Pesanan:</strong> #${safeOrderId}</p>
              <p style="margin: 0.8rem 0;"><strong>Total Nilai Pesanan:</strong> Rp ${order.total?.toLocaleString('id-ID') || '-'}</p>
              <p style="margin: 0.8rem 0;"><strong>Skema Pembayaran:</strong> <span style="color:#0284c7;font-weight:bold;">${isDp ? '⚡ DP 50% (Uang Muka)' : '💎 Full Payment (100%)'}</span></p>
              ${isDp ? `
                <p style="margin: 0.8rem 0;color:#16a34a;font-weight:bold;">Nominal DP 50% Yang Ditransfer: Rp ${dpAmount.toLocaleString('id-ID')}</p>
                <p style="margin: 0.8rem 0;color:#d97706;">Sisa Tagihan Pelunasan Nanti: Rp ${remainingAmount.toLocaleString('id-ID')}</p>
              ` : ''}
              <div style="background:#fff; padding:1.5rem; border-left: 4px solid #4caf50; border-radius:4px; margin:1.5rem 0;">
                <p style="margin:0;font-weight:bold;color:#333;">📸 Screenshot Transfer ${isDp ? '(Pembayaran DP 50%)' : ''}:</p>
                <p style="margin:0.5rem 0; font-size:0.9rem; color:#666;">Bukti pembayaran telah diterima dan tersimpan di database.</p>
                <p style="margin:1rem 0; padding:1rem; background:#fffbea; border-radius:4px; font-size:0.85rem; color:#666;">
                  <strong>⚠️ Harap verifikasi:</strong> Pastikan nominal transfer pada screenshot sesuai dengan tagihan ${isDp ? `DP 50% (Rp ${dpAmount.toLocaleString('id-ID')})` : `(Rp ${order.total?.toLocaleString('id-ID')})`} sebelum mengonfirmasi status pesanan.
                </p>
              </div>
              <p style="margin-top:1.5rem; font-size:0.9rem;"><strong>Status:</strong> <span style="color:#ff9800; font-weight:bold;">⏳ MENUNGGU VERIFIKASI ${isDp ? 'DP' : ''}</span></p>
              <p style="font-size:0.85rem;color:#999;margin-top:2rem;">Email ini dikirim otomatis. Mohon segera verifikasi pembayaran.</p>
            </div>
          `
        }).catch(err => console.error('Email to admin failed:', err.message));

        const sendCustomerMail = transporter.sendMail({
          from: `"Aika Sesilia" <${emailUser}>`,
          to: recipientEmail,
          replyTo: emailUser,
          subject: `[Aika Sesilia] Bukti Pembayaran ${isDp ? 'DP 50% ' : ''}Diterima - Pesanan #${order.id}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #4caf50;">Bukti Pembayaran ${isDp ? 'DP 50% ' : ''}Kami Terima!</h2>
              <p>Halo ${safeCustomerName},</p>
              <p>Terima kasih! Kami telah menerima bukti pembayaran ${isDp ? '<strong>DP 50% (Uang Muka)</strong>' : ''} Anda untuk pesanan <strong>#${safeOrderId}</strong>.</p>
              <div style="background:#f0f8f0; padding:1.5rem; border-left: 4px solid #4caf50; border-radius:4px; margin:1.5rem 0;">
                <p style="margin:0;font-weight:bold;color:#333;">Status: Sedang Diverifikasi Admin</p>
                <p style="margin:0.5rem 0; font-size:0.9rem; color:#666;">Tim kami akan memverifikasi pembayaran Anda dalam 1-2 jam kerja.</p>
                ${isDp ? `
                  <p style="margin:0.8rem 0 0 0; font-size:0.88rem; color:#0f766e;">
                    <strong>Catatan DP:</strong> Anda telah mengunggah bukti transfer DP 50% (Rp ${dpAmount.toLocaleString('id-ID')}). Sisa pelunasan sebesar Rp ${remainingAmount.toLocaleString('id-ID')} dibayarkan saat pesanan siap dikirim / COD.
                  </p>
                ` : ''}
              </div>
              <p style="margin-top:1.5rem;">Anda akan menerima email konfirmasi pesanan setelah diverifikasi.</p>
              <p>Jika ada pertanyaan, jangan ragu untuk menghubungi kami.</p>
              <br/>
              <p>Terima kasih,<br/><strong>Aika Sesilia</strong></p>
            </div>
          `
        }).catch(err => console.error('Email to customer failed:', err.message));

        await Promise.allSettled([sendAdminMail, sendCustomerMail]);
      }, 'payment-proof-emails');
    }

    return res.status(200).json({
      message: 'Payment proof uploaded successfully',
      storage: paymentProofStorage,
      order: {
        id: order.id,
        status: order.status,
        customerName: order.customerName,
        email: order.email,
        total: order.total
      }
    });
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Payment proof API error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
