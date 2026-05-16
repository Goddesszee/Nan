export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.json({ data: {}, dev: true });
}
