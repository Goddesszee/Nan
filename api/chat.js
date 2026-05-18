export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, walletId, userAddress, usdcBal, eurcBal } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  // ── Build system prompt with live wallet data ──────────────────
  const systemPrompt = `You are the Arcloom AI Agent — a friendly assistant inside Arcloom, a stablecoin dApp on Arc Testnet by Circle.

LIVE WALLET DATA (use these exact numbers, never make up values):
- Wallet Address: ${userAddress || 'Not connected'}
- USDC Balance: ${usdcBal || '0'} USDC
- EURC Balance: ${eurcBal || '0'} EURC
- Circle Wallet ID: ${walletId || 'None — user connected via MetaMask'}
- Network: Arc Testnet — gas paid in USDC, no ETH needed

ARCLOOM FEATURES:
- Send USDC/EURC to any wallet address or social handle (Twitter/Discord)
- Swap USDC ↔ EURC at live FX rates (1 USDC ≈ 0.9258 EURC)
- Stake USDC for 5.20% APY — no lockup, unstake anytime
- Link Twitter or Discord handle to your wallet address

NAVIGATION — if user wants to go somewhere, include exactly this JSON at the END of your reply on its own line:
NAVIGATE:send  or  NAVIGATE:swap  or  NAVIGATE:stake  or  NAVIGATE:handle  or  NAVIGATE:history

RULES:
- Keep replies short and friendly, under 80 words
- Never invent numbers — only use the live data above
- If wallet is not connected, tell user to click Connect Wallet first
- For sends/swaps, guide them to the right page using NAVIGATE`;

  // ── Try Anthropic Claude first ─────────────────────────────────
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (ANTHROPIC_KEY) {
    try {
      const claudeMessages = messages
        .filter(m => m.role && m.content)
        .slice(-10)
        .map(m => ({ role: m.role, content: String(m.content) }));

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: claudeMessages,
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || 'Anthropic error');

      let reply = data.content
        ?.filter(b => b.type === 'text')
        ?.map(b => b.text)
        ?.join('') || "Sorry, I couldn't get a response.";

      // Check if Claude included a NAVIGATE instruction
      let navigatePage = null;
      const navMatch = reply.match(/NAVIGATE:(\w+)/);
      if (navMatch) {
        navigatePage = navMatch[1];
        reply = reply.replace(/NAVIGATE:\w+/g, '').trim();
      }

      return res.json({ reply, navigatePage });

    } catch (err) {
      console.error('Anthropic failed, falling back to Groq:', err.message);
    }
  }

  // ── Fallback: Groq ─────────────────────────────────────────────
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) {
    return res.status(500).json({
      error: 'No AI key set. Add ANTHROPIC_API_KEY or GROQ_API_KEY in Vercel environment variables.'
    });
  }

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10),
        ],
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'Groq error' });

    let reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response.";
    let navigatePage = null;
    const navMatch = reply.match(/NAVIGATE:(\w+)/);
    if (navMatch) {
      navigatePage = navMatch[1];
      reply = reply.replace(/NAVIGATE:\w+/g, '').trim();
    }

    return res.json({ reply, navigatePage });

  } catch (err) {
    console.error('Groq error:', err);
    return res.status(500).json({ error: err.message });
  }
}