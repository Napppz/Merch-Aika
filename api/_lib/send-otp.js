// api/send-otp.js — Vercel Serverless Function
// Mengirim kode OTP via email menggunakan Nodemailer / SMTP dengan standar Anti-Spam Gmail

const { query } = require('./_db');
const { createMailTransport, getRequiredEnv } = require('./env');

const transporter = createMailTransport();

module.exports = async function handler(req, res) {
  // ─── SECURITY & CORS HEADERS ───
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
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
  }

  const emailUser = getRequiredEnv('EMAIL_USER');
  const cleanOtp = String(otp).trim();

  // Konfigurasi Email Standar Transaksional (Mengurangi risiko masuk spam)
  const mailOptions = {
    from: `"Aika Sesilia" <${emailUser}>`,
    to: email,
    replyTo: emailUser,
    subject: `[Aika Sesilia] ${cleanOtp} adalah Kode Verifikasi Anda`,
    headers: {
      'X-Entity-Ref-ID': `aika-otp-${Date.now()}-${cleanOtp}`,
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      'X-Priority': '1',
      'Importance': 'high',
    },
    text: `Halo,\n\nKode verifikasi akun Aika Sesilia kamu adalah: ${cleanOtp}\n\nKode ini berlaku selama 10 menit. Jangan berikan kode ini kepada siapapun demi keamanan akun kamu.\n\nJika kamu tidak melakukan permintaan ini, silakan abaikan email ini.\n\nSalam,\nTim Aika Sesilia Merch`,
    html: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kode Verifikasi Aika Sesilia</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f4f7fa; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04);">
          
          <!-- Header Banner -->
          <tr>
            <td align="center" style="background: #0f172a; padding: 28px 20px; border-bottom: 3px solid #0284c7;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">✦ AIKA SESILIA</h1>
              <p style="margin: 4px 0 0 0; color: #38bdf8; font-size: 13px; font-weight: 500;">Official Merchandise Store</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px 24px 28px;">
              <p style="margin: 0 0 16px 0; color: #1e293b; font-size: 16px; line-height: 1.5;">Halo,</p>
              <p style="margin: 0 0 24px 0; color: #475569; font-size: 15px; line-height: 1.6;">
                Gunakan kode verifikasi (OTP) berikut untuk menyelesaikan pendaftaran akun Anda di <strong>Aika Sesilia</strong>:
              </p>

              <!-- OTP Code Display -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center" style="background-color: #f0f9ff; border: 2px dashed #0284c7; border-radius: 10px; padding: 18px 10px;">
                    <div style="font-size: 34px; font-weight: 800; color: #0284c7; letter-spacing: 8px; font-family: 'Courier New', Courier, monospace; line-height: 1;">
                      ${cleanOtp}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Notice -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
                      ⏱ Kode ini berlaku selama <strong>10 menit</strong>. Jangan berikan kode ini kepada siapapun termasuk pihak yang mengatasnamakan Aika Sesilia.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                Jika Anda tidak merasa melakukan pendaftaran akun, silakan abaikan email ini dengan aman.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                Email ini dikirim secara otomatis oleh sistem keamanan Aika Sesilia.<br />
                &copy; ${new Date().getFullYear()} Aika Sesilia Merch Store.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: 'OTP dikirim via email' });
  } catch (err) {
    console.error('Email send error:', err.message);
    return res.status(500).json({ error: 'Gagal mengirim email', detail: err.message });
  }
};
