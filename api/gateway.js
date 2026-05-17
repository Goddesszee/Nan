// api/gateway.js
// Circle Gateway — Unified USDC Balance across chains
// Fully permissionless — no API key needed!
// Docs: https://developers.circle.com/gateway/quickstarts/unified-balance-evm

const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1';

// Arc Testnet Gateway Wallet contract address
const GATEWAY_WALLET_ARC = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';

// Domain IDs from Circle docs
const DOMAINS = {
  'ETH-SEPOLIA': 0,
  'AVAX-FUJI': 1,
  'BASE-SEPOLIA': 6,
  'ARC-TESTNET': 26,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, address } = req.body;

  // ── GET UNIFIED BALANCE ──
  if (action === 'getBalance') {
    if (!address) return res.status(400).json({ error: 'address required' });

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
        const err = await response.text();
        throw new Error(`Gateway API error: ${err}`);
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
        error: err.message,
        total: '0.00',
        balances: {},
      });
    }
  }

  // ── GET GATEWAY INFO ──
  if (action === 'info') {
    try {
      const response = await fetch(`${GATEWAY_API}/info`);
      const data = await response.json();
      return res.json({ success: true, data });
    } catch (err) {
      return res.json({ success: false, error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: getBalance, info' });
}
