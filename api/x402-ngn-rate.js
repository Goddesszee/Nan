// api/x402-ngn-rate.js
// NAN x402 Seller Endpoint — NGN/USD Rate
// GatewayClient sends header as "Payment-Signature" (not X-PAYMENT)
// Payload: { ...paymentPayload, resource, accepted } base64 encoded

const GATEWAY_API    = 'https://gateway-api-testnet.circle.com';
const SELLER_ADDR    = process.env.X402_SELLER_ADDR || '0xd83498B62d2ab0650A4Edfc7929c96804aA75F77';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const PRICE_ATOMIC   = '1000';
const USDC_ARC       = '0x3600000000000000000000000000000000000000';
const CHAIN_ID       = 'eip155:5042002';

const requirements = {
  scheme:            'exact',
  network:           CHAIN_ID,
  asset:             USDC_ARC,
  amount:            PRICE_ATOMIC,
  maxTimeoutSeconds: 604900,
  payTo:             SELLER_ADDR,
  extra: {
    name:              'GatewayWalletBatched',
    version:           '1',
    verifyingContract: GATEWAY_WALLET,
  }
};

const paymentRequired = {
  x402Version: 2,
  resource: {
    url:         '/api/x402/ngn-rate',
    description: 'Live NGN/USD exchange rate — NAN Wallet',
    mimeType:    'application/json',
  },
  accepts: [requirements]
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, Payment-Signature, PAYMENT-REQUIRED');
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GatewayClient sends "Payment-Signature" header (lowercase in Node)
  const paymentHeader = req.headers['payment-signature'] || req.headers['x-payment'];

  if (!paymentHeader) {
    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
    res.setHeader('PAYMENT-REQUIRED', encoded);
    return res.status(402).json(paymentRequired);
  }

  try {
    // Decode the full payment payload
    let fullPayload;
    try {
      fullPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
    } catch {
      fullPayload = JSON.parse(paymentHeader);
    }

    console.log('[x402] payload keys:', Object.keys(fullPayload));

    // Extract paymentPayload for BatchFacilitatorClient.settle()
    // fullPayload = { ...paymentPayload, resource, accepted }
    // paymentPayload = everything except resource and accepted
    const { resource, accepted, ...paymentPayload } = fullPayload;

    const { BatchFacilitatorClient } = await import('@circle-fin/x402-batching/server');
    const facilitator = new BatchFacilitatorClient({ url: GATEWAY_API });

    // Use the accepted requirements from the payload (what buyer agreed to)
    const settleRequirements = accepted || requirements;
    const settled = await facilitator.settle(paymentPayload, settleRequirements);
    console.log('[x402] settle result:', JSON.stringify(settled));

    if (!settled.success) {
      return res.status(402).json({ error: 'Settlement failed', details: settled });
    }

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
      }
    });

  } catch(e) {
    console.error('[x402] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
