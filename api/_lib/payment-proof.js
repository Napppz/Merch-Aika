const db = require('./_db');
const { createMailTransport, getRequiredEnv } = require('./env');
const { parseDataUrlImage, uploadImageBuffer } = require('./r2-storage');
const { requireUserOrAdmin } = require('./user-auth');
const {
  escapeHtml,
  dispatchBackgroundTask,
  ensureOrderPaymentColumns,
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
    const { orderId, base64Image, email, customerName, proofType } = req.body || {};
    const isPelunasan = String(proofType || '').trim().toLowerCase() === 'pelunasan';

    if (!orderId || !base64Image) {
      return res.status(400).json({ error: 'Missing required fields: orderId, base64Image' });
    }

    await ensureOrderPaymentColumns(db);

    // 1. Ambil pesanan terlebih dahulu untuk validasi kepemilikan & status sebelum memproses upload
    const existingRes = await db.query(
      'SELECT id, "customerName", email, status, total, shipping, payment_proof, pelunasan_proof FROM orders WHERE id = $1',
      [String(orderId)]
    );

    if (!existingRes.rows.length) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    }

    const existingOrder = existingRes.rows[0];
    let existingShipObj = {};
    try {
      existingShipObj = typeof existingOrder.shipping === 'string'
        ? JSON.parse(existingOrder.shipping || '{}')
        : { ...(existingOrder.shipping || {}) };
    } catch (_) {
      existingShipObj = {};
    }
    const isDpOrder = Boolean(existingShipObj.paymentScheme === 'dp50' || existingShipObj.isDp);

    // 2. Wajibkan autentikasi token JWT milik pemilik pesanan (atau Admin)
    const auth = requireUserOrAdmin(req, res, existingOrder.email);
    if (!auth) return;

    // 3. Kunci status pesanan sesuai jenis bukti (awal vs pelunasan DP 50%)
    if (isPelunasan) {
      if (!isDpOrder) {
        return res.status(400).json({
          error: 'Pesanan ini menggunakan skema bayar penuh (100%), tidak memerlukan pelunasan.'
        });
      }
      if (auth.type !== 'admin' && !['paid', 'shipped', 'completed'].includes(existingOrder.status)) {
        return res.status(409).json({
          error: 'Bukti pelunasan sisa 50% hanya dapat diunggah setelah pembayaran DP 50% pertama diverifikasi oleh admin.'
        });
      }
      const currPelunasanSt = String(existingShipObj.pelunasanStatus || '');
      if (auth.type !== 'admin' && ['pending_verification', 'verified'].includes(currPelunasanSt)) {
        return res.status(409).json({
          error: currPelunasanSt === 'verified'
            ? 'Pesanan ini sudah terverifikasi Lunas 100%.'
            : 'Bukti pelunasan sedang menunggu verifikasi admin.'
        });
      }
    } else if (auth.type !== 'admin' && existingOrder.status !== 'pending') {
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
    const filePrefixLabel = isPelunasan ? 'pelunasan-proof' : 'payment-proof';

    if (hasR2Config()) {
      const { buffer: imageBuffer, mimeType: parsedMimeType } = parseDataUrlImage(base64Image);
      const uploaded = await uploadImageBuffer({
        buffer: imageBuffer,
        mimeType: parsedMimeType,
        fileName: `${filePrefixLabel}-${existingOrder.id}.${mimeType}`,
        folder: 'payment-proofs',
        prefix: String(existingOrder.id)
      });
      paymentProofValue = uploaded.imageUrl;
      paymentProofStorage = 'r2';
    } else {
      console.warn('R2 config missing for payment-proof upload. Falling back to database storage.');
    }

    await ensureOrderHistoryTable(db);

    // 6. Update pesanan secara atomik & catat ke riwayat status pesanan
    const order = await db.withTransaction(async (client) => {
      const lockRes = await client.query(
        'SELECT status, shipping FROM orders WHERE id = $1 FOR UPDATE',
        [existingOrder.id]
      );
      if (!lockRes.rows.length) {
        const notFoundErr = new Error('Pesanan tidak ditemukan.');
        notFoundErr.statusCode = 404;
        throw notFoundErr;
      }

      const lockedRow = lockRes.rows[0];
      let nextShip = {};
      try {
        nextShip = typeof lockedRow.shipping === 'string'
          ? JSON.parse(lockedRow.shipping || '{}')
          : { ...(lockedRow.shipping || {}) };
      } catch (_) {
        nextShip = {};
      }

      if (isPelunasan) {
        if (auth.type !== 'admin') {
          if (!['paid', 'shipped', 'completed'].includes(lockedRow.status)) {
            const conflictErr = new Error('Bukti pelunasan hanya dapat diunggah setelah DP 50% diverifikasi admin.');
            conflictErr.statusCode = 409;
            throw conflictErr;
          }
          if (['pending_verification', 'verified'].includes(String(nextShip.pelunasanStatus || ''))) {
            const conflictErr = new Error('Bukti pelunasan sudah diunggah sebelumnya.');
            conflictErr.statusCode = 409;
            throw conflictErr;
          }
        }

        const wasPelunasanReupload = nextShip.pelunasanStatus === 'rejected';
        nextShip.pelunasanStatus = 'pending_verification';
        nextShip.pelunasanUploadedAt = new Date().toISOString();
        delete nextShip.pelunasanRejectNote;

        const { rows } = await client.query(
          `UPDATE orders
           SET pelunasan_proof = $1, shipping = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [paymentProofValue, JSON.stringify(nextShip), existingOrder.id]
        );

        await recordOrderStatusHistory(client, {
          orderId: existingOrder.id,
          fromStatus: lockedRow.status,
          toStatus: lockedRow.status,
          actorType: auth.type === 'admin' ? 'admin' : 'customer',
          actorName: auth.username || auth.email || existingOrder.email,
          note: wasPelunasanReupload
            ? 'Bukti pelunasan sisa 50% diunggah ulang (menunggu verifikasi admin)'
            : 'Bukti pelunasan sisa 50% diunggah (menunggu verifikasi admin)'
        });

        return rows[0];
      }

      // Bukti pembayaran awal (Full 100% atau DP 50% pertama, termasuk upload ulang jika diminta admin)
      if (auth.type !== 'admin' && lockedRow.status !== 'pending') {
        const conflictErr = new Error('Bukti pembayaran sudah diproses sebelumnya.');
        conflictErr.statusCode = 409;
        throw conflictErr;
      }

      const wasInitialReupload = Boolean(nextShip.reuploadRequested);
      if (wasInitialReupload) {
        nextShip.reuploadRequested = false;
        nextShip.lastReuploadAt = new Date().toISOString();
        delete nextShip.reuploadNote;
      }

      const { rows } = await client.query(
        `UPDATE orders
         SET status = 'payment_pending', payment_proof = $1, shipping = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [paymentProofValue, JSON.stringify(nextShip), existingOrder.id]
      );

      await recordOrderStatusHistory(client, {
        orderId: existingOrder.id,
        fromStatus: lockedRow.status,
        toStatus: 'payment_pending',
        actorType: auth.type === 'admin' ? 'admin' : 'customer',
        actorName: auth.username || auth.email || existingOrder.email,
        note: wasInitialReupload
          ? 'Bukti pembayaran diunggah ulang oleh pembeli (menunggu verifikasi admin)'
          : 'Bukti pembayaran diunggah (menunggu verifikasi admin)'
      });

      return rows[0];
    });

    // 7. Kirim email ke Admin & Pembeli secara paralel di belakang layar (non-blocking & HTML-escaped)
    const recipientEmail = order.email || email;
    const isDummyEmail = !recipientEmail || recipientEmail.endsWith('@example.com') || recipientEmail.endsWith('.local') || recipientEmail.endsWith('@test.com');
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(req.headers && req.headers['x-test-suite']);

    if (!isDummyEmail && !isTestEnv) {
      const shipObj = typeof order.shipping === 'string' ? JSON.parse(order.shipping || '{}') : (order.shipping || {});
      const isDp = Boolean(shipObj.paymentScheme === 'dp50' || shipObj.isDp);
      const dpAmount = Number(shipObj.dpAmount) || Math.ceil((order.total || 0) * 0.5);
      const remainingAmount = Number(shipObj.remainingAmount) || Math.max(0, (order.total || 0) - dpAmount);

      const displayCustomerName = order.customerName || customerName || 'Pelanggan';
      const safeCustomerName = escapeHtml(displayCustomerName);
      const safeRecipientEmail = escapeHtml(recipientEmail);
      const safeOrderId = escapeHtml(order.id);

      await dispatchBackgroundTask(async () => {
        const transporter = getMailTransportSafe();
        if (!transporter) return;

        const emailUser = getRequiredEnv('EMAIL_USER');
        const adminEmail = process.env.ADMIN_EMAIL || emailUser;

        if (isPelunasan) {
          const sendAdminPelunasanMail = transporter.sendMail({
            from: `"Aika Sesilia" <${emailUser}>`,
            to: adminEmail,
            replyTo: emailUser,
            subject: `[Aika Sesilia] Bukti Pelunasan Sisa 50% Masuk - Pesanan #${order.id}`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background:#f5f5f5; padding:2rem; border-radius:8px;">
                <h2 style="color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom:1rem;">💳 BUKTI PELUNASAN SISA 50% MASUK</h2>
                <p style="margin: 0.8rem 0;"><strong>Pelanggan:</strong> ${safeCustomerName} (${safeRecipientEmail})</p>
                <p style="margin: 0.8rem 0;"><strong>No. Pesanan:</strong> #${safeOrderId}</p>
                <p style="margin: 0.8rem 0;"><strong>Total Nilai Pesanan:</strong> Rp ${(order.total || 0).toLocaleString('id-ID')}</p>
                <p style="margin: 0.8rem 0; color:#16a34a;"><strong>DP 50% (Sudah Terverifikasi):</strong> Rp ${dpAmount.toLocaleString('id-ID')}</p>
                <p style="margin: 0.8rem 0; color:#0284c7; font-weight:bold;"><strong>Nominal Pelunasan Sisa 50% Yang Ditransfer:</strong> Rp ${remainingAmount.toLocaleString('id-ID')}</p>
                <div style="background:#fff; padding:1.5rem; border-left: 4px solid #0284c7; border-radius:4px; margin:1.5rem 0;">
                  <p style="margin:0;font-weight:bold;color:#333;">📸 Bukti Pelunasan Sisa 50% Tersimpan di Dashboard Admin</p>
                  <p style="margin:0.5rem 0 0 0; font-size:0.88rem; color:#666;">Buka menu Pesanan &gt; Detail pada pesanan <strong>#${safeOrderId}</strong> untuk memeriksa bukti pelunasan dan klik <strong>Verifikasi Pelunasan 100%</strong>.</p>
                </div>
              </div>
            `
          }).catch(err => console.error('Pelunasan email to admin failed:', err.message));

          const sendCustomerPelunasanMail = transporter.sendMail({
            from: `"Aika Sesilia" <${emailUser}>`,
            to: recipientEmail,
            replyTo: emailUser,
            subject: `[Aika Sesilia] Bukti Pelunasan Sisa 50% Diterima - Pesanan #${order.id}`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0284c7;">Bukti Pelunasan Sisa 50% Kami Terima!</h2>
                <p>Halo ${safeCustomerName},</p>
                <p>Terima kasih! Kami telah menerima bukti pembayaran <strong>Pelunasan Sisa 50% (Rp ${remainingAmount.toLocaleString('id-ID')})</strong> untuk pesanan <strong>#${safeOrderId}</strong>.</p>
                <div style="background:#f0f9ff; padding:1.25rem; border-left: 4px solid #0284c7; border-radius:4px; margin:1.25rem 0;">
                  <p style="margin:0;font-weight:bold;color:#0f172a;">Status Pelunasan: Menunggu Verifikasi Admin</p>
                  <p style="margin:0.4rem 0 0 0; font-size:0.9rem; color:#475569;">Kami akan segera memverifikasi pelunasan Anda dan mengirimkan konfirmasi Lunas 100%.</p>
                </div>
                <p>Salam hangat,<br/><strong>Aika Sesilia</strong></p>
              </div>
            `
          }).catch(err => console.error('Pelunasan email to customer failed:', err.message));

          await Promise.allSettled([sendAdminPelunasanMail, sendCustomerPelunasanMail]);
          return;
        }

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
                    <strong>Catatan DP:</strong> Anda telah mengunggah bukti transfer DP 50% (Rp ${dpAmount.toLocaleString('id-ID')}). Sisa pelunasan sebesar Rp ${remainingAmount.toLocaleString('id-ID')} dapat dilunasi melalui menu Profil &gt; Riwayat Pesanan setelah DP diverifikasi.
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

    const finalShip = typeof order.shipping === 'string' ? JSON.parse(order.shipping || '{}') : (order.shipping || {});
    return res.status(200).json({
      message: isPelunasan ? 'Pelunasan proof uploaded successfully' : 'Payment proof uploaded successfully',
      proofType: isPelunasan ? 'pelunasan' : 'initial',
      storage: paymentProofStorage,
      order: {
        id: order.id,
        status: order.status,
        pelunasanStatus: finalShip.pelunasanStatus || null,
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
