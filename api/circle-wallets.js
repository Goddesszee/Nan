// api/circle-wallets.js
// Circle Developer-Controlled Wallets — wallet creation, USDC/EURC transfer,
// and CCTP V2 cross-chain bridge
//
// Fixed per Circle official blog (circle.com/blog/how-to-integrate-cross-chain-usdc-transfers-in-your-telegram-bot)
// and Arc Testnet contract addresses (docs.arc.io/arc/references/contract-addresses)
//
// KEY FIXES vs previous version:
//   1. usdcAmount passed as plain decimal string (e.g. "1.0") NOT atomic units
//   2. mintRecipient properly padded to bytes32
//   3. destinationCaller as full 64-char zero hex string
//   4. maxFee calculated properly (1% of amount in atomic units)
//   5. waitForTx timeout 90s with 4s polling
//
// Arc Testnet CCTP V2 (domain 26):
//   TokenMessengerV2:     0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA
//   MessageTransmitterV2: 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'crypto';

const ARC_USDC = '0x3600000000000000000000000000000000000000';
const ARC_EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const ARC_CCTP_TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const ARC_CCTP_DOMAIN = 26;
const IRIS_API = 'https://iris-api-sandbox.circle.com/v2/messages';

const CCTP_DEST_DOMAINS = {
  'ETH-SEPOLIA':   0,
  'AVAX-FUJI':     1,
  'OP-SEPOLIA':    2,
  'ARB-SEPOLIA':   3,
  'BASE-SEPOLIA':  6,
  'POLYGON-AMOY':  7,
};

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey:       process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

function walletSetName(email) {
  const hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
  return `nan-${hash}`;
}

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

async function waitForTx(client, txId, label = 'tx', maxWaitMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const res   = await client.getTransaction({ id: txId });
      const state = res.data?.transaction?.state;
      const hash  = res.data?.transaction?.txHash;
      console.log(`[${label}] state: ${state}`);
      if (state === 'CONFIRMED' || state === 'COMPLETE') return { state, txHash: hash, id: txId };
      if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED')
        throw new Error(`${label} failed with state: ${state}`);
    } catch (e) {
      if (e.message.includes('failed with state')) throw e;
      console.warn(`[${label}] poll error:`, e.message);
    }
  }
  throw new Error(`${label} timed out`);
}

async function pollAttestation(txHash, maxAttempts = 3) {
  const url = `${IRIS_API}/${ARC_CCTP_DOMAIN}?transactionHash=${txHash}`;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const res  = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const msg  = data.messages?.[0];
      if (msg?.status === 'complete' && msg.attestation && msg.attestation !== 'PENDING')
        return { attestation: msg.attestation, message: msg.message };
    } catch (_) {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, walletId, destinationAddress, amount, tokenSymbol,
          destChain, destAddr, bridgeAmount, txHash } = req.body;

  // ── getWallet ───────────────────────────────────────────────────────────────
  if (action === 'getWallet') {
    if (!email || !email.includes('@') || email.length > 100 || email.includes('<'))
      return res.json({ success: false, error: 'Invalid email' });
    try {
      const client = getClient();
      const name   = walletSetName(email);
      let walletSet = await findWalletSet(client, name);
      if (!walletSet) {
        const newSet = await client.createWalletSet({ name, idempotencyKey: crypto.randomUUID() });
        walletSet = newSet.data?.walletSet;
      }
      if (!walletSet?.id) throw new Error('Could not create wallet set');
      const walletsRes = await client.listWallets({ walletSetId: walletSet.id, pageSize: 10 });
      let wallet = walletsRes.data?.wallets?.find(w => w.blockchain === 'ARC-TESTNET');
      if (!wallet) {
        const newWallet = await client.createWallets({
          walletSetId: walletSet.id, blockchains: ['ARC-TESTNET'],
          count: 1, idempotencyKey: crypto.randomUUID(),
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

  // ── transfer ────────────────────────────────────────────────────────────────
  if (action === 'transfer') {
    if (!walletId || !destinationAddress || !amount)
      return res.json({ success: false, error: 'Missing fields' });
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress))
      return res.json({ success: false, error: 'Invalid destination address' });
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });
    const tokenAddress = tokenSymbol === 'EURC' ? ARC_EURC : ARC_USDC;
    try {
      const client = getClient();
      const tx = await client.createTransaction({
        idempotencyKey: crypto.randomUUID(), blockchain: 'ARC-TESTNET',
        walletId, destinationAddress, amounts: [parsed.toFixed(6)],
        tokenAddress, fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const txId = tx.data?.transaction?.id;
      if (!txId) throw new Error('No transaction ID returned');
      const state = tx.data?.transaction?.state;
      const hash  = tx.data?.transaction?.txHash || null;
      if (state === 'COMPLETE' || state === 'CONFIRMED')
        return res.json({ success: true, txHash: hash, transactionId: txId });
      return res.json({ success: true, pending: true, transactionId: txId, txHash: hash });
    } catch (err) {
      console.error('Transfer error:', err.message);
      return res.json({ success: false, error: 'Transfer failed — ' + err.message.slice(0, 120) });
    }
  }

  // ── bridge: CCTP V2 ─────────────────────────────────────────────────────────
  // Exactly per Circle's official Telegram bot blog post:
  // https://www.circle.com/blog/how-to-integrate-cross-chain-usdc-transfers-in-your-telegram-bot
  //
  // approve: abiParameters: [tokenMessenger, usdcAmount.toString()]
  //   — usdcAmount is ATOMIC UNITS (6 decimals) per approve ABI spec
  //
  // depositForBurn: abiParameters: [
  //   usdcAmount.toString(),           <- atomic units as string
  //   destinationDomain.toString(),    <- domain ID
  //   mintRecipientAddressInBytes32,   <- address padded to 32 bytes
  //   sourceConfig.usdc,               <- USDC contract address
  //   "0x000...000" (64 zeros),        <- destinationCaller (any relayer)
  //   maxFee.toString(),               <- 1% of amount in atomic units
  //   "1000",                          <- minFinalityThreshold (Standard)
  // ]
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

    // Atomic units — USDC uses 6 decimals
    const usdcAmountAtomic = Math.floor(parsed * 1_000_000).toString();

    // mintRecipient: address padded to bytes32 (per Circle docs)
    const mintRecipientAddressInBytes32 =
      '0x' + destAddr.replace('0x', '').toLowerCase().padStart(64, '0');

    // destinationCaller: full 32-byte zero hex (any relayer can mint)
    const destinationCaller =
      '0x0000000000000000000000000000000000000000000000000000000000000000';

    // maxFee: 1% of amount in atomic units (per Circle CCTP V2 docs)
    // Must be > 0 for Standard Transfer on testnet
    const maxFee = Math.ceil(parsed * 1_000_000 * 0.01).toString();

    try {
      const client = getClient();

      // Step 1: Approve USDC to TokenMessengerV2
      console.log(`[CCTP] Step 1: Approving ${usdcAmountAtomic} USDC atomic units…`);
      const approveTx = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           'ARC-TESTNET',
        contractAddress:      ARC_USDC,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters:        [ARC_CCTP_TOKEN_MESSENGER, usdcAmountAtomic],
        idempotencyKey:       crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const approveTxId = approveTx.data?.id;
      if (!approveTxId) throw new Error('Approve tx failed to submit');
      await waitForTx(client, approveTxId, 'USDC approve', 90_000);
      console.log('[CCTP] Approval confirmed');

      // Step 2: depositForBurn — exactly per Circle blog post
      console.log(`[CCTP] Step 2: depositForBurn ${usdcAmountAtomic} → domain ${destDomain}…`);
      const burnTx = await client.createContractExecutionTransaction({
        walletId,
        blockchain:           'ARC-TESTNET',
        contractAddress:      ARC_CCTP_TOKEN_MESSENGER,
        abiFunctionSignature: 'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
        abiParameters: [
          usdcAmountAtomic,                // uint256 amount (atomic units)
          destDomain.toString(),           // uint32  destinationDomain
          mintRecipientAddressInBytes32,   // bytes32 mintRecipient
          ARC_USDC,                        // address burnToken
          destinationCaller,               // bytes32 destinationCaller
          maxFee,                          // uint256 maxFee (1% of amount)
          '1000',                          // uint32  minFinalityThreshold
        ],
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const burnTxId = burnTx.data?.id;
      if (!burnTxId) throw new Error('Burn tx failed to submit');

      const burnResult = await waitForTx(client, burnTxId, 'depositForBurn', 90_000);
      const burnTxHash = burnResult.txHash || burnTxId;
      console.log(`[CCTP] Burn confirmed — txHash: ${burnTxHash}`);

      // Step 3: Iris attestation (non-blocking)
      pollAttestation(burnTxHash).then(r => {
        if (r) console.log(`[CCTP] Attestation ready for ${burnTxHash}`);
        else console.log(`[CCTP] Attestation pending for ${burnTxHash}`);
      }).catch(e => console.error('[CCTP] Attestation error:', e.message));

      return res.json({
        success: true, pending: true,
        burnTxHash, transactionId: burnTxId,
        destChain, destDomain, destAddr, amount: parsed,
        message: `USDC burned on Arc — poll /api/cctp-attest?txHash=${burnTxHash}`,
      });

    } catch (err) {
      console.error('Bridge error:', err.message);
      return res.json({ success: false, error: 'Bridge failed — ' + err.message.slice(0, 200) });
    }
  }

  // ── getAttestation ──────────────────────────────────────────────────────────
  if (action === 'getAttestation') {
    if (!txHash) return res.json({ success: false, error: 'Missing txHash' });
    try {
      const result = await pollAttestation(txHash, 3);
      if (result) return res.json({ success: true, status: 'complete', ...result });
      return res.json({ success: true, status: 'pending', message: 'Try again in 30s' });
    } catch (err) {
      return res.json({ success: false, error: err.message });
    }
  }

  return res.json({ success: false, error: 'Unknown action' });
}
