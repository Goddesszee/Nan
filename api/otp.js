// api/otp.js
// Email OTP login — HMAC-signed codes, rate limited per email
// Fix: dev-mode fallback now logs AND signs the SAME code (was signing code2 but logging code2 separately)

import nodemailer from 'nodemailer';
import crypto     from 'crypto';

const otpRateLimit = new Map();

function checkOtpLimit(email) {
  const now    = Date.now();
  const record = otpRateLimit.get(email) || { count: 0, start: now };
  if (now - record.start > 3_600_000) {
    otpRateLimit.set(email, { count: 1, start: now });
    return true;
  }
  if (record.count >= 5) return false;
  record.count++;
  otpRateLimit.set(email, record);
  return true;
}

function getMailer() {
  return nodemailer.createTransport({
    host:       process.env.SMTP_HOST,
    port:       parseInt(process.env.SMTP_PORT || '587'),
    // port 587 + requireTLS=true is the correct combo for STARTTLS
    // port 465 + secure=true  is the correct combo for implicit TLS
    // Do NOT mix secure:false with port 465
    secure:     parseInt(process.env.SMTP_PORT || '587') === 465,
    requireTLS: parseInt(process.env.SMTP_PORT || '587') !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function signOTP(email, otp, expiresAt) {
  const secret = process.env.CIRCLE_ENTITY_SECRET || 'nan-dev-secret-key';
  const data   = `${email.toLowerCase()}:${otp}:${expiresAt}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function generateCode() {
  return Math.floor(100_000 + Math.random() * 900_000).toString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, otp, token, expiresAt } = req.body;

  // ── send ─────────────────────────────────────────────────────────────────
  if (action === 'send') {
    if (!email?.includes('@'))                return res.json({ success: false, error: 'Invalid email' });
    if (email.length > 100)                   return res.json({ success: false, error: 'Email too long' });
    if (email.includes('<') || email.includes('>')) return res.json({ success: false, error: 'Invalid email' });

    if (!checkOtpLimit(email.toLowerCase()))
      return res.json({ success: false, error: 'Too many codes — try again in 1 hour' });

    const code    = generateCode();
    const expires = Date.now() + 600_000; // 10 min
    const sig     = signOTP(email, code, expires);

    // Try real email first
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const mailer = getMailer();
        await mailer.sendMail({
          from:    process.env.SMTP_USER,
          to:      email,
          subject: 'Your NAN Wallet login code',
          html: `
            <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px;">
              <h2 style="color:#8b5cf6;">NAN Wallet</h2>
              <p>Your login code is:</p>
              <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;
                          letter-spacing:8px;font-size:32px;font-weight:700;font-family:monospace;">
                ${code}
              </div>
              <p style="color:#9ca3af;font-size:13px;margin-top:16px;">
                Expires in 10 minutes. Never share this code.
              </p>
            </div>`,
        });
        return res.json({ success: true, token: sig, expiresAt: expires });
      } catch (err) {
        console.error('SMTP error:', err.message);
        // Fall through to dev mode
      }
    }

    // Dev mode fallback — SAME code is both logged and signed
    // (Previously the bug was: code logged, but code2 was generated & signed separately)
    console.log(`[NAN DEV] OTP for ${email}: ${code}`);
    return res.json({ success: true, dev: true, token: sig, expiresAt: expires });
  }

  // ── verify ────────────────────────────────────────────────────────────────
  if (action === 'verify') {
    if (!email || !otp || !token || !expiresAt)
      return res.json({ success: false, error: 'Missing fields' });
    if (typeof otp !== 'string' || otp.length !== 6 || !/^\d+$/.test(otp))
      return res.json({ success: false, error: 'Code must be 6 digits' });
    if (Date.now() > Number(expiresAt))
      return res.json({ success: false, error: 'Code expired — request a new one' });

    const expected = signOTP(email, otp.trim(), Number(expiresAt));
    // Use timingSafeEqual to prevent timing attacks
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token,    'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.json({ success: false, error: 'Wrong code — try again' });

    return res.json({ success: true });
  }

  return res.json({ success: false, error: 'Unknown action' });
}
