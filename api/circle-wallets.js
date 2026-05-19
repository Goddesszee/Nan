// api/circle-wallets.js
// Circle Developer-Controlled Wallets — wallet creation + USDC/EURC transfer on Arc Testnet
// Docs: https://developers.circle.com/wallets/dev-controlled
// SDK:  @circle-fin/developer-controlled-wallets

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'crypto';

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey:       process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

// Stable, collision-safe wallet set name derived from email
// Uses SHA-256 of the email so two similar emails never produce the same name
// and the name stays under Circle's character limits
function walletSetName(email) {
  const hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
  return `nan-${hash}`;
}

// Paginate listWalletSets to find a set by name — handles >50 sets
async function findWalletSet(client, name) {
  let pageAfter;
  do {
    const res  = await client.listWalletSets({ pageSize: 50, pageAfter });
    const sets = res.data?.walletSets || [];
    const found = sets.find(ws => ws.name === name);
    if (found) return found;
    pageAfter = res.data?.pageCursor;
  } while (pageAfter);
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId, destinationAddress, amount, tokenSymbol, email } = req.body;

  // ── getWallet: create or retrieve the Arc wallet for this email ───────────
  if (action === 'getWallet') {
    if (!email || !email.includes('@') || email.length > 100 || email.includes('<'))
      return res.json({ success: false, error: 'Invalid email' });

    try {
      const client = getClient();
      const name   = walletSetName(email);

      let walletSet = await findWalletSet(client, name);
      if (!walletSet) {
        const newSet = await client.createWalletSet({
          name:            name,
          idempotencyKey:  crypto.randomUUID(),
        });
        walletSet = newSet.data?.walletSet;
      }
      if (!walletSet?.id) throw new Error('Could not create wallet set');

      const walletsRes = await client.listWallets({ walletSetId: walletSet.id, pageSize: 10 });
      let wallet = walletsRes.data?.wallets?.find(w => w.blockchain === 'ARC-TESTNET');

      if (!wallet) {
        const newWallet = await client.createWallets({
          walletSetId:    walletSet.id,
          blockchains:    ['ARC-TESTNET'],
          count:          1,
          idempotencyKey: crypto.randomUUID(),
        });
        wallet = newWallet.data?.wallets?.[0];
      }
      if (!wallet?.address) throw new Error('Could not create wallet');

      return res.json({ success: true, wallet: { id: wallet.id, address: wallet.address } });

    } catch (err) {
      console.error('getWallet error:', err.message);
      return res.json({ success: false, error: 'Wallet error — please try again' });
    }
  }

  // ── transfer: send USDC or EURC from a Circle wallet ─────────────────────
  if (action === 'transfer') {
    if (!walletId || !destinationAddress || !amount)
      return res.json({ success: false, error: 'Missing fields' });
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress))
      return res.json({ success: false, error: 'Invalid destination address' });

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10_000)
      return res.json({ success: false, error: 'Invalid amount (must be 0–10,000)' });

    const tokenAddress = tokenSymbol === 'EURC'
      ? '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'  // EURC on Arc Testnet
      : '0x3600000000000000000000000000000000000000'; // USDC on Arc Testnet

    try {
      const client = getClient();

      const tx = await client.createTransaction({
        idempotencyKey:     crypto.randomUUID(),
        blockchain:         'ARC-TESTNET',
        walletId,
        destinationAddress,
        amounts:            [parsed.toFixed(6)],
        tokenAddress,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const txId = tx.data?.transaction?.id;
      if (!txId) throw new Error('No transaction ID returned from Circle');

      // Return immediately with the txId — do NOT poll synchronously inside serverless
      // Polling blocks the function for up to 90s which exceeds Vercel's 10s limit
      // The frontend should poll GET /api/transaction/{txId} or use webhooks
      const initialState = tx.data?.transaction?.state;
      const initialHash  = tx.data?.transaction?.txHash || null;

      // If it completed instantly (rare but possible on Arc testnet) return the hash
      if (initialState === 'COMPLETE' || initialState === 'CONFIRMED') {
        return res.json({ success: true, txHash: initialHash, transactionId: txId });
      }

      // Return the txId so the client can poll
      return res.json({
        success:       true,
        pending:       true,
        transactionId: txId,
        txHash:        initialHash,
        message:       'Transaction submitted — poll /api/transaction/' + txId + ' for status',
      });

    } catch (err) {
      console.error('Transfer error:', err.message);
      return res.json({ success: false, error: 'Transfer failed — ' + err.message.slice(0, 120) });
    }
  }

  return res.json({ success: false, error: 'Unknown action' });
}
