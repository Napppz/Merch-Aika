// api/send-otp.js — Vercel Serverless Function
// Mengirim kode OTP via email menggunakan Nodemailer / SMTP

const { query } = require('./_db');

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // atau 'smtp.mailtrap.io' untuk testing
  auth: {
    user: process.env.EMAIL_USER || process.env.SMTP_USER || 'aika.sesilia.merch@gmail.com',   // Gunakan fallback agar mirip dengan orders.js
    pass: process.env.EMAIL_PASS || process.env.SMTP_PASS || 'your-app-password-here',   // App Password
  },
});

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'email dan otp diperlukan' });
  }

  // Simpan OTP sementara di DB dengan expiry 10 menit
  try {
    await query(
      `INSERT INTO otp_codes (email, code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (email)
       DO UPDATE SET code = $2, expires_at = NOW() + INTERVAL '10 minutes', created_at = NOW()`,
      [email, otp]
    );
  } catch (err) {
    console.error('DB OTP insert error:', err.message);
    // Lanjutkan meski DB gagal (OTP masih di sisi client untuk demo)
  }

  // Kirim email
  const mailOptions = {
    from: `"Aika Sesilia ✦" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `[${otp}] Kode Verifikasi Aika Sesilia`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin:0; padding:0; font-family: 'Nunito', Arial, sans-serif; background:#03091f; color:#e0f0ff; }
    .container { max-width:520px; margin:40px auto; background:rgba(10,56,114,0.4); border:1px solid rgba(41,182,246,0.25); border-radius:24px; overflow:hidden; }
    .header { background:linear-gradient(135deg,#1565c0,#0a3872); padding:2rem; text-align:center; }
    .header h1 { margin:0; font-size:1.5rem; color:#fff; letter-spacing:0.05em; }
    .header .logo { font-size:2.5rem; display:block; margin-bottom:0.5rem; }
    .body { padding:2.5rem 2rem; text-align:center; }
    .otp-box { display:inline-block; background:rgba(3,9,31,0.6); border:2px solid #29b6f6; border-radius:16px; padding:1rem 2.5rem; margin:1.5rem 0; }
    .otp-code { font-size:2.8rem; font-weight:900; letter-spacing:0.3em; color:#29b6f6; font-family: monospace; }
    .expire-note { font-size:0.85rem; color:#90b8d8; margin-top:0.5rem; }
    .warning { background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:0.8rem 1rem; font-size:0.82rem; color:#fca5a5; margin-top:1.5rem; }
    .footer { background:rgba(3,9,31,0.4); padding:1rem 2rem; text-align:center; font-size:0.78rem; color:#90b8d8; border-top:1px solid rgba(41,182,246,0.15); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="logo">✦</span>
      <h1>Aika Sesilia</h1>
    </div>
    <div class="body">
      <p style="font-size:1rem;color:#e0f0ff">Halo! Berikut kode verifikasi akun kamu:</p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
      </div>
      <p class="expire-note">⏱ Kode ini berlaku selama <strong>10 menit</strong>.</p>
      <p style="color:#90b8d8;font-size:0.9rem;line-height:1.6">Masukkan kode ini di halaman pendaftaran Aika Sesilia. Jangan bagikan kode ini kepada siapapun.</p>
      <div class="warning">
        🔒 Jika kamu tidak mendaftar di Aika Sesilia, abaikan email ini.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Aika Sesilia Merch Store &nbsp;·&nbsp;
      <a href="https://merch-aika.vercel.app" style="color:#29b6f6">merch-aika.vercel.app</a>
    </div>
  </div>
</body>
</html>
    `,
  };

  try {
    // Hilangkan if (process.env.SMTP_USER...) blocker agar fallback ke default email tetap dieksekusi 
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: 'OTP dikirim via email' });
  } catch (err) {
    console.error('Email send error:', err.message);
    return res.status(500).json({ error: 'Gagal mengirim email', detail: err.message });
  }
};
