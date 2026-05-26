export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Orders stored client-side only
  if (req.method === 'GET') return res.json({ orders: [] });
  if (req.method === 'DELETE') return res.json({ success: true });
  res.json({ success: true, orderId: Date.now().toString() });
}
