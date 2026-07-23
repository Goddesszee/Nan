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

// ── Get balance — on-chain RPC is the source of truth ────────────────────────
// Previously this called Circle's getWalletTokenBalance as primary and only
// fell back to a direct RPC read if that SDK call threw an exception. But
// Circle's wallet balance API has its own indexing behind the scenes, which
// can lag behind the actual chain state -- meanwhile the transaction history
// list (checkIncomingTransfers) reads confirmed transfers directly from the
// blockchain and updates immediately. Result: the balance card could show a
// stale number while the history list already shows the deposits as
// confirmed, with no way to reconcile the two.
// Fix: read the real on-chain balance directly (same trusted method the main
// wallet already uses successfully elsewhere in this app) as the primary
// source, and only fall back to Circle's SDK if we can't even resolve the
// wallet's address (e.g. Circle API briefly unavailable).
async function getAgentBalance(walletId) {
  const walletAddress = await getWalletAddress(walletId);
  if (walletAddress) {
    return getAgentBalanceRpc(walletAddress);
  }
  // Couldn't resolve an address at all — fall back to Circle's SDK balance call
  try {
    const client = await getClient();
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
    console.log('[agent-wallets] Both RPC (no address) and Circle SDK balance failed:', e.message);
    return { USDC: '0.00', EURC: '0.00' };
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
async function agentTransfer(walletId, toAddress, amount, tokenSymbol = 'USDC', walletAddress = null, skipPolicyCheck = false) {
  const client = await getClient();
  const tokenAddress = tokenSymbol === 'EURC' ? EURC_ADDRESS : USDC_ADDRESS;

  // ── Spending policy enforcement ──────────────────────────────────────────
  const policyAddr = walletAddress || (walletId ? await getWalletAddress(walletId) : null);
  if (policyAddr && !skipPolicyCheck) {
    const check = await checkPolicy(policyAddr, amount);
    if (!check.allowed) throw new Error('POLICY_VIOLATION: ' + check.reason);
  }

  // If no walletId but we have walletAddress, look up walletId via SDK
  let resolvedWalletId = walletId;
  if (!resolvedWalletId && walletAddress) {
    const wRes = await client.listWallets({ address: walletAddress, blockchain: BLOCKCHAIN });
    const found = wRes.data?.wallets?.[0];
    if (!found?.id) throw new Error(`No Circle wallet found for address ${walletAddress}`);
    resolvedWalletId = found.id;
    console.log(`[agent-wallets] Resolved walletId ${resolvedWalletId} from address ${walletAddress.slice(0,10)}`);
  }

  // Idempotency key: stable hash of walletId + destination + amount + token
  // (safe to retry without creating duplicate transactions)
  const idemBase = `${resolvedWalletId}:${toAddress}:${parseFloat(amount).toFixed(6)}:${tokenSymbol}`;
  const idemKey  = deterministicUUID('transfer', idemBase);

  const res = await client.createTransaction({
    idempotencyKey: idemKey,
    walletId: resolvedWalletId,
    destinationAddress: toAddress,
    amounts: [String(parseFloat(amount).toFixed(6))],
    tokenAddress,
    blockchain: BLOCKCHAIN, // required when using tokenAddress instead of tokenId
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });
  // Record spend for policy tracking (fire-and-forget, don't block response)
  const spendAddr = walletAddress || (resolvedWalletId ? await getWalletAddress(resolvedWalletId).catch(()=>null) : null);
  if (spendAddr && !skipPolicyCheck) {
    recordSpend(spendAddr, amount).catch(e => console.log('[policy] recordSpend error:', e.message));
  }
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


// ── Spending policy helpers ───────────────────────────────────────────────────
// Policy stored in Redis: nan:agentpolicy:{walletAddress} → { perTx, daily, weekly, createdAt }
// Spend tracking:         nan:agentspend:{walletAddress}:{YYYY-MM-DD} → total spent today (number)
//                         nan:agentspend:{walletAddress}:week:{YYYY-WW}  → total spent this week

async function getPolicy(walletAddress) {
  const key = `nan:agentpolicy:${walletAddress.toLowerCase()}`;
  return await kvGet(key) || null;
}

async function setPolicy(walletAddress, { perTx, daily, weekly }) {
  const key = `nan:agentpolicy:${walletAddress.toLowerCase()}`;
  const policy = {
    perTx:    perTx    != null ? parseFloat(perTx)    : null,
    daily:    daily    != null ? parseFloat(daily)    : null,
    weekly:   weekly   != null ? parseFloat(weekly)   : null,
    updatedAt: Date.now()
  };
  await kvSet(key, policy);
  return policy;
}

function todayKey()  { return new Date().toISOString().slice(0, 10); }           // YYYY-MM-DD
function weekKey()   {                                                             // YYYY-WW
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-${String(week).padStart(2,'0')}`;
}

async function getSpend(walletAddress) {
  const addr = walletAddress.toLowerCase();
  const [dayRaw, weekRaw] = await Promise.all([
    kvGet(`nan:agentspend:${addr}:${todayKey()}`),
    kvGet(`nan:agentspend:${addr}:week:${weekKey()}`)
  ]);
  return {
    today: parseFloat(dayRaw || '0'),
    week:  parseFloat(weekRaw || '0')
  };
}

async function recordSpend(walletAddress, amount) {
  const addr   = walletAddress.toLowerCase();
  const amt    = parseFloat(amount);
  const spend  = await getSpend(walletAddress);
  await Promise.all([
    kvSet(`nan:agentspend:${addr}:${todayKey()}`,       String(spend.today + amt)),
    kvSet(`nan:agentspend:${addr}:week:${weekKey()}`,   String(spend.week  + amt))
  ]);
}

async function checkPolicy(walletAddress, amount) {
  const policy = await getPolicy(walletAddress);
  if (!policy) return { allowed: true }; // no policy set → allow

  const amt = parseFloat(amount);

  // Per-transaction limit
  if (policy.perTx != null && amt > policy.perTx) {
    return { allowed: false, reason: `Amount $${amt} exceeds per-transaction limit of $${policy.perTx}` };
  }

  const spend = await getSpend(walletAddress);

  // Daily limit
  if (policy.daily != null && (spend.today + amt) > policy.daily) {
    return { allowed: false, reason: `Would exceed daily limit of $${policy.daily} (spent today: $${spend.today.toFixed(2)})` };
  }

  // Weekly limit
  if (policy.weekly != null && (spend.week + amt) > policy.weekly) {
    return { allowed: false, reason: `Would exceed weekly limit of $${policy.weekly} (spent this week: $${spend.week.toFixed(2)})` };
  }

  return { allowed: true, policy, spend };
}

// ── Handler ───────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// AGENT-TO-AGENT PAYMENT FEATURES
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. Trust tiers ────────────────────────────────────────────────────────
// Redis: nan:a2atrust:{senderWallet}:{counterpartyWallet} →
//   { successCount, totalVolume, firstSeen, lastSeen }
// New counterparties get a tight auto-approve cap; the cap grows as the
// relationship proves out (more successful payments, more volume), similar
// to how a real credit line extends with track record.

function trustKey(sender, counterparty) {
  return `nan:a2atrust:${sender.toLowerCase()}:${counterparty.toLowerCase()}`;
}

async function getTrust(sender, counterparty) {
  return await kvGet(trustKey(sender, counterparty)) || {
    successCount: 0, totalVolume: 0, firstSeen: null, lastSeen: null
  };
}

async function recordTrustSuccess(sender, counterparty, amount) {
  const t = await getTrust(sender, counterparty);
  const now = Date.now();
  const updated = {
    successCount: t.successCount + 1,
    totalVolume: t.totalVolume + parseFloat(amount),
    firstSeen: t.firstSeen || now,
    lastSeen: now
  };
  await kvSet(trustKey(sender, counterparty), updated);
  return updated;
}

// Auto-approve cap for a given counterparty, independent of (and layered
// under) the wallet's own perTx policy. Untrusted/new counterparty: small
// fixed cap. Proven counterparty: cap grows with successCount, capped at a
// ceiling so trust never fully removes the safety rail.
function trustTierCap(trust) {
  const NEW_COUNTERPARTY_CAP = 5;      // untested — hold to $5 auto-approve
  const TIER_STEP = 20;                // +$20 auto-approve per 3 successes
  const MAX_TIER_CAP = 500;            // trust alone never exceeds this
  if (trust.successCount === 0) return NEW_COUNTERPARTY_CAP;
  const tier = Math.floor(trust.successCount / 3);
  return Math.min(NEW_COUNTERPARTY_CAP + tier * TIER_STEP, MAX_TIER_CAP);
}

// Combines the wallet's own spending policy with the counterparty trust tier.
// The tighter of the two always wins — trust can never override an explicit
// policy cap, it only ever adds an *additional* restriction for unproven
// counterparties.
async function checkA2APolicy(senderWallet, counterpartyWallet, amount) {
  const amt = parseFloat(amount);
  const [policyResult, trust] = await Promise.all([
    checkPolicy(senderWallet, amount),
    getTrust(senderWallet, counterpartyWallet)
  ]);
  if (!policyResult.allowed) return policyResult;

  const tierCap = trustTierCap(trust);
  if (amt > tierCap) {
    return {
      allowed: false,
      reason: trust.successCount === 0
        ? `First payment to this counterparty is capped at $${tierCap} until a track record is established`
        : `Amount $${amt} exceeds this counterparty's trust-tier cap of $${tierCap} (${trust.successCount} successful payments so far)`,
      trust, tierCap
    };
  }
  return { allowed: true, trust, tierCap };
}

// ── 2. Escrow (soft-lock model) ──────────────────────────────────────────
// No dedicated on-chain escrow contract — funds stay in the sender's agent
// wallet, but a Redis record "locks" that amount against what's available
// for other spends. Real funds only move once on release. Recipient can
// self-attest completion (agent-native trust, not a human oracle); the
// sender's own policy decides whether that's enough to release.
// Redis: nan:a2aescrow:{escrowId} → { ...state }

function newEscrowId() { return 'esc_' + crypto.randomBytes(8).toString('hex'); }

async function getEscrow(escrowId) {
  return await kvGet(`nan:a2aescrow:${escrowId}`);
}
async function saveEscrow(escrow) {
  await kvSet(`nan:a2aescrow:${escrow.id}`, escrow);
  return escrow;
}

// Sum of all currently-locked (pending/attested, not yet released/refunded)
// escrow amounts for a wallet, so balance checks can account for them.
async function getLockedAmount(walletAddress) {
  const keys = await kvKeys(`nan:a2aescrow:`);
  let locked = 0;
  for (const k of keys) {
    const e = await kvGet(k);
    if (e && e.fromWallet?.toLowerCase() === walletAddress.toLowerCase() &&
        (e.status === 'pending' || e.status === 'attested')) {
      locked += parseFloat(e.amount);
    }
  }
  return locked;
}

// ── 3. Recurring / conditional payments ──────────────────────────────────
// Redis: nan:a2arecurring:{scheduleId} → { ...state }
// condition is optional: { type: 'min-balance', minUsd } is the only type
// implemented for now — skips a run (without cancelling) if the recipient's
// agent wallet balance is currently below the threshold, e.g. to pause
// payment to a counterparty that looks inactive/drained rather than paying
// into a dead wallet.

function newScheduleId() { return 'rec_' + crypto.randomBytes(8).toString('hex'); }

async function getRecurring(scheduleId) {
  return await kvGet(`nan:a2arecurring:${scheduleId}`);
}
async function saveRecurring(sched) {
  await kvSet(`nan:a2arecurring:${sched.id}`, sched);
  return sched;
}
async function listRecurringForWallet(walletAddress) {
  const keys = await kvKeys('nan:a2arecurring:');
  const out = [];
  for (const k of keys) {
    const s = await kvGet(k);
    if (s && s.fromWallet?.toLowerCase() === walletAddress.toLowerCase()) out.push(s);
  }
  return out;
}
async function listAllDueRecurring() {
  const keys = await kvKeys('nan:a2arecurring:');
  const now = Date.now();
  const due = [];
  for (const k of keys) {
    const s = await kvGet(k);
    if (s && s.active && s.nextRunAt <= now) due.push(s);
  }
  return due;
}

// ── 4. Invoices / payment requests ───────────────────────────────────────
// Redis: nan:a2ainvoice:{invoiceId} → { ...state }
// One agent requests payment from another. The paying agent's own trust +
// spending policy decides whether to auto-honor immediately or leave it
// pending for explicit review — this is what makes it a negotiation between
// two independent decision-makers rather than a one-sided push payment.

function newInvoiceId() { return 'inv_' + crypto.randomBytes(8).toString('hex'); }

async function getInvoice(invoiceId) {
  return await kvGet(`nan:a2ainvoice:${invoiceId}`);
}
async function saveInvoice(inv) {
  await kvSet(`nan:a2ainvoice:${inv.id}`, inv);
  return inv;
}
async function listInvoicesFor(walletAddress, direction) {
  // direction: 'incoming' (I owe/was asked to pay) or 'outgoing' (I'm the requester)
  const keys = await kvKeys('nan:a2ainvoice:');
  const out = [];
  for (const k of keys) {
    const inv = await kvGet(k);
    if (!inv) continue;
    const field = direction === 'outgoing' ? 'fromWallet' : 'toWallet';
    if (inv[field]?.toLowerCase() === walletAddress.toLowerCase()) out.push(inv);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

// ── 5. Settlement netting ────────────────────────────────────────────────
// Instead of transferring on every obligation between two agent wallets,
// accumulate a running ledger and settle only the net difference in a
// single transfer. Canonical key ordering (lower address first) so both
// directions hit the same ledger record.
// Redis: nan:a2anet:{walletLo}:{walletHi} → { aOwesB, bOwesA, entries: [...] }

function netKey(walletA, walletB) {
  const [lo, hi] = [walletA.toLowerCase(), walletB.toLowerCase()].sort();
  return { key: `nan:a2anet:${lo}:${hi}`, lo, hi };
}
async function getNetLedger(walletA, walletB) {
  const { key, lo, hi } = netKey(walletA, walletB);
  const ledger = await kvGet(key) || { lo, hi, loOwesHi: 0, hiOwesLo: 0, entries: [] };
  return { key, ledger };
}
async function recordNetObligation(oweFromWallet, oweToWallet, amount, note) {
  const { key, ledger } = await getNetLedger(oweFromWallet, oweToWallet);
  const amt = parseFloat(amount);
  if (oweFromWallet.toLowerCase() === ledger.lo) {
    ledger.loOwesHi += amt;
  } else {
    ledger.hiOwesLo += amt;
  }
  ledger.entries.push({ from: oweFromWallet, to: oweToWallet, amount: amt, note: note || '', at: Date.now() });
  await kvSet(key, ledger);
  return ledger;
}
function netDifference(ledger) {
  const diff = ledger.loOwesHi - ledger.hiOwesLo;
  if (diff > 0) return { payer: ledger.lo, payee: ledger.hi, amount: diff };
  if (diff < 0) return { payer: ledger.hi, payee: ledger.lo, amount: -diff };
  return { payer: null, payee: null, amount: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, userAddress, toAddress, amount, token = 'USDC' } = req.body || {};
  if (!userAddress) return res.status(400).json({ error: 'userAddress required' });

  // Dev mode — Circle credentials not set. Only allowed outside of a real
  // Railway deployment; if these are ever missing in production, fail loudly
  // instead of silently fabricating a wallet/balance (same fix applied to
  // the appkit routes in _server/index.js).
  const _isRailway = !!(process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_ENVIRONMENT);
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    if (_isRailway) {
      console.error('[agent-wallets] CIRCLE_API_KEY/CIRCLE_ENTITY_SECRET missing in production');
      return res.status(500).json({ success: false, error: 'Server misconfigured — Circle credentials missing' });
    }
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
      const wallet = await getOrCreateAgentWallet(userAddress);
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
        if (transferErr.message?.includes('POLICY_VIOLATION:')) {
          return res.json({ success: false, policyViolation: true, error: transferErr.message.replace('POLICY_VIOLATION: ','') });
        }
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
      const wallet = await getOrCreateAgentWallet(userAddress);
      if (!wallet?.walletAddress) return res.json({ success: false, error: 'No agent wallet — connect first' });
      await requestFaucet(wallet.walletAddress);
      return res.json({ success: true, message: 'Testnet tokens requested — arrives in ~30s' });
    }

    // ── history: list transactions via Circle SDK ───────────────────────────
    if (action === 'history') {
      const wallet = await getOrCreateAgentWallet(userAddress);
      if (!wallet?.walletId) return res.json({ success: false, error: 'No agent wallet found' });
      const client = await getClient();
      // listTransactions: filter by walletIds (comma-separated string)
      const txRes = await client.listTransactions({ walletIds: [wallet.walletId], pageSize: 20 });
      const txs = txRes.data?.transactions || [];
      return res.json({ success: true, transactions: txs });
    }



    // ── set-policy: save spending limits to Redis ─────────────────────────────
    if (action === 'set-policy') {
      const { walletAddress: pWallet, perTx, daily, weekly } = req.body;
      if (!pWallet) return res.status(400).json({ error: 'walletAddress required' });
      if (perTx == null && daily == null && weekly == null)
        return res.status(400).json({ error: 'At least one of perTx, daily, or weekly required' });
      const policy = await setPolicy(pWallet, { perTx, daily, weekly });
      console.log(`[policy] Set for ${pWallet.slice(0,10)}: perTx=${policy.perTx} daily=${policy.daily} weekly=${policy.weekly}`);
      return res.json({ success: true, policy });
    }

    // ── get-policy: read current spending limits + today's spend ─────────────
    if (action === 'get-policy') {
      const { walletAddress: pWallet } = req.body;
      if (!pWallet) return res.status(400).json({ error: 'walletAddress required' });
      const [policy, spend] = await Promise.all([
        getPolicy(pWallet),
        getSpend(pWallet)
      ]);
      return res.json({ success: true, policy: policy || null, spend });
    }

    // ── clear-policy: remove all spending limits ──────────────────────────────
    if (action === 'clear-policy') {
      const { walletAddress: pWallet } = req.body;
      if (!pWallet) return res.status(400).json({ error: 'walletAddress required' });
      const { default: fetch } = await import('node-fetch');
      const key = `nan:agentpolicy:${pWallet.toLowerCase()}`;
      await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return res.json({ success: true, message: 'Spending policy cleared' });
    }

    // ── lookup-by-arc: resolve arc name → main wallet → find their agent wallet ─
    if (action === 'lookup-by-arc') {
      const { arcName, recipientAddress } = req.body;
      // Accept either a pre-resolved address or an arc name to resolve on-chain
      let mainAddr = recipientAddress || null;

      if (!mainAddr && arcName) {
        // Resolve arc name using Arc Testnet name registry
        const { JsonRpcProvider, Contract } = await import('ethers');
        const NAME_REGISTRY_ADDR = '0x0000000000000000000000000000000000000832';
        const NAME_ABI_MINI = ['function resolve(string name) view returns (address)'];
        try {
          const rp = new JsonRpcProvider('https://rpc.testnet.arc.network');
          const nc = new Contract(NAME_REGISTRY_ADDR, NAME_ABI_MINI, rp);
          const resolved = await Promise.race([
            nc.resolve(arcName.replace(/\.arc$/i, '').toLowerCase()),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
          ]);
          if (!resolved || resolved === '0x0000000000000000000000000000000000000000') {
            return res.json({ success: false, error: `Arc name "${arcName}" not found` });
          }
          mainAddr = resolved;
        } catch(e) {
          return res.json({ success: false, error: 'Arc name resolution failed: ' + e.message.slice(0,100) });
        }
      }

      if (!mainAddr || !/^0x[a-fA-F0-9]{40}$/.test(mainAddr)) {
        return res.json({ success: false, error: 'Provide arcName or a valid recipientAddress' });
      }

      // Now look up their agent wallet in Redis
      const key = `nan:agentwallet:${mainAddr.toLowerCase()}`;
      const wallet = await kvGet(key);
      if (wallet?.walletAddress) {
        return res.json({ success: true, found: true, mainAddress: mainAddr, agentWalletAddress: wallet.walletAddress });
      }
      // Also try fallback key scan (handles case mismatches)
      try {
        const allKeys = await kvKeys('nan:agentwallet:');
        const matchKey = allKeys.find(k => k.toLowerCase() === key.toLowerCase());
        if (matchKey) {
          const w = await kvGet(matchKey);
          if (w?.walletAddress) {
            return res.json({ success: true, found: true, mainAddress: mainAddr, agentWalletAddress: w.walletAddress, note: 'key-scan' });
          }
        }
      } catch(e) {}
      // Recipient has no agent wallet — return their main wallet so frontend can fall back to agent→main send
      return res.json({ success: true, found: false, mainAddress: mainAddr, agentWalletAddress: null,
        message: 'Recipient has no NAN agent wallet — will send to their main wallet instead' });
    }

    // ── a2a-transfer: send from your agent wallet → recipient's agent wallet (or main wallet) ──
    if (action === 'a2a-transfer') {
      const { agentWalletAddress, toMainAddress, toAgentAddress, amount, token = 'USDC' } = req.body;
      if (!agentWalletAddress || !amount) return res.status(400).json({ error: 'agentWalletAddress and amount required' });

      // Destination: prefer agent wallet, fall back to main wallet
      const destination = toAgentAddress || toMainAddress;
      if (!destination || !/^0x[a-fA-F0-9]{40}$/.test(destination)) {
        return res.status(400).json({ error: 'Valid toAgentAddress or toMainAddress required' });
      }

      // Trust-tier check — layered on top of the wallet's own spending policy.
      // Only applies to genuine agent-to-agent hops (toAgentAddress), not
      // sends that fall back to a recipient's plain main wallet.
      if (toAgentAddress) {
        const trustCheck = await checkA2APolicy(agentWalletAddress, toAgentAddress, amount);
        if (!trustCheck.allowed) {
          return res.json({ success: false, policyViolation: true, error: trustCheck.reason, trust: trustCheck.trust, tierCap: trustCheck.tierCap });
        }
      }

      // Resolve sender walletId from Redis or by address scan
      let walletId = null;
      const senderKey = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const senderWallet = await kvGet(senderKey);
      if (senderWallet?.walletId) {
        walletId = senderWallet.walletId;
      }

      let result;
      try {
        result = await agentTransfer(walletId, destination, amount, token, agentWalletAddress);
      } catch(e) {
        if (e.message?.includes('POLICY_VIOLATION:')) {
          return res.json({ success: false, policyViolation: true, error: e.message.replace('POLICY_VIOLATION: ','') });
        }
        if (e.message?.includes('No Circle wallet found')) {
          return res.json({ success: false, notCircleWallet: true, error: e.message });
        }
        throw e;
      }
      const txId  = result?.data?.id || result?.data?.transaction?.id;
      const state = result?.data?.state || result?.data?.transaction?.state;
      if (!txId) throw new Error(result?.message || JSON.stringify(result?.data || result).slice(0, 200));
      const sentToAgent = !!toAgentAddress;
      // Record trust on success — only for genuine agent-to-agent hops
      let trustAfter = null;
      if (sentToAgent) {
        trustAfter = await recordTrustSuccess(agentWalletAddress, toAgentAddress, amount).catch(() => null);
      }
      return res.json({ success: true, txId, state, sentToAgent, trust: trustAfter,
        message: sentToAgent
          ? `Sent ${amount} ${token} agent→agent ✅`
          : `Sent ${amount} ${token} to recipient's main wallet (no agent wallet found) ✅`
      });
    }

    // ── trust: read the trust-tier relationship between two agent wallets ────
    if (action === 'trust') {
      const { counterpartyAddress } = req.body;
      const senderKey = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const senderWallet = await kvGet(senderKey);
      const senderAddr = senderWallet?.walletAddress || req.body.agentWalletAddress;
      if (!senderAddr || !counterpartyAddress) return res.status(400).json({ error: 'counterpartyAddress required (and a resolvable sender agent wallet)' });
      const trust = await getTrust(senderAddr, counterpartyAddress);
      return res.json({ success: true, trust, autoApproveCap: trustTierCap(trust) });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESCROW
    // ═══════════════════════════════════════════════════════════════════════

    // ── escrow-create: lock funds (soft-lock) pending task completion ────────
    if (action === 'escrow-create') {
      const { agentWalletAddress, toAgentAddress, amount, token = 'USDC', task } = req.body;
      if (!agentWalletAddress || !toAgentAddress || !amount) {
        return res.status(400).json({ error: 'agentWalletAddress, toAgentAddress, and amount required' });
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(toAgentAddress)) return res.status(400).json({ error: 'Invalid toAgentAddress' });

      // Available = actual on-chain balance minus already-locked escrow amounts
      const [balance, locked] = await Promise.all([
        getAgentBalanceRpc(agentWalletAddress),
        getLockedAmount(agentWalletAddress)
      ]);
      const available = parseFloat(balance?.[token] || 0) - locked;
      if (parseFloat(amount) > available) {
        return res.json({ success: false, error: `Insufficient available balance: $${available.toFixed(2)} available (${locked.toFixed(2)} already locked in other escrows)` });
      }

      const escrow = await saveEscrow({
        id: newEscrowId(),
        fromWallet: agentWalletAddress,
        fromUserAddress: userAddress,
        toWallet: toAgentAddress,
        amount: parseFloat(amount),
        token,
        task: task || '',
        status: 'pending',      // pending → attested → released | refunded
        attestation: null,
        createdAt: Date.now()
      });
      return res.json({ success: true, escrow });
    }

    // ── escrow-attest: recipient agent self-attests task completion ─────────
    if (action === 'escrow-attest') {
      const { escrowId, note } = req.body;
      const escrow = await getEscrow(escrowId);
      if (!escrow) return res.json({ success: false, error: 'Escrow not found' });
      if (escrow.status !== 'pending') return res.json({ success: false, error: `Escrow is ${escrow.status}, cannot attest` });
      escrow.status = 'attested';
      escrow.attestation = { note: note || '', at: Date.now() };
      await saveEscrow(escrow);
      return res.json({ success: true, escrow, message: 'Attested — awaiting sender release' });
    }

    // ── escrow-release: sender releases locked funds to recipient ────────────
    if (action === 'escrow-release') {
      const { escrowId, requireAttestation = true } = req.body;
      const escrow = await getEscrow(escrowId);
      if (!escrow) return res.json({ success: false, error: 'Escrow not found' });
      if (escrow.status === 'released' || escrow.status === 'refunded') {
        return res.json({ success: false, error: `Escrow already ${escrow.status}` });
      }
      if (requireAttestation && escrow.status !== 'attested') {
        return res.json({ success: false, error: 'Escrow has not been attested by the recipient yet' });
      }

      const senderKey = `nan:agentwallet:${escrow.fromUserAddress.toLowerCase()}`;
      const senderWallet = await kvGet(senderKey);
      let result;
      try {
        result = await agentTransfer(senderWallet?.walletId || null, escrow.toWallet, escrow.amount, escrow.token, escrow.fromWallet);
      } catch(e) {
        if (e.message?.includes('POLICY_VIOLATION:')) {
          return res.json({ success: false, policyViolation: true, error: e.message.replace('POLICY_VIOLATION: ','') });
        }
        throw e;
      }
      const txId = result?.data?.id || result?.data?.transaction?.id;
      escrow.status = 'released';
      escrow.releasedAt = Date.now();
      escrow.releaseTxId = txId;
      await saveEscrow(escrow);
      await recordTrustSuccess(escrow.fromWallet, escrow.toWallet, escrow.amount).catch(() => null);
      return res.json({ success: true, escrow, txId, message: `Released ${escrow.amount} ${escrow.token} ✅` });
    }

    // ── escrow-refund: sender cancels, funds simply unlock (no transfer needed) ──
    if (action === 'escrow-refund') {
      const { escrowId } = req.body;
      const escrow = await getEscrow(escrowId);
      if (!escrow) return res.json({ success: false, error: 'Escrow not found' });
      if (escrow.status === 'released' || escrow.status === 'refunded') {
        return res.json({ success: false, error: `Escrow already ${escrow.status}` });
      }
      escrow.status = 'refunded';
      escrow.refundedAt = Date.now();
      await saveEscrow(escrow);
      return res.json({ success: true, escrow, message: 'Escrow refunded — funds were never moved, just unlocked' });
    }

    // ── escrow-list: list escrows for a wallet (sent or received) ───────────
    if (action === 'escrow-list') {
      const { agentWalletAddress, direction = 'sent' } = req.body;
      if (!agentWalletAddress) return res.status(400).json({ error: 'agentWalletAddress required' });
      const keys = await kvKeys('nan:a2aescrow:');
      const out = [];
      for (const k of keys) {
        const e = await kvGet(k);
        if (!e) continue;
        const field = direction === 'received' ? 'toWallet' : 'fromWallet';
        if (e[field]?.toLowerCase() === agentWalletAddress.toLowerCase()) out.push(e);
      }
      return res.json({ success: true, escrows: out.sort((a,b) => b.createdAt - a.createdAt) });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RECURRING / CONDITIONAL PAYMENTS
    // ═══════════════════════════════════════════════════════════════════════

    // ── recurring-create: schedule a repeating A2A payment ───────────────────
    if (action === 'recurring-create') {
      const { agentWalletAddress, toAgentAddress, amount, token = 'USDC', intervalSeconds, condition, label } = req.body;
      if (!agentWalletAddress || !toAgentAddress || !amount || !intervalSeconds) {
        return res.status(400).json({ error: 'agentWalletAddress, toAgentAddress, amount, and intervalSeconds required' });
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(toAgentAddress)) return res.status(400).json({ error: 'Invalid toAgentAddress' });
      if (parseInt(intervalSeconds) < 60) return res.status(400).json({ error: 'intervalSeconds must be at least 60' });

      const sched = await saveRecurring({
        id: newScheduleId(),
        fromWallet: agentWalletAddress,
        fromUserAddress: userAddress,
        toWallet: toAgentAddress,
        amount: parseFloat(amount),
        token,
        intervalSeconds: parseInt(intervalSeconds),
        condition: condition || null,   // e.g. { type: 'min-balance', minUsd: 10 }
        label: label || '',
        active: true,
        runCount: 0,
        skipCount: 0,
        lastRunAt: null,
        nextRunAt: Date.now() + parseInt(intervalSeconds) * 1000,
        createdAt: Date.now()
      });
      return res.json({ success: true, schedule: sched });
    }

    // ── recurring-list: list schedules for a wallet ──────────────────────────
    if (action === 'recurring-list') {
      const { agentWalletAddress } = req.body;
      if (!agentWalletAddress) return res.status(400).json({ error: 'agentWalletAddress required' });
      const schedules = await listRecurringForWallet(agentWalletAddress);
      return res.json({ success: true, schedules });
    }

    // ── recurring-cancel: stop a schedule ─────────────────────────────────────
    if (action === 'recurring-cancel') {
      const { scheduleId } = req.body;
      const sched = await getRecurring(scheduleId);
      if (!sched) return res.json({ success: false, error: 'Schedule not found' });
      sched.active = false;
      sched.cancelledAt = Date.now();
      await saveRecurring(sched);
      return res.json({ success: true, schedule: sched });
    }

    // ── recurring-run-due: execute all due schedules (called by cron) ────────
    if (action === 'recurring-run-due') {
      const due = await listAllDueRecurring();
      const results = [];
      for (const sched of due) {
        try {
          // Optional condition check — skip (not cancel) if unmet
          if (sched.condition?.type === 'min-balance') {
            const recipientKeyByAgent = await kvKeys('nan:agentwallet:');
            let recipientBalance = null;
            for (const k of recipientKeyByAgent) {
              const w = await kvGet(k);
              if (w?.walletAddress?.toLowerCase() === sched.toWallet.toLowerCase()) {
                recipientBalance = await getAgentBalance(w.walletId);
                break;
              }
            }
            const bal = parseFloat(recipientBalance?.[sched.token] || 0);
            if (bal < sched.condition.minUsd) {
              sched.skipCount++;
              sched.nextRunAt = Date.now() + sched.intervalSeconds * 1000;
              await saveRecurring(sched);
              results.push({ id: sched.id, skipped: true, reason: `recipient balance $${bal} below min $${sched.condition.minUsd}` });
              continue;
            }
          }

          const senderWallet = await kvGet(`nan:agentwallet:${sched.fromUserAddress.toLowerCase()}`);
          const result = await agentTransfer(senderWallet?.walletId || null, sched.toWallet, sched.amount, sched.token, sched.fromWallet);
          const txId = result?.data?.id || result?.data?.transaction?.id;
          sched.runCount++;
          sched.lastRunAt = Date.now();
          sched.nextRunAt = Date.now() + sched.intervalSeconds * 1000;
          await saveRecurring(sched);
          await recordTrustSuccess(sched.fromWallet, sched.toWallet, sched.amount).catch(() => null);
          results.push({ id: sched.id, executed: true, txId });
        } catch(e) {
          // Policy violation or transient error — don't cancel, just retry next interval
          sched.nextRunAt = Date.now() + sched.intervalSeconds * 1000;
          await saveRecurring(sched);
          results.push({ id: sched.id, executed: false, error: e.message.slice(0, 150) });
        }
      }
      return res.json({ success: true, processed: results.length, results });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INVOICES / PAYMENT REQUESTS
    // ═══════════════════════════════════════════════════════════════════════

    // ── invoice-create: one agent requests payment from another ──────────────
    if (action === 'invoice-create') {
      const { agentWalletAddress, fromAgentAddress, amount, token = 'USDC', reason, autoHonorThreshold } = req.body;
      // agentWalletAddress = the requester (payee); fromAgentAddress = who's being asked to pay
      if (!agentWalletAddress || !fromAgentAddress || !amount) {
        return res.status(400).json({ error: 'agentWalletAddress, fromAgentAddress, and amount required' });
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(fromAgentAddress)) return res.status(400).json({ error: 'Invalid fromAgentAddress' });

      const invoice = await saveInvoice({
        id: newInvoiceId(),
        toWallet: agentWalletAddress,     // requester / payee
        toUserAddress: userAddress,
        fromWallet: fromAgentAddress,     // payer being asked
        amount: parseFloat(amount),
        token,
        reason: reason || '',
        status: 'pending',                // pending → honored | rejected | expired
        createdAt: Date.now()
      });

      // Auto-evaluation: does the requester meet the payer's trust tier + policy?
      // Requires the payer to have a resolvable agent wallet in Redis to check
      // their policy against — if not resolvable, leave pending for manual review.
      const payerKeys = await kvKeys('nan:agentwallet:');
      let payerUserAddress = null;
      for (const k of payerKeys) {
        const w = await kvGet(k);
        if (w?.walletAddress?.toLowerCase() === fromAgentAddress.toLowerCase()) {
          payerUserAddress = w.userAddress || k.replace('nan:agentwallet:', '');
          break;
        }
      }
      let autoEval = { autoHonored: false, reason: 'Payer agent wallet not resolvable for auto-evaluation — left pending' };
      if (payerUserAddress) {
        const trustCheck = await checkA2APolicy(fromAgentAddress, agentWalletAddress, amount);
        if (trustCheck.allowed) {
          autoEval = { autoHonored: true, reason: 'Within payer\'s trust tier and spending policy' };
        } else {
          autoEval = { autoHonored: false, reason: trustCheck.reason };
        }
      }
      return res.json({ success: true, invoice, autoEval });
    }

    // ── invoice-list: list invoices for a wallet ──────────────────────────────
    if (action === 'invoice-list') {
      const { agentWalletAddress, direction = 'incoming' } = req.body;
      if (!agentWalletAddress) return res.status(400).json({ error: 'agentWalletAddress required' });
      const invoices = await listInvoicesFor(agentWalletAddress, direction);
      return res.json({ success: true, invoices });
    }

    // ── invoice-respond: payer honors or rejects a pending invoice ───────────
    if (action === 'invoice-respond') {
      const { invoiceId, honor } = req.body;
      const invoice = await getInvoice(invoiceId);
      if (!invoice) return res.json({ success: false, error: 'Invoice not found' });
      if (invoice.status !== 'pending') return res.json({ success: false, error: `Invoice already ${invoice.status}` });

      if (!honor) {
        invoice.status = 'rejected';
        invoice.respondedAt = Date.now();
        await saveInvoice(invoice);
        return res.json({ success: true, invoice, message: 'Invoice rejected' });
      }

      // Trust + policy check before honoring
      const trustCheck = await checkA2APolicy(invoice.fromWallet, invoice.toWallet, invoice.amount);
      if (!trustCheck.allowed) {
        return res.json({ success: false, policyViolation: true, error: trustCheck.reason });
      }

      const payerKey = `nan:agentwallet:${userAddress.toLowerCase()}`;
      const payerWallet = await kvGet(payerKey);
      let result;
      try {
        result = await agentTransfer(payerWallet?.walletId || null, invoice.toWallet, invoice.amount, invoice.token, invoice.fromWallet);
      } catch(e) {
        if (e.message?.includes('POLICY_VIOLATION:')) {
          return res.json({ success: false, policyViolation: true, error: e.message.replace('POLICY_VIOLATION: ','') });
        }
        throw e;
      }
      const txId = result?.data?.id || result?.data?.transaction?.id;
      invoice.status = 'honored';
      invoice.respondedAt = Date.now();
      invoice.txId = txId;
      await saveInvoice(invoice);
      await recordTrustSuccess(invoice.fromWallet, invoice.toWallet, invoice.amount).catch(() => null);
      return res.json({ success: true, invoice, txId, message: `Honored ${invoice.amount} ${invoice.token} ✅` });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SETTLEMENT NETTING
    // ═══════════════════════════════════════════════════════════════════════

    // ── net-record: record an obligation on the running ledger (no transfer yet) ──
    if (action === 'net-record') {
      const { agentWalletAddress, counterpartyAddress, amount, note } = req.body;
      if (!agentWalletAddress || !counterpartyAddress || !amount) {
        return res.status(400).json({ error: 'agentWalletAddress, counterpartyAddress, and amount required' });
      }
      const ledger = await recordNetObligation(agentWalletAddress, counterpartyAddress, amount, note);
      const diff = netDifference(ledger);
      return res.json({ success: true, ledger, currentNet: diff });
    }

    // ── net-status: view the running ledger between two wallets ─────────────
    if (action === 'net-status') {
      const { agentWalletAddress, counterpartyAddress } = req.body;
      if (!agentWalletAddress || !counterpartyAddress) return res.status(400).json({ error: 'agentWalletAddress and counterpartyAddress required' });
      const { ledger } = await getNetLedger(agentWalletAddress, counterpartyAddress);
      const diff = netDifference(ledger);
      return res.json({ success: true, ledger, currentNet: diff });
    }

    // ── net-settle: execute a single transfer for the net difference, reset ledger ──
    if (action === 'net-settle') {
      const { agentWalletAddress, counterpartyAddress, token = 'USDC' } = req.body;
      if (!agentWalletAddress || !counterpartyAddress) return res.status(400).json({ error: 'agentWalletAddress and counterpartyAddress required' });
      const { key, ledger } = await getNetLedger(agentWalletAddress, counterpartyAddress);
      const diff = netDifference(ledger);
      if (diff.amount === 0) {
        return res.json({ success: true, settled: false, message: 'Ledger is already balanced — nothing to settle' });
      }

      // Resolve the payer's walletId
      const payerAgentKeys = await kvKeys('nan:agentwallet:');
      let payerUserAddress = null;
      for (const k of payerAgentKeys) {
        const w = await kvGet(k);
        if (w?.walletAddress?.toLowerCase() === diff.payer.toLowerCase()) {
          payerUserAddress = k.replace('nan:agentwallet:', '');
          break;
        }
      }
      const payerWallet = payerUserAddress ? await kvGet(`nan:agentwallet:${payerUserAddress}`) : null;

      let result;
      try {
        result = await agentTransfer(payerWallet?.walletId || null, diff.payee, diff.amount, token, diff.payer);
      } catch(e) {
        if (e.message?.includes('POLICY_VIOLATION:')) {
          return res.json({ success: false, policyViolation: true, error: e.message.replace('POLICY_VIOLATION: ','') });
        }
        throw e;
      }
      const txId = result?.data?.id || result?.data?.transaction?.id;
      // Reset ledger after settlement, keep entry history for reference
      const settledLedger = { ...ledger, loOwesHi: 0, hiOwesLo: 0, lastSettledAt: Date.now(), lastSettlement: { ...diff, txId } };
      await kvSet(key, settledLedger);
      return res.json({ success: true, settled: true, txId, netAmount: diff.amount, payer: diff.payer, payee: diff.payee, ledger: settledLedger });
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

