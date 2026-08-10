// api/_lib/auth.js — shared server-side auth for NAN
//
// NAN has two login paths, so it needs two matching auth checks:
//
// 1. Circle email OTP users → after otp.js verifies the code, it issues a
//    signed session token (HMAC, not a real JWT lib to avoid a new dep).
//    Money-moving Circle-wallet endpoints must call requireEmailSession()
//    and confirm the token's email matches the email in the request body.
//
// 2. MetaMask users → they hold their own private key, so NAN can't issue
//    them a session; instead each sensitive request must include a fresh
//    signed message proving control of `userAddress` right now.
//    requireWalletSignature() verifies that with ethers, no new state needed.
//
// Both are fail-closed: any missing/invalid/expired proof returns null and
// the caller must stop and respond 401/403 — never fall through and process
// the action anyway.

import crypto from 'crypto';

const SECRET = process.env.OTP_SECRET || process.env.CIRCLE_ENTITY_SECRET || 'nan-otp-fixed-secret-v1';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;     // 30 days — matches the frontend's "remember this login" window
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;           // signed message must be < 5 min old

function b64url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

// ── 1. Email-session tokens (Circle custody wallets) ─────────────────────────

export function signEmailSession(email) {
  const payload = { email: String(email).toLowerCase().trim(), exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}

export function verifyEmailSession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  // Reject anything that isn't exactly 64 lowercase hex chars up front —
  // Buffer.from(str,'hex') silently truncates at the first invalid/odd
  // character instead of throwing, so without this check a tampered token
  // with junk appended could still hex-decode to the correct byte length
  // and pass the constant-time comparison below.
  if (!payloadB64 || !sig || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(payloadB64)); } catch { return null; }
  if (!payload?.email || !payload?.exp || Date.now() > payload.exp) return null;
  return payload; // { email, exp }
}

// Reads `Authorization: Bearer <token>`, verifies it, and (if matchEmail is
// given) confirms it belongs to that email. On any failure, sends the 401/403
// itself and returns null — callers should `if (!requireEmailSession(...)) return;`
export function requireEmailSession(req, res, { matchEmail } = {}) {
  const header = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const session = verifyEmailSession(token);
  if (!session) {
    res.status(401).json({ success: false, error: 'Unauthorized — please log in again' });
    return null;
  }
  if (matchEmail && session.email !== String(matchEmail).toLowerCase().trim()) {
    res.status(403).json({ success: false, error: 'Session does not match the account for this request' });
    return null;
  }
  return session;
}

// ── 3. Agent-wallet auth (dual mode) ──────────────────────────────────────────
// Agent wallets belong to two different kinds of users:
//   - Self-custody (MetaMask): they hold the key → prove it with a fresh
//     personal_sign signature (requireWalletSignature above).
//   - Circle-custody (email OTP): Circle holds the key, so there's nothing in
//     the browser to sign with — instead they prove it with the same email
//     session used for circle-wallets.js, PROVIDED that email has already
//     been linked to this wallet address server-side.
// `getLinkedEmail(userAddress)` is injected by the caller (it needs Redis
// access, which lives in agent-wallets.js, not this shared module).
export async function requireAgentAuth(req, res, { action, userAddress, getLinkedEmail }) {
  const { signature } = req.body || {};

  if (signature) {
    return requireWalletSignature(req, res, { action, userAddress });
  }

  const header = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const session = verifyEmailSession(token);
  if (!session) {
    res.status(401).json({ success: false, error: 'Provide a wallet signature or log in to verify this action' });
    return false;
  }
  const linkedEmail = await getLinkedEmail(userAddress);
  if (!linkedEmail || linkedEmail.toLowerCase() !== session.email) {
    res.status(403).json({ success: false, error: 'Your session is not linked to this wallet' });
    return false;
  }
  return true;
}

// Builds the exact message the frontend must sign with personal_sign so both
// sides derive an identical string. `action` should be the request's action
// name (e.g. "transfer") so a signature can't be replayed against a different
// action, and `nonce`/`timestamp` prevent replay across requests.
export function buildAuthMessage({ action, userAddress, timestamp }) {
  return `NAN authorization\naction: ${action}\naddress: ${String(userAddress).toLowerCase()}\ntimestamp: ${timestamp}`;
}

// Verifies req.body.{signature, timestamp} proves control of userAddress for
// this specific action, right now (signature must be <5 min old, non-reusable
// across actions since the action name is baked into the signed message).
export async function requireWalletSignature(req, res, { action, userAddress }) {
  const { signature, timestamp } = req.body || {};
  if (!userAddress) {
    res.status(400).json({ success: false, error: 'userAddress is required' });
    return false;
  }
  if (!signature || !timestamp) {
    res.status(401).json({ success: false, error: 'Missing signature — please approve the request in your wallet' });
    return false;
  }
  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < -30_000 || age > SIGNATURE_MAX_AGE_MS) {
    res.status(401).json({ success: false, error: 'Signature expired — please try again' });
    return false;
  }
  try {
    const { ethers } = await import('ethers');
    const message = buildAuthMessage({ action, userAddress, timestamp });
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== String(userAddress).toLowerCase()) {
      res.status(403).json({ success: false, error: 'Signature does not match wallet address' });
      return false;
    }
    return true;
  } catch (e) {
    res.status(401).json({ success: false, error: 'Could not verify signature: ' + e.message });
    return false;
  }
}
