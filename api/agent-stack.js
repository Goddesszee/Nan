/**
 * api/agent-stack.js — Circle Agent Stack for NAN Wallet
 * v3 — non-blocking login, fast responses, no 502s
 */

import { execFile, exec } from 'child_process';
import { promisify } from 'util';

const execAsync  = promisify(exec);
const execFileP  = promisify(execFile);

// Session store: email → { sessionActive, wallets, lastAuth, pending }
const sessionStore = new Map();
// Login request store: requestId → { email, initiated }
const loginRequests = new Map();

let cliInstalled = false;
let cliPath = null;

// ── Find circle binary ───────────────────────────────────────────────────────
async function findCli() {
  if (cliPath) return cliPath;
  const candidates = [
    '/usr/local/bin/circle',
    '/root/.npm-global/bin/circle',
    `${process.env.HOME || '/root'}/.npm-global/bin/circle`,
    '/usr/bin/circle',
    '/app/.npm-global/bin/circle',
    'circle',
  ];
  for (const p of candidates) {
    try {
      await execFileP(p, ['--version'], {
        timeout: 5000,
        env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
      });
      cliPath = p;
      cliInstalled = true;
      return p;
    } catch {}
  }
  return null;
}

// ── Install CLI (fire and forget from caller) ────────────────────────────────
async function installCli() {
  try {
    await execAsync(
      'npm install -g @circle-fin/cli@0.0.5 --prefix /usr/local 2>&1 || ' +
      'npm install -g @circle-fin/cli@0.0.5 2>&1',
      { timeout: 180000, env: { ...process.env, npm_config_prefix: '/usr/local' } }
    );
    cliInstalled = true;
    cliPath = null; // reset so findCli re-checks
    await findCli();
    console.log('[agent-stack] CLI installed at:', cliPath);
  } catch (e) {
    console.error('[agent-stack] CLI install failed:', e.message.slice(0, 200));
  }
}

// ── CLI env ──────────────────────────────────────────────────────────────────
function cliEnv() {
  return {
    ...process.env,
    CIRCLE_ACCEPT_TERMS: '1',
    HOME: process.env.HOME || '/root',
    PATH: `/usr/local/bin:/root/.npm-global/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
  };
}

// ── Run a circle command ─────────────────────────────────────────────────────
async function cli(args, opts = {}) {
  const bin = await findCli();
  if (!bin) throw new Error('Circle CLI not installed yet — try again in 60 seconds');

  const withTestnet = opts.testnet === false ? args : [...args, '--testnet'];
  const withJson    = withTestnet.includes('--output') ? withTestnet : [...withTestnet, '--output', 'json'];

  const { stdout, stderr } = await execFileP(bin, withJson, {
    env: cliEnv(),
    timeout: opts.timeout || 90000,
    cwd: process.env.HOME || '/root',
  });

  const text = (stdout || '').trim();
  if (!text) return { success: true, raw: (stderr || '').slice(0, 200) };
  try { return JSON.parse(text); } catch {}
  return { success: true, output: text, raw: (stderr || '').slice(0, 100) };
}

// ── Raw exec (for login commands that may exit non-zero) ─────────────────────
async function cliRaw(args, timeoutMs = 45000) {
  const bin = await findCli();
  if (!bin) throw new Error('Circle CLI not installed yet');
  let stdout = '', stderr = '';
  try {
    const r = await execFileP(bin, args, { env: cliEnv(), timeout: timeoutMs });
    stdout = r.stdout || '';
    stderr = r.stderr || '';
  } catch (e) {
    stdout = e.stdout || '';
    stderr = e.stderr || e.message || '';
  }
  return (stdout + stderr);
}

// ── Fetch wallets on all chains ──────────────────────────────────────────────
async function fetchWallets() {
  const chains = ['ARC-TESTNET','BASE-SEPOLIA','ETH-SEPOLIA','ARB-SEPOLIA','OP-SEPOLIA'];
  const wallets = {};
  for (const chain of chains) {
    try {
      const r = await cli(['wallet','list','--type','agent','--chain',chain]);
      const items = Array.isArray(r) ? r : (r?.wallets || r?.data || []);
      if (items.length > 0) wallets[chain] = items[0].address || items[0].walletAddress;
    } catch {}
  }
  return wallets;
}

// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body   = req.body || {};
  const action = body.action;
  if (!action) return res.status(400).json({ error: 'action required' });

  try {

    // ── status ────────────────────────────────────────────────────────────────
    if (action === 'status') {
      const bin = await findCli();
      let version = null;
      if (bin) {
        try {
          const { stdout } = await execFileP(bin, ['--version'], { timeout: 5000, env: cliEnv() });
          version = stdout.trim();
        } catch {}
      }
      const sessions = [...sessionStore.entries()].map(([email, s]) => ({
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
        active: s.sessionActive,
        chains: s.wallets ? Object.keys(s.wallets) : [],
        pending: s.pending || false,
        lastAuth: s.lastAuth,
      }));
      return res.json({ success: true, cliInstalled: !!bin, cliVersion: version, sessions });
    }

    // ── login-init ────────────────────────────────────────────────────────────
    if (action === 'login-init') {
      const { email } = body;
      if (!email?.includes('@')) return res.json({ error: 'Valid email required' });

      // Start CLI install in background if not ready
      const bin = await findCli();
      if (!bin) {
        installCli(); // fire and forget
        return res.json({ success: false, installing: true, message: 'CLI installing (~60s) — try again shortly' });
      }

      // Send OTP — this is fast (just an API call by the CLI)
      const out = await cliRaw(['wallet','login', email,'--init','--testnet'], 30000);

      // Extract requestId
      const m = out.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
             || out.match(/request.?id[:\s]+([a-zA-Z0-9_-]+)/i);
      const requestId = m?.[1] || null;

      if (!requestId) {
        if (/logged.?in|already/i.test(out)) {
          return res.json({ success: true, alreadyLoggedIn: true, email });
        }
        return res.json({ success: false, error: 'Could not get requestId', raw: out.slice(0, 300) });
      }

      loginRequests.set(requestId, { email, initiated: Date.now() });
      return res.json({ success: true, requestId, email, message: 'OTP sent to ' + email });
    }

    // ── login-complete ────────────────────────────────────────────────────────
    if (action === 'login-complete') {
      const { requestId, otp, email } = body;
      if (!requestId || !otp) return res.json({ error: 'requestId and otp required' });

      const bin = await findCli();
      if (!bin) return res.json({ error: 'CLI not ready — try login-init first' });

      // Mark session as pending immediately so frontend can poll
      const resolvedEmail = email || loginRequests.get(requestId)?.email || 'unknown';
      sessionStore.set(resolvedEmail, { sessionActive: false, pending: true, wallets: {}, lastAuth: null });

      // Respond immediately — don't wait for the full OTP+wallet-list flow
      res.json({ success: true, pending: true, email: resolvedEmail, message: 'Verifying OTP — poll status in 5s' });

      // Complete auth in background
      setImmediate(async () => {
        try {
          const out = await cliRaw(['wallet','login','--request',requestId,'--otp',otp], 45000);
          const ok = /logged.?in|authenticated|success|wallet/i.test(out);
          if (!ok) {
            sessionStore.set(resolvedEmail, { sessionActive: false, pending: false, error: 'OTP failed: ' + out.slice(0,100) });
            return;
          }
          const wallets = await fetchWallets();
          sessionStore.set(resolvedEmail, { sessionActive: true, pending: false, wallets, lastAuth: new Date().toISOString() });
          console.log('[agent-stack] Login complete for', resolvedEmail, '— wallets:', Object.keys(wallets));
          loginRequests.delete(requestId);
        } catch (e) {
          console.error('[agent-stack] Background login error:', e.message);
          sessionStore.set(resolvedEmail, { sessionActive: false, pending: false, error: e.message.slice(0,100) });
        }
      });

      return; // response already sent
    }

    // ── login-status (poll after login-complete) ───────────────────────────────
    if (action === 'login-status') {
      const { email } = body;
      if (!email) return res.json({ error: 'email required' });
      const session = sessionStore.get(email);
      if (!session) return res.json({ success: false, ready: false, message: 'No session found' });
      if (session.pending) return res.json({ success: true, ready: false, pending: true, message: 'Still verifying...' });
      if (session.error) return res.json({ success: false, ready: false, error: session.error });
      return res.json({ success: true, ready: true, sessionActive: session.sessionActive, wallets: session.wallets, lastAuth: session.lastAuth });
    }

    // ── logout ────────────────────────────────────────────────────────────────
    if (action === 'logout') {
      try { await cliRaw(['wallet','logout','--type','agent'], 15000); } catch {}
      if (body.email) sessionStore.delete(body.email);
      return res.json({ success: true });
    }

    // ── list-wallets ──────────────────────────────────────────────────────────
    if (action === 'list-wallets') {
      const { chain = 'ARC-TESTNET' } = body;
      const r = await cli(['wallet','list','--type','agent','--chain',chain]);
      return res.json({ success: true, wallets: r?.wallets || r?.data || r });
    }

    // ── balance ───────────────────────────────────────────────────────────────
    if (action === 'balance') {
      const { address, chain = 'ARC-TESTNET' } = body;
      if (!address) return res.json({ error: 'address required' });
      const r = await cli(['wallet','balance','--address',address,'--chain',chain]);
      return res.json({ success: true, balance: r });
    }

    // ── fund ──────────────────────────────────────────────────────────────────
    if (action === 'fund') {
      const { address, chain = 'ARC-TESTNET', amount, method } = body;
      if (!address) return res.json({ error: 'address required' });
      const args = ['wallet','fund','--address',address,'--chain',chain];
      if (method) args.push('--method', method);
      if (amount) args.push('--amount', String(amount));
      const r = await cli(args, { timeout: 120000 });
      return res.json({ success: true, result: r });
    }

    // ── transfer ──────────────────────────────────────────────────────────────
    if (action === 'transfer') {
      const { fromAddress, toAddress, amount, chain = 'ARC-TESTNET' } = body;
      if (!fromAddress || !toAddress || !amount) return res.json({ error: 'fromAddress, toAddress, amount required' });
      const r = await cli(['wallet','transfer',toAddress,'--amount',String(amount),'--address',fromAddress,'--chain',chain]);
      return res.json({ success: true, result: r });
    }

    // ── swap ──────────────────────────────────────────────────────────────────
    if (action === 'swap') {
      const { address, sellToken='USDC', sellAmount, buyToken='EURC', chain='ARC-TESTNET', quoteOnly=false } = body;
      if (!sellAmount) return res.json({ error: 'sellAmount required' });
      const args = ['wallet','swap',sellToken,String(sellAmount),buyToken,'--chain',chain];
      if (address) args.push('--address', address);
      if (quoteOnly) args.push('--quote');
      const r = await cli(args);
      return res.json({ success: true, quoteOnly, result: r });
    }

    // ── bridge ────────────────────────────────────────────────────────────────
    if (action === 'bridge') {
      const { fromAddress, toChain, toAddress, amount, fromChain='ARC-TESTNET' } = body;
      if (!fromAddress || !toChain || !amount) return res.json({ error: 'fromAddress, toChain, amount required' });
      const args = ['bridge','transfer',toChain,'--amount',String(amount),'--address',fromAddress,'--chain',fromChain];
      if (toAddress) args.push(toAddress);
      const r = await cli(args, { timeout: 120000 });
      return res.json({ success: true, result: r });
    }

    // ── bridge-status ─────────────────────────────────────────────────────────
    if (action === 'bridge-status') {
      const { txHash, chain='ARC-TESTNET' } = body;
      if (!txHash) return res.json({ error: 'txHash required' });
      const r = await cli(['bridge','status',txHash,'--chain',chain]);
      return res.json({ success: true, result: r });
    }

    // ── gateway-balance ───────────────────────────────────────────────────────
    if (action === 'gateway-balance') {
      const { address, chain='ARC-TESTNET' } = body;
      if (!address) return res.json({ error: 'address required' });
      const r = await cli(['gateway','balance','--address',address,'--chain',chain]);
      return res.json({ success: true, result: r });
    }

    // ── gateway-deposit ───────────────────────────────────────────────────────
    if (action === 'gateway-deposit') {
      const { address, amount, chain='BASE-SEPOLIA', method='direct' } = body;
      if (!address || !amount) return res.json({ error: 'address and amount required' });
      const r = await cli(['gateway','deposit','--amount',String(amount),'--address',address,'--chain',chain,'--method',method]);
      return res.json({ success: true, result: r });
    }

    // ── gateway-withdraw ──────────────────────────────────────────────────────
    if (action === 'gateway-withdraw') {
      const { address, amount, chain='BASE-SEPOLIA', recipient } = body;
      if (!address || !amount) return res.json({ error: 'address and amount required' });
      const args = ['gateway','withdraw','--amount',String(amount),'--address',address,'--chain',chain];
      if (recipient) args.push('--recipient', recipient);
      const r = await cli(args);
      return res.json({ success: true, result: r });
    }

    // ── services-search ───────────────────────────────────────────────────────
    if (action === 'services-search') {
      const { query='', category, limit=20 } = body;
      const args = ['services','search'];
      if (query) args.push(query);
      if (category) args.push('--category', category);
      args.push('--limit', String(limit));
      const r = await cli(args, { testnet: false });
      return res.json({ success: true, services: r?.services || r?.data || r });
    }

    // ── services-inspect ──────────────────────────────────────────────────────
    if (action === 'services-inspect') {
      const { url } = body;
      if (!url) return res.json({ error: 'url required' });
      const r = await cli(['services','inspect',url], { testnet: false });
      return res.json({ success: true, result: r });
    }

    // ── pay-service ───────────────────────────────────────────────────────────
    if (action === 'pay-service') {
      const { url, address, chain='BASE-SEPOLIA', maxAmount, method='GET', data } = body;
      if (!url || !address) return res.json({ error: 'url and address required' });
      const args = ['services','pay',url,'--address',address,'--chain',chain];
      if (maxAmount) args.push('--max-amount', String(maxAmount));
      if (method !== 'GET') args.push('--method', method);
      if (data) args.push('--data', JSON.stringify(data));
      const r = await cli(args, { testnet: false });
      return res.json({ success: true, result: r });
    }

    // ── tx-list ───────────────────────────────────────────────────────────────
    if (action === 'tx-list') {
      const { address, chain='ARC-TESTNET', limit=20 } = body;
      if (!address) return res.json({ error: 'address required' });
      const r = await cli(['transaction','list','--address',address,'--chain',chain,'--limit',String(limit)]);
      return res.json({ success: true, transactions: r?.transactions || r?.data || r });
    }

    // ── tx-cancel ─────────────────────────────────────────────────────────────
    if (action === 'tx-cancel') {
      const { txId, address, chain='ARC-TESTNET' } = body;
      if (!txId || !address) return res.json({ error: 'txId and address required' });
      const r = await cli(['transaction','cancel',txId,'--address',address,'--chain',chain]);
      return res.json({ success: true, result: r });
    }

    // ── contract-address ──────────────────────────────────────────────────────
    if (action === 'contract-address' || action === 'contract-addresses') {
      const { category='usdc', chain='ARC-TESTNET' } = body;
      const args = ['contract','address'];
      if (category) args.push(category);
      if (chain) args.push('--chain', chain);
      const r = await cli(args, { testnet: false });
      return res.json({ success: true, addresses: r });
    }

    // ── contract-query ────────────────────────────────────────────────────────
    if (action === 'contract-query') {
      const { fn, params=[], contract, chain='ARC-TESTNET' } = body;
      if (!fn || !contract) return res.json({ error: 'fn and contract required' });
      const r = await cli(['contract','query',fn,...params,'--contract',contract,'--chain',chain]);
      return res.json({ success: true, result: r });
    }

    // ── execute ───────────────────────────────────────────────────────────────
    if (action === 'execute') {
      const { fn, params=[], contract, address, chain='ARC-TESTNET', amount } = body;
      if (!fn || !contract || !address) return res.json({ error: 'fn, contract, address required' });
      const args = ['wallet','execute',fn,...params,'--contract',contract,'--address',address,'--chain',chain];
      if (amount) args.push('--amount', String(amount));
      const r = await cli(args);
      return res.json({ success: true, result: r });
    }

    // ── sign ──────────────────────────────────────────────────────────────────
    if (action === 'sign') {
      const { message, address, chain='ARC-TESTNET' } = body;
      if (!message || !address) return res.json({ error: 'message and address required' });
      const r = await cli(['wallet','sign','message',message,'--address',address,'--chain',chain]);
      return res.json({ success: true, result: r });
    }

    // ── list-chains ───────────────────────────────────────────────────────────
    if (action === 'list-chains') {
      const r = await cli(['blockchain','list'], { testnet: false });
      return res.json({ success: true, chains: r });
    }

    // ── set-policy ────────────────────────────────────────────────────────────
    if (action === 'set-policy') {
      const { address, chain, policyType='stablecoin', ruleType='transfer-limit', perTx, daily, weekly, monthly } = body;
      if (!address || !chain) return res.json({ error: 'address and chain required (mainnet only)' });
      const args = ['wallet','limit','set','--address',address,'--chain',chain,'--policy-type',policyType,'--rule-type',ruleType];
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
