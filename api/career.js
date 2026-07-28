// api/career.js — NAN Career Agent: CV parsing, CV generation, web-search job matching
const rateLimitMap = new Map();

function checkRateLimit(ip, limit = 15, windowMs = 60_000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > windowMs) { rateLimitMap.set(ip, { count: 1, start: now }); return true; }
  if (record.count >= limit) return false;
  record.count++; rateLimitMap.set(ip, record);
  return true;
}

async function callOpenAIChat(OPENAI_KEY, messages, jsonMode) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!r.ok) throw new Error(`OpenAI chat error ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

// Uses the Responses API with the web_search tool so results are live, not from training data.
// NOTE: verify the exact tool name/model against current OpenAI docs before relying on this in
// production — the web-search tool surface has changed names before (web_search_preview etc.)
// and this is untested against a live key in this environment.
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
  // Real, tool-grounded URLs the model actually cited — not whatever it typed into the JSON.
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
    if (action === 'parse-cv') {
      const { cvText } = req.body;
      if (!cvText || cvText.trim().length < 20)
        return res.status(400).json({ error: 'CV text is too short to parse' });

      const content = await callOpenAIChat(OPENAI_KEY, [
        { role: 'system', content: 'Extract a structured candidate profile from the CV text. Return strict JSON only, no prose, with keys: name, headline, skills (array), experience (array of {role, company, years}), education (array of {degree, institution}), certifications (array), seniority (one of: entry, mid, senior, lead, executive).' },
        { role: 'user', content: cvText.slice(0, 12000) },
      ], true);

      return res.json({ success: true, profile: JSON.parse(content) });
    }

    if (action === 'generate-cv') {
      const { name, targetRole, skills, experienceSummary } = req.body;
      if (!name || !targetRole)
        return res.status(400).json({ error: 'Name and target role are required' });

      const content = await callOpenAIChat(OPENAI_KEY, [
        { role: 'system', content: 'Write a clean, professional CV in plain text (no markdown symbols) for the given details. Keep it realistic and well-structured with clear section headers (Summary, Skills, Experience, Education).' },
        { role: 'user', content: `Name: ${name}\nTarget role: ${targetRole}\nSkills: ${skills || 'not specified'}\nExperience summary: ${experienceSummary || 'not specified'}` },
      ], false);

      return res.json({ success: true, cvText: content });
    }

    if (action === 'search-jobs') {
      const { profile, location, remoteOnly, includeWeb3 } = req.body;
      if (!profile) return res.status(400).json({ error: 'A parsed profile is required' });

      const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : String(profile.skills || '');
      const searchPrompt = `Search the web right now for real, currently open job listings that match this candidate. Search across MULTIPLE different job platforms — general boards (e.g. Indeed, LinkedIn public postings, RemoteOK, We Work Remotely, company career pages)${includeWeb3 ? ', AND ALSO web3/crypto-specific boards (e.g. Web3.career, CryptoJobsList)' : ''}. Do not limit results to only one platform or only web3 roles — general roles matter just as much${includeWeb3 ? ', web3 is one additional category to include, not the only category' : ''}.

Candidate: ${profile.headline || profile.name || 'candidate'}, seniority: ${profile.seniority || 'unspecified'}
Skills: ${skills}
${location ? `Preferred location: ${location}` : ''}
${remoteOnly ? 'Remote only.' : ''}

Return the 8 best current matches as a JSON array only (no prose, no markdown fences), each item with keys: title, company, location, source, matchScore (0-100 integer estimating fit), reason (one sentence on why it fits or what's missing). Do not include a url field — real source links are attached separately from search citations.`;

      const { text: raw, citations } = await callOpenAIWebSearch(OPENAI_KEY, searchPrompt);
      let jobs;
      try {
        const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        jobs = JSON.parse(cleaned);
      } catch {
        return res.json({ success: true, jobs: [], sources: citations, rawText: raw, warning: 'Model did not return clean JSON — showing raw text instead' });
      }

      // Assign one distinct real cited URL per job — never reuse the same URL twice.
      const usedUrls = new Set();
      const availableCitations = citations.filter(c => c.url);
      jobs = jobs.map(job => {
        const next = availableCitations.find(c => !usedUrls.has(c.url));
        if (next) { usedUrls.add(next.url); return { ...job, url: next.url }; }
        return { ...job, url: null };
      });

      return res.json({ success: true, jobs, sources: citations });
    }

    return res.status(400).json({ error: 'Unknown action. Use parse-cv, generate-cv, or search-jobs.' });
  } catch (e) {
    console.error('[career]', e.message);
    return res.status(500).json({ success: false, error: e.message.slice(0, 200) });
  }
}
