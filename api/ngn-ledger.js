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

const LEDGER_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/nan_ngn_ledger.json`
  : '/tmp/nan_ngn_ledger.json';

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
  // In production: called by Providus webhook on real deposit confirmation.
  // For testing: called by admin with ADMIN_PASSWORD.
  if (action === 'credit') {
    // Accept either the admin password (manual testing) or a webhook secret
    // (future Providus integration). Never expose either in client-side code.
    const adminPwd = process.env.ADMIN_PASSWORD;
    const webhookSecret = process.env.PROVIDUS_WEBHOOK_SECRET;
    const authenticated =
      (adminPwd && adminPassword === adminPwd) ||
      (webhookSecret && adminPassword === webhookSecret);

    if (!authenticated) return res.status(401).json({ success: false, error: 'Unauthorized' });
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
    console.log(`[ngn-ledger] credited ₦${ngnAmount} to ${addr} — new balance: ₦${ledger[addr].balance}`);
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
