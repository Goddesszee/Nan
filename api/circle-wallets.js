// api/circle-wallets.js
// Circle Developer-Controlled Wallets API
// Fixed version — uses Circle SDK for all operations (auto-encrypts entity secret)
// Docs: https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet

import crypto from 'crypto';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET || '';
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID || '';

// ── Initialize Circle SDK client ──
// The SDK automatically handles RSA-OAEP encryption of the entity secret
// before every API call, preventing replay attacks (each ciphertext is single-use)
function getClient() {
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required');
  }
  return initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
  });
}

// ── In-memory cache (per serverless instance) ──
// NOTE: For production, replace with Vercel KV or a database
// so wallet lookups persist across cold starts
const emailToWallet = {};

// ── Get or create wallet for an email ──
async function getWalletForEmail(email) {
  // Check in-memory cache first
  if (emailToWallet[email]) return emailToWallet[email];

  if (!CIRCLE_WALLET_SET_ID) throw new Error('CIRCLE_WALLET_SET_ID not configured');

  const client = getClient();

  // Search for existing wallet by refId (email)
  try {
    const result = await client.listWallets({
      walletSetId: CIRCLE_WALLET_SET_ID,
      pageSize: 50,
    });
    const wallets = result.data?.wallets || [];
    const existing = wallets.find(w =>
      w.refId === email || w.name === `NAN-${email}`
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

  // Create new wallet — SDK auto-encrypts entity secret per Circle docs
  const idempotencyKey = crypto.createHash('sha256')
    .update(email + '-nan-arc-wallet-v2')
    .digest('hex');

  const result = await client.createWallets({
    idempotencyKey,
    walletSetId: CIRCLE_WALLET_SET_ID,
    blockchains: ['ARC-TESTNET'],
    count: 1,
    accountType: 'EOA',
    metadata: [{ name: `NAN-${email}`, refId: email }],
  });

  const wallet = result.data?.wallets?.[0];
  if (!wallet?.address) throw new Error('Wallet creation returned no address');

  const walletData = {
    id: wallet.id,
    address: wallet.address,
    blockchain: wallet.blockchain || 'ARC-TESTNET',
    state: wallet.state,
    custodyType: 'DEVELOPER',
  };

  emailToWallet[email] = walletData;
  return walletData;
}

// ── Get wallet token balances ──
async function getWalletBalances(walletId) {
  try {
    const client = getClient();
    const result = await client.getWalletTokenBalance({ id: walletId });
    return result.data?.tokenBalances || [];
  } catch (e) {
    console.error('Balance fetch error:', e.message);
    return [];
  }
}

// ── Transfer tokens via Circle SDK ──
// SDK handles entity secret re-encryption automatically per Circle docs
async function transferViaCircle(walletId, walletAddress, toAddress, amount, tokenAddress) {
  const client = getClient();

  // Get wallet blockchain first
  const walletResult = await client.getWallet({ id: walletId });
  const blockchain = walletResult.data?.wallet?.blockchain || 'ARC-TESTNET';

  const result = await client.createTransaction({
    walletId,
    blockchain,
    destinationAddress: toAddress,
    tokenAddress,
    amounts: [amount.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });

  return result.data?.id; // transaction ID
}

// ── Get transaction status ──
async function getTransactionStatus(txId) {
  try {
    const client = getClient();
    const result = await client.getTransaction({ id: txId });
    return result.data?.transaction;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, walletId, walletAddress, toAddress, amount, tokenAddress, txId } = req.body || {};

  // ── HEALTH CHECK ──
  if (action === 'health') {
    return res.json({
      configured: !!(CIRCLE_API_KEY && CIRCLE_WALLET_SET_ID && CIRCLE_ENTITY_SECRET),
      hasEntitySecret: !!CIRCLE_ENTITY_SECRET,
      walletSetId: CIRCLE_WALLET_SET_ID ? CIRCLE_WALLET_SET_ID.slice(0, 8) + '...' : null,
    });
  }

  // ── GET OR CREATE WALLET ──
  if (action === 'getWallet') {
    if (!email) return res.status(400).json({ error: 'Email required' });

    if (!CIRCLE_API_KEY || !CIRCLE_WALLET_SET_ID || !CIRCLE_ENTITY_SECRET) {
      return res.json({
        success: false,
        fallback: true,
        error: 'Circle Programmable Wallets not fully configured',
      });
    }

    try {
      const wallet = await getWalletForEmail(email);
      return res.json({ success: true, wallet });
    } catch (err) {
      console.error('Circle wallet error:', err.message);
      return res.json({ success: false, fallback: true, error: err.message });
    }
  }

  // ── GET BALANCES ──
  if (action === 'getBalance') {
    if (!walletId) return res.status(400).json({ error: 'walletId required' });
    try {
      const balances = await getWalletBalances(walletId);
      return res.json({ success: true, balances });
    } catch (err) {
      return res.json({ success: false, balances: [], error: err.message });
    }
  }

  // ── TRANSFER ──
  if (action === 'transfer') {
    if (!walletId || !toAddress || !amount) {
      return res.status(400).json({ error: 'walletId, toAddress, amount required' });
    }
    try {
      const txId = await transferViaCircle(walletId, walletAddress, toAddress, amount, tokenAddress);
      return res.json({ success: true, txId });
    } catch (err) {
      console.error('Transfer error:', err.message);
      return res.json({ success: false, error: err.message });
    }
  }

  // ── GET TRANSACTION STATUS ──
  if (action === 'getTransaction') {
    if (!txId) return res.status(400).json({ error: 'txId required' });
    try {
      const tx = await getTransactionStatus(txId);
      return res.json({ success: true, transaction: tx });
    } catch (err) {
      return res.json({ success: false, error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: health, getWallet, getBalance, transfer, getTransaction' });
}
