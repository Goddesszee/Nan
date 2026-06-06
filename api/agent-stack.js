/**
 * api/agent-stack.js — Circle Agent Stack for NAN Wallet
 * CLI installed at runtime on first call via ensureCli()
 */

import { execFile, exec } from 'child_process';
import { promisify } from 'util';

const execAsync   = promisify(exec);
const execFileP   = promisify(execFile);

const sessionStore = new Map();
let cliReady = false;

// ── Find circle binary ───────────────────────────────────────────────────────
async function getCircleBin() {
  const paths = [
    '/usr/local/bin/circle',
    '/usr/bin/circle',
    `${process.env.HOME || '/root'}/.npm-global/bin/circle`,
    '/root/.npm-global/bin/circle',
    '/app/.npm-global/bin/circle',
    'circle',
  ];
  for (const p of paths) {
    try {
      await execFileP(p, ['--version'], {
        timeout: 5000,
        env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
      });
      return p;
    } catch {}
  }
  return null;
}

// ── Install CLI if missing ───────────────────────────────────────────────────
async function ensureCli() {
  if (cliReady) return;
  const bin = await getCircleBin();
  if (bin) { cliReady = true; return; }
  console.log('[agent-stack] Installing @circle-fin/cli@0.0.5...');
  await execAsync('npm install -g @circle-fin/cli@0.0.5 --prefix /usr/local', {
    timeout: 120000,
    env: { ...process.env, npm_config_prefix: '/usr/local' },
  });
  cliReady = true;
}

// ── Run circle CLI command ───────────────────────────────────────────────────
async function cli(args, opts = {}) {
  const bin = await getCircleBin() || 'circle';
  const env = {
    ...process.env,
    CIRCLE_ACCEPT_TERMS: '1',
    HOME: process.env.HOME || '/root',
    PATH: `/usr/local/bin:/root/.npm-global/bin:/usr/bin:${process.env.PATH || ''}`,
  };

  // Add --testnet unless disabled
  const withTestnet = opts.testnet === false ? args : [...args, '--testnet'];
  // Add --output json unless already there
  const withJson = withTestnet.includes('--output') ? withTestnet : [...withTestnet, '--output', 'json'];

  try {
    const { stdout, stderr } = await execFileP(bin, withJson, {
      env,
      timeout: opts.timeout || 60000,
      cwd: process.env.HOME || '/root',
    });
    const text = (stdout || '').trim();
    if (!text) return { success: true, raw: (stderr || '').slice(0, 200) };
    try { return JSON.parse(text); } catch {}
    return { success: true, output: text };
  } catch (err) {
    throw new Error((err.stderr || err.stdout || err.message || 'CLI error').slice(0, 400));
  }
}

// ── Run login init (returns requestId) ──────────────────────────────────────
async function loginInit(email) {
  const bin = await getCircleBin() || 'circle';
  const env = {
    ...process.env,
    CIRCLE_ACCEPT_TERMS: '1',
    HOME: process.env.HOME || '/root',
    PATH: `/usr/local/bin:/root/.npm-global/bin:/usr/bin:${process.env.PATH || ''}`,
  };
  let out = '';
  try {
    const r = await execFileP(bin, ['wallet', 'login', email, '--init', '--testnet'], { env, timeout: 30000 });
    out = (r.stdout || '') + (r.stderr || '');
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || e.message || '');
  }
  // Extract request ID (UUID format)
  const m = out.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
         || out.match(/request.?id[:\s]+([a-zA-Z0-9_-]+)/i);
  return { requestId: m?.[1] || null, raw: out.slice(0, 300) };
}

// ── Run login complete ───────────────────────────────────────────────────────
async function loginComplete(requestId, otp) {
  const bin = await getCircleBin() || 'circle';
  const env = {
    ...process.env,
    CIRCLE_ACCEPT_TERMS: '1',
    HOME: process.env.HOME || '/root',
    PATH: `/usr/local/bin:/root/.npm-global/bin:/usr/bin:${process.env.PATH || ''}`,
  };
  let out = '';
  try {
    const r = await execFileP(bin, ['wallet', 'login', '--request', requestId, '--otp', otp], { env, timeout: 30000 });
    out = (r.stdout || '') + (r.stderr || '');
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || e.message || '');
  }
  const ok = /logged.?in|authenticated|success|wallet/i.test(out);
  return { success: ok, raw: out.slice(0, 300) };
}

// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const { action } = body;
  if (!action) return res.status(400).json({ error: 'action required' });

  try {

    // status — works even without CLI
    if (action === 'status') {
      const bin = await getCircleBin();
      let version = null;
      if (bin) {
        try {
          const { stdout } = await execFileP(bin, ['--version'], { timeout: 5000, env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' } });
          version = stdout.trim();
        } catch {}
      }
      const sessions = [...sessionStore.entries()].map(([email, s]) => ({
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
        active: s.sessionActive,
        chains: s.wallets ? Object.keys(s.wallets) : [],
        lastAuth: s.lastAuth,
      }));
      return res.json({ success: true, cliInstalled: !!bin, cliVersion: version, sessions });
    }

    // All other actions need CLI
    await ensureCli();

    if (action === 'login-init') {
      const { email } = body;
      if (!email?.includes('@')) return res.json({ error: 'Valid email required' });
      const { requestId, raw } = await loginInit(email);
      if (!requestId) return res.json({ success: false, error: 'Could not get requestId', raw });
      return res.json({ success: true, requestId, email, message: 'OTP sent to ' + email });
    }

    if (action === 'login-complete') {
      const { requestId, otp, email } = body;
      if (!requestId || !otp) return res.json({ error: 'requestId and otp required' });
      const { success, raw } = await loginComplete(requestId, otp);
      if (!success) return res.json({ success: false, error: 'OTP failed', raw });

      // Fetch wallets on all chains
      const chains = ['ARC-TESTNET', 'BASE-SEPOLIA', 'ETH-SEPOLIA', 'ARB-SEPOLIA', 'OP-SEPOLIA'];
      const wallets = {};
      for (const chain of chains) {
        try {
          const r = await cli(['wallet', 'list', '--type', 'agent', '--chain', chain]);
          const items = Array.isArray(r) ? r : (r?.wallets || r?.data || []);
          if (items.length > 0) wallets[chain] = items[0].address || items[0].walletAddress;
        } catch {}
      }
      if (email) sessionStore.set(email, { sessionActive: true, wallets, lastAuth: new Date().toISOString() });
      return res.json({ success: true, wallets, message: 'Agent Wallet active' });
    }

    if (action === 'logout') {
      try { await cli(['wallet', 'logout', '--type', 'agent']); } catch {}
      if (body.email) sessionStore.delete(body.email);
      return res.json({ success: true });
    }

    if (action === 'list-wallets') {
      const { chain = 'ARC-TESTNET' } = body;
      const r = await cli(['wallet', 'list', '--type', 'agent', '--chain', chain]);
      return res.json({ success: true, wallets: r?.wallets || r?.data || r });
    }

    if (action === 'balance') {
      const { address, chain = 'ARC-TESTNET' } = body;
      if (!address) return res.json({ error: 'address required' });
      const r = await cli(['wallet', 'balance', '--address', address, '--chain', chain]);
      return res.json({ success: true, balance: r });
    }

    if (action === 'fund') {
      const { address, chain = 'ARC-TESTNET', amount, method } = body;
      if (!address) return res.json({ error: 'address required' });
      const args = ['wallet', 'fund', '--address', address, '--chain', chain];
      if (method) args.push('--method', method);
      if (amount) args.push('--amount', String(amount));
      const r = await cli(args);
      return res.json({ success: true, result: r });
    }

    if (action === 'transfer') {
      const { fromAddress, toAddress, amount, chain = 'ARC-TESTNET' } = body;
      if (!fromAddress || !toAddress || !amount) return res.json({ error: 'fromAddress, toAddress, amount required' });
      const r = await cli(['wallet', 'transfer', toAddress, '--amount', String(amount), '--address', fromAddress, '--chain', chain]);
      return res.json({ success: true, result: r });
    }

    if (action === 'swap') {
      const { address, sellToken = 'USDC', sellAmount, buyToken = 'EURC', chain = 'ARC-TESTNET', quoteOnly = false } = body;
      if (!sellAmount) return res.json({ error: 'sellAmount required' });
      const args = ['wallet', 'swap', sellToken, String(sellAmount), buyToken, '--chain', chain];
      if (address) args.push('--address', address);
      if (quoteOnly) args.push('--quote');
      const r = await cli(args);
      return res.json({ success: true, quoteOnly, result: r });
    }

    if (action === 'bridge') {
      const { fromAddress, toChain, toAddress, amount, fromChain = 'ARC-TESTNET' } = body;
      if (!fromAddress || !toChain || !amount) return res.json({ error: 'fromAddress, toChain, amount required' });
      const args = ['bridge', 'transfer', toChain, '--amount', String(amount), '--address', fromAddress, '--chain', fromChain];
      if (toAddress) args.push(toAddress);
      const r = await cli(args);
      return res.json({ success: true, result: r });
    }

    if (action === 'bridge-status') {
      const { txHash, chain = 'ARC-TESTNET' } = body;
      if (!txHash) return res.json({ error: 'txHash required' });
      const r = await cli(['bridge', 'status', txHash, '--chain', chain]);
      return res.json({ success: true, result: r });
    }

    if (action === 'gateway-balance') {
      const { address, chain = 'ARC-TESTNET' } = body;
      if (!address) return res.json({ error: 'address required' });
      const r = await cli(['gateway', 'balance', '--address', address, '--chain', chain]);
      return res.json({ success: true, result: r });
    }

    if (action === 'gateway-deposit') {
      const { address, amount, chain = 'BASE-SEPOLIA', method = 'direct' } = body;
      if (!address || !amount) return res.json({ error: 'address and amount required' });
      const r = await cli(['gateway', 'deposit', '--amount', String(amount), '--address', address, '--chain', chain, '--method', method]);
      return res.json({ success: true, result: r });
    }

    if (action === 'gateway-withdraw') {
      const { address, amount, chain = 'BASE-SEPOLIA', recipient } = body;
      if (!address || !amount) return res.json({ error: 'address and amount required' });
      const args = ['gateway', 'withdraw', '--amount', String(amount), '--address', address, '--chain', chain];
      if (recipient) args.push('--recipient', recipient);
      const r = await cli(args);
      return res.json({ success: true, result: r });
    }

    if (action === 'services-search') {
      const { query = '', category, limit = 20 } = body;
      const args = ['services', 'search'];
      if (query) args.push(query);
      if (category) args.push('--category', category);
      args.push('--limit', String(limit));
      const r = await cli(args, { testnet: false });
      return res.json({ success: true, services: r?.services || r?.data || r });
    }

    if (action === 'services-inspect') {
      const { url } = body;
      if (!url) return res.json({ error: 'url required' });
      const r = await cli(['services', 'inspect', url], { testnet: false });
      return res.json({ success: true, result: r });
    }

    if (action === 'pay-service') {
      const { url, address, chain = 'BASE-SEPOLIA', maxAmount, method = 'GET', data } = body;
      if (!url || !address) return res.json({ error: 'url and address required' });
      const args = ['services', 'pay', url, '--address', address, '--chain', chain];
      if (maxAmount) args.push('--max-amount', String(maxAmount));
      if (method !== 'GET') args.push('--method', method);
      if (data) args.push('--data', JSON.stringify(data));
      const r = await cli(args, { testnet: false });
      return res.json({ success: true, result: r });
    }

    if (action === 'tx-list') {
      const { address, chain = 'ARC-TESTNET', limit = 20 } = body;
      if (!address) return res.json({ error: 'address required' });
      const r = await cli(['transaction', 'list', '--address', address, '--chain', chain, '--limit', String(limit)]);
      return res.json({ success: true, transactions: r?.transactions || r?.data || r });
    }

    if (action === 'tx-cancel') {
      const { txId, address, chain = 'ARC-TESTNET' } = body;
      if (!txId || !address) return res.json({ error: 'txId and address required' });
      const r = await cli(['transaction', 'cancel', txId, '--address', address, '--chain', chain]);
      return res.json({ success: true, result: r });
    }

    if (action === 'contract-address' || action === 'contract-addresses') {
      const { category = 'usdc', chain = 'ARC-TESTNET' } = body;
      const args = ['contract', 'address'];
      if (category) args.push(category);
      if (chain) args.push('--chain', chain);
      const r = await cli(args, { testnet: false });
      return res.json({ success: true, addresses: r });
    }

    if (action === 'contract-query') {
      const { fn, params = [], contract, chain = 'ARC-TESTNET' } = body;
      if (!fn || !contract) return res.json({ error: 'fn and contract required' });
      const r = await cli(['contract', 'query', fn, ...params, '--contract', contract, '--chain', chain]);
      return res.json({ success: true, result: r });
    }

    if (action === 'execute') {
      const { fn, params = [], contract, address, chain = 'ARC-TESTNET', amount } = body;
      if (!fn || !contract || !address) return res.json({ error: 'fn, contract, address required' });
      const args = ['wallet', 'execute', fn, ...params, '--contract', contract, '--address', address, '--chain', chain];
      if (amount) args.push('--amount', String(amount));
      const r = await cli(args);
      return res.json({ success: true, result: r });
    }

    if (action === 'sign') {
      const { message, address, chain = 'ARC-TESTNET' } = body;
      if (!message || !address) return res.json({ error: 'message and address required' });
      const r = await cli(['wallet', 'sign', 'message', message, '--address', address, '--chain', chain]);
      return res.json({ success: true, result: r });
    }

    if (action === 'list-chains') {
      const r = await cli(['blockchain', 'list'], { testnet: false });
      return res.json({ success: true, chains: r });
    }

    if (action === 'set-policy') {
      const { address, chain, policyType = 'stablecoin', ruleType = 'transfer-limit', perTx, daily, weekly, monthly } = body;
      if (!address || !chain) return res.json({ error: 'address and chain required (mainnet only)' });
      const args = ['wallet', 'limit', 'set', '--address', address, '--chain', chain,
                    '--policy-type', policyType, '--rule-type', ruleType];
      if (perTx) args.push('--per-tx', String(perTx));
      if (daily) args.push('--daily', String(daily));
      if (weekly) args.push('--weekly', String(weekly));
      if (monthly) args.push('--monthly', String(monthly));
      const r = await cli(args, { testnet: false });
      return res.json({ success: true, result: r });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error(`[agent-stack/${action}]`, err.message);
    return res.status(500).json({ success: false, error: err.message.slice(0, 300) });
  }
}
