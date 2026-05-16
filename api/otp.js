export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.json({ success: true, dev: true, message: 'Dev mode: OTP is 123456' });
}
