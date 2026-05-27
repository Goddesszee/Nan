// api/notify.js
// Sends email notifications for payment events
// Uses nodemailer (same as otp.js) or logs to console in dev

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, subject, message } = req.body || {};
  if (!email || !email.includes('@'))
    return res.json({ success: false, error: 'Valid email required' });
  if (!subject || !message)
    return res.json({ success: false, error: 'subject and message required' });

  // ── Dev mode — just log ────────────────────────────────────────────────────
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_FROM;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    console.log(`\n📧 NOTIFY [${email}]\nSubject: ${subject}\n${message}\n`);
    return res.json({ success: true, dev: true });
  }

  try {
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: parseInt(process.env.SMTP_PORT || '587') === 465,
      auth:   { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from:    `"NAN Wallet" <${smtpUser}>`,
      to:      email,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <div style="background:#07081a;border-radius:16px;padding:24px;">
            <div style="font-size:22px;font-weight:700;color:#a78bfa;margin-bottom:6px;">NAN Wallet</div>
            <div style="color:#c4b5fd;font-size:13px;margin-bottom:20px;">Weave. Connect. Build.</div>
            <div style="background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.25);border-radius:10px;padding:16px;color:#ede9fe;font-size:14px;line-height:1.6;">
              ${message.replace(/\n/g, '<br/>')}
            </div>
            <div style="margin-top:16px;">
              <a href="https://nanarc.xyz/app.html" style="background:#8b5cf6;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Open NAN Wallet →</a>
            </div>
          </div>
        </div>
      `,
    });

    return res.json({ success: true });

  } catch (err) {
    console.error('[notify]', err.message);
    return res.json({ success: false, error: 'Email failed: ' + err.message.slice(0, 100) });
  }
}
