// api/appkit-bridge.js
// Circle App Kit bridge — kit.bridge() using CCTP V2
// Per Circle SDK docs:
//   kit.bridge({ from: { adapter, chain, address }, to: { adapter, chain, address }, amount, token })
//   Returns BridgeResult: { state, steps[], token, amount }
//   Each step has: { name, state, txHash, explorerUrl }
//
// Circle handles approve → burn → attestation → mint automatically.
// Arc Testnet is a supported source chain (Blockchain.Arc_Testnet).
//
// Chain name mapping: your app uses 'ETH-SEPOLIA', SDK expects 'Ethereum_Sepolia'

import crypto from 'crypto';

// Map from your app's chain IDs → Circle SDK Blockchain enum strings
// Per SDK docs Blockchain enum: Ethereum_Sepolia, Avalanche_Fuji, Base_Sepolia, etc.
const CHAIN_MAP = {
  'ETH-SEPOLIA':  'Ethereum_Sepolia',
  'AVAX-FUJI':    'Avalanche_Fuji',
  'BASE-SEPOLIA': 'Base_Sepolia',
  'ARB-SEPOLIA':  'Arbitrum_Sepolia',
  'OP-SEPOLIA':   'Optimism_Sepolia',
  'POLYGON-AMOY': 'Polygon_Amoy_Testnet',
};

const SOURCE_CHAIN = process.env.CIRCLE_BLOCKCHAIN || 'Arc_Testnet';

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

  const { action, walletAddress, destChain, destAddr, amount } = req.body || {};

  // ── Estimate ──────────────────────────────────────────────────────────────
  if (action === 'estimate') {
    if (!walletAddress || !destChain || !destAddr || !amount)
      return res.json({ success: false, error: 'walletAddress, destChain, destAddr, amount required' });

    const destChainName = CHAIN_MAP[destChain];
    if (!destChainName)
      return res.json({ success: false, error: 'Unsupported chain: ' + destChain });

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });

    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      return res.json({ success: true, fees: [], gasFees: [], dev: true });
    }

    try {
      const { kit, adapter } = getAppKit();

      // estimateBridge returns EstimateResult: { fees, gasFees, amount, source, destination }
      const estimate = await kit.estimateBridge({
        from: {
          adapter,
          chain:   SOURCE_CHAIN,
          address: walletAddress,
        },
        to: {
          adapter,
          chain:   destChainName,
          address: destAddr,
        },
        amount: parsed.toFixed(2),
        token:  'USDC',
      });

      return res.json({
        success:  true,
        fees:     estimate.fees     || [],
        gasFees:  estimate.gasFees  || [],
        amount:   estimate.amount,
      });

    } catch (err) {
      console.error('[appkit-bridge estimate]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 150) });
    }
  }

  // ── Bridge ────────────────────────────────────────────────────────────────
  if (!action || action === 'bridge') {
    if (!walletAddress || !destChain || !destAddr || !amount)
      return res.json({ success: false, error: 'walletAddress, destChain, destAddr, amount required' });

    if (!/^0x[a-fA-F0-9]{40}$/.test(destAddr))
      return res.json({ success: false, error: 'Invalid destination address' });

    const destChainName = CHAIN_MAP[destChain];
    if (!destChainName)
      return res.json({ success: false, error: 'Unsupported chain: ' + destChain });

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount' });

    // Dev mode
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      return res.json({
        success:      true,
        state:        'success',
        burnTxHash:   '0xdev_bridge_burn_' + crypto.randomBytes(16).toString('hex'),
        mintTxHash:   '0xdev_bridge_mint_' + crypto.randomBytes(16).toString('hex'),
        steps:        [],
        dev:          true,
      });
    }

    try {
      const { kit, adapter } = getAppKit();

      // Listen to bridge steps for progress tracking
      const steps = [];
      kit.on('bridge.approve',     (p) => { steps.push({ name: 'approve',     ...p }); console.log('[bridge] approve:', p.values?.txHash); });
      kit.on('bridge.burn',        (p) => { steps.push({ name: 'burn',        ...p }); console.log('[bridge] burn:', p.values?.txHash); });
      kit.on('bridge.attestation', (p) => { steps.push({ name: 'attestation', ...p }); console.log('[bridge] attested'); });
      kit.on('bridge.mint',        (p) => { steps.push({ name: 'mint',        ...p }); console.log('[bridge] mint:', p.values?.txHash); });

      // kit.bridge() per Circle SDK docs:
      // - Handles approve → burn → attestation → mint automatically
      // - from.address is REQUIRED for developer-controlled wallets
      // - to.address is the recipient on the destination chain
      // - Returns BridgeResult: { state, steps[], amount, token, source, destination }
      const result = await kit.bridge({
        from: {
          adapter,
          chain:   SOURCE_CHAIN,
          address: walletAddress,   // source Circle wallet address on Arc Testnet
        },
        to: {
          adapter,
          chain:   destChainName,
          address: destAddr,        // destination address (can be same or different)
        },
        amount: parsed.toFixed(2),  // human-readable decimal string e.g. '5.00'
        token:  'USDC',
      });

      // Extract txHashes from steps
      const burnStep = result.steps?.find(s => s.name === 'burn'  || s.name?.includes('burn'));
      const mintStep = result.steps?.find(s => s.name === 'mint'  || s.name?.includes('mint'));

      return res.json({
        success:     result.state === 'success' || result.state === 'pending',
        state:       result.state,
        burnTxHash:  burnStep?.txHash  || null,
        mintTxHash:  mintStep?.txHash  || null,
        explorerUrl: burnStep?.explorerUrl || null,
        steps:       result.steps?.map(s => ({
          name:        s.name,
          state:       s.state,
          txHash:      s.txHash      || null,
          explorerUrl: s.explorerUrl || null,
        })) || [],
        amount:      result.amount,
        destChain,
        destAddr,
      });

    } catch (err) {
      console.error('[appkit-bridge]', err.message);
      return res.json({ success: false, error: err.message.slice(0, 200) });
    }
  }

  return res.status(400).json({ error: 'Valid actions: bridge, estimate' });
}
