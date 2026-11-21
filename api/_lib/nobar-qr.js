const crypto = require('crypto');
const QRCode = require('qrcode');
const { getRequiredEnv } = require('./env');

const QR_PREFIX = 'AIKANOBAR';

function getQrSigningSecret() {
  const jwtSecret = getRequiredEnv('JWT_SECRET');
  return `nobar-eticket-qr:${jwtSecret}`;
}

function generateNobarQrToken(orderId, buyerEmail) {
  const cleanId = String(orderId || '').trim().toUpperCase();
  const cleanEmail = String(buyerEmail || '').trim().toLowerCase();
  if (!cleanId) return '';

  const message = `${cleanId}|${cleanEmail}`;
  const sig = crypto
    .createHmac('sha256', getQrSigningSecret())
    .update(message)
    .digest('hex')
    .slice(0, 14)
    .toUpperCase();

  return `${QR_PREFIX}|${cleanId}|${sig}`;
}

function parseNobarQrScanInput(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return { mode: 'invalid', orderId: '', sig: '', raw: '' };
  }

  // Full QR token: AIKANOBAR|INV-20261121-01|A1B2C3D4E5F678
  if (trimmed.toUpperCase().startsWith(`${QR_PREFIX}|`)) {
    const parts = trimmed.split('|');
    if (parts.length !== 3) {
      return { mode: 'invalid', orderId: '', sig: '', raw: trimmed };
    }
    const orderId = String(parts[1] || '').trim().toUpperCase();
    const sig = String(parts[2] || '').trim().toUpperCase();
    if (!orderId || !sig) {
      return { mode: 'invalid', orderId: '', sig: '', raw: trimmed };
    }
    return { mode: 'qr', orderId, sig, raw: trimmed };
  }

  // Fallback manual lookup by Invoice ID (INV-... or ORD-...)
  if (/^(INV|ORD)-[A-Z0-9-]+$/i.test(trimmed)) {
    return { mode: 'manual', orderId: trimmed.toUpperCase(), sig: '', raw: trimmed };
  }

  return { mode: 'invalid', orderId: '', sig: '', raw: trimmed };
}

function verifyNobarQrToken(rawToken, orderRow) {
  if (!orderRow || !orderRow.id) {
    return { valid: false, reason: 'missing_order' };
  }
  const parsed = parseNobarQrScanInput(rawToken);
  if (parsed.mode !== 'qr') {
    return { valid: false, reason: 'invalid_format' };
  }

  const cleanOrderId = String(orderRow.id || '').trim().toUpperCase();
  if (parsed.orderId !== cleanOrderId) {
    return { valid: false, reason: 'order_mismatch' };
  }

  const expectedToken = generateNobarQrToken(orderRow.id, orderRow.email || '');
  const actualNormalized = `${QR_PREFIX}|${parsed.orderId}|${parsed.sig}`;

  const expectedBuf = Buffer.from(expectedToken, 'utf8');
  const actualBuf = Buffer.from(actualNormalized, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  const matched = crypto.timingSafeEqual(expectedBuf, actualBuf);
  return { valid: matched, reason: matched ? 'ok' : 'signature_mismatch' };
}

async function generateNobarQrDataUrl(token) {
  if (!token) return '';
  return QRCode.toDataURL(token, {
    width: 340,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#03091F',
      light: '#FFFFFF'
    }
  });
}

async function generateNobarQrPngBuffer(token) {
  if (!token) return null;
  return QRCode.toBuffer(token, {
    width: 340,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#03091F',
      light: '#FFFFFF'
    }
  });
}

module.exports = {
  QR_PREFIX,
  generateNobarQrToken,
  parseNobarQrScanInput,
  verifyNobarQrToken,
  generateNobarQrDataUrl,
  generateNobarQrPngBuffer
};
