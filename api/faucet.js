// api/faucet.js
// Proxies faucet requests to Circle's testnet faucet
// Needed because Circle faucet has CORS restrictions

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { address } = req.body || {};
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address))
    return res.json({ success: false, error: 'Valid wallet address required' });

  try {
    // Try Circle's official faucet API
    const faucetRes = await fetch('https://faucet.circle.com/api/faucet', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        address,
        blockchain: 'ARC-TESTNET',
        native:     false,
        tokens:     ['USDC', 'EURC'],
      }),
    });

    if (faucetRes.ok) {
      const data = await faucetRes.json();
      return res.json({ success: true, data, message: 'Tokens requested — arrives in ~30 seconds' });
    }

    // If faucet API fails, return helpful message
    const errText = await faucetRes.text().catch(() => '');
    console.warn('[faucet] Circle faucet returned', faucetRes.status, errText.slice(0, 100));
    return res.json({
      success: false,
      error:   'Faucet unavailable — visit faucet.circle.com directly',
      fallback: 'https://faucet.circle.com',
    });

  } catch (err) {
    console.error('[faucet]', err.message);
    return res.json({
      success:  false,
      error:    'Faucet request failed — visit faucet.circle.com directly',
      fallback: 'https://faucet.circle.com',
    });
  }
}
