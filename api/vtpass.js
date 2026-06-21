// api/vtpass.js
// NAN Marketplace — Bill payments via VTpass (Airtime, Data, Electricity, DSTV)
// Docs: https://vtpass.com/documentation/
//
// Auth: VTpass uses Basic Auth (username:password) for the endpoints this
// file calls (DSTV docs explicitly confirm Basic Auth; other endpoints
// accept it too). Falls back to API-key header auth if VTPASS_KEY looks
// like a static api-key and Basic Auth env vars aren't set.
//
// Environment is controlled by VTPASS_ENV (defaults to 'sandbox' — this
// should stay 'sandbox' until NAN itself is ready to leave testnet).

const VTPASS_ENV  = (process.env.VTPASS_ENV || 'sandbox').toLowerCase();
const BASE_URL    = VTPASS_ENV === 'live' ? 'https://vtpass.com/api' : 'https://sandbox.vtpass.com/api';

function authHeaders(method) {
  // Preferred: Basic Auth with sandbox/live username + password
  if (process.env.VTPASS_USER && process.env.VTPASS_PASS) {
    const token = Buffer.from(`${process.env.VTPASS_USER}:${process.env.VTPASS_PASS}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }
  // Fallback: API key auth — header pair differs for GET vs POST per VTpass docs
  if (process.env.VTPASS_KEY) {
    if (method === 'GET') {
      return {
        'api-key':    process.env.VTPASS_KEY,
        'public-key': process.env.VTPASS_PUBLIC_KEY || '',
      };
    }
    return {
      'api-key':    process.env.VTPASS_KEY,
      'secret-key': process.env.VTPASS_SECRET_KEY || '',
    };
  }
  return {};
}

async function vtpassGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  'GET',
    headers: { ...authHeaders('GET') },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`VTpass GET ${path} failed: ${res.status}`);
  return data;
}

async function vtpassPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders('POST') },
    body:    JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// Request ID per VTpass spec: YYYYMMDDHHII (Africa/Lagos = UTC+1) + suffix,
// min 12 chars, first 12 numeric, first 12 must encode today's date.
function generateRequestId() {
  const now = new Date(Date.now() + 60 * 60 * 1000); // shift to UTC+1 (Lagos has no DST)
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${stamp}${suffix}`;
}

// Internal NGN/USD rate fetch — NOT the x402-gated public endpoint (that one
// costs $0.001 per call via Gateway and is meant for external agent callers,
// not internal server-to-server use). Same Frankfurter source, no payment gate.
let _ngnRateCache = null;
async function getNgnRate() {
  if (_ngnRateCache && Date.now() - _ngnRateCache.ts < 5 * 60 * 1000) return _ngnRateCache.rate;
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=NGN');
    const d = await r.json();
    const rate = d?.rates?.NGN;
    if (rate) {
      _ngnRateCache = { rate, ts: Date.now() };
      return rate;
    }
  } catch (e) { /* fall through to fallback */ }
  return 1650; // fallback, matches x402-ngn-rate.js fallback
}

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action } = req.body || {};

  if (!process.env.VTPASS_USER && !process.env.VTPASS_KEY) {
    return res.json({ success: false, error: 'VTpass not configured — set VTPASS_USER/VTPASS_PASS or VTPASS_KEY on Railway' });
  }

  try {
    // ── getVariations: fetch real plan/bouquet options for a service ──────
    if (action === 'getVariations') {
      const { serviceID } = req.body;
      if (!serviceID) return res.json({ success: false, error: 'serviceID required' });
      const data = await vtpassGet(`/service-variations?serviceID=${encodeURIComponent(serviceID)}`);
      const variations = data?.content?.variations || data?.content?.varations || [];
      return res.json({ success: true, serviceName: data?.content?.ServiceName, variations });
    }

    // ── verifyCustomer: check meter/smartcard before charging anything ────
    if (action === 'verifyCustomer') {
      const { serviceID, billersCode, type } = req.body;
      if (!serviceID || !billersCode) return res.json({ success: false, error: 'serviceID and billersCode required' });
      const payload = { serviceID, billersCode };
      if (type) payload.type = type; // required for electricity (prepaid/postpaid)
      const { ok, data } = await vtpassPost('/merchant-verify', payload);
      if (!ok || data?.code !== '000') {
        return res.json({ success: false, error: data?.response_description || 'Verification failed', raw: data });
      }
      return res.json({ success: true, customer: data.content });
    }

    // ── ngnPreview: show NAN balance user what a Naira amount costs in USDC ─
    if (action === 'ngnPreview') {
      const { ngnAmount } = req.body;
      const amt = parseFloat(ngnAmount);
      if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: 'Invalid ngnAmount' });
      const rate = await getNgnRate();
      const usdcAmount = amt / rate;
      return res.json({ success: true, ngnAmount: amt, usdcAmount: parseFloat(usdcAmount.toFixed(6)), rate });
    }

    // ── purchase: airtime, data, electricity, or DSTV ──────────────────────
    // Note: this endpoint does NOT touch NAN's on-chain balance or move
    // USDC — that deduction must happen on the frontend (signed by the
    // user's wallet) BEFORE calling this with action=purchase, same pattern
    // as other NAN actions. This endpoint only talks to VTpass.
    if (action === 'purchase') {
      const { serviceID, phone, amount, billersCode, variationCode, subscriptionType, walletAddress } = req.body;
      if (!serviceID) return res.json({ success: false, error: 'serviceID required' });
      if (walletAddress && !isValidAddress(walletAddress)) {
        return res.json({ success: false, error: 'Invalid walletAddress' });
      }

      const payload = {
        request_id: generateRequestId(),
        serviceID,
      };

      // Airtime: simple amount + phone, no variation code
      if (['mtn', 'glo', 'airtel', 'etisalat', '9mobile'].includes(serviceID)) {
        if (!phone || !amount) return res.json({ success: false, error: 'phone and amount required for airtime' });
        payload.phone = phone;
        payload.amount = amount;
      }
      // Data: needs billersCode (phone) + variation_code from getVariations
      else if (serviceID.endsWith('-data')) {
        if (!phone || !variationCode) return res.json({ success: false, error: 'phone and variationCode required for data' });
        payload.billersCode = phone;
        payload.variation_code = variationCode;
        payload.phone = phone;
      }
      // Electricity: needs billersCode (meter), variation_code (prepaid/postpaid), amount, phone
      else if (serviceID.includes('electric')) {
        if (!billersCode || !variationCode || !amount || !phone) {
          return res.json({ success: false, error: 'billersCode, variationCode, amount, and phone required for electricity' });
        }
        payload.billersCode = billersCode;
        payload.variation_code = variationCode;
        payload.amount = amount;
        payload.phone = phone;
      }
      // TV (DSTV/GOTV/Startimes): needs billersCode (smartcard), variation_code, phone, subscription_type
      else if (['dstv', 'gotv', 'startimes'].includes(serviceID)) {
        if (!billersCode || !phone || !subscriptionType) {
          return res.json({ success: false, error: 'billersCode, phone, and subscriptionType (change|renew) required for TV' });
        }
        payload.billersCode = billersCode;
        payload.phone = phone;
        payload.subscription_type = subscriptionType;
        if (variationCode) payload.variation_code = variationCode; // required for 'change', not for 'renew'
        if (amount) payload.amount = amount;
      } else {
        return res.json({ success: false, error: `Unrecognized serviceID: ${serviceID}` });
      }

      const { ok, data } = await vtpassPost('/pay', payload);

      // VTpass code '000' = success, others vary (see response-codes docs).
      // Pending/timeout states should be requeried, not treated as hard failures.
      const code = data?.code;
      const success = code === '000';
      return res.json({
        success,
        pending: code === '099' || code === '...' /* requery recommended states */,
        requestId: payload.request_id,
        responseDescription: data?.response_description,
        transaction: data?.content?.transactions || null,
        purchasedCode: data?.purchased_code || null, // electricity token, if applicable
        raw: data,
      });
    }

    // ── requeryStatus: check on a pending/uncertain transaction ────────────
    if (action === 'requeryStatus') {
      const { requestId } = req.body;
      if (!requestId) return res.json({ success: false, error: 'requestId required' });
      const { ok, data } = await vtpassPost('/requery', { request_id: requestId });
      return res.json({
        success: data?.code === '000',
        responseDescription: data?.response_description,
        transaction: data?.content?.transactions || null,
        raw: data,
      });
    }

    return res.json({
      success: false,
      error:   'Unknown action. Valid: getVariations, verifyCustomer, ngnPreview, purchase, requeryStatus',
    });

  } catch (err) {
    console.error('[vtpass]', err.message);
    return res.json({ success: false, error: err.message.slice(0, 200) });
  }
}
