// api/chat.js
// NAN AI assistant — Claude primary, Groq fallback
// Rate limited per IP (in-memory; use Upstash/Vercel KV in production for multi-instance safety)

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

  const { messages, usdcBal, eurcBal, userAddress, system: clientSystem } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0 || messages.length > 20)
    return res.status(400).json({ error: 'Invalid messages array' });

  // Verified contract addresses from docs.arc.io/arc/references/contract-addresses
  const systemPrompt = clientSystem || `You are NAN AI ✦ — a friendly DeFi assistant inside NAN Wallet,
a stablecoin wallet built on Arc Testnet by Circle.

LIVE WALLET DATA (use these exact numbers, never fabricate):
- Address : ${userAddress || 'Not connected'}
- USDC     : ${parseFloat(usdcBal  || '0').toFixed(2)} USDC
- EURC     : ${parseFloat(eurcBal  || '0').toFixed(2)} EURC
- Network  : Arc Testnet (Chain ID 5042002)
- Gas      : Paid in USDC via Circle Paymaster — no ETH needed

ARC TESTNET FACTS (verified from docs.arc.io):
- USDC address : 0x3600000000000000000000000000000000000000 (6 decimals ERC-20, 18 decimals native gas)
- EURC address : 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a (6 decimals)
- CCTP domain  : 26 (TokenMessengerV2: 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA)
- Permit2      : 0x000000000022D473030F116dDEE9F6B43aC78BA3
- FxEscrow     : 0x867650F5eAe8df91445971f14d89fd84F0C9a9f8 (StableFX settlement)
- Band Oracle  : 0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68 (USDC/USD feed only)
- Sub-second finality, 150M+ testnet transactions, ~1.5M wallets (first 90 days)

CIRCLE PRODUCTS IN NAN:
- USDC Paymaster: users pay gas in USDC — never need ETH or native tokens
- CCTP V2: burn USDC on Arc, mint natively on 17+ chains (V1 deprecated July 2026)
- StableFX: institutional RFQ USDC↔EURC swap — requires separate API key from Circle
- Circle Gateway: unified USDC balance across chains (<500ms transfers)
- Developer-Controlled Wallets: real Circle wallets created via email login

RULES:
- Keep replies under 80 words, friendly and direct
- Only use the live numbers above — never invent balances
- If user wants to DO something, add an ACTION block AFTER your reply text:
  Send:    <ACTION>{"action":"send","amount":10,"token":"USDC","to":"0x..."}</ACTION>
  Swap:    <ACTION>{"action":"swap","amount":10,"from":"USDC","to":"EURC"}</ACTION>
  Lend:    <ACTION>{"action":"navigate","tab":"lend"}</ACTION>
  Bridge:  <ACTION>{"action":"navigate","tab":"bridge"}</ACTION>
  Name:    <ACTION>{"action":"navigate","tab":"arcname"}</ACTION>
  History: <ACTION>{"action":"navigate","tab":"history"}</ACTION>
- Never output the ACTION block as visible text — it is parsed by the app`;

  const safeMessages = messages
    .slice(-10)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  // ── Claude (primary) ──────────────────────────────────────────────────────
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (ANTHROPIC_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 512,
          system:     systemPrompt,
          messages:   safeMessages,
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || 'Anthropic error');

      let reply = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
      let navigatePage = null;
      let action = null;

      const navMatch    = reply.match(/NAVIGATE:(\w+)/);
      const actionMatch = reply.match(/<ACTION>([\s\S]*?)<\/ACTION>/);

      if (navMatch)    { navigatePage = navMatch[1]; }
      if (actionMatch) {
        try { action = JSON.parse(actionMatch[1].trim()); } catch {}
        if (action?.action === 'navigate') navigatePage = action.tab;
      }

      reply = reply.replace(/NAVIGATE:\s*\w+/g, '').replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();

      return res.json({ reply, navigatePage, action });

    } catch (err) {
      console.error('Anthropic failed:', err.message);
      // Fall through to Groq
    }
  }

  // ── Groq (fallback) ───────────────────────────────────────────────────────
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'No AI key configured' });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages:   [{ role: 'system', content: systemPrompt }, ...safeMessages],
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(429).json({ error: 'AI service busy — try again shortly' });

    let reply = data.choices?.[0]?.message?.content || 'No response.';
    let navigatePage = null;
    let action = null;

    const navMatch    = reply.match(/NAVIGATE:(\w+)/);
    const actionMatch = reply.match(/<ACTION>([\s\S]*?)<\/ACTION>/);

    if (navMatch)    { navigatePage = navMatch[1]; }
    if (actionMatch) {
      try { action = JSON.parse(actionMatch[1].trim()); } catch {}
      if (action?.action === 'navigate') navigatePage = action.tab;
    }

    reply = reply.replace(/NAVIGATE:\s*\w+/g, '').replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();

    return res.json({ reply, navigatePage, action });

  } catch (err) {
    console.error('Groq error:', err.message);
    return res.status(500).json({ error: 'AI service unavailable' });
  }
}
