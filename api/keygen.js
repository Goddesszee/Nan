// api/keygen.js — ONE TIME USE: generate EOA keypair
// DELETE THIS FILE after use
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.headers['x-admin'] !== (process.env.ADMIN_SECRET || 'nan-admin-2026')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { ethers } = await import('ethers');
  const wallet = ethers.Wallet.createRandom();
  return res.json({
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase,
    warning: 'COPY THESE VALUES THEN DELETE THIS FILE AND ENDPOINT'
  });
}
