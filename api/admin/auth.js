// api/admin/auth.js
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) return res.json({ success: false, error: 'Admin not configured' });
  if (password === adminPw) return res.json({ success: true });
  return res.json({ success: false, error: 'Invalid password' });
}
