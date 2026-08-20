/**
 * server.js — Local development server for Merch-Aika
 * Serves static HTML/CSS/JS files and routes /api/* requests to api/[route].js
 */

require('dotenv').config({ path: '.env.local' });

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 400 ? '\x1b[31m' : res.statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}[${res.statusCode}]\x1b[0m ${req.method} ${req.url} — ${ms}ms`);
  });
  next();
});

// ── API Router ──────────────────────────────────────────────────────────────
app.all('/api/:route', async (req, res) => {
  const route = req.params.route;
  req.query.route = route;

  try {
    const handler = require('./api/[route].js');

    // Clear module cache for live reload in dev
    delete require.cache[require.resolve('./api/[route].js')];
    try {
      delete require.cache[require.resolve(`./api/_lib/${route}.js`)];
    } catch (_) {}

    return await handler(req, res);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return res.status(404).json({ error: `Endpoint /api/${route} tidak ditemukan` });
    }
    console.error(`\x1b[31m[API ERROR] /api/${route}:\x1b[0m`, err.message);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// ── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html']
}));

// Admin page fallback
app.get('/admin/:page', (req, res) => {
  const filePath = path.join(__dirname, 'admin', req.params.page + '.html');
  res.sendFile(filePath, err => {
    if (err) res.status(404).send('Halaman admin tidak ditemukan');
  });
});

// Root fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\x1b[36m');
  console.log('==============================================');
  console.log(`  ✦ Merch-Aika Dev Server Running`);
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log('==============================================');
  console.log('\x1b[0m');
});
