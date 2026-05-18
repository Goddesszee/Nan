const CIRCLE_API = 'https://api.circle.com';
const CIRCLE_KEY = process.env.CIRCLE_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!CIRCLE_KEY) return res.status(500).json({ error: 'CIRCLE_API_KEY not set' });

  const { action, from, to, amount, recipientAddress, quoteId, address, message, signature, idempotencyKey } = req.body;

  try {
    if (action === 'quote') {
      const r = await fetch(`${CIRCLE_API}/v1/exchange/stablefx/quotes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CIRCLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: { currency: from, amount: String(amount) },
          to: { currency: to },
          tenor: 'instant',
          type: 'tradable',
          recipientAddress,
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data?.message || 'Quote failed', raw: data });
      return res.json({ success: true, quote: data });
    }

    if (action === 'trade') {
      const r = await fetch(`${CIRCLE_API}/v1/exchange/stablefx/trades`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CIRCLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, quoteId, address, message, signature }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data?.message || 'Trade failed', raw: data });
      return res.json({ success: true, trade: data });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('StableFX error:', err);
    return res.status(500).json({ error: err.message });
  }
}