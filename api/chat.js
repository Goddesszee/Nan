export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, usdcBal, eurcBal, userAddress } = req.body;
  if (!messages || messages.length > 20) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  const systemPrompt = `You are Arcloom AI — a friendly DeFi assistant inside Arcloom, a stablecoin wallet on Arc Testnet by Circle.

LIVE WALLET DATA:
- Address: ${userAddress || 'Not connected'}
- USDC Balance: ${usdcBal || '0'} USDC
- EURC Balance: ${eurcBal || '0'} EURC
- Network: Arc Testnet — gas paid in USDC, no ETH needed
- Staking APY: 5.20% — no lockup

FEATURES:
- Send USDC/EURC to wallet address or Twitter/Discord handle
- Swap USDC to EURC at live rates
- Stake USDC for 5.20% APY
- Link Twitter or Discord handle to wallet

RULES:
- Short friendly replies under 80 words
- Never make up numbers, only use live data above
- If user wants to navigate somewhere add NAVIGATE:pagename at end
  Pages: send, swap, stake, handle, history`;

  // Try Anthropic Claude first
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (ANTHROPIC_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: systemPrompt,
          messages: messages.slice(-10).map(m => ({
            role: m.role,
            content: String(m.content),
          })),
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || 'Anthropic error');

      let reply = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || 'No response.';
      let navigatePage = null;
      const nav = reply.match(/NAVIGATE:(\w+)/);
      if (nav) { navigatePage = nav[1]; reply = reply.replace(/NAVIGATE:\s*\w+/g, '').trim(); }

      return res.json({ reply, navigatePage });
    } catch (err) {
      console.error('Anthropic failed:', err.message);
    }
  }

  // Fallback to Groq
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'No AI key set in Vercel environment variables' });

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

    let reply = data.choices?.[0]?.message?.content || 'No response.';
    let navigatePage = null;
    const nav = reply.match(/NAVIGATE:(\w+)/);
    if (nav) { navigatePage = nav[1]; reply = reply.replace(/NAVIGATE:\w+/g, '').trim(); }

    return res.json({ reply, navigatePage });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
