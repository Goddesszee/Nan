// api/circle.js
// General Circle API proxy — forwards requests to Circle's API
// Used for any Circle API call not covered by circle-wallets.js

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { path: apiPath, method = 'GET', body, userToken } = req.body || {};
  if (!apiPath) return res.json({ success: false, error: 'path required' });

  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) return res.json({ success: false, error: 'CIRCLE_API_KEY not set', dev: true });

  const url = `https://api.circle.com/v1/w3s${apiPath}`;
  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (userToken) headers['X-User-Token'] = userToken;

  try {
    const r = await fetch(url, {
      method,
      headers,
      ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    console.error('[circle]', err.message);
    return res.json({ success: false, error: err.message.slice(0, 100) });
  }
}
