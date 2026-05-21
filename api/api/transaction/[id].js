// api/transaction.js
// Poll a Circle transaction by ID — called by the frontend after circle-wallets returns pending:true
// This replaces the 90-second blocking poll that was inside circle-wallets.js
// Vercel serverless timeout is 10s — never poll synchronously inside a transfer handler

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey:       process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).end();

  // Route: GET /api/transaction/[id]
  // Extract id from URL: /api/transaction/abc-123
  const parts = req.url?.split('/').filter(Boolean);
  const txId  = parts?.[parts.length - 1];

  if (!txId || !/^[a-zA-Z0-9_-]{8,}$/.test(txId))
    return res.status(400).json({ error: 'Invalid transaction ID' });

  try {
    const client = getClient();
    const result = await client.getTransaction({ id: txId });
    const tx     = result.data?.transaction;

    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    return res.json({
      id:     tx.id,
      state:  tx.state,
      txHash: tx.txHash || null,
      // Normalise state so frontend has a simple confirmed/pending/failed flag
      confirmed: tx.state === 'COMPLETE' || tx.state === 'CONFIRMED',
      failed:    tx.state === 'FAILED' || tx.state === 'CANCELLED' || tx.state === 'DENIED',
    });

  } catch (err) {
    console.error('Transaction poll error:', err.message);
    return res.status(500).json({ error: 'Could not fetch transaction status' });
  }
}
