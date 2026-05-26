// api/analytics.js — NAN on-chain analytics
// Queries Arc Testnet RPC server-side (no CORS issues)
// Caches results for 5 minutes to avoid re-scanning

const RPC    = 'https://rpc.testnet.arc.network';
const USDC   = '0x3600000000000000000000000000000000000000';
const SWAP   = '0x5cE359b74BE53b1B370641571cBef157dD575c79';
const LEND   = '0x4CC84BbEf992439Cb01FeF2E1150B37916d1f2ce';
const NAME   = '0x043D072B12CBe488DBA3d2975c42Db3055F2836f';
const PAYREQ = '0x1940232f42D4e2083785bC869FbAD8dd43133817';
const HIST   = '0xC64Fad1CFFDE16167d5887211066b47E1df48B4d';
const EURC   = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO   = '0x0000000000000000000000000000000000000000';

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function rpcCall(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return data.result;
}

async function getLogs(address, topics, fromBlock, toBlock) {
  const CHUNK = 10000;
  const logs = [];
  for (let f = fromBlock; f <= toBlock; f += CHUNK) {
    const t = Math.min(f + CHUNK - 1, toBlock);
    const filter = { fromBlock: '0x' + f.toString(16), toBlock: '0x' + t.toString(16), address };
    if (topics) filter.topics = topics;
    try {
      const r = await rpcCall('eth_getLogs', [filter]);
      if (Array.isArray(r)) logs.push(...r);
    } catch (e) { /* skip */ }
  }
  return logs;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Return cache if fresh
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return res.json({ ...cache, cached: true });
  }

  try {
    const blockHex = await rpcCall('eth_blockNumber');
    const latest = parseInt(blockHex, 16);

    // USDC supply
    const supHex = await rpcCall('eth_call', [{ to: USDC, data: '0x18160ddd' }, 'latest']);
    const usdcSupply = (parseInt(supHex, 16) / 1e6).toFixed(0);

    // Scan all NAN contracts from block 0
    const [hL, sL, lL, nL, pL] = await Promise.all([
      getLogs(HIST, null, 0, latest),
      getLogs(SWAP, null, 0, latest),
      getLogs(LEND, null, 0, latest),
      getLogs(NAME, null, 0, latest),
      getLogs(PAYREQ, null, 0, latest),
    ]);

    // USDC transfers — last 1M blocks only
    const uFrom = Math.max(0, latest - 1000000);
    const uL = await getLogs(USDC, [TRANSFER], uFrom, latest);

    // Count unique wallets
    const nanContracts = new Set([SWAP,LEND,NAME,PAYREQ,HIST,USDC,EURC].map(x=>x.toLowerCase()));
    const wallets = new Set();
    [...hL, ...sL, ...lL, ...nL, ...pL].forEach(log => {
      if (log.topics && log.topics.length >= 2) {
        const addr = '0x' + log.topics[1].slice(-40);
        const al = addr.toLowerCase();
        if (al !== ZERO && !nanContracts.has(al)) wallets.add(al);
      }
    });

    // Bridges + recent
    let bridges = 0;
    const recent = new Map();
    uL.forEach(log => {
      if (!log.topics || log.topics.length < 3) return;
      const f = '0x' + log.topics[1].slice(-40);
      const t = '0x' + log.topics[2].slice(-40);
      if (t.toLowerCase() === ZERO) bridges++;
      const fl = f.toLowerCase();
      if (fl !== ZERO && !nanContracts.has(fl)) {
        const bn = parseInt(log.blockNumber, 16);
        if (!recent.has(fl) || recent.get(fl) < bn) recent.set(fl, bn);
      }
    });

    const recentWallets = [...recent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([addr]) => addr);

    cache = {
      block: latest,
      usdcSupply,
      wallets: wallets.size,
      transactions: hL.length,
      swaps: sL.length,
      lends: lL.length,
      bridges,
      arcNames: nL.length,
      payRequests: pL.length,
      recentWallets,
      timestamp: new Date().toISOString()
    };
    cacheTime = Date.now();

    res.json(cache);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
