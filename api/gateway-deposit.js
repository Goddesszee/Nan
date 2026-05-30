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

    // Gateway deposit = approve + transfer to Circle Gateway address
    const GATEWAY = '0x5625Df77D7d69D2a50c8ADe0d7ce5d4B84B08f49';
    const USDC    = '0x3600000000000000000000000000000000000000';

    // Step 1: Approve
    const appRes = await client.createContractExecutionTransaction({
      walletId,
      blockchain: process.env.CIRCLE_BLOCKCHAIN || 'ARC-TESTNET',
      contractAddress: USDC,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [GATEWAY, '115792089237316195423570985008687907853269984665640564039457584007913129639935'],
      idempotencyKey: crypto.randomUUID(),
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });

    const approveTxId = appRes.data?.id;
    if (!approveTxId) throw new Error('Approve failed: ' + JSON.stringify(appRes.data));

    // Step 2: Transfer to gateway (fire without waiting — Arc confirms in <1s)
    const txRes = await client.createContractExecutionTransaction({
      walletId,
      blockchain: process.env.CIRCLE_BLOCKCHAIN || 'ARC-TESTNET',
      contractAddress: USDC,
      abiFunctionSignature: 'transfer(address,uint256)',
      abiParameters: [GATEWAY, amtAtomic],
      idempotencyKey: crypto.randomUUID(),
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });

    const txId = txRes.data?.id;
    if (!txId) throw new Error('Transfer failed: ' + JSON.stringify(txRes.data));

    return res.json({ success: true, transactionId: txId, approveTxId });

  } catch (err) {
    console.error('[gateway-deposit]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
