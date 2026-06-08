// api/orders.js — Order persistence using Upstash Redis REST API
// Fully persistent — survives Railway restarts, redeploys, container replacements
// GET    /api/orders?wallet=0x...  → list orders
// POST   /api/orders               → { order: {...} } save/update order
// DELETE /api/orders               → { id: 'all' | 'order-id' }

const UPSTASH_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(...args) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${UPSTASH_URL}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    signal: AbortSignal.timeout(5000)
  });
  const d = await r.json();
  return d.result;
}

async function getOrders(wallet) {
  try {
    const raw = await redisCmd('GET', `nan:orders:${wallet.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { console.log('[orders] Redis GET error:', e.message); return []; }
}

async function setOrders(wallet, orders) {
  try {
    await redisCmd('SET', `nan:orders:${wallet.toLowerCase()}`, JSON.stringify(orders));
  } catch(e) { console.log('[orders] Redis SET error:', e.message); }
}

// In-memory cache so cron can access orders without re-fetching every second
export const ordersStore = new Map();

// Sync ordersStore from Redis on startup
async function syncFromRedis() {
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${UPSTASH_URL}/keys/nan:orders:*`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const d = await r.json();
    const keys = d.result || [];
    for (const key of keys) {
      const wallet = key.replace('nan:orders:', '');
      const orders = await getOrders(wallet);
      if (orders.length) ordersStore.set(wallet, orders);
    }
    console.log(`[orders] Synced ${ordersStore.size} wallets from Upstash Redis`);
  } catch(e) { console.log('[orders] Redis sync error:', e.message); }
}

// Export saveToDisk as saveToRedis alias so server.js cron works unchanged
export async function saveToDisk(map) {
  for (const [wallet, orders] of map.entries()) {
    await setOrders(wallet, orders);
  }
}

// Run sync on module load
if (UPSTASH_URL && UPSTASH_TOKEN) {
  syncFromRedis();
} else {
  console.log('[orders] ⚠️ Upstash keys not set — orders will be in-memory only');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const wallet = (req.query?.wallet || '').toLowerCase();
  if (!wallet || !/^0x[a-f0-9]{40}$/i.test(wallet))
    return res.json({ success: false, error: 'Valid wallet address required' });

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const orders = await getOrders(wallet);
    const active = orders.filter(o => o.status === 'pending' || o.status === 'fx-triggered');
    ordersStore.set(wallet, active); // refresh in-memory cache
    return res.json({ success: true, orders: active });
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { order } = req.body || {};
    if (!order || !order.id)
      return res.json({ success: false, error: 'order with id required' });
    const existing = await getOrders(wallet);
    const updated = existing.filter(o => o.id !== order.id);
    updated.push({ ...order, wallet, savedAt: Date.now() });
    await setOrders(wallet, updated);
    ordersStore.set(wallet, updated);
    return res.json({ success: true, saved: true });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (id === 'all') {
      await redisCmd('DEL', `nan:orders:${wallet}`);
      ordersStore.delete(wallet);
    } else {
      const existing = await getOrders(wallet);
      const updated = existing.filter(o => o.id !== id);
      await setOrders(wallet, updated);
      ordersStore.set(wallet, updated);
    }
    return res.json({ success: true, deleted: id || 'all' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
