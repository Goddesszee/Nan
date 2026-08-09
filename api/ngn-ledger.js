// api/ngn-ledger.js
// Persistent per-wallet NGN balance ledger for NAN's Naira Convert feature.
//
// This is intentionally separate from on-chain state — NGN is NOT a token
// on Arc; it only exists as a virtual balance representing real Naira that
// a user has deposited into NAN's Providus virtual account. When that Naira
// is converted to USDC, the USDC gets sent on-chain (see ngn-disburse.js)
// and this ledger's balance gets debited.
//
// In production, `credit` would be called by a Providus webhook when a
// real Naira deposit arrives. For testnet, it's called by the admin
// (guarded by ADMIN_PASSWORD) to manually credit NGN for testing.
//
// Schema: { [walletAddr_lowercase]: { balance: number, credited: number, debited: number, lastUpdated: number } }

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import crypto from 'crypto';

const LEDGER_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/nan_ngn_ledger.json`
  : '/tmp/nan_ngn_ledger.json';

// Tracks Providus deposit references that have already been credited, so a
// retried or replayed webhook for the same deposit can't double-credit a
// wallet. Providus's own recommended pattern is duplicate-session checking
// rather than a timestamp nonce (their reference webhook controller has a
// sessionHasDuplicate() check before crediting), so this mirrors that.
const PROCESSED_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/nan_ngn_processed_deposits.json`
  : '/tmp/nan_ngn_processed_deposits.json';

function loadProcessed() {
  try {
    if (existsSync(PROCESSED_FILE)) return JSON.parse(readFileSync(PROCESSED_FILE, 'utf8'));
  } catch (e) { console.error('[ngn-ledger] processed-deposits load error:', e.message); }
  return {};
}
function saveProcessed(obj) {
  try {
    const dir = dirname(PROCESSED_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(PROCESSED_FILE, JSON.stringify(obj), 'utf8');
  } catch (e) { console.error('[ngn-ledger] processed-deposits save error:', e.message); }
}

// Verifies the X-Auth-Signature header Providus sends: an HMAC-SHA256 of the
// exact raw request body, keyed with the shared webhook secret. Uses the raw
// bytes (not JSON.stringify(req.body)) because re-serializing can reorder
// keys or change whitespace, which would break the signature even for a
// legitimate request.
// NOTE: the header name/algorithm here is inferred from Providus's published
// third-party integration reference, not Providus's own API docs directly —
// confirm the exact header name and hash algorithm against your Providus
// dashboard/docs before relying on this in production, and adjust if theirs
// differs.
function verifyProvidusSignature(req) {
  const secret = process.env.PROVIDUS_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.headers['x-auth-signature'];
  if (!signature || typeof signature !== 'string') return false;
  if (!req.rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function loadLedger() {
  try {
    if (existsSync(LEDGER_FILE)) return JSON.parse(readFileSync(LEDGER_FILE, 'utf8'));
  } catch (e) { console.error('[ngn-ledger] load error:', e.message); }
  return {};
}

function saveLedger(obj) {
  try {
    const dir = dirname(LEDGER_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(LEDGER_FILE, JSON.stringify(obj), 'utf8');
  } catch (e) { console.error('[ngn-ledger] save error:', e.message); }
}

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(addr);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletAddress, amount, adminPassword } = req.body || {};
  const addr = walletAddress?.toLowerCase();

  if (!action) return res.json({ success: false, error: 'action required' });

  // ── getBalance: check a wallet's NGN balance ──────────────────────────────
  if (action === 'getBalance') {
    if (!isValidAddress(walletAddress)) return res.json({ success: false, error: 'Invalid wallet address' });
    const ledger = loadLedger();
    const entry = ledger[addr] || { balance: 0, credited: 0, debited: 0, lastUpdated: null };
    return res.json({ success: true, walletAddress: addr, ...entry });
  }

  // ── credit: add NGN to a wallet's balance ─────────────────────────────────
  // Two distinct, separately-trusted paths — deliberately NOT merged into one
  // password-or-secret check, since they have different threat models:
  //   1. Admin manual credit (testnet/support) — gated by ADMIN_PASSWORD.
  //   2. Real Providus deposit webhook — gated by a verified HMAC signature
  //      over the raw request body, plus a depositReference so a retried or
  //      replayed webhook can't double-credit the same deposit.
  if (action === 'credit') {
    const isWebhook = !!req.headers['x-auth-signature'];

    if (isWebhook) {
      if (!verifyProvidusSignature(req)) {
        console.warn('[ngn-ledger] webhook signature verification failed');
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }
      const { depositReference } = req.body || {};
      if (!depositReference) {
        return res.json({ success: false, error: 'depositReference required for webhook credits' });
      }
      const processed = loadProcessed();
      if (processed[depositReference]) {
        // Already credited — Providus will retry webhooks, so this is an
        // expected, non-error outcome, not a failure.
        console.log(`[ngn-ledger] duplicate webhook for deposit ${depositReference}, skipping`);
        return res.json({ success: true, duplicate: true, walletAddress: addr });
      }
      if (!isValidAddress(walletAddress)) return res.json({ success: false, error: 'Invalid wallet address' });
      const ngnAmount = parseFloat(amount);
      if (!ngnAmount || ngnAmount <= 0 || ngnAmount > 10_000_000) {
        return res.json({ success: false, error: 'Invalid amount (must be 0–10,000,000 NGN)' });
      }

      const ledger = loadLedger();
      const existing = ledger[addr] || { balance: 0, credited: 0, debited: 0 };
      ledger[addr] = {
        balance:     existing.balance + ngnAmount,
        credited:    existing.credited + ngnAmount,
        debited:     existing.debited,
        lastUpdated: Date.now(),
      };
      saveLedger(ledger);
      processed[depositReference] = { walletAddress: addr, amount: ngnAmount, creditedAt: Date.now() };
      saveProcessed(processed);
      console.log(`[ngn-ledger] webhook credited ₦${ngnAmount} to ${addr} (ref ${depositReference}) — new balance: ₦${ledger[addr].balance}`);
      return res.json({ success: true, walletAddress: addr, ...ledger[addr] });
    }

    // Admin manual credit path (testnet/support only)
    const adminPwd = process.env.ADMIN_PASSWORD;
    if (!adminPwd || adminPassword !== adminPwd) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!isValidAddress(walletAddress)) return res.json({ success: false, error: 'Invalid wallet address' });
    const ngnAmount = parseFloat(amount);
    if (!ngnAmount || ngnAmount <= 0 || ngnAmount > 10_000_000) {
      return res.json({ success: false, error: 'Invalid amount (must be 0–10,000,000 NGN)' });
    }

    const ledger = loadLedger();
    const existing = ledger[addr] || { balance: 0, credited: 0, debited: 0 };
    ledger[addr] = {
      balance:     existing.balance + ngnAmount,
      credited:    existing.credited + ngnAmount,
      debited:     existing.debited,
      lastUpdated: Date.now(),
    };
    saveLedger(ledger);
    console.log(`[ngn-ledger] admin credited ₦${ngnAmount} to ${addr} — new balance: ₦${ledger[addr].balance}`);
    return res.json({ success: true, walletAddress: addr, ...ledger[addr] });
  }

  // ── debit: deduct NGN from a wallet's balance (called during Convert) ─────
  // This does NOT authenticate with a password — the caller (ngn-disburse.js)
  // is server-side-only and trusted. But it does validate the debit won't
  // overdraw, so a frontend caller with a guessed action string can't drain
  // a balance they don't actually have.
  if (action === 'debit') {
    if (!isValidAddress(walletAddress)) return res.json({ success: false, error: 'Invalid wallet address' });
    const ngnAmount = parseFloat(amount);
    if (!ngnAmount || ngnAmount <= 0) return res.json({ success: false, error: 'Invalid amount' });

    const ledger = loadLedger();
    const existing = ledger[addr];
    if (!existing || existing.balance < ngnAmount) {
      return res.json({ success: false, error: 'Insufficient NGN balance', available: existing?.balance || 0 });
    }

    ledger[addr] = {
      balance:     existing.balance - ngnAmount,
      credited:    existing.credited,
      debited:     existing.debited + ngnAmount,
      lastUpdated: Date.now(),
    };
    saveLedger(ledger);
    console.log(`[ngn-ledger] debited ₦${ngnAmount} from ${addr} — new balance: ₦${ledger[addr].balance}`);
    return res.json({ success: true, walletAddress: addr, ...ledger[addr] });
  }

  return res.json({ success: false, error: 'Unknown action. Valid: getBalance, credit, debit' });
}
