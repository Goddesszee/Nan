// api/explore.js — NAN Explore: universal AI-powered search, assistant chat, saved results,
// collections, and search history. No maps/places API is configured for this project, so
// there is no real GPS distance or interactive map here — every result is AI-researched from
// live web search, same pattern as career.js/supplier.js. Label accordingly in the UI: this
// finds and summarizes real web content, it does not query a verified places database.
import crypto from 'crypto';
const SELLER_ADDR = process.env.X402_SELLER_ADDR || '0x86B245D0B48BBdc58F08cAeA971a24ba377c366a';

let _gateway = null;
async function getGateway() {
  if (_gateway) return _gateway;
  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server');
  _gateway = createGatewayMiddleware({
    sellerAddress: SELLER_ADDR,
    facilitatorUrl: 'https://gateway-api-testnet.circle.com',
    networks: ['eip155:5042002'],
  });
  return _gateway;
}

const PRICE_BY_ACTION = {
  'search': '$0.06',
  'nearby-search': '$0.06',
  'assistant-message': '$0.02',
};

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
async function kvGet(key) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['GET', key]) });
  const d = await r.json();
  return d?.result ? JSON.parse(d.result) : null;
}
async function kvSet(key, value) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(KV_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, JSON.stringify(value)]),
  });
  const d = await r.json();
  if (!r.ok || d?.error) throw new Error(`kvSet failed for ${key}: ${d?.error || r.status}`);
}
async function addToIndex(indexKey, id) {
  const raw = await kvGet(indexKey);
  const current = Array.isArray(raw) ? raw : [];
  if (!current.includes(id)) { current.push(id); await kvSet(indexKey, current); }
}
async function removeFromIndex(indexKey, id) {
  const raw = await kvGet(indexKey);
  const current = Array.isArray(raw) ? raw : [];
  await kvSet(indexKey, current.filter(x => x !== id));
}
async function listByIndex(indexKey, keyPrefix) {
  const raw = await kvGet(indexKey);
  const ids = Array.isArray(raw) ? raw : [];
  const items = await Promise.all(ids.map(id => kvGet(keyPrefix + id)));
  return items.filter(Boolean);
}
function newId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 90, windowMs = 60_000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > windowMs) { rateLimitMap.set(ip, { count: 1, start: now }); return true; }
  if (record.count >= limit) return false;
  record.count++; rateLimitMap.set(ip, record);
  return true;
}

async function callOpenAIWebSearch(OPENAI_KEY, query) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o', tools: [{ type: 'web_search_preview' }], input: query }),
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
async function callOpenAIChat(OPENAI_KEY, messages, jsonMode) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o', messages, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!r.ok) throw new Error(`OpenAI chat error ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, Payment-Signature, PAYMENT-REQUIRED');
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests — please wait a moment' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  const { action } = req.body || {};
  const FREE_ACTIONS = ['save-result', 'unsave-result', 'saved-results-list', 'create-collection', 'list-collections', 'add-to-collection', 'remove-from-collection', 'collection-items', 'delete-collection', 'search-history-list', 'delete-history-item', 'pin-history-item'];

  if (FREE_ACTIONS.includes(action)) {
    try { await runAction(action, req, res, OPENAI_KEY); }
    catch (e) { console.error('[explore]', e.message); res.status(500).json({ success: false, error: e.message.slice(0, 200) }); }
    return;
  }

  const price = PRICE_BY_ACTION[action];
  if (!price) return res.status(400).json({ error: 'Unknown action' });

  const gateway = await getGateway();
  return new Promise((resolve) => {
    gateway.require(price)(req, res, async () => {
      try { await runAction(action, req, res, OPENAI_KEY); }
      catch (e) { console.error('[explore]', e.message); res.status(500).json({ success: false, error: e.message.slice(0, 200) }); }
      resolve();
    });
  });
}

async function runAction(action, req, res, OPENAI_KEY) {
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (req.payment && payload && typeof payload === 'object' && payload.success) {
      payload = { ...payload, payment: {
        amount: (Number(req.payment.amount) / 1e6).toString(), payer: req.payment.payer,
        network: req.payment.network, transaction: req.payment.transaction,
      }};
    }
    return originalJson(payload);
  };

  // ── search (universal AI search, matches Discover/Explore main screen) ────
  if (action === 'search') {
    const { query, walletAddress } = req.body;
    if (!query || !query.trim()) return res.status(400).json({ error: 'A search query is required' });

    const prompt = `Search the web right now for real, current, accurate results matching this query: "${query}"

This could be a business, person, product, service, place, government office, company, hospital, school, hotel, restaurant, event, property, or professional. Find real, currently-operating entities, not hypothetical examples.

Return a JSON object (no prose, no markdown fences) with two keys:
- "summary": a 2-3 sentence AI summary explaining what was searched for, the best recommendations, and why they're relevant.
- "results": an array of up to 8 items, each with keys: name, description (1-2 sentences), category, address (or "not found"), phone (or null), email (or null), website (or null), openingHours (or null), priceRange (one of $ / $$ / $$$ / $$$$ / null), ratingText (a short text description of reputation/reviews if you can find real signal, e.g. "Highly rated on Google" — or null if nothing found, do NOT invent a numeric rating).

Do not include a url field on results — real source links are attached separately from search citations.`;

    const { text: raw, citations } = await callOpenAIWebSearch(OPENAI_KEY, prompt);
    let parsed;
    try {
      const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      parsed = JSON.parse(cleaned);
    } catch {
      return res.json({ success: true, summary: raw, results: [], sources: citations, warning: 'Model did not return clean JSON — showing raw text as summary' });
    }

    const usedUrls = new Set();
    const availableCitations = citations.filter(c => c.url);
    const results = (parsed.results || []).map(item => {
      const next = availableCitations.find(c => !usedUrls.has(c.url));
      if (next) { usedUrls.add(next.url); return { ...item, sourceUrl: next.url }; }
      return { ...item, sourceUrl: null };
    });

    // Log to search history (best-effort, doesn't fail the search if it errors)
    if (walletAddress) {
      try {
        const entry = { id: newId('hist'), walletAddress: walletAddress.toLowerCase(), query: query.slice(0, 300), pinned: false, createdAt: Date.now() };
        await kvSet(`nan:explore:hist:${entry.id}`, entry);
        await addToIndex(`nan:explore:histindex:${walletAddress.toLowerCase()}`, entry.id);
      } catch (e) { console.log('[explore] history log failed:', e.message); }
    }

    return res.json({ success: true, summary: parsed.summary || '', results, sources: citations });
  }

  // ── nearby-search (category-constrained, location given as text — no real GPS/distance) ──
  if (action === 'nearby-search') {
    const { category, location } = req.body;
    if (!category) return res.status(400).json({ error: 'A category is required' });
    if (!location) return res.status(400).json({ error: 'A location (city or area) is required — this tool has no GPS access, so it searches by the location you type' });

    const prompt = `Search the web right now for real, currently-operating "${category}" in or near "${location}". Return a JSON object (no prose, no markdown fences) with keys: "summary" (1-2 sentences) and "results" (array of up to 8 items, each with keys: name, description, address, phone, website, openingHours, priceRange). Do not invent a distance or GPS coordinate — this tool doesn't have access to the user's real location, only the text they typed.`;

    const { text: raw, citations } = await callOpenAIWebSearch(OPENAI_KEY, prompt);
    let parsed;
    try {
      const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      parsed = JSON.parse(cleaned);
    } catch {
      return res.json({ success: true, summary: raw, results: [], sources: citations, warning: 'Model did not return clean JSON' });
    }
    const usedUrls = new Set();
    const availableCitations = citations.filter(c => c.url);
    const results = (parsed.results || []).map(item => {
      const next = availableCitations.find(c => !usedUrls.has(c.url));
      if (next) { usedUrls.add(next.url); return { ...item, sourceUrl: next.url }; }
      return { ...item, sourceUrl: null };
    });
    return res.json({ success: true, summary: parsed.summary || '', results, sources: citations });
  }

  // ── assistant-message (stateful follow-up chat about the last search results) ──
  if (action === 'assistant-message') {
    const { sessionId, walletAddress, lastResults, userMessage } = req.body;
    if (!walletAddress || !userMessage) return res.status(400).json({ error: 'walletAddress and userMessage are required' });

    let session = sessionId ? await kvGet(`nan:explore:chat:${sessionId}`) : null;
    if (!session) {
      session = { id: newId('chat'), walletAddress: walletAddress.toLowerCase(), history: [], createdAt: Date.now() };
      if (Array.isArray(lastResults) && lastResults.length) {
        session.history.push({ role: 'system', content: `The user just searched and got these results, answer follow-up questions about them using only this data (don't invent details not present here): ${JSON.stringify(lastResults).slice(0, 6000)}` });
      }
    }
    session.history.push({ role: 'user', content: String(userMessage).slice(0, 1000) });

    const reply = await callOpenAIChat(OPENAI_KEY, [
      { role: 'system', content: 'You are Nan Explore\'s AI assistant. Answer questions about the search results provided in context, concisely (under 80 words), and naturally — e.g. comparing options, picking the closest/cheapest/highest-rated based on the given data. If asked to "call" or "save" something, tell the user to use the action button on that result card, you cannot perform actions yourself.' },
      ...session.history,
    ], false);
    session.history.push({ role: 'assistant', content: reply });
    session.updatedAt = Date.now();
    await kvSet(`nan:explore:chat:${session.id}`, session);
    return res.json({ success: true, sessionId: session.id, reply });
  }

  // ── saved results ────────────────────────────────────────────────────────
  if (action === 'save-result') {
    const { walletAddress, result, collectionId } = req.body;
    if (!walletAddress || !result) return res.json({ success: false, error: 'walletAddress and result are required' });
    const saved = { id: newId('saved'), walletAddress: walletAddress.toLowerCase(), result, collectionId: collectionId || null, createdAt: Date.now() };
    await kvSet(`nan:explore:saved:${saved.id}`, saved);
    await addToIndex(`nan:explore:savedindex:${walletAddress.toLowerCase()}`, saved.id);
    if (collectionId) await addToIndex(`nan:explore:collectionitems:${collectionId}`, saved.id);
    return res.json({ success: true, saved });
  }
  if (action === 'unsave-result') {
    const { walletAddress, savedId } = req.body;
    if (!walletAddress || !savedId) return res.json({ success: false, error: 'walletAddress and savedId are required' });
    await removeFromIndex(`nan:explore:savedindex:${walletAddress.toLowerCase()}`, savedId);
    return res.json({ success: true });
  }
  if (action === 'saved-results-list') {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
    const items = await listByIndex(`nan:explore:savedindex:${walletAddress.toLowerCase()}`, 'nan:explore:saved:');
    items.sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ success: true, saved: items });
  }

  // ── collections ──────────────────────────────────────────────────────────
  if (action === 'create-collection') {
    const { walletAddress, name } = req.body;
    if (!walletAddress || !name) return res.json({ success: false, error: 'walletAddress and name are required' });
    const collection = { id: newId('col'), walletAddress: walletAddress.toLowerCase(), name: String(name).slice(0, 60), createdAt: Date.now() };
    await kvSet(`nan:explore:collection:${collection.id}`, collection);
    await addToIndex(`nan:explore:collectionindex:${walletAddress.toLowerCase()}`, collection.id);
    return res.json({ success: true, collection });
  }
  if (action === 'list-collections') {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
    const cols = await listByIndex(`nan:explore:collectionindex:${walletAddress.toLowerCase()}`, 'nan:explore:collection:');
    const withCounts = await Promise.all(cols.map(async c => {
      const raw = await kvGet(`nan:explore:collectionitems:${c.id}`);
      return { ...c, itemCount: Array.isArray(raw) ? raw.length : 0 };
    }));
    withCounts.sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ success: true, collections: withCounts });
  }
  if (action === 'delete-collection') {
    const { walletAddress, collectionId } = req.body;
    if (!walletAddress || !collectionId) return res.json({ success: false, error: 'walletAddress and collectionId are required' });
    await removeFromIndex(`nan:explore:collectionindex:${walletAddress.toLowerCase()}`, collectionId);
    return res.json({ success: true });
  }
  if (action === 'add-to-collection') {
    const { collectionId, savedId } = req.body;
    if (!collectionId || !savedId) return res.json({ success: false, error: 'collectionId and savedId are required' });
    await addToIndex(`nan:explore:collectionitems:${collectionId}`, savedId);
    const saved = await kvGet(`nan:explore:saved:${savedId}`);
    if (saved) { saved.collectionId = collectionId; await kvSet(`nan:explore:saved:${savedId}`, saved); }
    return res.json({ success: true });
  }
  if (action === 'remove-from-collection') {
    const { collectionId, savedId } = req.body;
    if (!collectionId || !savedId) return res.json({ success: false, error: 'collectionId and savedId are required' });
    await removeFromIndex(`nan:explore:collectionitems:${collectionId}`, savedId);
    return res.json({ success: true });
  }
  if (action === 'collection-items') {
    const { collectionId } = req.body;
    if (!collectionId) return res.json({ success: false, error: 'collectionId required' });
    const items = await listByIndex(`nan:explore:collectionitems:${collectionId}`, 'nan:explore:saved:');
    items.sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ success: true, items });
  }

  // ── search history ───────────────────────────────────────────────────────
  if (action === 'search-history-list') {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
    const items = await listByIndex(`nan:explore:histindex:${walletAddress.toLowerCase()}`, 'nan:explore:hist:');
    items.sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt));
    return res.json({ success: true, history: items.slice(0, 50) });
  }
  if (action === 'delete-history-item') {
    const { walletAddress, historyId } = req.body;
    if (!walletAddress || !historyId) return res.json({ success: false, error: 'walletAddress and historyId are required' });
    await removeFromIndex(`nan:explore:histindex:${walletAddress.toLowerCase()}`, historyId);
    return res.json({ success: true });
  }
  if (action === 'pin-history-item') {
    const { historyId, pinned } = req.body;
    if (!historyId) return res.json({ success: false, error: 'historyId required' });
    const item = await kvGet(`nan:explore:hist:${historyId}`);
    if (!item) return res.json({ success: false, error: 'History item not found' });
    item.pinned = !!pinned;
    await kvSet(`nan:explore:hist:${historyId}`, item);
    return res.json({ success: true, item });
  }
}
