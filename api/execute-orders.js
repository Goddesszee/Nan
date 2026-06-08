// api/execute-orders.js — Autonomous order executor for NAN Wallet
// Uses AGENT_WALLET_PRIVATE_KEY (already in Railway env) to sign txs directly
// No CLI session needed — survives Railway restarts automatically
// POST /api/execute-orders  { secret: ADMIN_PASSWORD }  (internal cron only)

const ARC_RPC       = 'https://rpc.testnet.arc.network';
const ARC_CHAIN_ID  = 5042002;
const USDC_ADDRESS  = '0x3600000000000000000000000000000000000000';
const EURC_ADDRESS  = '0x89B5...72a'; // placeholder — not used in MVP
const USDC_ABI      = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)'
];
const SWAP_CONTRACT = '0x5cE359b74BE53b1B370641571cBef157dD575c79';

async function getEthers() {
  const { ethers } = await import('ethers');
  return ethers;
}

async function getSigner() {
  const ethers = await getEthers();
  const pk = process.env.AGENT_WALLET_PRIVATE_KEY;
  if (!pk) throw new Error('AGENT_WALLET_PRIVATE_KEY not set in Railway env');
  const provider = new ethers.JsonRpcProvider(ARC_RPC, { chainId: ARC_CHAIN_ID, name: 'arc-testnet' });
  return new ethers.Wallet(pk.startsWith('0x') ? pk : '0x' + pk, provider);
}

async function sendUsdc(toAddress, amount) {
  const ethers = await getEthers();
  const signer = await getSigner();
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
  const amountWei = ethers.parseUnits(String(amount), 6);
  const tx = await usdc.transfer(toAddress, amountWei);
  await tx.wait(0); // Arc has sub-second finality
  return { success: true, txHash: tx.hash };
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

  const { secret, orders } = req.body || {};
  const ADMIN = process.env.ADMIN_PASSWORD;
  if (!ADMIN || secret !== ADMIN) return res.status(401).json({ error: 'Unauthorized' });
  if (!orders || !Array.isArray(orders))
    return res.status(400).json({ error: 'orders array required' });
  if (!process.env.AGENT_WALLET_PRIVATE_KEY)
    return res.status(500).json({ error: 'AGENT_WALLET_PRIVATE_KEY not configured' });

  const now = Date.now();
  const results = [];

  for (const order of orders) {
    if (order.status !== 'pending') continue;
    try {
      // ── Scheduled one-time ────────────────────────────────────────────────
      if (order.type === 'agent-scheduled' && now >= order.executeAt) {
        const taskType = order.taskType || 'send';
        if (taskType === 'send' && order.to) {
          const r = await sendUsdc(order.to, order.amount);
          order.status = 'done';
          results.push({ id: order.id, type: 'agent-scheduled', taskType: 'send', executed: true, txHash: r.txHash });
          console.log(`[executor] ✅ Scheduled send ${order.amount} USDC → ${order.to.slice(0,8)} tx:${r.txHash}`);
        } else {
          results.push({ id: order.id, skipped: true, reason: `taskType '${taskType}' not yet supported server-side` });
        }
      }

      // ── Recurring standing ────────────────────────────────────────────────
      else if (order.type === 'agent-standing' && now >= order.nextRun) {
        const taskType = order.taskType || 'send';
        if (taskType === 'send' && order.to) {
          const r = await sendUsdc(order.to, order.amount);
          order.status = 'pending';
          order.nextRun = now + order.interval;
          results.push({ id: order.id, type: 'agent-standing', taskType: 'send', executed: true, txHash: r.txHash, nextRun: order.nextRun });
          console.log(`[executor] ✅ Standing send ${order.amount} USDC → ${order.to.slice(0,8)} tx:${r.txHash} next:${new Date(order.nextRun).toISOString()}`);
        } else {
          results.push({ id: order.id, skipped: true, reason: `taskType '${taskType}' not yet supported server-side` });
        }
      }

      // ── FX limit offramp ──────────────────────────────────────────────────
      else if (order.type === 'fx-limit-offramp') {
        const liveRate = await getNgnRate();
        const targetMet = order.condition === 'gte' ? liveRate >= order.targetRate : liveRate <= order.targetRate;
        if (targetMet) {
          // Can't auto-complete bank offramp (needs bank account details)
          // Flag it — client picks it up on next load and shows notification
          order.status = 'fx-triggered';
          order.liveRate = liveRate;
          order.triggeredAt = now;
          results.push({ id: order.id, type: 'fx-limit-offramp', triggered: true, liveRate, targetRate: order.targetRate });
          console.log(`[executor] 💱 FX limit triggered! NGN=${liveRate} >= target=${order.targetRate}`);
        } else {
          results.push({ id: order.id, type: 'fx-limit-offramp', triggered: false, liveRate, targetRate: order.targetRate });
        }
      }

    } catch (e) {
      console.error(`[executor] ❌ order ${order.id} failed:`, e.message);
      results.push({ id: order.id, error: e.message, executed: false });
      // Don't mark as done — retry next cycle
    }
  }

  return res.json({ success: true, processed: orders.length, results, orders });
}
