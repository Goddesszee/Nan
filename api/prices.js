// api/prices.js
// Live crypto prices and chart data from CoinGecko free API (no key needed)
// Endpoints:
//   POST { action: 'price', coins: ['bitcoin','ethereum','usd-coin'] }
//   POST { action: 'chart', coin: 'bitcoin', days: 7 }
//   POST { action: 'trending' }
//   POST { action: 'global' }

const COINGECKO = 'https://api.coingecko.com/api/v3';

const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > 60_000) { rateLimitMap.set(ip, { count: 1, start: now }); return true; }
  if (record.count >= 30) return false;
  record.count++;
  rateLimitMap.set(ip, record);
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests' });

  const { action, coins, coin, days } = req.body;

  try {
    // ── price: get current prices for multiple coins ────────────────────────
    if (action === 'price') {
      const ids = (coins || ['bitcoin', 'ethereum', 'usd-coin', 'euro-coin']).join(',');
      const r = await fetch(
        `${COINGECKO}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`
      );
      if (!r.ok) throw new Error('CoinGecko price failed');
      const data = await r.json();
      return res.json({ success: true, prices: data });
    }

    // ── chart: get 7/30 day price history for charting ─────────────────────
    if (action === 'chart') {
      const id    = coin || 'bitcoin';
      const d     = days || 7;
      const r = await fetch(
        `${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${d}`
      );
      if (!r.ok) throw new Error('CoinGecko chart failed');
      const data = await r.json();
      // data.prices is array of [timestamp, price]
      return res.json({ success: true, coin: id, days: d, prices: data.prices, volumes: data.total_volumes });
    }

    // ── trending: top trending coins right now ─────────────────────────────
    if (action === 'trending') {
      const r = await fetch(`${COINGECKO}/search/trending`);
      if (!r.ok) throw new Error('CoinGecko trending failed');
      const data = await r.json();
      const coins = data.coins?.slice(0, 6).map(c => ({
        id:     c.item.id,
        name:   c.item.name,
        symbol: c.item.symbol,
        rank:   c.item.market_cap_rank,
        thumb:  c.item.thumb,
        price_btc: c.item.price_btc,
      }));
      return res.json({ success: true, trending: coins });
    }

    // ── global: global crypto market stats ────────────────────────────────
    if (action === 'global') {
      const r = await fetch(`${COINGECKO}/global`);
      if (!r.ok) throw new Error('CoinGecko global failed');
      const data = await r.json();
      const g = data.data;
      return res.json({
        success: true,
        global: {
          total_market_cap_usd: g.total_market_cap?.usd,
          total_volume_usd:     g.total_volume?.usd,
          btc_dominance:        g.market_cap_percentage?.btc,
          eth_dominance:        g.market_cap_percentage?.eth,
          active_coins:         g.active_cryptocurrencies,
          market_cap_change_24h: g.market_cap_change_percentage_24h_usd,
        },
      });
    }

    return res.status(400).json({ error: 'Valid actions: price, chart, trending, global' });

  } catch (err) {
    console.error('Prices error:', err.message);
    return res.status(500).json({ error: 'Could not fetch crypto data — try again shortly' });
  }
}
