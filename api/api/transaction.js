import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const client = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    });
    const result = await client.getTransaction({ id });
    const tx = result.data?.transaction;
    return res.json({
      state: tx?.state,
      txHash: tx?.txHash,
      status: tx?.state,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}