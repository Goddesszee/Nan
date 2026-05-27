// api/appkit-swap.js — Circle Swap Kit (@circle-fin/swap-kit)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, walletAddress, tokenIn, tokenOut, amountIn } = req.body || {};

  try {
    const { SwapKit } = await import('@circle-fin/swap-kit');
    const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');
    const kit = new SwapKit();

    function makeAdapter(wId) {
      return createCircleWalletsAdapter({
        apiKey: process.env.CIRCLE_API_KEY,
        entitySecret: process.env.CIRCLE_ENTITY_SECRET,
        ...(wId ? { walletId: wId } : {}),
      });
    }

    if (action === 'estimate') {
      const result = await kit.estimate({
        from: { adapter: makeAdapter(), chain: 'Arc_Testnet', address: walletAddress || '0x0000000000000000000000000000000000000001' },
        tokenIn: tokenIn || 'USDC',
        tokenOut: tokenOut || 'EURC',
        amountIn: String(parseFloat(amountIn || '1').toFixed(6)),
        config: { kitKey: process.env.KIT_KEY },
      });
      return res.json({ success: true, estimate: result });
    }

    if (action === 'swap') {
      if (!walletId || !walletAddress) return res.status(400).json({ error: 'walletId and walletAddress required' });
      if (!tokenIn || !tokenOut || !amountIn) return res.status(400).json({ error: 'tokenIn, tokenOut, amountIn required' });
      const result = await kit.swap({
        from: { adapter: makeAdapter(walletId), chain: 'Arc_Testnet', address: walletAddress },
        tokenIn,
        tokenOut,
        amountIn: String(parseFloat(amountIn).toFixed(6)),
        config: { kitKey: process.env.KIT_KEY },
      });
      return res.json({ success: true, txHash: result.txHash, amountIn: result.amountIn, amountOut: result.amountOut });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('SwapKit error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
