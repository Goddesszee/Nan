// api/x402-ngn-rate.js
// NAN x402 Seller Endpoint — NGN/USD Rate
// Uses createGatewayMiddleware per Circle official seller quickstart
// https://developers.circle.com/gateway/nanopayments/quickstarts/seller

const SELLER_ADDR = process.env.X402_SELLER_ADDR || '0xd83498B62d2ab0650A4Edfc7929c96804aA75F77';
const FACILITATOR = 'https://gateway-api-testnet.circle.com';

let _middleware = null;
async function getMiddleware() {
  if (_middleware) return _middleware;
  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server');
  _middleware = createGatewayMiddleware({
    sellerAddress: SELLER_ADDR,
    facilitatorUrl: FACILITATOR,
    networks: ['eip155:5042002'], // Arc Testnet only
  });
  return _middleware;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, PAYMENT-SIGNATURE, PAYMENT-REQUIRED');
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-SIGNATURE');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gateway = await getMiddleware();

  // Use gateway.require() as middleware then handle the route
  gateway.require('$0.001')(req, res, async () => {
    // Payment verified — return NGN/USD rate
    try {
      const fxRes  = await fetch('https://api.frankfurter.app/latest?from=USD&to=NGN').catch(() => null);
      const fxData = fxRes ? await fxRes.json().catch(() => null) : null;
      const rate   = fxData?.rates?.NGN || 1650;

      return res.json({
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
          payer:     req.payment?.payer || 'unknown',
        }
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  });
}
