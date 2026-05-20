// api/appkit-swap.js
//
// Circle App Kit swap endpoint for NAN Wallet.
//
// Uses @circle-fin/app-kit to swap USDC ↔ EURC on Arc Testnet via Circle's
// official StableFX infrastructure — no manual AMM pool management needed.
//
// SETUP:
//   npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem
//
// ENV VARS REQUIRED:
//   KIT_KEY            — from console.circle.com (free, App Kit section)
//   CIRCLE_API_KEY     — your Circle developer API key
//   CIRCLE_ENTITY_SECRET — your Circle entity secret
//
// HOW IT WORKS:
//   • MetaMask users:  We can't sign on their behalf server-side.
//                      Return a quote + the on-chain tx data so the browser
//                      can sign it with ethers.js directly.
//   • Circle email wallet users: We have the wallet ID and can use
//                      Circle's developer-controlled wallet API to sign
//                      and submit the swap transaction.

import { AppKit } from '@circle-fin/app-kit';
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'crypto';

// ── Constants ────────────────────────────────────────────────────────────────
const ARC_CHAIN = 'Arc_Testnet';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getCircleClient() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) throw new Error('Circle API credentials missing');
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, tokenIn, tokenOut, amountIn } = req.body || {};

  // ── quote: get swap estimate without executing ────────────────────────────
  if (action === 'quote') {
    if (!tokenIn || !tokenOut || !amountIn) {
      return res.json({ success: false, error: 'tokenIn, tokenOut, amountIn required' });
    }
    const kitKey = process.env.KIT_KEY;
    if (!kitKey) {
      return res.json({
        success: false,
        error: 'KIT_KEY not set — get one free at console.circle.com',
      });
    }

    try {
      const kit = new AppKit();

      // Use a dummy adapter just for quoting (no signing needed for quotes)
      // We create a throwaway viem adapter — the estimate call doesn't sign anything
      const estimate = await kit.swap.estimate({
        chain: ARC_CHAIN,
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        amountIn,
        config: { kitKey },
      });

      return res.json({
        success: true,
        quote: {
          tokenIn: estimate.tokenIn,
          tokenOut: estimate.tokenOut,
          amountIn: estimate.amountIn,
          amountOut: estimate.amountOut,
          rate: (parseFloat(estimate.amountOut) / parseFloat(estimate.amountIn)).toFixed(6),
          fees: estimate.fees || [],
          priceImpact: estimate.priceImpact || '< 0.01%',
        },
      });
    } catch (err) {
      console.error('[appkit-swap/quote]', err.message);
      return res.json({ success: false, error: 'Quote failed: ' + err.message.slice(0, 120) });
    }
  }

  // ── swap: execute swap for a Circle programmable wallet ───────────────────
  if (action === 'swap') {
    if (!walletId || !tokenIn || !tokenOut || !amountIn) {
      return res.json({ success: false, error: 'walletId, tokenIn, tokenOut, amountIn required' });
    }

    const kitKey = process.env.KIT_KEY;
    if (!kitKey) {
      return res.json({
        success: false,
        error: 'KIT_KEY not configured. Get a free key at console.circle.com → App Kit.',
      });
    }

    const parsed = parseFloat(amountIn);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000) {
      return res.json({ success: false, error: 'Invalid amount' });
    }

    const validPairs = [
      ['USDC', 'EURC'],
      ['EURC', 'USDC'],
    ];
    const pairValid = validPairs.some(
      ([a, b]) => a === tokenIn.toUpperCase() && b === tokenOut.toUpperCase()
    );
    if (!pairValid) {
      return res.json({ success: false, error: 'Only USDC↔EURC swaps supported on Arc Testnet' });
    }

    // ── Dev mode: no API keys set ──────────────────────────────────────────
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      return res.json({
        success: true,
        dev: true,
        txHash: '0xdev_appkit_' + crypto.randomBytes(8).toString('hex'),
        amountOut: (parsed * (tokenIn.toUpperCase() === 'USDC' ? 0.9258 : 1.0801)).toFixed(6),
        message: 'Dev mode — set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET for real swaps',
      });
    }

    try {
      const circleClient = getCircleClient();
      const kit = new AppKit();

      // ── Step 1: Get the wallet's address ──────────────────────────────────
      const walletRes = await circleClient.getWallet({ id: walletId });
      const wallet = walletRes.data?.wallet;
      if (!wallet?.address) throw new Error('Could not retrieve wallet address');

      // ── Step 2: Build the swap using App Kit ──────────────────────────────
      // App Kit's Circle Wallet adapter lets us use a developer-controlled
      // wallet directly without needing a private key in the server.
      // The adapter signs via the Circle Wallets API internally.
      const { createCircleWalletAdapter } = await import('@circle-fin/app-kit');

      const adapter = createCircleWalletAdapter({
        walletId,
        client: circleClient,
      });

      console.log(`[appkit-swap] Swapping ${amountIn} ${tokenIn} → ${tokenOut} for wallet ${walletId}`);

      const result = await kit.swap({
        from: { adapter, chain: ARC_CHAIN },
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        amountIn,
        config: { kitKey },
      });

      console.log('[appkit-swap] Result:', result.txHash, '→', result.amountOut, result.tokenOut);

      return res.json({
        success: true,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        tokenIn: result.tokenIn,
        tokenOut: result.tokenOut,
        fees: result.fees,
        fromAddress: result.fromAddress,
      });

    } catch (err) {
      console.error('[appkit-swap/swap]', err.message);

      // Friendly error messages
      let userMsg = err.message || 'Swap failed';
      if (userMsg.includes('kitKey') || userMsg.includes('kit_key')) {
        userMsg = 'Invalid KIT_KEY — check your Circle Console configuration';
      } else if (userMsg.includes('insufficient') || userMsg.includes('balance')) {
        userMsg = 'Insufficient balance for swap';
      } else if (userMsg.includes('slippage')) {
        userMsg = 'Swap failed due to price movement — try a smaller amount';
      }

      return res.json({ success: false, error: userMsg.slice(0, 200) });
    }
  }

  // ── swapMetaMask: return unsigned tx data for browser-side signing ─────────
  // For MetaMask users, we can't sign server-side.
  // Instead, return the contract call data so ethers.js in the browser signs it.
  if (action === 'swapMetaMask') {
    // This path uses your existing NANSwap contract on Arc.
    // App Kit doesn't support browser-side signing directly (it's a Node.js SDK),
    // so MetaMask users go through the on-chain contract path in the frontend.
    return res.json({
      success: false,
      error: 'MetaMask swaps must be signed client-side — use the on-chain contract path',
      useFrontendSigning: true,
    });
  }

  return res.json({
    success: false,
    error: 'Unknown action. Valid: quote, swap, swapMetaMask',
  });
}
