// api/agent-wallets.js — Multi-user Circle Developer-Controlled Wallet management
// Each NAN user gets their own Circle agent wallet, created on first connect
// SDK: @circle-fin/developer-controlled-wallets (initiateDeveloperControlledWalletsClient)
// Wallets stored in Redis: nan:agentwallet:{userAddress} → { walletId, walletAddress, walletSetId, createdAt }

import crypto from 'crypto';
import { sendNotificationEmail } from './_lib/emailer.js';
import { requireAgentAuth, requireEmailSession } from './_lib/auth.js';

const ALLOWED_ORIGINS = [
  'https://nanarc.xyz',
  'https://www.nanarc.xyz',
  'https://nan-production.up.railway.app',
  /\.vercel\.app$/,
];
function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(o => typeof o === 'string' ? o === origin : o.test(origin));
}

// Actions requiring proof of wallet control, checked via requireAgentAuth
// (wallet signature for self-custody users, or a linked+verified email
// session for Circle-custody users). link-email is handled separately below
// since it's the step that CREATES the link — nothing to check it against yet.
const AUTH_REQUIRED_ACTIONS = new Set([
  'transfer', 'a2a-transfer', 'escrow-release', 'escrow-refund',
  'set-policy', 'clear-policy', 'recurring-create', 'recurring-cancel',
  'net-settle', 'invoice-respond',
]);

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ARC_RPC  = 'https://rpc.testnet.arc.io';
const ARC_CHAIN_ID = 5042002;
const BLOCKCHAIN   = 'ARC-TESTNET';
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const TOKEN_ABI    = ['function balanceOf(address) view returns(uint256)'];

// ── Redis helpers ─────────────────────────────────────────────────────────────
// Rewritten to use Upstash's documented "Command Array Format"
// (POST the whole command as a JSON array to the base URL) instead of the
// URL-path style (/command/arg1/arg2). Upstash's own docs recommend this
// specifically to avoid URL-encoding ambiguity — worth doing outright rather
// than continuing to debug symptoms one at a time on the path-style form.
async function kvExec(commandArray) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commandArray)
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`kvExec(${commandArray[0]}) failed: ${r.status} ${errText.slice(0,200)}`);
  }
  const d = await r.json().catch(() => null);
  if (!d || 'error' in d) {
    throw new Error(`kvExec(${commandArray[0]}) returned an error: ${JSON.stringify(d).slice(0,200)}`);
  }
  return d.result;
}

export async function kvGet(key) {
  const result = await kvExec(['GET', key]);
  // null is Upstash's normal, legitimate response for "key doesn't exist" —
  // NOT an error, so this stays a clean null return.
  return result ? JSON.parse(result) : null;
}

async function kvSet(key, value) {
  const result = await kvExec(['SET', key, JSON.stringify(value)]);
  if (result !== 'OK') {
    throw new Error(`kvSet did not confirm write for ${key}: got ${JSON.stringify(result).slice(0,200)}`);
  }
}

async function kvKeys(prefix) {
  const result = await kvExec(['KEYS', prefix + '*']);
  if (!Array.isArray(result)) {
    throw new Error(`kvKeys got unexpected response for prefix ${prefix}: ${JSON.stringify(result).slice(0,200)}`);
  }
  return result;
}

async function kvDel(key) {
  return await kvExec(['DEL', key]);
}

// ── Circle SDK client ─────────────────────────────────────────────────────────
// initiateDeveloperControlledWalletsClient handles RSA encryption automatically.
// DO NOT manually construct entitySecretCiphertext.
export async function getClient() {
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
// chain defaults to the original Arc Testnet constant for full backward
// compatibility — every existing caller that doesn't pass a chain keeps
// using the exact same Redis key and behavior as before. Passing a
// different chain (e.g. 'BASE') gets or creates a genuinely separate
// wallet on that chain, within the SAME underlying wallet set — Circle
// wallet sets can hold one wallet per blockchain, so this is one user
// identity with real presence on multiple chains, not disconnected
// per-chain identities.
export async function getOrCreateAgentWallet(userAddress, chain = BLOCKCHAIN) {
  const isDefaultChain = chain === BLOCKCHAIN;
  const key = isDefaultChain
    ? `nan:agentwallet:${userAddress.toLowerCase()}`
    : `nan:agentwallet:${chain.toLowerCase()}:${userAddress.toLowerCase()}`;

  // 1. Redis exact match (fast path)
  const existing = await kvGet(key);
  if (existing?.walletAddress) {
    console.log(`[agent-wallets] Redis hit for ${userAddress.slice(0,10)} on ${chain}`);
    return existing;
  }

  // 2. Redis case-variant scan
  try {
    const scanPrefix = isDefaultChain ? 'nan:agentwallet:' : `nan:agentwallet:${chain.toLowerCase()}:`;
    const allKeys = await kvKeys(scanPrefix);
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

  // 3. Scan Circle wallet sets by name — look for BOTH a wallet already on
  // the requested chain (recovery case) AND the wallet set itself (so a
  // new chain's wallet can be added to the SAME set rather than creating
  // a disconnected one).
  let existingWalletSetId = null;
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
        existingWalletSetId = ws.id;

        // listWallets: filter by walletSetId, accepts object input
        const wRes = await client.listWallets({ walletSetId: ws.id, pageSize: 10 });
        const wallets = wRes.data?.wallets || [];
        const chainWallet = wallets.find(w => w.blockchain === chain);
        if (chainWallet?.id && chainWallet?.address) {
          found = {
            walletId: chainWallet.id,
            walletAddress: chainWallet.address,
            walletSetId: ws.id,
            userAddress,
            createdAt: Date.now(),
            recoveredAt: Date.now()
          };
          break;
        }
      }
      if (found || existingWalletSetId) break;
    } while (pageAfter);

    if (found) {
      await kvSet(key, found);
      console.log(`[agent-wallets] Recovered ${found.walletAddress} for ${userAddress.slice(0,10)} on ${chain} from Circle`);
      return found;
    }
  } catch(e) {
    console.log('[agent-wallets] Circle scan error:', e.message);
  }

  // 4. Create wallet on this chain — reusing the existing wallet set if one
  // was found above (adding a new chain to an existing identity), or
  // creating both together if this is a genuinely new user.
  console.log(`[agent-wallets] Creating new ${chain} wallet for ${userAddress.slice(0,10)}`);

  let walletSetId = existingWalletSetId;
  if (!walletSetId) {
    // createWalletSet: only needs idempotencyKey and name
    const wsRes = await client.createWalletSet({
      idempotencyKey: deterministicUUID('walletset', userAddress),
      name: wsName
    });
    walletSetId = wsRes.data?.walletSet?.id;
    if (!walletSetId) throw new Error('createWalletSet failed: ' + JSON.stringify(wsRes.data));
  }

  // createWallets: accepts { blockchains, count, walletSetId, accountType? }
  // accountType 'EOA' is default and broadest
  const wRes = await client.createWallets({
    idempotencyKey: deterministicUUID(`wallet-${chain}`, userAddress),
    blockchains: [chain],
    count: 1,
    walletSetId,
    accountType: 'EOA'
  });
  const wallet = wRes.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address)
    throw new Error('createWallets failed: ' + JSON.stringify(wRes.data));

  const record = { walletId: wallet.id, walletAddress: wallet.address, walletSetId, userAddress, createdAt: Date.now() };
  await kvSet(key, record);
  console.log(`[agent-wallets] Created ${chain} wallet ${wallet.address} for ${userAddress.slice(0,10)}`);
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
    try {
      return await getAgentBalanceRpc(walletAddress);
    } catch(e) {
      console.log('[agent-wallets] RPC balance read failed, falling back to Circle SDK:', e.message);
      // fall through to Circle SDK balance below instead of reporting a false 0.00
    }
  }
  // Couldn't resolve an address, or the RPC read failed — fall back to Circle's SDK balance call
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
    console.log('[agent-wallets] Both RPC and Circle SDK balance failed:', e.message);
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
  if (!walletAddress) throw new Error('No wallet address to read balance for');
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider(ARC_RPC, { chainId: ARC_CHAIN_ID, name: 'arc-testnet' });
  const usdc = new ethers.Contract(USDC_ADDRESS, TOKEN_ABI, provider);
  const eurc = new ethers.Contract(EURC_ADDRESS, TOKEN_ABI, provider);
  const [u, e] = await Promise.all([
    usdc.balanceOf(walletAddress),
    eurc.balanceOf(walletAddress)
  ]);
  return { USDC: (Number(u) / 1e6).toFixed(2), EURC: (Number(e) / 1e6).toFixed(2) };
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

async function setPolicy(walletAddress, updates) {
  const key = `nan:agentpolicy:${walletAddress.toLowerCase()}`;
  let existing = await kvGet(key) || {};
  // Defensive: a policy record should only ever be a handful of numbers.
  // If it's somehow grown huge (corrupted from an earlier bug, a bad write,
  // whatever), don't keep re-writing that bloat forever — drop it and start
  // clean, so this can't turn into a permanent "every save fails" state for
  // whoever's wallet this happens to.
  if (JSON.stringify(existing).length > 5000) {
    console.warn(`[policy] Discarding oversized existing policy for ${walletAddress.slice(0,10)} (${JSON.stringify(existing).length} bytes) instead of merging onto it`);
    existing = {};
  }
  const policy = { ...existing };
  // Only touch fields actually present in this call — lets each form (main
  // limits vs. the separate nanopay cap) update just its own field without
  // silently wiping out whatever the other one already saved.
  if ('perTx' in updates)      policy.perTx      = updates.perTx      != null ? parseFloat(updates.perTx)      : null;
  if ('daily' in updates)      policy.daily      = updates.daily      != null ? parseFloat(updates.daily)      : null;
  if ('weekly' in updates)     policy.weekly     = updates.weekly     != null ? parseFloat(updates.weekly)     : null;
  if ('nanopayCap' in updates) policy.nanopayCap = updates.nanopayCap != null ? parseFloat(updates.nanopayCap) : null;
  policy.updatedAt = Date.now();
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
  // Trust-tier auto-approve cap disabled by request — the wallet's own
  // spending policy (perTx/daily/weekly) is now the only gate. Trust data
  // is still fetched and returned for display/history purposes, it just
  // no longer blocks payments on its own.
  const [policyResult, trust] = await Promise.all([
    checkPolicy(senderWallet, amount),
    getTrust(senderWallet, counterpartyWallet)
  ]);
  if (!policyResult.allowed) return policyResult;

  return { allowed: true, trust, tierCap: trustTierCap(trust) };
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

// ── User email (for notifications — separate from wallet identity) ────────
async function linkUserEmail(userAddress, email) {
  await kvSet(`nan:useremail:${userAddress.toLowerCase()}`, { email, linkedAt: Date.now() });
}
async function getUserEmail(userAddress) {
  const rec = await kvGet(`nan:useremail:${userAddress.toLowerCase()}`);
  return rec?.email || null;
}

// ── Notification preferences ────────────────────────────────────────────
// Redis: nan:notifyprefs:{userAddress} → { transfers, invoices, escrow, recurring }
// Covers money-movement events only. All categories default to on; users
// can unsubscribe per category. Missing categories on a stored record
// (e.g. added after the user last saved prefs) also default to on.
const NOTIFY_CATEGORIES = ['transfers', 'invoices', 'escrow', 'recurring'];
const NOTIFY_DEFAULTS = { transfers: true, invoices: true, escrow: true, recurring: true };

async function getNotifyPrefs(userAddress) {
  const rec = await kvGet(`nan:notifyprefs:${userAddress.toLowerCase()}`);
  return { ...NOTIFY_DEFAULTS, ...(rec || {}) };
}
async function setNotifyPrefs(userAddress, prefs) {
  const current = await getNotifyPrefs(userAddress);
  const updated = { ...current };
  for (const cat of NOTIFY_CATEGORIES) {
    if (typeof prefs[cat] === 'boolean') updated[cat] = prefs[cat];
  }
  await kvSet(`nan:notifyprefs:${userAddress.toLowerCase()}`, updated);
  return updated;
}

// Real emails are restricted to the 'invoices' category only. Every other
// category (transfers, escrow, recurring) is a deliberate no-op — recurring
// payments in particular can fire far more often than any transactional
// email budget can absorb (a single test schedule at a short interval
// already burned through the whole daily send quota and took OTP delivery
// down with it). If more categories need real email later, widen this on
// purpose rather than removing it by accident.
const EMAIL_ENABLED_CATEGORIES = new Set(['invoices']);
async function notifyUser(userAddress, category, subject, message) {
  if (!userAddress) return;
  if (!EMAIL_ENABLED_CATEGORIES.has(category)) return;
  try {
    const prefs = await getNotifyPrefs(userAddress);
    if (!prefs[category]) return;
    const email = await getUserEmail(userAddress);
    if (!email) return;
    await sendNotificationEmail(email, subject, message);
  } catch (e) {
    console.error(`[notify:${category}] failed:`, e.message);
  }
}

function newInvoiceId() { return 'inv_' + crypto.randomBytes(8).toString('hex'); }

async function getInvoice(invoiceId) {
  return await kvGet(`nan:a2ainvoice:${invoiceId}`);
}
async function saveInvoice(inv) {
  await kvSet(`nan:a2ainvoice:${inv.id}`, inv);
  return inv;
}
async function listInvoicesFor(walletAddress, direction) {
  // direction: 'incoming' (invoices asking ME to pay) or 'outgoing' (invoices I sent, asking to be paid)
  const keys = await kvKeys('nan:a2ainvoice:');
  const out = [];
  for (const k of keys) {
    const inv = await kvGet(k);
    if (!inv) continue;
    // toWallet = requester/payee (gets paid), fromWallet = payer (being asked to pay).
    // 'incoming' from the payer's perspective means "asking me to pay" — that's fromWallet.
    const field = direction === 'outgoing' ? 'toWallet' : 'fromWallet';
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
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, userAddress, toAddress, amount, token = 'USDC' } = req.body || {};
  if (!userAddress) return res.status(400).json({ error: 'userAddress required' });

  if (action === 'link-email') {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Valid email required' });
    if (!requireEmailSession(req, res, { matchEmail: email })) return;
  } else if (AUTH_REQUIRED_ACTIONS.has(action)) {
    const ok = await requireAgentAuth(req, res, { action, userAddress, getLinkedEmail: getUserEmail });
    if (!ok) return; // requireAgentAuth already sent the 401/403 response
  }

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

    // ── resolve-payee: figure out the correct agent wallet address to bill,
    // given whatever the sender typed into "Bill To". Two real cases:
    //   1. They typed an agent wallet address directly (e.g. copied it from
    //      the Agent Wallet page itself) — use it as-is, no resolution.
    //   2. They typed a main/login wallet address — resolve it to THAT
    //      person's agent wallet via getOrCreateAgentWallet, same as before.
    // Without checking case 1 first, an already-correct agent wallet address
    // got treated as a main address and resolved AGAIN, producing a
    // completely unrelated wrong address — exactly the reported bug.
    if (action === 'resolve-payee') {
      const { address } = req.body;
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ success: false, error: 'Valid address required' });
      }
      const addrLower = address.toLowerCase();
      const keys = await kvKeys('nan:agentwallet:');
      for (const k of keys) {
        const w = await kvGet(k);
        if (w?.walletAddress?.toLowerCase() === addrLower) {
          return res.json({ success: true, agentWalletAddress: address, alreadyAgentWallet: true });
        }
      }
      // Not an existing agent wallet — treat as a main address and resolve.
      const wallet = await getOrCreateAgentWallet(address);
      return res.json({ success: true, agentWalletAddress: wallet.walletAddress, alreadyAgentWallet: false });
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
      await notifyUser(userAddress, 'transfers', `Transfer sent: ${amount} ${token}`,
        `You sent ${amount} ${token} to ${toAddress}.`);
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
      const { walletAddress: pWallet, perTx, daily, weekly, nanopayCap } = req.body;
      if (!pWallet) return res.status(400).json({ error: 'walletAddress required' });
      const updates = {};
      if ('perTx' in req.body)      updates.perTx = perTx;
      if ('daily' in req.body)      updates.daily = daily;
      if ('weekly' in req.body)     updates.weekly = weekly;
      if ('nanopayCap' in req.body) updates.nanopayCap = nanopayCap;
      if (Object.keys(updates).length === 0)
        return res.status(400).json({ error: 'At least one of perTx, daily, weekly, or nanopayCap required' });
      const policy = await setPolicy(pWallet, updates);
      console.log(`[policy] Set for ${pWallet.slice(0,10)}: perTx=${policy.perTx} daily=${policy.daily} weekly=${policy.weekly} nanopayCap=${policy.nanopayCap}`);
      return res.json({ success: true, policy });
    }

    // ── get-policy: read current spending limits + today's spend ─────────────
    // ── link-email: associate an email with this wallet for notifications ────
    if (action === 'link-email') {
      const { email } = req.body;
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
      await linkUserEmail(userAddress, email);
      return res.json({ success: true });
    }

    // ── get-email: check whether this wallet has a notification email on file ─
    if (action === 'get-email') {
      const email = await getUserEmail(userAddress);
      return res.json({ success: true, email: email || null });
    }

    // ── get-notify-prefs: read per-category email subscription state ────────
    if (action === 'get-notify-prefs') {
      const prefs = await getNotifyPrefs(userAddress);
      return res.json({ success: true, prefs });
    }

    // ── set-notify-prefs: update per-category email subscription state ──────
    if (action === 'set-notify-prefs') {
      const { prefs } = req.body;
      if (!prefs || typeof prefs !== 'object') return res.status(400).json({ error: 'prefs object required' });
      const updated = await setNotifyPrefs(userAddress, prefs);
      return res.json({ success: true, prefs: updated });
    }

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
      const key = `nan:agentpolicy:${pWallet.toLowerCase()}`;
      await kvDel(key);
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
        const NAME_REGISTRY_ADDR = '0x043D072B12CBe488DBA3d2975c42Db3055F2836f'; // NANNameRegistry (matches frontend NAME_REGISTRY)
        const NAME_ABI_MINI = ['function resolve(string name) view returns (address)'];
        try {
          const rp = new JsonRpcProvider('https://rpc.testnet.arc.io');
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
      await notifyUser(userAddress, 'transfers', `Transfer sent: ${amount} ${token}`,
        sentToAgent
          ? `You sent ${amount} ${token} agent-to-agent to ${destination}.`
          : `You sent ${amount} ${token} to ${destination}'s main wallet.`);
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
      await notifyUser(userAddress, 'escrow', `Escrow created: ${amount} ${token}`,
        `You locked ${amount} ${token} in escrow${task ? ` for "${task}"` : ''}. Awaiting recipient attestation.`);
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
      await notifyUser(escrow.fromUserAddress, 'escrow', `Escrow released: ${escrow.amount} ${escrow.token}`,
        `You released ${escrow.amount} ${escrow.token} from escrow to ${escrow.toWallet}.`);
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
      await notifyUser(escrow.fromUserAddress, 'escrow', `Escrow refunded: ${escrow.amount} ${escrow.token}`,
        `Your escrow of ${escrow.amount} ${escrow.token} was refunded — funds were never moved.`);
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
      await notifyUser(userAddress, 'recurring', `Recurring payment scheduled: ${amount} ${token}`,
        `A recurring payment of ${amount} ${token} every ${intervalSeconds}s has been set up${label ? ` — "${label}"` : ''}.`);
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
          // Sub-hourly intervals are explicitly labeled as testing-only in
          // the UI ("1 min is here for testing — watch it actually fire").
          // A real recurring payment (hourly+) still gets its confirmation
          // email, but a 1-minute test schedule left running would otherwise
          // burn through the whole email account's daily send quota in
          // minutes, taking down OTP delivery for every other user with it —
          // which is exactly what happened before this fix.
          if (sched.intervalSeconds >= 3600) {
            await notifyUser(sched.fromUserAddress, 'recurring', `Recurring payment sent: ${sched.amount} ${sched.token}`,
              `Your recurring payment of ${sched.amount} ${sched.token}${sched.label ? ` — "${sched.label}"` : ''} was sent (run #${sched.runCount}).`);
          }
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
      const { agentWalletAddress, fromAgentAddress, billedToInput, amount, token = 'USDC', reason, autoHonorThreshold } = req.body;
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
        // What the sender actually typed into "Bill To", if it differs from
        // the resolved agent wallet address (e.g. they typed a main wallet
        // address or .arc name) — shown back to them in their Outgoing list
        // so an unfamiliar-looking resolved address doesn't read as a bug.
        billedToInput: (billedToInput && billedToInput.toLowerCase() !== fromAgentAddress.toLowerCase()) ? billedToInput : null,
        amount: parseFloat(amount),
        token,
        reason: reason || '',
        status: 'pending',                // pending → honored | rejected | expired
        createdAt: Date.now()
      });

      // Invoices always start pending and require the payer to explicitly
      // honor or reject — no auto-execution on creation. This used to
      // auto-pay immediately whenever the payer's basic spending policy
      // allowed it, with no manual review step at all, which is exactly
      // why invoices showed as already "honored" with nothing left for the
      // payer to actually see or act on.
      const payerKeys = await kvKeys('nan:agentwallet:');
      let payerUserAddress = null;
      for (const k of payerKeys) {
        const w = await kvGet(k);
        if (w?.walletAddress?.toLowerCase() === fromAgentAddress.toLowerCase()) {
          payerUserAddress = w.userAddress || k.replace('nan:agentwallet:', '');
          break;
        }
      }
      const autoEval = { autoHonored: false, reason: 'Awaiting payer review' };

      // Notify the payer there's something to actually act on.
      if (payerUserAddress) {
        await notifyUser(payerUserAddress, 'invoices', `New invoice: ${invoice.amount} ${invoice.token}`,
          `You've been sent an invoice for ${invoice.amount} ${invoice.token}${reason ? ` — "${reason}"` : ''}.\n\nOpen NAN to review and respond.`);
      }
      await notifyUser(userAddress, 'invoices',
        autoEval.autoHonored ? `Invoice auto-paid: ${invoice.amount} ${invoice.token}` : `Invoice sent: ${invoice.amount} ${invoice.token}`,
        autoEval.autoHonored
          ? `Your invoice for ${invoice.amount} ${invoice.token}${reason ? ` — "${reason}"` : ''} to ${fromAgentAddress} was paid automatically.`
          : `You sent an invoice for ${invoice.amount} ${invoice.token}${reason ? ` — "${reason}"` : ''} to ${fromAgentAddress}.`);

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
        if (invoice.toUserAddress) {
          await notifyUser(invoice.toUserAddress, 'invoices', `Invoice rejected: ${invoice.amount} ${invoice.token}`,
            `Your invoice for ${invoice.amount} ${invoice.token}${invoice.reason ? ` — "${invoice.reason}"` : ''} was rejected.`);
        }
        await notifyUser(userAddress, 'invoices', `You rejected an invoice: ${invoice.amount} ${invoice.token}`,
          `You rejected an invoice for ${invoice.amount} ${invoice.token}${invoice.reason ? ` — "${invoice.reason}"` : ''} from ${invoice.fromWallet}.`);
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
      if (invoice.toUserAddress) {
        await notifyUser(invoice.toUserAddress, 'invoices', `Invoice paid: ${invoice.amount} ${invoice.token}`,
          `Your invoice for ${invoice.amount} ${invoice.token}${invoice.reason ? ` — "${invoice.reason}"` : ''} has been paid.`);
      }
      await notifyUser(userAddress, 'invoices', `You paid an invoice: ${invoice.amount} ${invoice.token}`,
        `You paid an invoice for ${invoice.amount} ${invoice.token}${invoice.reason ? ` — "${invoice.reason}"` : ''} to ${invoice.toWallet}.`);
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

