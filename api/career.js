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

// RemoteOK — genuine public API, no key required, every result is a real posting with a real
// apply URL. https://remoteok.com/api returns an array where index 0 is a legal notice, not a job.
async function searchRemoteOK(skills, headline) {
  const r = await fetch('https://remoteok.com/api', { headers: { 'User-Agent': 'NAN-Career-Agent' } });
  if (!r.ok) return [];
  const all = await r.json();
  const listings = all.slice(1); // drop the legal-notice row

  const skillTerms = (Array.isArray(skills) ? skills : String(skills || '').split(','))
    .map(s => s.trim().toLowerCase()).filter(Boolean);
  const headlineTerms = String(headline || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const terms = [...new Set([...skillTerms, ...headlineTerms])];
  if (terms.length === 0) return [];

  const scored = listings.map(job => {
    const haystack = `${job.position || ''} ${(job.tags || []).join(' ')} ${job.description || ''}`.toLowerCase();
    const hits = terms.filter(t => haystack.includes(t));
    const matchScore = Math.min(95, Math.round((hits.length / terms.length) * 100));
    return {
      title: job.position,
      company: job.company,
      location: job.location || 'Remote',
      url: job.url || job.apply_url,
      source: 'remoteok.com',
      matchScore,
      reason: hits.length ? `Matches on: ${hits.slice(0, 4).join(', ')}` : 'Broad match on remote listing',
      verified: true,
    };
  })
  .filter(j => j.matchScore > 0)
  .sort((a, b) => b.matchScore - a.matchScore)
  .slice(0, 6);

  return scored;
}

// Arbeitnow — another public, keyless job API, broader than RemoteOK (not remote-only).
// UNVERIFIED against a live response in this environment — sanity-check field names after deploy.
async function searchArbeitnow(skills, headline) {
  const r = await fetch('https://www.arbeitnow.com/api/job-board-api');
  if (!r.ok) return [];
  const body = await r.json();
  const listings = body.data || [];

  const skillTerms = (Array.isArray(skills) ? skills : String(skills || '').split(','))
    .map(s => s.trim().toLowerCase()).filter(Boolean);
  const headlineTerms = String(headline || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const terms = [...new Set([...skillTerms, ...headlineTerms])];
  if (terms.length === 0) return [];

  return listings.map(job => {
    const haystack = `${job.title || ''} ${(job.tags || []).join(' ')} ${job.description || ''}`.toLowerCase();
    const hits = terms.filter(t => haystack.includes(t));
    const matchScore = Math.min(95, Math.round((hits.length / terms.length) * 100));
    return {
      title: job.title,
      company: job.company_name,
      location: job.remote ? 'Remote' : (job.location || 'Unspecified'),
      url: job.url,
      source: 'arbeitnow.com',
      matchScore,
      reason: hits.length ? `Matches on: ${hits.slice(0, 4).join(', ')}` : 'Broad match on listing',
      verified: true,
    };
  })
  .filter(j => j.matchScore > 0)
  .sort((a, b) => b.matchScore - a.matchScore)
  .slice(0, 6);
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
      const searchPrompt = `Search the web right now for real, currently open job listings that match this candidate. Search across MULTIPLE different job platforms — general boards (e.g. Indeed, LinkedIn public postings, We Work Remotely, company career pages)${includeWeb3 ? ', AND ALSO web3/crypto-specific boards (e.g. Web3.career, CryptoJobsList)' : ''}. Do not limit results to only one platform or only web3 roles — general roles matter just as much${includeWeb3 ? ', web3 is one additional category to include, not the only category' : ''}. Do not include RemoteOK — that source is handled separately.

Candidate: ${profile.headline || profile.name || 'candidate'}, seniority: ${profile.seniority || 'unspecified'}
Skills: ${skills}
${location ? `Preferred location: ${location}` : ''}
${remoteOnly ? 'Remote only.' : ''}

Return the 6 best current matches as a JSON array only (no prose, no markdown fences), each item with keys: title, company, location, source, matchScore (0-100 integer estimating fit), reason (one sentence on why it fits or what's missing). Do not include a url field — real source links are attached separately from search citations.`;

      const [remoteOkJobs, arbeitnowJobs, aiSearch] = await Promise.all([
        searchRemoteOK(profile.skills, profile.headline).catch(e => { console.error('[remoteok]', e.message); return []; }),
        searchArbeitnow(profile.skills, profile.headline).catch(e => { console.error('[arbeitnow]', e.message); return []; }),
        callOpenAIWebSearch(OPENAI_KEY, searchPrompt).catch(e => { console.error('[ai-search]', e.message); return { text: '[]', citations: [] }; }),
      ]);

      let aiJobs = [];
      try {
        const cleaned = aiSearch.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        aiJobs = JSON.parse(cleaned);
      } catch { aiJobs = []; }

      const usedUrls = new Set([...remoteOkJobs, ...arbeitnowJobs].map(j => j.url).filter(Boolean));
      const availableCitations = aiSearch.citations.filter(c => c.url && !usedUrls.has(c.url));
      aiJobs = aiJobs.map(job => {
        const next = availableCitations.find(c => !usedUrls.has(c.url));
        if (next) { usedUrls.add(next.url); return { ...job, url: next.url, verified: false }; }
        return { ...job, url: null, verified: false };
      });

      // RemoteOK/Arbeitnow only list roles they actually have, so no extra filtering needed there.
      const jobs = [...remoteOkJobs, ...arbeitnowJobs, ...aiJobs].sort((a, b) => b.matchScore - a.matchScore);

      return res.json({ success: true, jobs, sources: aiSearch.citations });
    }

    if (action === 'company-profile') {
      const { company, jobTitle } = req.body;
      if (!company) return res.status(400).json({ error: 'A company name is required' });

      const prompt = `Search the web right now for information about the company "${company}"${jobTitle ? ` (they are hiring for a "${jobTitle}" role)` : ''}. Cover: what they do, approximate size, funding/stage if known, and any notable culture or review signal you can find (e.g. Glassdoor-style sentiment). Be concise — return a short JSON object only (no prose, no markdown fences) with keys: summary (2-3 sentences), size, stage, notableSignal (1 sentence, or "not found").`;

      const { text: raw, citations } = await callOpenAIWebSearch(OPENAI_KEY, prompt);
      let profile;
      try {
        const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        profile = JSON.parse(cleaned);
      } catch {
        return res.json({ success: true, profile: { summary: raw }, sources: citations, warning: 'Model did not return clean JSON' });
      }

      return res.json({ success: true, profile, sources: citations });
    }

    return res.status(400).json({ error: 'Unknown action. Use parse-cv, generate-cv, or search-jobs.' });
  } catch (e) {
    console.error('[career]', e.message);
    return res.status(500).json({ success: false, error: e.message.slice(0, 200) });
  }
}
