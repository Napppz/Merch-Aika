const db = require('./_db');
const { requireAdmin, verifyAdminToken } = require('./admin-auth');
const { verifyUserAuth } = require('./user-auth');
const env = require('./env');
const { getRequiredEnv } = env;
const { hasR2Config, parseDataUrlImage, uploadImageBuffer } = require('./r2-storage');
const {
  DEFAULT_NOBAR_PAYMENT_TIMEOUT_MINUTES,
  escapeHtml,
  dispatchBackgroundTask,
  ensureOrderPaymentColumns,
  ensureOrderHistoryTable,
  recordOrderStatusHistory,
  expireStalePendingOrders
} = require('./order-lifecycle');
const {
  generateNobarQrToken,
  parseNobarQrScanInput,
  verifyNobarQrToken,
  generateNobarQrDataUrl
} = require('./nobar-qr');

const DEFAULT_NOBAR_CONFIG = {
  isOpen: true,
  eventTitle: 'Nobar Spesial Bioskop Bersama Aika Sesilia',
  movieTitle: 'Segera Diumumkan (TBA)',
  eventDate: 'Segera Diumumkan',
  eventTime: 'Segera Diumumkan',
  cinemaLocation: 'Bioskop (Lokasi detail segera diumumkan)',
  cinemaMapsUrl: 'https://maps.app.goo.gl/7yF59NSdjGyyNP6X9',
  bannerImage: '/images/Profil/charlotta-seo.jpg',
  eventNotes:
    'Pengambilan tiket fisik & nomor kursi dilakukan langsung saat registrasi ulang di lokasi bioskop (siapa cepat datang, dapat pilihan kursi lebih dulu). Untuk pembeli paket Merch, Photocard & Poster diambil langsung di lokasi tanpa ongkir.',
  vipQuota: 2,
  regularQuota: 40,
  maxRegularPerOrder: 5,
  paymentTimeoutMinutes: DEFAULT_NOBAR_PAYMENT_TIMEOUT_MINUTES,
  priceVip: 250000,
  priceRegular: 75000,
  priceRegularMerch: 135000,
  polaroidEnabled: true,
  pricePolaroid: 60000,
  maxPolaroidPerOrder: 10,
  vipPerk: 'Duduk eksklusif tepat di samping Kak Aika (Kuota 2 Orang) + Photocard & Poster',
  regularPerk: '1x Tiket Masuk Nobar Bioskop (Kursi diambil saat event berlangsung, siapa cepat dia dapat)',
  merchBundleDesc: 'Photocard Eksklusif + Poster Nobar Aika Sesilia (Tanpa Ukuran Baju • Ambil di Lokasi)'
};

const TIER_DEFINITIONS = {
  vip: {
    id: 'vip',
    label: 'Tiket VIP (Duduk di Samping Kak Aika)',
    shortLabel: 'VIP',
    includesMerch: true
  },
  regular: {
    id: 'regular',
    label: 'Tiket Biasa',
    shortLabel: 'Tiket Biasa',
    includesMerch: false
  },
  regular_merch: {
    id: 'regular_merch',
    label: 'Tiket Biasa + Merch (Photocard & Poster)',
    shortLabel: 'Tiket Biasa + Merch',
    includesMerch: true
  }
};

function sanitizeMapsUrl(rawUrl) {
  const s = String(rawUrl || '').trim().slice(0, 500);
  if (/^https?:\/\//i.test(s)) return s;
  return DEFAULT_NOBAR_CONFIG.cinemaMapsUrl;
}

function sanitizeNobarConfig(raw = {}) {
  const src = typeof raw === 'object' && raw !== null ? raw : {};
  const rawTimeout = parseInt(src.paymentTimeoutMinutes, 10);
  const paymentTimeoutMinutes = Number.isFinite(rawTimeout)
    ? Math.max(10, Math.min(1440, rawTimeout))
    : DEFAULT_NOBAR_CONFIG.paymentTimeoutMinutes;
  return {
    isOpen: src.isOpen !== undefined ? Boolean(src.isOpen) : DEFAULT_NOBAR_CONFIG.isOpen,
    eventTitle: String(src.eventTitle || DEFAULT_NOBAR_CONFIG.eventTitle).trim().slice(0, 160),
    movieTitle: String(src.movieTitle || DEFAULT_NOBAR_CONFIG.movieTitle).trim().slice(0, 140),
    eventDate: String(src.eventDate || DEFAULT_NOBAR_CONFIG.eventDate).trim().slice(0, 100),
    eventTime: String(src.eventTime || DEFAULT_NOBAR_CONFIG.eventTime).trim().slice(0, 100),
    cinemaLocation: String(src.cinemaLocation || DEFAULT_NOBAR_CONFIG.cinemaLocation).trim().slice(0, 200),
    cinemaMapsUrl: sanitizeMapsUrl(src.cinemaMapsUrl),
    bannerImage: String(src.bannerImage || DEFAULT_NOBAR_CONFIG.bannerImage).trim(),
    eventNotes: String(src.eventNotes || DEFAULT_NOBAR_CONFIG.eventNotes).trim().slice(0, 800),
    vipQuota: Math.max(1, Math.min(20, parseInt(src.vipQuota, 10) || DEFAULT_NOBAR_CONFIG.vipQuota)),
    regularQuota: Math.max(1, Math.min(1000, parseInt(src.regularQuota, 10) || DEFAULT_NOBAR_CONFIG.regularQuota)),
    maxRegularPerOrder: Math.max(1, Math.min(20, parseInt(src.maxRegularPerOrder, 10) || DEFAULT_NOBAR_CONFIG.maxRegularPerOrder)),
    paymentTimeoutMinutes,
    priceVip: Math.max(1000, parseInt(src.priceVip, 10) || DEFAULT_NOBAR_CONFIG.priceVip),
    priceRegular: Math.max(1000, parseInt(src.priceRegular, 10) || DEFAULT_NOBAR_CONFIG.priceRegular),
    priceRegularMerch: Math.max(1000, parseInt(src.priceRegularMerch, 10) || DEFAULT_NOBAR_CONFIG.priceRegularMerch),
    polaroidEnabled: src.polaroidEnabled !== undefined ? Boolean(src.polaroidEnabled) : DEFAULT_NOBAR_CONFIG.polaroidEnabled,
    pricePolaroid: Math.max(1000, parseInt(src.pricePolaroid, 10) || DEFAULT_NOBAR_CONFIG.pricePolaroid),
    maxPolaroidPerOrder: Math.max(1, Math.min(50, parseInt(src.maxPolaroidPerOrder, 10) || DEFAULT_NOBAR_CONFIG.maxPolaroidPerOrder)),
    vipPerk: String(src.vipPerk || DEFAULT_NOBAR_CONFIG.vipPerk).trim().slice(0, 300),
    regularPerk: String(src.regularPerk || DEFAULT_NOBAR_CONFIG.regularPerk).trim().slice(0, 300),
    merchBundleDesc: String(src.merchBundleDesc || DEFAULT_NOBAR_CONFIG.merchBundleDesc).trim().slice(0, 300)
  };
}

async function getNobarConfig(runner = db) {
  await runner.query('CREATE TABLE IF NOT EXISTS settings (key VARCHAR(50) PRIMARY KEY, value TEXT);');
  const res = await runner.query("SELECT value FROM settings WHERE key = 'nobar_config'");
  if (!res.rows.length || !res.rows[0].value) {
    return { ...DEFAULT_NOBAR_CONFIG };
  }
  try {
    return sanitizeNobarConfig(JSON.parse(res.rows[0].value));
  } catch (_) {
    return { ...DEFAULT_NOBAR_CONFIG };
  }
}

function parseShippingObj(rawShipping) {
  if (!rawShipping) return {};
  if (typeof rawShipping === 'object') return rawShipping;
  try {
    return JSON.parse(rawShipping || '{}');
  } catch (_) {
    return {};
  }
}

async function computeNobarStats(runner = db, config = DEFAULT_NOBAR_CONFIG, currentUserEmail = null) {
  const { rows } = await runner.query(
    `SELECT id, "customerName", email, phone, status, total, shipping, payment_proof, notes, date
     FROM orders
     WHERE shipping::text LIKE '%"isNobar"%'
     ORDER BY date ASC`
  );

  let vipVerified = 0;
  let vipPending = 0;
  let regularVerified = 0;
  let regularPending = 0;
  let checkedInOrders = 0;
  let checkedInSeats = 0;
  let verifiedOrders = 0;
  let verifiedSeats = 0;
  let polaroidTotalOrdered = 0;

  const tierBreakdown = {
    vip: { verified: 0, pending: 0, total: 0 },
    regular: { verified: 0, pending: 0, total: 0 },
    regular_merch: { verified: 0, pending: 0, total: 0 }
  };

  let userHasVipTicket = false;
  let userVipStatus = null;
  let userRegularTicketsBought = 0;
  let activePendingReservation = null;

  const attendees = [];
  const cleanUserEmail = currentUserEmail ? String(currentUserEmail).trim().toLowerCase() : '';
  const nowMs = Date.now();

  for (const row of rows) {
    const st = String(row.status || '').toLowerCase();
    const ship = parseShippingObj(row.shipping);
    if (!ship.isNobar || !ship.nobarTicket) continue;

    const ticket = ship.nobarTicket;
    const tier = TIER_DEFINITIONS[ticket.tier] ? ticket.tier : 'regular';
    const qty = Math.max(1, parseInt(ticket.qty, 10) || 1);
    const polaroidQty = Math.max(0, parseInt(ticket.polaroidQty, 10) || 0);
    const polaroidUnitPrice = polaroidQty > 0
      ? (Number(ticket.polaroidUnitPrice) || config.pricePolaroid || 60000)
      : (config.pricePolaroid || 60000);
    const polaroidTotal = polaroidQty > 0
      ? (Number(ticket.polaroidTotal) || polaroidUnitPrice * polaroidQty)
      : 0;
    const ticketUnitPrice = Number(ticket.unitPrice) || Math.max(0, Math.round(((Number(row.total) || 0) - polaroidTotal) / qty));
    const participants = Array.isArray(ticket.participants)
      ? ticket.participants.map(p => String(p || '').trim()).filter(Boolean)
      : [row.customerName];

    const isVerified = ['paid', 'shipped', 'completed'].includes(st);
    const isPending = ['pending', 'payment_pending', 'pending_payment'].includes(st);
    const isCancelled = st === 'cancelled';
    const isCheckedIn = st === 'completed' || Boolean(ticket.checkedIn);
    const hasProof = Boolean(row.payment_proof);

    if (!isCancelled) {
      polaroidTotalOrdered += polaroidQty;
      if (isVerified) {
        verifiedOrders += 1;
        verifiedSeats += qty;
      }
      if (isCheckedIn) {
        checkedInOrders += 1;
        checkedInSeats += qty;
      }

      if (tier === 'vip') {
        if (isVerified) {
          vipVerified += qty;
          tierBreakdown.vip.verified += qty;
        } else if (isPending) {
          vipPending += qty;
          tierBreakdown.vip.pending += qty;
        }
        tierBreakdown.vip.total += qty;
      } else {
        // Kuota Tiket Biasa & Tiket Biasa + Merch digabung menjadi 1 kuota kursi reguler
        if (isVerified) {
          regularVerified += qty;
          tierBreakdown[tier].verified += qty;
        } else if (isPending) {
          regularPending += qty;
          tierBreakdown[tier].pending += qty;
        }
        tierBreakdown[tier].total += qty;
      }

      if (cleanUserEmail && String(row.email || '').trim().toLowerCase() === cleanUserEmail) {
        if (tier === 'vip') {
          userHasVipTicket = true;
          userVipStatus = st;
        } else {
          userRegularTicketsBought += qty;
        }

        if (st === 'pending' && !hasProof) {
          const timeoutMins = Math.max(10, Math.min(1440, parseInt(ticket.paymentTimeoutMinutes, 10) || config.paymentTimeoutMinutes || DEFAULT_NOBAR_PAYMENT_TIMEOUT_MINUTES));
          const explicitExp = ticket.paymentExpiresAt ? Date.parse(ticket.paymentExpiresAt) : NaN;
          const fallbackExp = Date.parse(row.date) + timeoutMins * 60 * 1000;
          const deadlineMs = !Number.isNaN(explicitExp) ? explicitExp : fallbackExp;
          if (Number.isFinite(deadlineMs) && deadlineMs > nowMs) {
            activePendingReservation = {
              orderId: row.id,
              tier,
              tierLabel: ticket.tierLabel || TIER_DEFINITIONS[tier].label,
              qty,
              unitPrice: ticketUnitPrice,
              ticketSubtotal: ticketUnitPrice * qty,
              polaroidQty,
              polaroidUnitPrice,
              polaroidTotal,
              total: Number(row.total) || 0,
              participants,
              phone: row.phone || '',
              notes: row.notes || '',
              includesMerch: Boolean(ticket.includesMerch),
              merchBundle: ticket.merchBundle || '',
              paymentExpiresAt: ticket.paymentExpiresAt || new Date(deadlineMs).toISOString(),
              paymentTimeoutMinutes: timeoutMins,
              date: row.date
            };
          }
        }
      }
    }

    attendees.push({
      orderId: row.id,
      customerName: row.customerName,
      email: row.email,
      phone: row.phone || '',
      status: row.status,
      total: Number(row.total) || 0,
      tier,
      tierLabel: ticket.tierLabel || TIER_DEFINITIONS[tier].label,
      qty,
      polaroidQty,
      polaroidTotal,
      participants,
      includesMerch: Boolean(ticket.includesMerch),
      merchBundle: ticket.merchBundle || '',
      hasPaymentProof: hasProof,
      paymentProof: row.payment_proof || '',
      reuploadRequested: Boolean(ship.reuploadRequested),
      paymentExpiresAt: ticket.paymentExpiresAt || null,
      paymentTimeoutMinutes: parseInt(ticket.paymentTimeoutMinutes, 10) || config.paymentTimeoutMinutes,
      checkedIn: isCheckedIn,
      checkedInAt: ticket.checkedInAt || null,
      checkedInBy: ticket.checkedInBy || null,
      merchClaimed: Boolean(ticket.merchClaimed),
      merchClaimedAt: ticket.merchClaimedAt || null,
      date: row.date
    });
  }

  // Untuk VIP: "2 pembeli pertama yang pembayarannya diverifikasi admin"
  const vipRemainingVerified = Math.max(0, config.vipQuota - vipVerified);
  const vipRemainingOpen = Math.max(0, config.vipQuota - (vipVerified + vipPending));

  // Untuk Reguler (gabungan Tiket Biasa + Tiket Biasa + Merch):
  const regularTaken = regularVerified + regularPending;
  const regularRemaining = Math.max(0, config.regularQuota - regularTaken);

  return {
    stats: {
      vipQuota: config.vipQuota,
      vipVerified,
      vipPending,
      vipTaken: vipVerified + vipPending,
      vipRemaining: vipRemainingOpen,
      vipRemainingVerified,
      isVipSoldOut: vipVerified >= config.vipQuota || (vipVerified + vipPending) >= config.vipQuota,
      regularQuota: config.regularQuota,
      regularVerified,
      regularPending,
      regularTaken,
      regularRemaining,
      isRegularSoldOut: regularRemaining <= 0,
      checkedInOrders,
      checkedInSeats,
      verifiedOrders,
      verifiedSeats,
      polaroidTotalOrdered,
      tierBreakdown
    },
    userStats: {
      hasVipTicket: userHasVipTicket,
      vipStatus: userVipStatus,
      regularTicketsBought: userRegularTicketsBought,
      activePendingReservation
    },
    attendees
  };
}

async function generateDailyInvoiceId(runner = db) {
  await runner.query(`
    CREATE TABLE IF NOT EXISTS invoice_daily_sequences (
      date_key VARCHAR(10) PRIMARY KEY,
      last_seq INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const dateKey = formatter.format(new Date());
  const compactDate = dateKey.replace(/-/g, '');
  const prefix = `INV-${compactDate}-`;

  // Kunci baris date_key untuk serialisasi transaksi konkuren pada hari yang sama
  await runner.query(
    `INSERT INTO invoice_daily_sequences (date_key, last_seq, updated_at)
     VALUES ($1, 0, NOW())
     ON CONFLICT (date_key)
     DO UPDATE SET updated_at = NOW();`,
    [dateKey]
  );

  // Hitung nomor urut tertinggi yang benar-benar ada di tabel orders hari ini
  // sehingga jika pesanan tes dihapus, urutan kembali rapi mulai dari 01
  const existingRes = await runner.query(
    `SELECT id FROM orders WHERE id LIKE $1`,
    [`${prefix}%`]
  );
  let maxExistingSeq = 0;
  for (const row of existingRes.rows) {
    const suffix = String(row.id || '').slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!Number.isNaN(num) && num > maxExistingSeq) {
      maxExistingSeq = num;
    }
  }

  const nextSeq = maxExistingSeq + 1;
  await runner.query(
    `UPDATE invoice_daily_sequences
     SET last_seq = $2, updated_at = NOW()
     WHERE date_key = $1`,
    [dateKey, nextSeq]
  );

  return `INV-${compactDate}-${String(nextSeq).padStart(2, '0')}`;
}

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function formatTicketSummaryForCheckin(row, ship) {
  const ticket = (ship && ship.nobarTicket) || {};
  const tier = TIER_DEFINITIONS[ticket.tier] ? ticket.tier : 'regular';
  const qty = Math.max(1, parseInt(ticket.qty, 10) || 1);
  const polaroidQty = Math.max(0, parseInt(ticket.polaroidQty, 10) || 0);
  const participants = Array.isArray(ticket.participants)
    ? ticket.participants.map(p => String(p || '').trim()).filter(Boolean)
    : [row.customerName];
  const st = String(row.status || '').toLowerCase();

  return {
    id: row.id,
    customerName: row.customerName,
    email: row.email,
    phone: row.phone || '',
    status: row.status,
    total: Number(row.total) || 0,
    tier,
    tierLabel: ticket.tierLabel || TIER_DEFINITIONS[tier].label,
    shortLabel: ticket.shortLabel || TIER_DEFINITIONS[tier].shortLabel,
    qty,
    polaroidQty,
    polaroidTotal: Number(ticket.polaroidTotal) || 0,
    participants,
    includesMerch: Boolean(ticket.includesMerch),
    merchBundle: ticket.merchBundle || '',
    merchClaimed: Boolean(ticket.merchClaimed),
    merchClaimedAt: ticket.merchClaimedAt || null,
    checkedIn: st === 'completed' || Boolean(ticket.checkedIn),
    checkedInAt: ticket.checkedInAt || null,
    checkedInBy: ticket.checkedInBy || null,
    date: row.date
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureOrderPaymentColumns(db);
    await ensureOrderHistoryTable(db);

    if (req.method === 'GET') {
      const config = await getNobarConfig(db);
      await expireStalePendingOrders({ maxNobarMinutes: config.paymentTimeoutMinutes });

      const userAuth = verifyUserAuth(req);
      const adminAuth = verifyAdminToken(req);

      // Endpoint helper: generate/fetch QR PNG dataUrl for a verified Nobar ticket
      const qrOrderId = req.query && req.query.qr_order_id ? String(req.query.qr_order_id).trim() : '';
      if (qrOrderId) {
        const orderRes = await db.query(
          'SELECT id, email, status, shipping FROM orders WHERE UPPER(id) = $1',
          [qrOrderId.toUpperCase()]
        );
        if (!orderRes.rows.length) {
          return res.status(404).json({ error: 'Tiket tidak ditemukan' });
        }
        const row = orderRes.rows[0];
        const isOwner = userAuth && String(userAuth.email || '').trim().toLowerCase() === String(row.email || '').trim().toLowerCase();
        if (!adminAuth && !isOwner) {
          return res.status(403).json({ error: 'Akses ditolak' });
        }
        const ship = parseShippingObj(row.shipping);
        if (!ship.isNobar || !ship.nobarTicket) {
          return res.status(400).json({ error: 'Pesanan ini bukan tiket Nobar Bioskop' });
        }
        const st = String(row.status || '').toLowerCase();
        if (!['paid', 'shipped', 'completed'].includes(st)) {
          return res.status(409).json({ error: 'E-Tiket QR Code baru aktif setelah pembayaran diverifikasi Admin.' });
        }
        const token = ship.nobarTicket.ticketToken || generateNobarQrToken(row.id, row.email);
        const qrCodeDataUrl = await generateNobarQrDataUrl(token);
        return res.status(200).json({
          orderId: row.id,
          ticketToken: token,
          qrCodeDataUrl,
          checkedIn: st === 'completed' || Boolean(ship.nobarTicket.checkedIn)
        });
      }

      const { stats, userStats, attendees } = await computeNobarStats(
        db,
        config,
        userAuth ? userAuth.email : null
      );

      const payload = {
        config,
        stats,
        userStats
      };

      if (req.query && req.query.admin === 'true' && adminAuth) {
        payload.attendees = attendees;
      }

      return res.status(200).json(payload);
    }

    if (req.method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const current = await getNobarConfig(db);
      const incoming = req.body || {};

      let bannerImage = incoming.bannerImage !== undefined ? incoming.bannerImage : current.bannerImage;
      if (typeof bannerImage === 'string' && bannerImage.startsWith('data:image/') && hasR2Config()) {
        const { buffer, mimeType } = parseDataUrlImage(bannerImage);
        const uploaded = await uploadImageBuffer({
          buffer,
          mimeType,
          fileName: 'nobar-banner',
          folder: 'settings',
          prefix: 'nobar'
        });
        bannerImage = uploaded.imageUrl;
      }

      const nextConfig = sanitizeNobarConfig({
        ...current,
        ...incoming,
        bannerImage
      });

      await db.query(
        `INSERT INTO settings (key, value)
         VALUES ('nobar_config', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(nextConfig)]
      );

      const { stats, attendees } = await computeNobarStats(db, nextConfig, null);
      return res.status(200).json({
        success: true,
        message: 'Pengaturan Event Nobar Bioskop berhasil disimpan',
        config: nextConfig,
        stats,
        attendees
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = String(body.action || '').trim().toLowerCase();

      // ── ADMIN ACTION 1: PREVIEW / VERIFY QR CODE FOR CHECK-IN ──
      if (action === 'verify_qr') {
        const adminUser = requireAdmin(req, res);
        if (!adminUser) return;

        const rawCode = body.qrData || body.code || body.orderId || '';
        const parsed = parseNobarQrScanInput(rawCode);
        if (parsed.mode === 'invalid') {
          return res.status(200).json({
            valid: false,
            checkInStatus: 'invalid_format',
            message: 'Format QR Code / Nomor Invoice tidak valid.'
          });
        }

        const orderRes = await db.query(
          'SELECT id, "customerName", email, phone, status, total, items, shipping, notes, date FROM orders WHERE UPPER(id) = $1',
          [parsed.orderId]
        );
        if (!orderRes.rows.length) {
          return res.status(200).json({
            valid: false,
            checkInStatus: 'not_found',
            message: `Tiket dengan kode #${parsed.orderId} tidak ditemukan di sistem.`
          });
        }

        const orderRow = orderRes.rows[0];
        const shipObj = parseShippingObj(orderRow.shipping);
        if (!shipObj.isNobar || !shipObj.nobarTicket) {
          return res.status(200).json({
            valid: false,
            checkInStatus: 'not_nobar',
            message: `Pesanan #${orderRow.id} bukan transaksi Tiket Nobar Bioskop.`
          });
        }

        if (parsed.mode === 'qr') {
          const sigCheck = verifyNobarQrToken(parsed.raw, orderRow);
          if (!sigCheck.valid) {
            return res.status(200).json({
              valid: false,
              checkInStatus: 'invalid_signature',
              message: 'QR Code E-Tiket TIDAK VALID atau kode keamanan tidak cocok (hati-hati tiket palsu!).'
            });
          }
        }

        const summary = formatTicketSummaryForCheckin(orderRow, shipObj);
        const st = String(orderRow.status || '').toLowerCase();

        if (st === 'cancelled') {
          return res.status(200).json({
            valid: false,
            checkInStatus: 'cancelled',
            message: 'Tiket ini sudah DIBATALKAN atau melewati batas waktu pembayaran!',
            order: summary
          });
        }

        if (st === 'pending' || st === 'payment_pending' || st === 'pending_payment') {
          return res.status(200).json({
            valid: false,
            checkInStatus: 'unverified_payment',
            message: st === 'pending'
              ? 'Pembeli BELUM mengunggah bukti transfer QRIS.'
              : 'Pembayaran QRIS masih menunggu verifikasi Admin (belum berstatus Terverifikasi).',
            order: summary
          });
        }

        if (st === 'completed' || summary.checkedIn) {
          return res.status(200).json({
            valid: true,
            checkInStatus: 'already_checked_in',
            canCheckIn: false,
            alreadyCheckedIn: true,
            message: 'PERINGATAN: Tiket ini SUDAH PERNAH Check-in sebelumnya!',
            order: summary
          });
        }

        return res.status(200).json({
          valid: true,
          checkInStatus: 'ready',
          canCheckIn: true,
          scanMode: parsed.mode,
          message: 'Tiket Resmi Terverifikasi — Siap Check-in Masuk Bioskop!',
          order: summary
        });
      }

      // ── ADMIN ACTION 2: CONFIRM CHECK-IN (PAID -> COMPLETED) ──
      if (action === 'checkin') {
        const adminUser = requireAdmin(req, res);
        if (!adminUser) return;

        const rawCode = body.qrData || body.code || body.orderId || '';
        const parsed = parseNobarQrScanInput(rawCode);
        if (parsed.mode === 'invalid') {
          return res.status(400).json({ error: 'Format QR Code / Nomor Invoice tidak valid.' });
        }

        const markMerchClaimed = Boolean(body.markMerchClaimed);
        const adminActor = adminUser.username || String(adminUser.adminId) || 'Admin Nobar';

        const result = await db.withTransaction(async (client) => {
          const lockRes = await client.query(
            'SELECT id, "customerName", email, phone, status, total, items, shipping, notes, date FROM orders WHERE UPPER(id) = $1 FOR UPDATE',
            [parsed.orderId]
          );
          if (!lockRes.rows.length) {
            throw createHttpError(404, `Tiket #${parsed.orderId} tidak ditemukan.`);
          }

          const orderRow = lockRes.rows[0];
          const shipObj = parseShippingObj(orderRow.shipping);
          if (!shipObj.isNobar || !shipObj.nobarTicket) {
            throw createHttpError(400, 'Pesanan ini bukan Tiket Nobar Bioskop.');
          }

          if (parsed.mode === 'qr') {
            const sigCheck = verifyNobarQrToken(parsed.raw, orderRow);
            if (!sigCheck.valid) {
              throw createHttpError(403, 'QR Code E-Tiket tidak sah / tanda tangan keamanan tidak cocok!');
            }
          }

          const st = String(orderRow.status || '').toLowerCase();
          if (st === 'cancelled') {
            throw createHttpError(400, 'Tiket ini telah dibatalkan dan tidak berlaku lagi.');
          }
          if (st === 'completed' || shipObj.nobarTicket.checkedIn) {
            return {
              success: false,
              alreadyCheckedIn: true,
              checkInStatus: 'already_checked_in',
              message: 'Tiket ini sudah pernah Check-in sebelumnya!',
              order: formatTicketSummaryForCheckin(orderRow, shipObj)
            };
          }
          if (st !== 'paid' && st !== 'shipped') {
            throw createHttpError(400, 'Pembayaran tiket belum diverifikasi Admin (status saat ini belum aktif).');
          }

          const nowIso = new Date().toISOString();
          shipObj.nobarTicket.checkedIn = true;
          shipObj.nobarTicket.checkedInAt = nowIso;
          shipObj.nobarTicket.checkedInBy = adminActor;
          shipObj.nobarTicket.checkInMethod = parsed.mode;
          if (markMerchClaimed && shipObj.nobarTicket.includesMerch) {
            shipObj.nobarTicket.merchClaimed = true;
            shipObj.nobarTicket.merchClaimedAt = nowIso;
            shipObj.nobarTicket.merchClaimedBy = adminActor;
          }

          const updateRes = await client.query(
            `UPDATE orders
             SET status = 'completed', shipping = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING id, "customerName", email, phone, status, total, items, shipping, notes, date`,
            [JSON.stringify(shipObj), orderRow.id]
          );

          await recordOrderStatusHistory(client, {
            orderId: orderRow.id,
            fromStatus: orderRow.status,
            toStatus: 'completed',
            actorType: 'admin',
            actorName: adminActor,
            note: `Check-in Nobar di bioskop berhasil (${parsed.mode === 'qr' ? 'Scan QR E-Tiket' : 'Input Manual Invoice'})`
          });

          const updatedRow = updateRes.rows[0];
          const updatedShip = parseShippingObj(updatedRow.shipping);
          return {
            success: true,
            alreadyCheckedIn: false,
            checkInStatus: 'checked_in',
            message: 'Check-in berhasil! Penonton dipersilakan masuk.',
            order: formatTicketSummaryForCheckin(updatedRow, updatedShip)
          };
        });

        return res.status(200).json(result);
      }

      // ── ADMIN ACTION 3: TOGGLE MERCH CLAIMED AT VENUE ──
      if (action === 'toggle_merch_claimed') {
        const adminUser = requireAdmin(req, res);
        if (!adminUser) return;

        const targetOrderId = String(body.orderId || '').trim().toUpperCase();
        if (!targetOrderId) {
          return res.status(400).json({ error: 'Order ID wajib diisi.' });
        }

        const adminActor = adminUser.username || String(adminUser.adminId) || 'Admin Nobar';
        const updatedSummary = await db.withTransaction(async (client) => {
          const lockRes = await client.query(
            'SELECT id, "customerName", email, phone, status, total, items, shipping, notes, date FROM orders WHERE UPPER(id) = $1 FOR UPDATE',
            [targetOrderId]
          );
          if (!lockRes.rows.length) {
            throw createHttpError(404, 'Tiket tidak ditemukan.');
          }
          const orderRow = lockRes.rows[0];
          const shipObj = parseShippingObj(orderRow.shipping);
          if (!shipObj.isNobar || !shipObj.nobarTicket || !shipObj.nobarTicket.includesMerch) {
            throw createHttpError(400, 'Tiket ini tidak memiliki paket Merch.');
          }

          const nextClaimed = body.claimed !== undefined ? Boolean(body.claimed) : !Boolean(shipObj.nobarTicket.merchClaimed);
          shipObj.nobarTicket.merchClaimed = nextClaimed;
          shipObj.nobarTicket.merchClaimedAt = nextClaimed ? new Date().toISOString() : null;
          shipObj.nobarTicket.merchClaimedBy = nextClaimed ? adminActor : null;

          const updateRes = await client.query(
            `UPDATE orders SET shipping = $1, updated_at = NOW() WHERE id = $2
             RETURNING id, "customerName", email, phone, status, total, items, shipping, notes, date`,
            [JSON.stringify(shipObj), orderRow.id]
          );

          await recordOrderStatusHistory(client, {
            orderId: orderRow.id,
            fromStatus: orderRow.status,
            toStatus: orderRow.status,
            actorType: 'admin',
            actorName: adminActor,
            note: nextClaimed
              ? 'Paket Merch (Photocard & Poster) diserahkan kepada peserta di lokasi bioskop'
              : 'Status pengambilan Merch dibatalkan/direset oleh admin'
          });

          const updatedRow = updateRes.rows[0];
          return formatTicketSummaryForCheckin(updatedRow, parseShippingObj(updatedRow.shipping));
        });

        return res.status(200).json({
          success: true,
          message: updatedSummary.merchClaimed
            ? 'Paket Merch ditandai sudah diambil!'
            : 'Status pengambilan Merch direset.',
          order: updatedSummary
        });
      }

      // ── CUSTOMER/ADMIN ACTION: CANCEL UNPAID RESERVATION ──
      if (action === 'cancel_reservation') {
        const userAuth = verifyUserAuth(req);
        const adminAuth = verifyAdminToken(req);
        if (!userAuth && !adminAuth) {
          return res.status(401).json({ error: 'Login diperlukan untuk membatalkan reservasi.' });
        }

        const targetOrderId = String(body.orderId || '').trim().toUpperCase();
        if (!targetOrderId) {
          return res.status(400).json({ error: 'Order ID wajib diisi.' });
        }

        const cancelledOrder = await db.withTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext('nobar:ticket_booking'))");
          const lockRes = await client.query(
            'SELECT id, email, status, payment_proof, shipping FROM orders WHERE UPPER(id) = $1 FOR UPDATE',
            [targetOrderId]
          );
          if (!lockRes.rows.length) {
            throw createHttpError(404, 'Reservasi tiket tidak ditemukan.');
          }

          const row = lockRes.rows[0];
          const isOwner = userAuth && String(userAuth.email || '').trim().toLowerCase() === String(row.email || '').trim().toLowerCase();
          if (!adminAuth && !isOwner) {
            throw createHttpError(403, 'Anda tidak memiliki izin membatalkan reservasi ini.');
          }

          const shipObj = parseShippingObj(row.shipping);
          if (!shipObj.isNobar) {
            throw createHttpError(400, 'Pesanan ini bukan reservasi tiket Nobar.');
          }
          if (row.status === 'cancelled') {
            return row;
          }
          if (row.status !== 'pending' || row.payment_proof) {
            throw createHttpError(409, 'Reservasi yang sudah memiliki bukti bayar atau telah diverifikasi tidak dapat dibatalkan dari halaman ini.');
          }

          const updateRes = await client.query(
            `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING id, status`,
            [row.id]
          );

          await recordOrderStatusHistory(client, {
            orderId: row.id,
            fromStatus: row.status,
            toStatus: 'cancelled',
            actorType: adminAuth ? 'admin' : 'customer',
            actorName: adminAuth ? (adminAuth.username || 'Admin') : userAuth.email,
            note: 'Reservasi tiket Nobar belum dibayar dibatalkan (kuota kursi dilepas kembali)'
          });

          return updateRes.rows[0];
        });

        return res.status(200).json({
          success: true,
          message: 'Reservasi berhasil dibatalkan dan kuota kursi telah dilepas kembali.',
          order: cancelledOrder
        });
      }

      // ── CUSTOMER BOOKING / RESERVATION FLOW ──
      const userAuth = verifyUserAuth(req);
      if (!userAuth || !userAuth.email) {
        return res.status(401).json({
          error: 'Anda harus login terlebih dahulu untuk membeli Tiket Nobar Bioskop.'
        });
      }

      const {
        tier: rawTier,
        qty: rawQty,
        polaroidQty: rawPolaroidQty,
        participants: rawParticipants,
        phone: rawPhone,
        notes: rawNotes,
        paymentProof
      } = body;

      const isReserveOnly = action === 'reserve';
      const tier = String(rawTier || '').trim().toLowerCase();
      if (!TIER_DEFINITIONS[tier]) {
        return res.status(400).json({
          error: 'Pilihan kategori tiket tidak valid. Pilih VIP, Tiket Biasa, atau Tiket Biasa + Merch.'
        });
      }

      const qty = parseInt(rawQty, 10) || 0;
      if (qty < 1) {
        return res.status(400).json({ error: 'Jumlah tiket minimal 1.' });
      }
      if (tier === 'vip' && qty !== 1) {
        return res.status(400).json({
          error: 'Tiket VIP (Duduk di Samping Kak Aika) dibatasi maksimal 1 tiket per akun.'
        });
      }

      const polaroidQty = parseInt(rawPolaroidQty, 10) || 0;
      if (
        (rawPolaroidQty !== undefined && rawPolaroidQty !== null && String(rawPolaroidQty).trim() !== '' && !Number.isFinite(Number(rawPolaroidQty))) ||
        polaroidQty < 0
      ) {
        return res.status(400).json({ error: 'Jumlah tambahan Foto Polaroid tidak valid.' });
      }

      const cleanParticipants = Array.isArray(rawParticipants)
        ? rawParticipants.map(p => String(p || '').trim().slice(0, 120)).filter(Boolean)
        : [];

      if (cleanParticipants.length !== qty) {
        return res.status(400).json({
          error: `Mohon isi nama lengkap untuk seluruh ${qty} peserta tiket.`
        });
      }

      const cleanPhone = String(rawPhone || '').trim().slice(0, 30);
      if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 8) {
        return res.status(400).json({
          error: 'Nomor HP / WhatsApp aktif wajib diisi untuk koordinasi tiket nobar.'
        });
      }

      let storedProofUrl = null;
      if (!isReserveOnly) {
        if (!paymentProof || typeof paymentProof !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(paymentProof.trim())) {
          return res.status(400).json({
            error: 'Pembelian tiket nobar wajib disertai bukti transfer pembayaran QRIS (JPG/PNG/WebP).'
          });
        }

        const parsedProof = parseDataUrlImage(paymentProof.trim());
        if (parsedProof.buffer.length > 6 * 1024 * 1024) {
          return res.status(413).json({
            error: 'Ukuran file bukti transfer terlalu besar (maksimal 6MB).'
          });
        }

        storedProofUrl = paymentProof.trim();
        if (hasR2Config()) {
          const uploaded = await uploadImageBuffer({
            buffer: parsedProof.buffer,
            mimeType: parsedProof.mimeType,
            fileName: `nobar-${tier}-proof`,
            folder: 'payment-proofs',
            prefix: `nobar-${Date.now()}`
          });
          storedProofUrl = uploaded.imageUrl;
        }
      }

      const buyerEmail = String(userAuth.email).trim().toLowerCase();
      const buyerName = cleanParticipants[0] || String(userAuth.username || buyerEmail).trim();
      const cleanNotes = String(rawNotes || '').trim().slice(0, 400);

      // Bebaskan reservasi tiket yang sudah lewat batas waktu pembayaran SEBELUM mengecek kuota
      const preConfig = await getNobarConfig(db);
      await expireStalePendingOrders({ force: true, maxNobarMinutes: preConfig.paymentTimeoutMinutes });

      const createdOrder = await db.withTransaction(async (client) => {
        // Kunci transaksi pemesanan tiket nobar secara atomik
        await client.query("SELECT pg_advisory_xact_lock(hashtext('nobar:ticket_booking'))");

        const config = await getNobarConfig(client);
        if (!config.isOpen) {
          throw createHttpError(400, 'Maaf, penjualan Tiket Nobar Bioskop saat ini sedang ditutup oleh Admin.');
        }

        if (tier !== 'vip' && qty > config.maxRegularPerOrder) {
          throw createHttpError(
            400,
            `Maksimal pembelian tiket reguler adalah ${config.maxRegularPerOrder} tiket per transaksi.`
          );
        }

        if (polaroidQty > 0) {
          if (config.polaroidEnabled === false) {
            throw createHttpError(400, 'Maaf, tambahan Foto Polaroid saat ini sedang dinonaktifkan oleh Admin.');
          }
          const maxPol = config.maxPolaroidPerOrder || 10;
          if (polaroidQty > maxPol) {
            throw createHttpError(400, `Maksimal tambahan Foto Polaroid adalah ${maxPol} foto per transaksi.`);
          }
        }

        const { stats, userStats } = await computeNobarStats(client, config, buyerEmail);

        if (userStats.activePendingReservation) {
          throw createHttpError(
            409,
            `Anda masih memiliki reservasi tiket yang belum dibayar (#${userStats.activePendingReservation.orderId}). Selesaikan pembayaran atau batalkan reservasi tersebut terlebih dahulu.`
          );
        }

        if (tier === 'vip') {
          if (userStats.hasVipTicket) {
            throw createHttpError(
              400,
              'Akun Anda sudah memiliki pesanan Tiket VIP. Tiket VIP dibatasi maksimal 1 tiket per akun.'
            );
          }
          if (stats.vipVerified >= config.vipQuota) {
            throw createHttpError(
              400,
              `Maaf, ${config.vipQuota} kursi Tiket VIP (Duduk di Samping Kak Aika) sudah habis terverifikasi!`
            );
          }
          if (stats.vipTaken + 1 > config.vipQuota) {
            throw createHttpError(
              400,
              `Maaf, seluruh ${config.vipQuota} slot Tiket VIP saat ini sedang dikunci/dalam antrean pembayaran pembeli lain.`
            );
          }
        } else {
          if (stats.regularRemaining < qty) {
            throw createHttpError(
              400,
              stats.regularRemaining <= 0
                ? 'Maaf, kuota kursi Tiket Reguler (Biasa / Biasa + Merch) sudah habis.'
                : `Maaf, sisa kuota kursi reguler hanya tinggal ${stats.regularRemaining} kursi.`
            );
          }
        }

        const unitPrice =
          tier === 'vip'
            ? config.priceVip
            : tier === 'regular_merch'
              ? config.priceRegularMerch
              : config.priceRegular;
        const ticketSubtotal = unitPrice * qty;
        const polaroidUnitPrice = config.pricePolaroid || 60000;
        const polaroidTotal = polaroidQty > 0 ? polaroidUnitPrice * polaroidQty : 0;
        const verifiedTotal = ticketSubtotal + polaroidTotal;
        const tierMeta = TIER_DEFINITIONS[tier];
        const includesMerch = tierMeta.includesMerch;
        const merchBundle = includesMerch ? config.merchBundleDesc : '';

        const orderId = await generateDailyInvoiceId(client);
        const timeoutMinutes = config.paymentTimeoutMinutes || DEFAULT_NOBAR_PAYMENT_TIMEOUT_MINUTES;
        const paymentExpiresAt = isReserveOnly
          ? new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString()
          : null;
        const ticketToken = generateNobarQrToken(orderId, buyerEmail);

        const itemObj = {
          id: `nobar-${tier}`,
          name: `${config.eventTitle} — ${tierMeta.label}`,
          price: unitPrice,
          qty,
          category: 'Tiket Nobar',
          is_nobar: true,
          tier,
          participants: cleanParticipants,
          includesMerch,
          merchBundle
        };

        const itemsList = [itemObj];
        if (polaroidQty > 0) {
          itemsList.push({
            id: 'nobar-addon-polaroid',
            name: 'Tambahan Foto Polaroid (Event Nobar)',
            price: polaroidUnitPrice,
            qty: polaroidQty,
            category: 'Add-on Nobar',
            is_nobar_addon: true
          });
        }

        const shipObj = {
          name: includesMerch
            ? 'Ambil Tiket & Merch (Photocard + Poster) di Lokasi Bioskop'
            : 'Ambil Tiket di Lokasi Bioskop Saat Event',
          price: 0,
          paymentScheme: 'full',
          isDp: false,
          isNobar: true,
          nobarTicket: {
            tier,
            tierLabel: tierMeta.label,
            shortLabel: tierMeta.shortLabel,
            qty,
            unitPrice,
            ticketSubtotal,
            polaroidQty,
            polaroidUnitPrice,
            polaroidTotal,
            participants: cleanParticipants,
            includesMerch,
            merchBundle,
            ticketToken,
            paymentTimeoutMinutes: timeoutMinutes,
            paymentExpiresAt,
            seatRule:
              tier === 'vip'
                ? 'Kursi VIP di samping Kak Aika (2 pembeli pertama yang pembayarannya diverifikasi Admin)'
                : 'Ambil kursi saat event berlangsung di lokasi (siapa cepat dia dapat)',
            eventSnapshot: {
              eventTitle: config.eventTitle,
              movieTitle: config.movieTitle,
              eventDate: config.eventDate,
              eventTime: config.eventTime,
              cinemaLocation: config.cinemaLocation
            }
          }
        };

        const addressDisplay = `Lokasi Nobar: ${config.cinemaLocation} | Peserta (${qty}): ${cleanParticipants.join(', ')}${polaroidQty > 0 ? ` | Add-on: ${polaroidQty}x Foto Polaroid` : ''}`;
        const initialStatus = isReserveOnly ? 'pending' : 'payment_pending';

        const insertRes = await client.query(
          `INSERT INTO orders (
             id, "customerName", email, address, status, total, items, shipping, notes, phone, payment_proof, date, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
           RETURNING *`,
          [
            orderId,
            buyerName,
            buyerEmail,
            addressDisplay,
            initialStatus,
            verifiedTotal,
            JSON.stringify(itemsList),
            JSON.stringify(shipObj),
            cleanNotes || null,
            cleanPhone,
            storedProofUrl
          ]
        );

        const polaroidNoteSuffix = polaroidQty > 0 ? ` + ${polaroidQty}x Foto Polaroid` : '';
        await recordOrderStatusHistory(client, {
          orderId,
          fromStatus: null,
          toStatus: initialStatus,
          actorType: 'customer',
          actorName: buyerEmail,
          note: isReserveOnly
            ? `Kursi dikunci sementara untuk ${qty}x ${tierMeta.label}${polaroidNoteSuffix} (${cleanParticipants.join(', ')}) — batas bayar QRIS ${timeoutMinutes} menit`
            : `Pembelian ${qty}x ${tierMeta.label}${polaroidNoteSuffix} (${cleanParticipants.join(', ')}) beserta bukti pembayaran QRIS`
        });

        return {
          order: insertRes.rows[0],
          config,
          tierMeta,
          verifiedTotal,
          polaroidQty,
          polaroidTotal,
          isReserveOnly,
          paymentExpiresAt,
          timeoutMinutes
        };
      });

      const isDummyEmail =
        !buyerEmail ||
        buyerEmail.endsWith('@example.com') ||
        buyerEmail.endsWith('.local') ||
        buyerEmail.endsWith('@test.com');
      const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(req.headers && req.headers['x-test-suite']);

      if (!createdOrder.isReserveOnly && !isDummyEmail && !isTestEnv) {
        const { order, config, tierMeta, verifiedTotal } = createdOrder;
        const safeName = escapeHtml(buyerName);
        const safeOrderId = escapeHtml(order.id);
        const safeTier = escapeHtml(tierMeta.label);
        const safeParticipants = cleanParticipants.map((p, idx) => `${idx + 1}. ${escapeHtml(p)}`).join('<br/>');
        const polaroidEmailLine = createdOrder.polaroidQty > 0
          ? `<p style="margin:0 0 6px 0;"><strong>Tambahan Foto Polaroid:</strong> ${createdOrder.polaroidQty} Foto (Rp ${createdOrder.polaroidTotal.toLocaleString('id-ID')})</p>`
          : '';

        await dispatchBackgroundTask(async () => {
          const transporter = env.createMailTransport();
          const emailUser = getRequiredEnv('EMAIL_USER');
          const adminEmail = process.env.ADMIN_EMAIL || emailUser;

          await Promise.allSettled([
            transporter.sendMail({
              from: `"Aika Sesilia" <${emailUser}>`,
              to: buyerEmail,
              replyTo: emailUser,
              subject: `[Aika Sesilia] Bukti Pembayaran Tiket Nobar #${order.id} Diterima`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
                  <h2 style="color: #0284c7;">Halo, ${safeName}!</h2>
                  <p>Pesanan <strong>Tiket Nobar Bioskop</strong> Anda beserta bukti transfer telah kami terima dan sedang menunggu verifikasi Admin.</p>
                  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:1rem;margin:1rem 0;">
                    <p style="margin:0 0 6px 0;"><strong>No. Invoice Tiket:</strong> #${safeOrderId}</p>
                    <p style="margin:0 0 6px 0;"><strong>Kategori Tiket:</strong> ${safeTier} (&times;${qty})</p>
                    <p style="margin:0 0 6px 0;"><strong>Daftar Peserta:</strong><br/>${safeParticipants}</p>
                    ${tierMeta.includesMerch ? `<p style="margin:0 0 6px 0;"><strong>Paket Merch:</strong> ${escapeHtml(config.merchBundleDesc)} (Diambil di lokasi bioskop)</p>` : ''}
                    ${polaroidEmailLine}
                    <p style="margin:6px 0 0 0;color:#0284c7;font-size:1.05rem;"><strong>Total Dibayar: Rp ${verifiedTotal.toLocaleString('id-ID')}</strong></p>
                  </div>
                  <p>Setelah diverifikasi Admin, status pesanan Anda di halaman <strong>Profil &gt; Riwayat Pesanan</strong> akan berubah menjadi Terverifikasi dan cukup ditunjukkan ke panitia saat registrasi di bioskop.</p>
                  <p>Salam hangat,<br/><strong>Aika Sesilia</strong></p>
                </div>
              `
            }),
            transporter.sendMail({
              from: `"Aika Sesilia" <${emailUser}>`,
              to: adminEmail,
              replyTo: emailUser,
              subject: `[ADMIN NOBAR] Tiket ${tierMeta.shortLabel} #${order.id} dari ${buyerName}`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
                  <h2 style="color: #0284c7;">Pesanan Tiket Nobar Masuk (#${safeOrderId})</h2>
                  <p><strong>Kategori:</strong> ${safeTier} (&times;${qty})</p>
                  ${polaroidEmailLine}
                  <p><strong>Pembeli:</strong> ${safeName} (${escapeHtml(buyerEmail)} / ${escapeHtml(cleanPhone)})</p>
                  <p><strong>Daftar Peserta:</strong><br/>${safeParticipants}</p>
                  <p><strong>Total Transfer:</strong> Rp ${verifiedTotal.toLocaleString('id-ID')}</p>
                  <p>Bukti pembayaran sudah langsung diunggah pembeli. Silakan verifikasi di Admin Dashboard.</p>
                </div>
              `
            })
          ]);
        }, 'nobar-order-created-emails');
      }

      return res.status(201).json({
        ...createdOrder.order,
        reservationOnly: createdOrder.isReserveOnly,
        paymentExpiresAt: createdOrder.paymentExpiresAt,
        paymentTimeoutMinutes: createdOrder.timeoutMinutes
      });
    }

    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('[API /api/nobar Error]:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};

module.exports.getNobarConfig = getNobarConfig;
module.exports.computeNobarStats = computeNobarStats;
module.exports.DEFAULT_NOBAR_CONFIG = DEFAULT_NOBAR_CONFIG;
