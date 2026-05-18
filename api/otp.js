import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import nodemailer from 'nodemailer';

const otpStore = new Map();
const walletStore = new Map();

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { action, email, otp } = req.body;

  if (action === 'send') {
    if (!email?.includes('@')) return res.json({ success: false, error: 'Invalid email' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email.toLowerCase(), { otp: code, expiresAt: Date.now() + 600000, attempts: 0 });
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
      return res.json({ success: true });
    } catch (err) {
      console.error('Email error:', err.message);
      console.log(`OTP for ${email}: ${code}`);
      return res.json({ success: true, dev: true });
    }
  }

  if (action === 'verify') {
    const key = email.toLowerCase();
    const record = otpStore.get(key);
    if (!record) return res.json({ success: false, error: 'No code — request a new one' });
    if (Date.now() > record.expiresAt) { otpStore.delete(key); return res.json({ success: false, error: 'Code expired' }); }
    if (record.attempts >= 5) { otpStore.delete(key); return res.json({ success: false, error: 'Too many attempts' }); }
    if (record.otp !== otp?.trim()) { record.attempts++; return res.json({ success: false, error: 'Wrong code' }); }
    otpStore.delete(key);

    if (walletStore.has(key)) {
      const w = walletStore.get(key);
      return res.json({ success: true, isNew: false, walletId: w.walletId, address: w.address });
    }

    try {
      const client = getClient();
      const result = await client.createWallets({
        walletSetId: process.env.CIRCLE_WALLET_SET_ID,
        blockchains: ['ARC-TESTNET'],
        count: 1,
        accountType: 'EOA',
      });
      const wallet = result.data?.wallets?.[0];
      if (!wallet) throw new Error('No wallet returned from Circle');
      walletStore.set(key, { walletId: wallet.id, address: wallet.address });
      return res.json({ success: true, isNew: true, walletId: wallet.id, address: wallet.address });
    } catch (err) {
      console.error('Circle wallet error:', err.message);
      return res.json({ success: false, error: 'Wallet creation failed: ' + err.message });
    }
  }

  res.json({ success: false, error: 'Unknown action' });
}