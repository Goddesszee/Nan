// api/appkit-send.js
// Send USDC or EURC using Circle App Kit — kit.send()
// Per Circle SDK docs: kit.send({ from: { adapter, chain, address }, to: '0x...', amount, token })
// Returns: BridgeStep { txHash, state, explorerUrl }
//
// Replaces the raw createTransaction() path in circle-wallets.js for Circle wallet users.

import crypto from 'crypto';

const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN || 'Arc_Testnet';

// Token contract addresses on Arc Testnet
const TOKEN_ADDRESSES = {
  USDC: process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
  EURC: process.env.EURC_ADDRESS || '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
};

function getAppKit() {
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');

  const { AppKit } = await import('@circle-fin/app-kit');
  const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');
  const adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  const kit     = new AppKit();
  return { kit, adapter };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { walletAddress, destinationAddress, amount, tokenSymbol } = req.body || {};

  // Validate inputs
  if (!walletAddress || !destinationAddress || !amount)
    return res.json({ success: false, error: 'walletAddress, destinationAddress, and amount are required' });

  if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress))
    return res.json({ success: false, error: 'Invalid destination address' });

  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
    return res.json({ success: false, error: 'Invalid amount' });

  const token = (tokenSymbol || 'USDC').toUpperCase();
  if (!TOKEN_ADDRESSES[token])
    return res.json({ success: false, error: 'Unsupported token. Use USDC or EURC' });

  // Dev mode — no credentials
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    return res.json({
      success: true,
      txHash:  '0xdev_send_' + crypto.randomBytes(16).toString('hex'),
      state:   'success',
      dev:     true,
    });
  }

  try {
    const { kit, adapter } = getAppKit();

    // kit.send() per Circle SDK docs:
    // from: { adapter, chain, address }  — address required for developer-controlled wallets
    // to:   recipient address string
    // amount: human-readable decimal string e.g. '5.00'
    // token: 'USDC' | 'EURC' | token contract address
    const result = await kit.send({
      from: {
        adapter,
        chain:   BLOCKCHAIN,
        address: walletAddress,  // required for developer-controlled wallets
      },
      to:     destinationAddress,
      amount: parsed.toString(),
      token:  TOKEN_ADDRESSES[token],  // pass contract address for EURC support
    });

    // result is a BridgeStep: { txHash, state, explorerUrl, name, ... }
    return res.json({
      success:     result.state === 'success' || result.state === 'pending',
      txHash:      result.txHash   || null,
      state:       result.state,
      explorerUrl: result.explorerUrl || null,
      pending:     result.state === 'pending',
    });

  } catch (err) {
    console.error('[appkit-send]', err.message);
    return res.json({ success: false, error: err.message.slice(0, 150) });
  }
}
