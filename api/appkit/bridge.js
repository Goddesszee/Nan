// api/appkit/bridge.js — routes to circle-wallets.js appkitBridge + relayer mint
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Route to circle-wallets.js appkitBridge action
  req.body = {
    ...(req.body || {}),
    action: 'appkitBridge',
    bridgeAmount: req.body?.amount,
  };
  const { default: h } = await import('../circle-wallets.js');
  return h(req, res);
}
