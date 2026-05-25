// ── ui.js — NAN Premium UI layer ──
// Handles: home screen, 4-tab nav, goPage routing, greeting
// All original JS in app.js is untouched

// ── Page routing — maps new tab names to existing page IDs ──
function goPage(name) {
  if (!userAddr) { toast('Connect wallet first', 'error'); return; }

  // Hide all pages
  document.querySelectorAll('.page:not(.page-land)').forEach(p => p.classList.remove('active'));

  // Update nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // Map tab → page
  const pageMap = {
    home:    'page-home',
    send:    'page-send',
    earn:    'page-lend',
    more:    'page-more',
    swap:    'page-swap',
    bridge:  'page-bridge',
    arcname: 'page-arcname',
    bulk:    'page-bulk',
    naira:   'page-naira',
    history: 'page-history',
    lend:    'page-lend',
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
    naira:   'nav-more',
    history: 'nav-more',
    lend:    'nav-earn',
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
    more: 'dnav-more', arcname: 'dnav-more', bulk: 'dnav-more',
    naira: 'dnav-more', history: 'dnav-more',
  };
  document.querySelectorAll('#desktopNav .dnav-btn').forEach(b => b.classList.remove('active'));
  const dnavId = desktopNavMap[name] || 'dnav-more';
  const dnavBtn = document.getElementById(dnavId);
  if (dnavBtn) dnavBtn.classList.add('active');

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

// ── Hook into existing updateBalDisplay so home also updates ──
const _origUpdateBalDisplay = window.updateBalDisplay;
window.updateBalDisplay = function () {
  if (_origUpdateBalDisplay) _origUpdateBalDisplay();
  updateHomeScreen();
};

// ── On connected — show home instead of send ──
const _origOnConnected = window.onConnected;
window.onConnected = async function (isEmail, isDev) {
  await _origOnConnected(isEmail, isDev);
  // Override: go home after connect
  document.querySelectorAll('.page:not(.page-land)').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const homePage = document.getElementById('page-home');
  if (homePage) homePage.classList.add('active');
  const homeNav = document.getElementById('nav-home');
  if (homeNav) homeNav.classList.add('active');
  updateHomeScreen();
};

// ── Desktop nav visibility ──
function updateDesktopNav() {
  const isDesktop = window.innerWidth >= 769;
  const dNav = document.getElementById('desktopNav');
  if (dNav) dNav.style.display = isDesktop ? 'flex' : 'none';
}

window.addEventListener('resize', updateDesktopNav);
document.addEventListener('DOMContentLoaded', updateDesktopNav);
// Also run immediately in case DOM is already loaded
updateDesktopNav();
