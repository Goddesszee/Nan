// api/chat.js — NAN AI powered by Groq + Circle Agent Stack awareness — v1780887355
const rateLimitMap = new Map();
let _activeGroqRequests = 0;
const MAX_CONCURRENT_GROQ = 5; // max parallel Groq calls

function checkRateLimit(ip, limit = 20, windowMs = 60_000) {
  const now    = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > windowMs) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (record.count >= limit) return false;
  record.count++;
  rateLimitMap.set(ip, record);
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip, 20, 60_000))
    return res.status(429).json({ error: 'Too many requests — please wait a minute' });

  const {
    messages,
    usdcBal,
    eurcBal,
    userAddress,
    system: clientSystem,
    agentWallets,
    agentWalletActive,
    agentWalletBalance,
    pendingOrders,
    recentTxs,
    arcNames,
    lendSupplied,
    lendBorrowed,
    gatewayBalance,
    fxRate,
  } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0 || messages.length > 20)
    return res.status(400).json({ error: 'Invalid messages array' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  // Build Agent Stack context string
  const agentStackContext = agentWallets
    ? `\nCIRCLE AGENT STACK STATUS: ACTIVE ✅
- Agent Wallet on Arc Testnet: ${agentWallets['ARC-TESTNET'] || 'not provisioned'}
- Agent Wallet on Base Sepolia: ${agentWallets['BASE-SEPOLIA'] || 'not provisioned'}
- Agent Wallet on ETH Sepolia: ${agentWallets['ETH-SEPOLIA'] || 'not provisioned'}
- Agent Wallets have SPENDING POLICIES, MPC custody, compliance screening
- Agent Wallets are USER-CONTROLLED (not developer-controlled like main wallet)
- For Agent Wallet actions use action type "agent-transfer", "agent-swap", "agent-bridge", "agent-fund", "agent-balance", "agent-pay-service"`
    : `\nCIRCLE AGENT STACK STATUS: NOT SET UP
- User has not connected a Circle Agent Wallet yet
- To set up: navigate to "Agent Wallet" tab in More page
- Agent Wallets are separate from the main Circle Developer-Controlled Wallet
- Agent Wallets support: spending policies, x402 nanopayments, Agent Marketplace`;

  // Always use our system prompt - clientSystem may be stale
  const _pendingOrdersStr = Array.isArray(pendingOrders) && pendingOrders.length > 0
    ? pendingOrders.join('\n') : 'No pending orders';
  const _recentTxsStr = Array.isArray(recentTxs) && recentTxs.length > 0
    ? recentTxs.join('\n') : 'No recent transactions';
  const _arcNamesStr = Array.isArray(arcNames) && arcNames.length > 0
    ? arcNames.join(', ') : 'none';

  const systemPrompt = `You are NAN AI ✦ — a smart DeFi assistant inside NAN Wallet on Arc Testnet. Be concise, friendly, direct. No markdown.

LIVE WALLET DATA (use these exact numbers — never invent or guess):
- Address: ${userAddress || 'Not connected'}
- Wallet type: ${agentWalletActive ? 'Circle Agent Wallet (autonomous sends) + Main Wallet' : 'Main Wallet (Circle Developer-Controlled)'}
- Agent wallet: ${agentWalletActive ? 'CONNECTED — use agent-send for autonomous sends' : 'NOT connected — sends use main wallet via send page'}
- Agent wallet balance: ${agentWalletBalance || (agentWalletActive ? 'use agent-balance action to fetch' : 'N/A')}
- USDC Balance: ${parseFloat(usdcBal || '0').toFixed(2)} USDC
- EURC Balance: ${parseFloat(eurcBal || '0').toFixed(2)} EURC
- FX Rate: ${fxRate ? `1 USDC = ${parseFloat(fxRate).toFixed(4)} EURC` : 'loading'}
- Gateway balance: ${gatewayBalance || 'N/A'}
- Lending: supplied ${parseFloat(lendSupplied||0).toFixed(2)} USDC, borrowed ${parseFloat(lendBorrowed||0).toFixed(2)} USDC
- .arc names owned: ${_arcNamesStr}
- Network: Arc Testnet (Chain ID 5042002, gas in USDC ~0.009/tx)

PENDING ORDERS (these are REAL — do not fabricate):
${_pendingOrdersStr}

RECENT TRANSACTIONS (these are REAL — do not fabricate):
${_recentTxsStr}
${agentStackContext}

CIRCLE AGENT STACK — WHAT IT IS:
- Launched May 11 2026 by Circle — financial infrastructure for AI agents
- Circle CLI (@circle-fin/cli) — unified command interface for wallets + payments
- Agent Wallets — user-controlled MPC wallets with spending policies, gas-sponsored
- Agent Nanopayments — sub-cent USDC payments via x402 protocol through Circle Gateway
- Agent Marketplace — discover x402-compatible API services at agents.circle.com
- Circle Skills — open-source AI agent knowledge for Claude Code, Cursor, Codex
- Arc Testnet is fully supported (ARC-TESTNET chain identifier)

NAN FEATURES:
- Send, Swap USDC↔EURC, Earn 4.80% APY, Borrow, Bridge via CCTP V2
- .arc names, Payment links, Payroll, Limit/Scheduled/Standing orders
- Circle Agent Wallet (new): autonomous wallet with spending controls
- Agent Nanopayments (new): pay for APIs and services with USDC

RULES:
- Under 80 words, friendly, direct, no markdown
- Use only real balance numbers above — never invent amounts
- Add ONE invisible ACTION block after reply when user wants to act:

  ${agentWalletActive ? '⚠️ AGENT WALLET IS ACTIVE — use agent-send for autonomous sends' : '⚠️ NO AGENT WALLET — use "send" action (opens prefilled send page, user confirms)'}
  ${agentWalletActive ? '<ACTION>{"action":"agent-send","amount":10,"token":"USDC","to":"address.arc"}</ACTION>' : '<ACTION>{"action":"send","amount":10,"token":"USDC","to":"0x..."}</ACTION>'}
  <ACTION>{"action":"swap","amount":10,"from":"USDC","to":"EURC"}</ACTION>
  <ACTION>{"action":"navigate","tab":"earn"}</ACTION>
  <ACTION>{"action":"navigate","tab":"bridge"}</ACTION>
  <ACTION>{"action":"navigate","tab":"agent-wallet"}</ACTION>

  Circle Agent Wallet (MPC, autonomous - only available when agent wallet is connected):
  <ACTION>{"action":"agent-send","amount":1,"token":"USDC","to":"0x... or name.arc"}</ACTION>
  <ACTION>{"action":"agent-balance"}</ACTION>
  <ACTION>{"action":"agent-history"}</ACTION>
  <ACTION>{"action":"agent-fund"}</ACTION>
  <ACTION>{"action":"agent-pay","serviceUrl":"https://...","amount":"0.001"}</ACTION>
  <ACTION>{"action":"agent-schedule","amount":5,"token":"USDC","to":"0x...","when":"every friday"}</ACTION>
  <ACTION>{"action":"agent-standing","amount":10,"token":"USDC","to":"0x...","freq":"weekly"}</ACTION>
  <ACTION>{"action":"payreq-create","amount":5,"token":"USDC","label":"Invoice #1","note":"For services"}</ACTION>
  <ACTION>{"action":"limit","amount":5,"sellToken":"USDC","buyToken":"EURC","targetRate":1.20,"condition":"gte"}</ACTION>

  Agent Wallet (Circle Agent Stack):
  <ACTION>{"action":"agent-swap","amount":5,"from":"USDC","to":"EURC"}</ACTION>
  <ACTION>{"action":"agent-bridge","amount":5,"toChain":"ETH-SEPOLIA"}</ACTION>
  <ACTION>{"action":"agent-multichain"}</ACTION>
  <ACTION>{"action":"agent-offramp","amount":10}</ACTION>
  <ACTION>{"action":"fx-limit-offramp","amount":50,"targetRate":1700,"condition":"gte"}</ACTION>
  <ACTION>{"action":"agent-payroll","group":"Engineering Team"}</ACTION>
  <ACTION>{"action":"agent-bills","billType":"airtime","phone":"08012345678","amount":1000,"network":"mtn"}</ACTION>
  <ACTION>{"action":"agent-bills","billType":"data","phone":"08012345678","plan":"mtn-10gb","network":"mtn"}</ACTION>
  <ACTION>{"action":"agent-bills","billType":"electricity","meter":"12345678901","amount":5000,"disco":"ekedc","meterType":"prepaid"}</ACTION>
  <ACTION>{"action":"agent-bills","billType":"cable","card":"1234567890","provider":"dstv","plan":"compact"}</ACTION>
  <ACTION>{"action":"cancel_order","id":"ord_abc123"}</ACTION>
  <ACTION>{"action":"cancel_all"}</ACTION>
  <ACTION>{"action":"agent-ngn-rate"}</ACTION>
  <ACTION>{"action":"agent-portfolio"}</ACTION>
  <ACTION>{"action":"agent-analytics"}</ACTION>
  <ACTION>{"action":"agent-price-alert","token":"EURC","targetPrice":1.05,"condition":"gte"}</ACTION>
  <ACTION>{"action":"agent-auto-sweep","threshold":50,"keep":10}</ACTION>
  <ACTION>{"action":"agent-data","phone":"08012345678","plan":"mtn-5gb","network":"mtn"}</ACTION>
  <ACTION>{"action":"agent-receipt"}</ACTION>

- Tab names: send, swap, earn, history, bridge, arcname, bulk, payreq, agent-wallet
- Never mention ACTION blocks in replies
- ALWAYS include <ACTION> tag when user wants to DO something — NEVER just describe it
- CRITICAL ADDRESS RULE: In ACTION tags NEVER use truncated addresses like "86B2...366a". Always use the original .arc name (e.g. "aunty.arc") OR a full 42-char 0x address. If unsure, use the .arc name from the user's message
- For agent wallet: ALWAYS use agent-send/agent-balance/agent-history/agent-fund/agent-standing/agent-schedule
- If agentWalletActive is true: ALWAYS use "agent-send" (autonomous, no popup). If false: use "send" (opens send page prefilled — user confirms with their wallet)
- For "sell USDC to naira when rate hits X": use fx-limit-offramp with targetRate=X (number only, no ₦ symbol)
- For "pay staff/team/payroll": use agent-payroll, include group name if mentioned
- For "cancel order [ID]": use cancel_order with the id field
- For "what's the NGN rate" or "how far is my FX order": use agent-ngn-rate
- For "list orders" or "show my orders": use list_orders
- For "cancel all orders": use cancel_all
- For airtime/recharge: use agent-bills with billType "airtime", include phone, amount (NGN), network (mtn/glo/airtel/9mobile)
- For data purchase: use agent-bills with billType "data", include phone, plan/variationCode, network
- For electricity bill: use agent-bills with billType "electricity", include meter number, amount (NGN), disco (ekedc/ikedc/aedc/phed etc)
- For cable TV (DSTV/GOtv/Startimes): use agent-bills with billType "cable", include card number, provider, plan (compact/confam/premium etc)
- For recurring bills (monthly DSTV, weekly airtime etc): combine agent-bills with agent-standing using taskType "bills"
- For "portfolio", "total balance", "net worth": use agent-portfolio
- For "spending", "analytics", "how much sent": use agent-analytics  
- For "alert me when X hits Y": use agent-price-alert with token, targetPrice, condition (gte/lte)
- For "auto sweep", "automatic transfer": use agent-auto-sweep with threshold amount
- For "buy data", "mobile data": use agent-data with phone, plan, network
- For "receipt", "generate receipt": use agent-receipt
- For "school fees", "remita": use agent-remita
- NEVER show JSON or ACTION text in your reply — it is invisible
- Reply must be plain English only — confirm what you're doing then include ACTION tag`;

  const safeMessages = messages
    .slice(-10)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  try {
    // Concurrency guard — prevent Groq rate limits under traffic
    if (_activeGroqRequests >= MAX_CONCURRENT_GROQ) {
      return res.status(429).json({ error: 'NAN AI is busy — please try again in a moment 🙏' });
    }
    _activeGroqRequests++;
    let r, data;
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:      'llama-3.1-8b-instant',
          max_tokens: 512,
          messages:   [{ role: 'system', content: systemPrompt }, ...safeMessages],
        }),
      });
      data = await r.json();
    } finally {
      _activeGroqRequests--;
    }
    if (!r.ok) {
      console.error('Groq error:', data);
      return res.status(500).json({ error: data?.error?.message || 'Groq error' });
    }

    let reply = data.choices?.[0]?.message?.content || 'No response.';
    let navigatePage = null;
    let action = null;

    const actionMatch = reply.match(/<ACTION>([\s\S]*?)<\/ACTION>/);
    if (actionMatch) {
      try { action = JSON.parse(actionMatch[1].trim()); } catch {}
      if (action?.action === 'navigate') navigatePage = action.tab;
    }

    reply = reply.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();
    return res.json({ reply, navigatePage, action });

  } catch (err) {
    console.error('Chat error:', err.message);
    return res.status(500).json({ error: 'AI service unavailable — try again shortly' });
  }
}
