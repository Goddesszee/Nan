// api/cctp-attest.js
// CCTP V2 attestation — Circle deprecated V1 July 2026
// Docs: https://developers.circle.com/stablecoins/cctp-getting-started

import { createHash } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, messageHash, txHash, sourceDomain } = req.body;

  if (action === 'getAttestation') {
    if (!messageHash) return res.status(400).json({ error: 'messageHash required' });
    if (!/^0x[a-fA-F0-9]+$/.test(messageHash)) return res.status(400).json({ error: 'Invalid messageHash' });

    const IRIS_URL = 'https://iris-api-sandbox.circle.com/v2/messages';
    const domain = sourceDomain || 26;

    try {
      const response = await fetch(`${IRIS_URL}/${domain}?messageHash=${messageHash}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return res.json({
          status: 'pending',
          attestation: null,
          message: 'Attestation not ready — Circle is processing',
        });
      }

      const data = await response.json();
      const msg = data.messages?.[0];

      if (msg?.status === 'complete' && msg?.attestation && msg.attestation !== 'PENDING') {
        return res.json({
          status: 'complete',
          attestation: msg.attestation,
          message: msg.message,
          result: 'Attestation ready — mint on destination chain',
        });
      }

      return res.json({
        status: msg?.status || 'pending',
        attestation: null,
        message: 'Circle is attesting the burn — check again in 20 seconds',
      });

    } catch (err) {
      console.error('Attestation error:', err.message);
      return res.status(500).json({ error: 'Attestation service unavailable' });
    }
  }

  if (action === 'getTxStatus') {
    if (!txHash) return res.status(400).json({ error: 'txHash required' });
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return res.status(400).json({ error: 'Invalid txHash' });

    try {
      const ARC_RPC = 'https://rpc.testnet.arc.network';
      const rpcRes = await fetch(ARC_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        }),
      });
      const rpcData = await rpcRes.json();
      const receipt = rpcData?.result;

      if (!receipt) {
        return res.json({ status: 'pending', message: 'Transaction not yet mined' });
      }

      const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036';
      const messageSentLog = receipt.logs?.find(log =>
        log.topics?.[0]?.toLowerCase() === MESSAGE_SENT_TOPIC
      );

      if (!messageSentLog) {
        return res.json({ status: 'no_message', message: 'No CCTP message found in tx' });
      }

      const messageBytes = messageSentLog.data;

      // Use Node.js crypto for keccak256-like hash
      const msgBuffer = Buffer.from(messageBytes.slice(2), 'hex');
      const msgHash = '0x' + createHash('sha256').update(msgBuffer).digest('hex');

      return res.json({
        status: 'burned',
        messageHash: msgHash,
        messageBytes,
        message: 'USDC burned — use messageHash to get attestation',
      });

    } catch (err) {
      console.error('TX status error:', err.message);
      return res.status(500).json({ error: 'Could not get transaction status' });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}