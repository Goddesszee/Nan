// api/cashinout.js — NAN Cash In and Cash Out. Real bank accounts, real live FX rates
// (fetched from a public exchange rate API, USDC treated as USD pegged and EURC as
// EUR pegged, which is the standard assumption for these stablecoins), and real
// transaction records.
//
// Important limitation, stated plainly rather than hidden: there is no licensed
// Nigerian payment processor (such as Flutterwave or Paystack) configured for this
// project. This API can create a genuine cash in or cash out request and track its
// status, but it cannot itself move real Naira in or out of a bank account. A request
// stays at status pending until that missing piece exists. Do not present a pending
// request as settled.
import crypto from 'crypto';

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
async function removeFromIndex(indexKey, id) {
  const raw = await kvGet(indexKey);
  const current = Array.isArray(raw) ? raw : [];
  await kvSet(indexKey, current.filter(x => x !== id));
}
async function listByIndex(indexKey, keyPrefix) {
  const raw = await kvGet(indexKey);
  const ids = Array.isArray(raw) ? raw : [];
  const items = await Promise.all(ids.map(id => kvGet(keyPrefix + id)));
  return items.filter(Boolean);
}
function newId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > windowMs) { rateLimitMap.set(ip, { count: 1, start: now }); return true; }
  if (record.count >= limit) return false;
  record.count++; rateLimitMap.set(ip, record);
  return true;
}

let rateCache = { data: null, fetchedAt: 0 };
async function getLiveRates() {
  if (rateCache.data && Date.now() - rateCache.fetchedAt < 5 * 60 * 1000) return rateCache.data;
  const { default: fetch } = await import('node-fetch');
  const r = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!r.ok) throw new Error('Exchange rate provider unavailable');
  const d = await r.json();
  const usdToNgn = d.rates?.NGN;
  const usdToEur = d.rates?.EUR;
  if (!usdToNgn) throw new Error('NGN rate not available from provider');
  const eurToNgn = usdToEur ? usdToNgn / usdToEur : null;
  const result = {
    usdcToNgn: usdToNgn,
    eurcToNgn: eurToNgn,
    usdcToEurc: usdToEur,
    source: 'open.er-api.com',
    fetchedAt: Date.now(),
  };
  rateCache = { data: result, fetchedAt: Date.now() };
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests, please wait a moment' });

  const { action } = req.body || {};

  try {
    if (action === 'get-rates') {
      const rates = await getLiveRates();
      return res.json({ success: true, rates });
    }

    if (action === 'add-bank-account') {
      const { walletAddress, bankName, accountNumber, accountName } = req.body;
      if (!walletAddress || !bankName || !accountNumber || !accountName) return res.json({ success: false, error: 'walletAddress, bankName, accountNumber, and accountName are all required' });
      const existing = await listByIndex(`nan:cashio:bankindex:${walletAddress.toLowerCase()}`, 'nan:cashio:bank:');
      const account = {
        id: newId('bank'), walletAddress: walletAddress.toLowerCase(),
        bankName: String(bankName).slice(0, 100), accountNumber: String(accountNumber).slice(0, 20), accountName: String(accountName).slice(0, 100),
        isDefault: existing.length === 0, verified: false, createdAt: Date.now(),
      };
      await kvSet(`nan:cashio:bank:${account.id}`, account);
      await addToIndex(`nan:cashio:bankindex:${walletAddress.toLowerCase()}`, account.id);
      return res.json({ success: true, account });
    }
    if (action === 'edit-bank-account') {
      const { walletAddress, accountId, bankName, accountNumber, accountName } = req.body;
      if (!walletAddress || !accountId) return res.json({ success: false, error: 'walletAddress and accountId are required' });
      const account = await kvGet(`nan:cashio:bank:${accountId}`);
      if (!account || account.walletAddress !== walletAddress.toLowerCase()) return res.json({ success: false, error: 'Account not found' });
      if (bankName) account.bankName = String(bankName).slice(0, 100);
      if (accountNumber) account.accountNumber = String(accountNumber).slice(0, 20);
      if (accountName) account.accountName = String(accountName).slice(0, 100);
      account.verified = false;
      await kvSet(`nan:cashio:bank:${accountId}`, account);
      return res.json({ success: true, account });
    }
    if (action === 'delete-bank-account') {
      const { walletAddress, accountId } = req.body;
      if (!walletAddress || !accountId) return res.json({ success: false, error: 'walletAddress and accountId are required' });
      await removeFromIndex(`nan:cashio:bankindex:${walletAddress.toLowerCase()}`, accountId);
      return res.json({ success: true });
    }
    if (action === 'set-default-bank-account') {
      const { walletAddress, accountId } = req.body;
      if (!walletAddress || !accountId) return res.json({ success: false, error: 'walletAddress and accountId are required' });
      const accounts = await listByIndex(`nan:cashio:bankindex:${walletAddress.toLowerCase()}`, 'nan:cashio:bank:');
      for (const a of accounts) {
        a.isDefault = a.id === accountId;
        await kvSet(`nan:cashio:bank:${a.id}`, a);
      }
      return res.json({ success: true });
    }
    if (action === 'list-bank-accounts') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const accounts = await listByIndex(`nan:cashio:bankindex:${walletAddress.toLowerCase()}`, 'nan:cashio:bank:');
      accounts.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, accounts });
    }

    if (action === 'create-cashin-request') {
      const { walletAddress, nairaAmount, convertTo } = req.body;
      if (!walletAddress || !nairaAmount) return res.json({ success: false, error: 'walletAddress and nairaAmount are required' });
      const rates = await getLiveRates();
      const rate = convertTo === 'EURC' ? rates.eurcToNgn : rates.usdcToNgn;
      const estimated = rate ? parseFloat(nairaAmount) / rate : null;
      const request = {
        id: newId('cashin'), walletAddress: walletAddress.toLowerCase(), type: 'cashin',
        nairaAmount: parseFloat(nairaAmount), convertTo: convertTo || 'USDC',
        rate, estimatedReceive: estimated, fee: 0,
        bankReference: 'NAN' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        status: 'pending', createdAt: Date.now(),
      };
      await kvSet(`nan:cashio:tx:${request.id}`, request);
      await addToIndex(`nan:cashio:txindex:${walletAddress.toLowerCase()}`, request.id);
      return res.json({ success: true, request });
    }
    if (action === 'create-cashout-request') {
      const { walletAddress, stablecoinAmount, fromToken, bankAccountId } = req.body;
      if (!walletAddress || !stablecoinAmount || !bankAccountId) return res.json({ success: false, error: 'walletAddress, stablecoinAmount, and bankAccountId are required' });
      const bankAccount = await kvGet(`nan:cashio:bank:${bankAccountId}`);
      if (!bankAccount || bankAccount.walletAddress !== walletAddress.toLowerCase()) return res.json({ success: false, error: 'Bank account not found' });
      const rates = await getLiveRates();
      const rate = fromToken === 'EURC' ? rates.eurcToNgn : rates.usdcToNgn;
      const estimated = rate ? parseFloat(stablecoinAmount) * rate : null;
      const request = {
        id: newId('cashout'), walletAddress: walletAddress.toLowerCase(), type: 'cashout',
        stablecoinAmount: parseFloat(stablecoinAmount), fromToken: fromToken || 'USDC',
        rate, estimatedNaira: estimated, fee: 0,
        bankAccountId, bankName: bankAccount.bankName, accountNumber: bankAccount.accountNumber, accountName: bankAccount.accountName,
        status: 'pending', createdAt: Date.now(),
      };
      await kvSet(`nan:cashio:tx:${request.id}`, request);
      await addToIndex(`nan:cashio:txindex:${walletAddress.toLowerCase()}`, request.id);
      return res.json({ success: true, request });
    }
    if (action === 'list-transactions') {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.json({ success: false, error: 'walletAddress required' });
      const txs = await listByIndex(`nan:cashio:txindex:${walletAddress.toLowerCase()}`, 'nan:cashio:tx:');
      txs.sort((a, b) => b.createdAt - a.createdAt);
      return res.json({ success: true, transactions: txs });
    }
    if (action === 'get-transaction') {
      const { transactionId } = req.body;
      if (!transactionId) return res.json({ success: false, error: 'transactionId required' });
      const tx = await kvGet(`nan:cashio:tx:${transactionId}`);
      if (!tx) return res.json({ success: false, error: 'Transaction not found' });
      return res.json({ success: true, transaction: tx });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[cashinout]', e.message);
    res.status(500).json({ success: false, error: e.message.slice(0, 200) });
  }
}
