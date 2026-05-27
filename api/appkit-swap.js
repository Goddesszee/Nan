// api/appkit-swap.js — Circle App Kit swap (no liquidity management needed)
import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';

const kit = new AppKit();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, tokenIn, tokenOut, amountIn } = req.body;

  try {
    if (action === 'quote') {
      // Get a rate estimate without executing
      const estimate = await kit.swap({
        from: { 
          adapter: createCircleWalletsAdapter({
            apiKey: process.env.CIRCLE_API_KEY,
            entitySecret: process.env.CIRCLE_ENTITY_SECRET,
          }),
          chain: 'Arc_Testnet'
        },
        tokenIn: tokenIn || 'USDC',
        tokenOut: tokenOut || 'EURC',
        amountIn: amountIn || '1.00',
        config: { kitKey: process.env.KIT_KEY },
        dryRun: true, // estimate only, don't execute
      });
      return res.json({ success: true, quote: estimate });
    }

    if (action === 'swap') {
      if (!walletId) return res.status(400).json({ error: 'walletId required' });
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: 'tokenIn, tokenOut, amountIn required' });
      }

      const adapter = createCircleWalletsAdapter({
        apiKey: process.env.CIRCLE_API_KEY,
        entitySecret: process.env.CIRCLE_ENTITY_SECRET,
        walletId,
      });

      const result = await kit.swap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn,
        tokenOut,
        amountIn: parseFloat(amountIn).toFixed(6),
        config: { kitKey: process.env.KIT_KEY },
      });

      return res.json({
        success: true,
        txHash: result.txHash,
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        explorerUrl: result.explorerUrl,
        fees: result.fees,
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('AppKit swap error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Swap failed' });
  }
}
