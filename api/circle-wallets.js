// api/circle-wallets.js
// Circle Developer-Controlled Wallets API — Fully Fixed & Integrated
// Fixes: private key security, missing /api/transfer, tx polling, metadata support
// Circle docs: https://developers.circle.com/wallets/dev-controlled

const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

const CIRCLE_API_KEY       = process.env.CIRCLE_API_KEY || '';
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET || '';
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID || '';

// Arc Testnet USDC token address (official from Circle docs)
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000';
const ARC_TESTNET_EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

// ── OTP cooldown store (in-memory, per serverless instance) ──
const otpCooldowns = {};

// ── Initialize Circle SDK client ──
// SDK auto-handles RSA-OAEP encryption of entity secret per request (single-use ciphertext)
function getClient() {
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required');
  }
  return initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
  });
}

// ── In-memory wallet cache (per serverless instance) ──
// Maps email → wallet data. Resets on cold start — acceptable for testnet.
// Production: replace with Vercel KV or a database.
const emailToWallet = {};

// ── Get or create a Circle Developer-Controlled Wallet for an email ──
// Per Circle docs: use metadata.refId to link wallet to user
// https://developers.circle.com/wallets/dev-controlled/batch-create-wallets
async function getWalletForEmail(email) {
  if (emailToWallet[email]) return emailToWallet[email];
  if (!CIRCLE_WALLET_SET_ID) throw new Error('CIRCLE_WALLET_SET_ID not configured');

  const client = getClient();

  // Search for existing wallet by refId (email) per Circle docs
  try {
    const result = await client.listWallets({
      walletSetId: CIRCLE_WALLET_SET_ID,
      pageSize: 50,
    });
    const wallets = result.data?.wallets || [];
    // Match by refId (email) or name — refId is the correct Circle pattern
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
        refId: existing.refId,
      };
      emailToWallet[email] = wallet;
      return wallet;
    }
  } catch (e) {
    console.log('Could not search existing wallets:', e.message);
  }

  // Create new wallet with metadata.refId = email per Circle batch-create docs
  // This links the wallet to the user in Circle's system
  const result = await client.createWallets({
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
    refId: email,
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
// Uses walletAddress + blockchain per Circle docs
// https://developers.circle.com/wallets/dev-controlled/transfer-tokens-across-wallets
async function transferViaCircle(walletAddress, blockchain, toAddress, amount, tokenSymbol) {
  const client = getClient();
  const resolvedChain = blockchain || 'ARC-TESTNET';
  // Resolve token address from symbol
  let tokenAddress = ARC_TESTNET_USDC;
  if (tokenSymbol === 'EURC') tokenAddress = ARC_TESTNET_EURC;

  const result = await client.createTransaction({
    blockchain: resolvedChain,
    walletAddress,
    destinationAddress: toAddress,
    amount: [amount.toString()],
    tokenAddress,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });

  return {
    txId: result.data?.id,
    state: result.data?.state,
  };
}

// ── Get transaction status ──
// Used for polling after transfer
async function getTransactionStatus(txId) {
  try {
    const client = getClient();
    const result = await client.getTransaction({ id: txId });
    return result.data?.transaction;
  } catch (e) {
    return null;
  }
}

// ── List outbound transactions ──
// Per Circle docs: listTransactions with txType OUTBOUND
async function listOutboundTransactions(walletId) {
  try {
    const client = getClient();
    const result = await client.listTransactions({
      walletIds: [walletId],
      txType: 'OUTBOUND',
    });
    return result.data?.transactions || [];
  } catch (e) {
    console.error('List transactions error:', e.message);
    return [];
  }
}

// ── Main handler ──
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    action,
    email,
    walletId,
    walletAddress,
    blockchain,
    toAddress,
    amount,
    tokenSymbol,
    tokenAddress,
    txId,
  } = req.body || {};

  // ── HEALTH CHECK ──
  if (action === 'health') {
    return res.json({
      configured: !!(CIRCLE_API_KEY && CIRCLE_WALLET_SET_ID && CIRCLE_ENTITY_SECRET),
      hasEntitySecret: !!CIRCLE_ENTITY_SECRET,
      walletSetId: CIRCLE_WALLET_SET_ID ? CIRCLE_WALLET_SET_ID.slice(0, 8) + '...' : null,
      version: '3.0.0',
    });
  }

  // ── GET OR CREATE WALLET ──
  // Creates a real Circle Developer-Controlled Wallet linked to user's email via refId
  if (action === 'getWallet') {
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!CIRCLE_API_KEY || !CIRCLE_WALLET_SET_ID || !CIRCLE_ENTITY_SECRET) {
      return res.json({ success: false, fallback: true, error: 'Circle not fully configured' });
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
  // Fixed: uses walletAddress + blockchain per Circle docs (not walletId)
  // Fixed: accepts tokenSymbol (USDC/EURC) and resolves to correct token address
  // This replaces the broken /api/transfer endpoint
  if (action === 'transfer') {
    if (!walletAddress || !toAddress || !amount) {
      return res.status(400).json({ error: 'walletAddress, toAddress, amount required' });
    }
    try {
      const result = await transferViaCircle(
        walletAddress,
        blockchain,
        toAddress,
        amount,
        tokenSymbol || 'USDC'
      );
      return res.json({ success: true, txId: result.txId, state: result.state });
    } catch (err) {
      console.error('Transfer error:', err.message);
      return res.json({ success: false, error: err.message });
    }
  }

  // ── GET TRANSACTION STATUS ──
  // Fixed: this was previously called via wrong /api/transaction/:id endpoint
  // Now correctly handled here with Circle SDK
  if (action === 'getTransaction') {
    if (!txId) return res.status(400).json({ error: 'txId required' });
    try {
      const tx = await getTransactionStatus(txId);
      return res.json({ success: true, transaction: tx });
    } catch (err) {
      return res.json({ success: false, error: err.message });
    }
  }

  // ── LIST OUTBOUND TRANSACTIONS ──
  // Per Circle docs: listTransactions with txType OUTBOUND
  if (action === 'listTransactions') {
    if (!walletId) return res.status(400).json({ error: 'walletId required' });
    try {
      const transactions = await listOutboundTransactions(walletId);
      return res.json({ success: true, transactions });
    } catch (err) {
      return res.json({ success: false, transactions: [], error: err.message });
    }
  }

  // ── OTP COOLDOWN CHECK ──
  // Prevents spam on OTP send button — 60s cooldown per email
  if (action === 'checkCooldown') {
    if (!email) return res.status(400).json({ error: 'Email required' });
    const lastSent = otpCooldowns[email] || 0;
    const elapsed = Date.now() - lastSent;
    const cooldownMs = 60000;
    if (elapsed < cooldownMs) {
      return res.json({ onCooldown: true, remainingSeconds: Math.ceil((cooldownMs - elapsed) / 1000) });
    }
    otpCooldowns[email] = Date.now();
    return res.json({ onCooldown: false });
  }

  return res.status(400).json({
    error: 'Invalid action. Use: health, getWallet, getBalance, transfer, getTransaction, listTransactions, checkCooldown',
  });
};
