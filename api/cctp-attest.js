// api/cctp-attest.js
// Polls Circle's attestation API to complete CCTP bridge transfers
// After burning USDC on source chain, call this to get attestation and mint on destination
// Docs: https://developers.circle.com/stablecoins/reference/getattestation

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, messageHash, txHash } = req.body;

  // ── GET ATTESTATION ──
  if (action === 'getAttestation') {
    if (!messageHash) {
      return res.status(400).json({ error: 'messageHash required' });
    }

    const ATTESTATION_URL = 'https://iris-api-sandbox.circle.com/attestations';

    try {
      const response = await fetch(`${ATTESTATION_URL}/${messageHash}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return res.json({
          status: 'pending',
          attestation: null,
          message: 'Attestation not ready yet — Circle is processing',
        });
      }

      const data = await response.json();

      if (data.status === 'complete' && data.attestation) {
        return res.json({
          status: 'complete',
          attestation: data.attestation,
          message: 'Attestation ready — mint on destination chain',
        });
      }

      return res.json({
        status: data.status || 'pending',
        attestation: null,
        message: 'Circle is attesting the burn — check again in 20 seconds',
      });

    } catch (err) {
      console.error('Attestation error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET TX STATUS (helper) ──
  if (action === 'getTxStatus') {
    if (!txHash) return res.status(400).json({ error: 'txHash required' });

    try {
      // Get message bytes from tx receipt using Arc RPC
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

      // Find MessageSent event from CCTP
      // Topic: keccak256("MessageSent(bytes)")
      const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036';
      const messageSentLog = receipt.logs?.find(log =>
        log.topics?.[0]?.toLowerCase() === MESSAGE_SENT_TOPIC
      );

      if (!messageSentLog) {
        return res.json({ status: 'no_message', message: 'No CCTP message found in tx' });
      }

      // Extract message bytes from log data
      const messageBytes = messageSentLog.data;
      // Hash the message to get messageHash for attestation API
      const { keccak256, toBytes } = await import('viem');
      const msgHash = keccak256(messageBytes);

      return res.json({
        status: 'burned',
        messageHash: msgHash,
        messageBytes,
        message: 'USDC burned — use messageHash to get attestation',
      });

    } catch (err) {
      console.error('TX status error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}
