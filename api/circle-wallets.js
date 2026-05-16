// api/circle-wallets.js
// Circle Programmable Wallets API — creates real Circle-managed wallets for email users
// Docs: https://developers.circle.com/w3s/reference/createwallet

const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
const CIRCLE_BASE = 'https://api.circle.com/v1/w3s';

// Simple in-memory store (use Redis/DB in production)
const emailToWallet = {};

async function circleRequest(method, path, body = null) {
  const res = await fetch(`${CIRCLE_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${CIRCLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Circle API error');
  return data;
}

async function getOrCreateWalletSet() {
  // Try to get existing wallet set ID from env
  if (process.env.CIRCLE_WALLET_SET_ID) {
    return process.env.CIRCLE_WALLET_SET_ID;
  }
  // Create a new wallet set
  const idempotencyKey = crypto.randomUUID();
  const data = await circleRequest('POST', '/developer/walletSets', {
    idempotencyKey,
    name: 'NAN Wallet Users',
  });
  return data?.data?.walletSet?.id;
}

async function createCircleWallet(email) {
  const walletSetId = await getOrCreateWalletSet();
  const idempotencyKey = crypto.createHash('sha256').update(email + '-nan-wallet').digest('hex');

  const data = await circleRequest('POST', '/developer/wallets', {
    idempotencyKey,
    walletSetId,
    blockchains: ['ARB-SEPOLIA'], // Arc testnet uses EVM — use as fallback, will work with Arc RPC
    count: 1,
    metadata: [{ name: email, refId: email }],
  });

  const wallet = data?.data?.wallets?.[0];
  if (!wallet) throw new Error('Failed to create Circle wallet');
  return wallet;
}

async function getCircleWalletBalance(walletId) {
  try {
    const data = await circleRequest('GET', `/wallets/${walletId}/balances`);
    return data?.data?.tokenBalances || [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, walletId } = req.body;

  if (!email) return res.status(400).json({ error: 'Email required' });

  // ── GET OR CREATE WALLET ──
  if (action === 'getWallet') {
    // Return cached wallet if exists
    if (emailToWallet[email]) {
      return res.json({ success: true, wallet: emailToWallet[email], cached: true });
    }

    if (!CIRCLE_API_KEY) {
      // Fallback: return null so app uses browser-generated wallet
      return res.json({ success: false, error: 'Circle API not configured', fallback: true });
    }

    try {
      const wallet = await createCircleWallet(email);
      emailToWallet[email] = {
        id: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
        state: wallet.state,
      };
      return res.json({ success: true, wallet: emailToWallet[email] });
    } catch (err) {
      console.error('Circle wallet error:', err.message);
      return res.json({ success: false, error: err.message, fallback: true });
    }
  }

  // ── GET BALANCE ──
  if (action === 'getBalance') {
    if (!walletId || !CIRCLE_API_KEY) {
      return res.json({ success: false, balances: [] });
    }
    try {
      const balances = await getCircleWalletBalance(walletId);
      return res.json({ success: true, balances });
    } catch (err) {
      return res.json({ success: false, error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}
