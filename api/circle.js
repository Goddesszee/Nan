export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path, body, userToken } = req.body;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer TEST_API_KEY:e508044ccce164a74f36a150f9fa9884:1471f1c47ced3b929e1dad81c796d41e'
  };
  if (userToken) headers['X-User-Token'] = userToken;

  const method = body ? 'POST' : 'GET';

  try {
    const response = await fetch('https://api.circle.com/v1/w3s' + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    console.log('Circle API', method, path, JSON.stringify(data).slice(0, 500));
    return res.status(200).json(data);
  } catch (err) {
    console.error('Circle proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
