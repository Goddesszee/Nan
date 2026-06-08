// api/execute-orders.js — Autonomous order executor for NAN Wallet
// Uses Circle AppKit (/api/appkit/send) — CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET
// No CLI session, no private key signing — fully Circle-native
// POST /api/execute-orders  { secret: ADMIN_PASSWORD }  (internal cron only)

const SELF_URL = process.env.RAILWAY_STATIC_URL
  ? `https://${process.env.RAILWAY_STATIC_URL}`
  : 'https://nan-production.up.railway.app';

async function circleAppKitSend(walletAddress, toAddress, amount, token = 'USDC') {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${SELF_URL}/api/appkit/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, destinationAddress: toAddress, amount: String(amount), tokenSymbol: token }),
    signal: AbortSignal.timeout(30000)
  });
  return r.json();
}

async function circleAppKitSwap(walletAddress, from, to, amount) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${SELF_URL}/api/appkit/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'swap', walletAddress, tokenIn: from, tokenOut: to, amountIn: String(amount) }),
    signal: AbortSignal.timeout(30000)
  });
  return r.json();
}

async function getNgnRate() {
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
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

  const { secret, orders, walletAddress } = req.body || {};
  const ADMIN = process.env.ADMIN_PASSWORD;
  if (!ADMIN || secret !== ADMIN) return res.status(401).json({ error: 'Unauthorized' });
  if (!orders || !Array.isArray(orders))
    return res.status(400).json({ error: 'orders array required' });
  if (!walletAddress)
    return res.status(400).json({ error: 'walletAddress required' });
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
    return res.status(500).json({ error: 'Circle keys not configured' });

  const now = Date.now();
  const results = [];

  for (const order of orders) {
    if (order.status !== 'pending') continue;
    try {
      // ── Scheduled one-time ────────────────────────────────────────────────
      if (order.type === 'agent-scheduled' && now >= order.executeAt) {
        const taskType = order.taskType || 'send';
        if (taskType === 'send' && order.to) {
          const r = await circleAppKitSend(walletAddress, order.to, order.amount, order.token || 'USDC');
          if (r.success) {
            order.status = 'done';
            results.push({ id: order.id, type: 'agent-scheduled', taskType, executed: true, txHash: r.txHash });
            console.log(`[executor] ✅ Scheduled send ${order.amount} USDC → ${order.to.slice(0,8)} tx:${r.txHash}`);
          } else {
            results.push({ id: order.id, executed: false, error: r.error });
            console.log(`[executor] ❌ Scheduled send failed:`, r.error);
          }
        } else if (taskType === 'swap') {
          const r = await circleAppKitSwap(walletAddress, order.from || 'USDC', order.to || 'EURC', order.amount);
          if (r.success) {
            order.status = 'done';
            results.push({ id: order.id, type: 'agent-scheduled', taskType, executed: true });
            console.log(`[executor] ✅ Scheduled swap ${order.amount} ${order.from}→${order.to}`);
          } else {
            results.push({ id: order.id, executed: false, error: r.error });
          }
        } else if (taskType === 'bills') {
          const billAction = order.billType === 'airtime' ? 'buy-airtime' :
            order.billType === 'data' ? 'buy-data' :
            order.billType === 'electricity' ? 'pay-electricity' : 'pay-cable';
          const { default: fetch } = await import('node-fetch');
          const r = await fetch(`${SELF_URL}/api/bills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: billAction, phone: order.phone, amount: order.amount,
              network: order.network, meterNumber: order.meter, disco: order.disco,
              cardNumber: order.card, provider: order.provider, variationCode: order.plan }),
            signal: AbortSignal.timeout(30000)
          });
          const d = await r.json();
          if (d.success) {
            order.nextRun = now + order.interval;
            results.push({ id: order.id, type: 'agent-standing', taskType: 'bills', executed: true, message: d.message });
            console.log(`[executor] ✅ Recurring bill: ${d.message}`);
          } else {
            results.push({ id: order.id, executed: false, error: d.error || d.message });
          }
        } else {
          results.push({ id: order.id, skipped: true, reason: `taskType '${taskType}' not supported server-side` });
        }
      }

      // ── Recurring standing ────────────────────────────────────────────────
      else if (order.type === 'agent-standing' && now >= order.nextRun) {
        const taskType = order.taskType || 'send';
        if (taskType === 'send' && order.to) {
          const r = await circleAppKitSend(walletAddress, order.to, order.amount, order.token || 'USDC');
          if (r.success) {
            order.status = 'pending';
            order.nextRun = now + order.interval;
            results.push({ id: order.id, type: 'agent-standing', taskType, executed: true, txHash: r.txHash, nextRun: order.nextRun });
            console.log(`[executor] ✅ Standing send ${order.amount} USDC → ${order.to.slice(0,8)} next:${new Date(order.nextRun).toISOString()}`);
          } else {
            results.push({ id: order.id, executed: false, error: r.error });
          }
        } else if (taskType === 'swap') {
          const r = await circleAppKitSwap(walletAddress, order.from || 'USDC', order.to || 'EURC', order.amount);
          if (r.success) {
            order.status = 'pending';
            order.nextRun = now + order.interval;
            results.push({ id: order.id, type: 'agent-standing', taskType, executed: true, nextRun: order.nextRun });
          } else {
            results.push({ id: order.id, executed: false, error: r.error });
          }
        } else if (taskType === 'bills') {
          const billAction = order.billType === 'airtime' ? 'buy-airtime' :
            order.billType === 'data' ? 'buy-data' :
            order.billType === 'electricity' ? 'pay-electricity' : 'pay-cable';
          const { default: fetch } = await import('node-fetch');
          const r = await fetch(`${SELF_URL}/api/bills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: billAction, phone: order.phone, amount: order.amount,
              network: order.network, meterNumber: order.meter, disco: order.disco,
              cardNumber: order.card, provider: order.provider, variationCode: order.plan }),
            signal: AbortSignal.timeout(30000)
          });
          const d = await r.json();
          if (d.success) {
            order.nextRun = now + order.interval;
            results.push({ id: order.id, type: 'agent-standing', taskType: 'bills', executed: true, message: d.message });
            console.log(`[executor] ✅ Recurring bill: ${d.message}`);
          } else {
            results.push({ id: order.id, executed: false, error: d.error || d.message });
          }
        } else {
          results.push({ id: order.id, skipped: true, reason: `taskType '${taskType}' not supported server-side` });
        }
      }

      // ── FX limit offramp ──────────────────────────────────────────────────
      else if (order.type === 'fx-limit-offramp') {
        const liveRate = await getNgnRate();
        const targetMet = order.condition === 'gte' ? liveRate >= order.targetRate : liveRate <= order.targetRate;
        if (targetMet) {
          order.status = 'fx-triggered';
          order.liveRate = liveRate;
          order.triggeredAt = now;
          results.push({ id: order.id, type: 'fx-limit-offramp', triggered: true, liveRate, targetRate: order.targetRate });
          console.log(`[executor] 💱 FX limit triggered! NGN=${liveRate} target=${order.targetRate}`);
        } else {
          results.push({ id: order.id, type: 'fx-limit-offramp', triggered: false, liveRate, targetRate: order.targetRate });
        }
      }

    } catch (e) {
      console.error(`[executor] ❌ order ${order.id} failed:`, e.message);
      results.push({ id: order.id, error: e.message, executed: false });
    }
  }

  return res.json({ success: true, processed: orders.length, results, orders });
}
