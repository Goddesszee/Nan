/**
 * NAN App — Backend Server
 * Redeployed: 2026-05-28 01:24 UTC
 * Handles: Circle Wallets API, OTP email auth, faucet proxy, Claude AI chat
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ── In-memory stores (use Redis/DB in production) ──
const otpStore = new Map();      // email -> { otp, expires, attempts }
const userStore = new Map();     // email -> { circleUserId, userToken, walletId, walletAddress }
const walletTokens = new Map();  // walletAddress -> userToken (for API calls)

// ── Config ──
const CIRCLE_API_KEY   = process.env.CIRCLE_API_KEY   || '';
const CIRCLE_BASE_URL  = process.env.CIRCLE_BASE_URL  || 'https://api.circle.com/v1/w3s';
const GROQ_API_KEY     = process.env.GROQ_API_KEY     || '';
const SMTP_HOST        = process.env.SMTP_HOST        || 'smtp.gmail.com';
const SMTP_PORT        = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER        = process.env.SMTP_USER        || '';
const SMTP_PASS        = process.env.SMTP_PASS        || '';
const PORT             = parseInt(process.env.PORT    || '3000');

// Arc Testnet config
const ARC_CHAIN_ID   = 'ARB-SEPOLIA';
const ARC_BLOCKCHAIN = 'ARB-SEPOLIA';

// ─────────────────────────────────────────────
// Helper: Circle API proxy
// ─────────────────────────────────────────────
async function circleRequest(method, apiPath, body, userToken) {
  const { default: fetch } = await import('node-fetch');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CIRCLE_API_KEY}`,
  };
  if (userToken) {
    headers['X-User-Token'] = userToken;
  }

  const url = `${CIRCLE_BASE_URL}${apiPath}`;
  const options = { method, headers };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json();
  return { status: res.status, data };
}

// ─────────────────────────────────────────────
// Helper: Send OTP email
// ─────────────────────────────────────────────
async function sendOTPEmail(email, otp) {
  if (!SMTP_USER || !SMTP_PASS) {
    console.log(`\n📧 OTP for ${email}: ${otp}\n`);
    return { success: true, dev: true };
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: `"NAN Wallet" <${SMTP_USER}>`,
    to: email,
    subject: 'Your NAN login code',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;">
        <div style="background:#07081a;border-radius:16px;padding:24px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#a78bfa;letter-spacing:-1px;margin-bottom:8px;">NAN</div>
          <div style="color:#c4b5fd;font-size:14px;margin-bottom:24px;">Weave. Connect. Build.</div>
          <div style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:12px;padding:20px;margin-bottom:20px;">
            <div style="color:#6b5fa0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">Your login code</div>
            <div style="font-family:monospace;font-size:36px;font-weight:700;color:#ede9fe;letter-spacing:8px;">${otp}</div>
          </div>
          <div style="color:#6b5fa0;font-size:12px;">Expires in 10 minutes. Never share this code.</div>
        </div>
      </div>
    `,
  });

  return { success: true };
}

// ─────────────────────────────────────────────
// Helper: Create or retrieve Circle user + wallet
// ─────────────────────────────────────────────
async function getOrCreateCircleWallet(email) {
  if (userStore.has(email)) {
    const existing = userStore.get(email);
    console.log(`Returning existing wallet for ${email}:`, existing.walletAddress);
    return existing;
  }

  if (!CIRCLE_API_KEY) {
    const hash = crypto.createHash('sha256').update(email).digest('hex');
    const mockAddress = '0x' + hash.slice(0, 40);
    const userData = {
      circleUserId: 'dev-' + hash.slice(0, 8),
      userToken: 'dev-token-' + hash.slice(0, 16),
      walletId: 'dev-wallet-' + hash.slice(0, 8),
      walletAddress: mockAddress,
      email,
      dev: true,
    };
    userStore.set(email, userData);
    walletTokens.set(mockAddress, userData.userToken);
    return userData;
  }

  const idempotencyKey = crypto.randomUUID();
  const userRes = await circleRequest('POST', '/users', { idempotencyKey });

  if (userRes.status !== 201 && userRes.status !== 200) {
    throw new Error(`Circle user creation failed: ${JSON.stringify(userRes.data)}`);
  }

  const circleUserId = userRes.data?.data?.id;
  if (!circleUserId) throw new Error('No user ID returned from Circle');

  const tokenRes = await circleRequest('POST', `/users/token`, { userId: circleUserId });
  const userToken = tokenRes.data?.data?.userToken;
  if (!userToken) throw new Error('No user token returned from Circle');

  const walletRes = await circleRequest('POST', '/user/wallets', {
    idempotencyKey: crypto.randomUUID(),
    blockchains: ['ARC-TESTNET'],
    name: `NAN-${email}`,
  }, userToken);

  const wallets = walletRes.data?.data?.wallets;
  if (!wallets || wallets.length === 0) throw new Error('No wallet created');

  const wallet = wallets[0];
  const userData = {
    circleUserId,
    userToken,
    walletId: wallet.id,
    walletAddress: wallet.address,
    email,
  };

  userStore.set(email, userData);
  walletTokens.set(wallet.address, userToken);
  return userData;
}

// ═════════════════════════════════════════════
// ROUTES
// ═════════════════════════════════════════════

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    circle: !!CIRCLE_API_KEY,
    groq: !!GROQ_API_KEY,
    smtp: !!SMTP_USER,
    time: new Date().toISOString(),
  });
});

// ── OTP: Send & Verify ──
app.post('/api/otp', async (req, res) => {
  try {
    const mod = await import('../api/otp.js');
    return mod.default(req, res);
  } catch(e) {
    console.error('[otp]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});;

// ── Circle API Proxy ──
app.post('/api/circle', async (req, res) => {
  const { path: apiPath, body, method = 'GET', userToken } = req.body;

  if (!CIRCLE_API_KEY) {
    if (apiPath && apiPath.includes('balances')) {
      return res.json({
        data: {
          tokenBalances: [
            { token: { symbol: 'USDC', decimals: 6 }, amount: '100.000000' },
            { token: { symbol: 'EURC', decimals: 6 }, amount: '50.000000' },
          ]
        }
      });
    }
    return res.json({ data: {}, dev: true });
  }

  if (!apiPath) return res.status(400).json({ error: 'path required' });

  try {
    const result = await circleRequest(method, apiPath, body, userToken);
    res.status(result.status).json(result.data);
  } catch (err) {
    console.error('Circle proxy error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Circle Wallet Balances ──
app.get('/api/balances/:walletId', async (req, res) => {
  const { walletId } = req.params;
  const userToken = walletTokens.get(req.query.address) || req.headers['x-user-token'];

  if (!CIRCLE_API_KEY) {
    return res.json({ usdc: '100.00', eurc: '50.00', dev: true });
  }

  try {
    const result = await circleRequest('GET', `/wallets/${walletId}/balances`, null, userToken);
    const balances = result.data?.data?.tokenBalances || [];
    const usdc = balances.find(b => b.token.symbol === 'USDC')?.amount || '0';
    const eurc = balances.find(b => b.token.symbol === 'EURC')?.amount || '0';
    res.json({ usdc, eurc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Circle Transfer ──
app.post('/api/transfer', async (req, res) => {
  const { walletId, destinationAddress, amount, tokenSymbol, userToken } = req.body;

  if (!CIRCLE_API_KEY) {
    return res.json({
      success: true,
      txHash: '0xdev' + crypto.randomBytes(32).toString('hex'),
      dev: true,
    });
  }

  const TOKEN_IDS = {
    'USDC': process.env.USDC_TOKEN_ID || '36b6931a-873a-56a8-8a27-b706b17104ee',
    'EURC': process.env.EURC_TOKEN_ID || '1b6b4d90-3602-5e74-9249-5202f14b4f93',
  };

  const tokenId = TOKEN_IDS[tokenSymbol];
  if (!tokenId) return res.status(400).json({ error: 'Unknown token' });

  try {
    const result = await circleRequest('POST', '/user/transactions/transfer', {
      idempotencyKey: crypto.randomUUID(),
      walletId,
      tokenId,
      destinationAddress,
      amounts: [amount.toString()],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    }, userToken);

    if (result.status !== 201 && result.status !== 200) {
      return res.status(result.status).json({ error: result.data?.message || 'Transfer failed' });
    }

    res.json({
      success: true,
      transactionId: result.data?.data?.id,
      txHash: result.data?.data?.txHash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Transaction Status ──
app.get('/api/transaction/:txId', async (req, res) => {
  const { txId } = req.params;
  const userToken = req.headers['x-user-token'];

  if (!CIRCLE_API_KEY || txId.startsWith('0xdev')) {
    return res.json({ state: 'CONFIRMED', txHash: txId });
  }

  try {
    const result = await circleRequest('GET', `/transactions/${txId}`, null, userToken);
    res.json(result.data?.data || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Faucet Proxy ──
app.post('/api/faucet', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address required' });

  const { default: fetch } = await import('node-fetch');
  try {
    const faucetRes = await fetch('https://faucet.circle.com/api/faucet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        blockchain: 'ARC-TESTNET',
        native: false,
        tokens: ['USDC', 'EURC'],
      }),
    });

    if (faucetRes.ok) {
      const data = await faucetRes.json();
      return res.json({ success: true, data });
    }

    return res.json({ success: false, error: 'Faucet unavailable — visit faucet.circle.com directly' });
  } catch (err) {
    return res.json({ success: false, error: 'Faucet request failed — visit faucet.circle.com directly' });
  }
});

// ── Groq AI Chat ──
app.post('/api/chat', async (req, res) => {
  const { system, messages } = req.body;
  const { default: fetch } = await import('node-fetch');

  if (!GROQ_API_KEY) {
    const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
    let reply = "I'm NAN AI ✦ — running in dev mode. Add GROQ_API_KEY to enable real AI responses.";
    if (lastMsg.includes('balance')) reply = "Your balance info is shown in the wallet card above.";
    if (lastMsg.includes('send') || lastMsg.includes('transfer')) reply = "To send tokens, use the Send tab. <ACTION>{\"action\":\"navigate\",\"tab\":\"send\"}</ACTION>";
    if (lastMsg.includes('stake')) reply = "You can stake USDC to earn 5.20% APY. <ACTION>{\"action\":\"navigate\",\"tab\":\"stake\"}</ACTION>";
    if (lastMsg.includes('swap')) reply = "Swap between USDC and EURC at live exchange rates. <ACTION>{\"action\":\"navigate\",\"tab\":\"swap\"}</ACTION>";
    if (lastMsg.includes('bridge')) reply = "Bridge USDC cross-chain via Circle CCTP. <ACTION>{\"action\":\"navigate\",\"tab\":\"bridge\"}</ACTION>";
    return res.json({ reply });
  }

  try {
    const groqMessages = [
      { role: 'system', content: system || 'You are NAN AI, a helpful wallet assistant.' },
      ...(messages || []),
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 512,
        temperature: 0.7,
        messages: groqMessages,
      }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
    res.json({ reply });
  } catch (err) {
    console.error('Groq API error:', err);
    res.status(500).json({ reply: "Connection error — please try again." });
  }
});


// ── Circle Wallets proxy (forward to api/circle-wallets.js handler) ──────────
app.post('/api/circle-wallets', async (req, res) => {
  try {
    const mod = await import('../api/circle-wallets.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── CCTP Attest ───────────────────────────────────────────────────────────────
app.post('/api/cctp-attest', async (req, res) => {
  try {
    const mod = await import('../api/cctp-attest.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── FX Rate ───────────────────────────────────────────────────────────────────
app.get('/api/fx-rate', async (req, res) => {
  try {
    const mod = await import('../api/fx-rate.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Gateway balance ───────────────────────────────────────────────────────────
app.post('/api/gateway', async (req, res) => {
  try {
    const mod = await import('../api/gateway.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/gateway', async (req, res) => {
  try {
    const mod = await import('../api/gateway.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Gateway deposit ───────────────────────────────────────────────────────────
app.post('/api/gateway-deposit', async (req, res) => {
  try {
    const mod = await import('../api/gateway-deposit.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Notify ────────────────────────────────────────────────────────────────────
app.post('/api/notify', async (req, res) => {
  try {
    const mod = await import('../api/notify.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Orders ────────────────────────────────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  try {
    const mod = await import('../api/orders.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/orders', async (req, res) => {
  try {
    const mod = await import('../api/orders.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/orders', async (req, res) => {
  try {
    const mod = await import('../api/orders.js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Transaction status ────────────────────────────────────────────────────────
app.get('/api/transaction/:txId', async (req, res) => {
  try {
    req.query = req.query || {};
    req.query.id = req.params.txId;
    const mod = await import('../api/transaction/[id].js');
    return mod.default(req, res);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Serve frontend ──
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../app.html'));
});


// =============================================================================
// App Kit Routes — send, swap, bridge via @circle-fin/app-kit
// Runs on Railway (persistent Node server) NOT Vercel (serverless)
// =============================================================================

const APPKIT_CHAIN   = 'Arc_Testnet'; // App Kit uses Arc_Testnet, NOT ARC-TESTNET
const APPKIT_USDC    = process.env.USDC_ADDRESS      || '0x3600000000000000000000000000000000000000';
const APPKIT_EURC    = process.env.EURC_ADDRESS      || '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

const BRIDGE_CHAIN_MAP = {
  'ETH-SEPOLIA':  'Ethereum_Sepolia',
  'AVAX-FUJI':    'Avalanche_Fuji',
  'BASE-SEPOLIA': 'Base_Sepolia',
  'ARB-SEPOLIA':  'Arbitrum_Sepolia',
  'OP-SEPOLIA':   'Optimism_Sepolia',
  'POLYGON-AMOY': 'Polygon_Amoy_Testnet',
};

async function getAppKit() {
  const { AppKit }                    = await import('@circle-fin/app-kit');
  const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets');
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required');
  const adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  return { kit: new AppKit({ adapter }), adapter };
}

// POST /api/appkit/send
app.post('/api/appkit/send', async (req, res) => {
  const { walletAddress, destinationAddress, amount, tokenSymbol } = req.body || {};
  const token  = (tokenSymbol || 'USDC').toUpperCase();
  const parsed = parseFloat(amount);
  const TOKEN_ADDRESSES = { USDC: APPKIT_USDC, EURC: APPKIT_EURC };

  if (!walletAddress || !destinationAddress || !parsed || parsed <= 0)
    return res.json({ success: false, error: 'walletAddress, destinationAddress, amount required' });
  if (!TOKEN_ADDRESSES[token])
    return res.json({ success: false, error: 'Unsupported token. Use USDC or EURC' });
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
    return res.json({ success: true, txHash: '0xdev_send_' + Date.now(), state: 'success', dev: true });

  try {
    const { kit, adapter } = await getAppKit();
    const result = await kit.send({
      from:   { adapter, chain: APPKIT_CHAIN, address: walletAddress },
      to:     destinationAddress,
      amount: parsed.toString(),
      token:  TOKEN_ADDRESSES[token],
    });
    res.json({ success: true, txHash: result.txHash || null, state: result.state, explorerUrl: result.explorerUrl || null });
  } catch (err) {
    console.error('[appkit/send]', err.message);
    res.json({ success: false, error: err.message.slice(0, 150) });
  }
});

// POST /api/appkit/swap  (action: quote | swap)
app.post('/api/appkit/swap', async (req, res) => {
  const { action, walletAddress, tokenIn, tokenOut, amountIn } = req.body || {};
  const fromToken = (tokenIn  || 'USDC').toUpperCase();
  const toToken   = (tokenOut || 'EURC').toUpperCase();
  const amtIn     = parseFloat(amountIn);

  if (!amtIn || amtIn <= 0)
    return res.json({ success: false, error: 'Valid amountIn required' });

  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    const rate = fromToken === 'USDC' ? 0.9224 : 1.0842;
    const amountOut = (amtIn * rate * 0.999).toFixed(6);
    return res.json({ success: true, amountOut, estimatedOutput: { amount: amountOut, token: toToken }, dev: true });
  }

  try {
    const { kit, adapter } = await getAppKit();
    const swapParams = {
      from:     { adapter, chain: APPKIT_CHAIN, address: walletAddress || 'estimate' },
      tokenIn:  fromToken,
      tokenOut: toToken,
      amountIn: amtIn.toString(),
      config:   {
        slippageBps: 300,
        ...(process.env.KIT_KEY ? { kitKey: process.env.KIT_KEY } : {}),
      },
    };

    if (action === 'quote') {
      const estimate = await kit.estimateSwap(swapParams);
      return res.json({
        success:         true,
        amountOut:       estimate.estimatedOutput?.amount || null,
        estimatedOutput: estimate.estimatedOutput || null,
        stopLimit:       estimate.stopLimit || null,
        fees:            estimate.fees || null,
      });
    }

    if (!walletAddress)
      return res.json({ success: false, error: 'walletAddress required for swap' });

    const result = await kit.swap(swapParams);
    res.json({ success: true, txHash: result.txHash || null, amountOut: result.amountOut || null, explorerUrl: result.explorerUrl || null });
  } catch (err) {
    console.error('[appkit/swap]', err.message);
    if (err.message.includes('not supported') || err.message.includes('Arc'))
      return res.json({ success: false, fallback: true, error: 'AppKit swap not available on Arc Testnet' });
    res.json({ success: false, error: err.message.slice(0, 150) });
  }
});

// POST /api/appkit/bridge
app.post('/api/appkit/bridge', async (req, res) => {
  const { walletAddress, destChain, destAddr, amount } = req.body || {};
  const parsed      = parseFloat(amount);
  const destChainName = BRIDGE_CHAIN_MAP[destChain];

  if (!walletAddress || !destChain || !destAddr || !parsed || parsed <= 0)
    return res.json({ success: false, error: 'walletAddress, destChain, destAddr, amount required' });
  if (!destChainName)
    return res.json({ success: false, error: 'Unsupported chain: ' + destChain });
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
    return res.json({ success: true, state: 'success', burnTxHash: '0xdev_burn_' + Date.now(), mintTxHash: '0xdev_mint_' + Date.now(), dev: true });

  try {
    const { kit, adapter } = await getAppKit();
    const result = await kit.bridge({
      from: { adapter, chain: APPKIT_CHAIN, address: walletAddress },
      to:   { adapter, chain: destChainName, address: destAddr },
      amount: parsed.toFixed(2),
      token:  'USDC',
    });
    const burnStep = result.steps?.find(s => s.name?.includes('burn'));
    const mintStep = result.steps?.find(s => s.name?.includes('mint'));
    res.json({
      success:    result.state === 'success' || result.state === 'pending',
      state:      result.state,
      burnTxHash: burnStep?.txHash || null,
      mintTxHash: mintStep?.txHash || null,
      steps:      result.steps?.map(s => ({ name: s.name, state: s.state, txHash: s.txHash || null })) || [],
    });
  } catch (err) {
    console.error('[appkit/bridge]', err.message);
    res.json({ success: false, error: err.message.slice(0, 200) });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n🚀 NAN App running at http://localhost:${PORT}`);
  console.log(`\n📊 Config status:`);
  console.log(`   Circle API: ${CIRCLE_API_KEY ? '✅ configured' : '⚠️  DEV MODE (no key)'}`);
  console.log(`   Groq AI:    ${GROQ_API_KEY ? '✅ configured' : '⚠️  DEV MODE (no key)'}`);
  console.log(`   SMTP Email: ${SMTP_USER ? '✅ configured' : '⚠️  DEV MODE (OTP logged to console)'}`);
  console.log(`\n💡 Set environment variables in .env to enable production features\n`);
});
