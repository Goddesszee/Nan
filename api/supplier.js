// api/supplier.js — NAN Supplier Agent: web-search-powered manufacturer/supplier discovery.
// Unlike Career Agent's RemoteOK/Arbeitnow sources, there is no free structured supplier API —
// Alibaba/1688/Global Sources don't expose open catalogs. Every result here is AI-researched
// from public web content, not pulled from a verified database. Label accordingly in the UI.
const rateLimitMap = new Map();

function checkRateLimit(ip, limit = 15, windowMs = 60_000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > windowMs) { rateLimitMap.set(ip, { count: 1, start: now }); return true; }
  if (record.count >= limit) return false;
  record.count++; rateLimitMap.set(ip, record);
  return true;
}

// Same pattern as career.js's callOpenAIWebSearch — duplicated here rather than shared across
// files to keep each endpoint self-contained, matching this repo's existing per-endpoint style.
async function callOpenAIWebSearch(OPENAI_KEY, query) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      input: query,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI responses error ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const textBlock = (data.output || []).find(o => o.type === 'message');
  const textContent = textBlock?.content?.find(c => c.type === 'output_text');
  const text = textContent?.text || '';
  const citations = (textContent?.annotations || [])
    .filter(a => a.type === 'url_citation')
    .map(a => ({ url: a.url, title: a.title || '' }));
  return { text, citations };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests — please wait a moment' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  const { action } = req.body || {};

  try {
    if (action === 'search-suppliers') {
      const { product, location, budget, moqLimit } = req.body;
      if (!product) return res.status(400).json({ error: 'A product description is required' });

      const prompt = `Search the web right now for real manufacturers/suppliers matching this request. Search across multiple sourcing platforms (Alibaba, 1688, Global Sources, Made-in-China, and general web results/company sites) — do not limit to one platform.

Product: ${product}
${location ? `Preferred manufacturer location: ${location}` : 'No location preference given.'}
${budget ? `Target unit budget: ${budget}` : ''}
${moqLimit ? `Maximum acceptable MOQ: ${moqLimit}` : ''}

For each supplier found, note what they actually sell/manufacture and any details you can find: factory location, approximate unit pricing, MOQ, certifications, export markets, and years in business if available.

Return the 6 best matches as a JSON array only (no prose, no markdown fences), each item with keys: companyName, whatTheySell (1 sentence), location, priceRange, moq, certifications (array), exportMarkets (array), source, riskNote (1 sentence — flag if verification info is thin). Do not include a url field — real source links are attached separately from search citations.`;

      const { text: raw, citations } = await callOpenAIWebSearch(OPENAI_KEY, prompt);
      let suppliers;
      try {
        const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        suppliers = JSON.parse(cleaned);
      } catch {
        return res.json({ success: true, suppliers: [], sources: citations, rawText: raw, warning: 'Model did not return clean JSON — showing raw text instead' });
      }

      const usedUrls = new Set();
      const availableCitations = citations.filter(c => c.url);
      suppliers = suppliers.map(s => {
        const next = availableCitations.find(c => !usedUrls.has(c.url));
        if (next) { usedUrls.add(next.url); return { ...s, url: next.url, verified: false }; }
        return { ...s, url: null, verified: false };
      });

      return res.json({ success: true, suppliers, sources: citations });
    }

    return res.status(400).json({ error: 'Unknown action. Use search-suppliers.' });
  } catch (e) {
    console.error('[supplier]', e.message);
    return res.status(500).json({ success: false, error: e.message.slice(0, 200) });
  }
}
