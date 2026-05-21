// api/appkit-swap.js — uses Circle App Kit swap API (no NANSwap contract needed)
import crypto from 'crypto';

const FX_USDC_TO_EURC = 0.9258;
const FX_EURC_TO_USDC = 1.0801;

const USDC_ADDR = '0x3600000000000000000000000000000000000000';
const EURC_ADDR = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

async function kitPost(path, body) {
  const apiKey = process.env.CIRCLE_APP_KIT_KEY || process.env.CIRCLE_API_KEY;
  const res = await fetch(`https://api.circle.com/v1/w3s${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function kitGet(path) {
  const apiKey = process.env.CIRCLE_APP_KIT_KEY || process.env.CIRCLE_API_KEY;
  const res = await fetch(`https://api.circle.com/v1/w3s${path}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  return res.json();
}

async function pollSwap(swapId, maxMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const r = await kitGet(`/developer/transactions/${swapId}`);
      const tx = r.data?.transaction;
      const state = tx?.state;
      console.log(`[appkit-swap] poll state=${state}`);
      if (state === 'CONFIRMED' || state === 'COMPLETE')
        return tx?.txHash || swapId;
      if (['FAILED', 'CANCELLED', 'DENIED'].includes(state))
        throw new Error(`swap ended with state: ${state}`);
    } catch (e) {
      if (e.message.includes('ended with state')) throw e;
    }
  }
  throw new Error('swap timed out');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { action, walletId, tokenIn, tokenOut, amountIn } = req.body || {};

  // ── QUOTE ──────────────────────────────────────────────────────────────────
  if (action === 'quote') {
    const parsed = parseFloat(amountIn);
    if (!tokenIn || !tokenOut || isNaN(parsed) || parsed <= 0)
      return res.json({ success: false, error: 'tokenIn, tokenOut, amountIn required' });

    const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
    const rate = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;
    const amtOut = (parsed * rate * 0.999).toFixed(6);

    // Try to get a live quote from Circle App Kit
    try {
      const kitApiKey = process.env.CIRCLE_APP_KIT_KEY || process.env.CIRCLE_API_KEY;
      const tokenInAddr  = isUSDCtoEURC ? USDC_ADDR : EURC_ADDR;
      const tokenOutAddr = isUSDCtoEURC ? EURC_ADDR : USDC_ADDR;
      const amtAtomic = Math.floor(parsed * 1_000_000).toString();

      const qRes = await fetch('https://api.circle.com/v1/w3s/developer/swap/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kitApiKey}`,
        },
        body: JSON.stringify({
          blockchain: 'ARC-TESTNET',
          tokenIn:  { contractAddress: tokenInAddr,  amount: amtAtomic },
          tokenOut: { contractAddress: tokenOutAddr },
          slippageBps: 100, // 1%
        }),
      });
      const qData = await qRes.json();
      if (qData.data?.quote) {
        const q = qData.data.quote;
        const outFormatted = (parseFloat(q.tokenOut?.amount || amtOut) / 1e6).toFixed(6);
        return res.json({
          success: true,
          quote: {
            tokenIn: tokenIn.toUpperCase(),
            tokenOut: tokenOut.toUpperCase(),
            amountIn,
            amountOut: outFormatted,
            rate: (parseFloat(outFormatted) / parsed).toFixed(6),
            fees: [{ token: tokenIn.toUpperCase(), amount: (parsed * 0.001).toFixed(4), type: 'provider' }],
          },
        });
      }
    } catch (e) {
      console.log('[appkit-swap] live quote failed, using fallback:', e.message);
    }

    // Fallback static quote
    return res.json({
      success: true,
      quote: {
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        amountIn,
        amountOut: amtOut,
        rate: rate.toFixed(6),
        fees: [{ token: tokenIn.toUpperCase(), amount: (parsed * 0.001).toFixed(4), type: 'provider' }],
      },
    });
  }

  // ── SWAP ───────────────────────────────────────────────────────────────────
  if (action === 'swap') {
    if (!walletId || !tokenIn || !tokenOut || !amountIn)
      return res.json({ success: false, error: 'walletId, tokenIn, tokenOut, amountIn required' });

    const parsed = parseFloat(amountIn);
    if (isNaN(parsed) || parsed <= 0)
      return res.json({ success: false, error: 'Invalid amount' });

    const kitApiKey = process.env.CIRCLE_APP_KIT_KEY || process.env.CIRCLE_API_KEY;
    if (!kitApiKey)
      return res.json({ success: false, error: 'KIT_KEY_MISSING: set CIRCLE_APP_KIT_KEY on Vercel' });

    const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
    const tokenInAddr  = isUSDCtoEURC ? USDC_ADDR : EURC_ADDR;
    const tokenOutAddr = isUSDCtoEURC ? EURC_ADDR : USDC_ADDR;
    const amtAtomic    = Math.floor(parsed * 1_000_000).toString();

    try {
      console.log(`[appkit-swap] swap ${amountIn} ${tokenIn}→${tokenOut} wallet:${walletId}`);

      // Call Circle App Kit swap endpoint
      const client = getClient();
      const tokenAddr = isUSDCtoEURC ? USDC_ADDR : EURC_ADDR;

      // Step 1: Approve
      const approveRes = await client.createContractExecutionTransaction({
        walletId,
        blockchain: 'ARC-TESTNET',
        contractAddress: tokenAddr,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [FXESCROW_ADDR, amtAtomic],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const approveTxId = approveRes.data?.id;
      if (!approveTxId) throw new Error('Approve: no tx ID');
      await waitForTx(client, approveTxId, 'approve');

      // Step 2: Swap via FX Escrow
      const swapFn = isUSDCtoEURC ? 'swapUSDCtoEURC(uint256)' : 'swapEURCtoUSDC(uint256)';
      const swapRes2 = await client.createContractExecutionTransaction({
        walletId,
        blockchain: 'ARC-TESTNET',
        contractAddress: FXESCROW_ADDR,
        abiFunctionSignature: swapFn,
        abiParameters: [amtAtomic],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const swapData = { data: { id: swapRes2.data?.id } };

      const swapData = await swapRes.json();
      console.log('[appkit-swap] swap response:', JSON.stringify(swapData).slice(0, 300));

      const txId = swapData.data?.id || swapData.data?.transaction?.id;
      if (!txId) {
        // Surface the real error from Circle
        const errMsg = swapData.message || swapData.error || JSON.stringify(swapData);
        throw new Error('Circle swap failed: ' + errMsg.slice(0, 200));
      }

      const txHash = await pollSwap(txId);
      const rate = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;

      return res.json({
        success: true,
        txHash,
        amountIn,
        amountOut: (parsed * rate * 0.999).toFixed(6),
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
      });

    } catch (err) {
      console.error('[appkit-swap/swap]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 200) });
    }
  }

  return res.json({ success: false, error: 'Unknown action. Valid: quote, swap' });
}