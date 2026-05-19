// api/circle-wallets.js
// Circle Developer-Controlled Wallets — wallet creation, USDC/EURC transfer,
// and CCTP V2 cross-chain bridge — all via Circle's API (no MetaMask needed)
//
// Required env vars:
//   CIRCLE_API_KEY        — from developers.circle.com
//   CIRCLE_ENTITY_SECRET  — your entity secret (keep private!)
//
// Docs:
//   Wallets:  https://developers.circle.com/wallets/dev-controlled
//   CCTP V2:  https://developers.circle.com/stablecoins/cctp-getting-started
//   Signing:  https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/sign-transaction

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'crypto';

// ─── Chain / contract constants ────────────────────────────────────────────────
const ARC_USDC  = '0x3600000000000000000000000000000000000000';
const ARC_EURC  = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

// CCTP V2 contracts on Arc Testnet (Standard Transfer)
// Source: https://developers.circle.com/stablecoins/evm-smart-contract-addresses
const ARC_CCTP_TOKEN_MESSENGER  = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const ARC_CCTP_MESSAGE_TRANSMITTER = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275';
const ARC_CCTP_DOMAIN = 26; // Arc Testnet domain ID

// Destination domain IDs (CCTP V2)
const CCTP_DEST_DOMAINS = {
  'ETH-SEPOLIA':   0,
  'AVAX-FUJI':     1,
  'OP-SEPOLIA':    2,
  'ARB-SEPOLIA':   3,
  'BASE-SEPOLIA':  6,
  'POLYGON-AMOY':  7,
};

// Iris attestation API (Circle's attestation service for CCTP V2)
const IRIS_API = 'https://iris-api-sandbox.circle.com/v2/messages';

// ─── Circle SDK client ─────────────────────────────────────────────────────────
function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey:       process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

// ─── Wallet set name derived from email (SHA-256, collision-safe) ──────────────
function walletSetName(email) {
  const hash = crypto
    .createHash('sha256')
    .update(email.toLowerCase())
    .digest('hex')
    .slice(0, 16);
  return `nan-${hash}`;
}

// ─── Paginate listWalletSets to find a set by name ────────────────────────────
async function findWalletSet(client, name) {
  let pageAfter;
  do {
    const res  = await client.listWalletSets({ pageSize: 50, pageAfter });
    const sets = res.data?.walletSets || [];
    const found = sets.find(ws => ws.name === name);
    if (found) return found;
    pageAfter = res.data?.pageCursor;
  } while (pageAfter);
  return null;
}

// ─── Poll Circle transaction until CONFIRMED or FAILED ────────────────────────
async function waitForTx(client, txId, label = 'tx', maxWaitMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 3000));
    const res   = await client.getTransaction({ id: txId });
    const state = res.data?.transaction?.state;
    if (state === 'CONFIRMED' || state === 'COMPLETE') {
      return res.data.transaction;
    }
    if (state === 'FAILED' || state === 'CANCELLED') {
      throw new Error(`${label} failed with state: ${state}`);
    }
  }
  throw new Error(`${label} timed out after ${maxWaitMs / 1000}s`);
}

// ─── Poll Iris attestation API ─────────────────────────────────────────────────
async function pollAttestation(txHash, maxAttempts = 40) {
  const url = `${IRIS_API}/${ARC_CCTP_DOMAIN}?transactionHash=${txHash}`;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const res  = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const msg  = data.messages?.[0];
      if (msg?.status === 'complete' && msg.attestation && msg.attestation !== 'PENDING') {
        return { attestation: msg.attestation, message: msg.message };
      }
    } catch (_) {}
  }
  return null; // attestation not ready yet — client should poll separately
}

// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    action,
    // getWallet
    email,
    // transfer
    walletId, destinationAddress, amount, tokenSymbol,
    // bridge
    destChain, destAddr, bridgeAmount,
    // attestation poll
    txHash,
  } = req.body;

  // ── getWallet: create or retrieve the Arc wallet for this email ─────────────
  if (action === 'getWallet') {
    if (!email || !email.includes('@') || email.length > 100 || email.includes('<'))
      return res.json({ success: false, error: 'Invalid email' });

    try {
      const client = getClient();
      const name   = walletSetName(email);

      let walletSet = await findWalletSet(client, name);
      if (!walletSet) {
        const newSet = await client.createWalletSet({
          name:           name,
          idempotencyKey: crypto.randomUUID(),
        });
        walletSet = newSet.data?.walletSet;
      }
      if (!walletSet?.id) throw new Error('Could not create wallet set');

      const walletsRes = await client.listWallets({ walletSetId: walletSet.id, pageSize: 10 });
      let wallet = walletsRes.data?.wallets?.find(w => w.blockchain === 'ARC-TESTNET');

      if (!wallet) {
        const newWallet = await client.createWallets({
          walletSetId:    walletSet.id,
          blockchains:    ['ARC-TESTNET'],
          count:          1,
          idempotencyKey: crypto.randomUUID(),
        });
        wallet = newWallet.data?.wallets?.[0];
      }
      if (!wallet?.address) throw new Error('Could not create wallet');

      return res.json({ success: true, wallet: { id: wallet.id, address: wallet.address } });

    } catch (err) {
      console.error('getWallet error:', err.message);
      return res.json({ success: false, error: 'Wallet error — please try again' });
    }
  }

  // ── transfer: send USDC or EURC from a Circle wallet ───────────────────────
  if (action === 'transfer') {
    if (!walletId || !destinationAddress || !amount)
      return res.json({ success: false, error: 'Missing fields' });
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress))
      return res.json({ success: false, error: 'Invalid destination address' });

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount (must be 0–10,000)' });

    const tokenAddress = tokenSymbol === 'EURC' ? ARC_EURC : ARC_USDC;

    try {
      const client = getClient();

      const tx = await client.createTransaction({
        idempotencyKey:     crypto.randomUUID(),
        blockchain:         'ARC-TESTNET',
        walletId,
        destinationAddress,
        amounts:            [parsed.toFixed(6)],
        tokenAddress,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const txId         = tx.data?.transaction?.id;
      const initialState = tx.data?.transaction?.state;
      const initialHash  = tx.data?.transaction?.txHash || null;

      if (!txId) throw new Error('No transaction ID returned from Circle');

      if (initialState === 'COMPLETE' || initialState === 'CONFIRMED') {
        return res.json({ success: true, txHash: initialHash, transactionId: txId });
      }

      return res.json({
        success:       true,
        pending:       true,
        transactionId: txId,
        txHash:        initialHash,
        message:       'Transaction submitted — poll /api/transaction/' + txId + ' for status',
      });

    } catch (err) {
      console.error('Transfer error:', err.message);
      return res.json({ success: false, error: 'Transfer failed — ' + err.message.slice(0, 120) });
    }
  }

  // ── bridge: CCTP V2 cross-chain USDC via Circle API (no MetaMask needed) ───
  //
  // Flow:
  //   1. Approve USDC to TokenMessengerV2 on Arc Testnet
  //   2. Call depositForBurn on TokenMessengerV2 (burns USDC on Arc)
  //   3. Poll Iris attestation API (Circle validates the burn)
  //   4. Return burn txHash + transactionId — frontend polls /api/cctp-attest
  //      to get the attestation and call receiveMessage on the destination chain
  //
  // Docs: https://developers.circle.com/stablecoins/cctp-getting-started
  //       https://www.circle.com/blog/how-to-integrate-cross-chain-usdc-transfers-in-your-telegram-bot
  if (action === 'bridge') {
    if (!walletId || !destChain || !destAddr || !bridgeAmount)
      return res.json({ success: false, error: 'Missing fields' });

    if (!/^0x[a-fA-F0-9]{40}$/.test(destAddr))
      return res.json({ success: false, error: 'Invalid destination address' });

    const parsed = parseFloat(bridgeAmount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });

    const destDomain = CCTP_DEST_DOMAINS[destChain];
    if (destDomain === undefined)
      return res.json({ success: false, error: 'Unsupported destination chain: ' + destChain });

    // Amount in USDC subunits (6 decimals)
    const amountSubunits = Math.floor(parsed * 1_000_000).toString();

    // mintRecipient must be 32-byte hex (left-padded)
    // Per Circle docs: pad the destination address to bytes32
    const mintRecipient = '0x' + destAddr.replace('0x', '').toLowerCase().padStart(64, '0');

    // destinationCaller = bytes32(0) means any relayer can call receiveMessage
    const destinationCaller = '0x' + '0'.repeat(64);

    // maxFee: set to 1000 USDC subunits — covers Standard Transfer fee on testnet
    // For Fast Transfer set maxFee >= Fast Transfer fee for that chain
    const maxFee = Math.floor(parsed * 1000).toString();

    // minFinalityThreshold: 1000 = Standard Transfer (matches source chain finality)
    // Set to 1 for Fast Transfer (faster but higher fee)
    const minFinalityThreshold = '10000';

    try {
      const client = getClient();

      // ── Step 1: Approve TokenMessengerV2 to spend USDC ──────────────────────
      console.log(`[CCTP] Step 1: Approving ${parsed} USDC on Arc Testnet…`);
      const approveTx = await client.createContractExecutionTransaction({
        walletId,
        blockchain:          'ARC-TESTNET',
        contractAddress:     ARC_USDC,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters:       [ARC_CCTP_TOKEN_MESSENGER, amountSubunits],
        idempotencyKey:      crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const approveTxId = approveTx.data?.id;
      if (!approveTxId) throw new Error('Approve transaction failed to submit');

      // Wait for approval to confirm (up to 30s)
      await waitForTx(client, approveTxId, 'USDC approve', 60_000);
      console.log(`[CCTP] Approval confirmed`);

      // ── Step 2: Call depositForBurn on TokenMessengerV2 ─────────────────────
      // ABI signature matches CCTP V2 TokenMessengerV2#depositForBurn
      // Params: amount, destinationDomain, mintRecipient, burnToken,
      //         destinationCaller, maxFee, minFinalityThreshold
      console.log(`[CCTP] Step 2: Burning ${parsed} USDC → domain ${destDomain}…`);
      const burnTx = await client.createContractExecutionTransaction({
        walletId,
        blockchain:          'ARC-TESTNET',
        contractAddress:     ARC_CCTP_TOKEN_MESSENGER,
        abiFunctionSignature: 'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
        abiParameters: [
          amountSubunits,           // uint256 amount
          destDomain.toString(),    // uint32  destinationDomain
          mintRecipient,            // bytes32 mintRecipient
          ARC_USDC,                 // address burnToken
          destinationCaller,        // bytes32 destinationCaller (0 = any relayer)
          maxFee,                   // uint256 maxFee (in USDC subunits)
          minFinalityThreshold,     // uint32  minFinalityThreshold (1000 = Standard)
        ],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const burnTxId = burnTx.data?.id;
      if (!burnTxId) throw new Error('Burn transaction failed to submit');

      // Wait for burn to confirm (up to 60s)
      const confirmedBurn = await waitForTx(client, burnTxId, 'depositForBurn', 60_000);
      const burnTxHash    = confirmedBurn?.txHash || burnTxId;
      console.log(`[CCTP] Burn confirmed — txHash: ${burnTxHash}`);

      // ── Step 3: Start polling Iris for attestation (non-blocking) ───────────
      // We kick off polling and return immediately so the serverless function
      // doesn't time out. The frontend polls /api/cctp-attest for the result.
      // On testnet, attestation can take 5–20 minutes.
      pollAttestation(burnTxHash).then(result => {
        if (result) console.log(`[CCTP] Attestation ready for ${burnTxHash}`);
        else console.log(`[CCTP] Attestation still pending for ${burnTxHash} — frontend will poll`);
      }).catch(err => console.error('[CCTP] Attestation poll error:', err.message));

      return res.json({
        success:       true,
        pending:       true,
        burnTxHash,
        transactionId: burnTxId,
        destChain,
        destDomain,
        destAddr,
        amount:        parsed,
        message:       `USDC burned on Arc — poll /api/cctp-attest?txHash=${burnTxHash} for attestation`,
        // Once attestation is ready, call receiveMessage on the destination chain:
        // MessageTransmitterV2.receiveMessage(messageBytes, attestation)
        // The frontend handles this step via MetaMask on the destination chain,
        // or you can use a Circle wallet on the destination chain for full automation.
      });

    } catch (err) {
      console.error('Bridge error:', err.message);
      return res.json({ success: false, error: 'Bridge failed — ' + err.message.slice(0, 200) });
    }
  }

  // ── getAttestation: poll Iris for a burn tx attestation ────────────────────
  // Call this from /api/cctp-attest or directly — returns attestation when ready
  if (action === 'getAttestation') {
    if (!txHash) return res.json({ success: false, error: 'Missing txHash' });
    try {
      const result = await pollAttestation(txHash, 3); // quick check, 3 attempts
      if (result) {
        return res.json({ success: true, status: 'complete', ...result });
      }
      return res.json({ success: true, status: 'pending', message: 'Attestation not ready yet — try again in 30s' });
    } catch (err) {
      return res.json({ success: false, error: err.message });
    }
  }

  return res.json({ success: false, error: 'Unknown action' });
}


