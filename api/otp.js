const otpStore = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, email, otp } = req.body;

  if (action === 'send') {
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore[email.toLowerCase()] = { code, expires };

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer re_F7HkPfjB_H36uMUfnDyezGU2MNCg5ytRo'
        },
        body: JSON.stringify({
          from: 'NAN Wallet <onboarding@resend.dev>',
          to: [email],
          subject: 'Your NAN Login Code',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#07081a;color:#ede9fe;border-radius:16px;">
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;background:#8b5cf6;border-radius:12px;padding:12px 20px;">
                  <span style="font-size:1.2rem;font-weight:700;letter-spacing:.1em;color:#ede9fe;">NAN</span>
                </div>
              </div>
              <h2 style="text-align:center;font-size:1.3rem;margin-bottom:8px;color:#ede9fe;">Your login code</h2>
              <p style="text-align:center;color:#c4b5fd;font-size:.9rem;margin-bottom:28px;">Enter this code in the NAN app to access your wallet.</p>
              <div style="text-align:center;background:#0e1030;border:2px solid #8b5cf6;border-radius:12px;padding:24px;margin-bottom:24px;">
                <div style="font-size:2.8rem;font-weight:700;letter-spacing:.4em;color:#a78bfa;">${code}</div>
              </div>
              <p style="text-align:center;color:#6b5fa0;font-size:.78rem;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
            </div>
          `
        })
      });

      const data = await response.json();
      if (data.id) {
        return res.status(200).json({ success: true });
      } else {
        console.error('Resend error:', data);
        return res.status(500).json({ error: data.message || 'Failed to send email' });
      }
    } catch (err) {
      console.error('Send error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'verify') {
    if (!email || !otp) {
      return res.status(400).json({ error: 'Missing email or code' });
    }

    const record = otpStore[email.toLowerCase()];
    if (!record) {
      return res.status(400).json({ error: 'No code found — request a new one' });
    }
    if (Date.now() > record.expires) {
      delete otpStore[email.toLowerCase()];
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }
    if (record.code !== otp.trim()) {
      return res.status(400).json({ error: 'Wrong code — try again' });
    }

    delete otpStore[email.toLowerCase()];
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
