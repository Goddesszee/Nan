// api/chat.js
// NAN AI Chat — Groq powered with live crypto prices from CoinGecko

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// Fetch live crypto prices from CoinGecko (free, no key needed)
async function getCryptoPrices(coins = []) {
  try {
    const ids = coins.join(',') || 'bitcoin,ethereum,usd-coin,euro-coin,solana,binancecoin,matic-network,avalanche-2,chainlink,uniswap';
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) throw new Error('CoinGecko failed');
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Get trending coins from CoinGecko
async function getTrending() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Trending failed');
    const data = await res.json();
    return data.coins?.slice(0, 7).map(c => ({
      name: c.item.name,
      symbol: c.item.symbol,
      rank: c.item.market_cap_rank,
      price_btc: c.item.price_btc,
    })) || [];
  } catch (e) {
    return [];
  }
}

// Detect if message is asking about prices or trending
function detectPriceQuery(msg) {
  const lower = msg.toLowerCase();
  const priceKeywords = ['price', 'worth', 'cost', 'value', 'how much', '$', 'usd'];
  const trendingKeywords = ['trending', 'hot', 'popular', 'top coins', 'gainers', 'what\'s pumping'];
  const coins = {
    'bitcoin': 'bitcoin', 'btc': 'bitcoin',
    'ethereum': 'ethereum', 'eth': 'ethereum',
    'solana': 'solana', 'sol': 'solana',
    'bnb': 'binancecoin', 'binance': 'binancecoin',
    'matic': 'matic-network', 'polygon': 'matic-network',
    'avax': 'avalanche-2', 'avalanche': 'avalanche-2',
    'link': 'chainlink', 'chainlink': 'chainlink',
    'uni': 'uniswap', 'uniswap': 'uniswap',
    'usdc': 'usd-coin', 'eurc': 'euro-coin',
    'xrp': 'ripple', 'ripple': 'ripple',
    'ada': 'cardano', 'cardano': 'cardano',
    'doge': 'dogecoin', 'dogecoin': 'dogecoin',
    'shib': 'shiba-inu',
  };

  const foundCoins = [];
  for (const [key, id] of Object.entries(coins)) {
    if (lower.includes(key)) foundCoins.push(id);
  }

  const isTrending = trendingKeywords.some(k => lower.includes(k));
  const isPrice = priceKeywords.some(k => lower.includes(k)) || foundCoins.length > 0;

  return { isPrice, isTrending, foundCoins: [...new Set(foundCoins)] };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { system, messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages' });

  const lastMsg = messages[messages.length - 1]?.content || '';
  const { isPrice, isTrending, foundCoins } = detectPriceQuery(lastMsg);

  // Fetch live data if needed
  let liveDataContext = '';

  if (isTrending) {
    const trending = await getTrending();
    if (trending.length) {
      liveDataContext += '\n\nTRENDING COINS RIGHT NOW:\n' +
        trending.map((c, i) => `${i+1}. ${c.name} (${c.symbol}) — Rank #${c.rank || '?'}`).join('\n');
    }
  }

  if (isPrice || foundCoins.length > 0) {
    const coinsToFetch = foundCoins.length > 0 ? foundCoins :
      ['bitcoin', 'ethereum', 'solana', 'usd-coin', 'euro-coin'];
    const prices = await getCryptoPrices(coinsToFetch);

    if (prices) {
      liveDataContext += '\n\nLIVE CRYPTO PRICES (from CoinGecko, just fetched):\n';
      const nameMap = {
        'bitcoin': 'Bitcoin (BTC)',
        'ethereum': 'Ethereum (ETH)',
        'solana': 'Solana (SOL)',
        'usd-coin': 'USDC',
        'euro-coin': 'EURC',
        'binancecoin': 'BNB',
        'matic-network': 'MATIC/Polygon',
        'avalanche-2': 'AVAX',
        'chainlink': 'Chainlink (LINK)',
        'uniswap': 'Uniswap (UNI)',
        'ripple': 'XRP',
        'cardano': 'Cardano (ADA)',
        'dogecoin': 'Dogecoin (DOGE)',
        'shiba-inu': 'Shiba Inu (SHIB)',
      };
      for (const [id, data] of Object.entries(prices)) {
        const name = nameMap[id] || id;
        const change = data.usd_24h_change?.toFixed(2);
        const changeStr = change ? ` (${change > 0 ? '+' : ''}${change}% 24h)` : '';
        liveDataContext += `${name}: $${data.usd?.toLocaleString()}${changeStr}\n`;
      }
    }
  }

  // Add live data to system prompt
  const enhancedSystem = (system || '') + liveDataContext;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          { role: 'system', content: enhancedSystem },
          ...messages.slice(-8), // last 8 messages for context
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || 'Groq API error');
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'Sorry, I had trouble responding.';

    return res.json({ reply: text });

  } catch (err) {
    console.error('Chat error:', err.message);
    return res.status(500).json({ error: err.message, reply: 'Sorry, AI is temporarily unavailable.' });
  }
}
