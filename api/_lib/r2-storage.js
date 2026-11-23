const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

let cachedClient = null;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

function getR2Client() {
  if (cachedClient) return cachedClient;

  const accountId = getRequiredEnv('R2_ACCOUNT_ID');
  const accessKeyId = getRequiredEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = getRequiredEnv('R2_SECRET_ACCESS_KEY');

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  return cachedClient;
}

function getBucketName() {
  return getRequiredEnv('R2_BUCKET_NAME');
}

function getPublicBaseUrl() {
  const baseUrl = getRequiredEnv('R2_PUBLIC_BASE_URL').trim();
  return baseUrl.replace(/\/+$/, '');
}

function hasR2Config() {
  return [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL'
  ].every((name) => {
    const value = process.env[name];
    return typeof value === 'string' && value.trim() !== '';
  });
}

function detectImageMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: RIFF....WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function validateImageUpload({ mimeType, size, buffer }) {
  if (!ALLOWED_IMAGE_TYPES[mimeType]) {
    throw new Error('Tipe gambar hanya boleh JPG, PNG, atau WebP');
  }

  if (!size || size <= 0) {
    throw new Error('File gambar kosong');
  }

  if (size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Ukuran gambar maksimal 5MB');
  }

  if (buffer) {
    const detectedMime = detectImageMimeFromBuffer(buffer);
    if (!detectedMime || !ALLOWED_IMAGE_TYPES[detectedMime]) {
      throw new Error('Konten biner file bukan gambar JPG, PNG, atau WebP yang valid');
    }
  }
}

function sanitizeFileName(fileName = '') {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'image';
}

function generateObjectKey({ folder = 'products', fileName, mimeType, prefix }) {
  const ext = ALLOWED_IMAGE_TYPES[mimeType];
  const safeName = sanitizeFileName(fileName).replace(/\.[a-z0-9]+$/i, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomId = crypto.randomBytes(6).toString('hex');
  const parts = [folder, prefix, `${stamp}-${randomId}-${safeName}.${ext}`].filter(Boolean);
  return parts.join('/');
}

function buildPublicUrl(objectKey) {
  return `${getPublicBaseUrl()}/${objectKey}`;
}

async function uploadImageBuffer({ buffer, mimeType, fileName, folder = 'products', prefix }) {
  validateImageUpload({ mimeType, size: buffer.length, buffer });
  const verifiedMime = detectImageMimeFromBuffer(buffer) || mimeType;

  const objectKey = generateObjectKey({ folder, fileName, mimeType: verifiedMime, prefix });
  const client = getR2Client();

  await client.send(new PutObjectCommand({
    Bucket: getBucketName(),
    Key: objectKey,
    Body: buffer,
    ContentType: verifiedMime,
    CacheControl: 'public, max-age=31536000, immutable'
  }));

  return {
    objectKey,
    imageUrl: buildPublicUrl(objectKey)
  };
}

function parseDataUrlImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl || '');
  if (!match) {
    throw new Error('Format base64 gambar tidak valid');
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  validateImageUpload({ mimeType, size: buffer.length, buffer });
  const verifiedMime = detectImageMimeFromBuffer(buffer) || mimeType;

  return { mimeType: verifiedMime, buffer };
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  buildPublicUrl,
  hasR2Config,
  parseDataUrlImage,
  uploadImageBuffer,
  validateImageUpload
};
