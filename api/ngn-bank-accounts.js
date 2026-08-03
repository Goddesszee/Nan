// api/ngn-bank-accounts.js
// Per-wallet saved Nigerian bank accounts for Cash Out withdrawals.
// Same file-based storage pattern as ngn-ledger.js for consistency within
// this module. Account verification here is NOT a real bank-name lookup
// (NAN has no Paystack/Flutterwave resolve integration yet) — it only
// validates format (10 digits). This is surfaced honestly in the response
// via `verified: false` so the frontend does not claim more than is true.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import crypto from 'crypto';

const ACCOUNTS_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/nan_ngn_bank_accounts.json`
  : '/tmp/nan_ngn_bank_accounts.json';

function loadAccounts() {
  try {
    if (existsSync(ACCOUNTS_FILE)) return JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch (e) { console.error('[ngn-bank-accounts] load error:', e.message); }
  return {};
}
function saveAccounts(obj) {
  try {
    const dir = dirname(ACCOUNTS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(ACCOUNTS_FILE, JSON.stringify(obj), 'utf8');
  } catch (e) { console.error('[ngn-bank-accounts] save error:', e.message); }
}
function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(addr);
}
function newId() { return 'bank_' + crypto.randomBytes(6).toString('hex'); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletAddress, accountId, bankName, accountNumber, accountName, setDefault } = req.body || {};
  if (!isValidAddress(walletAddress)) return res.json({ success: false, error: 'Invalid wallet address' });
  const addr = walletAddress.toLowerCase();

  if (action === 'add') {
    if (!bankName || !accountNumber || !accountName) return res.json({ success: false, error: 'bankName, accountNumber, and accountName are required' });
    if (!/^\d{10}$/.test(accountNumber)) return res.json({ success: false, error: 'Account number must be exactly 10 digits' });
    const store = loadAccounts();
    const list = store[addr] || [];
    const account = {
      id: newId(), bankName: String(bankName).slice(0, 80), accountNumber,
      accountName: String(accountName).slice(0, 80),
      verified: false, // no real bank name resolve API integrated yet — honest by default
      isDefault: list.length === 0,
      createdAt: Date.now(),
    };
    list.push(account);
    store[addr] = list;
    saveAccounts(store);
    return res.json({ success: true, account });
  }

  if (action === 'edit') {
    if (!accountId) return res.json({ success: false, error: 'accountId required' });
    const store = loadAccounts();
    const list = store[addr] || [];
    const acc = list.find(a => a.id === accountId);
    if (!acc) return res.json({ success: false, error: 'Account not found' });
    if (bankName) acc.bankName = String(bankName).slice(0, 80);
    if (accountNumber) {
      if (!/^\d{10}$/.test(accountNumber)) return res.json({ success: false, error: 'Account number must be exactly 10 digits' });
      acc.accountNumber = accountNumber;
      acc.verified = false;
    }
    if (accountName) acc.accountName = String(accountName).slice(0, 80);
    saveAccounts(store);
    return res.json({ success: true, account: acc });
  }

  if (action === 'remove') {
    if (!accountId) return res.json({ success: false, error: 'accountId required' });
    const store = loadAccounts();
    const list = store[addr] || [];
    const wasDefault = list.find(a => a.id === accountId)?.isDefault;
    store[addr] = list.filter(a => a.id !== accountId);
    if (wasDefault && store[addr].length) store[addr][0].isDefault = true;
    saveAccounts(store);
    return res.json({ success: true });
  }

  if (action === 'setDefault') {
    if (!accountId) return res.json({ success: false, error: 'accountId required' });
    const store = loadAccounts();
    const list = store[addr] || [];
    list.forEach(a => { a.isDefault = (a.id === accountId); });
    saveAccounts(store);
    return res.json({ success: true, accounts: list });
  }

  if (action === 'list') {
    const store = loadAccounts();
    return res.json({ success: true, accounts: store[addr] || [] });
  }

  return res.json({ success: false, error: 'Unknown action. Valid: add, edit, remove, setDefault, list' });
}
