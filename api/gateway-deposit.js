// api/gateway-deposit.js — Circle Gateway deposit for Circle wallet users
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { walletId, walletAddress, amount } = req.body || {};

  if (!walletId || !walletAddress || !amount || parseFloat(amount) <= 0)
    return res.json({ success: false, error: 'walletId, walletAddress and amount required' });

  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
    return res.json({ success: true, transactionId: 'dev-gw-' + crypto.randomUUID(), dev: true });

  try {
    // Use DCW directly — no App Kit adapter needed for a simple transfer
    const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
    const client = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    });

    const amtParsed = parseFloat(amount).toFixed(6);
    const amtAtomic = Math.floor(parseFloat(amtParsed) * 1_000_000).toString();

    const USDC = '0x3600000000000000000000000000000000000000';

    // GatewayWallet contract on Arc Testnet (domain 26) — verified against
    // https://developers.circle.com/gateway/references/contract-addresses
    const GATEWAY_CONTRACT = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
    const blockchain = process.env.CIRCLE_BLOCKCHAIN || 'ARC-TESTNET';

    // Step 1: Approve Gateway to spend USDC
    const appRes = await client.createContractExecutionTransaction({
      walletId, blockchain,
      contractAddress: USDC,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [GATEWAY_CONTRACT, '115792089237316195423570985008687907853269984665640564039457584007913129639935'],
      idempotencyKey: crypto.randomUUID(),
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    const approveTxId = appRes.data?.id;
    if (!approveTxId) throw new Error('Approve failed: ' + JSON.stringify(appRes.data));

    // Small wait for Arc to confirm approve
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Call deposit() on the GatewayWallet contract.
    // Per Circle's Gateway Contract Interfaces docs, the actual signature is
    // deposit(address token, uint256 value) — a plain deposit that credits
    // the resulting balance to the caller (walletAddress). This previously
    // called depositForBurn(uint256,uint32,bytes32,address), which is CCTP's
    // TokenMessenger signature, not a function that exists on GatewayWallet —
    // that call would have reverted every time.
    const txRes = await client.createContractExecutionTransaction({
      walletId, blockchain,
      contractAddress: GATEWAY_CONTRACT,
      abiFunctionSignature: 'deposit(address,uint256)',
      abiParameters: [USDC, amtAtomic],
      idempotencyKey: crypto.randomUUID(),
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    const txId = txRes.data?.id;
    if (!txId) throw new Error('Deposit failed: ' + JSON.stringify(txRes.data));

    return res.json({
      success: true,
      transactionId: txId,
      approveTxId,
      note: 'Gateway balance updates in up to 20 minutes per Circle docs',
    });

  } catch (err) {
    console.error('[gateway-deposit]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
