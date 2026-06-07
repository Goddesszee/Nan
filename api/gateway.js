// api/gateway.js
// Circle Gateway — Unified USDC Balance
// Docs: https://developers.circle.com/gateway/quickstarts/unified-balance-evm
//
// IMPORTANT per Circle docs:
// - Do NOT transfer USDC directly to Gateway contract — use deposit() function
// - Balance updates require block confirmations — can take up to 20 minutes
// - Gateway API returns balances already in USDC format (not atomic units)
// - Arc Testnet domain = 26

const GATEWAY_API    = 'https://gateway-api-testnet.circle.com/v1';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';

// All supported Gateway testnet domains per Circle docs
const DOMAINS = {
  'ETH-SEPOLIA':  0,
  'AVAX-FUJI':    1,
  'BASE-SEPOLIA': 6,
  'ARC-TESTNET':  26,
};

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { action, address } = req.body;

  // ── getBalance ────────────────────────────────────────────────────────────
  if (action === 'getBalance') {
    if (!address)              return res.status(400).json({ error: 'address required' });
    if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid wallet address' });

    try {
      const body = {
        token: 'USDC',
        sources: Object.entries(DOMAINS).map(([_, domain]) => ({
          domain,
          depositor: address,
        })),
      };

      const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
      const response = await fetch(`${GATEWAY_API}/balances`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${CIRCLE_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Gateway API ${response.status}: ${errText}`);
      }

      const result = await response.json();
      let total = 0;
      const balances = {};

      for (const balance of (result.balances || [])) {
        // Gateway API returns balance as a decimal string already in USDC
        // e.g. "2.000000" means 2 USDC — do NOT divide by 1e6
        const amount = parseFloat(balance.balance || 0);
        const chain  = Object.keys(DOMAINS).find(k => DOMAINS[k] === balance.domain)
                    || `domain-${balance.domain}`;
        balances[chain] = amount;
        total += amount;
      }

      return res.json({
        success:       true,
        total:         total.toFixed(6),
        balances,
        gatewayWallet: GATEWAY_WALLET,
        gatewayMinter: GATEWAY_MINTER,
        note: total === 0
          ? 'Balance pending finality — deposits can take up to 20 minutes to confirm per Circle docs'
          : undefined,
      });

    } catch (err) {
      console.error('Gateway balance error:', err.message);
      return res.json({
        success:  false,
        error:    'Could not fetch Gateway balance — ' + err.message.slice(0, 100),
        total:    '0.00',
        balances: {},
      });
    }
  }

  // ── info ──────────────────────────────────────────────────────────────────
  if (action === 'info') {
    try {
      const CIRCLE_API_KEY_INFO = process.env.CIRCLE_API_KEY || '';
      const response = await fetch(`${GATEWAY_API}/info`, {
        headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY_INFO}` }
      });
      if (!response.ok) throw new Error('Gateway info unavailable');
      const data = await response.json();
      return res.json({ success: true, data });
    } catch (err) {
      return res.json({ success: false, error: 'Could not fetch Gateway info' });
    }
  }

  return res.status(400).json({ error: 'Valid actions: getBalance, info' });
}
