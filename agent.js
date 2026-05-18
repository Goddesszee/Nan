(function () {
  "use strict";

  const css = `
    #arc-fab {
      position:fixed;bottom:72px;right:16px;width:52px;height:52px;border-radius:16px;
      background:linear-gradient(135deg,#7b5cf0,#4f8eff);
      border:2px solid rgba(123,92,240,.5);cursor:pointer;z-index:99999;
      display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;
      box-shadow:0 4px 20px rgba(123,92,240,0.55);color:#fff;font-size:.9rem;
    }
    #arc-fab-label{font-size:.42rem;font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:.06em;}
    #arc-panel {
      position:fixed;bottom:136px;right:10px;width:320px;max-height:500px;
      background:#0a0a12;border:1px solid rgba(123,92,240,.3);border-radius:18px;
      display:flex;flex-direction:column;z-index:99998;overflow:hidden;
      box-shadow:0 8px 40px rgba(0,0,0,.7);font-family:'Space Grotesk',sans-serif;
      transform:translateY(12px) scale(0.97);opacity:0;pointer-events:none;
      transition:transform .22s cubic-bezier(.4,0,.2,1),opacity .22s ease;
    }
    #arc-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:all;}
    #arc-header{
      background:#0f0f1a;padding:12px 14px;display:flex;align-items:center;gap:9px;
      border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;
    }
    .arc-av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#7b5cf0,#4f8eff);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;}
    #arc-header h3{margin:0;font-size:13px;font-weight:600;color:#f0f0f8;flex:1;}
    #arc-header small{font-size:10px;color:#00e5c3;}
    #arc-close{background:none;border:none;cursor:pointer;color:#555570;font-size:18px;line-height:1;padding:0;}
    #arc-strip{background:#0f0f1a;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);display:none;gap:14px;flex-wrap:wrap;flex-shrink:0;}
    #arc-strip.show{display:flex;}
    .arc-s{display:flex;flex-direction:column;gap:1px;}
    .arc-sl{font-size:9px;color:#555570;text-transform:uppercase;letter-spacing:.06em;font-family:'JetBrains Mono',monospace;}
    .arc-sv{font-size:12px;font-weight:600;color:#c8cfe8;font-family:'JetBrains Mono',monospace;}
    .arc-sv.g{color:#00e5c3;}
    #arc-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:rgba(123,92,240,.3) transparent;min-height:0;}
    .arc-m{max-width:90%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.5;word-break:break-word;}
    .arc-m.u{align-self:flex-end;background:linear-gradient(135deg,#7b5cf0,#4f8eff);color:#fff;border-bottom-right-radius:3px;}
    .arc-m.a{align-self:flex-start;background:rgba(255,255,255,.04);color:#d0d6f0;border:1px solid rgba(255,255,255,.07);border-bottom-left-radius:3px;}
    .arc-typing{align-self:flex-start;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px 14px;display:flex;gap:4px;align-items:center;}
    .arc-typing span{width:5px;height:5px;border-radius:50%;background:#7b5cf0;display:inline-block;animation:ab .9s infinite;}
    .arc-typing span:nth-child(2){animation-delay:.15s}
    .arc-typing span:nth-child(3){animation-delay:.3s}
    @keyframes ab{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}
    #arc-chips{padding:0 10px 8px;display:flex;gap:5px;flex-wrap:wrap;flex-shrink:0;}
    .arc-chip{background:rgba(123,92,240,.08);border:1px solid rgba(123,92,240,.2);border-radius:20px;padding:4px 10px;font-size:11px;color:#7b5cf0;cursor:pointer;white-space:nowrap;font-family:'Space Grotesk',sans-serif;}
    .arc-chip:hover{background:rgba(123,92,240,.18);color:#a78bfa;}
    #arc-bar{display:flex;gap:7px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.06);background:#0a0a12;flex-shrink:0;}
    #arc-input{flex:1;background:#13131f;border:1px solid rgba(123,92,240,.2);border-radius:10px;padding:8px 12px;font-size:13px;color:#f0f0f8;outline:none;resize:none;line-height:1.4;max-height:80px;overflow-y:auto;font-family:'Space Grotesk',sans-serif;transition:border-color .15s;}
    #arc-input:focus{border-color:#7b5cf0;}
    #arc-input::placeholder{color:#555570;}
    #arc-send{width:36px;height:36px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,#7b5cf0,#4f8eff);border:none;cursor:pointer;align-self:flex-end;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1rem;}
    #arc-send:disabled{opacity:.4;cursor:not-allowed;}
    @media(max-width:440px){#arc-panel{width:calc(100vw - 20px);right:10px;bottom:130px;}#arc-fab{bottom:72px;right:14px;}}
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML("beforeend", `
    <button id="arc-fab" aria-label="Open AI Agent">
      ✦<span id="arc-fab-label">AI</span>
    </button>
    <div id="arc-panel" role="dialog">
      <div id="arc-header">
        <div class="arc-av">A</div>
        <h3>Arcloom AI</h3>
        <small>● Circle Powered</small>
        <button id="arc-close">✕</button>
      </div>
      <div id="arc-strip">
        <div class="arc-s"><span class="arc-sl">USDC</span><span class="arc-sv" id="s-usdc">—</span></div>
        <div class="arc-s"><span class="arc-sl">EURC</span><span class="arc-sv" id="s-eurc">—</span></div>
        <div class="arc-s"><span class="arc-sl">Staked</span><span class="arc-sv g" id="s-staked">—</span></div>
        <div class="arc-s"><span class="arc-sl">Rewards</span><span class="arc-sv g" id="s-rewards">—</span></div>
      </div>
      <div id="arc-msgs"></div>
      <div id="arc-chips"></div>
      <div id="arc-bar">
        <textarea id="arc-input" rows="1" placeholder="Ask anything…"></textarea>
        <button id="arc-send">↑</button>
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
  const chipsEl = document.getElementById("arc-chips");

  let open = false, busy = false;
  const history = [];

  // Read live wallet data directly from the page DOM
  function getWallet() {
    const g = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
    return {
      usdc:    g("usdcBal2")  || g("balAmt") || "0.00",
      eurc:    g("eurcBal2")  || "0.00",
      staked:  g("myStake")   || "0.00 USDC",
      rewards: g("myRewards") || "0.000000",
      address: g("walAddr")   || null,
    };
  }

  function refreshStrip() {
    const w = getWallet();
    strip.classList.add("show");
    document.getElementById("s-usdc").textContent    = w.usdc + " USDC";
    document.getElementById("s-eurc").textContent    = w.eurc + " EURC";
    document.getElementById("s-staked").textContent  = w.staked;
    document.getElementById("s-rewards").textContent = w.rewards + " USDC";
  }

  function openPanel() {
    open = true;
    panel.classList.add("open");
    refreshStrip();
    if (history.length === 0) greet();
    setTimeout(() => input.focus(), 200);
  }

  function closePanel() {
    open = false;
    panel.classList.remove("open");
  }

  fab.addEventListener("click", () => open ? closePanel() : openPanel());
  closeBtn.addEventListener("click", closePanel);

  function greet() {
    const w = getWallet();
    const connected = w.address && w.address !== "Connect wallet" && w.address.startsWith("0x");
    addMsg("a",
      connected
        ? `Hey! 👋 I'm Arcloom AI, powered by Circle.\n\nYour wallet:\n• USDC: ${w.usdc}\n• EURC: ${w.eurc}\n• Staked: ${w.staked}\n• Rewards: ${w.rewards} USDC\n\nAsk me anything!`
        : `Hey! 👋 I'm Arcloom AI, powered by Circle.\n\nConnect your wallet to see your live balance. Then ask me anything about sending, swapping, or staking USDC!`
    );
    showChips();
  }

  function showChips() {
    const list = ["What's my balance?", "How do I stake?", "Take me to swap", "What is Arc Network?", "How do I get USDC?"];
    chipsEl.innerHTML = list.map(c => `<button class="arc-chip">${c}</button>`).join('');
    chipsEl.querySelectorAll('.arc-chip').forEach(c => {
      c.addEventListener('click', () => { input.value = c.textContent; send(); });
    });
  }

  function addMsg(role, text) {
    chipsEl.innerHTML = '';
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

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = ""; input.style.height = "auto";
    sendBtn.disabled = true; busy = true;

    addMsg("user", text);
    history.push({ role: "user", content: text });
    showTyping();

    const w = getWallet();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-10),
          usdcBal: w.usdc,
          eurcBal: w.eurc,
          userAddress: w.address,
        }),
      });

      const data = await res.json();
      hideTyping();

      const reply = data.reply || "Sorry, no response.";
      addMsg("a", reply);
      history.push({ role: "assistant", content: reply });

      // Navigate if AI says to
      if (data.navigatePage && typeof goPage === "function") {
        setTimeout(() => { goPage(data.navigatePage); closePanel(); }, 600);
      }

      // Refresh balances if transaction happened
      if (reply.includes("Sent") || reply.includes("staked") || reply.includes("✓")) {
        if (typeof refreshBalances === "function") setTimeout(() => refreshBalances(), 3000);
      }

      refreshStrip();

    } catch (err) {
      hideTyping();
      addMsg("a", "Connection error — try again.\n" + err.message);
    } finally {
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 80) + "px"; });

  setInterval(() => { if (open) refreshStrip(); }, 5000);

})();
