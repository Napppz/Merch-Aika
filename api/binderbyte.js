const https = require('https');

module.exports = async (req, res) => {
  const { endpoint, ...query } = req.query;
  
  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint is required (e.g., province, city, cost)' });
  }

  const apiKey = '26e38b730ae551e040d1d2658fdc1f8b4313d243774975aacd3daa1289716c2f';
  query.api_key = apiKey;
  
  const queryString = new URLSearchParams(query).toString();
  const url = `https://api.binderbyte.com/v1/${endpoint}?${queryString}`;

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
