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

    // Per Circle Gateway docs: use approve + deposit() on the Gateway contract
    // NOT a plain transfer — transfer() doesn't register with the Gateway
    // Gateway contract: 0x0077777d7EBA4688BDeF3E311b846F25870A19B9
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

    // Step 2: Call deposit() on Gateway contract
    // deposit(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient)
    // For Arc testnet domain = 26, mintRecipient = walletAddress padded to 32 bytes
    const recipientPadded = '0x' + walletAddress.replace('0x','').toLowerCase().padStart(64,'0');
    const txRes = await client.createContractExecutionTransaction({
      walletId, blockchain,
      contractAddress: GATEWAY_CONTRACT,
      abiFunctionSignature: 'depositForBurn(uint256,uint32,bytes32,address)',
      abiParameters: [amtAtomic, '26', recipientPadded, USDC],
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
