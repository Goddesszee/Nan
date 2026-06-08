// api/x402-arc-price.js
// NAN x402 Endpoint — Arc Testnet Token Prices (USDC/EURC rates)

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
        const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,NGN').catch(() => null);
        const fxData = fxRes ? await fxRes.json().catch(() => null) : null;
        const eurRate = fxData?.rates?.EUR || 0.92;
        const ngnRate = fxData?.rates?.NGN || 1620;
        res.json({
          success: true,
          data: {
            USDC: { usd: 1.00, eur: eurRate, ngn: ngnRate },
            EURC: { usd: 1 / eurRate, eur: 1.00, ngn: ngnRate / eurRate },
            source: 'frankfurter + NAN Oracle',
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
