/**
 * Arcloom AI Agent — Powered by Google Gemini (Free)
 * ====================================================
 * HOW TO INSTALL:
 * 1. Upload this file to your GitHub repo (same folder as index.html)
 * 2. Replace AIzaSyDImJBR0FK_tHBci4gk1tmyL4IpRoml8QM below with your real key
 * 3. Add this line before </body> in index.html and landing.html:
 *    <script src="agent.js"></script>
 */

(function () {
  "use strict";

  /* ─── PUT YOUR GEMINI API KEY HERE ───────────────────────────── */
  const API_KEY = "AIzaSyDImJBR0FK_tHBci4gk1tmyL4IpRoml8QM";
  /* ─────────────────────────────────────────────────────────────── */

  const API_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
    API_KEY;

  const css = `
    #arc-fab {
      position:fixed;bottom:28px;right:28px;width:58px;height:58px;border-radius:50%;
      background:linear-gradient(135deg,#6c63ff 0%,#3ecfcf 100%);
      border:none;cursor:pointer;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 24px rgba(108,99,255,0.5);
      transition:transform .2s ease,box-shadow .2s ease;
    }
    #arc-fab:hover{transform:scale(1.08);box-shadow:0 6px 32px rgba(108,99,255,0.7);}
    #arc-fab svg{width:28px;height:28px;}
    #arc-panel {
      position:fixed;bottom:100px;right:28px;width:370px;max-height:580px;
      background:#0f1117;border:1px solid #2a2d3a;border-radius:20px;
      display:flex;flex-direction:column;z-index:99998;overflow:hidden;
      box-shadow:0 8px 48px rgba(0,0,0,0.8);
      font-family:'Inter','Segoe UI',system-ui,sans-serif;
      transform:translateY(16px) scale(0.96);opacity:0;pointer-events:none;
      transition:transform .25s cubic-bezier(.4,0,.2,1),opacity .25s ease;
    }
    #arc-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:all;}
    #arc-header{
      background:#13161f;padding:14px 16px;display:flex;align-items:center;gap:10px;
      border-bottom:1px solid #1e2130;flex-shrink:0;
    }
    .arc-av{
      width:34px;height:34px;border-radius:50%;
      background:linear-gradient(135deg,#6c63ff,#3ecfcf);
      display:flex;align-items:center;justify-content:center;
      font-size:15px;font-weight:700;color:#fff;
    }
    #arc-header h3{margin:0;font-size:14px;font-weight:600;color:#e8eaf0;flex:1;}
    #arc-header small{font-size:11px;color:#3ecfcf;font-weight:500;}
    #arc-close{background:none;border:none;cursor:pointer;color:#555;font-size:20px;line-height:1;padding:0 2px;transition:color .15s;}
    #arc-close:hover{color:#aaa;}
    #arc-strip{
      background:#13161f;padding:10px 16px;border-bottom:1px solid #1e2130;
      display:none;gap:16px;flex-wrap:wrap;flex-shrink:0;
    }
    #arc-strip.show{display:flex;}
    .arc-s{display:flex;flex-direction:column;gap:2px;}
    .arc-sl{font-size:10px;color:#4a5270;text-transform:uppercase;letter-spacing:.05em;}
    .arc-sv{font-size:13px;font-weight:600;color:#c8cfe8;}
    .arc-sv.g{color:#3ecfcf;}
    #arc-msgs{
      flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;
      scrollbar-width:thin;scrollbar-color:#2a2d3a transparent;
    }
    .arc-m{max-width:88%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;}
    .arc-m.u{align-self:flex-end;background:#6c63ff;color:#fff;border-bottom-right-radius:4px;}
    .arc-m.a{align-self:flex-start;background:#1b1f2e;color:#d0d6f0;border:1px solid #252a3a;border-bottom-left-radius:4px;}
    .arc-typing{
      align-self:flex-start;background:#1b1f2e;border:1px solid #252a3a;
      border-radius:14px;border-bottom-left-radius:4px;
      padding:12px 16px;display:flex;gap:5px;align-items:center;
    }
    .arc-typing span{width:6px;height:6px;border-radius:50%;background:#6c63ff;display:inline-block;animation:ab .9s infinite;}
    .arc-typing span:nth-child(2){animation-delay:.15s}
    .arc-typing span:nth-child(3){animation-delay:.3s}
    @keyframes ab{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
    #arc-chips{padding:0 16px 10px;display:flex;gap:7px;flex-wrap:wrap;flex-shrink:0;}
    .arc-chip{
      background:#161a28;border:1px solid #2a2d3a;border-radius:20px;
      padding:5px 12px;font-size:12px;color:#8892b0;cursor:pointer;
      transition:background .15s,color .15s;white-space:nowrap;
    }
    .arc-chip:hover{background:#222744;color:#c8cfe8;}
    #arc-bar{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #1e2130;background:#0f1117;flex-shrink:0;}
    #arc-input{
      flex:1;background:#161a28;border:1px solid #2a2d3a;border-radius:10px;
      padding:9px 13px;font-size:13.5px;color:#d0d6f0;outline:none;resize:none;
      line-height:1.45;max-height:100px;overflow-y:auto;font-family:inherit;transition:border-color .15s;
    }
    #arc-input:focus{border-color:#6c63ff;}
    #arc-input::placeholder{color:#3a4060;}
    #arc-send{
      width:38px;height:38px;border-radius:10px;flex-shrink:0;
      background:linear-gradient(135deg,#6c63ff,#3ecfcf);
      border:none;cursor:pointer;align-self:flex-end;
      display:flex;align-items:center;justify-content:center;transition:opacity .15s;
    }
    #arc-send:disabled{opacity:.4;cursor:not-allowed;}
    #arc-send svg{width:18px;height:18px;}
    @media(max-width:440px){#arc-panel{width:calc(100vw - 24px);right:12px;bottom:82px;}}
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML("beforeend", `
    <button id="arc-fab" aria-label="Open AI Agent">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a9 9 0 0 1 9 9c0 3.6-2.1 6.7-5.2 8.2L12 22l-3.8-2.8A9 9 0 0 1 3 11 9 9 0 0 1 12 2z"/>
        <circle cx="9" cy="11" r="1.2" fill="#fff" stroke="none"/>
        <circle cx="12" cy="11" r="1.2" fill="#fff" stroke="none"/>
        <circle cx="15" cy="11" r="1.2" fill="#fff" stroke="none"/>
      </svg>
    </button>
    <div id="arc-panel" role="dialog" aria-label="Arcloom AI Agent">
      <div id="arc-header">
        <div class="arc-av">A</div>
        <h3>Arcloom Agent</h3>
        <small>● Online</small>
        <button id="arc-close" aria-label="Close">✕</button>
      </div>
      <div id="arc-strip">
        <div class="arc-s"><span class="arc-sl">USDC</span><span class="arc-sv" id="s-usdc">—</span></div>
        <div class="arc-s"><span class="arc-sl">EURC</span><span class="arc-sv" id="s-eurc">—</span></div>
        <div class="arc-s"><span class="arc-sl">Staked</span><span class="arc-sv g" id="s-staked">—</span></div>
        <div class="arc-s"><span class="arc-sl">Rewards</span><span class="arc-sv g" id="s-rewards">—</span></div>
      </div>
      <div id="arc-msgs"></div>
      <div id="arc-chips">
        <button class="arc-chip" data-msg="What is my current balance?">My balance</button>
        <button class="arc-chip" data-msg="How much am I staking?">My stake</button>
        <button class="arc-chip" data-msg="What is the staking APY?">Staking APY</button>
        <button class="arc-chip" data-msg="How do I send USDC?">Send USDC</button>
        <button class="arc-chip" data-msg="Explain USDC vs EURC">USDC vs EURC</button>
      </div>
      <div id="arc-bar">
        <textarea id="arc-input" rows="1" placeholder="Ask anything crypto…" aria-label="Message"></textarea>
        <button id="arc-send" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  `);

  const fab     = document.getElementById("arc-fab");
  const panel   = document.getElementById("arc-panel");
  const closeBtn= document.getElementById("arc-close");
  const msgs    = document.getElementById("arc-msgs");
  const input   = document.getElementById("arc-input");
  const sendBtn = document.getElementById("arc-send");
  const strip   = document.getElementById("arc-strip");

  let open = false, busy = false;
  const history = [];

  function openPanel() {
    open = true; panel.classList.add("open");
    refreshStrip();
    if (history.length === 0) greet();
    input.focus();
  }
  function closePanel() { open = false; panel.classList.remove("open"); }

  fab.addEventListener("click", () => open ? closePanel() : openPanel());
  closeBtn.addEventListener("click", closePanel);

  function getWallet() {
    const q = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
    return {
      usdc:    q("#usdcBalance")   || q(".usdc-balance")   || scan("USDC"),
      eurc:    q("#eurcBalance")   || q(".eurc-balance")   || scan("EURC"),
      staked:  q("#stakedAmount")  || q(".staked-amount")  || scan("staked"),
      rewards: q("#rewardsAmount") || q(".rewards-amount") || scan("reward"),
    };
  }

  function scan(kw) {
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length > 0) continue;
      const t = el.textContent.trim();
      if (new RegExp(kw,"i").test(t) && /\d/.test(t)) {
        const m = t.match(/[\d,.]+/);
        if (m) return m[0];
      }
    }
    return "0.00";
  }

  function refreshStrip() {
    const w = getWallet();
    strip.classList.add("show");
    document.getElementById("s-usdc").textContent    = w.usdc    + " USDC";
    document.getElementById("s-eurc").textContent    = w.eurc    + " EURC";
    document.getElementById("s-staked").textContent  = w.staked  + " USDC";
    document.getElementById("s-rewards").textContent = w.rewards + " USDC";
  }

  function systemPrompt() {
    const w = getWallet();
    return `You are the Arcloom AI Agent — a friendly assistant inside Arcloom, a stablecoin dApp on Arc Testnet by Circle.

LIVE WALLET DATA:
- USDC Balance: ${w.usdc}
- EURC Balance: ${w.eurc}
- Staked USDC: ${w.staked}
- Unclaimed Rewards: ${w.rewards}

ABOUT ARCLOOM:
- Features: Send/Receive USDC, Swap USDC/EURC, Stake USDC for 5.2% APY (no lockup), link Twitter/Discord handle
- Gas: ~0.009 USDC per tx. Zero platform fees. Network: Arc Testnet (Circle)

YOUR JOB: Answer any crypto/DeFi/Web3 question. Report wallet data. Guide users on Arcloom features. Be concise, friendly, and accurate. Never invent numbers — only use live data above.`;
  }

  async function askGemini(userMsg) {
    history.push({ role: "user", parts: [{ text: userMsg }] });
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt() }] },
        contents: history.slice(-12),
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
      })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e?.error?.message || "API error " + res.status);
    }
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, no response.";
    history.push({ role: "model", parts: [{ text: reply }] });
    return reply;
  }

  function addMsg(role, text) {
    const d = document.createElement("div");
    d.className = "arc-m " + (role === "user" ? "u" : "a");
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping() {
    const d = document.createElement("div");
    d.className = "arc-typing"; d.id = "arc-typing";
    d.innerHTML = "<span></span><span></span><span></span>";
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() { const t = document.getElementById("arc-typing"); if (t) t.remove(); }

  function greet() {
    const w = getWallet();
    addMsg("agent",
      `Hey! 👋 I'm your Arcloom AI Agent.\n\n` +
      `Your wallet:\n• USDC: ${w.usdc}\n• EURC: ${w.eurc}\n• Staked: ${w.staked} USDC\n• Rewards: ${w.rewards} USDC\n\n` +
      `Ask me anything — balances, sending, staking, or any crypto question!`
    );
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = ""; input.style.height = "auto";
    sendBtn.disabled = true; busy = true;
    addMsg("user", text); showTyping();
    try {
      const reply = await askGemini(text);
      hideTyping(); addMsg("agent", reply); refreshStrip();
    } catch (err) {
      hideTyping();
      addMsg("agent", "Oops! " + err.message + "\n\nMake sure your API key is correct in agent.js.");
    } finally {
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 100) + "px"; });
  document.querySelectorAll(".arc-chip").forEach(c => { c.addEventListener("click", () => { input.value = c.dataset.msg; send(); }); });
  setInterval(() => { if (open) refreshStrip(); }, 3000);

})();
