// api/bills.js — VTPass sandbox bill payment integration for NAN Wallet
// Handles: airtime, data, electricity, cable TV (DSTV/GOtv/Startimes)
// Uses VTPass sandbox: https://sandbox.vtpass.com/api
// POST /api/bills  { action, ... }

const VTPASS_BASE  = 'https://sandbox.vtpass.com/api';
const VTPASS_USER  = process.env.VTPASS_USER  || 'sandbox@vtpass.com';
const VTPASS_PASS  = process.env.VTPASS_PASS  || 'sandbox';
const VTPASS_KEY   = process.env.VTPASS_KEY   || 'sk_sandbox_xxxxxxxx';

// NGN rate fallback
const NGN_RATE = 1620;

async function vtpassRequest(endpoint, body) {
  const { default: fetch } = await import('node-fetch');
  const auth = Buffer.from(`${VTPASS_USER}:${VTPASS_PASS}`).toString('base64');
  const r = await fetch(`${VTPASS_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
      'api-key': VTPASS_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  return r.json();
}

function genRequestId() {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${Math.floor(Math.random()*10000)}`;
}

async function getLiveNgnRate() {
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    return d?.rates?.NGN || NGN_RATE;
  } catch { return NGN_RATE; }
}

// Service ID mappings
const AIRTIME_SERVICES = {
  mtn:    'mtn',
  glo:    'glo',
  airtel: 'airtel',
  '9mobile': '9mobile',
  etisalat: '9mobile',
};

const DATA_SERVICES = {
  mtn:    'mtn-data',
  glo:    'glo-data',
  airtel: 'airtel-data',
  '9mobile': 'etisalat-data',
};

const CABLE_SERVICES = {
  dstv:      'dstv',
  gotv:      'gotv',
  startimes: 'startimes',
};

const ELECTRICITY_SERVICES = {
  ekedc:   'ekedc',
  ikedc:   'ikedc',
  aedc:    'aedc',
  phed:    'phed',
  eedc:    'eedc',
  bedc:    'bedc',
  kedco:   'kedco',
  jos:     'jos-electric',
  kaduna:  'kaduna-electric',
  ibadan:  'ibadan-electric',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action } = req.body || {};

  // ── get-variations — fetch available plans for a service ──────────────────
  if (action === 'get-variations') {
    const { serviceId } = req.body;
    if (!serviceId) return res.json({ success: false, error: 'serviceId required' });
    try {
      const { default: fetch } = await import('node-fetch');
      const auth = Buffer.from(`${VTPASS_USER}:${VTPASS_PASS}`).toString('base64');
      const r = await fetch(`${VTPASS_BASE}/service-variations?serviceID=${serviceId}`, {
        headers: { 'Authorization': `Basic ${auth}`, 'api-key': VTPASS_KEY }
      });
      const d = await r.json();
      return res.json({ success: true, variations: d?.content?.varations || [] });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }

  // ── verify-meter — verify electricity meter number ────────────────────────
  if (action === 'verify-meter') {
    const { meterNumber, serviceId, meterType } = req.body;
    try {
      const d = await vtpassRequest('/merchant-verify', {
        billersCode: meterNumber,
        serviceID: serviceId || 'ekedc',
        type: meterType || 'prepaid'
      });
      return res.json({ success: true, customerName: d?.content?.Customer_Name || 'Verified', data: d });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }

  // ── verify-smartcard — verify DSTV/GOtv card ──────────────────────────────
  if (action === 'verify-smartcard') {
    const { cardNumber, serviceId } = req.body;
    try {
      const d = await vtpassRequest('/merchant-verify', {
        billersCode: cardNumber,
        serviceID: serviceId || 'dstv'
      });
      return res.json({ success: true, customerName: d?.content?.Customer_Name || 'Verified', data: d });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }

  // ── buy-airtime ───────────────────────────────────────────────────────────
  if (action === 'buy-airtime') {
    const { phone, amount, network, walletAddress } = req.body;
    if (!phone || !amount || !network) return res.json({ success: false, error: 'phone, amount, network required' });
    const serviceID = AIRTIME_SERVICES[network.toLowerCase()] || network.toLowerCase();
    const ngnRate = await getLiveNgnRate();
    const usdcCost = parseFloat(amount) / ngnRate;
    try {
      const d = await vtpassRequest('/pay', {
        request_id: genRequestId(),
        serviceID,
        amount: String(amount),
        phone,
      });
      const success = d?.code === '000' || d?.content?.transactions?.status === 'delivered';
      return res.json({
        success,
        txId: d?.content?.transactions?.transactionId || d?.requestId,
        message: success ? `✅ ₦${amount} ${network.toUpperCase()} airtime sent to ${phone}` : (d?.response_description || 'Failed'),
        usdcCost: usdcCost.toFixed(6),
        ngnRate,
        rawResponse: d
      });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }

  // ── buy-data ──────────────────────────────────────────────────────────────
  if (action === 'buy-data') {
    const { phone, variationCode, network, walletAddress } = req.body;
    if (!phone || !variationCode || !network) return res.json({ success: false, error: 'phone, variationCode, network required' });
    const serviceID = DATA_SERVICES[network.toLowerCase()] || network.toLowerCase()+'-data';
    const ngnRate = await getLiveNgnRate();
    try {
      // Get variation price first
      const { default: fetch } = await import('node-fetch');
      const auth = Buffer.from(`${VTPASS_USER}:${VTPASS_PASS}`).toString('base64');
      const vr = await fetch(`${VTPASS_BASE}/service-variations?serviceID=${serviceID}`, {
        headers: { 'Authorization': `Basic ${auth}`, 'api-key': VTPASS_KEY }
      });
      const vd = await vr.json();
      const variation = (vd?.content?.varations || []).find(v => v.variation_code === variationCode);
      const amount = variation?.variation_amount || '0';
      const usdcCost = parseFloat(amount) / ngnRate;

      const d = await vtpassRequest('/pay', {
        request_id: genRequestId(),
        serviceID,
        billersCode: phone,
        variation_code: variationCode,
        amount,
        phone,
      });
      const success = d?.code === '000' || d?.content?.transactions?.status === 'delivered';
      return res.json({
        success,
        txId: d?.content?.transactions?.transactionId || d?.requestId,
        message: success ? `✅ ${variationCode} data bought for ${phone}` : (d?.response_description || 'Failed'),
        usdcCost: usdcCost.toFixed(6),
        ngnRate,
        rawResponse: d
      });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }

  // ── pay-electricity ───────────────────────────────────────────────────────
  if (action === 'pay-electricity') {
    const { meterNumber, amount, disco, meterType } = req.body;
    if (!meterNumber || !amount || !disco) return res.json({ success: false, error: 'meterNumber, amount, disco required' });
    const serviceID = ELECTRICITY_SERVICES[disco.toLowerCase()] || disco.toLowerCase();
    const ngnRate = await getLiveNgnRate();
    const usdcCost = parseFloat(amount) / ngnRate;
    try {
      const d = await vtpassRequest('/pay', {
        request_id: genRequestId(),
        serviceID,
        billersCode: meterNumber,
        variation_code: meterType || 'prepaid',
        amount: String(amount),
        phone: '08000000000',
      });
      const success = d?.code === '000' || d?.content?.transactions?.status === 'delivered';
      const token = d?.content?.transactions?.token || d?.token || 'SANDBOX-TOKEN';
      return res.json({
        success,
        txId: d?.content?.transactions?.transactionId || d?.requestId,
        token,
        message: success ? `✅ ₦${amount} electricity paid for meter ${meterNumber}. Token: ${token}` : (d?.response_description || 'Failed'),
        usdcCost: usdcCost.toFixed(6),
        ngnRate,
        rawResponse: d
      });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }

  // ── pay-cable ─────────────────────────────────────────────────────────────
  if (action === 'pay-cable') {
    const { cardNumber, variationCode, provider, phone } = req.body;
    if (!cardNumber || !variationCode || !provider) return res.json({ success: false, error: 'cardNumber, variationCode, provider required' });
    const serviceID = CABLE_SERVICES[provider.toLowerCase()] || provider.toLowerCase();
    const ngnRate = await getLiveNgnRate();
    try {
      const { default: fetch } = await import('node-fetch');
      const auth = Buffer.from(`${VTPASS_USER}:${VTPASS_PASS}`).toString('base64');
      const vr = await fetch(`${VTPASS_BASE}/service-variations?serviceID=${serviceID}`, {
        headers: { 'Authorization': `Basic ${auth}`, 'api-key': VTPASS_KEY }
      });
      const vd = await vr.json();
      const variation = (vd?.content?.varations || []).find(v => v.variation_code === variationCode);
      const amount = variation?.variation_amount || '0';
      const usdcCost = parseFloat(amount) / ngnRate;

      const d = await vtpassRequest('/pay', {
        request_id: genRequestId(),
        serviceID,
        billersCode: cardNumber,
        variation_code: variationCode,
        amount,
        phone: phone || '08000000000',
        subscription_type: 'change',
      });
      const success = d?.code === '000' || d?.content?.transactions?.status === 'delivered';
      return res.json({
        success,
        txId: d?.content?.transactions?.transactionId || d?.requestId,
        message: success ? `✅ ${provider.toUpperCase()} ${variationCode} subscription paid for card ${cardNumber}` : (d?.response_description || 'Failed'),
        usdcCost: usdcCost.toFixed(6),
        ngnRate,
        rawResponse: d
      });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
