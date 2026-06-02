// ── ui.js — NAN Premium UI layer ──
// Handles: home screen, 4-tab nav, goPage routing, greeting
// All original JS in app.js is untouched

// ── Page routing — maps new tab names to existing page IDs ──
function goBack(){
  if(window._prevPage) goPage(window._prevPage);
  else goPage('home');
}
function goPage(name) {
  window._prevPage = window._currentPage || 'home';
  window._currentPage = name;
  // Check userAddr OR Dynamic localStorage fallback
  const _userAddr = (typeof userAddr !== 'undefined' && userAddr) 
    ? userAddr 
    : localStorage.getItem('nan_dynamic_address');
  if (_userAddr && !userAddr) { userAddr = _userAddr; window.userAddr = _userAddr; }
  if (!_userAddr) { if(typeof toast==='function') toast('Connect wallet first', 'error'); return; }

  // Hide all pages
  document.querySelectorAll('.page:not(.page-land)').forEach(p => p.classList.remove('active'));

  // Update nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // Map tab → page
  const pageMap = {
    home:       'page-home',
    send:       'page-send',
    earn:       'page-lend',
    more:       'page-more',
    swap:       'page-swap',
    bridge:     'page-bridge',
    arcname:    'page-arcname',
    bulk:       'page-bulk',
    naira:      'page-naira',
    history:    'page-history',
    lend:       'page-lend',
    payreq:     'page-payreq',
    'payreq-new': 'page-payreq-new',
  };

  const navMap = {
    home: 'nav-home',
    send: 'nav-send',
    earn: 'nav-earn',
    more: 'nav-more',
    // legacy pages go under "more" nav
    swap:    'nav-more',
    bridge:  'nav-more',
    arcname: 'nav-more',
    bulk:    'nav-more',
    naira:      'nav-more',
    history:    'nav-history',
    lend:       'nav-earn',
    payreq:     'nav-more',
    'payreq-new': 'nav-more',
  };

  const pageId = pageMap[name] || ('page-' + name);
  const navId  = navMap[name]  || 'nav-more';

  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');

  const navBtn = document.getElementById(navId);
  if (navBtn) navBtn.classList.add('active');

  // Sync desktop sidebar
  const desktopNavMap = {
    home: 'dnav-home', send: 'dnav-send', earn: 'dnav-earn',
    lend: 'dnav-earn', swap: 'dnav-swap', bridge: 'dnav-bridge',
    history: 'dnav-history',
    more: 'dnav-more', arcname: 'dnav-more', bulk: 'dnav-more',
    naira: 'dnav-more', payreq: 'dnav-more', 'payreq-new': 'dnav-more',
  };
  document.querySelectorAll('#desktopNav .dnav-btn').forEach(b => b.classList.remove('active'));
  const dnavId = desktopNavMap[name] || 'dnav-more';
  const dnavBtn = document.getElementById(dnavId);
  if (dnavBtn) dnavBtn.classList.add('active');

  // Update desktop topbar page name + context pill
  updateTopbarPageInfo(name);

  // Trigger page-specific init
  if (name === 'earn' || name === 'lend') initLendUI();
  if (name === 'history') renderHistory();
  if (name === 'arcname') renderArcDirectory();
  if (name === 'swap') refreshBalances();
  if (name === 'bulk') { renderBulkRecipients(); updateBulkSummary(); }
  if (name === 'home') updateHomeScreen();
  if (name === 'payreq') renderPaymentRequests();
  if (name === 'payreq-new') initNewPRForm();
}

// ── Show page (called internally by app.js) ──
function showPage(name) {
  // If app.js calls showPage('send') after connect, redirect to home
  if (name === 'send') {
    goPage('home');
    return;
  }
  goPage(name);
}

// ── Update home screen balances + greeting ──
function updateHomeScreen() {
  const usdc = parseFloat(usdcBal) || 0;
  const eurc = parseFloat(eurcBal) || 0;
  const total = usdc + (eurc * (1 / (FX || 0.9258)));

  const balEl = document.getElementById('homeBalAmt');
  const ngnEl = document.getElementById('homeBalNgn');
  const usdcEl = document.getElementById('homeUsdcBal');
  const eurcEl = document.getElementById('homeEurcBal');

  if (balEl) balEl.textContent = total.toFixed(2);
  if (ngnEl) ngnEl.textContent = '≈ ₦' + (total * 1620).toLocaleString('en-NG', {maximumFractionDigits: 0}) + ' NGN';
  if (usdcEl) usdcEl.textContent = usdc.toFixed(2) + ' USDC';
  if (eurcEl) eurcEl.textContent = eurc.toFixed(2) + ' EURC';

  // Greeting
  const greetEl = document.getElementById('homeGreetName');
  if (greetEl) {
    const name = otpEmail ? otpEmail.split('@')[0] : 'there';
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    document.getElementById('homeGreet').textContent = greet + ',';
    greetEl.textContent = name.charAt(0).toUpperCase() + name.slice(1) + ' ✦';
  }
}

// ── Hook into updateBalDisplay after app.js loads ──
window.addEventListener('load', function() {
  const _origUpdateBalDisplay = window.updateBalDisplay;
  window.updateBalDisplay = function () {
    if (_origUpdateBalDisplay) _origUpdateBalDisplay();
    updateHomeScreen();
  };
});

// ── On connected — wrap after app.js loads ──
window.addEventListener('load', function() {
  const _origOnConnected = window.onConnected;
  if (typeof _origOnConnected === 'function') {
    window.onConnected = async function (isEmail, isDev) {
      await _origOnConnected(isEmail, isDev);
      document.querySelectorAll('.page:not(.page-land)').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      const homePage = document.getElementById('page-home');
      if (homePage) homePage.classList.add('active');
      const homeNav = document.getElementById('nav-home');
      if (homeNav) homeNav.classList.add('active');
      updateHomeScreen();
      updateDesktopNav();
    };
  }
});

// ── Desktop nav visibility ──
function updateDesktopNav() {
  const isDesktop = window.innerWidth >= 769;
  const dNav = document.getElementById('desktopNav');
  const isLanding = document.getElementById('page-land')?.classList.contains('active');
  if (!dNav) return;
  if (isDesktop && !isLanding) {
    dNav.style.display = 'flex';
  } else {
    dNav.style.display = 'none';
  }
}

window.addEventListener('resize', updateDesktopNav);
document.addEventListener('DOMContentLoaded', updateDesktopNav);
// Also run immediately in case DOM is already loaded
updateDesktopNav();

// ── Desktop topbar: page name + context pill ──
function updateTopbarPageInfo(page) {
  if (window.innerWidth < 769) return;
  const nameEl  = document.getElementById('topbarPageName');
  const pillEl  = document.getElementById('topbarContextPill');
  const wrapEl  = document.getElementById('topbarPageInfo');
  if (!nameEl || !pillEl || !wrapEl) return;

  const labels = {
    home:'Home', send:'Send', earn:'Earn', lend:'Earn',
    history:'History', swap:'Swap', bridge:'Bridge',
    arcname:'.arc Name', more:'More', naira:'Naira',
    bulk:'Payroll', payreq:'Pay Requests',
  };

  nameEl.textContent = labels[page] || page.charAt(0).toUpperCase()+page.slice(1);
  wrapEl.style.display = 'flex';

  // Show nav links
  const navEl = document.getElementById('topbarNav');
  if (navEl) navEl.style.display = 'flex';

  // Context pill per page
  pillEl.style.display = 'none';
  if (page === 'home') {
    const bal = document.getElementById('homeBalAmt');
    if (bal && bal.textContent !== '—') {
      pillEl.textContent = '$' + bal.textContent;
      pillEl.style.cssText = 'display:inline-block;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);color:var(--accent3);font-family:"JetBrains Mono",monospace;font-size:.58rem;padding:3px 9px;border-radius:100px;';
    }
  } else if (page === 'send') {
    const usdc = parseFloat(usdcBal)||0;
    const eurc = parseFloat(eurcBal)||0;
    const total = (usdc + eurc).toFixed(2);
    pillEl.textContent = 'Balance: ' + total + ' USDC';
    pillEl.style.cssText = 'display:inline-block;background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.15);color:var(--accent3);font-family:"JetBrains Mono",monospace;font-size:.58rem;padding:3px 9px;border-radius:100px;';
  } else if (page === 'earn' || page === 'lend') {
    pillEl.textContent = 'APY 4.80%';
    pillEl.style.cssText = 'display:inline-block;background:rgba(112,0,255,.06);border:1px solid rgba(112,0,255,.15);color:#7000ff;font-family:"JetBrains Mono",monospace;font-size:.58rem;padding:3px 9px;border-radius:100px;';
  } else if (page === 'swap') {
    pillEl.textContent = 'USDC ↔ EURC';
    pillEl.style.cssText = 'display:inline-block;background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.15);color:var(--accent3);font-family:"JetBrains Mono",monospace;font-size:.58rem;padding:3px 9px;border-radius:100px;';
  } else if (page === 'bridge') {
    pillEl.textContent = 'CCTP V2';
    pillEl.style.cssText = 'display:inline-block;background:rgba(112,0,255,.06);border:1px solid rgba(112,0,255,.15);color:#c084fc;font-family:"JetBrains Mono",monospace;font-size:.58rem;padding:3px 9px;border-radius:100px;';
  } else if (page === 'history') {
    pillEl.textContent = 'On-chain';
    pillEl.style.cssText = 'display:inline-block;background:rgba(112,0,255,.06);border:1px solid rgba(112,0,255,.15);color:#7000ff;font-family:"JetBrains Mono",monospace;font-size:.58rem;padding:3px 9px;border-radius:100px;';
  }
}
