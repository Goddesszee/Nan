import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { action, walletId, destinationAddress, amount, tokenSymbol } = req.body;

  if (action === 'transfer') {
    if (!walletId || !destinationAddress || !amount) {
      return res.json({ success: false, error: 'Missing fields' });
    }
    try {
      const client = getClient();
      const walletData = await client.getWallet({ id: walletId });
      const walletAddress = walletData.data?.wallet?.address;
      const tokenAddress = tokenSymbol === 'EURC'
        ? '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
        : '0x3600000000000000000000000000000000000000';

      const tx = await client.createTransaction({
        blockchain: 'ARC-TESTNET',
        walletAddress,
        destinationAddress,
        amount: [amount.toString()],
        tokenAddress,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      const txId = tx.data?.id;
      if (!txId) throw new Error('No transaction ID returned');

      let state = tx.data?.state;
      let txHash = null;
      for (let i = 0; i < 30 && !['COMPLETE','FAILED','CANCELLED','DENIED'].includes(state); i++) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await client.getTransaction({ id: txId });
        state = poll.data?.transaction?.state;
        txHash = poll.data?.transaction?.txHash || null;
      }
      if (state !== 'COMPLETE') throw new Error('Transaction ended in state: ' + state);
      return res.json({ success: true, txHash, transactionId: txId });
    } catch (err) {
      console.error('Transfer error:', err.message);
      return res.json({ success: false, error: err.message });
    }
  }

  res.json({ success: false, error: 'Unknown action' });
}