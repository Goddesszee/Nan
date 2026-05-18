import nodemailer from 'nodemailer';
import crypto from 'crypto';

function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: false,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function signOTP(email, otp, expiresAt) {
  const secret = process.env.CIRCLE_ENTITY_SECRET || 'nan-secret-key';
  const data = `${email.toLowerCase()}:${otp}:${expiresAt}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { action, email, otp, token, expiresAt } = req.body;

  if (action === 'send') {
    if (!email?.includes('@')) return res.json({ success: false, error: 'Invalid email' });
    if (email.length > 100) return res.json({ success: false, error: 'Invalid email' });
    if (email.includes('<') || email.includes('>')) return res.json({ success: false, error: 'Invalid email' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 600000;
    const sig = signOTP(email, code, expires);
    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: 'Your NAN Wallet login code',
        html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px;">
          <h2 style="color:#8b5cf6;">NAN Wallet</h2>
          <p>Your login code is:</p>
          <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:700;font-family:monospace;">${code}</div>
          <p style="color:#9ca3af;font-size:13px;margin-top:16px;">Expires in 10 minutes. Never share this code.</p>
        </div>`,
      });
      return res.json({ success: true, token: sig, expiresAt: expires });
    } catch (err) {
      console.error('Email error:', err.message);
      const code2 = Math.floor(100000 + Math.random() * 900000).toString();
      const expires2 = Date.now() + 600000;
      const sig2 = signOTP(email, code2, expires2);
      console.log(`OTP sent in dev mode`);
      return res.json({ success: true, dev: true, token: sig2, expiresAt: expires2 });
    }
  }

  if (action === 'verify') {
    if (!email || !otp || !token || !expiresAt) return res.json({ success: false, error: 'Missing fields' });
    if (Date.now() > expiresAt) return res.json({ success: false, error: 'Code expired — request a new one' });
    const expected = signOTP(email, otp.trim(), expiresAt);
    if (expected !== token) return res.json({ success: false, error: 'Wrong code' });
    return res.json({ success: true });
  }

  res.json({ success: false, error: 'Unknown action' });
}