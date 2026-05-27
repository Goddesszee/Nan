export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  if (body.action === 'quote') req.body = { ...body, action: 'swapQuote' };
  else if (body.action === 'swap') req.body = { ...body, action: 'swapExecute' };
  else return res.json({ success: false, error: 'action must be "quote" or "swap"' });
  const { default: h } = await import('../circle-wallets.js');
  return h(req, res);
}
