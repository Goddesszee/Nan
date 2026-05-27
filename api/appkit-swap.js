// api/appkit-swap.js
// Circle AppKit swap — works for Circle wallet users (no liquidity management needed)
// Uses @circle-fin/app-kit with @circle-fin/adapter-circle-wallets
// Supports both: action='quote' (estimate) and action='swap' (execute)

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { AppKit, SwapChain, Token } from '@circle-fin/app-kit';
import crypto from 'crypto';

const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN || 'ARC-TESTNET';
const ARC_USDC   = process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000';
const ARC_EURC   = process.env.EURC_ADDRESS || '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

function getAppKit() {
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');

  const walletsClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  const adapter       = createCircleWalletsAdapter({ walletsClient });
  return new AppKit({ adapter });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, walletAddress, tokenIn, tokenOut, amountIn } = req.body || {};

  if (!amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0)
    return res.json({ success: false, error: 'Valid amountIn required' });

  const isUSDCtoEURC = (tokenIn || '').toUpperCase() === 'USDC';
  const fromToken    = isUSDCtoEURC ? ARC_USDC : ARC_EURC;
  const toToken      = isUSDCtoEURC ? ARC_EURC : ARC_USDC;
  const fromSymbol   = isUSDCtoEURC ? 'USDC' : 'EURC';
  const toSymbol     = isUSDCtoEURC ? 'EURC' : 'USDC';

  // ── Dev mode fallback ────────────────────────────────────────────────────────
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    const rate       = isUSDCtoEURC ? 0.9224 : 1.0842;
    const amountOut  = (parseFloat(amountIn) * rate * 0.999).toFixed(6);
    return res.json({
      success:   true,
      amountOut,
      rate,
      fee:       '0.001',
      dev:       true,
      ...(action === 'swap' ? { transactionId: 'dev-' + crypto.randomBytes(8).toString('hex'), txHash: '0xdev' + crypto.randomBytes(16).toString('hex') } : {}),
    });
  }

  try {
    const kit = getAppKit();

    // ── Quote only ─────────────────────────────────────────────────────────────
    if (action === 'quote') {
      const estimate = await kit.estimateSwap({
        walletId:      walletId || 'estimate',
        fromToken:     { address: fromToken, blockchain: BLOCKCHAIN, symbol: fromSymbol },
        toToken:       { address: toToken, blockchain: BLOCKCHAIN, symbol: toSymbol },
        amount:        amountIn.toString(),
        chain:         SwapChain.Arc_Testnet,
      });

      return res.json({
        success:   true,
        amountOut: estimate.estimatedAmountOut || estimate.toAmount || null,
        rate:      estimate.exchangeRate        || null,
        fee:       estimate.estimatedFee        || '0.001',
        priceImpact: estimate.priceImpact       || null,
      });
    }

    // ── Execute swap ───────────────────────────────────────────────────────────
    if (action === 'swap') {
      if (!walletId) return res.json({ success: false, error: 'walletId required for swap' });

      const result = await kit.swap({
        walletId,
        fromToken:     { address: fromToken, blockchain: BLOCKCHAIN, symbol: fromSymbol },
        toToken:       { address: toToken, blockchain: BLOCKCHAIN, symbol: toSymbol },
        amount:        amountIn.toString(),
        chain:         SwapChain.Arc_Testnet,
        slippageTolerance: '0.5',
      });

      return res.json({
        success:       true,
        transactionId: result.transactionId || result.id || null,
        txHash:        result.txHash        || null,
        amountOut:     result.amountOut     || null,
        pending:       true,
      });
    }

    return res.json({ success: false, error: 'Unknown action. Use quote or swap' });

  } catch (err) {
    console.error('[appkit-swap]', err.message);

    // AppKit swap not supported on Arc → fall back gracefully
    if (err.message.includes('not supported') || err.message.includes('chain') || err.message.includes('Arc')) {
      return res.json({
        success: false,
        error:   'AppKit swap not available on Arc Testnet — using contract fallback',
        fallback: true,
      });
    }
    return res.json({ success: false, error: err.message.slice(0, 150) });
  }
}
