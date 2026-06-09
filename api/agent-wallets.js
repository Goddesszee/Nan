// api/agent-wallets.js — Multi-user Circle Developer-Controlled Wallet management
// Each NAN user gets their own Circle agent wallet, created on first connect
// Uses @circle-fin/developer-controlled-wallets SDK (same as circle-wallets.js)
// Wallets stored in Redis: nan:agentwallet:{userAddress} → { walletId, walletAddress, walletSetId, createdAt }

import crypto from 'crypto';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ARC_RPC  = 'https://rpc.testnet.arc.network';
const ARC_CHAIN_ID = 5042002;
const BLOCKCHAIN   = 'ARC-TESTNET';
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const EURC_ADDRESS = '0x89B572E95e4f609551b44F7b3b3d875952A72a';
const TOKEN_ABI    = ['function balanceOf(address) view returns(uint256)'];

// ── Redis helpers ─────────────────────────────────────────────────────────────
async function kvGet(key) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result ? JSON.parse(d.result) : null;
}

async function kvSet(key, value) {
  const { default: fetch } = await import('node-fetch');
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  });
}

// ── Circle SDK client (same pattern as circle-wallets.js) ────────────────────
async function getClient() {
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in Railway env');
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

// ── Deterministic idempotency keys ───────────────────────────────────────────
function deterministicUUID(scope, addr) {
  const hex = crypto.createHash('sha256')
    .update(`nan:agent:${scope}:${addr.toLowerCase()}`)
    .digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${['8','9','a','b'][parseInt(hex[16],16)%4]}${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

// ── List all agent wallet Redis keys ─────────────────────────────────────────
async function kvKeys(prefix) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/keys/${encodeURIComponent(prefix+'*')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result || [];
}

// ── Get or create agent wallet for a user ────────────────────────────────────
// Priority: 1) Redis exact key  2) Redis case-variant  3) Circle wallet scan by address
//           4) Circle wallet set scan by name  5) Create new (last resort only)
async function getOrCreateAgentWallet(userAddress) {
  const key = `nan:agentwallet:${userAddress.toLowerCase()}`;

  // 1. Redis exact match
  const existing = await kvGet(key);
  if (existing?.walletAddress) {
    console.log(`[agent-wallets] Redis hit for ${userAddress.slice(0,10)}`);
    return existing;
  }

  // 2. Redis case-variant scan
  try {
    const allKeys = await kvKeys('nan:agentwallet:');
    const matchKey = allKeys.find(k => k.toLowerCase() === key.toLowerCase());
    if (matchKey && matchKey !== key) {
      const caseVariant = await kvGet(matchKey);
      if (caseVariant?.walletAddress) {
        await kvSet(key, { ...caseVariant, userAddress });
        console.log(`[agent-wallets] Migrated Redis key ${matchKey} → ${key}`);
        return caseVariant;
      }
    }
  } catch(e) { console.log('[agent-wallets] Redis key scan error:', e.message); }

  const client = await getClient();

  // 3. Scan ALL Circle wallets for one whose address matches a known pattern
  //    Also look for wallet sets named NAN-Agent-<prefix> or nan-<anything>
  //    to recover wallets that fell out of Redis
  const addrPrefix = userAddress.slice(0,10).toLowerCase();
  const wsNameFull = `NAN-Agent-${addrPrefix}`;
  try {
    // Page through all wallet sets (up to 200)
    let pageToken;
    let found = null;
    do {
      const listRes = await client.listWalletSets({ pageSize: 50, ...(pageToken ? { pageToken } : {}) });
      const sets = listRes.data?.walletSets || [];
      pageToken = listRes.data?.pageToken;

      for (const ws of sets) {
        // Match by exact name OR name prefix (handles both NAN-Agent- and nan- prefixes)
        const nameMatch = ws.name === wsNameFull || ws.name?.startsWith('NAN-Agent-' + addrPrefix);
        if (!nameMatch) continue;

        // Found a matching wallet set — get its wallets
        const wList = await client.listWallets({ walletSetId: ws.id, pageSize: 10 });
        const wallets = wList.data?.wallets || [];
        const arcWallet = wallets.find(w => w.blockchain === BLOCKCHAIN);
        if (arcWallet?.id && arcWallet?.address) {
          found = { walletId: arcWallet.id, walletAddress: arcWallet.address, walletSetId: ws.id, userAddress, createdAt: Date.now(), recoveredAt: Date.now() };
          break;
        }
      }
      if (found) break;
    } while (pageToken);

    if (found) {
      // Restore to Redis so future lookups are instant
      await kvSet(key, found);
      console.log(`[agent-wallets] Recovered wallet ${found.walletAddress} for ${userAddress.slice(0,10)} from Circle — restored to Redis`);
      return found;
    }
  } catch(e) {
    console.log('[agent-wallets] Circle scan error:', e.message);
  }

  // 4. Create new wallet set + wallet (only reached if truly no wallet exists)
  console.log(`[agent-wallets] No existing wallet found for ${userAddress.slice(0,10)} — creating new`);
  const wsRes = await client.createWalletSet({
    idempotencyKey: deterministicUUID('walletset', userAddress),
    name: wsNameFull
  });
  const walletSetId = wsRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error('Failed to create wallet set: ' + JSON.stringify(wsRes.data));

  const wRes = await client.createWallets({
    idempotencyKey: deterministicUUID('wallet', userAddress),
    blockchains: [BLOCKCHAIN],
    count: 1,
    walletSetId,
    accountType: 'EOA'
  });

  const wallet = wRes.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address)
    throw new Error('Failed to create wallet: ' + JSON.stringify(wRes.data));

  const record = { walletId: wallet.id, walletAddress: wallet.address, walletSetId, userAddress, createdAt: Date.now() };
  await kvSet(key, record);
  console.log(`[agent-wallets] Created new wallet ${wallet.address} for ${userAddress.slice(0,10)}`);
  return record;
}

// ── Get balance via ethers ────────────────────────────────────────────────────
async function getAgentBalance(walletAddress) {
  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(ARC_RPC, { chainId: ARC_CHAIN_ID, name: 'arc-testnet' });
    const usdc = new ethers.Contract(USDC_ADDRESS, TOKEN_ABI, provider);
    const eurc = new ethers.Contract(EURC_ADDRESS, TOKEN_ABI, provider);
    const [u, e] = await Promise.all([
      usdc.balanceOf(walletAddress).catch(() => 0n),
      eurc.balanceOf(walletAddress).catch(() => 0n)
    ]);
    return { USDC: (Number(u) / 1e6).toFixed(2), EURC: (Number(e) / 1e6).toFixed(2) };
  } catch(e) {
    return { USDC: '0.00', EURC: '0.00' };
  }
}

// ── Transfer via Circle SDK ───────────────────────────────────────────────────
async function agentTransfer(walletId, toAddress, amount, tokenSymbol = 'USDC') {
  const client = await getClient();

  // Get token ID from Circle — needed for transfer API
  const tokenAddress = tokenSymbol === 'EURC' ? EURC_ADDRESS : USDC_ADDRESS;

  // Use contractExecution to call ERC20 transfer directly
  const { ethers } = await import('ethers');
  const amountWei = ethers.parseUnits(String(parseFloat(amount).toFixed(6)), 6);

  const res = await client.createContractExecutionTransaction({
    idempotencyKey: deterministicUUID('transfer-'+Date.now(), walletId),
    walletId,
    contractAddress: tokenAddress,
    abiFunctionSignature: 'transfer(address,uint256)',
    abiParameters: [toAddress, amountWei.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  return res;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, userAddress, toAddress, amount, token = 'USDC' } = req.body || {};
  if (!userAddress) return res.status(400).json({ error: 'userAddress required' });

  // Dev mode — no Circle credentials
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    const hash = crypto.createHash('sha256').update(userAddress.toLowerCase()).digest('hex');
    const devAddr = '0x' + hash.slice(0, 40);
    if (action === 'get-or-create')
      return res.json({ success: true, wallet: { walletId: 'dev-'+hash.slice(0,8), walletAddress: devAddr, walletSetId: 'dev-set', userAddress }, balance: { USDC: '10.00', EURC: '0.00' } });
    if (action === 'balance')
      return res.json({ success: true, walletAddress: devAddr, balance: { USDC: '10.00', EURC: '0.00' } });
    if (action === 'transfer')
      return res.json({ success: true, txId: 'dev-tx-'+Date.now(), state: 'CONFIRMED', dev: true });
  }

  try {
    if (action === 'get-or-create') {
      const wallet = await getOrCreateAgentWallet(userAddress);
      const balance = await getAgentBalance(wallet.walletAddress);
      return res.json({ success: true, wallet, balance });
    }

    if (action === 'balance') {
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (!wallet?.walletAddress) return res.json({ success: false, error: 'No agent wallet found' });
      const balance = await getAgentBalance(wallet.walletAddress);
      return res.json({ success: true, walletAddress: wallet.walletAddress, balance });
    }

    if (action === 'transfer') {
      if (!toAddress || !amount) return res.status(400).json({ error: 'toAddress and amount required' });
      if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) return res.status(400).json({ error: 'Invalid toAddress' });
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (!wallet?.walletId) return res.json({ success: false, error: 'No agent wallet found — connect first' });
      const result = await agentTransfer(wallet.walletId, toAddress, amount, token);
      const txId = result?.data?.transaction?.id || result?.data?.id;
      const state = result?.data?.transaction?.state || result?.data?.state;
      if (!txId) throw new Error(result?.message || JSON.stringify(result?.data || result).slice(0,200));
      return res.json({ success: true, txId, state });
    }

    // ── Admin: list all Circle wallets + restore one to Redis ──────────────────
    if (action === 'list-circle-wallets') {
      // Returns all wallets in all wallet sets — use to find original wallet
      const client = await getClient();
      const wsList = await client.listWalletSets({ pageSize: 50 });
      const sets = wsList.data?.walletSets || [];
      const result = [];
      for (const ws of sets) {
        try {
          const wList = await client.listWallets({ walletSetId: ws.id, pageSize: 50 });
          const wallets = wList.data?.wallets || [];
          result.push({ walletSetId: ws.id, walletSetName: ws.name, wallets: wallets.map(w => ({ id: w.id, address: w.address, blockchain: w.blockchain, state: w.state })) });
        } catch(e) { result.push({ walletSetId: ws.id, walletSetName: ws.name, error: e.message }); }
      }
      return res.json({ success: true, count: result.length, walletSets: result });
    }

    // ── Admin: restore a specific wallet to Redis by walletId ────────────────
    if (action === 'restore-to-redis') {
      const { walletId, walletSetId, walletAddress } = req.body;
      if (!walletId || !walletAddress) return res.status(400).json({ error: 'walletId and walletAddress required' });
      const record = { walletId, walletAddress, walletSetId: walletSetId || 'restored', userAddress, createdAt: Date.now(), restoredAt: Date.now() };
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      await kvSet(key, record);
      console.log(`[agent-wallets] Restored wallet ${walletAddress} for ${userAddress.slice(0,10)} via admin`);
      return res.json({ success: true, restored: true, key, record });
    }

    if (action === 'lookup') {
      // Return wallet info from Redis without creating — for debugging
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (wallet?.walletAddress) {
        const balance = await getAgentBalance(wallet.walletAddress);
        return res.json({ success: true, found: true, wallet, balance });
      }
      // Scan for case variants
      try {
        const allKeys = await kvKeys('nan:agentwallet:');
        const matchKey = allKeys.find(k => k.toLowerCase() === key.toLowerCase());
        if (matchKey) {
          const w = await kvGet(matchKey);
          if (w?.walletAddress) {
            return res.json({ success: true, found: true, wallet: w, note: 'found via key scan: '+matchKey });
          }
        }
      } catch(e) {}
      return res.json({ success: true, found: false, message: 'No agent wallet in Redis for this address' });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch(e) {
    console.error('[agent-wallets] error:', e.message);
    return res.status(500).json({ success: false, error: e.message.slice(0, 200) });
  }
}
