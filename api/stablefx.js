// api/stablefx.js
// Circle StableFX — permissioned institutional RFQ swap on Arc Testnet
// Docs: https://developers.circle.com/stablefx
//
// REQUIRES a separate StableFX API key from Circle (not the same as your Wallets key)
// Contact: sales@circle.com  |  Env var: STABLEFX_API_KEY
//
// Correct contract addresses confirmed from Arc docs:
//   Permit2  : 0x000000000022D473030F116dDEE9F6B43aC78BA3  ← approve THIS
//   FxEscrow : 0x867650F5eAe8df91445971f14d89fd84F0C9a9f8  ← settlement (do NOT approve directly)
//
// Full 5-step taker flow:
//   1. quote   → POST /v1/exchange/stablefx/quotes       → returns typedData to sign
//   2. trade   → POST /v1/exchange/stablefx/trades       → creates trade (pending_settlement)
//   3. presign → POST /v1/exchange/stablefx/signatures/funding/presign → 2nd typedData to sign
//   4. fund    → POST /v1/exchange/stablefx/fund         → submits funding signature onchain
//   5. status  → GET  /v1/exchange/stablefx/trades/{id}  → poll until 'settled'

import { randomUUID } from 'crypto';

const CIRCLE_API   = 'https://api.circle.com';
const STABLEFX_KEY = process.env.STABLEFX_API_KEY || process.env.CIRCLE_API_KEY;

const VALID_CURRENCIES = new Set(['USDC', 'EURC']);

function validCurrency(c)  { return typeof c === 'string' && VALID_CURRENCIES.has(c.toUpperCase()); }
function validAmount(a)    { const n = parseFloat(a); return !isNaN(n) && n > 0 && n <= 1_000_000; }
function validAddress(a)   { return typeof a === 'string' && /^0x[a-fA-F0-9]{40}$/.test(a); }
function validUUID(id)     { return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id); }
function validSig(s)       { return typeof s === 'string' && /^0x[a-fA-F0-9]{130}$/.test(s); }
function validTradeId(id)  { return typeof id === 'string' && /^\d+$/.test(id); }

async function circle(method, path, body) {
  const opts = {
    method,
    headers: {
      Authorization:  `Bearer ${STABLEFX_KEY}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r    = await fetch(`${CIRCLE_API}${path}`, opts);
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!STABLEFX_KEY)
    return res.status(500).json({ error: 'STABLEFX_API_KEY not set — contact sales@circle.com for access' });

  const { action } = req.body;

  try {
    // ── info: return contract addresses the frontend needs ──────────────────
    if (action === 'info') {
      return res.json({
        success: true,
        permit2:  '0x000000000022D473030F116dDEE9F6B43aC78BA3',
        fxEscrow: '0x867650F5eAe8df91445971f14d89fd84F0C9a9f8',
        note: 'Approve Permit2, not FxEscrow',
      });
    }

    // ── Step 1: quote ───────────────────────────────────────────────────────
    // POST /v1/exchange/stablefx/quotes
    // Returns the quote + typedData (EIP-712) that the user must sign
    if (action === 'quote') {
      const { from, to, amount, recipientAddress } = req.body;
      if (!validCurrency(from))   return res.status(400).json({ error: 'Invalid from currency (USDC or EURC)' });
      if (!validCurrency(to))     return res.status(400).json({ error: 'Invalid to currency (USDC or EURC)' });
      if (from.toUpperCase() === to.toUpperCase()) return res.status(400).json({ error: 'from and to must differ' });
      if (!validAmount(amount))   return res.status(400).json({ error: 'Invalid amount' });
      if (!validAddress(recipientAddress)) return res.status(400).json({ error: 'Invalid recipientAddress' });

      const { ok, status, data } = await circle('POST', '/v1/exchange/stablefx/quotes', {
        from:  { currency: from.toUpperCase(), amount: parseFloat(amount).toFixed(6) },
        to:    { currency: to.toUpperCase() },
        tenor: 'instant',
        type:  'tradable',
        recipientAddress,
      });

      if (!ok) {
        console.error('StableFX quote error:', JSON.stringify(data));
        return res.status(status).json({ error: data?.message || 'Quote failed — check StableFX API key' });
      }
      // data includes: id, rate, from, to, typedData (sign this with signTypedData)
      return res.json({ success: true, quote: data });
    }

    // ── Step 2: trade ───────────────────────────────────────────────────────
    // POST /v1/exchange/stablefx/trades
    // Frontend signs quote.typedData with signTypedData, sends signature here
    if (action === 'trade') {
      const { quoteId, address, message, signature } = req.body;
      if (!validUUID(quoteId))    return res.status(400).json({ error: 'Invalid quoteId' });
      if (!validAddress(address)) return res.status(400).json({ error: 'Invalid address' });
      if (!validSig(signature))   return res.status(400).json({ error: 'Invalid EIP-712 signature' });
      if (!message || typeof message !== 'object' || Array.isArray(message))
        return res.status(400).json({ error: 'Invalid message — must be typedData.message from quote' });

      // Always generate idempotency key server-side
      const { ok, status, data } = await circle('POST', '/v1/exchange/stablefx/trades', {
        idempotencyKey: randomUUID(),
        quoteId,
        address,
        message,
        signature,
      });

      if (!ok) {
        console.error('StableFX trade error:', JSON.stringify(data));
        return res.status(status).json({ error: data?.message || 'Trade failed — quote may have expired' });
      }
      // data includes: id, contractTradeId, status ('pending_settlement')
      return res.json({ success: true, trade: data });
    }

    // ── Step 3: presign ─────────────────────────────────────────────────────
    // POST /v1/exchange/stablefx/signatures/funding/presign
    // Returns a second typedData the taker must sign to authorize onchain funding
    if (action === 'presign') {
      const { contractTradeId } = req.body;
      if (!validTradeId(contractTradeId))
        return res.status(400).json({ error: 'Invalid contractTradeId (numeric string)' });

      const { ok, status, data } = await circle(
        'POST', '/v1/exchange/stablefx/signatures/funding/presign',
        { contractTradeIds: [contractTradeId], type: 'taker' },
      );

      if (!ok) {
        console.error('StableFX presign error:', JSON.stringify(data));
        return res.status(status).json({ error: data?.message || 'Presign failed' });
      }
      // data includes: typedData (sign this), deliverables, receivables
      return res.json({ success: true, presign: data });
    }

    // ── Step 4: fund ────────────────────────────────────────────────────────
    // POST /v1/exchange/stablefx/fund
    // Submit the second signed payload — Circle handles the onchain tx
    // Circle returns blank 200 on success
    if (action === 'fund') {
      const { permit2, signature } = req.body;
      if (!validSig(signature))  return res.status(400).json({ error: 'Invalid funding signature' });
      if (!permit2 || typeof permit2 !== 'object' || Array.isArray(permit2))
        return res.status(400).json({ error: 'Invalid permit2 object' });

      const { ok, status, data } = await circle('POST', '/v1/exchange/stablefx/fund', {
        type: 'taker',
        signature,
        permit2,
      });

      if (!ok) {
        console.error('StableFX fund error:', JSON.stringify(data));
        return res.status(status).json({ error: data?.message || 'Funding failed' });
      }
      return res.json({ success: true });
    }

    // ── Step 5: status ──────────────────────────────────────────────────────
    // GET /v1/exchange/stablefx/trades/{id}
    // States: pending_settlement → taker_funded → maker_funded → settled
    //         or: breaching → breached (funds returned if a side fails to fund)
    if (action === 'status') {
      const { tradeId } = req.body;
      if (!validUUID(tradeId)) return res.status(400).json({ error: 'Invalid tradeId (UUID)' });

      const { ok, status, data } = await circle('GET', `/v1/exchange/stablefx/trades/${tradeId}`, null);

      if (!ok) {
        console.error('StableFX status error:', JSON.stringify(data));
        return res.status(status).json({ error: data?.message || 'Could not fetch trade status' });
      }
      return res.json({ success: true, trade: data });
    }

    return res.status(400).json({ error: 'Valid actions: info, quote, trade, presign, fund, status' });

  } catch (err) {
    console.error('StableFX handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
