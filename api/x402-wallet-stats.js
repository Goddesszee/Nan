// api/x402-wallet-stats.js
// NAN x402 Endpoint — Arc Testnet Wallet Stats

const SELLER_ADDR = process.env.X402_SELLER_ADDR || '0x86B245D0B48BBdc58F08cAeA971a24ba377c366a';
const ARC_RPC = 'https://rpc.testnet.arc.network';
const USDC_ADDR = '0x3600000000000000000000000000000000000000';
const EURC_ADDR = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

let _gateway = null;
async function getGateway() {
  if (_gateway) return _gateway;
  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server');
  _gateway = createGatewayMiddleware({
    sellerAddress: SELLER_ADDR,
    facilitatorUrl: 'https://gateway-api-testnet.circle.com',
    networks: ['eip155:5042002'],
  });
  return _gateway;
}

async function getTokenBalance(token, address) {
  const data = '0x70a08231' + address.slice(2).padStart(64, '0');
  const r = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data }, 'latest'], id: 1 })
  });
  const d = await r.json();
  return d.result && d.result !== '0x' ? (parseInt(d.result, 16) / 1e6).toFixed(2) : '0.00';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, Payment-Signature, PAYMENT-REQUIRED');
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gateway = await getGateway();
  return new Promise((resolve) => {
    gateway.require('$0.001')(req, res, async () => {
      try {
        const address = req.query.address || SELLER_ADDR;
        const [usdc, eurc] = await Promise.all([
          getTokenBalance(USDC_ADDR, address),
          getTokenBalance(EURC_ADDR, address)
        ]);
        res.json({
          success: true,
          data: {
            address,
            balances: { USDC: usdc, EURC: eurc },
            network: 'Arc Testnet',
            timestamp: new Date().toISOString()
          }
        });
        resolve();
      } catch(e) {
        res.status(500).json({ success: false, error: e.message });
        resolve();
      }
    });
  });
}
