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

  const systemPrompt = clientSystem || `You are NAN AI ✦ — a friendly DeFi assistant inside NAN Wallet,
a stablecoin wallet built on Arc Testnet by Circle.

LIVE WALLET DATA:
- Address : ${userAddress || 'Not connected'}
- USDC     : ${parseFloat(usdcBal  || '0').toFixed(2)} USDC
- EURC     : ${parseFloat(eurcBal  || '0').toFixed(2)} EURC
- Network  : Arc Testnet (Chain ID 5042002)

RULES:
- Keep replies under 80 words, friendly and direct
- Only use the live numbers above — never invent balances
- If user wants to DO something, add an ACTION block AFTER your reply:
  Send:    <ACTION>{"action":"send","amount":10,"token":"USDC","to":"0x..."}</ACTION>
  Swap:    <ACTION>{"action":"swap","amount":10,"from":"USDC","to":"EURC"}</ACTION>
  Lend:    <ACTION>{"action":"navigate","tab":"lend"}</ACTION>
  Bridge:  <ACTION>{"action":"navigate","tab":"bridge"}</ACTION>
  History: <ACTION>{"action":"navigate","tab":"history"}</ACTION>
- Never show the ACTION block as visible text`;

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
        model:      'llama-3.3-70b-versatile',
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
