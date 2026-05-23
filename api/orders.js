// NAN Orders API — CRUD + Cron in one function (Hobby plan compatible)
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@nanarc.xyz';
const APP_URL = 'https://nanarc.xyz';

async function kv(method, path, body) {
  const res = await fetch(`${KV_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
  } catch(e) { console.log('Email error:', e); }
}

function emailHtml(title, body, ctaUrl, ctaText) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#07081a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="480" cellpadding="0" cellspacing="0" style="background:#111338;border-radius:16px;border:1px solid rgba(139,92,246,0.3);">
  <tr><td style="height:3px;background:linear-gradient(90deg,transparent,#a78bfa,#8b5cf6,#a78bfa,transparent);border-radius:16px 16px 0 0;"></td></tr>
  <tr><td style="padding:28px 32px;">
    <div style="font-size:20px;font-weight:700;color:#f5f3ff;margin-bottom:8px;">✦ NAN</div>
    <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#f5f3ff;">${title}</h2>
    <div style="font-size:14px;color:rgba(196,181,253,.7);line-height:1.7;">${body}</div>
    ${ctaUrl ? `<div style="margin-top:24px;"><a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border-radius:10px;color:#ede9fe;font-size:14px;font-weight:700;text-decoration:none;">${ctaText||'Open NAN Wallet'}</a></div>` : ''}
  </td></tr>
  <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(139,92,246,.15);">
    <p style="margin:0;font-size:11px;color:rgba(196,181,253,.3);">NAN Wallet · <a href="${APP_URL}" style="color:rgba(139,92,246,.5);text-decoration:none;">nanarc.xyz</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

async function getOrders(wallet) {
  const key = `nan:orders:${wallet.toLowerCase()}`;
  const data = await kv('GET', `/get/${encodeURIComponent(key)}`);
  return { key, orders: data.result ? JSON.parse(data.result) : [] };
}

async function saveOrders(key, orders) {
  await kv('POST', `/set/${encodeURIComponent(key)}`, orders);
}

async function runCron() {
  const now = Date.now();
  // Get all order keys
  const data = await kv('GET', '/keys/nan:orders:*');
  const keys = data.result || [];
  let processed = 0, notified = 0;

  for (const key of keys) {
    const ordersData = await kv('GET', `/get/${encodeURIComponent(key)}`);
    const orders = ordersData.result ? JSON.parse(ordersData.result) : [];
    let changed = false;

    for (const order of orders) {
      if (order.status !== 'pending') continue;

      // Scheduled send due
      if (order.type === 'scheduled' && order.executeAt && now >= order.executeAt - 3600000 && !order.reminderSent && order.email) {
        await sendEmail(order.email,
          `⏰ Scheduled send due — ${order.amount} ${order.token}`,
          emailHtml('Your scheduled send is due soon',
            `You have a payment of <strong style="color:#a78bfa;">${order.amount} ${order.token}</strong> to <code>${order.to?.slice(0,12)}…</code> due soon.<br/><br/>Open NAN Wallet to confirm.`,
            `${APP_URL}/index.html`, 'Open NAN Wallet →')
        );
        order.reminderSent = true;
        changed = true;
        notified++;
      }

      // Standing order due
      if (order.type === 'standing' && order.nextRun && now >= order.nextRun && order.email) {
        await sendEmail(order.email,
          `📅 Standing order due — ${order.amount} ${order.token}`,
          emailHtml('Standing order needs confirmation',
            `Your recurring payment of <strong style="color:#a78bfa;">${order.amount} ${order.token}</strong> to <code>${order.to?.slice(0,12)}…</code> is due.<br/><br/>Open NAN Wallet to confirm.`,
            `${APP_URL}/index.html`, 'Open & Confirm →')
        );
        order.nextRun = now + order.interval;
        changed = true;
        notified++;
      }

      // Limit order triggered
      if (order.type === 'limit' && order.status === 'triggered' && order.email) {
        await sendEmail(order.email,
          `🎯 Limit order triggered — ${order.amount} ${order.sellToken} → ${order.buyToken}`,
          emailHtml('Your limit order was triggered!',
            `Rate hit your target of <strong style="color:#a78bfa;">${order.targetRate}</strong>. Swap of <strong style="color:#a78bfa;">${order.amount} ${order.sellToken} → ${order.buyToken}</strong> executed.`,
            `${APP_URL}/index.html`, 'View in NAN Wallet →')
        );
        order.status = 'done';
        changed = true;
        notified++;
        processed++;
      }
    }

    if (changed) {
      await saveOrders(key, orders.filter(o => o.status === 'pending'));
    }
  }
  return { processed, notified, wallets: keys.length };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // CRON trigger
  if (req.query.cron === '1') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await runCron();
    return res.json({ ok: true, ...result });
  }

  const { method, body, query } = req;
  const walletAddr = query.wallet || body?.wallet;
  if (!walletAddr) return res.status(400).json({ error: 'wallet required' });

  if (method === 'GET') {
    const { orders } = await getOrders(walletAddr);
    return res.json({ orders });
  }

  if (method === 'POST') {
    const { order } = body;
    if (!order) return res.status(400).json({ error: 'order required' });
    const { key, orders } = await getOrders(walletAddr);
    if (!orders.find(o => o.id === order.id)) {
      orders.push({ ...order, createdAt: Date.now() });
      await saveOrders(key, orders);

      // Send confirmation email
      if (order.email) {
        const typeLabels = { limit: '🎯 Limit order', scheduled: '⏰ Scheduled send', standing: '📅 Standing order' };
        const desc = order.type === 'limit'
          ? `Sell ${order.amount} ${order.sellToken} → ${order.buyToken} when rate hits ${order.targetRate}`
          : order.type === 'scheduled'
          ? `Send ${order.amount} ${order.token} to ${order.to?.slice(0,12)}… on ${new Date(order.executeAt).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}`
          : `Send ${order.amount} ${order.token} to ${order.to?.slice(0,12)}… every ${order.freq}`;

        await sendEmail(order.email,
          `${typeLabels[order.type] || 'Order'} created — ${order.amount} ${order.sellToken||order.token||'USDC'}`,
          emailHtml(`${typeLabels[order.type] || 'Order'} created ✦`,
            `Your order has been saved and will execute automatically:<br/><br/><strong style="color:#a78bfa;">${desc}</strong><br/><br/>You'll receive an email notification when it executes.`,
            `${APP_URL}/index.html`, 'View in NAN Wallet →')
        );
      }
    }
    return res.json({ ok: true });
  }

  if (method === 'DELETE') {
    const { id } = body;
    const { key, orders } = await getOrders(walletAddr);
    const filtered = id === 'all' ? [] : orders.filter(o => o.id !== id);
    await saveOrders(key, filtered);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
