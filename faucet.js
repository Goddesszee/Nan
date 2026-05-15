export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { address } = req.body;

  if (!address || !address.startsWith('0x') || address.length !== 42) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    const response = await fetch('https://api.circle.com/v1/faucet/drips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer TEST_API_KEY:e508044ccce164a74f36a150f9fa9884:1471f1c47ced3b929e1dad81c796d41e'
      },
      body: JSON.stringify({
        address,
        blockchain: 'ARC-TESTNET',
        native: true,
        usdc: true,
        eurc: true
      })
    });

    const data = await response.json();
    console.log('Faucet response:', JSON.stringify(data).slice(0, 300));

    if (response.ok && data) {
      return res.status(200).json({ success: true, data });
    } else {
      return res.status(400).json({ error: data?.message || 'Faucet request failed' });
    }
  } catch (err) {
    console.error('Faucet error:', err);
    return res.status(500).json({ error: err.message });
  }
}
