// NAN OTP Handler
// Stores encrypted wallet keys server-side so users get same wallet on any device
// Private key is encrypted with a key derived from their email + a secret
// Server stores encrypted blob — cannot decrypt without the secret

const crypto = require('crypto');

const otpCache = {};
const walletStore = {}; // email -> { encryptedKey, address }

const ENCRYPTION_SECRET = process.env.WALLET_SECRET || 'nan-wallet-encryption-secret-v1';

// Encrypt private key before storing
function encryptKey(privateKey, email) {
  const key = crypto.scryptSync(email + ENCRYPTION_SECRET, 'nan-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt private key
function decryptKey(encryptedData, email) {
  const [ivHex, encrypted] = encryptedData.split(':');
  const key = crypto.scryptSync(email + ENCRYPTION_SECRET, 'nan-salt', 32);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function sendOTPEmail(email, otp) {
  const SMTP_USER = process.env.SMTP_USER || '';
  const SMTP_PASS = process.env.SMTP_PASS || '';
  const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');

  if (!SMTP_USER || !SMTP_PASS) {
    console.log(`\n📧 DEV MODE - OTP for ${email}: ${otp}\n`);
    return { dev: true };
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: `"NAN Wallet" <${SMTP_USER}>`,
    to: email,
    subject: 'Your NAN login code',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;">
        <div style="background:#07081a;border-radius:16px;padding:24px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#a78bfa;margin-bottom:8px;">NAN</div>
          <div style="color:#c4b5fd;font-size:14px;margin-bottom:24px;">Weave. Connect. Build.</div>
          <div style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:12px;padding:20px;margin-bottom:20px;">
            <div style="color:#6b5fa0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">Your login code</div>
            <div style="font-family:monospace;font-size:36px;font-weight:700;color:#ede9fe;letter-spacing:8px;">${otp}</div>
          </div>
          <div style="color:#6b5fa0;font-size:12px;">Expires in 10 minutes. Never share this code.</div>
        </div>
      </div>
    `,
  });

  return { dev: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, otp, privateKey, walletAddress } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }

  // ── SEND OTP ──
  if (action === 'send') {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache[email] = {
      otp: code,
      expires: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    };

    try {
      const result = await sendOTPEmail(email, code);
      return res.json({
        success: true,
        dev: result.dev || false,
        message: result.dev ? 'Dev mode: OTP in server logs' : 'Code sent to your email',
      });
    } catch (err) {
      console.error('Email error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to send email: ' + err.message });
    }
  }

  // ── VERIFY OTP ──
  if (action === 'verify') {
    const record = otpCache[email];

    if (!record) return res.status(400).json({ success: false, error: 'No code found — request a new one' });
    if (Date.now() > record.expires) {
      delete otpCache[email];
      return res.status(400).json({ success: false, error: 'Code expired — request a new one' });
    }
    if (record.attempts >= 5) {
      delete otpCache[email];
      return res.status(400).json({ success: false, error: 'Too many attempts — request a new code' });
    }
    if (record.otp !== otp) {
      record.attempts++;
      return res.status(400).json({ success: false, error: `Wrong code — ${5 - record.attempts} attempts left` });
    }

    delete otpCache[email];

    // Check if returning user has a saved wallet
    if (walletStore[email]) {
      try {
        const decryptedKey = decryptKey(walletStore[email].encryptedKey, email);
        return res.json({
          success: true,
          returning: true,
          privateKey: decryptedKey,
          walletAddress: walletStore[email].address,
          message: 'Welcome back! Your wallet has been restored.',
        });
      } catch (err) {
        console.error('Decryption error:', err.message);
        // Fall through to create new wallet
      }
    }

    // New user — tell browser to generate wallet
    return res.json({
      success: true,
      returning: false,
      message: 'New user — wallet will be created in your browser',
    });
  }

  // ── SAVE WALLET (called after browser generates new wallet) ──
  if (action === 'save') {
    if (!privateKey || !walletAddress) {
      return res.status(400).json({ success: false, error: 'privateKey and walletAddress required' });
    }

    // Encrypt and store
    try {
      const encryptedKey = encryptKey(privateKey, email);
      walletStore[email] = { encryptedKey, address: walletAddress };
      console.log(`Wallet saved for ${email}: ${walletAddress}`);
      return res.json({ success: true, message: 'Wallet saved' });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to save wallet' });
    }
  }

  return res.status(400).json({ success: false, error: 'Invalid action' });
}
