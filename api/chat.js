// api/chat.js — NAN AI assistant powered by Groq
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

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  const systemPrompt = clientSystem || `You are NAN AI ✦ — a smart DeFi assistant inside NAN Wallet on Arc Testnet by Circle.

LIVE WALLET:
- Address: ${userAddress || 'Not connected'}
- USDC: ${parseFloat(usdcBal || '0').toFixed(2)} USDC
- EURC: ${parseFloat(eurcBal || '0').toFixed(2)} EURC
- Network: Arc Testnet (Chain ID 5042002, gas in USDC ~0.009/tx)

NAN FEATURES: Send, Swap USDC↔EURC, Earn 7.2% APY, Borrow, Bridge via CCTP, .arc names, Payment links, Payroll, Limit/Scheduled/Standing orders.

RULES:
- Under 60 words, friendly, direct, no markdown
- Use only real balance numbers above — never invent amounts
- Add ONE invisible ACTION block after reply when user wants to act:
  <ACTION>{"action":"send","amount":10,"token":"USDC","to":"0x..."}</ACTION>
  <ACTION>{"action":"swap","amount":10,"from":"USDC","to":"EURC"}</ACTION>
  <ACTION>{"action":"navigate","tab":"earn"}</ACTION>
  <ACTION>{"action":"limit","amount":5,"sellToken":"USDC","buyToken":"EURC","targetRate":1.20,"condition":"gte"}</ACTION>
- Tab names: send, swap, earn, history, bridge, arcname, bulk, payreq
- Never mention ACTION blocks in replies`;

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
