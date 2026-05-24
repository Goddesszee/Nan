// ═══════════════════════════════════════════════════════════════
// NAN AGENT LOOP — Autonomous on-chain execution engine
// Runs server-side, no browser, no human in the loop
// Execute: node agent-loop.js  (or deploy as a Vercel cron job)
// ═══════════════════════════════════════════════════════════════

import fetch from 'node-fetch';
import { ethers } from 'ethers';

// ── Config ────────────────────────────────────────────────────
const ARC_RPC        = 'https://rpc.testnet.arc.network';
const ARC_CHAIN_ID   = 5042002;
const USDC_ADDR      = '0x3600000000000000000000000000000000000000';
const EURC_ADDR      = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const SWAP_CONTRACT  = '0x5cE359b74BE53b1B370641571cBef157dD575c79';
const HISTORY_CONTRACT = '0xC64Fad1CFFDE16167d5887211066b47E1df48B4d';

const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const AGENT_WALLET_ID = process.env.AGENT_WALLET_ID; // Circle Developer-Controlled Wallet
const POLL_INTERVAL   = 30_000; // 30 seconds

// ── ABIs (minimal) ────────────────────────────────────────────
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
];
const SWAP_ABI = [
  'function swapUSDCtoEURC(uint256) external returns (uint256)',
  'function swapEURCtoUSDC(uint256) external returns (uint256)',
  'function getRate() view returns (uint256,uint256)',
];
const HISTORY_ABI = [
  'function record(string,string,string,string,string,bytes32) external',
];

// ── Arc provider ──────────────────────────────────────────────
function getProvider() {
  return new ethers.JsonRpcProvider(ARC_RPC, {
    chainId: ARC_CHAIN_ID,
    name: 'arc-testnet',
    ensAddress: null,
  });
}

function arcGasOpts() {
  return {
    maxFeePerGas: ethers.parseUnits('20', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
  };
}

// ── State (replace with Redis/KV in production) ───────────────
// In production wire this to the same KV store as /api/orders
let agentOrders = [];
let agentLog    = [];

function log(level, msg, data = {}) {
  const entry = { ts: new Date().toISOString(), level, msg, ...data };
  agentLog.push(entry);
  if (agentLog.length > 500) agentLog = agentLog.slice(-500);
  const emoji = { info: '🔵', warn: '🟡', error: '🔴', success: '🟢' }[level] || '⚪';
  console.log(`${emoji} [${entry.ts}] ${msg}`, Object.keys(data).length ? data : '');
}

// ── Circle API helpers ────────────────────────────────────────
async function circlePost(path, body) {
  const r = await fetch(`https://api.circle.com/v1${path}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${CIRCLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Circle API ${path}: ${data?.message || r.status}`);
  return data;
}

async function circleGet(path) {
  const r = await fetch(`https://api.circle.com/v1${path}`, {
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Circle GET ${path}: ${data?.message || r.status}`);
  return data;
}

// Wait for a Circle transaction to confirm (max 90s)
async function waitForCircleTx(txId, label = 'tx', timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(4_000);
    try {
      const data = await circleGet(`/developer/transactions/${txId}`);
      const state = data?.data?.state || '';
      if (['CONFIRMED', 'COMPLETE'].includes(state)) return data.data;
      if (['FAILED', 'CANCELLED', 'DENIED'].includes(state))
        throw new Error(`${label} ${state}`);
    } catch (e) {
      if (e.message.includes('FAILED') || e.message.includes('CANCELLED')) throw e;
    }
  }
  throw new Error(`${label} timed out after ${timeoutMs / 1000}s`);
}

// Transfer USDC/EURC via Circle Developer-Controlled Wallet
async function circleTransfer(walletId, toAddress, amount, tokenSymbol = 'USDC') {
  const tokenAddress = tokenSymbol === 'USDC' ? USDC_ADDR : EURC_ADDR;
  const amtAtomic    = Math.floor(parseFloat(amount) * 1_000_000).toString();

  const data = await circlePost(`/developer/transactions/transfer`, {
    walletId,
    destinationAddress: toAddress,
    amounts:            [amount.toString()],
    tokenAddress,
    blockchain:         'ARC-TESTNET',
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });

  const txId = data?.data?.id;
  if (!txId) throw new Error('No transaction ID from Circle transfer');
  const confirmed = await waitForCircleTx(txId, `transfer ${amount} ${tokenSymbol}`);
  return confirmed;
}

// Call a contract via Circle Developer-Controlled Wallet
async function circleContractCall(walletId, contractAddress, abiSig, params) {
  const data = await circlePost(`/developer/transactions/contractExecution`, {
    walletId,
    contractAddress,
    abiFunctionSignature: abiSig,
    abiParameters:        params,
    blockchain:           'ARC-TESTNET',
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  const txId = data?.data?.id;
  if (!txId) throw new Error(`No tx ID from Circle contractExecution: ${abiSig}`);
  const confirmed = await waitForCircleTx(txId, abiSig);
  return confirmed;
}

// ── FX rate (live from swap contract) ────────────────────────
async function getLiveFXRate() {
  try {
    const provider = getProvider();
    const swap     = new ethers.Contract(SWAP_CONTRACT, SWAP_ABI, provider);
    const [usdcRate, eurcRate] = await swap.getRate();
    // rate = eurc per usdc * 1e6
    const fx = parseFloat(eurcRate) / parseFloat(usdcRate);
    if (fx > 0.5 && fx < 2) return fx;
  } catch (e) {
    log('warn', 'On-chain FX fetch failed, using fallback', { error: e.message });
  }
  // Fallback: Frankfurter free API
  try {
    const r    = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    const data = await r.json();
    if (data.rates?.EUR) return data.rates.EUR;
  } catch {}
  return 0.9258; // static fallback
}

// ── Balance check ─────────────────────────────────────────────
async function getBalances(address) {
  const provider = getProvider();
  const usdc     = new ethers.Contract(USDC_ADDR, ERC20_ABI, provider);
  const eurc     = new ethers.Contract(EURC_ADDR, ERC20_ABI, provider);
  const [uB, eB] = await Promise.all([usdc.balanceOf(address), eurc.balanceOf(address)]);
  return {
    usdc: parseFloat(ethers.formatUnits(uB, 6)),
    eurc: parseFloat(ethers.formatUnits(eB, 6)),
  };
}

// ── Record execution in on-chain history ──────────────────────
async function recordHistory(walletId, type, token, amount, toAddr, label, txHash) {
  try {
    const hashBytes = txHash?.length === 66
      ? txHash
      : ethers.zeroPadValue('0x01', 32);
    await circleContractCall(
      walletId,
      HISTORY_CONTRACT,
      'record(string,string,string,string,string,bytes32)',
      [type, token, amount.toString(), toAddr, label, hashBytes],
    );
  } catch (e) {
    log('warn', 'History record failed (non-fatal)', { error: e.message });
  }
}

// ── Order executors ───────────────────────────────────────────

// LIMIT ORDER: sell token when FX hits target rate
async function executeLimitOrder(order) {
  const fx          = await getLiveFXRate();
  const isUSDCtoEURC = order.sellToken === 'USDC';
  const currentRate  = isUSDCtoEURC ? fx : 1 / fx;
  const targetMet    = order.condition === 'gte'
    ? currentRate >= order.targetRate
    : currentRate <= order.targetRate;

  if (!targetMet) {
    log('info', `Limit order ${order.id}: waiting (current=${currentRate.toFixed(4)}, target=${order.targetRate})`);
    return false;
  }

  log('success', `Limit order ${order.id} TRIGGERED`, {
    sellToken: order.sellToken, amount: order.amount, rate: currentRate,
  });

  const walletId = order.walletId || AGENT_WALLET_ID;
  if (!walletId) throw new Error('No walletId for limit order execution');

  const tokenAddr    = isUSDCtoEURC ? USDC_ADDR : EURC_ADDR;
  const amtAtomic    = Math.floor(order.amount * 1_000_000).toString();
  const swapFnSig    = isUSDCtoEURC
    ? 'swapUSDCtoEURC(uint256)'
    : 'swapEURCtoUSDC(uint256)';

  // Approve swap contract
  await circleContractCall(walletId, tokenAddr, 'approve(address,uint256)', [SWAP_CONTRACT, amtAtomic]);

  // Execute swap
  const result = await circleContractCall(walletId, SWAP_CONTRACT, swapFnSig, [amtAtomic]);
  const txHash = result?.txHash || result?.id || 'confirmed';

  const outAmt = (order.amount * currentRate * 0.999).toFixed(4);
  await recordHistory(walletId, 'swap', order.sellToken, order.amount, SWAP_CONTRACT, `Limit order: ${order.amount} ${order.sellToken}→${order.buyToken}`, txHash);

  order.status     = 'done';
  order.executedAt = Date.now();
  order.txHash     = txHash;
  order.executedRate = currentRate;

  log('success', `Limit order ${order.id} EXECUTED`, { txHash, outAmt, token: order.buyToken });
  await notifyOwner(order, `✅ Limit order executed! Swapped ${order.amount} ${order.sellToken} → ${outAmt} ${order.buyToken} at rate ${currentRate.toFixed(4)}`);
  return true;
}

// SCHEDULED ORDER: send at a specific time
async function executeScheduledOrder(order) {
  if (Date.now() < order.executeAt) return false;

  log('success', `Scheduled order ${order.id} TRIGGERING`, {
    amount: order.amount, token: order.token, to: order.to,
  });

  const walletId = order.walletId || AGENT_WALLET_ID;
  if (!walletId) throw new Error('No walletId for scheduled order');

  const result = await circleTransfer(walletId, order.to, order.amount, order.token);
  const txHash = result?.txHash || result?.id || 'confirmed';

  await recordHistory(walletId, 'out', order.token, order.amount, order.to, order.label || 'Scheduled send', txHash);

  order.status     = 'done';
  order.executedAt = Date.now();
  order.txHash     = txHash;

  // If recurring, create next occurrence
  if (order.recurring && order.interval) {
    const next = {
      ...order,
      id:        genId(),
      status:    'pending',
      executeAt: Date.now() + order.interval,
      runCount:  (order.runCount || 0) + 1,
      synced:    false,
    };
    agentOrders.push(next);
    log('info', `Recurring order rescheduled`, { nextId: next.id, nextRun: new Date(next.executeAt).toISOString() });
  }

  log('success', `Scheduled order ${order.id} EXECUTED`, { txHash });
  await notifyOwner(order, `✅ Scheduled send complete! Sent ${order.amount} ${order.token} to ${order.to.slice(0, 10)}…`);
  return true;
}

// STANDING ORDER: recurring send (weekly payroll, monthly rent, etc.)
async function executeStandingOrder(order) {
  if (Date.now() < order.nextRun) return false;

  log('success', `Standing order ${order.id} TRIGGERING`, {
    amount: order.amount, token: order.token, to: order.to, freq: order.freq,
  });

  const walletId = order.walletId || AGENT_WALLET_ID;
  if (!walletId) throw new Error('No walletId for standing order');

  const result = await circleTransfer(walletId, order.to, order.amount, order.token);
  const txHash = result?.txHash || result?.id || 'confirmed';

  await recordHistory(walletId, 'out', order.token, order.amount, order.to, `Standing order: ${order.label || order.freq}`, txHash);

  order.runCount = (order.runCount || 0) + 1;
  order.nextRun  = Date.now() + order.interval;
  order.lastRun  = Date.now();
  order.lastTxHash = txHash;

  log('success', `Standing order ${order.id} RUN #${order.runCount}`, {
    txHash, nextRun: new Date(order.nextRun).toISOString(),
  });

  await notifyOwner(order, `✅ Standing order ran! Sent ${order.amount} ${order.token} to ${order.to.slice(0, 10)}… (run #${order.runCount}). Next: ${new Date(order.nextRun).toLocaleString()}`);
  return true;
}

// BALANCE GUARD: alert (or auto-top-up) when balance falls below threshold
async function checkBalanceGuard(order) {
  const balances = await getBalances(order.watchAddress || order.walletAddress);
  const bal      = order.watchToken === 'EURC' ? balances.eurc : balances.usdc;

  if (bal >= order.threshold) return false;

  log('warn', `Balance guard ${order.id} TRIGGERED`, {
    address: order.watchAddress, balance: bal, threshold: order.threshold,
  });

  // Auto top-up if configured
  if (order.autoTopUp && order.topUpAmount && order.topUpFrom) {
    const walletId = order.walletId || AGENT_WALLET_ID;
    const result   = await circleTransfer(walletId, order.watchAddress, order.topUpAmount, order.watchToken);
    const txHash   = result?.txHash || 'confirmed';
    log('success', `Balance guard auto top-up sent`, { txHash, amount: order.topUpAmount });
    await notifyOwner(order, `⚡ Auto top-up! Sent ${order.topUpAmount} ${order.watchToken} — balance was ${bal.toFixed(2)}, threshold ${order.threshold}`);

    // If one-shot, mark done
    if (!order.recurring) order.status = 'done';
    else order.lastRun = Date.now();
  } else {
    await notifyOwner(order, `⚠️ Balance alert: ${order.watchToken} balance is ${bal.toFixed(2)} (threshold: ${order.threshold}) on ${order.watchAddress?.slice(0, 10)}…`);
    order.status = 'alerted';
  }
  return true;
}

// ── Notify owner via email (uses existing /api/otp notify endpoint) ──
async function notifyOwner(order, message) {
  const email = order.email || order.creatorEmail;
  if (!email) return;
  try {
    await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        action:  'notify',
        email,
        subject: '✦ NAN Agent executed an order',
        message,
      }),
    });
  } catch (e) {
    log('warn', 'Owner notification failed', { error: e.message });
  }
}

// ── Natural language → order (Claude-powered) ────────────────
async function interpretInstruction(text, walletAddress, walletId) {
  if (!ANTHROPIC_KEY) return null;

  const fx = await getLiveFXRate();

  const systemPrompt = `You are the NAN autonomous agent. Parse the user's instruction into a structured order JSON.

Current state:
- FX rate: 1 USDC = ${fx.toFixed(4)} EURC
- Time: ${new Date().toISOString()}
- Wallet: ${walletAddress}

Output ONLY valid JSON — no prose, no markdown. One of these schemas:

Limit order:
{"type":"limit","amount":50,"sellToken":"USDC","buyToken":"EURC","targetRate":0.95,"condition":"gte","walletId":"${walletId}","email":""}

Scheduled send:
{"type":"scheduled","amount":20,"token":"USDC","to":"0x...","executeAt":1234567890000,"label":"rent","walletId":"${walletId}","email":""}

Standing order:
{"type":"standing","amount":100,"token":"USDC","to":"0x...","interval":604800000,"nextRun":1234567890000,"freq":"weekly","label":"payroll","walletId":"${walletId}","email":""}

Balance guard:
{"type":"balance_guard","watchAddress":"0x...","watchToken":"USDC","threshold":10,"autoTopUp":true,"topUpAmount":50,"recurring":true,"walletId":"${walletId}","email":""}

If the instruction cannot be parsed into any of these, return: {"error":"cannot parse"}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 300,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: text }],
      }),
    });
    const data  = await r.json();
    const reply = data.content?.find(b => b.type === 'text')?.text || '';
    const order = JSON.parse(reply.trim());
    if (order.error) return null;
    return { ...order, id: genId(), status: 'pending', createdAt: Date.now(), synced: false };
  } catch (e) {
    log('warn', 'Instruction parse failed', { error: e.message });
    return null;
  }
}

// ── Order store helpers ───────────────────────────────────────
function genId() {
  return 'agent_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function loadOrdersFromAPI(wallet) {
  try {
    const r    = await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/orders?wallet=${wallet}`);
    const data = await r.json();
    if (data.orders?.length) {
      // Merge — don't duplicate
      const existing = new Set(agentOrders.map(o => o.id));
      for (const o of data.orders) {
        if (!existing.has(o.id)) agentOrders.push(o);
      }
      log('info', `Loaded ${data.orders.length} orders from API`);
    }
  } catch (e) {
    log('warn', 'Could not load orders from API', { error: e.message });
  }
}

async function syncOrderToAPI(order, wallet) {
  try {
    await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/orders?wallet=${wallet}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ wallet, order: { ...order, synced: true } }),
    });
  } catch (e) {
    log('warn', 'Order sync failed', { error: e.message });
  }
}

// ── Main execution tick ───────────────────────────────────────
async function tick() {
  const pending = agentOrders.filter(o => o.status === 'pending');
  if (!pending.length) return;

  log('info', `Agent tick — ${pending.length} pending orders`);

  for (const order of pending) {
    try {
      let executed = false;

      if (order.type === 'limit')         executed = await executeLimitOrder(order);
      else if (order.type === 'scheduled') executed = await executeScheduledOrder(order);
      else if (order.type === 'standing')  executed = await executeStandingOrder(order);
      else if (order.type === 'balance_guard') executed = await checkBalanceGuard(order);
      else log('warn', `Unknown order type: ${order.type}`, { id: order.id });

      if (executed) {
        // Sync updated status back to API
        const wallet = order.walletAddress || order.email || 'unknown';
        await syncOrderToAPI(order, wallet);
      }
    } catch (err) {
      log('error', `Order ${order.id} execution failed`, { error: err.message });
      order.retries    = (order.retries || 0) + 1;
      order.lastError  = err.message;

      // Kill order after 5 failures
      if (order.retries >= 5) {
        order.status = 'failed';
        log('error', `Order ${order.id} permanently failed after 5 retries`);
        await notifyOwner(order, `❌ Order failed after 5 attempts: ${err.message.slice(0, 100)}`);
      }
    }
  }

  // Prune done/failed orders older than 7 days
  const cutoff = Date.now() - 7 * 86_400_000;
  agentOrders  = agentOrders.filter(o => o.status === 'pending' || o.createdAt > cutoff);
}

// ── HTTP interface (for Vercel serverless or Express) ─────────
// This lets the frontend /api/agent/instruct endpoint talk to the loop
export async function handleAgentRequest(req, res) {
  const { action, text, walletAddress, walletId, order } = req.body || {};

  if (action === 'instruct') {
    // Natural language → order
    if (!text) return res.status(400).json({ error: 'text required' });
    const parsed = await interpretInstruction(text, walletAddress, walletId || AGENT_WALLET_ID);
    if (!parsed) return res.status(400).json({ error: 'Could not parse instruction' });

    agentOrders.push(parsed);
    log('info', 'New order from instruction', { id: parsed.id, type: parsed.type });

    return res.json({ success: true, order: parsed });
  }

  if (action === 'list') {
    return res.json({ orders: agentOrders.filter(o => o.status === 'pending') });
  }

  if (action === 'cancel') {
    const target = agentOrders.find(o => o.id === req.body.id);
    if (!target) return res.status(404).json({ error: 'Order not found' });
    target.status = 'cancelled';
    return res.json({ success: true });
  }

  if (action === 'tick') {
    // Manual trigger (for Vercel cron: GET /api/agent?action=tick)
    await tick();
    return res.json({ success: true, orders: agentOrders.length });
  }

  if (action === 'log') {
    return res.json({ log: agentLog.slice(-50) });
  }

  if (action === 'status') {
    const fx       = await getLiveFXRate();
    const pending  = agentOrders.filter(o => o.status === 'pending').length;
    const executed = agentOrders.filter(o => o.status === 'done').length;
    const failed   = agentOrders.filter(o => o.status === 'failed').length;
    return res.json({ alive: true, fx, pending, executed, failed, uptime: process.uptime() });
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ── Vercel serverless export ──────────────────────────────────
// Place this file at api/agent.js for Vercel deployment
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/agent?action=tick — Vercel cron entrypoint
  if (req.method === 'GET') {
    const action = req.query?.action;
    if (action === 'tick') {
      await tick();
      return res.json({ success: true, processed: agentOrders.length });
    }
    if (action === 'status') {
      const fx = await getLiveFXRate();
      return res.json({
        alive: true, fx,
        pending:  agentOrders.filter(o => o.status === 'pending').length,
        executed: agentOrders.filter(o => o.status === 'done').length,
      });
    }
    return res.status(400).json({ error: 'Unknown GET action' });
  }

  if (req.method === 'POST') {
    return handleAgentRequest(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Standalone process mode (node agent-loop.js) ──────────────
const isMain = process.argv[1]?.endsWith('agent-loop.js');
if (isMain) {
  const AGENT_WALLET = process.env.AGENT_WALLET_ADDRESS;

  log('info', '✦ NAN Agent Loop starting', {
    walletId:      AGENT_WALLET_ID || 'not set',
    walletAddress: AGENT_WALLET    || 'not set',
    pollInterval:  `${POLL_INTERVAL / 1000}s`,
  });

  if (!CIRCLE_API_KEY) {
    log('error', 'CIRCLE_API_KEY not set — agent cannot execute transactions');
    process.exit(1);
  }

  // Load any existing orders on startup
  if (AGENT_WALLET) {
    loadOrdersFromAPI(AGENT_WALLET).then(() =>
      log('info', `Loaded ${agentOrders.length} orders from API`),
    );
  }

  // Demo: inject a test standing order if no orders exist (remove in production)
  if (process.env.DEMO_MODE === 'true' && AGENT_WALLET) {
    agentOrders.push({
      id:       genId(),
      type:     'standing',
      amount:   1,
      token:    'USDC',
      to:       AGENT_WALLET,
      interval: 60_000,          // every 1 min in demo
      nextRun:  Date.now() + 5_000,
      freq:     'demo',
      label:    'Demo standing order — 1 USDC every minute',
      walletId: AGENT_WALLET_ID,
      status:   'pending',
      createdAt: Date.now(),
    });
    log('info', 'Demo standing order injected');
  }

  // Main loop
  async function run() {
    while (true) {
      try {
        await tick();
      } catch (e) {
        log('error', 'Tick error', { error: e.message });
      }
      await sleep(POLL_INTERVAL);
    }
  }

  run().catch(e => {
    log('error', 'Agent loop crashed', { error: e.message });
    process.exit(1);
  });

  process.on('SIGINT',  () => { log('info', 'Agent loop stopped'); process.exit(0); });
  process.on('SIGTERM', () => { log('info', 'Agent loop stopped'); process.exit(0); });
}

// ── Utility ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
