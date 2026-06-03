// api/appkit/bridge.js
const APPKIT_CHAIN = 'Arc_Testnet';
const BRIDGE_CHAIN_MAP = {
  'ETH-SEPOLIA':  'Ethereum_Sepolia',
  'AVAX-FUJI':    'Avalanche_Fuji',
  'BASE-SEPOLIA': 'Base_Sepolia',
  'ARB-SEPOLIA':  'Arbitrum_Sepolia',
  'OP-SEPOLIA':   'Optimism_Sepolia',
  'POLYGON-AMOY': 'Polygon_Amoy_Testnet',
};

async function getAppKit() {
  const { AppKit } = await import('@circle-fin/app-kit');
  const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  return { kit: new AppKit(), adapter };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { walletAddress, destChain, destAddr, amount } = req.body || {};
  const parsed = parseFloat(amount);
  const destChainName = BRIDGE_CHAIN_MAP[destChain];

  if (!walletAddress || !destChain || !destAddr || !parsed || parsed <= 0)
    return res.json({ success: false, error: 'walletAddress, destChain, destAddr, amount required' });
  if (!destChainName)
    return res.json({ success: false, error: 'Unsupported chain: ' + destChain });
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
    return res.json({ success: true, state: 'success', burnTxHash: '0xdev_burn_' + Date.now(), dev: true });

  try {
    const { kit, adapter } = await getAppKit();
    res.json({ success: true, pending: true, state: 'pending', message: 'Bridge submitted via CCTP' });
    kit.bridge({
      from: { adapter, chain: APPKIT_CHAIN, address: walletAddress },
      to: { recipientAddress: destAddr || walletAddress, chain: destChainName, useForwarder: true },
      amount: parsed.toFixed(2),
      token: 'USDC',
    }).then(r => console.log('[bridge] complete:', r.state))
      .catch(e => console.error('[bridge] error:', e.message));
  } catch (err) {
    console.error('[appkit/bridge]', err.message);
    if (!res.headersSent) res.json({ success: false, error: err.message.slice(0, 200) });
  }
}
