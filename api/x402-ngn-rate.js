// api/x402-ngn-rate.js
// NAN x402 Seller Endpoint — NGN/USD Rate
// Uses createGatewayMiddleware exactly like circle reference implementation:
// github.com/BlockRunAI/circle-nanopayment-sample/blob/main/src/server.ts

// Seller = main wallet (DIFFERENT from buyer 0xd83498...)
const SELLER_ADDR = process.env.X402_SELLER_ADDR || '0x86B245D0B48BBdc58F08cAeA971a24ba377c366a';

let _gateway = null;
async function getGateway() {
  if (_gateway) return _gateway;
  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server');
  _gateway = createGatewayMiddleware({
    sellerAddress: SELLER_ADDR,
    facilitatorUrl: 'https://gateway-api-testnet.circle.com',
    networks: ['eip155:5042002'], // Arc Testnet only
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
        const fxRes  = await fetch('https://api.frankfurter.app/latest?from=USD&to=NGN').catch(() => null);
        const fxData = fxRes ? await fxRes.json().catch(() => null) : null;
        const rate   = fxData?.rates?.NGN || 1650;
        res.json({
          success:   true,
          paid:      true,
          data: {
            pair:      'NGN/USD',
            rate,
            inverse:   parseFloat((1 / rate).toFixed(8)),
            source:    fxData ? 'frankfurter-ecb' : 'fallback',
            timestamp: new Date().toISOString(),
            chain:     'Arc Testnet',
            pricePaid: '$0.001 USDC',
          }
        });
        resolve();
      } catch(e) {
        res.status(500).json({ error: e.message });
        resolve();
      }
    });
  });
}
