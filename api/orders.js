// api/orders.js
// Server-side order persistence for limit/scheduled orders
// Stores in memory (per Vercel serverless instance) — persistent enough for testnet
// GET  /api/orders?wallet=0x...  → list orders
// POST /api/orders?wallet=0x...  → save order  { order: {...} }
// DELETE /api/orders?wallet=0x... → { id: 'all' } or { id: 'order-id' }

// In-memory store — survives Vercel warm instances (good enough for testnet)
export const ordersStore = new Map(); // wallet → [orders]

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const wallet = (req.query?.wallet || '').toLowerCase();
  if (!wallet || !/^0x[a-f0-9]{40}$/i.test(wallet))
    return res.json({ success: false, error: 'Valid wallet address required' });

  // ── GET orders ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const orders = ordersStore.get(wallet) || [];
    return res.json({ success: true, orders: orders.filter(o => o.status === 'pending') });
  }

  // ── POST — save order ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { order } = req.body || {};
    if (!order || !order.id)
      return res.json({ success: false, error: 'order with id required' });

    const existing = ordersStore.get(wallet) || [];
    // Upsert — replace if same id
    const updated = existing.filter(o => o.id !== order.id);
    updated.push({ ...order, wallet, savedAt: Date.now() });
    ordersStore.set(wallet, updated);

    return res.json({ success: true, saved: true });
  }

  // ── DELETE order ────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (id === 'all') {
      ordersStore.delete(wallet);
      return res.json({ success: true, deleted: 'all' });
    }
    const existing = ordersStore.get(wallet) || [];
    ordersStore.set(wallet, existing.filter(o => o.id !== id));
    return res.json({ success: true, deleted: id });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
