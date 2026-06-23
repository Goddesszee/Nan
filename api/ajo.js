// api/ajo.js — Ajo actions for Circle Developer-Controlled Wallet users
// MetaMask users sign directly; this endpoint handles Circle wallet users only.
import crypto from 'crypto';

const AJO_CONTRACT = '0xced87A492edF8AfE834b2730102C7d5A0cc56cA9';
const USDC_ADDR    = '0x3600000000000000000000000000000000000000';
const BLOCKCHAIN   = 'ARC-TESTNET';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, walletId } = req.body || {};
  if (!action || !walletId)
    return res.json({ success: false, error: 'action and walletId required' });

  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
    return res.json({ success: false, error: 'Circle credentials not configured' });

  try {
    const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
    const client = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    });

    const tx = async (contractAddress, sig, params) => {
      const r = await client.createContractExecutionTransaction({
        walletId, blockchain: BLOCKCHAIN, contractAddress,
        abiFunctionSignature: sig,
        abiParameters: params,
        idempotencyKey: crypto.randomUUID(),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const id = r.data?.transaction?.id || r.data?.id;
      if (!id) throw new Error('No tx id: ' + JSON.stringify(r.data));
      return id;
    };

    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    // ── CREATE GROUP ────────────────────────────────────────────────────────
    if (action === 'createGroup') {
      const { contributionAmount, maxMembers, roundLength, label } = req.body;
      if (!contributionAmount || !maxMembers || !roundLength || !label)
        return res.json({ success: false, error: 'Missing fields' });

      const amtAtomic = Math.floor(parseFloat(contributionAmount) * 1_000_000).toString();
      const id = await tx(AJO_CONTRACT,
        'createGroup(uint256,uint8,uint256,string)',
        [amtAtomic, String(maxMembers), String(roundLength), label]
      );
      return res.json({ success: true, txId: id });
    }

    // ── JOIN GROUP ──────────────────────────────────────────────────────────
    if (action === 'joinGroup') {
      const { groupId } = req.body;
      if (groupId == null) return res.json({ success: false, error: 'groupId required' });
      const id = await tx(AJO_CONTRACT, 'joinGroup(uint256)', [String(groupId)]);
      return res.json({ success: true, txId: id });
    }

    // ── START GROUP ─────────────────────────────────────────────────────────
    if (action === 'startGroup') {
      const { groupId } = req.body;
      if (groupId == null) return res.json({ success: false, error: 'groupId required' });
      const id = await tx(AJO_CONTRACT, 'startGroup(uint256)', [String(groupId)]);
      return res.json({ success: true, txId: id });
    }

    // ── CONTRIBUTE ──────────────────────────────────────────────────────────
    if (action === 'contribute') {
      const { groupId, contributionAmount } = req.body;
      if (groupId == null || !contributionAmount)
        return res.json({ success: false, error: 'groupId and contributionAmount required' });

      const amtAtomic = Math.floor(parseFloat(contributionAmount) * 1_000_000).toString();

      // Step 1: approve
      await tx(USDC_ADDR, 'approve(address,uint256)', [AJO_CONTRACT, amtAtomic]);
      await wait(3000);

      // Step 2: contribute
      const id = await tx(AJO_CONTRACT, 'contribute(uint256)', [String(groupId)]);
      return res.json({ success: true, txId: id });
    }

    // ── CLAIM ROUND PAYOUT ──────────────────────────────────────────────────
    if (action === 'claimRoundPayout') {
      const { groupId } = req.body;
      if (groupId == null) return res.json({ success: false, error: 'groupId required' });
      const id = await tx(AJO_CONTRACT, 'claimRoundPayout(uint256)', [String(groupId)]);
      return res.json({ success: true, txId: id });
    }

    return res.json({ success: false, error: 'Unknown action: ' + action });

  } catch (err) {
    console.error('[ajo]', err);
    return res.json({ success: false, error: err.message });
  }
}
