// api/agent-wallets.js — Multi-user Circle Programmable Wallet management
// Each NAN user gets their own Circle agent wallet, created on first connect
// Wallets stored in Redis: nan:agentwallet:{userAddress} → { walletId, walletAddress, createdAt }

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_API_BASE = 'https://api.circle.com/v1/w3s';
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ARC_RPC  = 'https://rpc.testnet.arc.network';
const ARC_CHAIN_ID = 5042002;
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const EURC_ADDRESS = '0x89B572E95e4f609551b44F7b3b3d875952A72a';
const TOKEN_ABI = [
  'function transfer(address to,uint256 amount) returns(bool)',
  'function balanceOf(address) view returns(uint256)',
  'function approve(address spender,uint256 amount) returns(bool)',
  'function allowance(address owner,address spender) view returns(uint256)'
];

// Redis helpers
async function kvGet(key) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result ? JSON.parse(d.result) : null;
}

async function kvSet(key, value, exSeconds = null) {
  const { default: fetch } = await import('node-fetch');
  const url = exSeconds ? `${KV_URL}/set/${key}?ex=${exSeconds}` : `${KV_URL}/set/${key}`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  });
}

// Circle API helper
async function circlePost(path, body) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${CIRCLE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CIRCLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function circleGet(path) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${CIRCLE_API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` }
  });
  return r.json();
}

// Create or get entity secret for user
async function getOrCreateEntitySecret(userAddress) {
  const key = `nan:entity:${userAddress.toLowerCase()}`;
  let stored = await kvGet(key);
  if (stored?.entitySecret) return stored.entitySecret;
  // Generate new entity secret (32 bytes hex)
  const { randomBytes } = await import('crypto');
  const entitySecret = randomBytes(32).toString('hex');
  await kvSet(key, { entitySecret, createdAt: Date.now() });
  return entitySecret;
}

// Get or create Circle agent wallet for a user
async function getOrCreateAgentWallet(userAddress) {
  const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
  const existing = await kvGet(key);
  if (existing?.walletAddress) return existing;

  if (!CIRCLE_API_KEY) {
    throw new Error('CIRCLE_API_KEY not set in Railway env');
  }

  // Create a new wallet set for this user
  const entitySecret = await getOrCreateEntitySecret(userAddress);
  const walletSetRes = await circlePost('/developer/walletSets', {
    idempotencyKey: `nan-agent-${userAddress.toLowerCase()}-${Date.now()}`,
    name: `NAN Agent Wallet - ${userAddress.slice(0,10)}`,
    entitySecretCiphertext: entitySecret // simplified - in production use proper encryption
  });

  if (walletSetRes.data?.walletSet?.id) {
    const walletSetId = walletSetRes.data.walletSet.id;
    // Create wallet in the set
    const walletRes = await circlePost('/developer/wallets', {
      idempotencyKey: `nan-wallet-${userAddress.toLowerCase()}-${Date.now()}`,
      blockchains: ['ARC-TESTNET'],
      count: 1,
      walletSetId,
      entitySecretCiphertext: entitySecret
    });

    if (walletRes.data?.wallets?.[0]) {
      const wallet = walletRes.data.wallets[0];
      const record = {
        walletId: wallet.id,
        walletAddress: wallet.address,
        walletSetId,
        userAddress,
        createdAt: Date.now()
      };
      await kvSet(key, record);
      console.log(`[agent-wallets] Created wallet ${wallet.address} for user ${userAddress.slice(0,10)}`);
      return record;
    }
  }
  throw new Error('Failed to create Circle wallet: ' + JSON.stringify(walletSetRes));
}

// Transfer USDC/EURC from user's agent wallet using ethers + stored private key
// NOTE: Circle Programmable Wallets use server-side signing via Circle API
async function agentTransfer(walletId, toAddress, amount, tokenSymbol = 'USDC') {
  const tokenAddress = tokenSymbol === 'EURC' ? EURC_ADDRESS : USDC_ADDRESS;
  const amountInUnits = Math.round(parseFloat(amount) * 1e6); // 6 decimals

  // Use Circle's contractExecution to call transfer
  const transferCall = {
    contractAddress: tokenAddress,
    abiFunctionSignature: 'transfer(address,uint256)',
    abiParameters: [toAddress, String(amountInUnits)],
    amount: '0'
  };

  const res = await circlePost('/developer/transactions/contractExecution', {
    idempotencyKey: `nan-transfer-${walletId}-${Date.now()}`,
    walletId,
    blockchain: 'ARC-TESTNET',
    contractAddress: tokenAddress,
    abiFunctionSignature: 'transfer(address,uint256)',
    abiParameters: [toAddress, String(amountInUnits)],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  return res;
}

// Get balance of user's agent wallet
async function getAgentBalance(walletAddress) {
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider(ARC_RPC, { chainId: ARC_CHAIN_ID, name: 'arc-testnet' });
  const usdcContract = new ethers.Contract(USDC_ADDRESS, TOKEN_ABI, provider);
  const eurcContract = new ethers.Contract(EURC_ADDRESS, TOKEN_ABI, provider);
  const [usdcBal, eurcBal] = await Promise.all([
    usdcContract.balanceOf(walletAddress).catch(() => BigInt(0)),
    eurcContract.balanceOf(walletAddress).catch(() => BigInt(0))
  ]);
  return {
    USDC: (Number(usdcBal) / 1e6).toFixed(2),
    EURC: (Number(eurcBal) / 1e6).toFixed(2)
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, userAddress, walletId, toAddress, amount, token = 'USDC' } = req.body || {};
  if (!userAddress) return res.status(400).json({ error: 'userAddress required' });

  try {
    // Get or create wallet for this user
    if (action === 'get-or-create') {
      const wallet = await getOrCreateAgentWallet(userAddress);
      const balance = await getAgentBalance(wallet.walletAddress).catch(() => ({ USDC: '0', EURC: '0' }));
      return res.json({ success: true, wallet, balance });
    }

    // Get balance
    if (action === 'balance') {
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (!wallet?.walletAddress) return res.json({ success: false, error: 'No agent wallet found. Call get-or-create first.' });
      const balance = await getAgentBalance(wallet.walletAddress);
      return res.json({ success: true, walletAddress: wallet.walletAddress, balance });
    }

    // Transfer
    if (action === 'transfer') {
      if (!toAddress || !amount) return res.status(400).json({ error: 'toAddress and amount required' });
      if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) return res.status(400).json({ error: 'Invalid toAddress' });
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (!wallet?.walletId) return res.json({ success: false, error: 'No agent wallet found' });
      const result = await agentTransfer(wallet.walletId, toAddress, amount, token);
      const txId = result?.data?.transaction?.id || result?.data?.id;
      const state = result?.data?.transaction?.state || result?.data?.state;
      return res.json({ success: !!txId, txId, state, result });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch(e) {
    console.error('[agent-wallets] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
