// api/fx-rate.js
// Gets live USDC/EURC FX rates from multiple sources
// Primary: Band Protocol oracle on Arc testnet
// Fallback: CoinGecko API (no key needed)
// Last fallback: hardcoded rate

const BAND_ORACLE = '0x'; // Band Protocol on Arc — update when live
const ARC_RPC = 'https://rpc.testnet.arc.network';

async function getBandRate() {
  // Band Protocol IStdReference ABI
  const BAND_REF_ADDRESS = '0x'; // Band oracle address on Arc testnet
  if (!BAND_REF_ADDRESS || BAND_REF_ADDRESS === '0x') {
    throw new Error('Band oracle not configured on Arc testnet yet');
  }

  // Call getReferenceData(base, quote)
  const calldata = '0x' + Buffer.from(
    'getReferenceData(string,string)' + 'EUR' + 'USD'
  ).toString('hex');

  const response = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: BAND_REF_ADDRESS, data: calldata }, 'latest'],
      id: 1,
    }),
  });

  const data = await response.json();
  if (data.result && data.result !== '0x') {
    // Decode the rate (Band returns rate * 1e18)
    const rateBN = BigInt(data.result.slice(0, 66));
    const rate = Number(rateBN) / 1e18;
    return { rate, source: 'band' };
  }
  throw new Error('Band oracle returned no data');
}

async function getCoinGeckoRate() {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=euro-coin&vs_currencies=usd',
    { headers: { 'Accept': 'application/json' } }
  );
  if (!response.ok) throw new Error('CoinGecko failed');
  const data = await response.json();
  const rate = data?.['euro-coin']?.usd;
  if (!rate) throw new Error('No rate from CoinGecko');
  return { rate, source: 'coingecko' };
}

async function getExchangeRateAPI() {
  // Free tier — no key needed
  const response = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!response.ok) throw new Error('ExchangeRate API failed');
  const data = await response.json();
  const eurPerUsd = data?.rates?.EUR;
  if (!eurPerUsd) throw new Error('No EUR rate');
  // EURC per USDC = EUR per USD
  return { rate: eurPerUsd, source: 'exchangerate-api' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60'); // Cache 1 min

  // Try sources in order
  const sources = [getBandRate, getCoinGeckoRate, getExchangeRateAPI];

  for (const source of sources) {
    try {
      const result = await source();
      if (result.rate && result.rate > 0 && result.rate < 10) {
        return res.json({
          success: true,
          rate: result.rate,        // EURC per USDC (e.g. 0.9258)
          rateInverse: 1 / result.rate, // USDC per EURC
          source: result.source,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.log(`FX source ${source.name} failed:`, err.message);
    }
  }

  // All failed — return last known good rate
  return res.json({
    success: false,
    rate: 0.9258,
    rateInverse: 1.0801,
    source: 'fallback',
    timestamp: Date.now(),
  });
}
