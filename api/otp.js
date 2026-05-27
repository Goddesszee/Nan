// api/otp.js
// Email OTP login — uses Resend HTTP API directly (more reliable than SMTP)
// Sends from noreply@nanarc.xyz via Resend
// Required env vars: SMTP_PASS (Resend API key), SMTP_FROM (optional)

import crypto from 'crypto';

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

function signOTP(email, otp, expiresAt) {
  const secret = process.env.CIRCLE_ENTITY_SECRET || 'nan-dev-secret-key';
  const data   = `${email.toLowerCase().trim()}:${otp.trim()}:${Math.floor(Number(expiresAt))}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function generateCode() {
  return Math.floor(100_000 + Math.random() * 900_000).toString();
}

async function sendEmail(to, code) {
  const apiKey  = process.env.SMTP_PASS; // Resend API key
  const from    = process.env.SMTP_FROM || 'NAN Wallet <noreply@nanarc.xyz>';

  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from,
      to:      [to],
      subject: 'Your NAN Wallet login code',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                    max-width:440px;margin:0 auto;background:#0f0f1a;border-radius:16px;
                    overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
          <div style="background:linear-gradient(135deg,#1a0a2e,#16213e);padding:32px;text-align:center;">
            <div style="font-size:28px;font-weight:800;color:#8b5cf6;letter-spacing:-0.5px;">
              NAN <span style="color:#a78bfa;">✦</span>
            </div>
            <div style="color:#6b7280;font-size:13px;margin-top:4px;">
              Stablecoin Wallet on Arc · Powered by Circle
            </div>
          </div>
          <div style="padding:32px;">
            <p style="color:#e5e7eb;font-size:16px;margin:0 0 24px;">
              Your one-time login code:
            </p>
            <div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.4);
                        border-radius:12px;padding:28px;text-align:center;
                        letter-spacing:12px;font-size:36px;font-weight:700;
                        font-family:'Courier New',monospace;color:#a78bfa;">
              ${code}
            </div>
            <p style="color:#6b7280;font-size:13px;margin-top:20px;text-align:center;">
              ⏱ Expires in 10 minutes &nbsp;·&nbsp; Never share this code
            </p>
          </div>
          <div style="background:rgba(0,0,0,0.3);padding:16px 32px;text-align:center;
                      border-top:1px solid rgba(139,92,246,0.1);">
            <p style="color:#4b5563;font-size:12px;margin:0;">
              NAN Wallet · <a href="https://nanarc.xyz" style="color:#8b5cf6;text-decoration:none;">nanarc.xyz</a>
              &nbsp;·&nbsp; Built on Arc Testnet by Circle
            </p>
          </div>
        </div>`,
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data?.message || data?.name || `Resend error ${r.status}`);
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, otp, token, expiresAt } = req.body;

  // ── send ─────────────────────────────────────────────────────────────────
  if (action === 'send') {
    if (!email?.includes('@'))                       return res.json({ success: false, error: 'Invalid email' });
    if (email.length > 100)                          return res.json({ success: false, error: 'Email too long' });
    if (email.includes('<') || email.includes('>'))  return res.json({ success: false, error: 'Invalid email' });

    if (!checkOtpLimit(email.toLowerCase()))
      return res.json({ success: false, error: 'Too many codes — try again in 1 hour' });

    const code    = generateCode();
    const expires = Date.now() + 600_000;
    const sig     = signOTP(email, code, expires);

    if (process.env.SMTP_PASS) {
      try {
        await sendEmail(email, code);
        return res.json({ success: true, token: sig, expiresAt: expires });
      } catch (err) {
        console.error('Resend error:', err.message);
        // Fall through to dev mode
      }
    }

    // Dev fallback
    console.log(`[NAN DEV] OTP for ${email}: ${code}`);
    return res.json({ success: true, dev: true, token: sig, expiresAt: expires });
  }

  // ── verify ────────────────────────────────────────────────────────────────
  if (action === 'verify') {
    console.log('[OTP verify]', { email, otp, token: token?.slice(0,8), expiresAt, now: Date.now() });
    if (!email || !otp || !token || !expiresAt)
      return res.json({ success: false, error: 'Missing fields: '+JSON.stringify({email:!!email,otp:!!otp,token:!!token,expiresAt:!!expiresAt}) });
    if (typeof otp !== 'string' || otp.length !== 6 || !/^\d+$/.test(otp))
      return res.json({ success: false, error: 'Code must be 6 digits' });
    if (Date.now() > Number(expiresAt))
      return res.json({ success: false, error: 'Code expired — request a new one' });

    const expected = signOTP(email, otp.trim(), Number(expiresAt));
    console.log('[OTP verify] expected:', expected?.slice(0,8), 'got:', token?.slice(0,8));
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token,    'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.json({ success: false, error: 'Wrong code — expected:'+expected?.slice(0,8)+' got:'+token?.slice(0,8) });

    return res.json({ success: true });
  }

  return res.json({ success: false, error: 'Unknown action' });
}
