// NAN Orders API — save/load/delete orders via Upstash Redis
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kv(method, path, body) {
  const res = await fetch(`${KV_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { method, body, query } = req;
  const walletAddr = query.wallet || body?.wallet;
  if (!walletAddr) return res.status(400).json({ error: 'wallet required' });

  const key = `nan:orders:${walletAddr.toLowerCase()}`;

  if (method === 'GET') {
    // Load all orders for wallet
    const data = await kv('GET', `/get/${encodeURIComponent(key)}`);
    const orders = data.result ? JSON.parse(data.result) : [];
    return res.json({ orders });
  }

  if (method === 'POST') {
    // Save order
    const { order } = body;
    if (!order) return res.status(400).json({ error: 'order required' });
    const data = await kv('GET', `/get/${encodeURIComponent(key)}`);
    const orders = data.result ? JSON.parse(data.result) : [];
    orders.push({ ...order, createdAt: Date.now() });
    await kv('POST', `/set/${encodeURIComponent(key)}`, orders);
    return res.json({ ok: true, order });
  }

  if (method === 'DELETE') {
    // Cancel order by id
    const { id } = body;
    const data = await kv('GET', `/get/${encodeURIComponent(key)}`);
    let orders = data.result ? JSON.parse(data.result) : [];
    if (id === 'all') {
      orders = [];
    } else {
      orders = orders.filter(o => o.id !== id);
    }
    await kv('POST', `/set/${encodeURIComponent(key)}`, orders);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
