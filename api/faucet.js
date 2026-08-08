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

  // Two separate requests: native gas token, and the ERC20 stablecoins.
  // Kept separate (not combined into one body) because it's untested/unclear
  // whether Circle's faucet API accepts native + tokens together in a single
  // call — if one form fails, this way it doesn't silently take the other
  // down with it.
  async function requestFaucet(body) {
    try {
      const r = await fetch('https://faucet.circle.com/api/faucet', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (r.ok) return { ok: true, data: await r.json() };
      const errText = await r.text().catch(() => '');
      console.warn('[faucet]', body.native ? 'native' : 'tokens', 'request returned', r.status, errText.slice(0, 100));
      return { ok: false, status: r.status, errText };
    } catch (err) {
      console.error('[faucet]', body.native ? 'native' : 'tokens', 'request failed', err.message);
      return { ok: false, error: err.message };
    }
  }

  const [nativeResult, tokenResult] = await Promise.all([
    requestFaucet({ address, blockchain: 'ARC-TESTNET', native: true }),
    requestFaucet({ address, blockchain: 'ARC-TESTNET', native: false, tokens: ['USDC', 'EURC'] }),
  ]);

  if (nativeResult.ok || tokenResult.ok) {
    return res.json({
      success: true,
      native:  nativeResult.ok,
      tokens:  tokenResult.ok,
      message: nativeResult.ok
        ? 'Tokens and gas requested — arrives in ~30 seconds'
        : 'Tokens requested — arrives in ~30 seconds (gas top-up unavailable right now)',
    });
  }

  return res.json({
    success:  false,
    error:    'Faucet unavailable — visit faucet.circle.com directly',
    fallback: 'https://faucet.circle.com',
  });
}
