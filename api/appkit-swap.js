// api/appkit-swap.js — NO Circle adapter imports (fixes Vercel build error)
// Uses Circle Developer-Controlled Wallets REST API directly for swaps.
// The @circle-fin/adapter-* packages crash Vercel's bundler — avoid them here.

import crypto from 'crypto';

const USDC_ADDR = '0x3600000000000000000000000000000000000000';
const EURC_ADDR = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const SWAP_CONTRACT = '0x1A29f5E63077804837B180A1457dc4f0878d0887';

const FX_USDC_TO_EURC = 0.9258;
const FX_EURC_TO_USDC = 1.0801;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, tokenIn, tokenOut, amountIn } = req.body || {};

  // ── QUOTE ─────────────────────────────────────────────────────────────────
  if (action === 'quote') {
    if (!tokenIn || !tokenOut || !amountIn)
      return res.json({ success: false, error: 'tokenIn, tokenOut, amountIn required' });

    const parsed = parseFloat(amountIn);
    if (isNaN(parsed) || parsed <= 0)
      return res.json({ success: false, error: 'Invalid amount' });

    const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
    const rate = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;
    const amtOut = (parsed * rate * 0.999).toFixed(6);
    const fee = (parsed * 0.001).toFixed(4);

    return res.json({
      success: true,
      quote: {
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        amountIn,
        amountOut: amtOut,
        rate: rate.toFixed(6),
        fees: [{ token: tokenIn.toUpperCase(), amount: fee, type: 'provider' }],
      },
    });
  }

  // ── SWAP ──────────────────────────────────────────────────────────────────
  if (action === 'swap') {
    if (!walletId || !tokenIn || !tokenOut || !amountIn)
      return res.json({ success: false, error: 'walletId, tokenIn, tokenOut, amountIn required' });

    const parsed = parseFloat(amountIn);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });

    const validPairs = [['USDC','EURC'],['EURC','USDC']];
    const pairOk = validPairs.some(
      ([a, b]) => a === tokenIn.toUpperCase() && b === tokenOut.toUpperCase()
    );
    if (!pairOk)
      return res.json({ success: false, error: 'Only USDC↔EURC swaps supported on Arc Testnet' });

    const apiKey = process.env.CIRCLE_API_KEY;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

    // Dev mode — no credentials
    if (!apiKey || !entitySecret) {
      const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
      const rate = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;
      return res.json({
        success: true,
        dev: true,
        txHash: '0xdev_swap_' + crypto.randomBytes(8).toString('hex'),
        amountIn,
        amountOut: (parsed * rate * 0.999).toFixed(6),
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        message: 'Dev mode — set Circle credentials for live swaps',
      });
    }

    try {
      const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
      const tokenAddr = isUSDCtoEURC ? USDC_ADDR : EURC_ADDR;
      const amtAtomic = Math.floor(parsed * 1_000_000).toString();
      const blockchain = 'ARC-TESTNET';

      // ── Circle REST API helper (correct path per docs) ──────────────────
      async function circlePost(path, body) {
        const r = await fetch(`https://api.circle.com/v1/w3s${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        return r.json();
      }

      // ── Poll tx until confirmed ──────────────────────────────────────────
      async function pollTx(txId, maxMs = 55_000) {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
          await new Promise(r => setTimeout(r, 4000));
          const r = await fetch(`https://api.circle.com/v1/w3s/transactions/${txId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          const d = await r.json();
          const state = d.data?.transaction?.state;
          if (state === 'CONFIRMED' || state === 'COMPLETE')
            return d.data?.transaction?.txHash || txId;
          if (['FAILED', 'CANCELLED', 'DENIED'].includes(state))
            throw new Error(`Transaction ${state}`);
        }
        throw new Error('Transaction timed out');
      }

      console.log(`[appkit-swap] ${amountIn} ${tokenIn} → ${tokenOut} | wallet: ${walletId}`);

      // Step 1 — Approve token to NANSwap contract
      // Correct path: /transactions/contractExecution (not /developer/transactions/...)
      const approveRes = await circlePost('/transactions/contractExecution', {
        walletId,
        blockchain,
        contractAddress: tokenAddr,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [SWAP_CONTRACT, amtAtomic],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const approveTxId = approveRes.data?.id;
      if (!approveTxId) throw new Error(approveRes.message || 'Approve failed — no txId returned');

      console.log('[appkit-swap] Waiting for approve…', approveTxId);
      await pollTx(approveTxId);

      // Step 2 — Call swap on NANSwap contract
      // Correct path: /transactions/contractExecution (not /developer/transactions/...)
      const swapFn = isUSDCtoEURC
        ? 'swapUSDCtoEURC(uint256)'
        : 'swapEURCtoUSDC(uint256)';

      const swapRes = await circlePost('/transactions/contractExecution', {
        walletId,
        blockchain,
        contractAddress: SWAP_CONTRACT,
        abiFunctionSignature: swapFn,
        abiParameters: [amtAtomic],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const swapTxId = swapRes.data?.id;
      if (!swapTxId) throw new Error(swapRes.message || 'Swap tx failed — no txId returned');

      console.log('[appkit-swap] Waiting for swap…', swapTxId);
      const txHash = await pollTx(swapTxId);

      const rate = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;
      const amountOut = (parsed * rate * 0.999).toFixed(6);

      console.log('[appkit-swap] ✓ Swap confirmed', txHash);

      return res.json({
        success: true,
        txHash,
        amountIn,
        amountOut,
        tokenIn: tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        fees: [{ token: tokenIn.toUpperCase(), amount: (parsed * 0.001).toFixed(4), type: 'swap' }],
      });

    } catch (err) {
      console.error('[appkit-swap/swap]', err.message);
      let msg = err.message || 'Swap failed';
      if (msg.includes('insufficient') || msg.includes('balance')) msg = 'Insufficient balance';
      if (msg.includes('pool') || msg.includes('liquidity')) msg = 'Pool has no liquidity — swap simulated on frontend';
      return res.json({ success: false, error: msg.slice(0, 200) });
    }
  }

  return res.json({ success: false, error: 'Unknown action. Valid: quote, swap' });
}
