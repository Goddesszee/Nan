// api/ngn-disburse.js
// Converts a user's NGN ledger balance to real USDC on Arc Testnet.
//
// Flow:
//   1. Validate request (wallet address, NGN amount, FX rate)
//   2. Check ledger balance via ngn-ledger.js (getBalance action)
//   3. Calculate USDC amount at current live FX rate
//   4. Send USDC from NAN treasury wallet to user's wallet on-chain
//   5. Debit the user's NGN ledger balance (debit action)
//   6. Return tx hash + amounts
//
// The treasury wallet is X402_SELLER_PRIVATE_KEY — already on Railway,
// already the same wallet used for x402 revenue and gateway withdrawals.
// USDC contract on Arc Testnet: 0x3600000000000000000000000000000000000000

import { ethers } from 'ethers';

const ARC_RPC       = 'https://rpc.arc.testnet.circle.com';
const USDC_ADDR     = '0x3600000000000000000000000000000000000000';
const USDC_DECIMALS = 6;
const LEDGER_URL    = 'https://nan-production.up.railway.app/api/ngn-ledger';
const NGN_RATE_URL  = 'https://nan-production.up.railway.app/api/x402-ngn-rate';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];

// Rate cache — refreshed if more than 5 minutes stale
let _rateCache = null;
async function getLiveNgnRate() {
  if (_rateCache && Date.now() - _rateCache.ts < 5 * 60 * 1000) return _rateCache.rate;
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=NGN');
    const d = await r.json();
    const rate = d?.rates?.NGN;
    if (rate) { _rateCache = { rate, ts: Date.now() }; return rate; }
  } catch (e) { /* fall through */ }
  return 1650; // fallback matching x402-ngn-rate.js
}

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(addr);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { walletAddress, ngnAmount } = req.body || {};

  if (!isValidAddress(walletAddress)) return res.json({ success: false, error: 'Invalid wallet address' });
  const ngnAmt = parseFloat(ngnAmount);
  if (!ngnAmt || ngnAmt <= 0 || ngnAmt > 10_000_000) {
    return res.json({ success: false, error: 'Invalid NGN amount' });
  }

  const privateKey = process.env.X402_SELLER_PRIVATE_KEY;
  if (!privateKey) return res.json({ success: false, error: 'Treasury wallet not configured' });

  try {
    const addr = walletAddress.toLowerCase();

    // 1. Check ledger balance
    const balRes = await fetch(LEDGER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getBalance', walletAddress: addr }),
    });
    const balData = await balRes.json();
    if (!balData.success) return res.json({ success: false, error: 'Could not fetch NGN balance' });
    if ((balData.balance || 0) < ngnAmt) {
      return res.json({
        success: false,
        error: `Insufficient NGN balance — you have ₦${(balData.balance || 0).toLocaleString()}, need ₦${ngnAmt.toLocaleString()}`,
        available: balData.balance || 0,
      });
    }

    // 2. Calculate USDC amount at live FX rate
    const rate = await getLiveNgnRate();
    const usdcAmount = ngnAmt / rate;
    const usdcAtomicStr = ethers.parseUnits(usdcAmount.toFixed(USDC_DECIMALS), USDC_DECIMALS).toString();

    // 3. Check treasury has enough USDC
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet   = new ethers.Wallet(privateKey.trim(), provider);
    const usdc     = new ethers.Contract(USDC_ADDR, ERC20_ABI, wallet);
    const treasuryBal = await usdc.balanceOf(wallet.address);
    const usdcAtomic  = ethers.parseUnits(usdcAmount.toFixed(USDC_DECIMALS), USDC_DECIMALS);

    if (treasuryBal < usdcAtomic) {
      return res.json({
        success: false,
        error: `Treasury has insufficient USDC — contact support`,
        treasuryBalance: ethers.formatUnits(treasuryBal, USDC_DECIMALS),
      });
    }

    // 4. Send USDC to user's wallet
    const tx = await usdc.transfer(walletAddress, usdcAtomic, { gasLimit: 200_000 });
    await tx.wait(1);

    // 5. Debit the NGN ledger (do this AFTER tx confirms so we never debit
    //    on a failed tx — user keeps their NGN if USDC transfer fails)
    const debitRes = await fetch(LEDGER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'debit', walletAddress: addr, amount: ngnAmt }),
    });
    const debitData = await debitRes.json();
    if (!debitData.success) {
      // USDC was sent but ledger debit failed — log loudly, don't reverse
      // the USDC (user would lose it), just flag for manual reconciliation.
      console.error('[ngn-disburse] CRITICAL: USDC sent but ledger debit failed!', {
        walletAddress, ngnAmt, txHash: tx.hash, error: debitData.error
      });
    }

    console.log(`[ngn-disburse] ₦${ngnAmt} → ${usdcAmount.toFixed(4)} USDC → ${walletAddress} | tx: ${tx.hash}`);

    return res.json({
      success: true,
      txHash:     tx.hash,
      ngnAmount:  ngnAmt,
      usdcAmount: parseFloat(usdcAmount.toFixed(6)),
      rate,
      newNgnBalance: debitData.balance ?? (balData.balance - ngnAmt),
    });

  } catch (err) {
    console.error('[ngn-disburse]', err.message);
    return res.json({ success: false, error: err.message.slice(0, 200) });
  }
}
