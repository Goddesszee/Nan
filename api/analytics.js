// api/analytics.js — NAN on-chain analytics
// Queries Arc Testnet RPC server-side (no CORS issues)
//
// USDC transfer scan now covers the ENTIRE chain history (block 0 → latest),
// not just a recent window. A full scan from genesis is expensive, so:
//   - results are cached in-memory and persist for the life of the process
//     (Railway is a long-running server, not serverless, so this survives
//     between requests)
//   - on each refresh we only scan NEW blocks since the last scan and add
//     them to the running totals, instead of re-scanning from block 0 again
//   - if a request arrives while the very first full scan is still running,
//     it gets the last good cache (or a "scanning" flag) instead of timing out

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

const REFRESH_INTERVAL = 10 * 60 * 1000; // re-check for new blocks every 10 min

// Running state — persists across requests on Railway's long-lived process
let cache = null;          // last full response sent to clients
let lastScannedBlock = -1; // highest block number we've already scanned for USDC transfers
let bridgeCount = 0;       // running lifetime total of bridge (transfer-to-zero) events
let recentMap = new Map(); // wallet -> last-seen block, built incrementally
let isScanning = false;    // true while a scan (full or incremental) is in flight
let lastError = null;

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
    } catch (e) { /* skip this chunk, keep going */ }
  }
  return logs;
}

const nanContracts = new Set([SWAP, LEND, NAME, PAYREQ, HIST, USDC, EURC].map(x => x.toLowerCase()));

// Folds a batch of USDC Transfer logs into the running bridge count + recent-wallet map.
// Safe to call repeatedly with non-overlapping block ranges.
function foldUsdcLogs(logs) {
  logs.forEach(log => {
    if (!log.topics || log.topics.length < 3) return;
    const f = '0x' + log.topics[1].slice(-40);
    const t = '0x' + log.topics[2].slice(-40);
    if (t.toLowerCase() === ZERO) bridgeCount++;
    const fl = f.toLowerCase();
    if (fl !== ZERO && !nanContracts.has(fl)) {
      const bn = parseInt(log.blockNumber, 16);
      if (!recentMap.has(fl) || recentMap.get(fl) < bn) recentMap.set(fl, bn);
    }
  });
}

// Runs the (possibly long) full-or-incremental scan and rebuilds `cache`.
// Only one of these should run at a time — guarded by isScanning.
async function runScan() {
  if (isScanning) return;
  isScanning = true;
  try {
    const blockHex = await rpcCall('eth_blockNumber');
    const latest = parseInt(blockHex, 16);

    const supHex = await rpcCall('eth_call', [{ to: USDC, data: '0x18160ddd' }, 'latest']);
    const usdcSupply = (parseInt(supHex, 16) / 1e6).toFixed(0);

    // NAN contract events — always full history, cheap (low log volume)
    const [hL, sL, lL, nL, pL] = await Promise.all([
      getLogs(HIST, null, 0, latest),
      getLogs(SWAP, null, 0, latest),
      getLogs(LEND, null, 0, latest),
      getLogs(NAME, null, 0, latest),
      getLogs(PAYREQ, null, 0, latest),
    ]);

    // USDC transfers — scan only the gap since the last scan.
    // First-ever run: lastScannedBlock is -1, so this scans from genesis (block 0).
    const scanFrom = lastScannedBlock + 1;
    if (scanFrom <= latest) {
      const newLogs = await getLogs(USDC, [TRANSFER], scanFrom, latest);
      foldUsdcLogs(newLogs);
      lastScannedBlock = latest;
    }

    const wallets = new Set();
    [...hL, ...sL, ...lL, ...nL, ...pL].forEach(log => {
      if (log.topics && log.topics.length >= 2) {
        const addr = '0x' + log.topics[1].slice(-40);
        const al = addr.toLowerCase();
        if (al !== ZERO && !nanContracts.has(al)) wallets.add(al);
      }
    });

    const recentWallets = [...recentMap.entries()]
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
      bridges: bridgeCount,          // lifetime total, since block 0
      arcNames: nL.length,
      payRequests: pL.length,
      recentWallets,
      scannedThroughBlock: lastScannedBlock,
      timestamp: new Date().toISOString()
    };
    lastError = null;
  } catch (err) {
    lastError = err.message;
    throw err;
  } finally {
    isScanning = false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cacheAge = cache ? Date.now() - new Date(cache.timestamp).getTime() : Infinity;

  // Fresh cache available — serve it immediately, no rescan needed
  if (cache && cacheAge < REFRESH_INTERVAL) {
    return res.json({ ...cache, cached: true });
  }

  // No cache yet (first request ever) — must wait for the scan, however long it takes.
  if (!cache) {
    try {
      await runScan();
      return res.json({ ...cache, cached: false });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Cache exists but is stale — kick off a background incremental rescan
  // (don't await it) and serve the last good cache immediately so the
  // admin page never hangs waiting on a multi-block scan.
  if (!isScanning) {
    runScan().catch(e => console.error('[analytics] background scan failed:', e.message));
  }
  return res.json({ ...cache, cached: true, refreshing: isScanning });
}
