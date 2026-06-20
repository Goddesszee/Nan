// api/track-connection.js
// Logs every wallet that has ever connected to NAN — including wallets that
// never sent a single on-chain transaction. This is intentionally NOT derived
// from blockchain scanning (the admin dashboard's on-chain stats), because a
// wallet that only ever logged in and looked around leaves no on-chain trace.
//
// Persisted as a flat JSON file on the Railway volume (same pattern as
// nan_push_subs.json) so it survives restarts/redeploys.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const WALLETS_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/nan_wallets.json`
  : '/tmp/nan_wallets.json';

function loadWallets() {
  try {
    if (existsSync(WALLETS_FILE)) {
      return JSON.parse(readFileSync(WALLETS_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('[track-connection] Could not load wallets file:', e.message);
  }
  return {};
}

function saveWallets(obj) {
  try {
    const dir = dirname(WALLETS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(WALLETS_FILE, JSON.stringify(obj), 'utf8');
  } catch (e) {
    console.log('[track-connection] Could not save wallets file:', e.message);
  }
}

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — admin dashboard reads the total count + breakdown
  if (req.method === 'GET') {
    const wallets = loadWallets();
    const entries = Object.values(wallets);
    const byType = entries.reduce((acc, w) => {
      acc[w.walletType || 'unknown'] = (acc[w.walletType || 'unknown'] || 0) + 1;
      return acc;
    }, {});
    return res.json({
      success: true,
      total: entries.length,
      byType,
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  // POST — frontend reports a wallet connection
  const { address, walletType } = req.body || {};
  if (!isValidAddress(address)) {
    return res.status(400).json({ success: false, error: 'Invalid wallet address' });
  }
  const type = (walletType === 'circle' || walletType === 'metamask') ? walletType : 'unknown';

  const wallets = loadWallets();
  const key = address.toLowerCase();
  const now = new Date().toISOString();
  const isNew = !wallets[key];

  if (wallets[key]) {
    wallets[key].lastSeen = now;
    // Keep the original walletType recorded at first connection — don't
    // overwrite it if someone somehow connects the same address differently
  } else {
    wallets[key] = { address: key, walletType: type, firstSeen: now, lastSeen: now };
  }

  saveWallets(wallets);
  return res.json({ success: true, isNew });
}
