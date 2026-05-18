export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });

  const { system, messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid messages' });

  try {
    const payload = {
      model: 'llama-3.3-70b-versatile',
      max_tokens: 500,
      messages: [
        { role: 'system', content: system || 'You are NAN AI, a helpful DeFi assistant.' },
        ...messages.slice(-10),
      ],
    };

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error('Groq error:', data);
      return res.status(r.status).json({ error: data?.error?.message || 'Groq API error', raw: data });
    }

    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response.";
    return res.json({ reply });

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}