
//
// INSTALL FIRST (run in your project root):
//   npm install @circle-fin/app-kit @circle-fin/adapter-circle-wallets
//
// REQUIRED ENV VARS on Vercel:
//   CIRCLE_API_KEY        — your Circle developer API key
//   CIRCLE_ENTITY_SECRET  — your 64-char entity secret
//   CIRCLE_APP_KIT_KEY    — your kit key from console.circle.com → App Kit

let _AppKit = null;
let _createAdapter = null;
async function loadSDK() {
  if (_AppKit) return { AppKit: _AppKit, createCircleWalletsAdapter: _createAdapter };
  try {
    const a = await import('@circle-fin/app-kit');
    const b = await import('@circle-fin/adapter-circle-wallets');
    _AppKit = a.AppKit;
    _createAdapter = b.createCircleWalletsAdapter;
    return { AppKit: _AppKit, createCircleWalletsAdapter: _createAdapter };
  } catch (e) {
    throw new Error('SDK not installed: npm install @circle-fin/app-kit @circle-fin/adapter-circle-wallets');
  }
}

const FX_USDC_TO_EURC = 0.9258;
const FX_EURC_TO_USDC = 1.0801;

// Cache adapter + kit across warm invocations (Vercel keeps functions warm)
let _kit = null;
let _adapter = null;

async function getKitAndAdapter() {
  if (_kit && _adapter) return { kit: _kit, adapter: _adapter };

  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');

  const { AppKit, createCircleWalletsAdapter } = await loadSDK();
  _adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  _kit     = new AppKit();
  return { kit: _kit, adapter: _adapter };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, walletAddress, tokenIn, tokenOut, amountIn } = req.body || {};

  // ── QUOTE ──────────────────────────────────────────────────────────────────
  // App Kit has no quote-only endpoint — use FX rate estimate
  if (action === 'quote') {
    const parsed = parseFloat(amountIn);
    if (!tokenIn || !tokenOut || isNaN(parsed) || parsed <= 0)
      return res.json({ success: false, error: 'tokenIn, tokenOut, amountIn required' });

    const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
    const rate         = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;

    return res.json({
      success: true,
      quote: {
        tokenIn:   tokenIn.toUpperCase(),
        tokenOut:  tokenOut.toUpperCase(),
        amountIn,
        amountOut: (parsed * rate * 0.999).toFixed(6),
        rate:      rate.toFixed(6),
        fees: [{ token: tokenIn.toUpperCase(), amount: (parsed * 0.001).toFixed(4), type: 'provider' }],
      },
    });
  }

  // ── SWAP ───────────────────────────────────────────────────────────────────
  if (action === 'swap') {
    // walletAddress is the 0x address of the Circle wallet (circleWalletAddress from the frontend)
    // walletId is also passed for logging but address is what the SDK needs
    if (!walletAddress || !tokenIn || !tokenOut || !amountIn)
      return res.json({ success: false, error: 'walletAddress, tokenIn, tokenOut, amountIn required' });

    const parsed = parseFloat(amountIn);
    if (isNaN(parsed) || parsed <= 0)
      return res.json({ success: false, error: 'Invalid amount' });

    const kitKey = process.env.CIRCLE_APP_KIT_KEY;
    if (!kitKey)
      return res.json({ success: false, error: 'CIRCLE_APP_KIT_KEY env var is not set on Vercel' });

    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
      return res.json({ success: false, error: 'CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET required' });

    try {
      const { kit, adapter } = await getKitAndAdapter();

      console.log(`[appkit-swap] swap ${amountIn} ${tokenIn}→${tokenOut} addr:${walletAddress}`);

      const result = await kit.swap({
        from: {
          adapter,
          chain:   'Arc_Testnet',
          address: walletAddress,  // REQUIRED for developer-controlled wallets
        },
        tokenIn:  tokenIn.toUpperCase(),   // 'USDC' or 'EURC'
        tokenOut: tokenOut.toUpperCase(),
        amountIn: parsed.toFixed(2),       // human-readable decimal string e.g. '5.00'
        config: {
          kitKey,
        },
      });

      console.log(`[appkit-swap] success txHash:${result.txHash}`);

      // amountOut is in base units (e.g. '925800' for 0.9258 EURC)
      // convert back to human-readable by dividing by 1e6 (USDC/EURC are 6 decimals)
      const amountOutHuman = result.amountOut
        ? (parseInt(result.amountOut, 10) / 1_000_000).toFixed(6)
        : (parsed * (tokenIn.toUpperCase() === 'USDC' ? FX_USDC_TO_EURC : FX_EURC_TO_USDC) * 0.999).toFixed(6);

      return res.json({
        success:    true,
        txHash:     result.txHash,
        amountIn:   amountIn,
        amountOut:  amountOutHuman,
        tokenIn:    result.tokenIn  || tokenIn.toUpperCase(),
        tokenOut:   result.tokenOut || tokenOut.toUpperCase(),
        explorerUrl: result.explorerUrl,
        fees: result.fees,
      });

    } catch (err) {
      console.error('[appkit-swap/swap]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 300) });
    }
  }

  return res.json({ success: false, error: 'Unknown action. Valid: quote, swap' });
}

//
// INSTALL FIRST (run in your project root):
//   npm install @circle-fin/app-kit @circle-fin/adapter-circle-wallets
//
// REQUIRED ENV VARS on Vercel:
//   CIRCLE_API_KEY        — your Circle developer API key
//   CIRCLE_ENTITY_SECRET  — your 64-char entity secret
//   CIRCLE_APP_KIT_KEY    — your kit key from console.circle.com → App Kit

import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';

const FX_USDC_TO_EURC = 0.9258;
const FX_EURC_TO_USDC = 1.0801;

// Cache adapter + kit across warm invocations (Vercel keeps functions warm)
let _kit = null;
let _adapter = null;

async function getKitAndAdapter() {
  if (_kit && _adapter) return { kit: _kit, adapter: _adapter };

  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');

  const { AppKit, createCircleWalletsAdapter } = await loadSDK();
  _adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  _kit     = new AppKit();
  return { kit: _kit, adapter: _adapter };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, walletAddress, tokenIn, tokenOut, amountIn } = req.body || {};

  // ── QUOTE ──────────────────────────────────────────────────────────────────
  // App Kit has no quote-only endpoint — use FX rate estimate
  if (action === 'quote') {
    const parsed = parseFloat(amountIn);
    if (!tokenIn || !tokenOut || isNaN(parsed) || parsed <= 0)
      return res.json({ success: false, error: 'tokenIn, tokenOut, amountIn required' });

    const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
    const rate         = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;

    return res.json({
      success: true,
      quote: {
        tokenIn:   tokenIn.toUpperCase(),
        tokenOut:  tokenOut.toUpperCase(),
        amountIn,
        amountOut: (parsed * rate * 0.999).toFixed(6),
        rate:      rate.toFixed(6),
        fees: [{ token: tokenIn.toUpperCase(), amount: (parsed * 0.001).toFixed(4), type: 'provider' }],
      },
    });
  }

  // ── SWAP ───────────────────────────────────────────────────────────────────
  if (action === 'swap') {
    // walletAddress is the 0x address of the Circle wallet (circleWalletAddress from the frontend)
    // walletId is also passed for logging but address is what the SDK needs
    if (!walletAddress || !tokenIn || !tokenOut || !amountIn)
      return res.json({ success: false, error: 'walletAddress, tokenIn, tokenOut, amountIn required' });

    const parsed = parseFloat(amountIn);
    if (isNaN(parsed) || parsed <= 0)
      return res.json({ success: false, error: 'Invalid amount' });

    const kitKey = process.env.CIRCLE_APP_KIT_KEY;
    if (!kitKey)
      return res.json({ success: false, error: 'CIRCLE_APP_KIT_KEY env var is not set on Vercel' });

    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
      return res.json({ success: false, error: 'CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET required' });

    try {
      const { kit, adapter } = await getKitAndAdapter();

      console.log(`[appkit-swap] swap ${amountIn} ${tokenIn}→${tokenOut} addr:${walletAddress}`);

      const result = await kit.swap({
        from: {
          adapter,
          chain:   'Arc_Testnet',
          address: walletAddress,  // REQUIRED for developer-controlled wallets
        },
        tokenIn:  tokenIn.toUpperCase(),   // 'USDC' or 'EURC'
        tokenOut: tokenOut.toUpperCase(),
        amountIn: parsed.toFixed(2),       // human-readable decimal string e.g. '5.00'
        config: {
          kitKey,
        },
      });

      console.log(`[appkit-swap] success txHash:${result.txHash}`);

      // amountOut is in base units (e.g. '925800' for 0.9258 EURC)
      // convert back to human-readable by dividing by 1e6 (USDC/EURC are 6 decimals)
      const amountOutHuman = result.amountOut
        ? (parseInt(result.amountOut, 10) / 1_000_000).toFixed(6)
        : (parsed * (tokenIn.toUpperCase() === 'USDC' ? FX_USDC_TO_EURC : FX_EURC_TO_USDC) * 0.999).toFixed(6);

      return res.json({
        success:    true,
        txHash:     result.txHash,
        amountIn:   amountIn,
        amountOut:  amountOutHuman,
        tokenIn:    result.tokenIn  || tokenIn.toUpperCase(),
        tokenOut:   result.tokenOut || tokenOut.toUpperCase(),
        explorerUrl: result.explorerUrl,
        fees: result.fees,
      });

    } catch (err) {
      console.error('[appkit-swap/swap]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 300) });
    }
  }

  return res.json({ success: false, error: 'Unknown action. Valid: quote, swap' });
}
