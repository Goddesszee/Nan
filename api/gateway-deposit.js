// api/gateway-deposit.js
// Circle Gateway deposit — uses AppKit unifiedBalance for Circle wallet users
// Allows depositing USDC into Circle's unified balance (cross-chain gateway)

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { AppKit } from '@circle-fin/app-kit';
import crypto from 'crypto';

const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN || 'ARC-TESTNET';

function getAppKit() {
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret)
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');

  const walletsClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  const adapter       = createCircleWalletsAdapter({ walletsClient });
  return new AppKit({ adapter });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { walletId, amount } = req.body || {};

  if (!walletId || !amount || parseFloat(amount) <= 0)
    return res.json({ success: false, error: 'walletId and amount required' });

  // ── Dev mode ────────────────────────────────────────────────────────────────
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    return res.json({
      success:       true,
      transactionId: 'dev-gw-' + crypto.randomBytes(8).toString('hex'),
      dev:           true,
    });
  }

  try {
    const kit    = getAppKit();
    const result = await kit.send({
      walletId,
      toAddress:   process.env.CIRCLE_GATEWAY_ADDRESS || '0x5625Df77D7d69D2a50c8ADe0d7ce5d4B84B08f49',
      amount:      amount.toString(),
      tokenSymbol: 'USDC',
      blockchain:  BLOCKCHAIN,
    });

    return res.json({
      success:       true,
      transactionId: result.transactionId || result.id,
      txHash:        result.txHash || null,
      pending:       true,
    });

  } catch (err) {
    console.error('[gateway-deposit]', err.message);
    return res.json({ success: false, error: 'Gateway deposit failed: ' + err.message.slice(0, 120) });
  }
}
