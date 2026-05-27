// api/appkit-swap.js — Circle App Kit: swap, bridge, send
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, walletAddress, tokenIn, tokenOut, amountIn,
          fromChain, toChain, toAddress, amount, token } = req.body || {};

  try {
    // Lazy imports — prevents Vercel from bundling at build time
    const { AppKit } = await import('@circle-fin/app-kit');
    const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');

    const kit = new AppKit();

    function makeAdapter(wId) {
      return createCircleWalletsAdapter({
        apiKey: process.env.CIRCLE_API_KEY,
        entitySecret: process.env.CIRCLE_ENTITY_SECRET,
        ...(wId ? { walletId: wId } : {}),
      });
    }

    // ── SWAP ──
    if (action === 'swap') {
      if (!walletId || !walletAddress)
        return res.status(400).json({ error: 'walletId and walletAddress required' });

      const result = await kit.swap({
        from: {
          adapter: makeAdapter(walletId),
          chain: fromChain || 'Arc_Testnet',
          address: walletAddress,
        },
        tokenIn: tokenIn || 'USDC',
        tokenOut: tokenOut || 'EURC',
        amountIn: String(parseFloat(amountIn).toFixed(6)),
        config: { kitKey: process.env.KIT_KEY },
      });

      return res.json({
        success: true,
        txHash: result.txHash,
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        explorerUrl: result.explorerUrl,
      });
    }

    // ── ESTIMATE SWAP ──
    if (action === 'estimateSwap') {
      const result = await kit.estimateSwap({
        from: {
          adapter: makeAdapter(),
          chain: fromChain || 'Arc_Testnet',
          address: walletAddress || '0x0000000000000000000000000000000000000001',
        },
        tokenIn: tokenIn || 'USDC',
        tokenOut: tokenOut || 'EURC',
        amountIn: String(parseFloat(amountIn || '1').toFixed(6)),
        config: { kitKey: process.env.KIT_KEY },
      });
      return res.json({ success: true, estimate: result });
    }

    // ── BRIDGE ──
    if (action === 'bridge') {
      if (!walletId || !walletAddress)
        return res.status(400).json({ error: 'walletId and walletAddress required' });

      const adapter = makeAdapter(walletId);
      const result = await kit.bridge({
        from: {
          adapter,
          chain: fromChain || 'Arc_Testnet',
          address: walletAddress,
        },
        to: {
          adapter,
          chain: toChain || 'Ethereum_Sepolia',
        },
        amount: String(parseFloat(amount).toFixed(6)),
        token: token || 'USDC',
        config: { kitKey: process.env.KIT_KEY },
      });

      return res.json({
        success: true,
        txHash: result.txHash,
        amount: result.amount,
        explorerUrl: result.explorerUrl,
      });
    }

    // ── ESTIMATE BRIDGE ──
    if (action === 'estimateBridge') {
      const adapter = makeAdapter();
      const result = await kit.estimateBridge({
        from: { adapter, chain: fromChain || 'Arc_Testnet' },
        to: { adapter, chain: toChain || 'Ethereum_Sepolia' },
        amount: String(parseFloat(amount || '1').toFixed(6)),
        token: token || 'USDC',
        config: { kitKey: process.env.KIT_KEY },
      });
      return res.json({ success: true, estimate: result });
    }

    // ── SEND ──
    if (action === 'send') {
      if (!walletId || !walletAddress)
        return res.status(400).json({ error: 'walletId and walletAddress required' });

      const result = await kit.send({
        from: {
          adapter: makeAdapter(walletId),
          chain: fromChain || 'Arc_Testnet',
          address: walletAddress,
        },
        to: toAddress,
        amount: String(parseFloat(amount).toFixed(6)),
        token: token || 'USDC',
        config: { kitKey: process.env.KIT_KEY },
      });

      return res.json({
        success: true,
        txHash: result.txHash,
        amount: result.amount,
        explorerUrl: result.explorerUrl,
      });
    }

    return res.status(400).json({ error: 'Unknown action. Use: swap, estimateSwap, bridge, estimateBridge, send' });

  } catch (err) {
    console.error('AppKit error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
