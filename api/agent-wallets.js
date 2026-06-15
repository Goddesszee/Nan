// api/agent-wallets.js — Multi-user Circle Developer-Controlled Wallet management
// Each NAN user gets their own Circle agent wallet, created on first connect
// SDK: @circle-fin/developer-controlled-wallets (initiateDeveloperControlledWalletsClient)
// Wallets stored in Redis: nan:agentwallet:{userAddress} → { walletId, walletAddress, walletSetId, createdAt }

import crypto from 'crypto';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ARC_RPC  = 'https://rpc.testnet.arc.network';
const ARC_CHAIN_ID = 5042002;
const BLOCKCHAIN   = 'ARC-TESTNET';
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
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

async function kvKeys(prefix) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/keys/${encodeURIComponent(prefix + '*')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result || [];
}

// ── Circle SDK client ─────────────────────────────────────────────────────────
// initiateDeveloperControlledWalletsClient handles RSA encryption automatically.
// DO NOT manually construct entitySecretCiphertext.
async function getClient() {
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

// ── Deterministic idempotency key (UUID v4 format) ───────────────────────────
// Using the same input always produces the same UUID → safe to retry without duplicates
function deterministicUUID(scope, addr) {
  const hex = crypto.createHash('sha256')
    .update(`nan:agent:${scope}:${addr.toLowerCase()}`)
    .digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${['8','9','a','b'][parseInt(hex[16],16)%4]}${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

// ── Get or create agent wallet ────────────────────────────────────────────────
// Recovery priority: Redis exact → Redis case-variant → Circle scan → create new
async function getOrCreateAgentWallet(userAddress) {
  const key = `nan:agentwallet:${userAddress.toLowerCase()}`;

  // 1. Redis exact match (fast path)
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
  const addrPrefix = userAddress.slice(0, 10).toLowerCase();
  const wsName = `NAN-Agent-${addrPrefix}`;

  // 3. Scan Circle wallet sets by name to recover wallet lost from Redis
  // listWalletSets: paginated via pageAfter (not pageToken)
  try {
    let pageAfter;
    let found = null;
    do {
      const res = await client.listWalletSets({
        pageSize: 50,
        ...(pageAfter ? { pageAfter } : {})
      });
      const sets = res.data?.walletSets || [];
      pageAfter = res.data?.walletSets?.length === 50
        ? sets[sets.length - 1]?.id
        : undefined;

      for (const ws of sets) {
        const nameMatch = ws.name === wsName || ws.name?.startsWith(`NAN-Agent-${addrPrefix}`);
        if (!nameMatch) continue;

        // listWallets: filter by walletSetId, accepts object input
        const wRes = await client.listWallets({ walletSetId: ws.id, pageSize: 10 });
        const wallets = wRes.data?.wallets || [];
        const arcWallet = wallets.find(w => w.blockchain === BLOCKCHAIN);
        if (arcWallet?.id && arcWallet?.address) {
          found = {
            walletId: arcWallet.id,
            walletAddress: arcWallet.address,
            walletSetId: ws.id,
            userAddress,
            createdAt: Date.now(),
            recoveredAt: Date.now()
          };
          break;
        }
      }
      if (found) break;
    } while (pageAfter);

    if (found) {
      await kvSet(key, found);
      console.log(`[agent-wallets] Recovered ${found.walletAddress} for ${userAddress.slice(0,10)} from Circle`);
      return found;
    }
  } catch(e) {
    console.log('[agent-wallets] Circle scan error:', e.message);
  }

  // 4. Create new wallet set + wallet (last resort)
  console.log(`[agent-wallets] Creating new wallet for ${userAddress.slice(0,10)}`);

  // createWalletSet: only needs idempotencyKey and name
  const wsRes = await client.createWalletSet({
    idempotencyKey: deterministicUUID('walletset', userAddress),
    name: wsName
  });
  const walletSetId = wsRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error('createWalletSet failed: ' + JSON.stringify(wsRes.data));

  // createWallets: accepts { blockchains, count, walletSetId, accountType? }
  // accountType 'EOA' is default and broadest — works on ARC-TESTNET
  const wRes = await client.createWallets({
    idempotencyKey: deterministicUUID('wallet', userAddress),
    blockchains: [BLOCKCHAIN],
    count: 1,
    walletSetId,
    accountType: 'EOA'
  });
  const wallet = wRes.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address)
    throw new Error('createWallets failed: ' + JSON.stringify(wRes.data));

  const record = { walletId: wallet.id, walletAddress: wallet.address, walletSetId, userAddress, createdAt: Date.now() };
  await kvSet(key, record);
  console.log(`[agent-wallets] Created wallet ${wallet.address} for ${userAddress.slice(0,10)}`);
  return record;
}

// ── Get balance via Circle SDK (getWalletTokenBalance) ───────────────────────
// Uses SDK natively instead of raw ethers RPC call
async function getAgentBalance(walletId) {
  try {
    const client = await getClient();
    // getWalletTokenBalance: takes { id: walletId, includeAll: true }
    const res = await client.getWalletTokenBalance({ id: walletId, includeAll: true });
    const balances = res.data?.tokenBalances || [];
    let USDC = '0.00', EURC = '0.00';
    for (const b of balances) {
      const addr = (b.token?.tokenAddress || '').toLowerCase();
      const amt  = parseFloat(b.amount || '0').toFixed(2);
      if (addr === USDC_ADDRESS.toLowerCase()) USDC = amt;
      if (addr === EURC_ADDRESS.toLowerCase()) EURC = amt;
    }
    return { USDC, EURC };
  } catch(e) {
    // Fallback to raw RPC if SDK balance fails
    console.log('[agent-wallets] SDK balance failed, falling back to RPC:', e.message);
    return getAgentBalanceRpc(await getWalletAddress(walletId));
  }
}

async function getWalletAddress(walletId) {
  try {
    const client = await getClient();
    const res = await client.getWallet({ id: walletId });
    return res.data?.wallet?.address;
  } catch { return null; }
}

async function getAgentBalanceRpc(walletAddress) {
  if (!walletAddress) return { USDC: '0.00', EURC: '0.00' };
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

// ── Transfer via Circle SDK (createTransaction) ───────────────────────────────
// Accepts either walletId OR walletAddress — if only address given, looks up walletId
async function agentTransfer(walletId, toAddress, amount, tokenSymbol = 'USDC', walletAddress = null) {
  const client = await getClient();
  const tokenAddress = tokenSymbol === 'EURC' ? EURC_ADDRESS : USDC_ADDRESS;

  // If no walletId but we have walletAddress, look up walletId via SDK
  let resolvedWalletId = walletId;
  if (!resolvedWalletId && walletAddress) {
    const wRes = await client.listWallets({ address: walletAddress, blockchain: BLOCKCHAIN });
    const found = wRes.data?.wallets?.[0];
    if (!found?.id) throw new Error(`No Circle wallet found for address ${walletAddress}`);
    resolvedWalletId = found.id;
    console.log(`[agent-wallets] Resolved walletId ${resolvedWalletId} from address ${walletAddress.slice(0,10)}`);
  }

  const res = await client.createTransaction({
    idempotencyKey: deterministicUUID('transfer-' + Date.now(), resolvedWalletId),
    walletId: resolvedWalletId,
    destinationAddress: toAddress,
    amounts: [String(parseFloat(amount).toFixed(6))],
    tokenAddress,
    blockchain: BLOCKCHAIN,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });
  return res;
}

// ── Faucet via Circle SDK (requestTestnetTokens) ─────────────────────────────
// requestTestnetTokens: { address, blockchain, native?, usdc?, eurc? }
async function requestFaucet(walletAddress) {
  const client = await getClient();
  await client.requestTestnetTokens({
    address: walletAddress,
    blockchain: BLOCKCHAIN,
    native: false,
    usdc: true,
    eurc: false
  });
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

  // Dev mode — Circle credentials not set
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    const hash = crypto.createHash('sha256').update(userAddress.toLowerCase()).digest('hex');
    const devAddr = '0x' + hash.slice(0, 40);
    if (action === 'get-or-create')
      return res.json({ success: true, wallet: { walletId: 'dev-' + hash.slice(0,8), walletAddress: devAddr, walletSetId: 'dev-set', userAddress }, balance: { USDC: '10.00', EURC: '0.00' } });
    if (action === 'balance')
      return res.json({ success: true, walletAddress: devAddr, balance: { USDC: '10.00', EURC: '0.00' } });
    if (action === 'transfer')
      return res.json({ success: true, txId: 'dev-tx-' + Date.now(), state: 'CONFIRMED', dev: true });
    if (action === 'faucet')
      return res.json({ success: true, dev: true, message: 'Dev mode faucet (no-op)' });
  }

  try {

    // ── get-or-create: connect/restore agent wallet ───────────────────────────
    if (action === 'get-or-create') {
      const wallet = await getOrCreateAgentWallet(userAddress);
      const balance = await getAgentBalance(wallet.walletId);
      return res.json({ success: true, wallet, balance });
    }

    // ── balance: fetch current balance ───────────────────────────────────────
    if (action === 'balance') {
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (!wallet?.walletId) return res.json({ success: false, error: 'No agent wallet found' });
      const balance = await getAgentBalance(wallet.walletId);
      return res.json({ success: true, walletAddress: wallet.walletAddress, balance });
    }

    // ── transfer: send USDC/EURC from agent wallet ────────────────────────────
    if (action === 'transfer') {
      if (!toAddress || !amount) return res.status(400).json({ error: 'toAddress and amount required' });
      if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) return res.status(400).json({ error: 'Invalid toAddress' });

      // Accept agentWalletAddress directly from frontend (avoids Redis lookup entirely)
      const { agentWalletAddress } = req.body;

      let walletId = null;
      let walletAddr = agentWalletAddress || null;

      // Try Redis first (fast path)
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const stored = await kvGet(key);
      if (stored?.walletId) {
        walletId = stored.walletId;
        walletAddr = stored.walletAddress;
      } else if (walletAddr) {
        // Redis miss — agentTransfer will resolve walletId from address via listWallets SDK call
        console.log(`[agent-wallets] Redis miss, resolving walletId from address ${walletAddr.slice(0,10)}`);
      } else {
        // No wallet address at all — not a Circle SDK wallet, tell frontend to use CLI
        return res.json({ success: false, notCircleWallet: true, error: 'No Circle agent wallet address provided' });
      }

      let result;
      try {
        result = await agentTransfer(walletId, toAddress, amount, token, walletAddr);
      } catch(transferErr) {
        // If Circle SDK can't find the wallet by address, it's probably a CLI wallet
        if (transferErr.message?.includes('No Circle wallet found')) {
          return res.json({ success: false, notCircleWallet: true, error: transferErr.message });
        }
        throw transferErr;
      }
      const txId  = result?.data?.id || result?.data?.transaction?.id;
      const state = result?.data?.state || result?.data?.transaction?.state;
      if (!txId) throw new Error(result?.message || JSON.stringify(result?.data || result).slice(0, 200));
      return res.json({ success: true, txId, state });
    }

    // ── faucet: request testnet tokens via Circle SDK ─────────────────────────
    if (action === 'faucet') {
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (!wallet?.walletAddress) return res.json({ success: false, error: 'No agent wallet — connect first' });
      await requestFaucet(wallet.walletAddress);
      return res.json({ success: true, message: 'Testnet tokens requested — arrives in ~30s' });
    }

    // ── history: list transactions via Circle SDK ───────────────────────────
    if (action === 'history') {
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (!wallet?.walletId) return res.json({ success: false, error: 'No agent wallet found' });
      const client = await getClient();
      // listTransactions: filter by walletIds (comma-separated string)
      const txRes = await client.listTransactions({ walletIds: wallet.walletId, pageSize: 20 });
      const txs = txRes.data?.transactions || [];
      return res.json({ success: true, transactions: txs });
    }

    // ── lookup: check Redis without creating ─────────────────────────────────
    if (action === 'lookup') {
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (wallet?.walletAddress) {
        const balance = await getAgentBalance(wallet.walletId);
        return res.json({ success: true, found: true, wallet, balance });
      }
      try {
        const allKeys = await kvKeys('nan:agentwallet:');
        const matchKey = allKeys.find(k => k.toLowerCase() === key.toLowerCase());
        if (matchKey) {
          const w = await kvGet(matchKey);
          if (w?.walletAddress) return res.json({ success: true, found: true, wallet: w, note: 'found via key scan: ' + matchKey });
        }
      } catch(e) {}
      return res.json({ success: true, found: false, message: 'No agent wallet in Redis for this address' });
    }

    // ── restore-to-redis: admin — write specific wallet to Redis ─────────────
    if (action === 'restore-to-redis') {
      const { walletId, walletSetId, walletAddress } = req.body;
      if (!walletId || !walletAddress) return res.status(400).json({ error: 'walletId and walletAddress required' });
      const record = { walletId, walletAddress, walletSetId: walletSetId || 'restored', userAddress, createdAt: Date.now(), restoredAt: Date.now() };
      const key = `nan:agentwallet:${userAddress.toLowerCase()}`;
      await kvSet(key, record);
      return res.json({ success: true, restored: true, key, record });
    }

    // ── list-circle-wallets: admin — scan all Circle wallets ─────────────────
    if (action === 'list-circle-wallets') {
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

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch(e) {
    console.error('[agent-wallets] error:', e.message);
    return res.status(500).json({ success: false, error: e.message.slice(0, 200) });
  }
}
