// api/chat.js — NAN AI powered by Groq + Circle Agent Stack awareness
const rateLimitMap = new Map();

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
    agentWallets,       // Agent Wallet addresses by chain (if user has set up Agent Stack)
    agentWalletActive,  // bool — whether Agent Stack session is active
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

  const systemPrompt = clientSystem || `You are NAN AI ✦ — a smart DeFi assistant inside NAN Wallet on Arc Testnet. Be concise, friendly, direct. No markdown.

LIVE WALLET DATA (use these exact numbers):
- Address: ${userAddress || 'Not connected'}
- Wallet type: ${agentWalletActive ? 'Circle Agent Wallet + Developer-Controlled Wallet' : 'Circle Developer-Controlled Wallet (email login)'}
- USDC Balance: ${parseFloat(usdcBal || '0').toFixed(2)} USDC
- EURC Balance: ${parseFloat(eurcBal || '0').toFixed(2)} EURC
- Network: Arc Testnet (Chain ID 5042002, gas in USDC ~0.009/tx)
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

  Main wallet (Developer-Controlled):
  <ACTION>{"action":"send","amount":10,"token":"USDC","to":"0x..."}</ACTION>
  <ACTION>{"action":"swap","amount":10,"from":"USDC","to":"EURC"}</ACTION>
  <ACTION>{"action":"navigate","tab":"earn"}</ACTION>
  <ACTION>{"action":"navigate","tab":"bridge"}</ACTION>
  <ACTION>{"action":"navigate","tab":"agent-wallet"}</ACTION>

  Circle Agent Wallet (MPC, autonomous - use when user says "agent wallet" or "from agent"):
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
  <ACTION>{"action":"agent-balance","chain":"ARC-TESTNET"}</ACTION>
  <ACTION>{"action":"agent-fund","chain":"ARC-TESTNET"}</ACTION>
  <ACTION>{"action":"agent-transfer","amount":0.1,"token":"USDC","toAddress":"0x...","chain":"ARC-TESTNET"}</ACTION>
  <ACTION>{"action":"agent-swap","sellToken":"USDC","sellAmount":1,"buyToken":"EURC","chain":"ARC-TESTNET","quoteOnly":false}</ACTION>
  <ACTION>{"action":"agent-bridge","toChain":"ETH-SEPOLIA","amount":0.5,"fromChain":"ARC-TESTNET"}</ACTION>
  <ACTION>{"action":"agent-services-search","query":"financial"}</ACTION>
  <ACTION>{"action":"agent-pay-service","url":"https://...","maxAmount":0.01}</ACTION>
  <ACTION>{"action":"agent-tx-list","chain":"ARC-TESTNET"}</ACTION>
  <ACTION>{"action":"agent-setup"}</ACTION>

- Tab names: send, swap, earn, history, bridge, arcname, bulk, payreq, agent-wallet
- Never mention ACTION blocks in replies
- If user asks about Agent Stack features but hasn't set it up, suggest navigating to agent-wallet tab`;

  const safeMessages = messages
    .slice(-10)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

    const data = await r.json();
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
