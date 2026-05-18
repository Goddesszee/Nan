import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { action, walletId, destinationAddress, amount, tokenSymbol, email } = req.body;

  if (action === 'getWallet') {
    if (!email) return res.json({ success: false, error: 'Missing email' });
    if (!email.includes('@') || email.length > 100 || email.includes('<')) return res.json({ success: false, error: 'Invalid email' });
    try {
      const client = getClient();
      const walletSetName = 'nan-' + email.replace('@','_').replace(/\./g,'_');
      const sets = await client.listWalletSets({ pageSize: 50 });
      let walletSet = sets.data?.walletSets?.find(ws => ws.name === walletSetName);
      if (!walletSet) {
        const newSet = await client.createWalletSet({ name: walletSetName });
        walletSet = newSet.data?.walletSet;
      }
      const wallets = await client.listWallets({ walletSetId: walletSet.id, pageSize: 10 });
      let wallet = wallets.data?.wallets?.find(w => w.blockchain === 'ARC-TESTNET');
      if (!wallet) {
        const newWallet = await client.createWallets({
          walletSetId: walletSet.id,
          blockchains: ['ARC-TESTNET'],
          count: 1,
        });
        wallet = newWallet.data?.wallets?.[0];
      }
      return res.json({ success: true, wallet: { id: wallet.id, address: wallet.address } });
    } catch (err) {
      console.error('getWallet error:', err.message);
      return res.json({ success: false, error: 'Wallet error — please try again' });
    }
  }

  if (action === 'transfer') {
    if (!walletId || !destinationAddress || !amount) {
      return res.json({ success: false, error: 'Missing fields' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      return res.json({ success: false, error: 'Invalid destination address' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return res.json({ success: false, error: 'Invalid amount' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      return res.json({ success: false, error: 'Invalid destination address' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return res.json({ success: false, error: 'Invalid amount' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      return res.json({ success: false, error: 'Invalid destination address' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return res.json({ success: false, error: 'Invalid amount' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      return res.json({ success: false, error: 'Invalid destination address' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return res.json({ success: false, error: 'Invalid amount' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      return res.json({ success: false, error: 'Invalid destination address' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return res.json({ success: false, error: 'Invalid amount' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      return res.json({ success: false, error: 'Invalid destination address' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return res.json({ success: false, error: 'Invalid amount' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      return res.json({ success: false, error: 'Invalid destination address' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return res.json({ success: false, error: 'Invalid amount' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      return res.json({ success: false, error: 'Invalid destination address' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return res.json({ success: false, error: 'Invalid amount' });
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
      return res.json({ success: false, error: 'Transfer failed — please try again' });
    }
  }

  res.json({ success: false, error: 'Unknown action' });
}