// api/x402-ngn-rate.js
// NAN x402 Seller Endpoint — NGN/USD Rate
// Paywalled per Circle x402 spec: https://developers.circle.com/gateway/nanopayments
// Price: 0.001 USDC per call on Arc Testnet (domain 26)

const GATEWAY_API    = 'https://gateway-api-testnet.circle.com/v1';
const BACKING_EOA    = '0x993712f1dde0f652ae9fdda5d72796b22c1249af';

// 0.001 USDC = 1000 in 6-decimal atomic units
const PRICE_ATOMIC   = '1000';
const USDC_ARC       = '0x3600000000000000000000000000000000000000';
const CHAIN_ID       = 'eip155:5042002'; // Arc Testnet

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, X-Payment');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const paymentHeader = req.headers['x-payment'] || req.headers['x-Payment'];

  // ── No payment header → return 402 with payment requirements ─────────────
  if (!paymentHeader) {
    return res.status(402).json({
      x402Version: 1,
      error: 'Payment required',
      accepts: [{
        scheme:            'exact',
        network:           CHAIN_ID,
        asset:             USDC_ARC,
        payTo:             BACKING_EOA,
        amount:            PRICE_ATOMIC,
        maxTimeoutSeconds: 60,
        extra: { name: 'USD Coin', version: '2' }
      }]
    });
  }

  // ── Payment header present → verify with Circle Gateway ──────────────────
  try {
    const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
    let payment;
    try {
      payment = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
    } catch {
      payment = JSON.parse(paymentHeader);
    }

    const verifyRes = await fetch(`${GATEWAY_API}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CIRCLE_API_KEY}`,
      },
      body: JSON.stringify({
        payment,
        payTo:   BACKING_EOA,
        amount:  PRICE_ATOMIC,
        asset:   USDC_ARC,
        network: CHAIN_ID,
      })
    });

    const verified = await verifyRes.json();

    if (!verified.valid) {
      return res.status(402).json({
        error: 'Payment verification failed',
        details: verified
      });
    }

    // ── Payment verified → return NGN/USD rate ────────────────────────────
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
        pricePaid: '0.001 USDC',
      }
    });

  } catch (e) {
    return res.status(500).json({ error: 'Verification error: ' + e.message });
  }
}
