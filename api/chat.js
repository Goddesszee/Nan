export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { system, messages } = req.body;
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

  // Dev mode responses
  if (!GROQ_API_KEY) {
    const lastMsg = messages?.[messages.length - 1]?.content?.toLowerCase() || '';
    let reply = "I'm NAN AI ✦ — add GROQ_API_KEY to Vercel to enable real AI responses.";
    if (lastMsg.includes('balance')) reply = "Your USDC and EURC balances are shown in the wallet card. Connect MetaMask for full access or use email login to view balances.";
    if (lastMsg.includes('send') || lastMsg.includes('transfer')) reply = "To send USDC or EURC, use the Send tab. Connect MetaMask for on-chain transactions. <ACTION>{\"action\":\"navigate\",\"tab\":\"send\"}</ACTION>";
    if (lastMsg.includes('stake')) reply = "Stake USDC to earn 5.20% APY on Arc Testnet. <ACTION>{\"action\":\"navigate\",\"tab\":\"stake\"}</ACTION>";
    if (lastMsg.includes('swap')) reply = "Swap between USDC and EURC at live EUR/USD rates. <ACTION>{\"action\":\"navigate\",\"tab\":\"swap\"}</ACTION>";
    if (lastMsg.includes('bridge')) reply = "Bridge USDC cross-chain via Circle CCTP — burn on Arc, mint on Ethereum, Base, Arbitrum and more. <ACTION>{\"action\":\"navigate\",\"tab\":\"bridge\"}</ACTION>";
    if (lastMsg.includes('arc')) reply = "Arc is Circle's stablecoin-native Layer-1 blockchain. It uses USDC as native gas, has sub-second finality, and is designed for the internet financial system.";
    return res.json({ reply });
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const groqMessages = [
      { role: 'system', content: system || 'You are NAN AI, a helpful wallet assistant on Arc Testnet.' },
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
    if (data.error) throw new Error(data.error.message);
    const reply = data.choices?.[0]?.message?.content || "Sorry, couldn't generate a response.";
    res.json({ reply });
  } catch (err) {
    console.error('Groq error:', err.message);
    res.status(500).json({ reply: "Connection error — please try again." });
  }
}
