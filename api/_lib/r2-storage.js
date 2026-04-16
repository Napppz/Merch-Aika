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

  const accountId = getRequiredEnv('2e58f0cc6bacf0060435d7437411cbd8');
  const accessKeyId = getRequiredEnv('9cba9ff9bb29e821887a9e1eb9ff7676');
  const secretAccessKey = getRequiredEnv('419452e298ecc325f2550da058e0a7e53851f94b9fc348695d802680fa10fb5a');

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

function validateImageUpload({ mimeType, size }) {
  if (!ALLOWED_IMAGE_TYPES[mimeType]) {
    throw new Error('Tipe gambar hanya boleh JPG, PNG, atau WebP');
  }

  if (!size || size <= 0) {
    throw new Error('File gambar kosong');
  }

  if (size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Ukuran gambar maksimal 5MB');
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
  validateImageUpload({ mimeType, size: buffer.length });

  const objectKey = generateObjectKey({ folder, fileName, mimeType, prefix });
  const client = getR2Client();

  await client.send(new PutObjectCommand({
    Bucket: getBucketName(),
    Key: objectKey,
    Body: buffer,
    ContentType: mimeType,
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
  validateImageUpload({ mimeType, size: buffer.length });

  return { mimeType, buffer };
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  buildPublicUrl,
  parseDataUrlImage,
  uploadImageBuffer,
  validateImageUpload
};
