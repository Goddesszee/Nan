// api/appkit-swap.js
// Circle App Kit swap — kit.estimateSwap() and kit.swap()
// Per Circle SDK docs:
//   estimateSwap({ from: { adapter, chain, address }, tokenIn, tokenOut, amountIn })
//   swap({ from: { adapter, chain, address }, tokenIn, tokenOut, amountIn, config })
//
// Returns SwapEstimate / SwapResult per SDK types.
// Supports Circle wallet users only (server-side developer-controlled wallets).

import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import crypto from 'crypto';

const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN || 'Arc_Testnet';

function getAppKit() {
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');

  const adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  const kit     = new AppKit();
  return { kit, adapter };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { action, walletAddress, tokenIn, tokenOut, amountIn } = req.body || {};

  if (!amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0)
    return res.json({ success: false, error: 'Valid amountIn required' });

  const fromToken = (tokenIn  || 'USDC').toUpperCase();
  const toToken   = (tokenOut || 'EURC').toUpperCase();

  // Dev mode fallback — no credentials
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    const rate     = fromToken === 'USDC' ? 0.9224 : 1.0842;
    const amountOut = (parseFloat(amountIn) * rate * 0.999).toFixed(6);
    return res.json({
      success:    true,
      amountOut,
      estimatedOutput: { amount: amountOut, token: toToken },
      stopLimit:  { amount: (parseFloat(amountOut) * 0.97).toFixed(6), token: toToken },
      rate,
      fees:       null,
      dev:        true,
      ...(action === 'swap' ? {
        txHash:        'dev-swap-' + crypto.randomBytes(8).toString('hex'),
        transactionId: 'dev-' + crypto.randomBytes(8).toString('hex'),
      } : {}),
    });
  }

  try {
    const { kit, adapter } = getAppKit();

    // Shared swap params per SDK docs
    // from.address is REQUIRED for developer-controlled wallets
    const swapParams = {
      from: {
        adapter,
        chain:   BLOCKCHAIN,
        address: walletAddress || 'estimate',  // estimate doesn't need a real address
      },
      tokenIn:  fromToken,   // SDK accepts 'USDC', 'EURC', 'USDT' etc.
      tokenOut: toToken,
      amountIn: parseFloat(amountIn).toString(),
      config: {
        slippageBps: 300,  // 3% default slippage
      },
    };

    // ── Quote / Estimate ─────────────────────────────────────────────────────
    if (action === 'quote') {
      // estimateSwap returns SwapEstimate:
      // { estimatedOutput: { amount, token }, stopLimit: { amount, token }, fees, ... }
      const estimate = await kit.estimateSwap(swapParams);

      return res.json({
        success:         true,
        amountOut:       estimate.estimatedOutput?.amount || null,
        estimatedOutput: estimate.estimatedOutput || null,
        stopLimit:       estimate.stopLimit       || null,
        fees:            estimate.fees            || null,
        tokenIn:         estimate.tokenIn         || fromToken,
        tokenOut:        estimate.tokenOut        || toToken,
      });
    }

    // ── Execute Swap ──────────────────────────────────────────────────────────
    if (action === 'swap') {
      if (!walletAddress)
        return res.json({ success: false, error: 'walletAddress required for swap' });

      // swap returns SwapResult:
      // { txHash, amountIn, amountOut, explorerUrl, fees, state, ... }
      const result = await kit.swap(swapParams);

      return res.json({
        success:     true,
        txHash:      result.txHash      || null,
        amountOut:   result.amountOut   || null,
        explorerUrl: result.explorerUrl || null,
        fees:        result.fees        || null,
        pending:     !result.txHash,
      });
    }

    return res.json({ success: false, error: 'Unknown action. Use quote or swap' });

  } catch (err) {
    console.error('[appkit-swap]', err.message);

    // Swap not supported on Arc Testnet — signal frontend to use contract fallback
    if (
      err.message.includes('not supported') ||
      err.message.includes('chain')         ||
      err.message.includes('Arc')           ||
      err.message.includes('swap')
    ) {
      return res.json({
        success:  false,
        fallback: true,
        error:    'AppKit swap not available on Arc Testnet — using contract fallback',
      });
    }

    return res.json({ success: false, error: err.message.slice(0, 150) });
  }
}
