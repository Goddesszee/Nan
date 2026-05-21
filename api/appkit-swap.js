// api/appkit-swap.js — FIXED: uses Circle SDK (not raw REST)
// Fixes:
//   1. Removed broken raw REST calls (wrong path + missing entitySecretCiphertext)
//   2. Uses @circle-fin/developer-controlled-wallets SDK — handles auth automatically
//   3. Correct response path: createContractExecutionTransaction returns data.id (not data.transaction.id)
//   4. Correct polling path: getTransaction returns data.transaction.state / data.transaction.txHash
//   5. Removed raw circlePost() and pollTx() — replaced with SDK + waitForTx()

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'crypto';

const USDC_ADDR    = '0x3600000000000000000000000000000000000000';
const EURC_ADDR    = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const SWAP_CONTRACT = '0x1A29f5E63077804837B180A1457dc4f0878d0887';

const FX_USDC_TO_EURC = 0.9258;
const FX_EURC_TO_USDC = 1.0801;

// ── SDK client ───────────────────────────────────────────────────────────────
function getClient() {
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

// ── Poll until confirmed — uses SDK, not raw fetch ───────────────────────────
// getTransaction response: { data: { transaction: { state, txHash, ... } } }
async function waitForTx(client, txId, label = 'tx', maxMs = 55_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const r     = await client.getTransaction({ id: txId });
      const tx    = r.data?.transaction;      // confirmed: nested under data.transaction
      const state = tx?.state;
      console.log(`[appkit-swap] ${label} state=${state}`);
      if (state === 'CONFIRMED' || state === 'COMPLETE')
        return tx?.txHash || txId;
      if (['FAILED', 'CANCELLED', 'DENIED'].includes(state))
        throw new Error(`${label} ended with state: ${state}`);
    } catch (e) {
      if (e.message.includes('ended with state')) throw e;
      console.warn(`[appkit-swap] poll error (${label}):`, e.message);
    }
  }
  throw new Error(`${label} timed out after ${maxMs}ms`);
}

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
    const rate         = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;
    const amtOut       = (parsed * rate * 0.999).toFixed(6);
    const fee          = (parsed * 0.001).toFixed(4);

    return res.json({
      success: true,
      quote: {
        tokenIn:   tokenIn.toUpperCase(),
        tokenOut:  tokenOut.toUpperCase(),
        amountIn,
        amountOut: amtOut,
        rate:      rate.toFixed(6),
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

    const validPairs = [['USDC', 'EURC'], ['EURC', 'USDC']];
    const pairOk = validPairs.some(
      ([a, b]) => a === tokenIn.toUpperCase() && b === tokenOut.toUpperCase()
    );
    if (!pairOk)
      return res.json({ success: false, error: 'Only USDC↔EURC swaps supported on Arc Testnet' });

    // ── Dev mode ─────────────────────────────────────────────────────────────
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
      const rate         = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;
      return res.json({
        success:   true,
        dev:       true,
        txHash:    '0xdev_swap_' + crypto.randomBytes(8).toString('hex'),
        amountIn,
        amountOut: (parsed * rate * 0.999).toFixed(6),
        tokenIn:   tokenIn.toUpperCase(),
        tokenOut:  tokenOut.toUpperCase(),
        message:   'Dev mode — set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET for live swaps',
      });
    }

    // ── Live swap via Circle SDK ──────────────────────────────────────────────
    try {
      const client       = getClient();
      const isUSDCtoEURC = tokenIn.toUpperCase() === 'USDC';
      const tokenAddr    = isUSDCtoEURC ? USDC_ADDR : EURC_ADDR;
      // Atomic units: 6 decimals for both USDC and EURC on Arc
      const amtAtomic    = Math.floor(parsed * 1_000_000).toString();

      console.log(`[appkit-swap] ${amountIn} ${tokenIn} → ${tokenOut} | wallet: ${walletId}`);

      // ── Step 1: Approve NANSwap to spend token ──────────────────────────────
      // createContractExecutionTransaction response: { data: { id, state } }
      // ID is at data.id — NOT data.transaction.id (that only exists in getTransaction)
      console.log('[appkit-swap] Step 1: Approving token…');
      const approveRes = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           'ARC-TESTNET',
        contractAddress:      tokenAddr,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters:        [SWAP_CONTRACT, amtAtomic],
        idempotencyKey:       crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      // Confirmed from Circle API reference: response is { data: { id, state } }
      const approveTxId = approveRes.data?.id;
      if (!approveTxId)
        throw new Error('Approve: no tx ID returned — ' + JSON.stringify(approveRes.data));

      console.log('[appkit-swap] Approve submitted:', approveTxId);
      await waitForTx(client, approveTxId, 'approve');
      console.log('[appkit-swap] Approve confirmed ✓');

      // ── Step 2: Execute swap on NANSwap contract ────────────────────────────
      const swapFn = isUSDCtoEURC ? 'swapUSDCtoEURC(uint256)' : 'swapEURCtoUSDC(uint256)';
      console.log(`[appkit-swap] Step 2: Calling ${swapFn}…`);

      const swapRes = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           'ARC-TESTNET',
        contractAddress:      SWAP_CONTRACT,
        abiFunctionSignature: swapFn,
        abiParameters:        [amtAtomic],
        idempotencyKey:       crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const swapTxId = swapRes.data?.id;
      if (!swapTxId)
        throw new Error('Swap: no tx ID returned — ' + JSON.stringify(swapRes.data));

      console.log('[appkit-swap] Swap submitted:', swapTxId);
      const txHash = await waitForTx(client, swapTxId, 'swap');
      console.log('[appkit-swap] ✓ Swap confirmed:', txHash);

      const rate      = isUSDCtoEURC ? FX_USDC_TO_EURC : FX_EURC_TO_USDC;
      const amountOut = (parsed * rate * 0.999).toFixed(6);

      return res.json({
        success:  true,
        txHash,
        amountIn,
        amountOut,
        tokenIn:  tokenIn.toUpperCase(),
        tokenOut: tokenOut.toUpperCase(),
        fees: [{ token: tokenIn.toUpperCase(), amount: (parsed * 0.001).toFixed(4), type: 'swap' }],
      });

    } catch (err) {
      console.error('[appkit-swap/swap]', err.message);
      let msg = err.message || 'Swap failed';
      // Surface pool errors clearly — do NOT fall through to frontend simulation
      if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance'))
        msg = 'Insufficient balance for swap';
      if (msg.toLowerCase().includes('pool') || msg.toLowerCase().includes('liquidity'))
        msg = 'NANSwap pool has no liquidity — add liquidity to the contract first';
      return res.json({ success: false, error: msg.slice(0, 200) });
    }
  }

  return res.json({ success: false, error: 'Unknown action. Valid: quote, swap' });
}
