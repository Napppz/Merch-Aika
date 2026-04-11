const { query } = require('./_db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || process.env.SMTP_USER || 'aika.sesilia.merch@gmail.com',
    pass: process.env.EMAIL_PASS || process.env.SMTP_PASS || 'your-app-password-here',
  },
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email diperlukan' });

  try {
    // Cek apakah user ada
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      // Return 200 biar hacker ga tau email ini ke daftar apa ga (security best practice)
      return res.status(200).json({ success: true });
    }

    // Bikin Token Reset Acak (Hex)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 Menit

    // Simpan ke DB. Karena nggak punya tabel 'password_reset_tokens' yg dijamin ada, 
    // Kita pinjam tabel 'otp_codes' aja (code = token) agar tidak error SQL "table not found" 
    // atau kita run tabelnya kalau belum ada:
    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        email VARCHAR(255) PRIMARY KEY,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL
      );
    `);

    await query(`
      INSERT INTO password_reset_tokens (email, token, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE SET token = $2, expires_at = $3;
    `, [email, token, expiresAt]);

    // Kirim Email
    // Untuk deteksi URL: Host header dr vercel/localhost
    const host = req.headers.origin || req.headers.host || 'merch-aika.vercel.app';
    const resetLink = `${host.startsWith('http') ? host : 'https://' + host}/login.html?reset=${token}`;

    const mailOptions = {
      from: `"Aika Sesilia Merch" <${process.env.EMAIL_USER || process.env.SMTP_USER || 'aika.sesilia.merch@gmail.com'}>`,
      to: email,
      subject: 'Reset Password Akun Aika Sesilia',
      html: `
        <div style="font-family: Arial, sans-serif; background: #03091f; padding: 40px; color: #e0f0ff;">
          <div style="max-width: 500px; margin: 0 auto; background: #0a3872; padding: 30px; border-radius: 12px; text-align: center;">
            <h2 style="color: #29b6f6;">Permintaan Reset Password</h2>
            <p>Halo, kami menerima permintaan untuk mereset password akun Aika Sesilia milikmu.</p>
            <p>Silakan klik tombol di bawah ini untuk membuat password baru. Tautan ini hanya berlaku selama 15 menit.</p>
            <a href="${resetLink}" style="display: inline-block; margin: 20px 0; padding: 12px 24px; background: #29b6f6; color: #fff; text-decoration: none; border-radius: 50px; font-weight: bold;">Ubah Password</a>
            <p style="font-size: 0.85rem; color: #90b8d8;">Jika kamu tidak merasa meminta reset password, abaikan email ini.</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: 'Reset link dikirim' });

  } catch (err) {
    console.error('Reset error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};