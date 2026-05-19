// api/gateway-deposit.js
// Circle Gateway — Deposit USDC into unified balance
// Docs: https://www.circle.com/blog/a-practical-guide-to-building-with-circle-gateway
//
// Gateway requires TWO steps per Circle docs:
//   Step 1: approve(GatewayWallet, amount) on USDC contract
//   Step 2: deposit(USDCAddress, amount) on GatewayWallet contract
//
// Verified contract addresses (docs.arc.io/arc/references/contract-addresses):
//   GatewayWallet : 0x0077777d7EBA4688BDeF3E311b846F25870A19B9
//   GatewayMinter : 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B
//   USDC          : 0x3600000000000000000000000000000000000000

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'crypto';

const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const USDC_ADDRESS   = '0x3600000000000000000000000000000000000000';

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey:       process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

function validWalletId(id) { return typeof id === 'string' && id.length > 10; }
function validAmount(a)    { const n = parseFloat(a); return !isNaN(n) && n >= 1 && n <= 10_000; }

// Poll for transaction completion
async function waitForTx(client, txId, maxAttempts = 15) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const { data } = await client.getTransaction({ id: txId });
    const state = data?.transaction?.state;
    if (state === 'COMPLETE' || state === 'CONFIRMED') return data.transaction;
    if (state === 'FAILED' || state === 'CANCELLED') throw new Error(`Transaction ${state}`);
  }
  throw new Error('Transaction timed out');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { walletId, amount } = req.body;

  if (!validWalletId(walletId)) return res.status(400).json({ error: 'Invalid walletId' });
  if (!validAmount(amount))     return res.status(400).json({ error: 'Invalid amount — minimum 1 USDC' });

  const client = getClient();
  // Convert USDC to 6 decimal atomic units per Circle docs
  const amountAtomic = Math.round(parseFloat(amount) * 1_000_000).toString();

  try {
    // ── Step 1: Approve Gateway contract to spend USDC ────────────────────
    const approveTx = await client.createContractExecutionTransaction({
      walletId,
      contractAddress:      USDC_ADDRESS,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters:        [GATEWAY_WALLET, amountAtomic],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
      blockchain: 'ARC-TESTNET',
    });

    const approveId = approveTx.data?.id;
    if (!approveId) throw new Error('Approve transaction failed to create');

    // Wait for approval to confirm before depositing
    await waitForTx(client, approveId);

    // ── Step 2: Deposit USDC into Gateway ─────────────────────────────────
    const depositTx = await client.createContractExecutionTransaction({
      walletId,
      contractAddress:      GATEWAY_WALLET,
      abiFunctionSignature: 'deposit(address,uint256)',
      abiParameters:        [USDC_ADDRESS, amountAtomic],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
      blockchain: 'ARC-TESTNET',
    });

    const depositId = depositTx.data?.id;
    if (!depositId) throw new Error('Deposit transaction failed to create');

    // Return immediately — let client poll for deposit confirmation
    const depositState = depositTx.data?.transaction?.state;
    const depositHash  = depositTx.data?.transaction?.txHash || null;

    return res.json({
      success:       true,
      approveId,
      depositId,
      txHash:        depositHash,
      pending:       depositState !== 'COMPLETE',
      amount,
      gatewayWallet: GATEWAY_WALLET,
      message:       `Depositing ${amount} USDC into Circle Gateway — poll /api/transaction/${depositId} for status`,
    });

  } catch (err) {
    console.error('Gateway deposit error:', err.message);
    return res.status(500).json({
      error: 'Gateway deposit failed — ' + err.message.slice(0, 120),
    });
  }
}
