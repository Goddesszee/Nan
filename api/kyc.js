// api/kyc.js — NAN lightweight verification: NOT real KYC compliance (no ID document
// scanning, liveness check, or sanctions screening). This is a manual-review queue —
// a person submits their name, ID description, and contact, an admin approves or
// rejects it, and approved wallet addresses are allowed to post high-value listings.
// Clearly labeled "Verified by NAN team" everywhere, never implying legal KYC.
import crypto from 'crypto';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result ? JSON.parse(d.result) : null;
}
async function kvSet(key, value) {
  const { default: fetch } = await import('node-fetch');
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  });
}
async function kvKeys(prefix) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/keys/${encodeURIComponent(prefix + '*')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result || [];
}
async function listByPrefix(prefix) {
  const keys = await kvKeys(prefix);
  const items = await Promise.all(keys.map(k => kvGet(k)));
  return items.filter(Boolean);
}
function newId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  try {
    // ── submit-verification ──────────────────────────────────────────────────
    if (action === 'submit-verification') {
      const { walletAddress, fullName, idDescription, contact } = req.body;
      if (!walletAddress || !fullName || !idDescription || !contact)
        return res.json({ success: false, error: 'walletAddress, fullName, idDescription, and contact are all required' });

      const existing = await kvGet(`nan:kyc:${walletAddress.toLowerCase()}`);
      if (existing && existing.status === 'approved') return res.json({ success: false, error: 'This wallet is already verified' });
      if (existing && existing.status === 'pending') return res.json({ success: false, error: 'A verification request for this wallet is already pending review' });

      const record = {
        id: newId('kyc'), walletAddress, fullName: String(fullName).slice(0, 140),
        idDescription: String(idDescription).slice(0, 500), contact: String(contact).slice(0, 200),
        status: 'pending', submittedAt: Date.now(),
      };
      await kvSet(`nan:kyc:${walletAddress.toLowerCase()}`, record);
      return res.json({ success: true, record });
    }

    // ── get-status ────────────────────────────────────────────────────────────
    if (action === 'get-status') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const record = await kvGet(`nan:kyc:${walletAddress.toLowerCase()}`);
      return res.json({ success: true, status: record?.status || 'none', record: record || null });
    }

    // ── admin-list-pending ────────────────────────────────────────────────────
    if (action === 'admin-list-pending') {
      const { secret } = req.body;
      if (secret !== process.env.ADMIN_PASSWORD) return res.json({ success: false, error: 'Unauthorized' });
      const pending = (await listByPrefix('nan:kyc:')).filter(r => r.status === 'pending');
      pending.sort((a, b) => a.submittedAt - b.submittedAt);
      return res.json({ success: true, records: pending });
    }

    // ── admin-decide (approve | reject) ──────────────────────────────────────
    if (action === 'admin-decide') {
      const { secret, walletAddress, decision } = req.body; // decision: 'approve' | 'reject'
      if (secret !== process.env.ADMIN_PASSWORD) return res.json({ success: false, error: 'Unauthorized' });
      if (!['approve', 'reject'].includes(decision)) return res.json({ success: false, error: "decision must be 'approve' or 'reject'" });
      const record = await kvGet(`nan:kyc:${walletAddress.toLowerCase()}`);
      if (!record) return res.json({ success: false, error: 'No verification request found for this wallet' });
      record.status = decision === 'approve' ? 'approved' : 'rejected';
      record.decidedAt = Date.now();
      await kvSet(`nan:kyc:${walletAddress.toLowerCase()}`, record);
      return res.json({ success: true, record });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[kyc]', e.message);
    return res.status(500).json({ success: false, error: e.message.slice(0, 300) });
  }
}
