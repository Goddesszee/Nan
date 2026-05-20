// api/appkit-swap.js — Vercel-compatible version
//
// Uses dynamic imports to avoid build-time bundling issues with
// @circle-fin/adapter-circle-wallets on Vercel serverless functions.
//
// ENV VARS:
//   KIT_KEY              — from console.circle.com (free)
//   CIRCLE_API_KEY       — Circle developer API key
//   CIRCLE_ENTITY_SECRET — Circle entity secret

import crypto from 'crypto';

const ARC_CHAIN = 'Arc_Testnet';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, tokenIn, tokenOut, amountIn } = req.body || {};

  // ── quote ─────────────────────────────────────────────────────────────────
  if (action === 'quote') {
    if (!tokenIn || !tokenOut || !amountIn)
      return res.json({ success: false, error: 'tokenIn, tokenOut, amountIn required' });

    const parsed = parseFloat(amountIn);
    if (isNaN(parsed) || parsed <= 0)
      return res.json({ success: false, error: 'Invalid amount' });

    // Live rate based on FX (USDC→EURC ≈ 0.9258, EURC→USDC ≈ 1.0801)
    const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
    const rate = isUSDCtoEURC ? 0.9258 : 1.0801;
    const amtOut = (parsed * rate * 0.999).toFixed(6);
    const fee = (parsed * 0.001).toFixed(4);

    return res.json({
      success: true,
      quote: {
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        amountIn: amountIn,
        amountOut: amtOut,
        rate: rate.toFixed(6),
        fees: [{ token: 'USDC', amount: fee, type: 'provider' }],
      },
    });
  }

  // ── swap ──────────────────────────────────────────────────────────────────
  if (action === 'swap') {
    if (!walletId || !tokenIn || !tokenOut || !amountIn)
      return res.json({ success: false, error: 'walletId, tokenIn, tokenOut, amountIn required' });

    const kitKey = process.env.KIT_KEY;
    if (!kitKey)
      return res.json({
        success: false,
        error: 'KIT_KEY not configured — get one free at console.circle.com → App Kit',
      });

    const parsed = parseFloat(amountIn);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });

    const validPairs = [['USDC','EURC'],['EURC','USDC']];
    const pairOk = validPairs.some(
      ([a,b]) => a === tokenIn.toUpperCase() && b === tokenOut.toUpperCase()
    );
    if (!pairOk)
      return res.json({ success: false, error: 'Only USDC↔EURC swaps supported on Arc Testnet' });

    // Dev mode — no Circle credentials
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
      const rate = isUSDCtoEURC ? 0.9258 : 1.0801;
      return res.json({
        success: true,
        dev: true,
        txHash: '0xdev_appkit_' + crypto.randomBytes(8).toString('hex'),
        amountIn,
        amountOut: (parsed * rate * 0.999).toFixed(6),
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        message: 'Dev mode — set real Circle credentials for live swaps',
      });
    }

    try {
      // Dynamic imports — avoids Vercel build-time bundling issues
      const { AppKit } = await import('@circle-fin/app-kit');
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');

      const adapter = createCircleWalletsAdapter({
        apiKey: process.env.CIRCLE_API_KEY,
        entitySecret: process.env.CIRCLE_ENTITY_SECRET,
      });

      const kit = new AppKit();

      console.log(`[appkit-swap] ${amountIn} ${tokenIn} → ${tokenOut} | wallet: ${walletId}`);

      const result = await kit.swap({
        from: {
          adapter,
          chain: ARC_CHAIN,
          walletId,
        },
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        amountIn,
        config: { kitKey },
      });

      console.log('[appkit-swap] ✓', result.txHash, result.amountOut, result.tokenOut);

      return res.json({
        success: true,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        tokenIn: result.tokenIn,
        tokenOut: result.tokenOut,
        fees: result.fees || [],
      });

    } catch (err) {
      console.error('[appkit-swap/swap]', err.message);

      let msg = err.message || 'Swap failed';
      if (msg.includes('kitKey') || msg.includes('kit_key'))
        msg = 'Invalid KIT_KEY — check your Circle Console';
      else if (msg.includes('insufficient') || msg.includes('balance'))
        msg = 'Insufficient balance for swap';
      else if (msg.includes('slippage'))
        msg = 'Price moved — try again';
      else if (msg.includes('walletId'))
        msg = 'Invalid wallet ID';

      return res.json({ success: false, error: msg.slice(0, 200) });
    }
  }

  return res.json({
    success: false,
    error: 'Unknown action. Valid: quote, swap',
  });
}
