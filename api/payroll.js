// api/payroll.js — NAN Payroll: employees directory (CRUD) and server-side payroll run
// logging, so Dashboard and Reports can show real, cross-device data. Actual token
// transfers still happen client-side via Circle wallets / MetaMask (see app.js doBulkSend) —
// this API only stores the employee directory and a record of completed runs.
import crypto from 'crypto';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
async function kvGet(key) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['GET', key]) });
  const d = await r.json();
  return d?.result ? JSON.parse(d.result) : null;
}
async function kvSet(key, value) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(KV_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, JSON.stringify(value)]),
  });
  const d = await r.json();
  if (!r.ok || d?.error) throw new Error(`kvSet failed for ${key}: ${d?.error || r.status}`);
}
async function addToIndex(indexKey, id) {
  const raw = await kvGet(indexKey);
  const current = Array.isArray(raw) ? raw : [];
  if (!current.includes(id)) { current.push(id); await kvSet(indexKey, current); }
}
async function removeFromIndex(indexKey, id) {
  const raw = await kvGet(indexKey);
  const current = Array.isArray(raw) ? raw : [];
  await kvSet(indexKey, current.filter(x => x !== id));
}
async function listByIndex(indexKey, keyPrefix) {
  const raw = await kvGet(indexKey);
  const ids = Array.isArray(raw) ? raw : [];
  const items = await Promise.all(ids.map(id => kvGet(keyPrefix + id)));
  return items.filter(Boolean);
}
function newId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > windowMs) { rateLimitMap.set(ip, { count: 1, start: now }); return true; }
  if (record.count >= limit) return false;
  record.count++; rateLimitMap.set(ip, record);
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests — please wait a moment' });

  const { action } = req.body || {};

  try {
    // ── employees ────────────────────────────────────────────────────────
    if (action === 'add-employee') {
      const { employerAddress, fullName, walletAddress, email, phone, position, department, salary, currency } = req.body;
      if (!employerAddress || !fullName || !walletAddress) return res.json({ success: false, error: 'employerAddress, fullName, and walletAddress are required' });
      const employee = {
        id: newId('emp'), employerAddress: employerAddress.toLowerCase(),
        fullName: String(fullName).slice(0, 100), walletAddress, email: email || null, phone: phone || null,
        position: position || null, department: department || null,
        salary: salary ? parseFloat(salary) : null, currency: (currency || 'USDC').toUpperCase(),
        status: 'active', createdAt: Date.now(),
      };
      await kvSet(`nan:payroll:emp:${employee.id}`, employee);
      await addToIndex(`nan:payroll:empindex:${employee.employerAddress}`, employee.id);
      return res.json({ success: true, employee });
    }
    if (action === 'edit-employee') {
      const { employerAddress, employeeId, ...updates } = req.body;
      if (!employerAddress || !employeeId) return res.json({ success: false, error: 'employerAddress and employeeId are required' });
      const employee = await kvGet(`nan:payroll:emp:${employeeId}`);
      if (!employee) return res.json({ success: false, error: 'Employee not found' });
      if (employee.employerAddress !== employerAddress.toLowerCase()) return res.json({ success: false, error: 'Not authorized' });
      const allowed = ['fullName', 'walletAddress', 'email', 'phone', 'position', 'department', 'salary', 'currency', 'status'];
      for (const k of allowed) if (updates[k] !== undefined) employee[k] = k === 'salary' ? parseFloat(updates[k]) : updates[k];
      employee.updatedAt = Date.now();
      await kvSet(`nan:payroll:emp:${employeeId}`, employee);
      return res.json({ success: true, employee });
    }
    if (action === 'delete-employee') {
      const { employerAddress, employeeId } = req.body;
      if (!employerAddress || !employeeId) return res.json({ success: false, error: 'employerAddress and employeeId are required' });
      await removeFromIndex(`nan:payroll:empindex:${employerAddress.toLowerCase()}`, employeeId);
      return res.json({ success: true });
    }
    if (action === 'list-employees') {
      const { employerAddress } = req.body;
      if (!employerAddress) return res.json({ success: false, error: 'employerAddress required' });
      const employees = await listByIndex(`nan:payroll:empindex:${employerAddress.toLowerCase()}`, 'nan:payroll:emp:');
      employees.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, employees });
    }
    if (action === 'import-employees-csv') {
      const { employerAddress, rows } = req.body;
      if (!employerAddress || !Array.isArray(rows)) return res.json({ success: false, error: 'employerAddress and rows[] are required' });
      const created = [];
      for (const row of rows.slice(0, 500)) {
        if (!row.fullName || !row.walletAddress) continue;
        const employee = {
          id: newId('emp'), employerAddress: employerAddress.toLowerCase(),
          fullName: String(row.fullName).slice(0, 100), walletAddress: row.walletAddress,
          email: row.email || null, phone: row.phone || null, position: row.position || null, department: row.department || null,
          salary: row.salary ? parseFloat(row.salary) : null, currency: (row.currency || 'USDC').toUpperCase(),
          status: 'active', createdAt: Date.now(),
        };
        await kvSet(`nan:payroll:emp:${employee.id}`, employee);
        await addToIndex(`nan:payroll:empindex:${employerAddress.toLowerCase()}`, employee.id);
        created.push(employee);
      }
      return res.json({ success: true, imported: created.length, employees: created });
    }

    // ── payroll run logging (called after a real on-chain send completes) ──
    if (action === 'log-run') {
      const { employerAddress, recipients, token, totalAmount, sentCount, failedCount, txHashes, runType } = req.body;
      if (!employerAddress || !Array.isArray(recipients)) return res.json({ success: false, error: 'employerAddress and recipients[] are required' });
      const run = {
        id: newId('run'), employerAddress: employerAddress.toLowerCase(),
        recipients, token: (token || 'USDC').toUpperCase(),
        totalAmount: parseFloat(totalAmount) || 0, sentCount: sentCount || 0, failedCount: failedCount || 0,
        txHashes: Array.isArray(txHashes) ? txHashes : [], runType: runType || 'bulk',
        createdAt: Date.now(),
      };
      await kvSet(`nan:payroll:run:${run.id}`, run);
      await addToIndex(`nan:payroll:runindex:${employerAddress.toLowerCase()}`, run.id);
      return res.json({ success: true, run });
    }
    if (action === 'list-runs') {
      const { employerAddress } = req.body;
      if (!employerAddress) return res.json({ success: false, error: 'employerAddress required' });
      const runs = await listByIndex(`nan:payroll:runindex:${employerAddress.toLowerCase()}`, 'nan:payroll:run:');
      runs.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, runs: runs.slice(0, 100) });
    }

    // ── dashboard stats (real aggregation, no fabricated numbers) ─────────
    if (action === 'dashboard-stats') {
      const { employerAddress } = req.body;
      if (!employerAddress) return res.json({ success: false, error: 'employerAddress required' });
      const addr = employerAddress.toLowerCase();
      const employees = await listByIndex(`nan:payroll:empindex:${addr}`, 'nan:payroll:emp:');
      const runs = await listByIndex(`nan:payroll:runindex:${addr}`, 'nan:payroll:run:');
      const now = new Date();
      const thisMonthRuns = runs.filter(r => {
        const d = new Date(r.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
      const totalThisMonth = thisMonthRuns.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const totalFailedAmountPending = 0; // no separate "pending" concept yet — a run is either sent or not
      return res.json({
        success: true,
        stats: {
          totalEmployees: employees.filter(e => e.status === 'active').length,
          payrollThisMonth: totalThisMonth,
          pendingPayroll: totalFailedAmountPending,
          totalRuns: runs.length,
          recentRuns: runs.slice(0, 5),
        },
      });
    }

    // ── reports (real aggregation from logged runs) ─────────────────────
    if (action === 'reports') {
      const { employerAddress } = req.body;
      if (!employerAddress) return res.json({ success: false, error: 'employerAddress required' });
      const addr = employerAddress.toLowerCase();
      const runs = await listByIndex(`nan:payroll:runindex:${addr}`, 'nan:payroll:run:');
      if (!runs.length) return res.json({ success: true, hasData: false });

      // Group by month for the last 6 months
      const byMonth = {};
      runs.forEach(r => {
        const d = new Date(r.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonth[key] = (byMonth[key] || 0) + (r.totalAmount || 0);
      });
      const monthlySpending = Object.entries(byMonth).sort().slice(-6).map(([month, total]) => ({ month, total }));

      const totalSent = runs.reduce((s, r) => s + (r.sentCount || 0), 0);
      const totalFailed = runs.reduce((s, r) => s + (r.failedCount || 0), 0);
      const successRate = (totalSent + totalFailed) > 0 ? (totalSent / (totalSent + totalFailed)) * 100 : null;

      return res.json({
        success: true, hasData: true,
        monthlySpending,
        successRate,
        totalSpent: runs.reduce((s, r) => s + (r.totalAmount || 0), 0),
        totalRuns: runs.length,
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[payroll]', e.message);
    res.status(500).json({ success: false, error: e.message.slice(0, 200) });
  }
}
