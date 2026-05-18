// api/gateway.js
// Circle Gateway — Unified USDC Balance across chains
// Docs: https://developers.circle.com/gateway/quickstarts/unified-balance-evm

const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1';
const GATEWAY_WALLET_ARC = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';

const DOMAINS = {
  'ETH-SEPOLIA': 0,
  'AVAX-FUJI': 1,
  'BASE-SEPOLIA': 6,
  'ARC-TESTNET': 26,
};

function isValidAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, address } = req.body;

  if (action === 'getBalance') {
    if (!address) return res.status(400).json({ error: 'address required' });
    if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid wallet address' });

    try {
      const body = {
        token: 'USDC',
        sources: Object.entries(DOMAINS).map(([_, domain]) => ({
          domain,
          depositor: address,
        })),
      };

      const response = await fetch(`${GATEWAY_API}/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Gateway API unavailable');
      }

      const result = await response.json();
      let total = 0;
      const balances = {};

      for (const balance of (result.balances || [])) {
        const amount = parseFloat(balance.balance || 0) / 1e6;
        const chain = Object.keys(DOMAINS).find(k => DOMAINS[k] === balance.domain) || `domain-${balance.domain}`;
        balances[chain] = amount;
        total += amount;
      }

      return res.json({
        success: true,
        total: total.toFixed(2),
        balances,
        gatewayWallet: GATEWAY_WALLET_ARC,
      });

    } catch (err) {
      console.error('Gateway balance error:', err.message);
      return res.json({
        success: false,
        error: 'Could not fetch Gateway balance',
        total: '0.00',
        balances: {},
      });
    }
  }

  if (action === 'info') {
    try {
      const response = await fetch(`${GATEWAY_API}/info`);
      if (!response.ok) throw new Error('Gateway info unavailable');
      const data = await response.json();
      return res.json({ success: true, data });
    } catch (err) {
      return res.json({ success: false, error: 'Could not fetch Gateway info' });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: getBalance, info' });
}