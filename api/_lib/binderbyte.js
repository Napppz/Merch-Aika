const https = require('https');
const { getRequiredEnv } = require('./env');

const ALLOWED_ENDPOINTS = new Set(['province', 'city', 'cost']);

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { endpoint, ...query } = req.query || {};
  const cleanEndpoint = String(endpoint || '').trim().toLowerCase();

  if (!cleanEndpoint || !ALLOWED_ENDPOINTS.has(cleanEndpoint)) {
    return res.status(400).json({ error: 'endpoint tidak valid (diizinkan: province, city, cost)' });
  }

  let apiKey;
  try {
    apiKey = getRequiredEnv('BINDERBYTE_API_KEY');
  } catch (err) {
    return res.status(503).json({ error: 'Layanan cek ongkir belum dikonfigurasi' });
  }

  const safeParams = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k === 'route' || k === 'api_key') continue;
    if (v !== undefined && v !== null) safeParams.set(k, String(v));
  }
  safeParams.set('api_key', apiKey);

  const url = `https://api.binderbyte.com/v1/${cleanEndpoint}?${safeParams.toString()}`;

  try {
    const response = await new Promise((resolve, reject) => {
      https.get(url, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try {
            resolve({ status: resp.statusCode, data: JSON.parse(data) });
          } catch(e) {
            resolve({ status: resp.statusCode, data: { error: 'Invalid JSON' } });
          }
        });
      }).on('error', reject);
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch from API' });
  }
};
