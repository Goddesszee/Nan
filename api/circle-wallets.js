// api/circle-wallets.js
// Circle Developer-Controlled Wallets API — 10/10
// Uses CommonJS (require) for Vercel compatibility
// Fully aligned with Circle docs:
// https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet
// https://developers.circle.com/wallets/dev-controlled/transfer-tokens-across-wallets

const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET || '';
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID || '';

// Arc Testnet USDC token address (from Circle docs)
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000';

// ── Initialize Circle SDK client ──
// SDK automatically handles RSA-OAEP encryption of entity secret per request
// preventing replay attacks (each ciphertext is single-use)
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
// NOTE: For production replace with Vercel KV or a database
const emailToWallet = {};

// ── Get or create wallet for an email ──
async function getWalletForEmail(email) {
  if (emailToWallet[email]) return emailToWallet[email];
  if (!CIRCLE_WALLET_SET_ID) throw new Error('CIRCLE_WALLET_SET_ID not configured');

  const client = getClient();

  // Search for existing wallet by name
  try {
    const result = await client.listWallets({
      walletSetId: CIRCLE_WALLET_SET_ID,
      pageSize: 50,
    });
    const wallets = result.data?.wallets || [];
    const existing = wallets.find(w => w.name === `NAN-${email}`);
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

  // Create new wallet per Circle docs
  const result = await client.createWallets({
    walletSetId: CIRCLE_WALLET_SET_ID,
    blockchains: ['ARC-TESTNET'],
    count: 1,
    accountType: 'EOA',
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
// Uses walletAddress + blockchain as primary identifiers per Circle docs
// Docs: https://developers.circle.com/wallets/dev-controlled/transfer-tokens-across-wallets
async function transferViaCircle(walletAddress, blockchain, toAddress, amount, tokenAddress) {
  const client = getClient();

  const resolvedToken = tokenAddress || ARC_TESTNET_USDC;
  const resolvedChain = blockchain || 'ARC-TESTNET';

  const result = await client.createTransaction({
    blockchain: resolvedChain,
    walletAddress,
    destinationAddress: toAddress,
    amount: [amount.toString()],
    tokenAddress: resolvedToken,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });

  return result.data?.id;
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

// ── List outbound transactions for a wallet ──
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
    tokenAddress,
    txId,
  } = req.body || {};

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
  // Uses walletAddress + blockchain per Circle docs (not walletId)
  if (action === 'transfer') {
    if (!walletAddress || !toAddress || !amount) {
      return res.status(400).json({ error: 'walletAddress, toAddress, amount required' });
    }
    try {
      const id = await transferViaCircle(walletAddress, blockchain, toAddress, amount, tokenAddress);
      return res.json({ success: true, txId: id });
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

  return res.status(400).json({
    error: 'Invalid action. Use: health, getWallet, getBalance, transfer, getTransaction, listTransactions',
  });
};
