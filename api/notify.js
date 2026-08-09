// api/notify.js
// Sends email notifications for payment events. Thin wrapper around the
// shared emailer in _lib/emailer.js (also used directly by other backend
// files, e.g. agent-wallets.js for invoice events, without an HTTP round-trip).

import { sendNotificationEmail } from './_lib/emailer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, subject, message } = req.body || {};
  const result = await sendNotificationEmail(email, subject, message);
  return res.json(result);
}
