// api/career.js — NAN Career Agent: CV parsing, CV generation, web-search job matching
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

// Per-action pricing — separate from OpenAI's own per-call cost, this is what the user pays via x402.
const PRICE_BY_ACTION = {
  'parse-cv': '$0.02',
  'generate-cv': '$0.03',
  'search-jobs': '$0.05',
  'company-profile': '$0.02',
  'post-job': '$0.05',
  'generate-cover-letter': '$0.02',
  'interview-coach-message': '$0.01',
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
async function listByIndex(indexKey, keyPrefix) {
  const raw = await kvGet(indexKey);
  const ids = Array.isArray(raw) ? raw : [];
  const items = await Promise.all(ids.map(id => kvGet(keyPrefix + id)));
  return items.filter(Boolean);
}
function newId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

// Reuses the exact same verification record Marketplace's KYC flow writes, so "Verified
// Employer" reflects genuine identity verification, not a separate/fake check.
async function getKycStatus(walletAddress) {
  if (!walletAddress) return 'none';
  const record = await kvGet(`nan:kyc:${walletAddress.toLowerCase()}`);
  return record?.status || 'none';
}

const rateLimitMap = new Map();

async function sendNotification(to, subject, body) {
  if (!to) return;
  try {
    const { default: fetch } = await import('node-fetch');
    await fetch('https://nan-production.up.railway.app/api/send-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body }),
    });
  } catch (e) { console.log('[career] notification email failed:', e.message); }
}

function checkRateLimit(ip, limit = 90, windowMs = 60_000) {
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
async function matchPostedJobs(profile, { location, remoteOnly, includeWeb3 }) {
  const jobs = (await listByIndex('nan:career:job:index', 'nan:career:job:')).filter(j => j.status === 'open');
  if (!jobs.length) return [];

  const skillTerms = (Array.isArray(profile.skills) ? profile.skills : String(profile.skills || '').split(','))
    .map(s => s.trim().toLowerCase()).filter(Boolean);
  const headlineTerms = String(profile.headline || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const terms = [...new Set([...skillTerms, ...headlineTerms])];
  if (terms.length === 0) return [];

  const scored = jobs
    .filter(j => !remoteOnly || j.remoteOnly)
    .map(job => {
      const haystack = `${job.title || ''} ${job.description || ''}`.toLowerCase();
      const hits = terms.filter(t => haystack.includes(t));
      const matchScore = Math.min(98, Math.round((hits.length / terms.length) * 100));
      return {
        title: job.title, company: 'Posted on NAN', location: job.remoteOnly ? 'Remote' : (job.location || 'Unspecified'),
        url: null, source: 'NAN Job Board', matchScore,
        reason: hits.length ? `Matches on: ${hits.slice(0, 4).join(', ')}` : 'Broad match on listing',
        employerPosted: true, referred: true, employerAddress: job.employerAddress,
        salary: job.salary, currency: job.currency, jobId: job.id,
      };
    })
    .filter(j => j.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);

  // Attach real verification status per employer, not a hardcoded true.
  const uniqueAddrs = [...new Set(scored.map(j => j.employerAddress).filter(Boolean))];
  const statuses = await Promise.all(uniqueAddrs.map(a => getKycStatus(a)));
  const statusByAddr = Object.fromEntries(uniqueAddrs.map((a, i) => [a.toLowerCase(), statuses[i]]));
  return scored.map(j => ({ ...j, verified: statusByAddr[(j.employerAddress || '').toLowerCase()] === 'approved' }));
}

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, Payment-Signature, PAYMENT-REQUIRED');
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests — please wait a moment' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  const { action } = req.body || {};

  // Free actions — no x402 payment required (browsing shouldn't cost anything).
  const FREE_ACTIONS = new Set([
    'job-list', 'my-jobs', 'job-delete', 'job-edit', 'job-watch-create',
    'apply-to-job', 'my-applications', 'job-applications', 'application-update-status',
    'career-profile-get', 'career-profile-save',
    'save-job', 'unsave-job', 'saved-jobs-list',
    'job-view', 'employer-stats', 'employer-verification-status',
    'messages-send', 'messages-thread', 'messages-list',
    'notifications-list', 'notifications-mark-read',
  ]);
  if (FREE_ACTIONS.has(action)) {
    try {
      await runAction(action, req, res, OPENAI_KEY);
    } catch (e) {
      console.error('[career]', e.message);
      res.status(500).json({ success: false, error: e.message.slice(0, 200) });
    }
    return;
  }

  const price = PRICE_BY_ACTION[action];
  if (!price) return res.status(400).json({ error: 'Unknown action.' });

  const gateway = await getGateway();
  return new Promise((resolve) => {
    gateway.require(price)(req, res, async () => {
      try {
        await runAction(action, req, res, OPENAI_KEY);
      } catch (e) {
        console.error('[career]', e.message);
        res.status(500).json({ success: false, error: e.message.slice(0, 200) });
      }
      resolve();
    });
  });
}

async function runAction(action, req, res, OPENAI_KEY) {
  // Attach real payment receipt info (from Circle Gateway, via req.payment) to every
  // successful response — matches Circle's own seller quickstart pattern.
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

      const [remoteOkJobs, arbeitnowJobs, aiSearch, postedJobs] = await Promise.all([
        searchRemoteOK(profile.skills, profile.headline).catch(e => { console.error('[remoteok]', e.message); return []; }),
        searchArbeitnow(profile.skills, profile.headline).catch(e => { console.error('[arbeitnow]', e.message); return []; }),
        callOpenAIWebSearch(OPENAI_KEY, searchPrompt).catch(e => { console.error('[ai-search]', e.message); return { text: '[]', citations: [] }; }),
        matchPostedJobs(profile, { location, remoteOnly, includeWeb3 }).catch(e => { console.error('[posted-jobs]', e.message); return []; }),
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
      const jobs = [...postedJobs, ...remoteOkJobs, ...arbeitnowJobs, ...aiJobs].sort((a, b) => b.matchScore - a.matchScore);

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

    // ── post-job (employer posts a job listing, pays the fee via x402 above) ──
    if (action === 'post-job') {
      const { employerAddress, title, description, salary, currency, location, remoteOnly, includeWeb3, employerEmail, employmentType, experienceLevel, numOpenings, deadline, skillsRequired } = req.body;
      if (!employerAddress || !title || !salary) return res.json({ success: false, error: 'employerAddress, title, and salary are required' });
      const parsedSalary = parseFloat(salary);
      if (isNaN(parsedSalary) || parsedSalary <= 0) return res.json({ success: false, error: 'Invalid salary' });
      const VALID_TYPES = ['full-time', 'part-time', 'contract', 'internship'];
      const VALID_LEVELS = ['entry', 'mid', 'senior', 'lead', 'executive'];

      const job = {
        id: newId('job'), employerAddress, employerEmail: employerEmail || null,
        title: String(title).slice(0, 140), description: String(description || '').slice(0, 2000),
        salary: parsedSalary, currency: (currency && currency.toUpperCase() === 'EURC') ? 'EURC' : 'USDC',
        location: location || null, remoteOnly: !!remoteOnly, includeWeb3: !!includeWeb3,
        employmentType: VALID_TYPES.includes(employmentType) ? employmentType : 'full-time',
        experienceLevel: VALID_LEVELS.includes(experienceLevel) ? experienceLevel : 'mid',
        numOpenings: Number.isInteger(numOpenings) && numOpenings > 0 ? numOpenings : (parseInt(numOpenings, 10) > 0 ? parseInt(numOpenings, 10) : 1),
        deadline: deadline || null,
        skillsRequired: Array.isArray(skillsRequired) ? skillsRequired.slice(0, 15).map(s => String(s).slice(0, 40)) : [],
        views: 0,
        status: 'open', createdAt: Date.now(),
      };
      await kvSet(`nan:career:job:${job.id}`, job);
      await addToIndex('nan:career:job:index', job.id);

      // Notify anyone watching a keyword that matches this new job (best-effort — errors don't fail the request).
      try {
        const watches = await listByIndex('nan:career:watch:index', 'nan:career:watch:');
        const haystack = (job.title + ' ' + job.description).toLowerCase();
        const matches = watches.filter(w => haystack.includes(w.keyword.toLowerCase()));
        await Promise.all(matches.map(w => sendNotification(
          w.email, `New job matching "${w.keyword}"`,
          `A new job was just posted that matches your saved search "${w.keyword}":\n\n${job.title}\nSalary: ${job.salary} ${job.currency}\n\nCheck it out at nanarc.xyz/legacy/app.html`
        )));
      } catch (e) { console.log('[career] watch-notify failed:', e.message); }

      return res.json({ success: true, job });
    }

    // ── job-list (browse posted jobs — free, no payment required) ────────────
    if (action === 'job-list') {
      const jobs = (await listByIndex('nan:career:job:index', 'nan:career:job:')).filter(j => j.status === 'open');
      jobs.sort((a, b) => b.createdAt - a.createdAt);
      const uniqueAddrs = [...new Set(jobs.map(j => j.employerAddress).filter(Boolean))];
      const statuses = await Promise.all(uniqueAddrs.map(a => getKycStatus(a)));
      const statusByAddr = Object.fromEntries(uniqueAddrs.map((a, i) => [a.toLowerCase(), statuses[i]]));
      const withVerification = jobs.map(j => ({ ...j, employerVerified: statusByAddr[(j.employerAddress || '').toLowerCase()] === 'approved', views: j.views || 0 }));
      return res.json({ success: true, jobs: withVerification });
    }

    // ── my-jobs (posted by this employer, any status) ─────────────────────────
    if (action === 'my-jobs') {
      const { employerAddress } = req.body;
      if (!employerAddress) return res.json({ success: false, error: 'employerAddress required' });
      const jobs = (await listByIndex('nan:career:job:index', 'nan:career:job:')).filter(j => j.employerAddress?.toLowerCase() === employerAddress.toLowerCase());
      jobs.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, jobs });
    }

    // ── job-delete (only the employer who posted it can delete) ──────────────
    if (action === 'job-delete') {
      const { jobId, employerAddress } = req.body;
      if (!jobId || !employerAddress) return res.json({ success: false, error: 'jobId and employerAddress are required' });
      const job = await kvGet(`nan:career:job:${jobId}`);
      if (!job) return res.json({ success: false, error: 'Job not found' });
      if (job.employerAddress?.toLowerCase() !== employerAddress.toLowerCase())
        return res.json({ success: false, error: 'Only the employer who posted this job can delete it' });
      const raw = await kvGet('nan:career:job:index');
      const current = Array.isArray(raw) ? raw : [];
      await kvSet('nan:career:job:index', current.filter(id => id !== jobId));
      return res.json({ success: true });
    }

    // ── job-edit (only the employer who posted it can edit) ──────────────────
    if (action === 'job-edit') {
      const { jobId, employerAddress, title, description, salary, currency, location, remoteOnly, includeWeb3, employmentType, experienceLevel, numOpenings, deadline, skillsRequired } = req.body;
      if (!jobId || !employerAddress) return res.json({ success: false, error: 'jobId and employerAddress are required' });
      const job = await kvGet(`nan:career:job:${jobId}`);
      if (!job) return res.json({ success: false, error: 'Job not found' });
      if (job.employerAddress?.toLowerCase() !== employerAddress.toLowerCase())
        return res.json({ success: false, error: 'Only the employer who posted this job can edit it' });
      if (title) job.title = String(title).slice(0, 140);
      if (description !== undefined) job.description = String(description).slice(0, 2000);
      if (salary) {
        const parsedSalary = parseFloat(salary);
        if (isNaN(parsedSalary) || parsedSalary <= 0) return res.json({ success: false, error: 'Invalid salary' });
        job.salary = parsedSalary;
      }
      if (currency) job.currency = currency.toUpperCase() === 'EURC' ? 'EURC' : 'USDC';
      if (location !== undefined) job.location = location;
      if (remoteOnly !== undefined) job.remoteOnly = !!remoteOnly;
      if (includeWeb3 !== undefined) job.includeWeb3 = !!includeWeb3;
      const VALID_TYPES = ['full-time', 'part-time', 'contract', 'internship'];
      const VALID_LEVELS = ['entry', 'mid', 'senior', 'lead', 'executive'];
      if (employmentType && VALID_TYPES.includes(employmentType)) job.employmentType = employmentType;
      if (experienceLevel && VALID_LEVELS.includes(experienceLevel)) job.experienceLevel = experienceLevel;
      if (numOpenings !== undefined && parseInt(numOpenings, 10) > 0) job.numOpenings = parseInt(numOpenings, 10);
      if (deadline !== undefined) job.deadline = deadline;
      if (skillsRequired !== undefined) job.skillsRequired = Array.isArray(skillsRequired) ? skillsRequired.slice(0, 15).map(s => String(s).slice(0, 40)) : [];
      job.updatedAt = Date.now();
      await kvSet(`nan:career:job:${jobId}`, job);
      return res.json({ success: true, job });
    }

    // ── job-watch-create (save a keyword search + email, get notified on matching new jobs) ─
    if (action === 'job-watch-create') {
      const { email, keyword } = req.body;
      if (!email || !keyword) return res.json({ success: false, error: 'email and keyword are required' });
      const watch = { id: newId('watch'), email: String(email).slice(0, 200), keyword: String(keyword).slice(0, 100).toLowerCase(), createdAt: Date.now() };
      await kvSet(`nan:career:watch:${watch.id}`, watch);
      await addToIndex('nan:career:watch:index', watch.id);
      return res.json({ success: true, watch });
    }

    // ── notifications (shared helper + actions) ───────────────────────────────
    async function pushNotification(toAddress, type, text, jobId) {
      if (!toAddress) return;
      const n = { id: newId('notif'), toAddress: toAddress.toLowerCase(), type, text, jobId: jobId || null, read: false, createdAt: Date.now() };
      await kvSet(`nan:career:notif:${n.id}`, n);
      await addToIndex(`nan:career:notifindex:${toAddress.toLowerCase()}`, n.id);
    }

    if (action === 'notifications-list') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const notifs = await listByIndex(`nan:career:notifindex:${walletAddress.toLowerCase()}`, 'nan:career:notif:');
      notifs.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, notifications: notifs.slice(0, 50) });
    }

    if (action === 'notifications-mark-read') {
      const { notificationId } = req.body;
      if (!notificationId) return res.json({ success: false, error: 'notificationId required' });
      const n = await kvGet(`nan:career:notif:${notificationId}`);
      if (!n) return res.json({ success: false, error: 'Notification not found' });
      n.read = true;
      await kvSet(`nan:career:notif:${notificationId}`, n);
      return res.json({ success: true });
    }

    // ── career profile (skills, education, experience, certifications, languages, portfolio) ─
    if (action === 'career-profile-get') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const profile = await kvGet(`nan:career:profile:${walletAddress.toLowerCase()}`) || {
        walletAddress: walletAddress.toLowerCase(), skills: [], education: [], experience: [],
        certifications: [], languages: [], portfolio: null, resumeScore: null,
      };
      const fields = [profile.skills?.length, profile.education?.length, profile.experience?.length, profile.certifications?.length, profile.languages?.length, profile.portfolio];
      const filled = fields.filter(f => f && (Array.isArray(f) ? true : true)).length;
      const completion = Math.round((filled / fields.length) * 100);
      return res.json({ success: true, profile: { ...profile, completion } });
    }

    if (action === 'career-profile-save') {
      const { walletAddress, skills, education, experience, certifications, languages, portfolio, resumeScore } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const existing = await kvGet(`nan:career:profile:${walletAddress.toLowerCase()}`) || {};
      const profile = {
        ...existing,
        walletAddress: walletAddress.toLowerCase(),
        skills: skills !== undefined ? skills : (existing.skills || []),
        education: education !== undefined ? education : (existing.education || []),
        experience: experience !== undefined ? experience : (existing.experience || []),
        certifications: certifications !== undefined ? certifications : (existing.certifications || []),
        languages: languages !== undefined ? languages : (existing.languages || []),
        portfolio: portfolio !== undefined ? portfolio : (existing.portfolio || null),
        resumeScore: resumeScore !== undefined ? resumeScore : (existing.resumeScore || null),
        updatedAt: Date.now(),
      };
      await kvSet(`nan:career:profile:${walletAddress.toLowerCase()}`, profile);
      return res.json({ success: true, profile });
    }

    // ── saved jobs ──────────────────────────────────────────────────────────
    if (action === 'save-job') {
      const { walletAddress, jobId } = req.body;
      if (!walletAddress || !jobId) return res.json({ success: false, error: 'walletAddress and jobId are required' });
      const key = `nan:career:saved:${walletAddress.toLowerCase()}`;
      const raw = await kvGet(key);
      const current = Array.isArray(raw) ? raw : [];
      if (!current.includes(jobId)) { current.push(jobId); await kvSet(key, current); }
      return res.json({ success: true });
    }

    if (action === 'unsave-job') {
      const { walletAddress, jobId } = req.body;
      if (!walletAddress || !jobId) return res.json({ success: false, error: 'walletAddress and jobId are required' });
      const key = `nan:career:saved:${walletAddress.toLowerCase()}`;
      const raw = await kvGet(key);
      const current = Array.isArray(raw) ? raw : [];
      await kvSet(key, current.filter(id => id !== jobId));
      return res.json({ success: true });
    }

    if (action === 'saved-jobs-list') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const raw = await kvGet(`nan:career:saved:${walletAddress.toLowerCase()}`);
      const ids = Array.isArray(raw) ? raw : [];
      const jobs = (await Promise.all(ids.map(id => kvGet(`nan:career:job:${id}`)))).filter(Boolean);
      return res.json({ success: true, jobs });
    }

    // ── job view tracking (real counter, powers Employer Dashboard "job views") ─
    if (action === 'job-view') {
      const { jobId } = req.body;
      if (!jobId) return res.json({ success: false, error: 'jobId required' });
      const job = await kvGet(`nan:career:job:${jobId}`);
      if (!job) return res.json({ success: false, error: 'Job not found' });
      job.views = (job.views || 0) + 1;
      await kvSet(`nan:career:job:${jobId}`, job);
      return res.json({ success: true, views: job.views });
    }

    // ── apply-to-job ────────────────────────────────────────────────────────
    if (action === 'apply-to-job') {
      const { jobId, applicantAddress, resumeText, coverLetter, portfolioLinks } = req.body;
      if (!jobId || !applicantAddress) return res.json({ success: false, error: 'jobId and applicantAddress are required' });
      const job = await kvGet(`nan:career:job:${jobId}`);
      if (!job) return res.json({ success: false, error: 'Job not found' });
      const existingApps = await listByIndex(`nan:career:appbyapplicant:${applicantAddress.toLowerCase()}`, 'nan:career:app:');
      if (existingApps.some(a => a.jobId === jobId)) return res.json({ success: false, error: 'You already applied to this job' });

      const application = {
        id: newId('app'), jobId, jobTitle: job.title, employerAddress: job.employerAddress,
        applicantAddress: applicantAddress.toLowerCase(),
        resumeText: String(resumeText || '').slice(0, 12000),
        coverLetter: String(coverLetter || '').slice(0, 4000),
        portfolioLinks: Array.isArray(portfolioLinks) ? portfolioLinks.slice(0, 5) : [],
        status: 'applied', createdAt: Date.now(),
      };
      await kvSet(`nan:career:app:${application.id}`, application);
      await addToIndex('nan:career:app:index', application.id);
      await addToIndex(`nan:career:appbyjob:${jobId}`, application.id);
      await addToIndex(`nan:career:appbyapplicant:${applicantAddress.toLowerCase()}`, application.id);
      await pushNotification(job.employerAddress, 'new_applicant', `New applicant for "${job.title}"`, jobId);
      if (job.employerEmail) await sendNotification(job.employerEmail, `New applicant for "${job.title}"`, `Someone just applied to your job posting on NAN Careers. Log in to review their application.`);
      return res.json({ success: true, application });
    }

    // ── my-applications (applicant's own view — powers My Applications tracker) ─
    if (action === 'my-applications') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const apps = await listByIndex(`nan:career:appbyapplicant:${walletAddress.toLowerCase()}`, 'nan:career:app:');
      apps.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, applications: apps });
    }

    // ── job-applications (employer's view of applicants for one of their jobs) ─
    if (action === 'job-applications') {
      const { jobId, employerAddress } = req.body;
      if (!jobId || !employerAddress) return res.json({ success: false, error: 'jobId and employerAddress are required' });
      const job = await kvGet(`nan:career:job:${jobId}`);
      if (!job) return res.json({ success: false, error: 'Job not found' });
      if (job.employerAddress?.toLowerCase() !== employerAddress.toLowerCase())
        return res.json({ success: false, error: 'Only the employer who posted this job can view its applicants' });
      const apps = await listByIndex(`nan:career:appbyjob:${jobId}`, 'nan:career:app:');
      apps.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, applications: apps });
    }

    // ── application-update-status (employer moves an applicant through the pipeline) ─
    if (action === 'application-update-status') {
      const { applicationId, employerAddress, status } = req.body;
      const VALID = ['applied', 'under_review', 'interview_scheduled', 'offer', 'rejected', 'hired'];
      if (!applicationId || !employerAddress || !VALID.includes(status))
        return res.json({ success: false, error: `applicationId, employerAddress, and a valid status (${VALID.join('/')}) are required` });
      const app = await kvGet(`nan:career:app:${applicationId}`);
      if (!app) return res.json({ success: false, error: 'Application not found' });
      if (app.employerAddress?.toLowerCase() !== employerAddress.toLowerCase())
        return res.json({ success: false, error: 'Only the employer for this job can update applicant status' });
      app.status = status;
      app.updatedAt = Date.now();
      await kvSet(`nan:career:app:${applicationId}`, app);
      await pushNotification(app.applicantAddress, 'application_update', `Your application for "${app.jobTitle}" is now: ${status.replace('_', ' ')}`, app.jobId);
      return res.json({ success: true, application: app });
    }

    // ── employer-stats (real analytics, computed from real applications + job views) ─
    if (action === 'employer-stats') {
      const { employerAddress } = req.body;
      if (!employerAddress) return res.json({ success: false, error: 'employerAddress required' });
      const jobs = (await listByIndex('nan:career:job:index', 'nan:career:job:')).filter(j => j.employerAddress?.toLowerCase() === employerAddress.toLowerCase());
      const appLists = await Promise.all(jobs.map(j => listByIndex(`nan:career:appbyjob:${j.id}`, 'nan:career:app:')));
      const allApps = appLists.flat();
      const activePostings = jobs.filter(j => j.status === 'open').length;
      const totalApplicants = allApps.length;
      const jobViews = jobs.reduce((sum, j) => sum + (j.views || 0), 0);
      const interviewInvites = allApps.filter(a => a.status === 'interview_scheduled' || a.status === 'offer' || a.status === 'hired').length;
      const hired = allApps.filter(a => a.status === 'hired').length;
      const conversionRate = totalApplicants > 0 ? Math.round((hired / totalApplicants) * 100) : 0;
      return res.json({ success: true, stats: { activePostings, totalApplicants, jobViews, interviewInvites, hired, conversionRate } });
    }

    // ── employer-verification-status (reuses the real Marketplace KYC record) ──
    if (action === 'employer-verification-status') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const status = await getKycStatus(walletAddress);
      return res.json({ success: true, status });
    }

    // ── messaging (tied to a specific application, matching spec's "attached to order") ──
    if (action === 'messages-send') {
      const { applicationId, fromAddress, text } = req.body;
      if (!applicationId || !fromAddress || !text?.trim()) return res.json({ success: false, error: 'applicationId, fromAddress, and text are required' });
      const app = await kvGet(`nan:career:app:${applicationId}`);
      if (!app) return res.json({ success: false, error: 'Application not found' });
      const isApplicant = app.applicantAddress?.toLowerCase() === fromAddress.toLowerCase();
      const isEmployer = app.employerAddress?.toLowerCase() === fromAddress.toLowerCase();
      if (!isApplicant && !isEmployer) return res.json({ success: false, error: 'You are not part of this conversation' });
      const toAddress = isApplicant ? app.employerAddress : app.applicantAddress;
      const msg = { id: newId('msg'), applicationId, fromAddress: fromAddress.toLowerCase(), toAddress, text: String(text).slice(0, 2000), createdAt: Date.now(), read: false };
      await kvSet(`nan:career:msg:${msg.id}`, msg);
      await addToIndex(`nan:career:msgthread:${applicationId}`, msg.id);
      await pushNotification(toAddress, 'new_message', `New message about "${app.jobTitle}"`, app.jobId);
      return res.json({ success: true, message: msg });
    }

    if (action === 'messages-thread') {
      const { applicationId, walletAddress } = req.body;
      if (!applicationId || !walletAddress) return res.json({ success: false, error: 'applicationId and walletAddress are required' });
      const app = await kvGet(`nan:career:app:${applicationId}`);
      if (!app) return res.json({ success: false, error: 'Application not found' });
      const isApplicant = app.applicantAddress?.toLowerCase() === walletAddress.toLowerCase();
      const isEmployer = app.employerAddress?.toLowerCase() === walletAddress.toLowerCase();
      if (!isApplicant && !isEmployer) return res.json({ success: false, error: 'You are not part of this conversation' });
      const messages = await listByIndex(`nan:career:msgthread:${applicationId}`, 'nan:career:msg:');
      messages.sort((a, b) => a.createdAt - b.createdAt);
      return res.json({ success: true, messages, application: app });
    }

    // ── messages-list (all threads/applications a wallet has any message-eligible context in) ─
    if (action === 'messages-list') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const asApplicant = await listByIndex(`nan:career:appbyapplicant:${walletAddress.toLowerCase()}`, 'nan:career:app:');
      const myJobs = (await listByIndex('nan:career:job:index', 'nan:career:job:')).filter(j => j.employerAddress?.toLowerCase() === walletAddress.toLowerCase());
      const asEmployerLists = await Promise.all(myJobs.map(j => listByIndex(`nan:career:appbyjob:${j.id}`, 'nan:career:app:')));
      const asEmployer = asEmployerLists.flat();
      const allThreads = [...asApplicant, ...asEmployer];
      const withLastMessage = await Promise.all(allThreads.map(async app => {
        const msgs = await listByIndex(`nan:career:msgthread:${app.id}`, 'nan:career:msg:');
        msgs.sort((a, b) => b.createdAt - a.createdAt);
        return { application: app, lastMessage: msgs[0] || null, messageCount: msgs.length };
      }));
      withLastMessage.sort((a, b) => (b.lastMessage?.createdAt || b.application.createdAt) - (a.lastMessage?.createdAt || a.application.createdAt));
      return res.json({ success: true, threads: withLastMessage });
    }

    // ── AI cover letter generator (paid, matches parse-cv/generate-cv cost pattern) ──
    if (action === 'generate-cover-letter') {
      const { resumeText, jobTitle, jobDescription, companyName } = req.body;
      if (!resumeText || !jobTitle) return res.status(400).json({ error: 'resumeText and jobTitle are required' });
      const content = await callOpenAIChat(OPENAI_KEY, [
        { role: 'system', content: 'Write a concise, specific, professional cover letter (plain text, no markdown symbols) tailored to the candidate\'s actual resume and the job description. Avoid generic filler phrases. 250-350 words.' },
        { role: 'user', content: `Resume:\n${resumeText.slice(0, 8000)}\n\nJob title: ${jobTitle}\nCompany: ${companyName || 'the company'}\nJob description: ${(jobDescription || '').slice(0, 3000)}` },
      ], false);
      return res.json({ success: true, coverLetter: content });
    }

    // ── AI interview coach (stateful mock interview, paid per message) ──────
    if (action === 'interview-coach-message') {
      const { sessionId, walletAddress, role, userMessage } = req.body;
      if (!walletAddress || !role) return res.status(400).json({ error: 'walletAddress and role are required' });

      let session = sessionId ? await kvGet(`nan:career:interview:${sessionId}`) : null;
      const isNewSession = !session;
      if (isNewSession) {
        session = { id: newId('interview'), walletAddress: walletAddress.toLowerCase(), role: String(role).slice(0, 120), history: [], createdAt: Date.now() };
      }
      if (userMessage) session.history.push({ role: 'user', content: String(userMessage).slice(0, 3000) });

      const systemPrompt = `You are an expert interview coach role-playing as an interviewer for a "${session.role}" position. If this is the first message (empty history before this point), open with a short greeting and your first behavioral or role-specific question. Otherwise, briefly give constructive feedback (2-3 sentences, specific, actionable — mention things like structure, specificity, use of the STAR method, or communication clarity) on the candidate's last answer, THEN ask the next interview question. Keep your entire response under 120 words. Never break character or mention you are an AI.`;
      const messages = [
        { role: 'system', content: systemPrompt },
        ...session.history.map(h => ({ role: h.role, content: h.content })),
      ];
      const reply = await callOpenAIChat(OPENAI_KEY, messages, false);
      session.history.push({ role: 'assistant', content: reply });
      session.updatedAt = Date.now();
      await kvSet(`nan:career:interview:${session.id}`, session);
      return res.json({ success: true, sessionId: session.id, reply, turnCount: session.history.filter(h => h.role === 'user').length });
    }
}
