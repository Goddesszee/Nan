// api/gigs.js — NAN Gigs: post a task/job, freelancers submit work + their own price,
// requester reviews all submissions, can edit the final amount, and accepting one
// pays the freelancer immediately, on-chain, directly from the requester's Agent Wallet.
// No escrow custody here — this mirrors the "agent pays autonomously on accept" flow
// already used by Career/Supplier agent, but as a direct wallet-to-wallet transfer
// (via agent-stack.js's existing 'transfer' action) so there's a real, verifiable tx hash.
import crypto from 'crypto';

const AGENT_STACK_API = 'https://nan-production.up.railway.app/api/agent-stack';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// ── Redis helpers — same implementation as api/marketplace.js ───────────────
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
async function kvSadd(setKey, member) {
  const { default: fetch } = await import('node-fetch');
  await fetch(`${KV_URL}/sadd/${encodeURIComponent(setKey)}/${encodeURIComponent(member)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
}
async function kvSmembers(setKey) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${KV_URL}/smembers/${encodeURIComponent(setKey)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d?.result || [];
}
// Indexed list: reads member IDs from a Set (O(1) lookup) instead of pattern-scanning
// every key in the shared database with KEYS, which gets slower as the whole KV store
// (shared across career/marketplace/gigs/kyc) accumulates more keys over time.
async function listByIndex(indexKey, keyPrefix) {
  const ids = await kvSmembers(indexKey);
  const items = await Promise.all(ids.map(id => kvGet(keyPrefix + id)));
  return items.filter(Boolean);
}
function newId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

// Pay the freelancer directly from the requester's Agent Wallet — real on-chain
// transfer, reusing agent-stack.js's existing, already-working 'transfer' action.
async function payFreelancer({ fromAddress, toAddress, amount }) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(AGENT_STACK_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'transfer', fromAddress, toAddress, amount: String(amount), chain: 'ARC-TESTNET' }),
  });
  return r.json(); // { success, txHash, error }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  try {
    // ── task-create ──────────────────────────────────────────────────────────
    if (action === 'task-create') {
      const { requesterAddress, title, description, budget, negotiable } = req.body;
      if (!requesterAddress || !title || !budget) return res.json({ success: false, error: 'requesterAddress, title, and budget are required' });
      const parsedBudget = parseFloat(budget);
      if (isNaN(parsedBudget) || parsedBudget <= 0) return res.json({ success: false, error: 'Invalid budget' });

      const task = {
        id: newId('task'), requesterAddress,
        title: String(title).slice(0, 140), description: String(description || '').slice(0, 2000),
        budget: parsedBudget, negotiable: !!negotiable,
        status: 'open', createdAt: Date.now(),
      };
      await kvSet(`nan:gig:task:${task.id}`, task);
      await kvSadd('nan:gig:task:index', task.id);
      return res.json({ success: true, task });
    }

    // ── task-list (browse open tasks) ────────────────────────────────────────
    if (action === 'task-list') {
      const { query } = req.body;
      let tasks = (await listByIndex('nan:gig:task:index', 'nan:gig:task:')).filter(t => t.status === 'open');
      if (query) {
        const q = String(query).toLowerCase();
        tasks = tasks.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
      }
      tasks.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, tasks });
    }

    // ── task-get ──────────────────────────────────────────────────────────────
    if (action === 'task-get') {
      const { taskId } = req.body;
      const task = await kvGet(`nan:gig:task:${taskId}`);
      if (!task) return res.json({ success: false, error: 'Task not found' });
      return res.json({ success: true, task });
    }

    // ── my-tasks (posted by this requester) ─────────────────────────────────
    if (action === 'my-tasks') {
      const { requesterAddress } = req.body;
      if (!requesterAddress) return res.json({ success: false, error: 'requesterAddress required' });
      const tasks = (await listByIndex('nan:gig:task:index', 'nan:gig:task:')).filter(t => t.requesterAddress?.toLowerCase() === requesterAddress.toLowerCase());
      tasks.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, tasks });
    }

    // ── submission-create (freelancer submits work + their own proposed price) ─
    if (action === 'submission-create') {
      const { taskId, freelancerAddress, freelancerWalletAddress, description, proposedPrice, fileUrl } = req.body;
      if (!taskId || !freelancerAddress || !freelancerWalletAddress || !description || !proposedPrice)
        return res.json({ success: false, error: 'taskId, freelancerAddress, freelancerWalletAddress, description, and proposedPrice are required' });
      if (!/^0x[a-fA-F0-9]{40}$/.test(freelancerWalletAddress)) return res.json({ success: false, error: 'Invalid freelancerWalletAddress' });

      const task = await kvGet(`nan:gig:task:${taskId}`);
      if (!task) return res.json({ success: false, error: 'Task not found' });
      if (task.status !== 'open') return res.json({ success: false, error: `Task is ${task.status}, not accepting submissions` });

      const parsedPrice = parseFloat(proposedPrice);
      if (isNaN(parsedPrice) || parsedPrice <= 0) return res.json({ success: false, error: 'Invalid proposedPrice' });

      let safeFile = null;
      if (fileUrl) {
        if (typeof fileUrl !== 'string' || !(fileUrl.startsWith('data:image/') || fileUrl.startsWith('http')))
          return res.json({ success: false, error: 'fileUrl must be an image data URL or a link' });
        if (fileUrl.length > 350_000) return res.json({ success: false, error: 'File is too large' });
        safeFile = fileUrl;
      }

      const submission = {
        id: newId('sub'), taskId, freelancerAddress, freelancerWalletAddress,
        description: String(description).slice(0, 2000), proposedPrice: parsedPrice,
        fileUrl: safeFile, status: 'pending', createdAt: Date.now(),
      };
      await kvSet(`nan:gig:submission:${submission.id}`, submission);
      await kvSadd('nan:gig:submission:index', submission.id);
      return res.json({ success: true, submission });
    }

    // ── submission-list (all submissions for a task, for the requester to review) ─
    if (action === 'submission-list') {
      const { taskId } = req.body;
      if (!taskId) return res.json({ success: false, error: 'taskId required' });
      const submissions = (await listByIndex('nan:gig:submission:index', 'nan:gig:submission:')).filter(s => s.taskId === taskId);
      submissions.sort((a, b) => a.createdAt - b.createdAt);
      return res.json({ success: true, submissions });
    }

    // ── my-submissions (freelancer's own submitted work, across all tasks) ──
    if (action === 'my-submissions') {
      const { freelancerAddress } = req.body;
      if (!freelancerAddress) return res.json({ success: false, error: 'freelancerAddress required' });
      const submissions = (await listByIndex('nan:gig:submission:index', 'nan:gig:submission:')).filter(s => s.freelancerAddress?.toLowerCase() === freelancerAddress.toLowerCase());
      submissions.sort((a, b) => b.createdAt - a.createdAt);
      const taskIds = [...new Set(submissions.map(s => s.taskId))];
      const tasks = await Promise.all(taskIds.map(id => kvGet(`nan:gig:task:${id}`)));
      const taskById = Object.fromEntries(taskIds.map((id, i) => [id, tasks[i]]));
      const enriched = submissions.map(s => ({ ...s, taskTitle: taskById[s.taskId]?.title || null, requesterAddress: taskById[s.taskId]?.requesterAddress || null }));
      return res.json({ success: true, submissions: enriched });
    }

    // ── submission-accept (requester edits the amount, agent pays instantly, onchain) ─
    if (action === 'submission-accept') {
      const { submissionId, requesterAddress, requesterAgentWalletAddress, finalAmount } = req.body;
      if (!submissionId || !requesterAddress || !requesterAgentWalletAddress || !finalAmount)
        return res.json({ success: false, error: 'submissionId, requesterAddress, requesterAgentWalletAddress, and finalAmount are required' });

      const submission = await kvGet(`nan:gig:submission:${submissionId}`);
      if (!submission) return res.json({ success: false, error: 'Submission not found' });
      if (submission.status !== 'pending') return res.json({ success: false, error: `Submission is already ${submission.status}` });

      const task = await kvGet(`nan:gig:task:${submission.taskId}`);
      if (!task) return res.json({ success: false, error: 'Task not found' });
      if (task.requesterAddress?.toLowerCase() !== requesterAddress.toLowerCase())
        return res.json({ success: false, error: 'Only the requester who posted this task can accept a submission' });
      if (task.status !== 'open') return res.json({ success: false, error: `Task is already ${task.status}` });

      const parsedAmount = parseFloat(finalAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) return res.json({ success: false, error: 'Invalid finalAmount' });

      // Pay the freelancer directly, on-chain, from the requester's Agent Wallet.
      const payResult = await payFreelancer({
        fromAddress: requesterAgentWalletAddress,
        toAddress: submission.freelancerWalletAddress,
        amount: parsedAmount,
      });
      if (!payResult.success) return res.json({ success: false, error: payResult.error || 'Payment failed' });

      submission.status = 'accepted';
      submission.finalAmount = parsedAmount;
      submission.txHash = payResult.txHash || null;
      submission.acceptedAt = Date.now();
      await kvSet(`nan:gig:submission:${submission.id}`, submission);

      // Mark every other pending submission on this task as not selected.
      const others = (await listByIndex('nan:gig:submission:index', 'nan:gig:submission:')).filter(s => s.taskId === task.id && s.id !== submission.id && s.status === 'pending');
      for (const other of others) {
        other.status = 'not_selected';
        await kvSet(`nan:gig:submission:${other.id}`, other);
      }

      task.status = 'completed';
      task.acceptedSubmissionId = submission.id;
      task.updatedAt = Date.now();
      await kvSet(`nan:gig:task:${task.id}`, task);

      return res.json({ success: true, submission, task, rejectedCount: others.length });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[gigs]', e.message);
    return res.status(500).json({ success: false, error: e.message.slice(0, 300) });
  }
}
