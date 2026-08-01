// api/activity-feed.js — NAN live activity feed
//
// Polls Arc Testnet for new blocks and decodes transactions sent to NAN's
// contracts into a human-readable feed, similar to a block-explorer "recent
// activity" view but scoped to NAN's own contracts.
//
// v1 covers Swaps and Arc Name claims — the two event types we can decode
// reliably using function signatures already known client-side, without
// depending on unverified custom event ABIs for the other contracts
// (NANLendingPool, Marketplace, Gigs). Those can be added once their exact
// event signatures are confirmed (e.g. via a verified contract on ArcScan).
//
// Runs as a long-lived poller (this file's top-level code only executes once
// — Node caches the ES module after the first `import()` from _server/index.js
// — so setInterval below keeps running for the life of the process, same
// pattern as the in-memory cache in api/analytics.js).

import { ethers } from 'ethers';

const RPC           = 'https://rpc.testnet.arc.io';
const SWAP_CONTRACT = '0x5cE359b74BE53b1B370641571cBef157dD575c79'; // NANSwap
const NAME_REGISTRY = '0x043D072B12CBe488DBA3d2975c42Db3055F2836f'; // NANNameRegistry
const USDC          = '0x3600000000000000000000000000000000000000';
const EURC          = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

const TOKEN_META = {
  [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
  [EURC.toLowerCase()]: { symbol: 'EURC', decimals: 6 },
};

const SWAP_IFACE = new ethers.Interface([
  'function swapUSDCtoEURC(uint256) external returns (uint256)',
  'function swapEURCtoUSDC(uint256) external returns (uint256)',
]);
const NAME_IFACE = new ethers.Interface([
  'function register(string,uint8) external',
]);

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

const MAX_FEED = 200;
const BLOCKS_PER_TICK = 200;   // cap how many blocks one poll pass will scan
const FIRST_RUN_LOOKBACK = 500; // don't scan full genesis on first boot — just recent history

let feed = [];             // newest-first
let lastScannedBlock = -1;
let isScanning = false;
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

function pushEvent(ev) {
  feed.unshift(ev);
  if (feed.length > MAX_FEED) feed.length = MAX_FEED;
}

function decodeSwapTx(tx, receipt, blockTimestamp) {
  let parsed;
  try { parsed = SWAP_IFACE.parseTransaction({ data: tx.input, value: tx.value || '0x0' }); }
  catch { return null; }
  if (!parsed) return null;

  // Pull both legs of the swap straight from the standard ERC20 Transfer
  // logs in the receipt — reliable regardless of the pool's own custom
  // event structure, since Transfer is a fixed, well-known signature.
  const transfers = (receipt.logs || [])
    .filter(l => l.topics?.[0] === TRANSFER_TOPIC && TOKEN_META[l.address.toLowerCase()])
    .map(l => {
      const meta = TOKEN_META[l.address.toLowerCase()];
      const amount = Number(BigInt(l.data)) / 10 ** meta.decimals;
      return { token: meta.symbol, amount };
    });
  if (transfers.length < 2) return null;

  return {
    type: 'swap',
    actor: tx.from,
    legIn: transfers[0],
    legOut: transfers[transfers.length - 1],
    txHash: tx.hash,
    timestamp: blockTimestamp,
  };
}

function decodeNameTx(tx, blockTimestamp) {
  let parsed;
  try { parsed = NAME_IFACE.parseTransaction({ data: tx.input }); }
  catch { return null; }
  if (!parsed || parsed.name !== 'register') return null;
  return {
    type: 'arcname',
    actor: tx.from,
    name: parsed.args[0] + '.arc',
    years: Number(parsed.args[1]),
    txHash: tx.hash,
    timestamp: blockTimestamp,
  };
}

async function scanBlock(blockNum) {
  const block = await rpcCall('eth_getBlockByNumber', ['0x' + blockNum.toString(16), true]);
  if (!block || !block.transactions) return;
  const ts = parseInt(block.timestamp, 16) * 1000;

  for (const tx of block.transactions) {
    if (!tx.to) continue;
    const to = tx.to.toLowerCase();

    if (to === SWAP_CONTRACT.toLowerCase()) {
      try {
        const receipt = await rpcCall('eth_getTransactionReceipt', [tx.hash]);
        if (receipt && receipt.status === '0x1') {
          const ev = decodeSwapTx(tx, receipt, ts);
          if (ev) pushEvent(ev);
        }
      } catch { /* skip this tx, keep scanning */ }
    } else if (to === NAME_REGISTRY.toLowerCase()) {
      const ev = decodeNameTx(tx, ts);
      if (ev) pushEvent(ev);
    }
  }
}

async function runScan() {
  if (isScanning) return;
  isScanning = true;
  try {
    const latestHex = await rpcCall('eth_blockNumber');
    const latest = parseInt(latestHex, 16);
    const from = lastScannedBlock === -1
      ? Math.max(0, latest - FIRST_RUN_LOOKBACK)
      : lastScannedBlock + 1;
    const to = Math.min(latest, from + BLOCKS_PER_TICK);

    for (let b = from; b <= to; b++) {
      await scanBlock(b);
    }
    lastScannedBlock = to;
    lastError = null;
  } catch (e) {
    lastError = e.message;
    console.error('[activity-feed] scan error:', e.message);
  } finally {
    isScanning = false;
  }
}

// Poll continuously — every 15s, catching up a bounded number of blocks per pass
setInterval(() => { runScan().catch(() => {}); }, 15000);
runScan().catch(() => {}); // kick off immediately when the module first loads

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query?.type;
  const limit = Math.min(parseInt(req.query?.limit) || 30, MAX_FEED);

  let items = feed;
  if (type && type !== 'all') items = items.filter(e => e.type === type);

  res.json({
    items: items.slice(0, limit),
    total: feed.length,
    scannedThroughBlock: lastScannedBlock,
    scanning: isScanning,
    lastError,
  });
}
