// api/execute-orders.js — Server-side autonomous order executor for NAN Wallet
// Called by the Railway cron every 60s to execute pending scheduled/standing orders
// POST /api/execute-orders  { secret: ADMIN_PASSWORD }  (internal only)

const AGENT_API = 'https://nan-production.up.railway.app/api/agent-stack';

async function agentTransfer(fromAddress, toAddress, amount, chain = 'ARC-TESTNET') {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(AGENT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'transfer', fromAddress, toAddress, amount: String(amount), chain })
  });
  return r.json();
}

async function agentSwap(address, from, to, amount, chain = 'ARC-TESTNET') {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(AGENT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'swap', address, sellToken: from, buyToken: to, sellAmount: amount, chain })
  });
  return r.json();
}

async function getNgnRate() {
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await r.json();
    return d?.rates?.NGN || 1620;
  } catch { return 1620; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Auth — internal cron only
  const { secret, orders, agentAddress } = req.body || {};
  const ADMIN = process.env.ADMIN_PASSWORD;
  if (!ADMIN || secret !== ADMIN) return res.status(401).json({ error: 'Unauthorized' });
  if (!orders || !Array.isArray(orders) || !agentAddress)
    return res.status(400).json({ error: 'orders array and agentAddress required' });

  const now = Date.now();
  const results = [];

  for (const order of orders) {
    if (order.status !== 'pending') continue;
    let executed = false;
    let result = {};

    try {
      // ── Scheduled one-time order ──────────────────────────────────────────
      if (order.type === 'agent-scheduled' && now >= order.executeAt) {
        const taskType = order.taskType || 'send';
        if (taskType === 'send' && order.to) {
          result = await agentTransfer(agentAddress, order.to, order.amount);
          executed = result.success;
        } else if (taskType === 'swap') {
          result = await agentSwap(agentAddress, order.from || 'USDC', order.to || 'EURC', order.amount);
          executed = result.success;
        }
        if (executed) order.status = 'done';
        results.push({ id: order.id, type: order.type, taskType, executed, result });
      }

      // ── Recurring standing order ──────────────────────────────────────────
      else if (order.type === 'agent-standing' && now >= order.nextRun) {
        const taskType = order.taskType || 'send';
        if (taskType === 'send' && order.to) {
          result = await agentTransfer(agentAddress, order.to, order.amount);
          executed = result.success;
        } else if (taskType === 'swap') {
          result = await agentSwap(agentAddress, order.from || 'USDC', order.to || 'EURC', order.amount);
          executed = result.success;
        }
        if (executed) {
          order.status = 'pending'; // keep alive
          order.nextRun = now + order.interval;
        }
        results.push({ id: order.id, type: order.type, taskType, executed, nextRun: order.nextRun, result });
      }

      // ── FX limit offramp ─────────────────────────────────────────────────
      else if (order.type === 'fx-limit-offramp') {
        const liveRate = await getNgnRate();
        const targetMet = order.condition === 'gte' ? liveRate >= order.targetRate : liveRate <= order.targetRate;
        if (targetMet) {
          // Can't auto-complete bank offramp server-side — flag it for the client
          order.status = 'fx-triggered';
          order.liveRate = liveRate;
          executed = true;
        }
        results.push({ id: order.id, type: 'fx-limit-offramp', triggered: targetMet, liveRate, targetRate: order.targetRate });
      }

    } catch (e) {
      console.error('[execute-orders] order', order.id, 'failed:', e.message);
      results.push({ id: order.id, error: e.message });
    }
  }

  return res.json({ success: true, processed: orders.length, results, orders });
}
