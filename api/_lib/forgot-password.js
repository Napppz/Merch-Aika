const { query } = require('./_db');
const crypto = require('crypto');
const { createMailTransport, getRequiredEnv } = require('./env');

const transporter = createMailTransport();

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
      return res.status(404).json({ error: 'Email tidak terdaftar di sistem kami.' });
    }

    // Bikin Token Reset Acak (Hex)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 Menit

    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        email VARCHAR(255) PRIMARY KEY,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL
      );
    `);

    await query(`DELETE FROM password_reset_tokens WHERE email = $1`, [email]);
    await query(`
      INSERT INTO password_reset_tokens (email, token, expires_at)
      VALUES ($1, $2, $3)
    `, [email, token, expiresAt]);

    const host = req.headers.origin || req.headers.host || 'merch-aika.vercel.app';
    const resetLink = `${host.startsWith('http') ? host : 'https://' + host}/login.html?reset=${token}`;
    const emailUser = getRequiredEnv('EMAIL_USER');

    const mailOptions = {
      from: `"Aika Sesilia" <${emailUser}>`,
      to: email,
      replyTo: emailUser,
      subject: '[Aika Sesilia] Instruksi Reset Password Akun Anda',
      headers: {
        'X-Entity-Ref-ID': `aika-reset-${Date.now()}`,
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        'X-Priority': '1',
        'Importance': 'high',
      },
      text: `Halo,\n\nKami menerima permintaan untuk mereset password akun Aika Sesilia Anda.\n\nKlik tautan berikut untuk membuat password baru (berlaku 15 menit):\n${resetLink}\n\nJika Anda tidak meminta reset password, abaikan email ini.\n\nSalam,\nAika Sesilia Merch`,
      html: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Password Aika Sesilia</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f4f7fa; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04);">
          
          <tr>
            <td align="center" style="background: #0f172a; padding: 28px 20px; border-bottom: 3px solid #0284c7;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">✦ AIKA SESILIA</h1>
              <p style="margin: 4px 0 0 0; color: #38bdf8; font-size: 13px; font-weight: 500;">Official Merchandise Store</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 28px 24px 28px;">
              <p style="margin: 0 0 16px 0; color: #1e293b; font-size: 16px; line-height: 1.5;">Halo,</p>
              <p style="margin: 0 0 24px 0; color: #475569; font-size: 15px; line-height: 1.6;">
                Kami menerima permintaan untuk mereset password akun <strong>Aika Sesilia</strong> Anda. Klik tombol di bawah ini untuk membuat password baru:
              </p>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 8px;">
                      Reset Password Saya →
                    </a>
                  </td>
                </tr>
              </table>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
                      ⏱ Tautan ini hanya berlaku selama <strong>15 menit</strong>. Jangan bagikan link ini kepada siapapun.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                Jika Anda tidak meminta perubahan password, Anda dapat mengabaikan email ini dengan aman.
              </p>
            </td>
          </tr>

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
      res.status(200).json({ success: true, message: 'Reset link dikirim' });
    } catch (mailErr) {
      console.error('Nodemailer Error:', mailErr.message);
      return res.status(500).json({ error: 'Gagal mengirim email (Masalah Kredensial/SMTP)' });
    }

  } catch (err) {
    console.error('Reset error:', err.message);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};
