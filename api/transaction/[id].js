const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey:       process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).end();

  const txId = req.query.id;

  if (!txId || !/^[a-zA-Z0-9_-]{8,}$/.test(txId))
    return res.status(400).json({ error: 'Invalid transaction ID' });

  try {
    const client = getClient();
    const result = await client.getTransaction({ id: txId });
    const tx     = result.data?.transaction;

    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    return res.json({
      id:        tx.id,
      state:     tx.state,
      txHash:    tx.txHash || null,
      confirmed: tx.state === 'COMPLETE' || tx.state === 'CONFIRMED',
      failed:    tx.state === 'FAILED' || tx.state === 'CANCELLED' || tx.state === 'DENIED',
    });

  } catch (err) {
    console.error('Transaction poll error:', err.message);
    return res.status(500).json({ error: 'Could not fetch transaction status' });
  }
}
