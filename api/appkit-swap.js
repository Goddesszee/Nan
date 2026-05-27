// api/appkit-swap.js — Circle App Kit swap
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, walletAddress, tokenIn, tokenOut, amountIn } = req.body || {};

  try {
    // Lazy import to avoid build-time issues
    const { AppKit } = await import('@circle-fin/app-kit');
    const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');

    const kit = new AppKit();

    const adapter = createCircleWalletsAdapter({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    });

    if (action === 'quote') {
      const estimate = await kit.estimateSwap({
        from: {
          adapter,
          chain: 'Arc_Testnet',
          address: walletAddress || process.env.AGENT_WALLET_ID,
        },
        tokenIn: tokenIn || 'USDC',
        tokenOut: tokenOut || 'EURC',
        amountIn: String(parseFloat(amountIn || '1').toFixed(6)),
        config: { kitKey: process.env.KIT_KEY },
      });
      return res.json({ success: true, quote: estimate });
    }

    if (action === 'swap') {
      if (!walletId || !walletAddress) {
        return res.status(400).json({ error: 'walletId and walletAddress required' });
      }
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: 'tokenIn, tokenOut, amountIn required' });
      }

      const swapAdapter = createCircleWalletsAdapter({
        apiKey: process.env.CIRCLE_API_KEY,
        entitySecret: process.env.CIRCLE_ENTITY_SECRET,
        walletId,
      });

      const result = await kit.swap({
        from: {
          adapter: swapAdapter,
          chain: 'Arc_Testnet',
          address: walletAddress,
        },
        tokenIn,
        tokenOut,
        amountIn: String(parseFloat(amountIn).toFixed(6)),
        config: { kitKey: process.env.KIT_KEY },
      });

      return res.json({
        success: true,
        txHash: result.txHash,
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        explorerUrl: result.explorerUrl,
        fees: result.fees,
      });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('AppKit swap error:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Swap failed' });
  }
}
