// api/appkit/send.js
const APPKIT_CHAIN = 'Arc_Testnet';
const APPKIT_USDC  = process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000';
const APPKIT_EURC  = process.env.EURC_ADDRESS || '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

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

  const { walletAddress, destinationAddress, amount, tokenSymbol } = req.body || {};
  const token = (tokenSymbol || 'USDC').toUpperCase();
  const parsed = parseFloat(amount);
  const TOKEN_ADDRESSES = { USDC: APPKIT_USDC, EURC: APPKIT_EURC };

  if (!walletAddress || !destinationAddress || !parsed || parsed <= 0)
    return res.json({ success: false, error: 'walletAddress, destinationAddress, amount required' });
  if (!TOKEN_ADDRESSES[token])
    return res.json({ success: false, error: 'Unsupported token. Use USDC or EURC' });
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
    return res.json({ success: true, txHash: '0xdev_send_' + Date.now(), state: 'success', dev: true });

  try {
    const { kit, adapter } = await getAppKit();
    const result = await kit.send({
      from: { adapter, chain: APPKIT_CHAIN, address: walletAddress },
      to: destinationAddress,
      amount: parsed.toString(),
      token: TOKEN_ADDRESSES[token],
    });
    res.json({ success: true, txHash: result.txHash || null, state: result.state, explorerUrl: result.explorerUrl || null });
  } catch (err) {
    console.error('[appkit/send]', err.message);
    res.json({ success: false, error: err.message.slice(0, 150) });
  }
}
