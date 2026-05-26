// api/cctp-attest.js
// Circle CCTP V2 attestation — Arc Testnet domain 26
// Arc docs confirm domain 26: docs.arc.io/arc/references/contract-addresses
// Iris V2 sandbox: https://iris-api-sandbox.circle.com/v2/messages/{domain}

import { ethers } from 'ethers';

const ARC_RPC         = 'https://rpc.testnet.arc.network';
const ARC_CCTP_DOMAIN = 26;
const IRIS_URL        = 'https://iris-api-sandbox.circle.com/v2/messages';

// keccak256("MessageSent(bytes)") — standard CCTP V2 event from TokenMessengerV2
const MESSAGE_SENT_TOPIC =
  '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036';

function validTxHash(h) {
  return typeof h === 'string' && /^0x[a-fA-F0-9]{64}$/.test(h);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, txHash, sourceDomain } = req.body;
  const domain = Number.isInteger(sourceDomain) ? sourceDomain : ARC_CCTP_DOMAIN;

  // ── getAttestation ───────────────────────────────────────────────────────
  // Polls Iris V2 by transactionHash (V2 uses txHash, not messageHash)
  if (action === 'getAttestation') {
    if (!validTxHash(txHash))
      return res.status(400).json({ error: 'txHash required (0x + 64 hex chars)' });

    try {
      const r = await fetch(`${IRIS_URL}/${domain}?transactionHash=${txHash}`, {
        headers: { Accept: 'application/json' },
      });

      if (r.status === 404) {
        return res.json({
          status: 'pending', attestation: null, message: null,
          hint: 'Not yet indexed by Circle — retry in 15-30s',
        });
      }
      if (!r.ok) {
        return res.json({
          status: 'pending', attestation: null, message: null,
          hint: `Iris returned ${r.status} — retry shortly`,
        });
      }

      const data = await r.json();
      const msg  = data.messages?.[0];

      if (msg?.status === 'complete' && msg.attestation && msg.attestation !== 'PENDING') {
        return res.json({
          status:      'complete',
          attestation: msg.attestation,  // pass to receiveMessage on destination chain
          message:     msg.message,      // pass to receiveMessage on destination chain
          messageHash: msg.messageHash,
        });
      }

      return res.json({
        status: msg?.status || 'pending', attestation: null, message: null,
        hint: 'Attesting — check again in ~20s (testnet can take up to 20 min)',
      });

    } catch (e) {
      console.error('Iris error:', e.message);
      return res.status(500).json({ error: 'Iris service unavailable — retry shortly' });
    }
  }

  // ── getTxStatus ──────────────────────────────────────────────────────────
  // Fetches Arc receipt, extracts messageBytes, computes keccak256 messageHash
  if (action === 'getTxStatus') {
    if (!validTxHash(txHash))
      return res.status(400).json({ error: 'txHash required (0x + 64 hex chars)' });

    try {
      const rpcRes = await fetch(ARC_RPC, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'eth_getTransactionReceipt', params: [txHash], id: 1,
        }),
      });
      const { result: receipt } = await rpcRes.json();

      if (!receipt)
        return res.json({ status: 'pending', message: 'Not yet mined on Arc' });
      if (receipt.status === '0x0')
        return res.json({ status: 'failed',  message: 'Transaction reverted — burn failed' });

      const log = receipt.logs?.find(
        l => l.topics?.[0]?.toLowerCase() === MESSAGE_SENT_TOPIC
      );
      if (!log)
        return res.json({ status: 'no_message', message: 'No CCTP MessageSent event found' });

      const messageBytes = log.data;
      // Use ethers.keccak256 — NOT Node crypto createHash('sha256')
      // SHA-256 != keccak256; Iris expects keccak256
      const messageHash  = ethers.keccak256(messageBytes);

      return res.json({
        status: 'burned', txHash, messageBytes, messageHash,
        blockNumber: receipt.blockNumber,
        hint: 'Poll getAttestation with this txHash until status is complete',
      });

    } catch (e) {
      console.error('getTxStatus error:', e.message);
      return res.status(500).json({ error: 'Could not fetch receipt from Arc RPC' });
    }
  }

  return res.status(400).json({ error: 'Valid actions: getAttestation, getTxStatus' });
}
