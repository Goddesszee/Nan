// api/fx-rate.js
// Live USDC/EURC FX rates
// Priority: Band (USDC/USD check) → Frankfurter → open.er-api → fallback
// Band on Arc only feeds USDC/USD — not EUR/USD, so fiat sources give the EUR rate

const ARC_RPC          = 'https://rpc.testnet.arc.network';
const BAND_REF_ADDRESS = '0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68';

// ABI-encoded getReferenceData("USDC","USD") — selector 0xc3f90ee2
const BAND_CALLDATA =
  '0xc3f90ee2' +
  '0000000000000000000000000000000000000000000000000000000000000040' +
  '0000000000000000000000000000000000000000000000000000000000000080' +
  '0000000000000000000000000000000000000000000000000000000000000004' +
  '5553444300000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000003' +
  '5553440000000000000000000000000000000000000000000000000000000000';

async function checkBandUSDC() {
  const r = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'eth_call',
      params: [{ to: BAND_REF_ADDRESS, data: BAND_CALLDATA }, 'latest'],
      id: 1,
    }),
  });
  const d = await r.json();
  if (!d.result || d.result === '0x' || d.result.length < 66) throw new Error('No Band data');
  const price = Number(BigInt(d.result.slice(0, 66))) / 1e18;
  if (price < 0.9 || price > 1.1) throw new Error(`USDC off-peg: ${price}`);
  return price;
}

async function getFrankfurter() {
  const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
  if (!r.ok) throw new Error('Frankfurter failed');
  const d = await r.json();
  const usdPerEur = d?.rates?.USD;
  if (!usdPerEur || usdPerEur < 0.8 || usdPerEur > 1.5) throw new Error('Bad Frankfurter rate');
  return { rate: 1 / usdPerEur, source: 'frankfurter-ecb' };
}

async function getOpenER() {
  const r = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!r.ok) throw new Error('open.er-api failed');
  const d = await r.json();
  const eurPerUsd = d?.rates?.EUR;
  if (!eurPerUsd || eurPerUsd < 0.7 || eurPerUsd > 1.2) throw new Error('Bad open.er-api rate');
  return { rate: eurPerUsd, source: 'open-exchange-rate' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  try { await checkBandUSDC(); }
  catch (e) { console.log('Band check (non-fatal):', e.message); }

  for (const fn of [getFrankfurter, getOpenER]) {
    try {
      const { rate, source } = await fn();
      return res.json({
        success: true, rate, rateInverse: 1 / rate,
        source, timestamp: Date.now(),
      });
    } catch (e) {
      console.log(fn.name, 'failed:', e.message);
    }
  }

  return res.json({
    success: false, rate: 0.9258, rateInverse: 1.0801,
    source: 'fallback', timestamp: Date.now(),
  });
}
