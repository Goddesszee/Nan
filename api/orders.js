// api/orders.js — Order persistence for NAN Wallet
// Persists to /tmp/nan_orders.json — survives Railway restarts within same deployment
// GET  /api/orders?wallet=0x...  → list pending orders
// POST /api/orders               → save order { order: {...} }
// DELETE /api/orders             → { id: 'all' } or { id: 'order-id' }

import { readFileSync, writeFileSync, existsSync } from 'fs';

const ORDERS_FILE = '/tmp/nan_orders.json';

function loadFromDisk() {
  try {
    if (existsSync(ORDERS_FILE)) {
      const data = JSON.parse(readFileSync(ORDERS_FILE, 'utf8'));
      // data is { wallet: [orders] }
      return new Map(Object.entries(data));
    }
  } catch(e) { console.log('[orders] Could not load from disk:', e.message); }
  return new Map();
}

export function saveToDisk(map) {
  try {
    const obj = Object.fromEntries(map);
    writeFileSync(ORDERS_FILE, JSON.stringify(obj), 'utf8');
  } catch(e) { console.log('[orders] Could not save to disk:', e.message); }
}

// Load on startup — restores orders after Railway restart
export const ordersStore = loadFromDisk();
console.log(`[orders] Loaded ${[...ordersStore.values()].flat().length} orders from disk`);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const wallet = (req.query?.wallet || '').toLowerCase();
  if (!wallet || !/^0x[a-f0-9]{40}$/i.test(wallet))
    return res.json({ success: false, error: 'Valid wallet address required' });

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const orders = ordersStore.get(wallet) || [];
    return res.json({ success: true, orders: orders.filter(o => o.status === 'pending' || o.status === 'fx-triggered') });
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { order } = req.body || {};
    if (!order || !order.id)
      return res.json({ success: false, error: 'order with id required' });
    const existing = ordersStore.get(wallet) || [];
    const updated = existing.filter(o => o.id !== order.id);
    updated.push({ ...order, wallet, savedAt: Date.now() });
    ordersStore.set(wallet, updated);
    saveToDisk(ordersStore);
    return res.json({ success: true, saved: true });
  }

  // ── DELETE ───────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (id === 'all') {
      ordersStore.delete(wallet);
    } else {
      const existing = ordersStore.get(wallet) || [];
      ordersStore.set(wallet, existing.filter(o => o.id !== id));
    }
    saveToDisk(ordersStore);
    return res.json({ success: true, deleted: id || 'all' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
