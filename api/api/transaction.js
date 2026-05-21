// api/transaction.js — CORRECT (no changes from previous version)
// Poll a Circle transaction by ID — called by frontend after circle-wallets returns pending:true
//
// Response shape confirmed from Circle docs:
//   getTransaction → { data: { transaction: { id, state, txHash, ... } } }
//
// This file is correct as-is. Listed here for completeness.

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
  const parts = req.url?.split('/').filter(Boolean);
  const txId  = parts?.[parts.length - 1];

  if (!txId || !/^[a-zA-Z0-9_-]{8,}$/.test(txId))
    return res.status(400).json({ error: 'Invalid transaction ID' });

  // Dev mode — no credentials
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    return res.json({
      id:        txId,
      state:     'COMPLETE',
      txHash:    '0xdev' + txId.slice(0, 32),
      confirmed: true,
      failed:    false,
    });
  }

  try {
    const client = getClient();
    const result = await client.getTransaction({ id: txId });

    // Confirmed from Circle docs: getTransaction wraps under data.transaction
    const tx = result.data?.transaction;
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    return res.json({
      id:        tx.id,
      state:     tx.state,
      txHash:    tx.txHash || null,
      confirmed: tx.state === 'COMPLETE' || tx.state === 'CONFIRMED',
      failed:    tx.state === 'FAILED' || tx.state === 'CANCELLED' || tx.state === 'DENIED',
    });

  } catch (err) {
    console.error('[transaction poll]', err.message);
    return res.status(500).json({ error: 'Could not fetch transaction status' });
  }
}
