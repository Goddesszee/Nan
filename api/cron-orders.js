// NAN Cron Job — runs every hour, checks and executes due orders
// Configured in vercel.json as a cron route
import { Resend } from 'resend';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'noreply@nanarc.xyz';
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
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
}

function orderEmailHtml(title, body, ctaUrl, ctaText) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#07081a;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="480" cellpadding="0" cellspacing="0" style="background:#111338;border-radius:16px;border:1px solid rgba(139,92,246,0.3);overflow:hidden;">
  <tr><td style="height:3px;background:linear-gradient(90deg,transparent,#a78bfa,#8b5cf6,#a78bfa,transparent);"></td></tr>
  <tr><td style="padding:28px 32px 0;">
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="width:36px;height:36px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border-radius:10px;text-align:center;vertical-align:middle;">
        <span style="color:#ede9fe;font-size:16px;font-weight:700;">N</span>
      </td>
      <td style="padding-left:10px;font-size:18px;font-weight:700;color:#f5f3ff;letter-spacing:.06em;">NAN</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:24px 32px;">
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f5f3ff;letter-spacing:-.5px;">${title}</h1>
    <div style="font-size:15px;color:rgba(196,181,253,.7);line-height:1.7;">${body}</div>
    ${ctaUrl ? `<div style="margin-top:24px;"><a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border-radius:10px;color:#ede9fe;font-size:15px;font-weight:700;text-decoration:none;">${ctaText||'Open NAN Wallet'}</a></div>` : ''}
  </td></tr>
  <tr><td style="padding:20px 32px 28px;border-top:1px solid rgba(139,92,246,.15);">
    <p style="margin:0;font-size:12px;color:rgba(196,181,253,.35);">NAN Wallet · Arc Testnet · <a href="${APP_URL}" style="color:rgba(139,92,246,.6);text-decoration:none;">nanarc.xyz</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function getAllWalletKeys() {
  const data = await kv('GET', '/keys/nan:orders:*');
  return data.result || [];
}

async function getOrders(key) {
  const data = await kv('GET', `/get/${encodeURIComponent(key)}`);
  return data.result ? JSON.parse(data.result) : [];
}

async function saveOrders(key, orders) {
  await kv('POST', `/set/${encodeURIComponent(key)}`, orders);
}

async function executeSend(order) {
  // For Circle email wallets — use Circle API to send
  if (!CIRCLE_API_KEY || !order.circleWalletId) return false;
  try {
    const res = await fetch('https://api.circle.com/v1/w3s/user/transactions/transfer', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: order.id + '_' + Date.now(),
        userId: order.userId,
        destinationAddress: order.to,
        amounts: [order.amount.toString()],
        tokenId: order.token === 'USDC' ? process.env.USDC_TOKEN_ID : process.env.EURC_TOKEN_ID,
        walletId: order.circleWalletId,
        feeLevel: 'LOW',
      }),
    });
    return res.ok;
  } catch { return false; }
}

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const keys = await getAllWalletKeys();
  let processed = 0, notified = 0;

  for (const key of keys) {
    const walletAddr = key.replace('nan:orders:', '');
    const orders = await getOrders(key);
    let changed = false;

    for (const order of orders) {
      if (order.status !== 'pending') continue;

      // SCHEDULED SEND — due?
      if (order.type === 'scheduled' && order.executeAt && now >= order.executeAt) {
        // Send reminder email 1 hour before
        if (order.email && now >= order.executeAt - 3600000 && !order.reminderSent) {
          await sendEmail(
            order.email,
            `⏰ Scheduled send due soon — ${order.amount} ${order.token}`,
            orderEmailHtml(
              'Your scheduled send is due soon',
              `You scheduled a send of <strong style="color:#a78bfa;">${order.amount} ${order.token}</strong> to <code style="background:rgba(139,92,246,.1);padding:2px 6px;border-radius:4px;">${order.to?.slice(0,12)}…</code> and it's due in 1 hour.<br/><br/>If you're using an email wallet, this will execute automatically. If you're using MetaMask, please open the app to confirm.`,
              `${APP_URL}/index.html`,
              'Open NAN Wallet →'
            )
          );
          order.reminderSent = true;
          changed = true;
          notified++;
        }

        // Execute if Circle wallet
        if (order.circleWalletId) {
          const ok = await executeSend(order);
          if (ok) {
            order.status = 'done';
            processed++;
            changed = true;
            if (order.email) {
              await sendEmail(
                order.email,
                `✅ Sent ${order.amount} ${order.token} successfully`,
                orderEmailHtml(
                  'Payment sent!',
                  `Your scheduled payment of <strong style="color:#a78bfa;">${order.amount} ${order.token}</strong> to <code style="background:rgba(139,92,246,.1);padding:2px 6px;border-radius:4px;">${order.to?.slice(0,12)}…</code> was sent successfully.`,
                  `${APP_URL}/index.html`,
                  'View in NAN Wallet →'
                )
              );
              notified++;
            }
            // Handle recurring
            if (order.recurring && order.interval) {
              orders.push({ ...order, id: `${order.id}_r${Date.now()}`, status: 'pending', executeAt: now + order.interval, reminderSent: false });
            }
          }
        } else if (order.email) {
          // MetaMask — send action email
          await sendEmail(
            order.email,
            `⏰ Action required — Send ${order.amount} ${order.token}`,
            orderEmailHtml(
              'Your scheduled send needs confirmation',
              `Your scheduled payment of <strong style="color:#a78bfa;">${order.amount} ${order.token}</strong> to <code style="background:rgba(139,92,246,.1);padding:2px 6px;border-radius:4px;">${order.to?.slice(0,12)}…</code> is due now.<br/><br/>Open NAN Wallet and confirm the transaction with your MetaMask wallet.`,
              `${APP_URL}/index.html`,
              'Open & Confirm →'
            )
          );
          order.status = 'notified';
          changed = true;
          notified++;
        }
      }

      // STANDING ORDER — next run due?
      if (order.type === 'standing' && order.nextRun && now >= order.nextRun) {
        if (order.circleWalletId) {
          const ok = await executeSend(order);
          if (ok) {
            order.nextRun = now + order.interval;
            order.runCount = (order.runCount || 0) + 1;
            processed++;
            changed = true;
            if (order.email) {
              await sendEmail(
                order.email,
                `✅ Standing order ran — ${order.amount} ${order.token} sent`,
                orderEmailHtml(
                  `Standing order #${order.runCount} complete`,
                  `Your recurring payment of <strong style="color:#a78bfa;">${order.amount} ${order.token}</strong> to <code style="background:rgba(139,92,246,.1);padding:2px 6px;border-radius:4px;">${order.to?.slice(0,12)}…</code> was sent.<br/><br/>Next run: <strong style="color:#f5f3ff;">${new Date(order.nextRun).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</strong>`,
                  `${APP_URL}/index.html`,
                  'View in NAN Wallet →'
                )
              );
              notified++;
            }
          }
        } else if (order.email) {
          await sendEmail(
            order.email,
            `📅 Standing order due — ${order.amount} ${order.token}`,
            orderEmailHtml(
              'Standing order needs your confirmation',
              `Your recurring payment of <strong style="color:#a78bfa;">${order.amount} ${order.token}</strong> to <code style="background:rgba(139,92,246,.1);padding:2px 6px;border-radius:4px;">${order.to?.slice(0,12)}…</code> is due.<br/><br/>Open NAN Wallet to confirm.`,
              `${APP_URL}/index.html`,
              'Open & Confirm →'
            )
          );
          order.nextRun = now + order.interval;
          changed = true;
          notified++;
        }
      }

      // LIMIT ORDER — notify when triggered
      if (order.type === 'limit' && order.status === 'triggered' && order.email) {
        await sendEmail(
          order.email,
          `🎯 Limit order triggered — ${order.amount} ${order.sellToken} → ${order.buyToken}`,
          orderEmailHtml(
            'Your limit order was triggered!',
            `The rate hit your target of <strong style="color:#a78bfa;">${order.targetRate}</strong>. Your swap of <strong style="color:#a78bfa;">${order.amount} ${order.sellToken} → ${order.buyToken}</strong> has been executed.`,
            `${APP_URL}/index.html`,
            'View in NAN Wallet →'
          )
        );
        order.status = 'done';
        changed = true;
        notified++;
      }
    }

    if (changed) {
      await saveOrders(key, orders.filter(o => o.status === 'pending' || o.status === 'notified'));
    }
  }

  return res.json({ ok: true, processed, notified, wallets: keys.length });
}
