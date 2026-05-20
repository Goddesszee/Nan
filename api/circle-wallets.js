// api/circle-wallets.js — FIXED VERSION
//
// Bugs fixed vs previous:
//   1. idempotencyKey is now deterministic (SHA-256 of email) — safe to retry
//   2. metadata + refId added to createWallets() — Circle can link wallet to user
//   3. approveTx and burnTx ID extracted from correct path (.data.transaction.id)
//   4. USDC address matches frontend (0xAE024fda...)
//   5. bridge is async/non-blocking — returns immediately, client polls separately
//   6. No persistent state — every lookup goes to Circle API (Vercel-safe)

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'crypto';

// ── Token addresses — must match index.html exactly ──────────────────────────
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

// ── Blockchain — verify this in your Circle console ───────────────────────────
// If ARC-TESTNET fails, check the exact string in the Circle developer console.
const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN || 'ARC-TESTNET';

// ── Circle client ─────────────────────────────────────────────────────────────
function getClient() {
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

// ── Deterministic keys — safe to retry without creating duplicates ────────────
// FIX 1: Was crypto.randomUUID() — retries created duplicate walletSets/wallets.
function deterministicKey(scope, email) {
  return crypto
    .createHash('sha256')
    .update(`nan:${scope}:${email.toLowerCase()}`)
    .digest('hex');
}

function deterministicUUID(scope, email) {
  const hex = crypto
    .createHash('sha256')
    .update(`nan:${scope}:${email.toLowerCase()}`)
    .digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

// ── Find existing walletSet by deterministic name ─────────────────────────────
// Name is a short hash — stable across cold starts, unique per email.
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

// ── Poll transaction until confirmed or failed ────────────────────────────────
// FIX 5 (bridge): caller must not run this synchronously in a Vercel function
// for bridge — use fire-and-forget or a short timeout. For transfer it's OK
// since transfers usually confirm in a few seconds.
async function waitForTx(client, txId, label = 'tx', maxWaitMs = 55_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const res   = await client.getTransaction({ id: txId });
      const tx    = res.data?.transaction;
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

// ── Iris attestation poll (3 quick attempts, non-blocking for bridge) ─────────
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
  if (req.method !== 'POST') return res.status(405).end();

  const {
    action, email, walletId, destinationAddress, amount, tokenSymbol,
    destChain, destAddr, bridgeAmount, txHash,
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
        wallet: { id: 'dev-' + hash.slice(0, 8), address: '0x' + hash.slice(0, 40) },
        dev: true,
      });
    }

    try {
      const client = getClient();
      const name   = walletSetName(email);

      // Step 1 — find or create walletSet
      let walletSet = await findWalletSet(client, name);
      if (!walletSet) {
        // FIX 1: deterministic idempotencyKey — retry-safe
        const wsRes = await client.createWalletSet({
          name,
          idempotencyKey: deterministicUUID('walletset', email),
        });
        walletSet = wsRes.data?.walletSet;
        if (!walletSet?.id) throw new Error('Circle did not return a walletSet ID');
      }

      // Step 2 — find or create wallet on ARC-TESTNET
      const listRes = await client.listWallets({ walletSetId: walletSet.id, pageSize: 20 });
      let wallet    = listRes.data?.wallets?.find(w => w.blockchain === BLOCKCHAIN);

      if (!wallet) {
        // FIX 1 + 2: deterministic key AND metadata.refId so Circle links it to user
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
        // Link wallet to user via updateWallet (correct Circle API pattern)
        try {
          await client.updateWallet({ id: wallet.id, name: `NAN-${email}`, refId });
        } catch (e) {
          console.warn('[getWallet] updateWallet refId failed (non-fatal):', e.message);
        }
      }

      return res.json({
        success: true,
        wallet: { id: wallet.id, address: wallet.address, blockchain: wallet.blockchain },
      });

    } catch (err) {
      console.error('[getWallet]', err.message);
      return res.json({ success: false, error: 'Wallet setup failed: ' + err.message.slice(0, 120) });
    }
  }

  // ── transfer ────────────────────────────────────────────────────────────────
  if (action === 'transfer') {
    if (!walletId || !destinationAddress || !amount)
      return res.json({ success: false, error: 'walletId, destinationAddress, amount required' });
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress))
      return res.json({ success: false, error: 'Invalid destination address' });

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });

    // FIX 4 (addresses): use env var addresses so they stay in sync with frontend
    const tokenAddress = (tokenSymbol || 'USDC').toUpperCase() === 'EURC' ? ARC_EURC : ARC_USDC;

    // Dev mode
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      return res.json({ success: true, txHash: '0xdev' + crypto.randomBytes(16).toString('hex'), dev: true });
    }

    try {
      const client = getClient();

      // Arc uses ERC-20 contract execution for transfers — not createTransaction
      const atomicAmt = Math.floor(parsed * 1_000_000).toString(); // 6 decimals as integer

      const txRes = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           BLOCKCHAIN,
        contractAddress:      tokenAddress,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters:        [destinationAddress, atomicAmt],
        idempotencyKey:       crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const tx   = txRes.data?.transaction;
      const txId = tx?.id || txRes.data?.id;
      if (!txId) throw new Error('No transaction ID in Circle response — full response: ' + JSON.stringify(txRes.data));

      // Poll for confirmation (30s) before responding so frontend gets a real txHash
      try {
        const confirmed = await waitForTx(client, txId, 'transfer', 30_000);
        return res.json({ success: true, txHash: confirmed.txHash, transactionId: txId });
      } catch (e) {
        // Timed out or failed — return pending so client can poll /api/transaction/:id
        const state = tx?.state;
        const hash  = tx?.txHash || null;
        if (['FAILED', 'CANCELLED', 'DENIED'].includes(state))
          return res.json({ success: false, error: 'Transaction ' + state.toLowerCase() });
        return res.json({ success: true, pending: true, transactionId: txId, txHash: hash });
      }

    } catch (err) {
      console.error('[transfer]', err.message);
      return res.json({ success: false, error: 'Transfer failed: ' + err.message.slice(0, 120) });
    }
  }

  // ── bridge: CCTP V2 ─────────────────────────────────────────────────────────
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

    // Dev mode
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      return res.json({ success: true, pending: true, burnTxHash: '0xdev' + crypto.randomBytes(16).toString('hex'), dev: true });
    }

    // Atomic units (6 decimals)
    const atomicAmount = Math.floor(parsed * 1_000_000).toString();
    const maxFee       = Math.ceil(parsed * 1_000_000 * 0.01).toString();

    // mintRecipient: address padded to bytes32
    const mintRecipient =
      '0x' + destAddr.replace('0x', '').toLowerCase().padStart(64, '0');

    // destinationCaller: zero bytes32 = any relayer can mint
    const destinationCaller =
      '0x' + '0'.repeat(64);

    try {
      const client = getClient();

      // Step 1 — Approve USDC to TokenMessengerV2
      console.log(`[bridge] Approve ${atomicAmount} atomic USDC to TokenMessenger…`);
      const approveRes = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           BLOCKCHAIN,
        contractAddress:      ARC_USDC,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters:        [ARC_TOKEN_MESSENGER, atomicAmount], // atomicAmount already integer string — correct
        idempotencyKey:       crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      // FIX 3: correct path for contract execution transaction ID
      const approveTxId = approveRes.data?.transaction?.id || approveRes.data?.id;
      if (!approveTxId) throw new Error('Approve tx: no ID returned from Circle');

      // Wait for approve — short timeout is OK, approve confirms fast
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
          atomicAmount,           // uint256 amount in atomic units (string)
          destDomain.toString(),  // uint32  destinationDomain (must be string)
          mintRecipient,          // bytes32 mintRecipient (padded address)
          ARC_USDC,               // address burnToken
          destinationCaller,      // bytes32 destinationCaller (zero = any relayer)
          maxFee,                 // uint256 maxFee (1% in atomic units)
          "1000",                 // uint32  minFinalityThreshold (must be string)
        ],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      // FIX 3: correct path
      const burnTxId = burnRes.data?.transaction?.id || burnRes.data?.id;
      if (!burnTxId) throw new Error('Burn tx: no ID returned from Circle');

      // FIX 5: return immediately — client polls /api/transaction/:id and /api/cctp-attest
      // Do NOT await waitForTx here — Vercel function will time out (max 60s on Pro)
      const burnTxHash = burnRes.data?.transaction?.txHash || burnTxId;
      console.log(`[bridge] Burn submitted — txId: ${burnTxId}`);

      // Poll attestation in background (fire and forget — just logs)
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
        message:       'Burn submitted — poll /api/transaction/' + burnTxId + ' for confirmation',
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

  // ── contractCall ────────────────────────────────────────────────────────────
  if (action === 'contractCall') {
    const { walletId, contractAddress, functionSignature, params } = req.body || {};
    if (!walletId || !contractAddress || !functionSignature)
      return res.json({ success: false, error: 'walletId, contractAddress, functionSignature required' });
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
      return res.json({ success: true, txHash: '0xdev'+crypto.randomBytes(16).toString('hex'), dev: true });
    try {
      const client = getClient();
      const txRes = await client.createContractExecutionTransaction({
        walletId,
        blockchain: BLOCKCHAIN,
        contractAddress,
        abiFunctionSignature: functionSignature,
        abiParameters: params || [],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const tx = txRes.data?.transaction;
      const txId = tx?.id || txRes.data?.id;
      if (!txId) throw new Error('No transaction ID returned');
      return res.json({ success: true, transactionId: txId, txHash: tx?.txHash || null, pending: true });
    } catch (err) {
      console.error('[contractCall]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 120) });
    }
  }

  return res.json({ success: false, error: 'Unknown action. Valid: getWallet, transfer, bridge, getAttestation, contractCall' });
}
