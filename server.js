// server.js — Development Server untuk Aika Sesilia
// Jalankan dengan: npm run dev

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// CORS Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── API: Admin Login ──
app.post('/api/admin-login', (req, res) => {
  const { username, password } = req.body;

  // Validasi input
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username dan password diperlukan'
    });
  }

  // Admin credentials (hardcoded untuk development)
  const ADMIN_USERNAME = 'aika';
  const ADMIN_PASSWORD = 'admin123';

  try {
    // Verifikasi credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      return res.status(200).json({
        success: true,
        message: 'Login admin berhasil',
        admin: {
          username: username,
          role: 'admin'
        }
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Username atau password admin salah!'
      });
    }
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ── API: Get All Users ──
app.get('/api/users', (req, res) => {
  // Check admin auth dari header atau session
  // Untuk now, return test users
  const testUsers = [
    {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      phone: '08123456789',
      verified: true,
      created_at: '2026-01-15T10:30:00Z'
    },
    {
      id: 2,
      username: 'aika',
      email: 'aika@example.com',
      phone: '08987654321',
      verified: true,
      created_at: '2026-02-10T14:45:00Z'
    }
  ];

  return res.status(200).json({
    success: true,
    users: testUsers,
    total: testUsers.length
  });
});

// ── API: User Login ──
app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email/username dan password diperlukan'
    });
  }

  // Test users untuk development
  const testUsers = [
    {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      phone: '08123456789',
      password: 'password123', // plaintext untuk test
      verified: true
    },
    {
      id: 2,
      username: 'aika',
      email: 'aika@example.com',
      phone: '08987654321',
      password: 'aika123',
      verified: true
    }
  ];

  try {
    // Cari user berdasarkan email atau username
    const user = testUsers.find(u => 
      (u.email === identifier || u.username === identifier) && u.password === password
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email/username atau password salah!'
      });
    }

    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message: 'Akun belum diverifikasi. Periksa email kamu.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        verified: user.verified
      }
    });
  } catch (err) {
    console.error('User login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ── API: Forgot Password (stub) ──
app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email diperlukan'
    });
  }

  // Stub response
  return res.status(200).json({
    success: true,
    message: 'Jika email terdaftar, instruksi reset password telah dikirim'
  });
});

// ── Serve static files (fallback untuk SPA) ──
app.get('/*', (req, res) => {
  // Jika file tidak ada, serve index.html
  const filepath = path.join(__dirname, req.path);
  if (filepath.includes('api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start Server ──
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   AIKA SESILIA — Development Server                      ║
╠═══════════════════════════════════════════════════════════╣
║   Server berjalan di: http://localhost:${PORT}               ║
║                                                           ║
║   👤 ADMIN LOGIN:                                         ║
║   Username: aika | Password: admin123                     ║
║                                                           ║
║   👥 USER TEST ACCOUNTS:                                  ║
║   Email: test@example.com | Password: password123         ║
║   Email: aika@example.com | Password: aika123             ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
