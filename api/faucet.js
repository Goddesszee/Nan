export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Faucet not available on testnet via API — users get tokens from Arc faucet
  res.json({ success: false, error: 'Use the Arc Testnet faucet at faucet.testnet.arc.network' });
}
