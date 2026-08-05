// api/support.js — NAN Support: AI-first chat with human handoff, ticketed.
//
// Storage: Upstash Redis REST API (same pattern as api/orders.js) — no Postgres
// exists in this backend, so tickets live at nan:support:<ticketId> and open
// tickets are tracked in the nan:support:open set for the admin panel.
//
// Actions (all POST /api/support, routed by body.action):
//   create-session   { userAddress?, userEmail? }                 -> { ticketId, session }
//   message          { ticketId, text }                           -> { session }   (AI replies unless already handed off)
//   request-human    { ticketId }                                 -> { session }   (flags for a human, emails admin)
//   admin-reply       { ticketId, text, adminPassword }             -> { session }
//   get-session      { ticketId }                                 -> { session }
//   list-open        { adminPassword }                            -> { tickets: [...] }
//   close-session    { ticketId, adminPassword? }                 -> { session }   (emails admin the full transcript)
//   email-summary    { ticketId, email }                          -> { success }   (emails the USER their transcript + ticket #)

const UPSTASH_URL   = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL || process.env.SMTP_USER || process.env.SMTP_FROM;
const OPENAI_KEY    = process.env.OPENAI_API_KEY;

async function redisCmd(...args) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${UPSTASH_URL}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  });
  const d = await r.json();
  return d.result;
}

function newTicketId() {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `NAN-${Date.now().toString(36).toUpperCase()}${rand}`;
}

async function getSession(ticketId) {
  try {
    const raw = await redisCmd('GET', `nan:support:${ticketId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { console.log('[support] Redis GET error:', e.message); return null; }
}
async function saveSession(session) {
  session.updatedAt = Date.now();
  await redisCmd('SET', `nan:support:${session.ticketId}`, JSON.stringify(session));
}

// ── Email (same nodemailer/SMTP pattern as api/notify.js) ──────────────────────
async function sendEmail(to, subject, html) {
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_FROM;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    console.log(`\n[support] EMAIL to ${to}\nSubject: ${subject}\n`);
    return { success: true, dev: true };
  }
  try {
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: parseInt(process.env.SMTP_PORT || '587') === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({ from: `"NAN Support" <${smtpUser}>`, to, subject, html });
    return { success: true };
  } catch (e) {
    console.error('[support] email error:', e.message);
    return { success: false, error: e.message };
  }
}

function wrapEmail(inner) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#07081a;border-radius:16px;padding:24px;">
      <div style="font-size:20px;font-weight:700;color:#93c5fd;margin-bottom:20px;">NAN Support</div>
      ${inner}
    </div>
  </div>`;
}

function transcriptHtml(session) {
  return session.messages.map(m =>
    `<div style="margin-bottom:10px;">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${m.sender === 'user' ? '#93c5fd' : '#60a5fa'};">${m.sender}</span>
      <div style="color:#e0e7ff;font-size:14px;line-height:1.5;">${(m.text || '').replace(/</g, '&lt;')}</div>
    </div>`
  ).join('');
}

// ── AI reply, same house pattern as api/chat.js (gpt-4o-mini, raw fetch, <ACTION> tag) ──
async function getAiReply(session) {
  if (!OPENAI_KEY) return { reply: 'Support AI is not configured right now — tap "Talk to a human" and we\'ll get back to you by email.', handoff: false };

  const systemPrompt = `You are NAN Support — a friendly, concise first-line support agent for NAN, a stablecoin DeFi wallet on Arc Testnet. Answer questions about sending/receiving USDC/EURC, swaps, bridging, cash in/out, payroll, marketplace, and general wallet usage. Be brief and direct, no markdown.

If the user has a problem you genuinely can't resolve (account-specific issue, bug, refund, anything needing a human), or they explicitly ask for a human, respond briefly and end your message with exactly: <ACTION>{"action":"handoff"}</ACTION>`;

  const msgs = session.messages
    .filter(m => m.sender === 'user' || m.sender === 'ai')
    .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 400, messages: [{ role: 'system', content: systemPrompt }, ...msgs] }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'OpenAI error');
    let reply = data.choices?.[0]?.message?.content || 'Sorry, I did not catch that — could you rephrase?';
    const handoff = /<ACTION>/.test(reply);
    reply = reply.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();
    return { reply, handoff };
  } catch (e) {
    console.error('[support] AI error:', e.message);
    return { reply: 'Sorry, support AI is having trouble right now. Tap "Talk to a human" and we will follow up by email.', handoff: false };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  try {
    // ── Open a new ticket ─────────────────────────────────────────────────
    if (action === 'create-session') {
      const { userAddress, userEmail } = req.body;
      const ticketId = newTicketId();
      const session = {
        ticketId, userAddress: userAddress || null, userEmail: userEmail || null,
        mode: 'ai', // ai -> human_pending -> human_active -> closed
        messages: [], createdAt: Date.now(), updatedAt: Date.now(), closedAt: null,
      };
      await saveSession(session);
      await redisCmd('SADD', 'nan:support:open', ticketId);

      if (ADMIN_EMAIL) {
        await sendEmail(ADMIN_EMAIL, `New support chat opened — ${ticketId}`, wrapEmail(`
          <div style="color:#e0e7ff;font-size:14px;">A new support chat just opened.</div>
          <div style="margin-top:10px;color:#93c5fd;font-size:13px;">Ticket: ${ticketId}${userAddress ? `<br/>Wallet: ${userAddress}` : ''}${userEmail ? `<br/>Email: ${userEmail}` : ''}</div>
        `));
      }
      return res.json({ ticketId, session });
    }

    // ── User sends a message; AI replies unless a human has taken over ────
    if (action === 'message') {
      const { ticketId, text } = req.body;
      if (!ticketId || !text) return res.status(400).json({ error: 'ticketId and text required' });
      const session = await getSession(ticketId);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      session.messages.push({ sender: 'user', text, ts: Date.now() });

      if (session.mode === 'ai') {
        const { reply, handoff } = await getAiReply(session);
        session.messages.push({ sender: 'ai', text: reply, ts: Date.now() });
        if (handoff) {
          session.mode = 'human_pending';
          if (ADMIN_EMAIL) {
            await sendEmail(ADMIN_EMAIL, `Support needs you — ${ticketId}`, wrapEmail(`
              <div style="color:#e0e7ff;font-size:14px;">NAN AI could not resolve this one. A user needs a human.</div>
              <div style="margin-top:10px;color:#93c5fd;font-size:13px;">Ticket: ${ticketId}</div>
              <div style="margin-top:14px;">${transcriptHtml(session)}</div>
            `));
          }
        }
      }
      // if mode is human_pending/human_active, the message just waits in the
      // transcript for the admin to see via list-open / get-session polling.

      await saveSession(session);
      return res.json({ session });
    }

    // ── User explicitly asks to talk to a human ────────────────────────────
    if (action === 'request-human') {
      const { ticketId } = req.body;
      const session = await getSession(ticketId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.mode === 'ai') session.mode = 'human_pending';
      await saveSession(session);

      if (ADMIN_EMAIL) {
        await sendEmail(ADMIN_EMAIL, `User requested a human — ${ticketId}`, wrapEmail(`
          <div style="color:#e0e7ff;font-size:14px;">A user asked to speak to a human directly.</div>
          <div style="margin-top:10px;color:#93c5fd;font-size:13px;">Ticket: ${ticketId}</div>
          <div style="margin-top:14px;">${transcriptHtml(session)}</div>
        `));
      }
      return res.json({ session });
    }

    // ── Admin replies (requires ADMIN_PASSWORD, same as api/admin/auth.js) ─
    if (action === 'admin-reply') {
      const { ticketId, text, adminPassword } = req.body;
      const adminPw = process.env.ADMIN_PASSWORD;
      if (!adminPw || typeof adminPassword !== 'string' || adminPassword.trim() !== adminPw.trim())
        return res.status(401).json({ error: 'Invalid admin password' });
      const session = await getSession(ticketId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      session.messages.push({ sender: 'admin', text, ts: Date.now() });
      session.mode = 'human_active';
      await saveSession(session);
      return res.json({ session });
    }

    // ── Poll a session (used by both the widget and the admin panel) ──────
    if (action === 'get-session') {
      const { ticketId } = req.body;
      const session = await getSession(ticketId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      return res.json({ session });
    }

    // ── Admin: list open tickets ────────────────────────────────────────────
    if (action === 'list-open') {
      const { adminPassword } = req.body;
      const adminPw = process.env.ADMIN_PASSWORD;
      if (!adminPw || typeof adminPassword !== 'string' || adminPassword.trim() !== adminPw.trim())
        return res.status(401).json({ error: 'Invalid admin password' });
      const ids = (await redisCmd('SMEMBERS', 'nan:support:open')) || [];
      const tickets = (await Promise.all(ids.map(getSession))).filter(Boolean)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return res.json({ tickets });
    }

    // ── Close a ticket: emails admin the full transcript ───────────────────
    if (action === 'close-session') {
      const { ticketId } = req.body;
      const session = await getSession(ticketId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      session.mode = 'closed';
      session.closedAt = Date.now();
      await saveSession(session);
      await redisCmd('SREM', 'nan:support:open', ticketId);

      if (ADMIN_EMAIL) {
        await sendEmail(ADMIN_EMAIL, `Support chat closed — ${ticketId}`, wrapEmail(`
          <div style="color:#e0e7ff;font-size:14px;">This chat just ended. Full transcript below.</div>
          <div style="margin-top:10px;color:#93c5fd;font-size:13px;">Ticket: ${ticketId}${session.userEmail ? `<br/>User email: ${session.userEmail}` : ''}</div>
          <div style="margin-top:14px;">${transcriptHtml(session)}</div>
        `));
      }
      return res.json({ session });
    }

    // ── User: email me this conversation + ticket number ───────────────────
    if (action === 'email-summary') {
      const { ticketId, email } = req.body;
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
      const session = await getSession(ticketId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      session.userEmail = email;
      await saveSession(session);

      const result = await sendEmail(email, `Your NAN support chat — ${ticketId}`, wrapEmail(`
        <div style="color:#e0e7ff;font-size:14px;">Here's a copy of your conversation with NAN Support.</div>
        <div style="margin-top:6px;margin-bottom:14px;color:#93c5fd;font-size:13px;">Ticket number: <b>${ticketId}</b> — keep this for reference.</div>
        ${transcriptHtml(session)}
      `));
      return res.json(result);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('[support] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
