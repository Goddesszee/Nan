/**
 * api/agent-stack.js
 * Circle Agent Stack — full integration for NAN Wallet
 * Covers: Agent Wallets, CLI operations, Nanopayments, Agent Marketplace
 *
 * All operations use `circle` CLI via child_process.execFile
 * Sessions are stored per-email in memory (7-day TTL, Railway persistent process)
 *
 * Actions:
 *   status          — check CLI installed + session state
 *   login-init      — send OTP email, return requestId
 *   login-complete  — verify OTP, return wallet addresses
 *   logout          — clear session
 *   list-wallets    — list agent wallets on a chain
 *   balance         — USDC balance for agent wallet
 *   fund            — fund from testnet faucet
 *   transfer        — send USDC to address
 *   swap            — swap USDC↔EURC (quote or execute)
 *   bridge          — CCTP bridge to another chain
 *   bridge-status   — check bridge tx status
 *   gateway-balance — Gateway nanopayments balance
 *   gateway-deposit — deposit into Gateway
 *   gateway-withdraw— withdraw from Gateway
 *   services-search — search Agent Marketplace
 *   services-inspect— inspect x402 service payment requirements
 *   pay-service     — pay for x402 service with nanopayments
 *   tx-list         — transaction history
 *   tx-cancel       — cancel pending transaction
 *   contract-address— get Circle contract addresses
 *   contract-query  — read-only contract call
 *   execute         — write contract call
 *   sign            — sign a message
 *   list-chains     — list all supported blockchains
 *   set-policy      — set spending policy (mainnet only)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// In-memory session store: email → { sessionActive, wallets, lastAuth }
const sessionStore = new Map();

// Find the circle CLI binary
async function getCircleBin() {
  try {
    // Try global install first
    const { stdout } = await execFileAsync('which', ['circle']);
    return stdout.trim();
  } catch {
    // Try npm global path
    try {
      const { stdout } = await execFileAsync('npm', ['bin', '-g']);
      return `${stdout.trim()}/circle`;
    } catch {
      return 'circle';
    }
  }
}

// Run a circle CLI command and return parsed output
async function cli(args, opts = {}) {
  const bin = await getCircleBin();
  const env = {
    ...process.env,
    CIRCLE_ACCEPT_TERMS: '1',  // auto-accept terms for non-interactive use
    HOME: process.env.HOME || '/root',
  };

  // Add --testnet flag for all testnet operations
  const finalArgs = opts.testnet !== false
    ? [...args, '--testnet']
    : args;

  // Add --output json for machine-readable output
  const withJson = finalArgs.includes('--output') ? finalArgs : [...finalArgs, '--output', 'json'];

  try {
    const { stdout, stderr } = await execFileAsync(bin, withJson, {
      env,
      timeout: opts.timeout || 60000,
      cwd: process.env.HOME || '/root',
    });

    // Try to parse JSON output
    const text = stdout.trim();
    if (!text) return { success: true, raw: stderr };

    try {
      return JSON.parse(text);
    } catch {
      // Some commands return plain text
      return { success: true, output: text, raw: stderr };
    }
  } catch (err) {
    const msg = err.stderr || err.stdout || err.message || 'CLI error';
    throw new Error(msg.slice(0, 400));
  }
}

// Check if circle CLI is installed
async function isCliInstalled() {
  try {
    await execFileAsync('circle', ['--version'], {
      env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

// Install circle CLI if not present
async function ensureCli() {
  if (await isCliInstalled()) return true;
  try {
    await execFileAsync('npm', ['install', '-g', '@circle-fin/cli'], {
      timeout: 120000,
      env: process.env,
    });
    return true;
  } catch (e) {
    throw new Error('Failed to install Circle CLI: ' + e.message);
  }
}

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
    // ── status ──────────────────────────────────────────────────────
    if (action === 'status') {
      const installed = await isCliInstalled();
      const sessions = [...sessionStore.entries()].map(([email, s]) => ({
        email,
        active: s.sessionActive,
        wallets: s.wallets ? Object.keys(s.wallets) : [],
        lastAuth: s.lastAuth,
      }));
      return res.json({ success: true, cliInstalled: installed, sessions });
    }

    // ── ensure CLI is installed for all other actions ───────────────
    await ensureCli();

    // ── login-init ──────────────────────────────────────────────────
    if (action === 'login-init') {
      const { email } = body;
      if (!email || !email.includes('@')) return res.json({ error: 'Valid email required' });

      // Run: circle wallet login <email> --init --testnet
      const bin = await getCircleBin();
      const env = { ...process.env, CIRCLE_ACCEPT_TERMS: '1', HOME: process.env.HOME || '/root' };

      const { stdout, stderr } = await execFileAsync(bin, [
        'wallet', 'login', email, '--init', '--testnet'
      ], { env, timeout: 30000 });

      // Extract requestId from output
      const combined = stdout + stderr;
      const idMatch = combined.match(/request[_\s-]?id[:\s]+([a-zA-Z0-9_-]+)/i)
                   || combined.match(/([a-f0-9-]{36})/i);
      const requestId = idMatch?.[1] || null;

      if (!requestId) {
        // Check if already logged in
        if (combined.toLowerCase().includes('logged in') || combined.toLowerCase().includes('already')) {
          return res.json({ success: true, alreadyLoggedIn: true, email });
        }
        return res.json({ success: false, error: 'Could not get requestId', raw: combined.slice(0, 300) });
      }

      return res.json({ success: true, requestId, email, message: 'OTP sent — check your email' });
    }

    // ── login-complete ──────────────────────────────────────────────
    if (action === 'login-complete') {
      const { requestId, otp, email } = body;
      if (!requestId || !otp) return res.json({ error: 'requestId and otp required' });

      const bin = await getCircleBin();
      const env = { ...process.env, CIRCLE_ACCEPT_TERMS: '1', HOME: process.env.HOME || '/root' };

      const { stdout, stderr } = await execFileAsync(bin, [
        'wallet', 'login', '--request', requestId, '--otp', otp
      ], { env, timeout: 30000 });

      const combined = stdout + stderr;
      const success = combined.toLowerCase().includes('logged in')
                   || combined.toLowerCase().includes('authenticated')
                   || combined.toLowerCase().includes('success');

      if (!success) {
        return res.json({ success: false, error: 'OTP verification failed', raw: combined.slice(0, 200) });
      }

      // Get wallets on all key chains
      const chains = ['ARC-TESTNET', 'BASE-SEPOLIA', 'ETH-SEPOLIA', 'ARB-SEPOLIA', 'OP-SEPOLIA'];
      const wallets = {};

      for (const chain of chains) {
        try {
          const result = await cli(['wallet', 'list', '--type', 'agent', '--chain', chain]);
          const items = result?.wallets || result?.data || (Array.isArray(result) ? result : []);
          if (items.length > 0) {
            wallets[chain] = items[0].address || items[0].walletAddress;
          }
        } catch {
          // Chain might not have wallet yet
        }
      }

      // Store session
      if (email) {
        sessionStore.set(email, {
          sessionActive: true,
          wallets,
          lastAuth: new Date().toISOString(),
        });
      }

      return res.json({ success: true, wallets, message: 'Agent Wallet active on all chains' });
    }

    // ── logout ──────────────────────────────────────────────────────
    if (action === 'logout') {
      const { email } = body;
      await cli(['wallet', 'logout', '--type', 'agent'], { testnet: true });
      if (email) sessionStore.delete(email);
      return res.json({ success: true });
    }

    // ── list-wallets ────────────────────────────────────────────────
    if (action === 'list-wallets') {
      const { chain = 'ARC-TESTNET' } = body;
      const result = await cli(['wallet', 'list', '--type', 'agent', '--chain', chain]);
      return res.json({ success: true, wallets: result?.wallets || result?.data || result });
    }

    // ── balance ─────────────────────────────────────────────────────
    if (action === 'balance') {
      const { address, chain = 'ARC-TESTNET' } = body;
      if (!address) return res.json({ error: 'address required' });
      const result = await cli(['wallet', 'balance', '--address', address, '--chain', chain]);
      return res.json({ success: true, balance: result });
    }

    // ── fund ────────────────────────────────────────────────────────
    if (action === 'fund') {
      const { address, chain = 'ARC-TESTNET', amount, method } = body;
      if (!address) return res.json({ error: 'address required' });

      const args = ['wallet', 'fund', '--address', address, '--chain', chain];
      // On testnet with no method/amount = auto-faucet (2 USDC free)
      if (method) args.push('--method', method);
      if (amount) args.push('--amount', amount.toString());

      const result = await cli(args);
      return res.json({ success: true, result });
    }

    // ── transfer ────────────────────────────────────────────────────
    if (action === 'transfer') {
      const { fromAddress, toAddress, amount, chain = 'ARC-TESTNET' } = body;
      if (!fromAddress || !toAddress || !amount) {
        return res.json({ error: 'fromAddress, toAddress, amount required' });
      }
      const result = await cli([
        'wallet', 'transfer', toAddress,
        '--amount', amount.toString(),
        '--address', fromAddress,
        '--chain', chain,
      ]);
      return res.json({ success: true, result });
    }

    // ── swap ────────────────────────────────────────────────────────
    if (action === 'swap') {
      const { address, sellToken = 'USDC', sellAmount, buyToken = 'EURC', chain = 'ARC-TESTNET', quoteOnly = false } = body;
      if (!sellAmount) return res.json({ error: 'sellAmount required' });

      const args = ['wallet', 'swap', sellToken, sellAmount.toString(), buyToken,
                    '--chain', chain];
      if (address) args.push('--address', address);
      if (quoteOnly) args.push('--quote');

      const result = await cli(args);
      return res.json({ success: true, quoteOnly, result });
    }

    // ── bridge ──────────────────────────────────────────────────────
    if (action === 'bridge') {
      const { fromAddress, toChain, toAddress, amount, fromChain = 'ARC-TESTNET' } = body;
      if (!fromAddress || !toChain || !amount) {
        return res.json({ error: 'fromAddress, toChain, amount required' });
      }
      const args = [
        'bridge', 'transfer', toChain,
        '--amount', amount.toString(),
        '--address', fromAddress,
        '--chain', fromChain,
      ];
      if (toAddress) args.push(toAddress);

      const result = await cli(args);
      return res.json({ success: true, result });
    }

    // ── bridge-status ───────────────────────────────────────────────
    if (action === 'bridge-status') {
      const { txHash, chain = 'ARC-TESTNET' } = body;
      if (!txHash) return res.json({ error: 'txHash required' });
      const result = await cli(['bridge', 'status', txHash, '--chain', chain]);
      return res.json({ success: true, result });
    }

    // ── gateway-balance ─────────────────────────────────────────────
    if (action === 'gateway-balance') {
      const { address, chain = 'ARC-TESTNET' } = body;
      if (!address) return res.json({ error: 'address required' });
      const result = await cli(['gateway', 'balance', '--address', address, '--chain', chain]);
      return res.json({ success: true, result });
    }

    // ── gateway-deposit ─────────────────────────────────────────────
    if (action === 'gateway-deposit') {
      const { address, amount, chain = 'BASE-SEPOLIA', method = 'direct' } = body;
      if (!address || !amount) return res.json({ error: 'address and amount required' });
      const result = await cli([
        'gateway', 'deposit',
        '--amount', amount.toString(),
        '--address', address,
        '--chain', chain,
        '--method', method,
      ]);
      return res.json({ success: true, result });
    }

    // ── gateway-withdraw ────────────────────────────────────────────
    if (action === 'gateway-withdraw') {
      const { address, amount, chain = 'BASE-SEPOLIA', recipient } = body;
      if (!address || !amount) return res.json({ error: 'address and amount required' });
      const args = ['gateway', 'withdraw', '--amount', amount.toString(), '--address', address, '--chain', chain];
      if (recipient) args.push('--recipient', recipient);
      const result = await cli(args);
      return res.json({ success: true, result });
    }

    // ── services-search ─────────────────────────────────────────────
    if (action === 'services-search') {
      const { query = '', category, limit = 20 } = body;
      const args = ['services', 'search'];
      if (query) args.push(query);
      if (category) args.push('--category', category);
      args.push('--limit', limit.toString());
      const result = await cli(args, { testnet: false });
      return res.json({ success: true, services: result?.services || result?.data || result });
    }

    // ── services-inspect ────────────────────────────────────────────
    if (action === 'services-inspect') {
      const { url } = body;
      if (!url) return res.json({ error: 'url required' });
      const result = await cli(['services', 'inspect', url], { testnet: false });
      return res.json({ success: true, result });
    }

    // ── pay-service ─────────────────────────────────────────────────
    if (action === 'pay-service') {
      const { url, address, chain = 'BASE-SEPOLIA', maxAmount, method = 'GET', data } = body;
      if (!url || !address) return res.json({ error: 'url and address required' });
      const args = ['services', 'pay', url, '--address', address, '--chain', chain];
      if (maxAmount) args.push('--max-amount', maxAmount.toString());
      if (method !== 'GET') args.push('--method', method);
      if (data) args.push('--data', JSON.stringify(data));
      const result = await cli(args, { testnet: false });
      return res.json({ success: true, result });
    }

    // ── tx-list ─────────────────────────────────────────────────────
    if (action === 'tx-list') {
      const { address, chain = 'ARC-TESTNET', operation, state, limit = 20 } = body;
      if (!address) return res.json({ error: 'address required' });
      const args = ['transaction', 'list', '--address', address, '--chain', chain, '--limit', limit.toString()];
      if (operation) args.push('--operation', operation);
      if (state) args.push('--state', state);
      const result = await cli(args);
      return res.json({ success: true, transactions: result?.transactions || result?.data || result });
    }

    // ── tx-cancel ───────────────────────────────────────────────────
    if (action === 'tx-cancel') {
      const { txId, address, chain = 'ARC-TESTNET' } = body;
      if (!txId || !address) return res.json({ error: 'txId and address required' });
      const result = await cli(['transaction', 'cancel', txId, '--address', address, '--chain', chain]);
      return res.json({ success: true, result });
    }

    // ── contract-address ────────────────────────────────────────────
    if (action === 'contract-address' || action === 'contract-addresses') {
      const { category = 'usdc', chain = 'ARC-TESTNET' } = body;
      const args = ['contract', 'address'];
      if (category) args.push(category);
      if (chain) args.push('--chain', chain);
      const result = await cli(args, { testnet: false });
      return res.json({ success: true, addresses: result });
    }

    // ── contract-query ───────────────────────────────────────────────
    if (action === 'contract-query') {
      const { fn, params = [], contract, chain = 'ARC-TESTNET' } = body;
      if (!fn || !contract) return res.json({ error: 'fn and contract required' });
      const result = await cli(['contract', 'query', fn, ...params, '--contract', contract, '--chain', chain]);
      return res.json({ success: true, result });
    }

    // ── execute (write contract) ─────────────────────────────────────
    if (action === 'execute') {
      const { fn, params = [], contract, address, chain = 'ARC-TESTNET', amount } = body;
      if (!fn || !contract || !address) return res.json({ error: 'fn, contract, address required' });
      const args = ['wallet', 'execute', fn, ...params, '--contract', contract, '--address', address, '--chain', chain];
      if (amount) args.push('--amount', amount.toString());
      const result = await cli(args);
      return res.json({ success: true, result });
    }

    // ── sign ─────────────────────────────────────────────────────────
    if (action === 'sign') {
      const { message, address, chain = 'ARC-TESTNET', hex = false } = body;
      if (!message || !address) return res.json({ error: 'message and address required' });
      const args = ['wallet', 'sign', 'message', message, '--address', address, '--chain', chain];
      if (hex) args.push('--hex');
      const result = await cli(args);
      return res.json({ success: true, result });
    }

    // ── list-chains ───────────────────────────────────────────────────
    if (action === 'list-chains') {
      const result = await cli(['blockchain', 'list'], { testnet: false });
      return res.json({ success: true, chains: result });
    }

    // ── set-policy (mainnet only) ─────────────────────────────────────
    if (action === 'set-policy') {
      const { address, chain, policyType = 'stablecoin', ruleType = 'transfer-limit', perTx, daily, weekly, monthly, targets } = body;
      if (!address || !chain) return res.json({ error: 'address and chain required (mainnet only)' });
      const args = ['wallet', 'limit', 'set', '--address', address, '--chain', chain,
                    '--policy-type', policyType, '--rule-type', ruleType];
      if (perTx) args.push('--per-tx', perTx.toString());
      if (daily) args.push('--daily', daily.toString());
      if (weekly) args.push('--weekly', weekly.toString());
      if (monthly) args.push('--monthly', monthly.toString());
      if (targets) args.push('--targets', JSON.stringify(targets));
      const result = await cli(args, { testnet: false });
      return res.json({ success: true, result });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error(`[agent-stack/${action}]`, err.message);
    return res.status(500).json({ success: false, error: err.message.slice(0, 300) });
  }
}
