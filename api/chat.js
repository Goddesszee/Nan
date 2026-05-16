export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { system, messages } = req.body;
  const fetch = (await import('node-fetch')).default;
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

  if (!GROQ_API_KEY) {
    const lastMsg = messages?.[messages.length - 1]?.content?.toLowerCase() || '';
    let reply = "I'm NAN AI — add GROQ_API_KEY to enable real responses.";
    if (lastMsg.includes('balance')) reply = "Your balance is shown in the wallet card above.";
    if (lastMsg.includes('send')) reply = "Use the Send tab to transfer USDC or EURC.";
    if (lastMsg.includes('stake')) reply = "Stake USDC to earn 5.20% APY in the Stake tab.";
    return res.json({ reply });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 512,
        temperature: 0.7,
        messages: [
          { role: 'system', content: system || 'You are NAN AI, a helpful wallet assistant.' },
          ...(messages || [])
        ]
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, couldn't generate a response.";
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ reply: "Connection error — please try again." });
  }
}
