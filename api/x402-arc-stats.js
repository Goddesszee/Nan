// api/x402-arc-stats.js
// NAN x402 Endpoint — Arc Testnet Chain Stats

const SELLER_ADDR = process.env.X402_SELLER_ADDR || '0x86B245D0B48BBdc58F08cAeA971a24ba377c366a';
const ARC_RPC = 'https://rpc.testnet.arc.network';

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

async function rpc(method, params=[]) {
  const r = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  const d = await r.json();
  return d.result;
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
        const [blockHex, gasHex, chainIdHex] = await Promise.all([
          rpc('eth_blockNumber'),
          rpc('eth_gasPrice'),
          rpc('eth_chainId'),
        ]);
        const block = parseInt(blockHex, 16);
        const gasGwei = (parseInt(gasHex, 16) / 1e9).toFixed(4);
        const chainId = parseInt(chainIdHex, 16);
        res.json({
          success: true,
          data: {
            network: 'Arc Testnet',
            chainId,
            blockNumber: block,
            gasPrice: gasGwei + ' Gwei',
            rpc: ARC_RPC,
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
