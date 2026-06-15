// api/x402-cctp-status.js
// NAN x402 Endpoint — CCTP Bridge Status

const SELLER_ADDR = process.env.X402_SELLER_ADDR || '0x86B245D0B48BBdc58F08cAeA971a24ba377c366a';

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

const CHAINS = [
  { name: 'Arc Testnet', domain: 26, rpc: 'https://rpc.testnet.arc.network' },
  { name: 'ETH Sepolia', domain: 0, rpc: 'https://rpc.sepolia.org' },
  { name: 'Base Sepolia', domain: 6, rpc: 'https://sepolia.base.org' },
  { name: 'ARB Sepolia', domain: 3, rpc: 'https://sepolia-rollup.arbitrum.io/rpc' },
];

async function checkChain(chain) {
  try {
    const r = await fetch(chain.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: AbortSignal.timeout(4000)
    });
    const d = await r.json();
    const block = parseInt(d.result, 16);
    return { name: chain.name, domain: chain.domain, status: 'online', block };
  } catch(e) {
    return { name: chain.name, domain: chain.domain, status: 'offline', error: e.message };
  }
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
        const results = await Promise.all(CHAINS.map(checkChain));
        const online = results.filter(c => c.status === 'online').length;
        res.json({
          success: true,
          data: {
            summary: online + '/' + CHAINS.length + ' chains online',
            chains: results,
            bridgeReady: online >= 2,
            timestamp: new Date().toISOString(),
            pricePaid: '$0.001 USDC'
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
