// api/circle-wallets.js — FIXED VERSION v2
//
// Fixes vs previous version:
//   FIX 1 (transfer): Now uses client.createTransaction() with walletAddress + human-readable
//          amount string — per Circle's official Arc transfer tutorial.
//          Previous code used createContractExecutionTransaction with atomic integers which
//          works but bypasses Circle's token abstraction layer and is not the documented path.
//   FIX 2 (contractCall): tx ID is at data.id NOT data.transaction.id
//          createContractExecutionTransaction returns { data: { id, state } }
//          getTransaction returns { data: { transaction: { id, state, txHash, ... } } }
//          These are different shapes — previous code mixed them up causing undefined txId.
//   FIX 3 (transfer): Accept walletAddress from request body for createTransaction
//   FIX 4 (waitForTx): Confirmed correct — data.transaction is right for getTransaction polling
//   FIX 5 (bridge): Already correct — no changes needed

import crypto from 'crypto';

// ── Token addresses ───────────────────────────────────────────────────────────
const ARC_USDC = process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000';
const ARC_EURC = process.env.EURC_ADDRESS || '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

// ── CCTP V2 on Arc Testnet ────────────────────────────────────────────────────
const ARC_TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const ARC_CCTP_DOMAIN     = 26;
const IRIS_API            = 'https://iris-api-sandbox.circle.com/v2/messages';

const CCTP_DEST_DOMAINS = {
  'ETH-SEPOLIA':  0,
  'AVAX-FUJI':    1,
  'OP-SEPOLIA':   2,
  'ARB-SEPOLIA':  3,
  'BASE-SEPOLIA': 6,
  'POLYGON-AMOY': 7,
};

const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN || 'ARC-TESTNET';

// ── Circle SDK client ─────────────────────────────────────────────────────────
async function getClient() {
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

// ── Deterministic idempotency keys — safe to retry ───────────────────────────
function deterministicKey(scope, email) {
  return crypto.createHash('sha256')
    .update(`nan:${scope}:${email.toLowerCase()}`)
    .digest('hex');
}

function deterministicUUID(scope, email) {
  const hex = crypto.createHash('sha256')
    .update(`nan:${scope}:${email.toLowerCase()}`)
    .digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

function walletSetName(email) {
  return 'nan-' + deterministicKey('wsname', email).slice(0, 16);
}

async function findWalletSet(client, name) {
  let pageAfter;
  do {
    const res   = await client.listWalletSets({ pageSize: 50, pageAfter });
    const sets  = res.data?.walletSets || [];
    const found = sets.find(ws => ws.name === name);
    if (found) return found;
    pageAfter = res.data?.pageCursor;
  } while (pageAfter);
  return null;
}

// ── Poll transaction — getTransaction wraps result under data.transaction ─────
// CONFIRMED from Circle docs:
//   createContractExecutionTransaction → { data: { id, state } }
//   getTransaction                     → { data: { transaction: { id, state, txHash } } }
async function waitForTx(client, txId, label = 'tx', maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 6000));
    try {
      const res   = await client.getTransaction({ id: txId });
      const tx    = res.data?.transaction;   // correct: nested under data.transaction
      const state = tx?.state;
      console.log(`[${label}] state=${state}`);
      if (state === 'CONFIRMED' || state === 'COMPLETE')
        return { state, txHash: tx?.txHash, id: txId };
      if (['FAILED', 'CANCELLED', 'DENIED'].includes(state))
        throw new Error(`${label} ended with state: ${state}`);
    } catch (e) {
      if (e.message.includes('ended with state')) throw e;
      console.warn(`[${label}] poll error:`, e.message);
    }
  }
  throw new Error(`${label} timed out after ${maxWaitMs}ms`);
}

// ── Iris attestation poll ─────────────────────────────────────────────────────
async function pollAttestation(txHash, maxAttempts = 3) {
  const url = `${IRIS_API}/${ARC_CCTP_DOMAIN}?transactionHash=${txHash}`;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const r    = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      const msg  = data.messages?.[0];
      if (msg?.status === 'complete' && msg.attestation && msg.attestation !== 'PENDING')
        return { attestation: msg.attestation, message: msg.message };
    } catch (_) {}
  }
  return null;
}

// =============================================================================
// Handler
// =============================================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const {
    action, email,
    walletId, walletAddress,           // FIX 3: accept walletAddress for createTransaction
    destinationAddress, amount, tokenSymbol,
    destChain, destAddr, bridgeAmount, txHash,
    contractAddress, functionSignature, params,
  } = req.body || {};

  // ── getWallet ───────────────────────────────────────────────────────────────
  if (action === 'getWallet') {
    if (!email || !email.includes('@') || email.length > 120)
      return res.json({ success: false, error: 'Invalid email' });

    // Dev mode
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      const hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
      return res.json({
        success: true,
        wallet:  { id: 'dev-' + hash.slice(0, 8), address: '0x' + hash.slice(0, 40) },
        dev:     true,
      });
    }

    try {
      const client = await getClient();
      const name   = walletSetName(email);

      // Find or create walletSet
      let walletSet = await findWalletSet(client, name);
      if (!walletSet) {
        const wsRes = await client.createWalletSet({
          name,
          idempotencyKey: deterministicUUID('walletset', email),
        });
        walletSet = wsRes.data?.walletSet;
        if (!walletSet?.id) throw new Error('Circle did not return a walletSet ID');
      }

      // Find or create wallet on ARC-TESTNET
      const listRes = await client.listWallets({ walletSetId: walletSet.id, pageSize: 20 });
      let wallet    = listRes.data?.wallets?.find(w => w.blockchain === BLOCKCHAIN);

      if (!wallet) {
        const refId = deterministicKey('refid', email).slice(0, 36);
        const wRes  = await client.createWallets({
          walletSetId:    walletSet.id,
          blockchains:    [BLOCKCHAIN],
          count:          1,
          accountType:    'EOA',
          idempotencyKey: deterministicUUID('wallet', email),
        });
        wallet = wRes.data?.wallets?.[0];
        if (!wallet?.id || !wallet?.address) throw new Error('Circle did not return a wallet');
        try {
          await client.updateWallet({ id: wallet.id, name: `NAN-${email}`, refId });
        } catch (e) {
          console.warn('[getWallet] updateWallet refId failed (non-fatal):', e.message);
        }
      }

      return res.json({
        success: true,
        wallet:  { id: wallet.id, address: wallet.address, blockchain: wallet.blockchain },
      });

    } catch (err) {
      console.error('[getWallet]', err.message);
      return res.json({ success: false, error: 'Wallet setup failed: ' + err.message.slice(0, 120) });
    }
  }

  // ── transfer ────────────────────────────────────────────────────────────────
  // FIX 1: Use client.createTransaction() per Circle's Arc transfer tutorial.
  // - Uses walletAddress (not just walletId) + human-readable amount string
  // - Response: { data: { id, state } } — ID at data.id
  // Ref: developers.circle.com/wallets/dev-controlled/transfer-tokens-across-wallets
  if (action === 'transfer') {
    if (!walletId || !destinationAddress || !amount)
      return res.json({ success: false, error: 'walletId, destinationAddress, amount required' });
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress))
      return res.json({ success: false, error: 'Invalid destination address' });

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });

    const tokenAddress = (tokenSymbol || 'USDC').toUpperCase() === 'EURC' ? ARC_EURC : ARC_USDC;

    // Dev mode
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      return res.json({
        success: true,
        txHash:  '0xdev' + crypto.randomBytes(16).toString('hex'),
        dev:     true,
      });
    }

    try {
      const client = await getClient();

      // FIX 1: createTransaction with walletAddress + human-readable amount array
      // The walletAddress comes from req.body (frontend passes circleWalletAddress)
      // If walletAddress not provided, fall back to walletId-only path
      const txParams = {
        blockchain:         BLOCKCHAIN,
        destinationAddress,
        amount:             [parsed.toString()],   // human-readable string e.g. '5' not '5000000'
        tokenAddress,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey:     crypto.randomUUID(),
      };

      // Prefer walletAddress if provided (Circle's documented pattern for Arc)
      if (walletAddress) {
        txParams.walletAddress = walletAddress;
      } else {
        txParams.walletId = walletId;
      }

      const txRes = await client.createTransaction(txParams);

      // createTransaction response: { data: { id, state } } — ID at data.id
      const txId = txRes.data?.id;
      if (!txId) throw new Error('No transaction ID in Circle response: ' + JSON.stringify(txRes.data));

      // Poll for up to 30s before returning; if still pending, return pending so client polls
      try {
        const confirmed = await waitForTx(client, txId, 'transfer', 30_000);
        return res.json({ success: true, txHash: confirmed.txHash, transactionId: txId });
      } catch (e) {
        if (e.message.includes('ended with state'))
          return res.json({ success: false, error: 'Transaction ' + e.message });
        // Timed out — return pending so frontend polls /api/transaction/:id
        return res.json({ success: true, pending: true, transactionId: txId, txHash: null });
      }

    } catch (err) {
      console.error('[transfer]', err.message);
      return res.json({ success: false, error: 'Transfer failed: ' + err.message.slice(0, 120) });
    }
  }

  // ── bridge: CCTP V2 ─────────────────────────────────────────────────────────
  // No changes needed here — this was already correct
  if (action === 'bridge') {
    if (!walletId || !destChain || !destAddr || !bridgeAmount)
      return res.json({ success: false, error: 'walletId, destChain, destAddr, bridgeAmount required' });
    if (!/^0x[a-fA-F0-9]{40}$/.test(destAddr))
      return res.json({ success: false, error: 'Invalid destination address' });

    const parsed = parseFloat(bridgeAmount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });

    const destDomain = CCTP_DEST_DOMAINS[destChain];
    if (destDomain === undefined)
      return res.json({ success: false, error: 'Unsupported chain: ' + destChain });

    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      return res.json({
        success:     true,
        pending:     true,
        burnTxHash:  '0xdev' + crypto.randomBytes(16).toString('hex'),
        dev:         true,
      });
    }

    const atomicAmount = Math.floor(parsed * 1_000_000).toString();
    const maxFee       = '1000'; // flat 0.001 USDC relayer fee — not 1% of amount

    const mintRecipient    = '0x' + destAddr.replace('0x', '').toLowerCase().padStart(64, '0');
    const destinationCaller = '0x' + '0'.repeat(64);

    try {
      const client = await getClient();

      // Step 1 — Approve USDC to TokenMessengerV2
      console.log(`[bridge] Approve ${atomicAmount} atomic USDC to TokenMessenger…`);
      const approveRes = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           BLOCKCHAIN,
        contractAddress:      ARC_USDC,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters:        [ARC_TOKEN_MESSENGER, atomicAmount],
        idempotencyKey:       crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      // FIX 2: createContractExecutionTransaction returns data.id (not data.transaction.id)
      const approveTxId = approveRes.data?.id;
      if (!approveTxId) throw new Error('Approve tx: no ID returned from Circle');

      await waitForTx(client, approveTxId, 'approve', 55_000);
      console.log('[bridge] Approve confirmed');

      // Step 2 — depositForBurn
      console.log(`[bridge] depositForBurn → domain ${destDomain}…`);
      const burnRes = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           BLOCKCHAIN,
        contractAddress:      ARC_TOKEN_MESSENGER,
        abiFunctionSignature: 'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
        abiParameters: [
          atomicAmount,
          destDomain.toString(),
          mintRecipient,
          ARC_USDC,
          destinationCaller,
          maxFee,
          '1000',
        ],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      // FIX 2: same — ID at data.id
      const burnTxId = burnRes.data?.id;
      if (!burnTxId) throw new Error('Burn tx: no ID returned from Circle');

      const burnTxHash = burnRes.data?.txHash || burnTxId;
      console.log(`[bridge] Burn submitted — txId: ${burnTxId}`);

      // Fire-and-forget attestation poll — do NOT await (Vercel 60s limit)
      pollAttestation(burnTxHash)
        .then(r => r
          ? console.log(`[bridge] Attestation ready for ${burnTxHash}`)
          : console.log(`[bridge] Attestation pending for ${burnTxHash}`)
        )
        .catch(e => console.error('[bridge] Attestation error:', e.message));

      return res.json({
        success:       true,
        pending:       true,
        burnTxHash,
        transactionId: burnTxId,
        destChain,
        destAddr,
        amount:        parsed,
        message:       'Burn submitted — poll /api/transaction/' + burnTxId,
      });

    } catch (err) {
      console.error('[bridge]', err.message);
      return res.json({ success: false, error: 'Bridge failed: ' + err.message.slice(0, 200) });
    }
  }

  // ── getAttestation ──────────────────────────────────────────────────────────
  if (action === 'getAttestation') {
    if (!txHash) return res.json({ success: false, error: 'txHash required' });
    try {
      const result = await pollAttestation(txHash, 3);
      if (result) return res.json({ success: true, status: 'complete', ...result });
      return res.json({ success: true, status: 'pending', message: 'Not attested yet — try again in 30s' });
    } catch (err) {
      return res.json({ success: false, error: err.message });
    }
  }

  // ── contractCall — lend, borrow, repay, withdraw, arc names ────────────────
  // FIX 2: createContractExecutionTransaction returns { data: { id, state } }
  // ID is at data.id — NOT data.transaction.id (that shape only exists in getTransaction)
  if (action === 'contractCall') {
    if (!walletId || !contractAddress || !functionSignature)
      return res.json({ success: false, error: 'walletId, contractAddress, functionSignature required' });

    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
      return res.json({
        success: true,
        txHash:  '0xdev' + crypto.randomBytes(16).toString('hex'),
        dev:     true,
      });

    try {
      const client = await getClient();
      const txRes  = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           BLOCKCHAIN,
        contractAddress,
        abiFunctionSignature: functionSignature,
        abiParameters:        params || [],
        idempotencyKey:       crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      // FIX 2: ID is at data.id for createContractExecutionTransaction
      // data.transaction only exists when you call getTransaction later
      const txId = txRes.data?.id;
      if (!txId)
        throw new Error('No transaction ID returned — ' + JSON.stringify(txRes.data));

      // txHash is never present on creation — only available after getTransaction confirms it
      return res.json({
        success:       true,
        transactionId: txId,
        txHash:        null,    // not available yet — poll /api/transaction/:id
        pending:       true,
      });

    } catch (err) {
      console.error('[contractCall]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 120) });
    }
  }


  // ── App Kit: Swap Quote ────────────────────────────────────────────────────
  // Uses dynamic import so Vercel bundler never touches @circle-fin/app-kit at build time
  if (action === 'swapQuote') {
    const fromToken = (req.body.tokenIn  || 'USDC').toUpperCase();
    const toToken   = (req.body.tokenOut || 'EURC').toUpperCase();
    const amtIn     = parseFloat(req.body.amountIn);

    if (!amtIn || amtIn <= 0)
      return res.json({ success: false, error: 'Valid amountIn required' });

    // Dev mode
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      const rate = fromToken === 'USDC' ? 0.9224 : 1.0842;
      const amountOut = (amtIn * rate * 0.999).toFixed(6);
      return res.json({ success: true, amountOut, estimatedOutput: { amount: amountOut, token: toToken }, dev: true });
    }

    try {
      const { AppKit } = await import('@circle-fin/app-kit');
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');
      const adapter  = createCircleWalletsAdapter({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET });
      const kit      = new AppKit();
      const estimate = await kit.estimateSwap({
        from:     { adapter, chain: BLOCKCHAIN, address: walletAddress || 'estimate' },
        tokenIn:  fromToken,
        tokenOut: toToken,
        amountIn: amtIn.toString(),
        config:   { slippageBps: 300 },
      });
      return res.json({
        success:         true,
        amountOut:       estimate.estimatedOutput?.amount || null,
        estimatedOutput: estimate.estimatedOutput || null,
        stopLimit:       estimate.stopLimit || null,
        fees:            estimate.fees || null,
      });
    } catch (err) {
      console.error('[swapQuote]', err.message);
      if (err.message.includes('not supported') || err.message.includes('Arc') || err.message.includes('chain'))
        return res.json({ success: false, fallback: true, error: 'AppKit swap not available on Arc Testnet' });
      return res.json({ success: false, error: err.message.slice(0, 150) });
    }
  }

  // ── App Kit: Swap Execute ─────────────────────────────────────────────────
  if (action === 'swapExecute') {
    const fromToken = (req.body.tokenIn  || 'USDC').toUpperCase();
    const toToken   = (req.body.tokenOut || 'EURC').toUpperCase();
    const amtIn     = parseFloat(req.body.amountIn);

    if (!walletAddress || !amtIn || amtIn <= 0)
      return res.json({ success: false, error: 'walletAddress and amountIn required' });

    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
      return res.json({ success: true, txHash: 'dev-swap-' + crypto.randomBytes(8).toString('hex'), dev: true });

    try {
      const { AppKit } = await import('@circle-fin/app-kit');
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');
      const adapter = createCircleWalletsAdapter({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET });
      const kit     = new AppKit();
      const result  = await kit.swap({
        from:     { adapter, chain: BLOCKCHAIN, address: walletAddress },
        tokenIn:  fromToken,
        tokenOut: toToken,
        amountIn: amtIn.toString(),
        config:   { slippageBps: 300 },
      });
      return res.json({ success: true, txHash: result.txHash || null, amountOut: result.amountOut || null, explorerUrl: result.explorerUrl || null });
    } catch (err) {
      console.error('[swapExecute]', err.message);
      if (err.message.includes('not supported') || err.message.includes('Arc') || err.message.includes('chain'))
        return res.json({ success: false, fallback: true, error: 'AppKit swap not available — use contract fallback' });
      return res.json({ success: false, error: err.message.slice(0, 150) });
    }
  }

  // ── App Kit: Send ─────────────────────────────────────────────────────────
  if (action === 'appkitSend') {
    const { destinationAddress, amount: sendAmt, tokenSymbol } = req.body;
    const token   = (tokenSymbol || 'USDC').toUpperCase();
    const parsed  = parseFloat(sendAmt);

    if (!walletAddress || !destinationAddress || !parsed || parsed <= 0)
      return res.json({ success: false, error: 'walletAddress, destinationAddress, amount required' });

    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress))
      return res.json({ success: false, error: 'Invalid destination address' });

    const TOKEN_ADDRESSES = {
      USDC: process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
      EURC: process.env.EURC_ADDRESS || '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    };

    if (!TOKEN_ADDRESSES[token])
      return res.json({ success: false, error: 'Unsupported token. Use USDC or EURC' });

    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
      return res.json({ success: true, txHash: '0xdev_send_' + crypto.randomBytes(16).toString('hex'), state: 'success', dev: true });

    try {
      const { AppKit } = await import('@circle-fin/app-kit');
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');
      const adapter = createCircleWalletsAdapter({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET });
      const kit     = new AppKit();
      const result  = await kit.send({
        from:   { adapter, chain: BLOCKCHAIN, address: walletAddress },
        to:     destinationAddress,
        amount: parsed.toString(),
        token:  TOKEN_ADDRESSES[token],
      });
      return res.json({ success: result.state === 'success' || result.state === 'pending', txHash: result.txHash || null, state: result.state, explorerUrl: result.explorerUrl || null });
    } catch (err) {
      console.error('[appkitSend]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 150) });
    }
  }

  // ── App Kit: Bridge ───────────────────────────────────────────────────────
  if (action === 'appkitBridge') {
    const { destChain: bDestChain, destAddr: bDestAddr, bridgeAmount: bAmt } = req.body;
    const parsed = parseFloat(bAmt);
    const CHAIN_MAP = {
      'ETH-SEPOLIA': 'Ethereum_Sepolia', 'AVAX-FUJI': 'Avalanche_Fuji',
      'BASE-SEPOLIA': 'Base_Sepolia', 'ARB-SEPOLIA': 'Arbitrum_Sepolia',
      'OP-SEPOLIA': 'Optimism_Sepolia', 'POLYGON-AMOY': 'Polygon_Amoy_Testnet',
    };

    if (!walletAddress || !bDestChain || !bDestAddr || !parsed || parsed <= 0)
      return res.json({ success: false, error: 'walletAddress, destChain, destAddr, bridgeAmount required' });

    if (!CHAIN_MAP[bDestChain])
      return res.json({ success: false, error: 'Unsupported chain: ' + bDestChain });

    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
      return res.json({ success: true, state: 'success', burnTxHash: '0xdev_bridge_burn_' + crypto.randomBytes(16).toString('hex'), mintTxHash: '0xdev_bridge_mint_' + crypto.randomBytes(16).toString('hex'), dev: true });

    try {
      const { AppKit } = await import('@circle-fin/app-kit');
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');
      const adapter = createCircleWalletsAdapter({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET });
      const kit     = new AppKit();
      const result  = await kit.bridge({
        from: { adapter, chain: BLOCKCHAIN, address: walletAddress },
        to:   { adapter, chain: CHAIN_MAP[bDestChain], address: bDestAddr },
        amount: parsed.toFixed(2),
        token:  'USDC',
      });
      const burnStep = result.steps?.find(s => s.name?.includes('burn'));
      const mintStep = result.steps?.find(s => s.name?.includes('mint'));
      return res.json({
        success:    result.state === 'success' || result.state === 'pending',
        state:      result.state,
        burnTxHash: burnStep?.txHash || null,
        mintTxHash: mintStep?.txHash || null,
        steps:      result.steps?.map(s => ({ name: s.name, state: s.state, txHash: s.txHash || null })) || [],
      });
    } catch (err) {
      console.error('[appkitBridge]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 200) });
    }
  }

  return res.json({
    success: false,
    error:   'Unknown action. Valid: getWallet, transfer, bridge, getAttestation, contractCall, swapQuote, swapExecute, appkitSend, appkitBridge',
  });
}
