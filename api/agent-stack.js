/**
 * api/agent-stack.js — Circle Agent Stack for NAN Wallet
 * v3 — non-blocking login, fast responses, no 502s
 */

import { execFile, exec } from 'child_process';
import { promisify } from 'util';

const execAsync  = promisify(exec);
const execFileP  = promisify(execFile);

// Session store: email → { sessionActive, wallets, lastAuth, pending }
export const sessionStore = new Map();
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
// /tmp persists within a Railway container (not across redeploys)
const CLI_HOME = '/tmp/circle-home';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
try { mkdirSync(CLI_HOME + '/.config/circle', { recursive: true }); } catch {}

const UPSTASH_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${UPSTASH_URL}/${encodeURIComponent('GET')}/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, signal: AbortSignal.timeout(5000)
    });
    const d = await r.json();
    return d.result || null;
  } catch { return null; }
}

async function redisSet(key, value) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    const { default: fetch } = await import('node-fetch');
    await fetch(`${UPSTASH_URL}/${encodeURIComponent('SET')}/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, signal: AbortSignal.timeout(5000)
    });
  } catch {}
}

async function saveCliConfigToRedis(email) {
  try {
    const configDir = CLI_HOME + '/.config/circle';
    if (!existsSync(configDir)) return;
    const files = readdirSync(configDir);
    const configMap = {};
    for (const f of files) {
      try { configMap[f] = readFileSync(configDir + '/' + f, 'utf8'); } catch {}
    }
    if (Object.keys(configMap).length) {
      await redisSet('nan:circle-cli:' + email.toLowerCase(), JSON.stringify(configMap));
      console.log('[agent] CLI config saved to Redis for', email);
    }
  } catch(e) { console.log('[agent] Could not save CLI config:', e.message); }
}

async function restoreCliConfigFromRedis(email) {
  try {
    const raw = await redisGet('nan:circle-cli:' + email.toLowerCase());
    if (!raw) return false;
    const configMap = JSON.parse(raw);
    const configDir = CLI_HOME + '/.config/circle';
    mkdirSync(configDir, { recursive: true });
    for (const [filename, content] of Object.entries(configMap)) {
      writeFileSync(configDir + '/' + filename, content, 'utf8');
    }
    console.log('[agent] CLI config restored from Redis for', email);
    return true;
  } catch(e) { console.log('[agent] Could not restore CLI config:', e.message); return false; }
}

// On startup — restore CLI config for all known sessions
async function restoreAllSessions() {
  try {
    if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${UPSTASH_URL}/${encodeURIComponent('KEYS')}/${encodeURIComponent('nan:circle-cli:*')}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const d = await r.json();
    const keys = d.result || [];
    for (const key of keys) {
      const email = key.replace('nan:circle-cli:', '');
      const restored = await restoreCliConfigFromRedis(email);
      if (restored) {
        // Verify session is active by checking wallet list
        try {
          const { stdout } = await import('child_process').then(m => m.execFileP ? m : { execFileP: null });
        } catch {}
        sessionStore.set(email, { sessionActive: true, pending: false, wallets: {}, lastAuth: 'restored', restored: true });
        console.log('[agent] Session pre-restored for', email);
      }
    }
  } catch(e) { console.log('[agent] Session restore error:', e.message); }
}

// Run restore on startup
restoreAllSessions();

function cliEnv() {
  return {
    ...process.env,
    CIRCLE_ACCEPT_TERMS: '1',
    HOME: CLI_HOME,
    XDG_CONFIG_HOME: CLI_HOME + '/.config',
    XDG_DATA_HOME: CLI_HOME + '/.local/share',
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
      // CLI returns: { wallets: { wallets: [ { address, blockchain, type } ] } }
      // or: { wallets: [ { address, ... } ] }
      // or: [ { address, ... } ]
      let items = [];
      if (Array.isArray(r)) {
        items = r;
      } else if (Array.isArray(r?.wallets?.wallets)) {
        items = r.wallets.wallets;
      } else if (Array.isArray(r?.wallets)) {
        items = r.wallets;
      } else if (Array.isArray(r?.data)) {
        items = r.data;
      }
      if (items.length > 0) {
        const addr = items[0].address || items[0].walletAddress;
        if (addr && addr.startsWith('0x')) wallets[chain] = addr;
      }
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
          const ok = /logged.?in|authenticated|success|wallet|address/i.test(out);
          if (!ok) {
            sessionStore.set(resolvedEmail, { sessionActive: false, pending: false, error: 'OTP failed: ' + out.slice(0,100) });
            return;
          }

          // Try to extract wallet address directly from login output
          const addrMatch = out.match(/0x[a-fA-F0-9]{40}/);
          let wallets = {};
          if (addrMatch) {
            wallets['ARC-TESTNET'] = addrMatch[0];
            console.log('[agent-stack] Got address from login output:', addrMatch[0]);
          }

          // Also try fetchWallets for other chains
          try {
            const fetched = await fetchWallets();
            wallets = { ...wallets, ...fetched };
          } catch {}

          // If still empty, do a direct list call with raw output
          if (Object.keys(wallets).length === 0) {
            try {
              const rawList = await cliRaw(['wallet','list','--type','agent','--chain','ARC-TESTNET','--testnet'], 30000);
              const m = rawList.match(/0x[a-fA-F0-9]{40}/);
              if (m) wallets['ARC-TESTNET'] = m[0];
            } catch {}
          }

          sessionStore.set(resolvedEmail, { sessionActive: true, pending: false, wallets, lastAuth: new Date().toISOString() });
          // Save CLI config to Redis so session survives Railway restarts
          saveCliConfigToRedis(resolvedEmail);
          console.log('[agent-stack] Login complete for', resolvedEmail, '— wallets:', wallets);
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
      let session = sessionStore.get(email);
      // If no session in memory — try restoring from Redis silently
      if (!session && email) {
        const restored = await restoreCliConfigFromRedis(email);
        if (restored) {
          try {
            const walletOut = await cliRaw(['wallet','list','--testnet'], 15000);
            const wallets = {};
            const arcM = walletOut.match(/ARC[^:]*:\s*(0x[a-fA-F0-9]{40})/i);
            if (arcM) wallets['ARC-TESTNET'] = arcM[1];
            sessionStore.set(email, { sessionActive: true, pending: false, wallets, lastAuth: 'auto-restored' });
            session = sessionStore.get(email);
            console.log('[agent] Session auto-restored from Redis for', email);
          } catch(e) {
            console.log('[agent] CLI restore verify failed:', e.message);
          }
        }
      }
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
    // CLI syntax: circle wallet fund --address <addr> --chain <chain>
    // On testnet: requests tokens from Circle faucet (requires active agent login)
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
      if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) return res.json({ error: `Invalid destination address: ${toAddress}` });
      try {
        // CLI syntax: circle wallet transfer <recipient> --amount X --address <from> --chain X
        const args = ['wallet','transfer',
          toAddress,
          '--amount', String(amount),
          '--address', fromAddress,
          '--chain', chain,
          '--testnet'
        ];
        const r = await cli(args);
        // Check for success in output
        const rStr = typeof r === 'string' ? r : JSON.stringify(r||'');
        const success = rStr && !rStr.toLowerCase().includes('error') && !rStr.toLowerCase().includes('failed');
        const txHashM = rStr.match(/0x[a-fA-F0-9]{64}/);
        console.log(`[transfer] ${success?'✅':'❌'} ${amount} USDC → ${toAddress.slice(0,10)}`);
        return res.json({ success, txHash: txHashM?.[0], result: rStr, error: success ? undefined : rStr.slice(0,200) });
      } catch(e) {
        console.error('[transfer] CLI failed:', e.message);
        return res.json({ success: false, error: e.message.slice(0,200) });
      }
    }

    // ── swap ──────────────────────────────────────────────────────────────────
    if (action === 'swap') {
      const { address, sellToken='USDC', sellAmount, buyToken='EURC', chain='ARC-TESTNET', quoteOnly=false } = body;
      if (!sellAmount) return res.json({ error: 'sellAmount required' });
      // CLI syntax: circle wallet swap <sellToken> <sellAmount> <buyToken> --chain <chain> [--address <addr>]
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

    // ── pay-and-capture ──────────────────────────────────────────────────────
    if (action === 'pay-and-capture') {
      const { url: payUrl, chain='ARC-TESTNET' } = body;
      const privateKey = process.env.AGENT_WALLET_PRIVATE_KEY;
      if (!privateKey) return res.json({ error: 'AGENT_WALLET_PRIVATE_KEY not set' });
      try {
        const { GatewayClient } = await import('@circle-fin/x402-batching/client');
        const client = new GatewayClient({
          chain: 'arcTestnet',
          privateKey: privateKey.startsWith('0x') ? privateKey : '0x' + privateKey,
        });

        // Intercept fetch to capture settle request
        const origFetch = global.fetch;
        let capturedSettle = null;
        let capturedSettleResponse = null;
        global.fetch = async (u, opts) => {
          if (String(u).includes('/x402/settle')) {
            capturedSettle = { url: u, body: opts?.body };
            const r = await origFetch(u, opts);
            const text = await r.text();
            capturedSettleResponse = { status: r.status, body: text };
            // Return fake response to prevent SDK error
            return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
          }
          return origFetch(u, opts);
        };

        let payResult = null;
        let payError = null;
        try {
          const result = await client.pay(payUrl);
          payResult = JSON.parse(JSON.stringify(result, (k,v) => typeof v === 'bigint' ? v.toString() : v));
        } catch(e) { payError = e.message; }
        
        global.fetch = origFetch;

        return res.json({
          payResult,
          payError,
          settleRequest: capturedSettle ? JSON.parse(capturedSettle.body || '{}') : null,
          settleResponse: capturedSettleResponse
        });
      } catch(e) { return res.json({ error: e.message }); }
    }

    // ── test-settle ───────────────────────────────────────────────────────────
    if (action === 'test-settle') {
      // Test the Circle Gateway settle endpoint directly with a dummy payload
      const requirements = {
        scheme: 'exact',
        network: 'eip155:5042002',
        asset: '0x3600000000000000000000000000000000000000',
        amount: '1000',
        maxTimeoutSeconds: 604900,
        payTo: '0xd83498B62d2ab0650A4Edfc7929c96804aA75F77',
        extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' }
      };
      const dummyPayload = { scheme: 'exact', network: 'eip155:5042002', payload: { signature: '0x0', from: '0xd83498B62d2ab0650A4Edfc7929c96804aA75F77', to: '0xd83498B62d2ab0650A4Edfc7929c96804aA75F77', value: '1000', validAfter: '0', validBefore: '9999999999', nonce: '0x0' } };
      try {
        const r = await fetch('https://gateway-api-testnet.circle.com/v1/x402/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentPayload: dummyPayload, paymentRequirements: requirements })
        });
        const text = await r.text();
        return res.json({ status: r.status, response: text });
      } catch(e) { return res.json({ error: e.message }); }
    }

    // ── debug-x402 ───────────────────────────────────────────────────────────
    if (action === 'debug-x402') {
      const { url: debugUrl } = body;
      if (!debugUrl) return res.json({ error: 'url required' });
      try {
        const r = await fetch(debugUrl, { method: 'GET' });
        const allHeaders = {};
        r.headers.forEach((v, k) => { allHeaders[k] = v; });
        const body2 = await r.text();
        return res.json({
          status: r.status,
          headers: allHeaders,
          hasPaymentRequired: !!r.headers.get('PAYMENT-REQUIRED'),
          hasPaymentRequiredLower: !!r.headers.get('payment-required'),
          paymentRequiredValue: r.headers.get('PAYMENT-REQUIRED') || r.headers.get('payment-required') || null,
          body: body2.slice(0, 500)
        });
      } catch(e) { return res.json({ error: e.message }); }
    }

    // ── gateway-deposit-sdk ──────────────────────────────────────────────────
    // Deposits USDC from AGENT_WALLET_PRIVATE_KEY EOA into Gateway using SDK
    if (action === 'gateway-deposit-sdk') {
      const { chain='ARC-TESTNET', amount='1', force=false } = body;
      const privateKey = process.env.AGENT_WALLET_PRIVATE_KEY;
      if (!privateKey) return res.json({ error: 'AGENT_WALLET_PRIVATE_KEY not set' });
      try {
        const chainMap = { 'ARC-TESTNET': 'arcTestnet', 'BASE-SEPOLIA': 'baseSepolia' };
        const chainName = chainMap[chain] || 'arcTestnet';
        const { GatewayClient } = await import('@circle-fin/x402-batching/client');
        const client = new GatewayClient({
          chain: chainName,
          privateKey: privateKey.startsWith('0x') ? privateKey : '0x' + privateKey,
        });
        const balances = await client.getBalances();
        const gatewayBal = balances.gateway.formattedAvailable;
        const walletBal  = balances.wallet.formatted;
        console.log('[deposit-sdk] gateway:', gatewayBal, 'wallet:', walletBal);
        if (force || balances.gateway.available < 500000n) {
          console.log('[deposit-sdk] Depositing', amount, 'USDC into Gateway...');
          const deposit = await client.deposit(amount || '1');
          const safe = JSON.parse(JSON.stringify(deposit, (k,v) => typeof v === 'bigint' ? v.toString() : v));
          // Check new balance
          const newBal = await client.getBalances();
          return res.json({ success: true, action: 'deposited', result: safe, newGatewayBalance: newBal.gateway.formattedAvailable });
        } else {
          return res.json({ success: true, action: 'already_funded', gatewayBalance: gatewayBal, walletBalance: walletBal });
        }
      } catch(e) { return res.json({ success: false, error: e.message }); }
    }

    // ── pay-service ───────────────────────────────────────────────────────────
    // Uses @circle-fin/x402-batching GatewayClient directly — no CLI session needed
    if (action === 'pay-service') {
      const { url, address, chain='ARC-TESTNET', maxAmount, method='GET' } = body;
      if (!url) return res.json({ error: 'url required' });

      const privateKey = process.env.AGENT_WALLET_PRIVATE_KEY;
      if (!privateKey) return res.json({ error: 'AGENT_WALLET_PRIVATE_KEY not set in environment' });

      try {
        const chainMap = {
          'ARC-TESTNET':  'arcTestnet',
          'BASE-SEPOLIA': 'baseSepolia',
          'BASE':         'base',
          'ETH-SEPOLIA':  'sepolia',
        };
        const chainName = chainMap[chain] || 'arcTestnet';
        const { GatewayClient } = await import('@circle-fin/x402-batching/client');
        const client = new GatewayClient({
          chain:      chainName,
          privateKey: privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
        });
        const fetchMethod = (method || 'GET').toUpperCase();
        const { data: responseData, status } = await client.pay(url, { method: fetchMethod });
        const safe = JSON.parse(JSON.stringify(responseData, (k,v) => typeof v === 'bigint' ? v.toString() : v));
        return res.json({ success: true, status, result: safe });
      } catch (e) {
        return res.json({ success: false, error: e.message });
      }
    }

    // ── tx-list ───────────────────────────────────────────────────────────────
    if (action === 'tx-list') {
      const { address, chain='ARC-TESTNET', limit=20 } = body;
      if (!address) return res.json({ error: 'address required' });
      // CLI syntax: circle transaction list --address <addr> --chain <chain> [--cursor <id>]
      // Note: no --limit flag; use --cursor for pagination
      const r = await cli(['transaction','list','--address',address,'--chain',chain]);
      return res.json({ success: true, transactions: r?.transactions || r?.data || r });
    }

    // ── tx-cancel ─────────────────────────────────────────────────────────────
    // NOTE: 'circle transaction cancel' does NOT exist in CLI v0.0.5.
    // Only 'circle transaction list' is available. Cancel via Circle SDK accelerateTransaction instead.
    if (action === 'tx-cancel') {
      return res.json({ success: false, error: 'tx-cancel not supported in CLI v0.0.5 — use Circle SDK cancelTransaction directly' });
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
    // Detect session-expired errors from Circle CLI
    const msg = err.message || '';
    if (/no wallet matches|not authenticated|login required|session expired|unauthorized/i.test(msg)) {
      return res.status(401).json({ success: false, error: 'Agent Wallet session expired — please reconnect', sessionExpired: true });
    }
    return res.status(500).json({ success: false, error: msg.slice(0, 300) });
  }
}
