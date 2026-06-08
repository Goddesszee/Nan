// api/keygen.js — ONE TIME USE: generate EOA keypair
// DELETE THIS FILE after use
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const secret = req.query?.secret || req.headers['x-admin'];
  if (secret !== (process.env.ADMIN_SECRET || 'nan-admin-2026')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { ethers } = await import('ethers');
  const wallet = ethers.Wallet.createRandom();
  return res.json({
    address: wallet.address,
    privateKey: wallet.privateKey,
    warning: 'COPY THESE VALUES THEN DELETE THIS ENDPOINT'
  });
}
