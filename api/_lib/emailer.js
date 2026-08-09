// api/_lib/emailer.js
// Shared notification-email sender. Used by notify.js (the public endpoint)
// and directly by other backend files (e.g. agent-wallets.js for invoice
// events) that need to send an email without a round-trip HTTP call to
// their own API.

export async function sendNotificationEmail(email, subject, message, ctaUrl = 'https://nanarc.xyz/legacy/app.html', ctaLabel = 'Open NAN Wallet') {
  if (!email || !email.includes('@')) return { success: false, error: 'Valid email required' };
  if (!subject || !message) return { success: false, error: 'subject and message required' };

  const smtpUser = process.env.SMTP_USER || process.env.SMTP_FROM;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    console.log(`\n📧 NOTIFY [${email}]\nSubject: ${subject}\n${message}\n`);
    return { success: true, dev: true };
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
      from:    `"NAN" <${smtpUser}>`,
      to:      email,
      subject,
      html: `
        <div style="font-family:'Inter',sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#ffffff;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
            <div style="width:28px;height:28px;border-radius:50%;background:#2563EB;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;">N</div>
            <div style="font-size:18px;font-weight:800;color:#000;">NAN</div>
          </div>
          <div style="background:#f7f8fa;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:18px 20px;color:#1a1a1a;font-size:14px;line-height:1.6;">
            ${message.replace(/\n/g, '<br/>')}
          </div>
          <div style="margin-top:18px;">
            <a href="${ctaUrl}" style="background:#2563EB;color:#fff;padding:11px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">${ctaLabel} &rarr;</a>
          </div>
        </div>
      `,
    });

    return { success: true };

  } catch (err) {
    console.error('[emailer]', err.message);
    return { success: false, error: 'Email failed: ' + err.message.slice(0, 100) };
  }
}
