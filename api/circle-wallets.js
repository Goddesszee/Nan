// api/circle-wallets.js
// Circle Developer-Controlled Wallets API
// Creates real Circle-managed wallets on Arc Testnet for email users
// Docs: https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet

import crypto from 'crypto';

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET || '';
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID || '';
const CIRCLE_BASE = 'https://api.circle.com/v1/w3s';

// In-memory store (persists per serverless instance)
// For production: use Vercel KV or a database
const emailToWallet = {};

// ── Circle API helper ──
async function circleRequest(method, path, body = null) {
  const headers = {
    'Authorization': `Bearer ${CIRCLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const res = await fetch(`${CIRCLE_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.error || 'Circle API error';
    throw new Error(msg);
  }
  return data;
}

// ── Generate entity secret ciphertext for signing ──
function generateEntitySecretCiphertext() {
  if (!CIRCLE_ENTITY_SECRET) return null;
  try {
    // Circle requires RSA-OAEP encryption of entity secret
    // This is a simplified version — full implementation needs Circle's public key
    return CIRCLE_ENTITY_SECRET;
  } catch (e) {
    return null;
  }
}

// ── Create a developer-controlled wallet on Arc Testnet ──
async function createWallet(email) {
  if (!CIRCLE_API_KEY) throw new Error('CIRCLE_API_KEY not configured');
  if (!CIRCLE_WALLET_SET_ID) throw new Error('CIRCLE_WALLET_SET_ID not configured');

  const idempotencyKey = crypto.createHash('sha256')
    .update(email + '-nan-arc-wallet-v2')
    .digest('hex');

  // Create wallet on Arc Testnet
  const data = await circleRequest('POST', '/developer/wallets', {
    idempotencyKey,
    walletSetId: CIRCLE_WALLET_SET_ID,
    blockchains: ['ARC-TESTNET'],
    count: 1,
    accountType: 'EOA',
    metadata: [{ name: `NAN-${email}`, refId: email }],
  });

  const wallet = data?.data?.wallets?.[0];
  if (!wallet?.address) throw new Error('Wallet creation returned no address');

  return {
    id: wallet.id,
    address: wallet.address,
    blockchain: wallet.blockchain || 'ARC-TESTNET',
    state: wallet.state,
    custodyType: 'DEVELOPER',
  };
}

// ── Get wallet by email (from cache or API) ──
async function getWalletForEmail(email) {
  // Check cache first
  if (emailToWallet[email]) return emailToWallet[email];

  // Try to find existing wallet by refId
  try {
    const data = await circleRequest('GET',
      `/wallets?walletSetId=${CIRCLE_WALLET_SET_ID}&pageSize=50`
    );
    const wallets = data?.data?.wallets || [];
    const existing = wallets.find(w =>
      w.metadata?.some?.(m => m.refId === email) ||
      w.name === `NAN-${email}`
    );
    if (existing?.address) {
      const wallet = {
        id: existing.id,
        address: existing.address,
        blockchain: existing.blockchain,
        state: existing.state,
        custodyType: 'DEVELOPER',
      };
      emailToWallet[email] = wallet;
      return wallet;
    }
  } catch (e) {
    console.log('Could not search existing wallets:', e.message);
  }

  // Create new wallet
  const wallet = await createWallet(email);
  emailToWallet[email] = wallet;
  return wallet;
}

// ── Get wallet balances from Circle ──
async function getWalletBalances(walletId) {
  try {
    const data = await circleRequest('GET', `/wallets/${walletId}/balances`);
    return data?.data?.tokenBalances || [];
  } catch (e) {
    return [];
  }
}

// ── Transfer USDC via Circle API (for Circle wallet users) ──
async function transferViaCircle(walletId, toAddress, amount, tokenAddress) {
  if (!CIRCLE_ENTITY_SECRET) throw new Error('CIRCLE_ENTITY_SECRET required for transfers');

  const idempotencyKey = crypto.randomUUID();
  const data = await circleRequest('POST', '/developer/transactions/transfer', {
    idempotencyKey,
    walletId,
    destinationAddress: toAddress,
    amounts: [amount.toString()],
    tokenAddress,
    blockchain: 'ARC-TESTNET',
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });

  return data?.data?.id; // transaction ID
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, walletId, toAddress, amount, tokenAddress } = req.body;
  if (!email && action !== 'health') {
    return res.status(400).json({ error: 'Email required' });
  }

  // ── HEALTH CHECK ──
  if (action === 'health') {
    return res.json({
      configured: !!(CIRCLE_API_KEY && CIRCLE_WALLET_SET_ID),
      hasEntitySecret: !!CIRCLE_ENTITY_SECRET,
      walletSetId: CIRCLE_WALLET_SET_ID ? CIRCLE_WALLET_SET_ID.slice(0, 8) + '...' : null,
    });
  }

  // ── GET OR CREATE WALLET ──
  if (action === 'getWallet') {
    if (!CIRCLE_API_KEY || !CIRCLE_WALLET_SET_ID) {
      return res.json({
        success: false,
        fallback: true,
        error: 'Circle Programmable Wallets not configured',
      });
    }

    try {
      const wallet = await getWalletForEmail(email);
      return res.json({ success: true, wallet });
    } catch (err) {
      console.error('Circle wallet error:', err.message);
      return res.json({
        success: false,
        fallback: true,
        error: err.message,
      });
    }
  }

  // ── GET BALANCES ──
  if (action === 'getBalance') {
    if (!walletId) return res.json({ success: false, balances: [] });
    try {
      const balances = await getWalletBalances(walletId);
      return res.json({ success: true, balances });
    } catch (err) {
      return res.json({ success: false, balances: [], error: err.message });
    }
  }

  // ── TRANSFER (for Circle wallet users) ──
  if (action === 'transfer') {
    if (!walletId || !toAddress || !amount) {
      return res.status(400).json({ error: 'walletId, toAddress, amount required' });
    }
    try {
      const txId = await transferViaCircle(walletId, toAddress, amount, tokenAddress);
      return res.json({ success: true, txId });
    } catch (err) {
      return res.json({ success: false, error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}
