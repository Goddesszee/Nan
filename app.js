// ═══════════════════════════════════════════
// CONFIG — Arc Testnet
// ═══════════════════════════════════════════
// ── API Base — points to Railway when served from Vercel domain ──────────────
const API_BASE = (()=>{
  const host = window.location.hostname;
  if(host.includes('vercel.app') || host === 'nanarc.xyz' || host === 'www.nanarc.xyz'){
    return 'https://nan-production.up.railway.app';
  }
  return '';
})();

// Helper: all API calls go through Railway when on Vercel/nanarc.xyz
function apiFetch(path, opts){
  return fetch(API_BASE + path, opts);
}

const ARC_CHAIN_ID  = 5042002;
const ARC_HEX       = '0x4CEF52';
const ARC_RPC       = 'https://rpc.testnet.arc.network';
const ARC_EXP       = 'https://testnet.arcscan.app';
const ARC_PARAMS    = {chainId:ARC_HEX,chainName:'Arc Testnet',nativeCurrency:{name:'USD Coin',symbol:'USDC',decimals:18},rpcUrls:[ARC_RPC],blockExplorerUrls:[ARC_EXP]};
const USDC_ADDR     = '0x3600000000000000000000000000000000000000';
const EURC_ADDR     = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const USDC_DECIMALS = 6; // ERC-20 only — native gas token uses 18, never mix!
const EURC_DECIMALS = 6;
const GAS_USDC      = 0.009;

const SWAP_CONTRACT = '0x5cE359b74BE53b1B370641571cBef157dD575c79';

const PERMIT2_ADDR  = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const FXESCROW_ADDR = '0x867650F5eAe8df91445971f14d89fd84F0C9a9f8';
const LENDING_CONTRACT  = '0x4CC84BbEf992439Cb01FeF2E1150B37916d1f2ce'; // NANLendingPool deployed
const NAME_REGISTRY     = '0x043D072B12CBe488DBA3d2975c42Db3055F2836f'; // NANNameRegistry deployed
const PAYREQ_CONTRACT   = '0x1940232f42D4e2083785bC869FbAD8dd43133817';
const HISTORY_CONTRACT  = '0xC64Fad1CFFDE16167d5887211066b47E1df48B4d';
const HISTORY_ABI = [
  'function record(string txType, string token, string amount, string toAddr, string label, bytes32 txHash) external',
  'function getHistory(address wallet) view returns (tuple(uint256 ts, string txType, string token, string amount, string toAddr, string label, bytes32 txHash)[])',
  'function getCount(address wallet) view returns (uint256)',
];

// CCTP — Circle Cross-Chain Transfer Protocol
const ARC_CCTP_DOMAIN = 26; const CCTP_TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'; // Arc Testnet TokenMessengerV2 (official)
const CCTP_MESSAGE_TRANSMITTER = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'; // Arc Testnet MessageTransmitterV2
// Arc Testnet CCTP Domain = 26 (official from docs.arc.io)
const CCTP_DEST_DOMAIN = {
  'ETH-SEPOLIA':   0,
  'AVAX-FUJI':     1,
  'OP-SEPOLIA':    2,
  'ARB-SEPOLIA':   3,
  'BASE-SEPOLIA':  6,
  'POLYGON-AMOY':  7,
};
// Destination chain config for auto-mint after CCTP burn
// MessageTransmitterV2 address is the same on all EVM testnets (Circle CREATE2)
// Source: developers.circle.com/cctp/references/contract-addresses
const CCTP_DEST_CONFIG = {
  'ETH-SEPOLIA': {
    chainId:'0xaa36a7', chainName:'Ethereum Sepolia',
    rpc:'https://rpc.sepolia.org',
    explorer:'https://sepolia.etherscan.io', currency:'ETH',
    transmitter:'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  'AVAX-FUJI': {
    chainId:'0xa869', chainName:'Avalanche Fuji',
    rpc:'https://api.avax-test.network/ext/bc/C/rpc',
    explorer:'https://testnet.snowtrace.io', currency:'AVAX',
    transmitter:'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  'BASE-SEPOLIA': {
    chainId:'0x14a34', chainName:'Base Sepolia',
    rpc:'https://sepolia.base.org',
    explorer:'https://sepolia.basescan.org', currency:'ETH',
    transmitter:'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  'ARB-SEPOLIA': {
    chainId:'0x66eee', chainName:'Arbitrum Sepolia',
    rpc:'https://sepolia-rollup.arbitrum.io/rpc',
    explorer:'https://sepolia.arbiscan.io', currency:'ETH',
    transmitter:'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  'OP-SEPOLIA': {
    chainId:'0xaa37dc', chainName:'OP Sepolia',
    rpc:'https://sepolia.optimism.io',
    explorer:'https://sepolia-optimistic.etherscan.io', currency:'ETH',
    transmitter:'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  'POLYGON-AMOY': {
    chainId:'0x13882', chainName:'Polygon Amoy',
    rpc:'https://rpc-amoy.polygon.technology',
    explorer:'https://amoy.polygonscan.com', currency:'MATIC',
    transmitter:'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
};

// Arc Testnet provider — ENS disabled since Arc doesn't support it
function getArcProvider(){
  return new ethers.JsonRpcProvider(ARC_RPC, {
    chainId: ARC_CHAIN_ID,
    name: 'arc-testnet',
    ensAddress: null,
  });
}
// Arc gas helper — EVM gwei units, settled in USDC not ETH
function arcGasOpts(){
  return {
    maxFeePerGas: ethers.parseUnits('20','gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('1','gwei'),
  };
}
const SWAP_ABI = [
  'function swapUSDCtoEURC(uint256) external returns (uint256)',
  'function swapEURCtoUSDC(uint256) external returns (uint256)',
  'function addLiquidity(uint256,uint256) external',
  'function quoteUSDCtoEURC(uint256) view returns (uint256,uint256)',
  'function quoteEURCtoUSDC(uint256) view returns (uint256,uint256)',
  'function getRate() view returns (uint256,uint256)',
  'function getLiquidity() view returns (uint256,uint256)',
];
const LENDING_ABI = [
  'function supply(uint256) external',
  'function withdraw(uint256) external',
  'function addCollateral(uint256) external',
  'function borrow(uint256) external',
  'function repay(uint256) external',
  'function getPosition(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)',
  'function totalSupplied() view returns (uint256)',
  'function totalBorrowed() view returns (uint256)',
  'function utilizationRate() view returns (uint256)',
];
const NAME_ABI = [
  'function register(string,uint8) external',
  'function renew(string,uint8) external',
  'function resolve(string) view returns (address)',
  'function primaryName(address) view returns (string)',
  'function getNamesForAddress(address) view returns (string[])',
  'function getAllNames() view returns (string[])',
  'function isAvailable(string) view returns (bool)',
  'function totalNames() view returns (uint256)',
];
const PAYREQ_ABI = [
  'function createRequest(address token, uint256 amount, string label, string note, uint256 expiresAt) external returns (uint256 id)',
  'function pay(uint256 id, uint256 amount) external',
  'function cancelRequest(uint256 id) external',
  'function getRequest(uint256 id) view returns (uint256,address,address,uint256,string,string,uint256,uint8,address,uint256,uint256)',
  'function getCreatorRequests(address creator) view returns (uint256[])',
  'event RequestCreated(uint256 indexed id, address indexed creator, address token, uint256 amount, string label, uint256 expiresAt)',
  'event RequestPaid(uint256 indexed id, address indexed payer, uint256 amount, uint256 timestamp)',
];
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];
const CCTP_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64 nonce)',
];
const CCTP_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) external returns (bool success)',
];
// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let provider=null, signer=null, userAddr=null, wp=null;
let usdcBal='0', eurcBal='0';
let onArcNetwork=false, balancesLoading=false;
let lastTxHash=null, lastTxId=null;
let recipType='address', resolvedTo=null, lastResolvedInput='';
let regType='x', swapFlipped=false, sendToken='USDC';
let onChainStaked=0;
let txPollTimer=null;
let FX=0.9258, fxLastUpdated=null;

// Circle wallet info (from email login)
let circleWalletId=null, circleWalletAddress=null, circleWalletBlockchain=null; let circleUserToken=null, circleUserId=null, otpEmail=null;
let isCircleWallet=false; // true = email login, false = MetaMask
// Restore session on page load
if(localStorage.getItem('circleWalletId')){
  circleWalletId=localStorage.getItem('circleWalletId');
  circleWalletAddress=localStorage.getItem('circleWalletAddr');
  userAddr=circleWalletAddress;
  isCircleWallet=true;
  // Auto-restore UI after DOM is ready
  window.addEventListener('load', async ()=>{
    if(userAddr&&isCircleWallet){
      provider=getArcProvider();
      onArcNetwork=true;
      await onConnected(true, false);
    }
  });
}

let arcNames=[];
let txHistory=[];
function loadTxHistory(){txHistory=JSON.parse(localStorage.getItem('arcTx_'+(userAddr||''))||'[]');}
function saveTxHistory(){localStorage.setItem('arcTx_'+userAddr,JSON.stringify(txHistory.slice(0,100)));}

// ═══════════════════════════════════════════
// UI UTILITIES
// ═══════════════════════════════════════════
let _tt;
/*
function toast(msg, type='info', ms=4500, opts={}){
  const validtypes = ['success','error','info','warning'];

  if(!validtypes.includes(type)){
    opts = arguments[4] || {};
    ms = arguments[3] || 4500;
    type = validtypes.includes(arguments[2]) ? arguments[2] : 'info';
    msg = [msg, arguments[1]].filter(boolean).join(' — ');
  }

  const el = document.getelementbyid('toast');
  if(!el) return;

  const icons = {
    success: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m5 13l4 4l19 7" stroke="currentcolor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error:   '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m18 6l6 18m6 6l12 12" stroke="currentcolor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    info:    '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentcolor" stroke-width="2"/><path d="m12 8v4m0 4h.01" stroke="currentcolor" stroke-width="2" stroke-linecap="round"/></svg>',
    warning: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m12 9v4m0 4h.01m10.29 3.86l1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3l13.71 3.86a2 2 0 00-3.42 0z" stroke="currentcolor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  const titles = { success:'successful!', error:'failed', info:'info', warning:'warning' };
  let title = opts.title || titles[type] || 'info';
  let body = string(msg || '');

  if(body.includes(' — ')){
    const parts = body.split(' — ');
    title = parts[0].replace(/^[^a-za-z0-9]+/, '');
    body = parts.slice(1).join(' — ');
  } else if(body.startswith('✓ ') || body.startswith('✅ ')){
    body = body.replace(/^[^a-za-z0-9]+/, '');
  } else if(body.startswith('❌ ')){
    title = 'error';
    body = body.replace(/^[^a-za-z0-9]+/, '');
  }

  const iconel = document.getelementbyid('toasticonbadge');
  const titleel = document.getelementbyid('toasttitle');
  const msgel = document.getelementbyid('toastmsg');
  const actionel = document.getelementbyid('toastaction');
  const btnel = document.getelementbyid('toastactionbtn');

  if(iconel) iconel.innerhtml = icons[type] || icons.info;
  if(titleel) titleel.textcontent = title;
  if(msgel) msgel.textcontent = body;

  const latesthash =
    opts.txhash ||
    (typeof lasttxhash !== 'undefined' && lasttxhash) ||
    (array.isarray(window.txhistory) && window.txhistory[0] && window.txhistory[0].hash);

  const canviewtx = latesthash && string(latesthash).startswith('0x') && string(latesthash).length === 66;

  if(actionel && btnel){
    if(canviewtx){
      btnel.href = 'https://testnet.arcscan.app/tx/' + latesthash;
      actionel.style.display = 'block';
    } else {
      actionel.style.display = 'none';
      btnel.removeattribute('href');
    }
  }

  el.classlist.remove('success','error','info','warning');
  el.classlist.add(type, 'show');

  cleartimeout(_tt);
  _tt = settimeout(() => el.classlist.remove('show'), ms);
}
  const validtypes = ['success','error','info','warning'];

  if(!validtypes.includes(type)){
    opts = arguments[4] || {};
    ms = arguments[3] || 4500;
    type = validtypes.includes(arguments[2]) ? arguments[2] : 'info';
    msg = [msg, arguments[1]].filter(boolean).join(' — ');
  }

  const el = document.getelementbyid('toast');
  if(!el) return;

  const icons = {
    success: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m5 13l4 4l19 7" stroke="currentcolor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error:   '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m18 6l6 18m6 6l12 12" stroke="currentcolor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    info:    '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentcolor" stroke-width="2"/><path d="m12 8v4m0 4h.01" stroke="currentcolor" stroke-width="2" stroke-linecap="round"/></svg>',
    warning: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m12 9v4m0 4h.01m10.29 3.86l1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3l13.71 3.86a2 2 0 00-3.42 0z" stroke="currentcolor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  const titles = { success:'successful!', error:'failed', info:'info', warning:'warning' };
  let title = opts.title || titles[type] || 'info';
  let body = string(msg || '');

  if(body.includes(' — ')){
    const parts = body.split(' — ');
    title = parts[0].replace(/^[✓✕⚠ℹ✅❌🎉]\s{0,}/, '');
    body = parts.slice(1).join(' — ');
  } else if(body.startswith('✓ ') || body.startswith('✅ ')){
    body = body.replace(/^[✓✅]\s{0,}/, '');
  } else if(body.startswith('❌ ')){
    title = 'error';
    body = body.replace(/^❌\s{0,}/, '');
  }

  const iconel = document.getelementbyid('toasticonbadge');
  const titleel = document.getelementbyid('toasttitle');
  const msgel = document.getelementbyid('toastmsg');
  const actionel = document.getelementbyid('toastaction');
  const btnel = document.getelementbyid('toastactionbtn');

  if(iconel) iconel.innerhtml = icons[type] || icons.info;
  if(titleel) titleel.textcontent = title;
  if(msgel) msgel.textcontent = body;

  const latesthash =
    opts.txhash ||
    (typeof lasttxhash !== 'undefined' && lasttxhash) ||
    (array.isarray(window.txhistory) && window.txhistory[0] && window.txhistory[0].hash);

  const canviewtx = latesthash && string(latesthash).startswith('0x') && string(latesthash).length === 66;

  if(actionel && btnel){
    if(canviewtx){
      btnel.href = 'https://testnet.arcscan.app/tx/' + latesthash;
      actionel.style.display = 'block';
    } else {
      actionel.style.display = 'none';
      btnel.removeattribute('href');
    }
  }

  el.classlist.remove('success','error','info','warning');
  el.classlist.add(type, 'show');

  cleartimeout(_tt);
  _tt = settimeout(() => el.classlist.remove('show'), ms);
}
  const validtypes = ['success','error','info','warning'];

  if(!validtypes.includes(type)){
    opts = arguments[4] || {};
    ms = arguments[3] || 4500;
    type = validtypes.includes(arguments[2]) ? arguments[2] : 'info';
    msg = [msg, arguments[1]].filter(boolean).join(' — ');
  }

  const el = document.getelementbyid('toast');
  if(!el) return;

  const icons = {
    success: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m5 13l4 4l19 7" stroke="currentcolor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error:   '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m18 6l6 18m6 6l12 12" stroke="currentcolor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    info:    '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentcolor" stroke-width="2"/><path d="m12 8v4m0 4h.01" stroke="currentcolor" stroke-width="2" stroke-linecap="round"/></svg>',
    warning: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none"><path d="m12 9v4m0 4h.01m10.29 3.86l1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3l13.71 3.86a2 2 0 00-3.42 0z" stroke="currentcolor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  const titles = { success:'successful!', error:'failed', info:'info', warning:'warning' };
  let title = opts.title || titles[type] || 'info';
  let body = string(msg || '');

  if(body.includes(' — ')){
    const parts = body.split(' — ');
    title = parts[0].replace(/^[✓✕⚠ℹ✅❌🎉]\s{0,}/, '');
    body = parts.slice(1).join(' — ');
  } else if(body.startswith('✓ ') || body.startswith('✅ ')){
    body = body.replace(/^[✓✅]\s{0,}/, '');
  } else if(body.startswith('❌ ')){
    title = 'error';
    body = body.replace(/^❌\s{0,}/, '');
  }

  const iconel = document.getelementbyid('toasticonbadge');
  const titleel = document.getelementbyid('toasttitle');
  const msgel = document.getelementbyid('toastmsg');
  const actionel = document.getelementbyid('toastaction');
  const btnel = document.getelementbyid('toastactionbtn');

  if(iconel) iconel.innerhtml = icons[type] || icons.info;
  if(titleel) titleel.textcontent = title;
  if(msgel) msgel.textcontent = body;

  const latesthash =
    opts.txhash ||
    (typeof lasttxhash !== 'undefined' && lasttxhash) ||
    (array.isarray(window.txhistory) && window.txhistory[0] && window.txhistory[0].hash);

  const canviewtx = latesthash && string(latesthash).startswith('0x') && string(latesthash).length === 66;

  if(actionel && btnel){
    if(canviewtx){
      btnel.href = 'https://testnet.arcscan.app/tx/' + latesthash;
      actionel.style.display = 'block';
    } else {
      actionel.style.display = 'none';
      btnel.removeattribute('href');
    }
  }

  el.classlist.remove('success','error','info','warning');
  el.classlist.add(type, 'show');

  cleartimeout(_tt);
  _tt = settimeout(() => el.classlist.remove('show'), ms);
}
  const el = document.getElementById('toast'); if(el && !document.getElementById('toastTitle')) el.innerHTML = '<div id="toastIconBadge"></div><div class="toast-copy"><div id="toastTitle"></div><div id="toastMsg"></div><div id="toastAction" style="display:none;"><a id="toastActionBtn" href="#" target="_blank" rel="noopener">View Transaction</a></div></div>';
  if(!el) return;

  const ICONS = {
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    info:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8v4m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  const TITLES = { success:'Successful!', error:'Failed', info:'Info', warning:'Warning' };

  // Support extended call: toast(title, subtitle, type, ms, {txHash})
  let title = opts.title || TITLES[type] || 'Info';
  let body  = msg;

  // If msg looks like a title (short, no spaces in first word), split it
  // e.g. toast('✓ Swapped 10 USDC → 9.22 EURC on Arc!', 'success', 8000)
  // We keep it simple: title = first sentence, body = rest
  if(msg.includes(' — ')){
    const parts = msg.split(' — ');
    title = parts[0].replace(/^[✓✕⚠ℹ]\s{0,}/,'');
    body  = parts.slice(1).join(' — ');
  } else if(msg.startsWith('✓ ')){
    title = TITLES[type];
    body  = msg.replace(/^✓\s{0,}/,'');
  } else if(msg.startsWith('❌ ')){
    title = 'Error';
    body  = msg.replace(/^❌\s{0,}/,'');
  }

  const iconEl   = document.getElementById('toastIconBadge');
  const titleEl  = document.getElementById('toastTitle');
  const msgEl    = document.getElementById('toastMsg');
  const actionEl = document.getElementById('toastAction');
  const btnEl    = document.getElementById('toastActionBtn');

  if(iconEl)  iconEl.innerHTML   = ICONS[type] || ICONS.info;
  if(titleEl) titleEl.textContent = title;
  if(msgEl)   msgEl.textContent   = body;

  // Show "View Transaction" button if txHash provided
  if(actionEl && btnEl){
    if(opts.txHash){
      const explorer = 'https://testnet.arcscan.app/tx/' + opts.txHash;
      btnEl.href = explorer;
      actionEl.style.display = 'block';
    } else {
      actionEl.style.display = 'none';
    }
  }

  el.classList.remove('success','error','info','warning');
el.classList.add(type, 'show');
  clearTimeout(_tt);
  _tt = setTimeout(() => { el.classList.remove('show'); }, ms);
}
*/
function toast(msg, type='info', ms=4500, opts={}){
  let el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'toast';
  }
  if(el.parentElement !== document.body){
    document.body.appendChild(el);
  }
  el.innerHTML = '<div id="toastIconBadge"></div><div class="toast-copy"><div id="toastTitle"></div><div id="toastMsg"></div><div id="toastAction" style="display:none;"><a id="toastActionBtn" href="#" target="_blank" rel="noopener">View Transaction</a></div></div>';
  el.onclick = function(){ this.classList.remove('show'); };
  el.style.cssText += ';display:flex!important;position:fixed!important;top:18px!important;left:50%!important;right:auto!important;bottom:auto!important;transform:translateX(-50%) translateY(0)!important;z-index:2147483647!important;';

  const titles = { success:'Successful!', error:'Failed', info:'Info', warning:'Warning' };
  const titleEl = document.getElementById('toastTitle');
  const msgEl = document.getElementById('toastMsg');
  const actionEl = document.getElementById('toastAction');
  const btnEl = document.getElementById('toastActionBtn');

  if(titleEl) titleEl.textContent = titles[type] || 'Info';
  if(msgEl) msgEl.textContent = String(msg || '').replace(/^[^a-zA-Z0-9]+/, ''); //(/^✓\s{0,}/, '').replace(/^✅\s{0,}/, '');

  const txHash = opts.txHash || (typeof lastTxHash !== 'undefined' ? lastTxHash : null);
  if(actionEl && btnEl && txHash && String(txHash).startsWith('0x')){
    btnEl.href = 'https://testnet.arcscan.app/tx/' + txHash;
    actionEl.style.display = 'block';
  } else if(actionEl && btnEl){
    actionEl.style.display = 'none';
  }

  el.classList.remove('success','error','info','warning');
el.classList.add(type, 'show');
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), ms);
}

let balCurrency='USD'; // USD, EURC, USDC
function short(a){return a?a.slice(0,6)+'...'+a.slice(-4):'';}
function toggleBalCurrency(){
  const currencies=['USD','EURC','USDC'];
  const idx=currencies.indexOf(balCurrency);
  balCurrency=currencies[(idx+1)%currencies.length];
  document.getElementById('balCurrencyBtn').textContent=balCurrency;
  updateBalDisplay();
}
function updateBalDisplay(){
  const usdc=parseFloat(usdcBal)||0;
  const eurc=parseFloat(eurcBal)||0;
  const eurcInUsd=eurc*(1/FX);
  const totalUsd=usdc+eurcInUsd;
  const lbl=document.getElementById('balCurrencyLabel');
  const amt=document.getElementById('balAmt');
  const usd=document.getElementById('balUsd');
  if(balCurrency==='USD'){
    // Show total USD value (USDC + EURC converted)
    amt.textContent='$'+totalUsd.toFixed(2);
    lbl.textContent='';
    usd.textContent=usdc.toFixed(2)+' USDC · '+eurc.toFixed(2)+' EURC';
  } else if(balCurrency==='EURC'){
    amt.textContent=eurc.toFixed(2);
    lbl.textContent='EURC';
    usd.textContent='≈ $'+eurcInUsd.toFixed(2)+' USD';
  } else {
    amt.textContent='$'+totalUsd.toFixed(2);
    lbl.textContent='';
    usd.textContent='Total · '+usdc.toFixed(2)+' USDC + '+eurc.toFixed(2)+' EURC';
  }
  // Also update the NGN equivalent
  const ngnEl=document.getElementById('balNgn');
  if(ngnEl){const NGN_RATE=1622;ngnEl.textContent='≈ ₦'+Math.round(totalUsd*NGN_RATE).toLocaleString()+' NGN';}
}
function showBalSkeleton(){
  document.getElementById('balAmt').innerHTML='<span class="skel skel-bal"></span>';
  document.getElementById('balUsd').innerHTML='<span class="skel skel-small"></span>';
  document.getElementById('usdcBal2').innerHTML='<span class="skel skel-small"></span>';
  document.getElementById('eurcBal2').innerHTML='<span class="skel skel-small"></span>';
}
function showPage(name){
  // Use ui.js goPage directly via window reference to avoid circular call
  if(window._uiGoPage) { window._uiGoPage(name); }
  else if(window.goPage && window.goPage !== showPage) { window.goPage(name); }
  // Extra page init
  try{ if(name==='lend') initLendUI(); } catch(e){}
  try{ if(name==='history') renderHistory(); } catch(e){}
  try{ if(name==='bulk'){renderPayrollGroups();renderPayrollHistory();} } catch(e){}
  try{ if(name==='arcname') renderArcDirectory(); } catch(e){}
  try{ if(name==='swap') refreshBalances(); } catch(e){}
}
function toggleMoreDropdown(e){
  e.stopPropagation();
  const dd=document.getElementById('moreDropdown');
  const chevron=document.getElementById('moreChevron');
  const open=dd.style.display==='block';
  dd.style.display=open?'none':'block';
  if(chevron) chevron.style.transform=open?'':'rotate(180deg)';
}
function closeMoreDropdown(){
  const dd=document.getElementById('moreDropdown');
  const chevron=document.getElementById('moreChevron');
  if(dd) dd.style.display='none';
  if(chevron) chevron.style.transform='';
}
document.addEventListener('click',function(e){
  if(!document.getElementById('tnavMoreWrap')?.contains(e.target)) closeMoreDropdown();
});

function toggleTheme(){
  const root=document.documentElement;
  const isLight=root.getAttribute('data-theme')==='light';
  const t=isLight?'dark':'light';
  root.setAttribute('data-theme',t==='light'?'light':'');
  localStorage.setItem('nan_theme',t);
  document.getElementById('themeToggle').textContent=t==='light'?'🌙':'☀️';
}
function initTheme(){
  const s=localStorage.getItem('nan_theme')||'light';
  document.documentElement.setAttribute('data-theme',s==='light'?'light':'');
  document.getElementById('themeToggle').textContent=s==='light'?'🌙':'☀️';
}
function updateTopBar(connected){
  const bar=document.getElementById('globalTopBar');
  const btn=document.getElementById('connectTopBtn');
  const landBtn=document.getElementById('landConnectBtn');
  const dNav=document.getElementById('desktopNav');
  if(connected){
    if(window.innerWidth >= 769){
      bar.classList.add('desktop-show');
    } else {
      bar.style.display='flex';
    }
    if(dNav) dNav.style.display = window.innerWidth >= 769 ? 'flex' : 'none';
    btn.style.display='block';
    btn.textContent=otpEmail?'⚡ '+otpEmail.split('@')[0].slice(0,10):'0x…'+userAddr.slice(-6);
    btn.className='connected';
    btn.title='Click to copy wallet address';
    btn.onclick=()=>{
      if(!userAddr)return;
      navigator.clipboard.writeText(userAddr).then(()=>{
        const orig=btn.textContent;
        btn.textContent='✓ Copied!';
        btn.style.color='var(--success)';
        btn.style.borderColor='rgba(112,0,255,.4)';
        setTimeout(()=>{btn.textContent=orig;btn.style.color='';btn.style.borderColor='';},1800);
      });
    };
    const discBtn=document.getElementById('disconnectTopBtn');
    if(discBtn)discBtn.style.display='block';
    const discBtnMobile=document.getElementById('disconnectTopBtnMobile');
    if(discBtnMobile)discBtnMobile.style.display='flex';
    if(landBtn) landBtn.style.display='none';
  }else{
    bar.style.display='none';
    if(dNav) dNav.style.display='none';
    btn.style.display='none';
    const discBtnMobile=document.getElementById('disconnectTopBtnMobile');
    if(discBtnMobile)discBtnMobile.style.display='none';
    if(landBtn) landBtn.style.display='block';
  }
}

// ═══════════════════════════════════════════
// FX RATE
// ═══════════════════════════════════════════
async function fetchLiveFX(){
  try{
    const res=await fetch('https://nan-production.up.railway.app/api/fx-rate');
    if(res.ok){
      const data=await res.json();
      if(data.rate&&data.rate>0.5&&data.rate<2){
        FX=data.rate;fxLastUpdated=new Date();
        console.log('FX rate from',data.source,':',FX);
        updateSwapRateDisplay();return;
      }
    }
  }catch(e){}

  // Try Band Protocol oracle on Arc directly
  try{
    const readProvider=getArcProvider();
    const BAND_REF='0xDA7a001b254CD22e46d3eAB04d937489c93174C3';
    const BAND_ABI=['function getReferenceData(string,string) view returns (uint256,uint256,uint256)'];
    const band=new ethers.Contract(BAND_REF,BAND_ABI,readProvider);
    const [rate]=await band.getReferenceData('EUR','USD');
    const eur=parseFloat(ethers.formatUnits(rate,18));
    if(!isNaN(eur)&&eur>0.5&&eur<2){
      FX=eur;fxLastUpdated=new Date();updateSwapRateDisplay();return;
    }
  }catch(e){}

  // Fallback: Frankfurter (free, no CORS)
  try{
    const res=await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    const data=await res.json();
    const eur=data.rates?.EUR;
    if(eur){FX=eur;fxLastUpdated=new Date();updateSwapRateDisplay();return;}
  }catch(e){}

  console.warn('FX fetch failed, using fallback rate:',FX);
  updateSwapRateDisplay();
}
function updateSwapRateDisplay(){
  const time=fxLastUpdated?fxLastUpdated.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'fallback';
  const el=document.getElementById('swapRate');if(!el)return;
  el.innerHTML=swapFlipped
    ?`1 EURC ≈ ${(1/FX).toFixed(4)} USDC &nbsp;·&nbsp; <span style="color:var(--success);font-size:.65rem;">● live ${time}</span>`
    :`1 USDC ≈ ${FX.toFixed(4)} EURC &nbsp;·&nbsp; <span style="color:var(--success);font-size:.65rem;">● live ${time}</span>`;
}

// ═══════════════════════════════════════════
// WALLET CONNECTION — MetaMask
// ═══════════════════════════════════════════
wp=null;
function detectWallet(){
  if(window.ethereum?.providers?.length){
    const ps=window.ethereum.providers;
    return ps.find(p=>p.isRabby)||ps.find(p=>p.isCoinbaseWallet)||ps.find(p=>p.isMetaMask)||ps[0];
  }
  return window.ethereum||window.rabby||null;
}
async function checkNetwork(){
  if(!wp)return false;
  try{
    const hex=await wp.request({method:'eth_chainId'});
    const chainId=parseInt(hex,16);
    onArcNetwork=chainId===ARC_CHAIN_ID;
    const banner=document.getElementById('wrongNetBanner');
    if(banner)banner.classList.toggle('show',!onArcNetwork&&!!userAddr);
    return onArcNetwork;
  }catch{return false;}
}
async function switchToArc(){
  if(!wp)return;
  try{await wp.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC_HEX}]});}
  catch(e){if(e.code===4902||e.code===-32603){try{await wp.request({method:'wallet_addEthereumChain',params:[ARC_PARAMS]});}catch{}}}
}
async function connectWallet(){
  showWalletPicker();
}
async function _doConnect(detectedWp, walletType){
  wp=detectedWp;
  const btn=document.getElementById('landConnectBtn');
  if(btn){btn.innerHTML='<span class="spinner"></span>Connecting...';btn.disabled=true;}
  try{
    await wp.request({method:'eth_requestAccounts'});
    try{
      await wp.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC_HEX}]});
    }catch(e){
      if(e.code===4902||e.code===-32603){
        await wp.request({method:'wallet_addEthereumChain',params:[ARC_PARAMS]});
      }
    }
    provider=new ethers.BrowserProvider(wp);
    signer=await provider.getSigner();
    userAddr=await signer.getAddress();
    isCircleWallet=false;
    const chainHex=await wp.request({method:'eth_chainId'});
    onArcNetwork=parseInt(chainHex,16)===ARC_CHAIN_ID;
    await onConnected(false);
    trackEvent('connect',{type:walletType});
  }catch(err){
    if(err.code===4001)toast('Connection cancelled','error');
    else toast((err?.message||'Connection failed').slice(0,120),'error');
  }finally{
    if(btn){btn.innerHTML='🔗 Connect Wallet';btn.disabled=false;}
  const landBtn2=document.getElementById('landConnectBtn');
  if(landBtn2)landBtn2.style.display='none';
  }
}

// ═══════════════════════════════════════════
// EMAIL / CIRCLE WALLET LOGIN
// ═══════════════════════════════════════════
async function sendEmailOTP(){
  const email=document.getElementById('emailInput').value.trim();
  if(!email||!email.includes('@')){toast('Enter a valid email','error');return;}
  const btn=document.getElementById('otpBtn');
  btn.innerHTML='<span class="spinner"></span>';btn.disabled=true;
  otpEmail=email;
  try{
    const res=await fetch('https://nan-production.up.railway.app/api/otp',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'send',email}),
    });
    const data=await res.json();
    if(data.success){
      if(data.dev){toast('Dev mode: OTP printed to server console','info',6000);}
      else{toast('✓ Code sent to '+email,'success',6000);}
      document.getElementById('otpBox').style.display='block';
      document.getElementById('otpInput').focus();
      document.getElementById('stepDot1').style.width='8px';document.getElementById('stepDot1').style.background='rgba(168,85,247,.4)';
      document.getElementById('stepDot2').style.width='20px';document.getElementById('stepDot2').style.background='#a855f7';
      document.getElementById('stepLabel').textContent='Step 2 of 2 — Enter your code';
      window._otpToken=data.token||null;
      window._otpExpiry=data.expiresAt||Date.now()+600000;
      
    }else{toast(data.error||'Failed to send code','error',6000);}
  }catch(e){toast('Network error — is the server running?','error');}
  btn.innerHTML='Send Code';btn.disabled=false;
}

async function verifyOTP(){
  const otp=document.getElementById('otpInput').value.trim();
  if(!otp||otp.length!==6){toast('Enter the 6-digit code — got: '+otp.length,'error');return;}
      if(!window._otpToken||!window._otpExpiry){
        toast('Session lost — click Send Code again','error',5000);
        document.getElementById('otpBox').style.display='none';
        window._otpToken=null;window._otpExpiry=null;
        return;
      }
  const btn=document.getElementById('verifyBtn');
  btn.innerHTML='<span class="spinner"></span>';btn.disabled=true;
  try{
    const res=await fetch('https://nan-production.up.railway.app/api/otp',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'verify',email:otpEmail,otp,token:window._otpToken,expiresAt:window._otpExpiry}),
    });
    const data=await res.json();
    if(!data.success){toast(data.error||'Wrong code — try again','error',5000);btn.innerHTML='Verify →';btn.disabled=false;return;}
    try{
      const cwRes=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'getWallet',email:otpEmail})});
      const cwData=await cwRes.json();
      if(cwData.success&&cwData.wallet?.address){
        circleWalletId=cwData.wallet.id;
        circleWalletAddress=cwData.wallet.address;
        localStorage.setItem('circleWalletId', cwData.wallet.id);
        localStorage.setItem('circleWalletAddr', cwData.wallet.address);
        userAddr=cwData.wallet.address;
        isCircleWallet=true;
        signer=null;
        provider=getArcProvider();
        onArcNetwork=true;
        document.getElementById('otpBox').style.display='none';
        toast('✓ Circle wallet ready!','success',3000);
        await onConnected(true,false);
        btn.innerHTML='Verify →';btn.disabled=false;
        return;
      }
    }catch(e){
      toast('Circle wallet error — '+e.message.slice(0,80),'error',6000);
      btn.innerHTML='Verify →';btn.disabled=false;
      return;
    }
  }catch(e){console.error('verifyOTP error:',e);toast('Network error — is the server running?','error');}
  btn.innerHTML='Verify →';btn.disabled=false;
}








// ═══════════════════════════════════════════
// VOICE — Speech Recognition + Synthesis
// ═══════════════════════════════════════════
let recognition=null, isListening=false, voiceEnabled=true;
let synth=window.speechSynthesis;
let currentUtterance=null;

function initVoice(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    document.getElementById('voiceBtn').style.display='none';
    return;
  }
  recognition=new SpeechRecognition();
  recognition.continuous=false;
  recognition.interimResults=true;
  recognition.lang='en-US';

  recognition.onstart=()=>{
    isListening=true;
    const btn=document.getElementById('voiceBtn');
    btn.innerHTML='⏹';
    btn.style.background='rgba(248,113,113,.2)';
    btn.style.borderColor='rgba(248,113,113,.5)';
    btn.style.color='#f87171';
    document.getElementById('voiceStatus').style.display='block';
  };

  recognition.onresult=(e)=>{
    const transcript=Array.from(e.results).map(r=>r[0].transcript).join('');
    document.getElementById('agentInput').value=transcript;
    if(e.results[e.results.length-1].isFinal){
      stopListening();
      setTimeout(()=>sendAgentMsg(),300);
    }
  };

  recognition.onerror=(e)=>{
    console.log('Voice error:',e.error);
    stopListening();
    if(e.error==='not-allowed') toast('Microphone access denied — enable in browser settings','error',4000);
  };

  recognition.onend=()=>stopListening();
}

function stopListening(){
  isListening=false;
  if(recognition) recognition.abort();
  const btn=document.getElementById('voiceBtn');
  if(btn){
    btn.innerHTML='🎤';
    btn.style.background='rgba(168,85,247,.1)';
    btn.style.borderColor='rgba(168,85,247,.3)';
    btn.style.color='var(--accent3)';
  }
  const status=document.getElementById('voiceStatus');
  if(status) status.style.display='none';
}

function toggleVoice(){
  if(!recognition){initVoice();}
  if(!recognition){toast('Voice not supported in this browser — try Chrome','error',4000);return;}
  if(isListening){stopListening();return;}
  // Stop any ongoing speech first
  if(synth.speaking) synth.cancel();
  try{recognition.start();}catch(e){console.log('Recognition error:',e);}
}

function speakResponse(text){
  if(!synth||!voiceEnabled) return;
  // Clean text for speech — remove emojis and special chars
  const clean=text.replace(/[🎤✦✅❌⚠️🔐💬🌐⚡🎉🔗→←↑↓]/g,'')
    .replace(/<[^>]*>/g,'')
    .replace(/\*\*/g,'')
    .trim();
  if(!clean) return;
  if(synth.speaking) synth.cancel();
  const utterance=new SpeechSynthesisUtterance(clean);
  utterance.rate=1.05;
  utterance.pitch=1.0;
  utterance.volume=0.9;
  // Try to use a good voice
  const voices=synth.getVoices();
  const preferred=voices.find(v=>v.name.includes('Google')&&v.lang.startsWith('en'))
    ||voices.find(v=>v.lang.startsWith('en-US'))
    ||voices.find(v=>v.lang.startsWith('en'));
  if(preferred) utterance.voice=preferred;
  currentUtterance=utterance;
  synth.speak(utterance);
}

// Init voice when page loads
window.addEventListener('load',()=>{ initVoice(); });
// Approvals are done per-transaction with exact amounts — no pre-approvals needed
async function _ensureUnlimitedApprovals(){ /* disabled — exact approvals used per tx */ }

async function _autoSeedLiquidity(){
  try{
    const readProvider=getArcProvider();
    const swapRead=new ethers.Contract(SWAP_CONTRACT,SWAP_ABI,readProvider);
    const [usdcLiq,eurcLiq]=await swapRead.getLiquidity();
    if(parseFloat(ethers.formatUnits(usdcLiq,6))>10000&&parseFloat(ethers.formatUnits(eurcLiq,6))>10000){return;}
    const usdcC=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
    const eurcC=new ethers.Contract(EURC_ADDR,ERC20_ABI,signer);
    const swapC=new ethers.Contract(SWAP_CONTRACT,SWAP_ABI,signer);
    const [uBal,eBal]=await Promise.all([usdcC.balanceOf(userAddr),eurcC.balanceOf(userAddr)]);
    if(parseFloat(ethers.formatUnits(uBal,6))<1||parseFloat(ethers.formatUnits(eBal,6))<1){return;}
    toast('Adding pool liquidity…','info',4000);
    const UNLIMITED=ethers.MaxUint256;
    const [appU,appE]=await Promise.all([
      usdcC.approve(SWAP_CONTRACT,UNLIMITED,arcGasOpts()),
      eurcC.approve(SWAP_CONTRACT,UNLIMITED,arcGasOpts()),
    ]);
    await Promise.all([appU.wait(0),appE.wait(0)]);
    const seedU=uBal/2n;
    const seedE=eBal/2n;
    const liqTx=await swapC.addLiquidity(seedU,seedE,arcGasOpts());
    await liqTx.wait(0);
    toast('✓ Pool liquidity added — swaps ready!','success',5000);
    await refreshBalances();
  }catch(e){console.warn('[pool] Liquidity seed skipped:',e.message);}
}

async function onConnected(isEmail=false, isDev=false){
  const land = document.getElementById('page-land');
  if(land){
    land.classList.remove('active');
    land.style.display='none';
    land.style.visibility='hidden';
    land.style.zIndex='-1';
    land.style.pointerEvents='none';
  }
  // Also remove active from page-land explicitly
  document.querySelectorAll('.page-land').forEach(p=>{
    p.classList.remove('active');
    p.style.display='none';
  });
  document.getElementById('bottomNav').classList.add('show');
  showPage('home');
  updateTopBar(true);
  if(typeof updateDesktopNav === 'function') updateDesktopNav();
  // Update More page profile card
  try{
    const addr = userAddr||'';
    const short = addr?addr.slice(0,6)+'...'+addr.slice(-4):'—';
    const initials = isEmail&&otpEmail?otpEmail.slice(0,2).toUpperCase():(addr?addr.slice(2,4).toUpperCase():'?');
    const el_name = document.getElementById('moreName');
    const el_addr = document.getElementById('moreAddr');
    const el_avatar = document.getElementById('moreAvatar');
    if(el_name) el_name.textContent = isEmail&&otpEmail ? otpEmail.split('@')[0] : short;
    if(el_addr) el_addr.textContent = short;
    if(el_avatar) el_avatar.textContent = initials;
  }catch(e){}

  document.getElementById('walAddr').textContent=short(userAddr);
  document.getElementById('walAddr').title=userAddr;
  document.getElementById('recvAddr').textContent=userAddr;
  document.getElementById('walInit').textContent=userAddr.slice(2,4).toUpperCase();

  // Show wallet source — detect which wallet is connected
  const srcBadge=document.getElementById('walletSourceBadge');
  srcBadge.innerHTML='';
  srcBadge.style.display='none';
  document.getElementById('devBadge').style.display=(isEmail&&isDev)?'inline-block':'none';

  if(!isEmail)await checkNetwork();
  // Auto liquidity + approvals disabled — happen per-transaction only
  showBalSkeleton();
  await refreshBalances();
  loadTxHistory();arcNames=JSON.parse(localStorage.getItem('nan_arcnames_'+userAddr)||'[]');
  setTimeout(()=>loadOnChainHistory(),2000);
  renderQR(userAddr);
  renderHistory();
  renderArcDirectory();
  initLendUI();
  document.getElementById('aiBtn').style.display='flex';
  setTimeout(attachAIListeners, 100); // re-attach after button is visible
  startOrderEngine();
  // Pre-approve all contracts once so users never see repeated approve popups
  // Approvals done per-transaction with exact amounts for security
  renderAgentMsgs();renderAgentChips();

  if(!isEmail&&wp?.on){
    wp.on('accountsChanged',(a)=>{if(!a.length)disconnect();else location.reload();});
    wp.on('chainChanged',async()=>{await checkNetwork();if(onArcNetwork){provider=new ethers.BrowserProvider(wp);signer=await provider.getSigner();await refreshBalances();}});
  }

  // Show onboarding for new users
  const isNew=!localStorage.getItem('nan_v_'+userAddr);
  if(isNew){
    localStorage.setItem('nan_v_'+userAddr,'1');
    document.getElementById('onboardChecklist').style.display='block';
    setTimeout(()=>toast('🎉 Get free USDC at faucet.circle.com','info',8000),1500);
  }
}

function disconnect(){
  txHistory=[];paymentRequests=[];arcNames=[];
  provider=signer=userAddr=wp=null;
  onArcNetwork=false;lastTxHash=lastTxId=null;
  circleWalletId=circleWalletAddress=circleWalletBlockchain=null;
  circleUserToken=circleUserId=otpEmail=null;
  isCircleWallet=false;
  localStorage.removeItem('circleWalletId');
  localStorage.removeItem('circleWalletAddr');
  if(txPollTimer){clearInterval(txPollTimer);txPollTimer=null;}
  sessionStorage.removeItem('nan_from_landing');
  localStorage.removeItem('nan_metamask_was_connected');
  toast('Disconnected','info',1500);
  setTimeout(()=>{ window.location.replace('/'); }, 800);
}

// ═══════════════════════════════════════════
// BALANCE REFRESH
// ═══════════════════════════════════════════
async function refreshBalances(){
  // Show skeleton while loading
  const skelWrap=document.getElementById('balSkelWrap');
  const realWrap=document.getElementById('balRealWrap');
  if(skelWrap&&realWrap&&(document.getElementById('homeBalAmt').textContent==='—')){
    skelWrap.style.display='block';
    realWrap.style.display='none';
  }
  if(!userAddr||balancesLoading)return;
  balancesLoading=true;
  document.getElementById('rpcError').classList.remove('show');
  try{
    // Always use Arc RPC directly — don't depend on onArcNetwork flag
    const readProvider=getArcProvider();
    const cu=new ethers.Contract(USDC_ADDR,ERC20_ABI,readProvider);
    const ce=new ethers.Contract(EURC_ADDR,ERC20_ABI,readProvider);
    const[ur,er]=await Promise.all([cu.balanceOf(userAddr),ce.balanceOf(userAddr)]);
    usdcBal=ethers.formatUnits(ur,USDC_DECIMALS);
    eurcBal=ethers.formatUnits(er,EURC_DECIMALS);
    const u=parseFloat(usdcBal).toFixed(2);
    const e=parseFloat(eurcBal).toFixed(2);
    updateBalDisplay();
    document.getElementById('usdcBal2').textContent=u;
    document.getElementById('eurcBal2').textContent=e;
    const emptyHint=document.getElementById('emptyBalHint');
    if(emptyHint){emptyHint.style.display=(parseFloat(u)===0&&parseFloat(e)===0)?'flex':'none';}
    document.getElementById('swapFromBal').textContent=swapFlipped?e:u;
    document.getElementById('swapToBal').textContent=swapFlipped?u:e;
    // Update home page balance card
    const totalUsd=(parseFloat(u)+parseFloat(e)*(1/FX));
    const NGN_RATE=1622;
    const homeBalAmt=document.getElementById('homeBalAmt');
    const homeBalNgn=document.getElementById('homeBalNgn');
    const homeUsdcBal=document.getElementById('homeUsdcBal');
    const homeEurcBal=document.getElementById('homeEurcBal');
    if(homeBalAmt)homeBalAmt.textContent=isNaN(totalUsd)?'0.00':totalUsd.toFixed(2);
    // Hide skeleton, show balance
    const _sk=document.getElementById('balSkelWrap');const _rw=document.getElementById('balRealWrap');
    if(_sk)_sk.style.display='none';if(_rw)_rw.style.display='block';
    if(homeBalNgn)homeBalNgn.textContent='≈ ₦'+(isNaN(totalUsd)?'0':Math.round(totalUsd*NGN_RATE).toLocaleString())+' NGN';
    if(homeUsdcBal)homeUsdcBal.textContent=u+' USDC';
    if(homeEurcBal)homeEurcBal.textContent=e+' EURC';
    // Update home page asset rows
    const haUsdc=document.getElementById('homeAssetUsdc');
    const haEurc=document.getElementById('homeAssetEurc');
    const haNgn=document.getElementById('homeAssetNgn');
    if(haUsdc)haUsdc.textContent=u;
    if(haEurc)haEurc.textContent=e;
    if(haNgn)haNgn.textContent='₦0.00';
    updateSendAvailable();
    validateSend();
  }catch(err){
    console.error('Balance fetch failed:',err);
    document.getElementById('rpcError').classList.add('show');
  }
  balancesLoading=false;
}

// ═══════════════════════════════════════════
// TX STATUS POLLING (Circle Wallets API)
// ═══════════════════════════════════════════
async function pollTxStatus(txId, userToken, onConfirmed){
  if(txPollTimer)clearInterval(txPollTimer);
  document.getElementById('txPolling').style.display='flex';
  document.getElementById('txPollingMsg').textContent='Confirming on-chain…';
  let attempts=0;
  txPollTimer=setInterval(async()=>{
    attempts++;
    try{
      const res=await fetch('https://nan-production.up.railway.app/api/transaction/'+txId,{
        headers:{'X-User-Token':userToken||''}
      });
      const data=await res.json();
      const state=data.state||data.status||'';
      if(state==='CONFIRMED'||state==='COMPLETE'){
        clearInterval(txPollTimer);txPollTimer=null;
        document.getElementById('txPolling').style.display='none';
        if(onConfirmed)onConfirmed(data.txHash||txId);
      }else if(state==='FAILED'){
        clearInterval(txPollTimer);txPollTimer=null;
        document.getElementById('txPolling').style.display='none';
        toast('Transaction failed on-chain','error',7000);
      }else{
        document.getElementById('txPollingMsg').textContent=`Waiting for confirmation (${attempts*5}s)…`;
      }
    }catch(e){console.warn('Poll error:',e);}
    if(attempts>60){clearInterval(txPollTimer);txPollTimer=null;document.getElementById('txPolling').style.display='none';}
  },5000);
}

// ═══════════════════════════════════════════
// SEND
// ═══════════════════════════════════════════
function setType(type,el){
  recipType=type;resolvedTo=null;lastResolvedInput='';
  document.querySelectorAll('#page-send .topt').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  const inp=document.getElementById('recipInput');
  inp.value='';hideRes();
  if(type==='address')inp.placeholder='0x... wallet address';
  if(type==='arcname')inp.placeholder='yourname.arc';
  validateSend();
}
async function onRecipInput(){
  const val=document.getElementById('recipInput').value.trim();
  // Auto-detect type from input
  if(val.startsWith('0x')) recipType='address';
  else if(val.endsWith('.arc')||(!val.includes('.')&&val.length>0&&!val.includes('@'))) recipType='arcname';
  if(val!==lastResolvedInput){resolvedTo=null;lastResolvedInput='';}
  hideRes();
  if(!val){validateSend();return;}
  if(recipType==='address'){
    if(val.length===42&&val.startsWith('0x')){
      if(ethers.isAddress(val)){resolvedTo=val;lastResolvedInput=val;showOk('✓ Valid address');}
      else showNo('Invalid address checksum');
    }else if(val.startsWith('0x')&&val.length>2)showNo('Address must be 42 chars');
  }else if(recipType==='arcname'){
    const name=val.toLowerCase().replace('.arc','');
    // Check local first (fast)
    const found=arcNames.find(n=>n.name===name);
    if(found){
      resolvedTo=found.owner;lastResolvedInput=val;
      showOk('✓ '+name+'.arc → '+short(found.owner));
    }else{
      // Fall back to on-chain lookup
      try{
        const readProvider=getArcProvider();
        const nameContract=new ethers.Contract(NAME_REGISTRY,NAME_ABI,readProvider);
        const addr=await nameContract.resolve(name);
        if(addr&&addr!=='0x0000000000000000000000000000000000000000'){
          resolvedTo=addr;lastResolvedInput=val;
          showOk('✓ '+name+'.arc → '+short(addr));
        }else{
          showNo('Arc name not found — register it in the Name tab');
        }
      }catch(e){
        showNo('Arc name not found — register it in the Name tab');
      }
    }
  }
  validateSend();
}
function showOk(t){const b=document.getElementById('resolvedBar');b.className='res-bar ok';b.style.display='flex';document.getElementById('resolvedTxt').textContent=t;}
function showNo(t){const b=document.getElementById('resolvedBar');b.className='res-bar no';b.style.display='flex';document.getElementById('resolvedTxt').textContent=t;}
function hideRes(){document.getElementById('resolvedBar').style.display='none';}
function toggleSendToken(){sendToken=sendToken==='USDC'?'EURC':'USDC';document.getElementById('sendTokenLabel').textContent=sendToken;updateSendAvailable();validateSend();}
function updateSendAvailable(){
  const bal=sendToken==='USDC'?parseFloat(usdcBal):parseFloat(eurcBal);
  const el=document.getElementById('sendAvailable');
  if(el)el.textContent=isNaN(bal)?'—':bal.toFixed(2);
  // Update token switcher badge
  document.getElementById('sendTokenLabel').textContent=sendToken;
}
function setSendTokenDirect(tok,el){
  sendToken=tok;
  const uBtn=document.getElementById('topt-usdc');
  const eBtn=document.getElementById('topt-eurc');
  if(uBtn){uBtn.style.borderColor=tok==='USDC'?'rgba(112,0,255,.5)':'var(--border)';uBtn.style.background=tok==='USDC'?'rgba(112,0,255,.08)':'none';uBtn.style.color=tok==='USDC'?'var(--text)':'var(--text3)';}
  if(eBtn){eBtn.style.borderColor=tok==='EURC'?'rgba(112,0,255,.5)':'var(--border)';eBtn.style.background=tok==='EURC'?'rgba(112,0,255,.08)':'none';eBtn.style.color=tok==='EURC'?'var(--text)':'var(--text3)';}
  const lbl=document.getElementById('sendTokenLabel');if(lbl)lbl.textContent=tok;
  const bal=tok==='USDC'?parseFloat(usdcBal):parseFloat(eurcBal);
  const av=document.getElementById('sendAvailable');if(av)av.textContent='Available: '+(bal||0).toFixed(2)+' '+tok;
  validateSend();
}
function setMax(){document.getElementById('amtInput').value=(sendToken==='USDC'?Math.max(0,parseFloat(usdcBal)-GAS_USDC):Math.max(0,parseFloat(eurcBal))).toFixed(6);validateSend();}
function validateSend(){
  const addr=document.getElementById('recipInput').value.trim();
  const amt=parseFloat(document.getElementById('amtInput').value)||0;
  const uF=parseFloat(usdcBal)||0,eF=parseFloat(eurcBal)||0;
  const btn=document.getElementById('sendBtn');
  if(!isCircleWallet&&!onArcNetwork){
    btn.disabled=false;
    btn.style.opacity='1';
    btn.textContent='⚡ Switch to Arc Testnet';
    btn.onclick=async function(){await switchToArc();btn.onclick=null;validateSend();};
    return;
  }
  // Reset onclick to default when on correct network
  btn.onclick=showConfirm;
  if(!addr){btn.disabled=true;btn.textContent='Send →';return;}
  if(!amt||amt<=0){btn.disabled=true;btn.textContent='Send →';return;}
  if(recipType==='address'&&(!resolvedTo||lastResolvedInput!==addr)){btn.disabled=true;btn.textContent='Validating address…';return;}
  if(recipType==='arcname'&&(!resolvedTo||lastResolvedInput!==addr)){btn.disabled=true;btn.textContent='Arc name not found';return;}
  if(sendToken==='USDC'&&amt+GAS_USDC>uF){btn.disabled=true;btn.textContent='Insufficient balance';return;}
  if(sendToken==='EURC'){if(amt>eF){btn.disabled=true;btn.textContent='Insufficient balance';return;}if(uF<GAS_USDC){btn.disabled=true;btn.textContent='Need USDC for gas';return;}}
  btn.disabled=false;btn.textContent='Send '+amt.toFixed(2)+' '+sendToken+' →';
}
function showConfirm(){
  const raw=document.getElementById('recipInput').value.trim();
  const amt=parseFloat(document.getElementById('amtInput').value);
  const actualTo=(resolvedTo&&lastResolvedInput===raw)?resolvedTo:null;
  if(!actualTo){toast('Recipient not resolved','error');return;}
  const via=recipType==='address'?'Wallet address':recipType==='x'?'Twitter handle':'Discord handle';
  document.getElementById('confAmt').textContent=amt.toFixed(2)+' '+sendToken;
  document.getElementById('confTo').textContent=short(actualTo)+(recipType!=='address'?' ('+raw+')':'');
  document.getElementById('confVia').textContent=via;
  const sc=document.getElementById('sendCard')||document.getElementById('tab-send');
  if(sc) sc.style.display='none';
  document.getElementById('confirmCard').classList.add('show');
}
function cancelConfirm(){
  document.getElementById('confirmCard').classList.remove('show');
  const sc=document.getElementById('sendCard')||document.getElementById('tab-send');
  if(sc) sc.style.display='block';
}

async function doSend(){
  const raw=document.getElementById('recipInput').value.trim();
  const amt=parseFloat(document.getElementById('amtInput').value);
  const to=(resolvedTo&&lastResolvedInput===raw)?resolvedTo:null;
  if(!to||!amt){return;}
  
  const btn=document.getElementById('confirmSendBtn');

  

  // ── Circle API path (no private key, use Circle transfer API) ──
  if(isCircleWallet){
    if(!circleWalletId){toast('Wallet not ready — please log in again','error');return;}
    btn.innerHTML='<span class="spinner"></span>Submitting via Circle…';btn.disabled=true;
    try{
      const appkitRes=await fetch('https://nan-production.up.railway.app/api/appkit/send',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({walletAddress:circleWalletAddress,destinationAddress:to,amount:amt.toString(),tokenSymbol:sendToken}),
      });
      let data=await appkitRes.json();
      if(!data.success){
        const fbRes=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'transfer',walletId:circleWalletId,walletAddress:circleWalletAddress,destinationAddress:to,amount:amt.toString(),tokenSymbol:sendToken}),
        });
        data=await fbRes.json();
      }
      if(!data.success){throw new Error(data.error||'Transfer failed');}
      lastTxHash=data.txHash||data.transactionId;
      const isConfirmed=!!data.txHash&&!data.pending;
      addTx({hash:lastTxHash,to,toRaw:raw,amount:amt.toFixed(6),type:'out',token:sendToken,ts:Date.now(),confirmed:isConfirmed,source:'circle'});
      setTimeout(()=>resolveCircleTxHash(lastTxHash),2000);
      showSendSuccess(amt,to,lastTxHash);
      if(data.pending&&data.transactionId){
        pollTxStatus(data.transactionId,'',async(confirmedHash)=>{
          lastTxHash=confirmedHash||lastTxHash;
          document.getElementById('successHash').textContent=lastTxHash;
          txHistory[0].hash=lastTxHash;txHistory[0].confirmed=true;
          saveTxHistory();renderHistory();
          toast('✓ Transaction confirmed on-chain!','success',5000);
          await refreshBalances();
        });
      }else{
        await refreshBalances();
      }
    }catch(err){
      toast((err?.message||'Transfer failed').slice(0,140),'error',8000);
      btn.innerHTML='✓ Confirm & Send';btn.disabled=false;
    }
    return;
  }

  // ── MetaMask path ──
  if(!signer||!onArcNetwork){toast('Connect wallet & switch to Arc Testnet','error');return;}
  btn.innerHTML='<span class="spinner"></span>Waiting for wallet…';btn.disabled=true;
  const tokenAddr=sendToken==='USDC'?USDC_ADDR:EURC_ADDR;
  const decimals=sendToken==='USDC'?USDC_DECIMALS:EURC_DECIMALS;
  try{
    const c=new ethers.Contract(tokenAddr,ERC20_ABI,signer);
    const tx=await c.transfer(to,ethers.parseUnits(amt.toFixed(decimals),decimals),arcGasOpts());
    lastTxHash=tx.hash;
    btn.innerHTML='<span class="spinner"></span>Confirming…';
    toast('Submitted! '+short(tx.hash),'info',14000);
    const receipt=await tx.wait(0);
    addTx({hash:tx.hash,to,toRaw:raw,amount:amt.toFixed(6),type:'out',token:sendToken,ts:Date.now(),confirmed:!!receipt,source:'metamask'});
    toast('✓ Sent '+amt.toFixed(2)+' '+sendToken+'!','success',7000);
    document.getElementById('confirmCard').classList.remove('show');
    showSendSuccess(amt,to,tx.hash);
    await refreshBalances();
  }catch(err){
    toast((err?.info?.error?.message||err?.reason||err?.message||'Failed').slice(0,140),'error',8000);
    btn.innerHTML='✓ Confirm & Send';btn.disabled=false;
  }
}

function showSendSuccess(amt,to,hash){
  document.getElementById('confirmCard').classList.remove('show');
  // Cash App style — populate success card
  const amtEl=document.getElementById('successAmt');
  const toEl=document.getElementById('successTo');
  const timeEl=document.getElementById('successTime');
  const hashEl=document.getElementById('successHash');
  if(amtEl) amtEl.textContent=amt.toFixed(2)+' '+sendToken;
  if(toEl) toEl.textContent=to&&to.endsWith&&to.endsWith('.arc')?to:short(to);
  if(timeEl) timeEl.textContent='Arrived in under 1 second';
  // Keep successMsg for share/receipt compat
  const msgEl=document.getElementById('successMsg');
  if(msgEl) msgEl.textContent=amt.toFixed(2)+' '+sendToken+' sent to '+short(to);
  if(hashEl) hashEl.textContent='';
  document.getElementById('successCard').classList.add('show');
  // Scroll to top of send card
  try{document.getElementById('page-send').scrollTop=0;}catch(e){}
  const btn=document.getElementById('confirmSendBtn');
  if(btn){btn.innerHTML='✓ Confirm & Send';btn.disabled=false;}
}
function openExplorer(){if(lastTxHash&&lastTxHash.startsWith('0x'))window.open(ARC_EXP+'/tx/'+lastTxHash,'_blank');else if(lastTxHash)toast('Transaction confirmed on Arc — hash not available for Circle wallet txs','info',4000);}

function shareOnX(){
  const msg=document.getElementById('successMsg').textContent;
  const hash=lastTxHash||'';
  const explorerUrl=(hash&&hash.startsWith('0x'))?ARC_EXP+'/tx/'+hash:ARC_EXP+'/address/'+(userAddr||'');
  const text=`Just sent ${msg} on @arc_io Testnet using NAN Wallet! ⚡\n\n🔗 ${explorerUrl}\n\nBuilt with @circle USDC — the stablecoin-native L1\n\n#Arc #USDC #DeFi #NAN #Web3`;
  window.open('https://x.com/intent/tweet?text='+encodeURIComponent(text),'_blank');
}

function showReceipt(){
  const msg=document.getElementById('successMsg').textContent;
  const hash=lastTxHash||'';
  const isReal=hash&&hash.startsWith('0x');
  const shortHash=isReal?hash.slice(0,10)+'...'+hash.slice(-6):'Circle Wallet ✓';
  const now=new Date().toLocaleString();
  const modal=document.createElement('div');
  modal.id='receiptModal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);';
  modal.innerHTML=`
    <div style="max-width:360px;width:100%;position:relative;">
      <div id="receiptCard" style="background:var(--card);border:1px solid rgba(168,85,247,.4);border-radius:20px;padding:28px 24px;position:relative;overflow:hidden;box-shadow:0 0 60px rgba(168,85,247,.3);">
        <!-- Background glow -->
        <div style="position:absolute;top:-60px;right:-60px;width:180px;height:180px;background:transparent;pointer-events:none;"></div>
        <div style="position:absolute;bottom:-40px;left:-40px;width:140px;height:140px;background:transparent;pointer-events:none;"></div>

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:30px;height:30px;background:#a855f7;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#f3e8ff;box-shadow:0 0 12px rgba(168,85,247,.5);">N</div>
            <div>
              <div style="font-size:.75rem;font-weight:700;color:#f3e8ff;letter-spacing:.08em;">NAN WALLET</div>
              <div style="font-size:.65rem;color:#c084fc;letter-spacing:.12em;">ARC TESTNET</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:.65rem;color:#c084fc;font-family:monospace;">RECEIPT</div>
            <div style="font-size:.65rem;color:#c084fc;font-family:monospace;">${now}</div>
          </div>
        </div>

        <!-- Success check -->
        <div style="text-align:center;margin-bottom:20px;">
          <div style="width:64px;height:64px;border-radius:50%;background:rgba(112,0,255,.1);border:2px solid rgba(112,0,255,.4);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:1.8rem;box-shadow:0 0 24px rgba(112,0,255,.2);">✓</div>
          <div style="font-size:1.3rem;font-weight:700;color:#f3e8ff;margin-bottom:4px;">Transaction Confirmed</div>
          <div style="font-size:.75rem;color:#c084fc;">${msg}</div>
        </div>

        <!-- Divider -->
        <div style="border-top:1px dashed rgba(168,85,247,.25);margin:16px 0;"></div>

        <!-- Details -->
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.72rem;color:#c084fc;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;">Network</span>
            <span style="font-size:.72rem;color:#c084fc;font-family:monospace;display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;background:#c084fc;border-radius:50%;display:inline-block;box-shadow:0 0 4px #c084fc;"></span>Arc Testnet</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.72rem;color:#c084fc;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;">Status</span>
            <span style="font-size:.72rem;color:#7000ff;font-family:monospace;">● Confirmed</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.72rem;color:#c084fc;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;">Gas</span>
            <span style="font-size:.72rem;color:#f3e8ff;font-family:monospace;">~0.009 USDC</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.72rem;color:#c084fc;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;">Tx Hash</span>
            ${isReal?`<a href="${ARC_EXP}/tx/${hash}" target="_blank" style="font-size:.65rem;color:#a855f7;font-family:monospace;text-decoration:none;">${shortHash} ↗</a>`:`<a href="${ARC_EXP}/address/${userAddr}" target="_blank" style="font-size:.65rem;color:#a855f7;font-family:monospace;text-decoration:none;">${shortHash} ↗</a>`}
          </div>
        </div>

        <!-- Divider -->
        <div style="border-top:1px dashed rgba(168,85,247,.25);margin:16px 0;"></div>

        <!-- Powered by -->
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:.65rem;color:#c084fc;font-family:monospace;letter-spacing:.1em;text-transform:uppercase;">Powered by</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:6px;">
            <span style="font-size:.72rem;color:#c084fc;font-weight:600;">Circle USDC</span>
            <span style="color:#c084fc;">·</span>
            <span style="font-size:.72rem;color:#c084fc;font-weight:600;">Arc Network</span>
            <span style="color:#c084fc;">·</span>
            <span style="font-size:.72rem;color:#c084fc;font-weight:600;">NAN Wallet</span>
          </div>
        </div>

        <!-- Buttons -->
        <div style="display:flex;gap:8px;">
          <button onclick="downloadReceipt()" style="flex:1;padding:10px;background:rgba(112,0,255,.12);border:1px solid rgba(168,85,247,.35);border-radius:10px;color:#c084fc;font-family:'Inter',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;">⬇ Save Image</button>
          <button onclick="shareReceiptX()" style="flex:1;padding:10px;background:#000;border:1px solid #1a1a1a;border-radius:10px;color:#fff;font-family:'Inter',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;">𝕏 Post</button>
          <button onclick="document.getElementById('receiptModal').remove()" style="flex:1;padding:10px;background:#7000ff;border:none;border-radius:10px;color:#f3e8ff;font-family:'Inter',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;">Done ✓</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

function shareReceiptX(){
  const msg=document.getElementById('successMsg').textContent;
  const hash=lastTxHash||'';
  const explorerUrl=hash?ARC_EXP+'/tx/'+hash:'https://testnet.arcscan.app';
  const text=`Just sent ${msg} on @arc_io Testnet using NAN Wallet! ⚡\n\n🔗 ${explorerUrl}\n\nBuilt with @circle USDC — the stablecoin-native L1\n\n#Arc #USDC #DeFi #NAN #Web3`;
  window.open('https://x.com/intent/tweet?text='+encodeURIComponent(text),'_blank');
}

function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function downloadReceipt(){
  const msg=document.getElementById('successMsg').textContent;
  const hash=lastTxHash||'';
  const shortHash=hash?hash.slice(0,18)+'...':'-';
  const now=new Date().toLocaleString();

  const canvas=document.createElement('canvas');
  canvas.width=600;canvas.height=400;
  const ctx=canvas.getContext('2d');

  // Background gradient
  const bg=ctx.createLinearGradient(0,0,600,400);
  bg.addColorStop(0,'#111111');bg.addColorStop(0.5,'#111111');bg.addColorStop(1,'#111111');
  ctx.fillStyle=bg;ctx.fillRect(0,0,600,400);

  // Purple glow
  const glow=ctx.createRadialGradient(550,50,0,550,50,200);
  glow.addColorStop(0,'rgba(168,85,247,0.3)');glow.addColorStop(1,'rgba(168,85,247,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,600,400);

  // Border
  ctx.strokeStyle='rgba(168,85,247,0.5)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.roundRect(10,10,580,380,16);ctx.stroke();

  // NAN logo - rounded square like the brand
  ctx.fillStyle='#a855f7';
  roundRect(ctx,28,28,44,44,10);ctx.fill();
  // NAN network icon - 3 dots + lines
  ctx.fillStyle='#f3e8ff';
  ctx.beginPath();ctx.arc(42,50,3.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(58,42,3.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(58,58,3.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#f3e8ff';ctx.lineWidth=1.5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(45.5,50);ctx.lineTo(54.5,43.5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(45.5,50);ctx.lineTo(54.5,56.5);ctx.stroke();

  // NAN title
  ctx.fillStyle='#f3e8ff';ctx.font='bold 20px Inter, sans-serif';
  ctx.textAlign='left';ctx.fillText('NAN WALLET',82,45);
  ctx.fillStyle='#c084fc';ctx.font='11px JetBrains Mono, monospace';
  ctx.fillText('ARC TESTNET',82,63);

  // Date
  ctx.fillStyle='#c084fc';ctx.font='10px JetBrains Mono, monospace';
  ctx.textAlign='right';ctx.fillText(now,580,45);

  // Check circle
  ctx.fillStyle='rgba(112,0,255,0.15)';
  ctx.beginPath();ctx.arc(300,155,45,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(112,0,255,0.4)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(300,155,45,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#7000ff';ctx.font='36px sans-serif';
  ctx.textAlign='center';ctx.fillText('✓',300,168);

  // Transaction confirmed
  ctx.fillStyle='#f3e8ff';ctx.font='bold 22px Inter, sans-serif';
  ctx.textAlign='center';ctx.fillText('Transaction Confirmed',300,225);
  ctx.fillStyle='#c084fc';ctx.font='14px Inter, sans-serif';
  ctx.fillText(msg,300,250);

  // Divider
  ctx.strokeStyle='rgba(168,85,247,0.2)';ctx.lineWidth=1;
  ctx.setLineDash([5,5]);
  ctx.beginPath();ctx.moveTo(40,268);ctx.lineTo(560,268);ctx.stroke();
  ctx.setLineDash([]);

  // Details
  const details=[
    ['Network','Arc Testnet'],
    ['Status','Confirmed ✓'],
    ['Gas','~0.009 USDC'],
    ['Tx Hash',shortHash],
  ];
  details.forEach(([label,value],i)=>{
    const y=290+i*22;
    ctx.fillStyle='#c084fc';ctx.font='11px JetBrains Mono, monospace';
    ctx.textAlign='left';ctx.fillText(label.toUpperCase(),40,y);
    ctx.fillStyle=label==='Status'?'#7000ff':'#f3e8ff';
    ctx.textAlign='right';ctx.fillText(value,560,y);
  });

  // Footer
  ctx.fillStyle='rgba(168,85,247,0.15)';ctx.fillRect(0,360,600,40);
  ctx.fillStyle='#c084fc';ctx.font='11px Inter, sans-serif';
  ctx.textAlign='center';ctx.fillText('nanarc.xyz  ·  Powered by Circle USDC  ·  Arc Network',300,385);

  // Download
  const link=document.createElement('a');
  link.download='nan-receipt-'+Date.now()+'.png';
  link.href=canvas.toDataURL('image/png');
  link.click();
  toast('✓ Receipt image saved! Share it on 𝕏','success',4000);
}
function resetSend(){
  document.getElementById('successCard').classList.remove('show');
  const _sc=document.getElementById('sendCard')||document.getElementById('tab-send');if(_sc)_sc.style.display='block';
  document.getElementById('recipInput').value='';document.getElementById('amtInput').value='';
  hideRes();resolvedTo=null;lastResolvedInput='';lastTxHash=null;
  validateSend();document.getElementById('page-send').scrollTop=0;
}
function setSendTab(tab){
  const sendBtn=document.getElementById('tab-send-btn');
  const recvBtn=document.getElementById('tab-recv-btn');
  const title=document.getElementById('sendPageTitle');
  if(tab==='send'){
    if(sendBtn){sendBtn.style.background='var(--accent)';sendBtn.style.color='#fff';}
    if(recvBtn){recvBtn.style.background='none';recvBtn.style.color='var(--text3)';}
    if(title) title.textContent='Send';
  } else {
    if(recvBtn){recvBtn.style.background='var(--accent)';recvBtn.style.color='#fff';}
    if(sendBtn){sendBtn.style.background='none';sendBtn.style.color='var(--text3)';}
    if(title) title.textContent='Receive';
  }
  // original logic below:
  _setSendTabOrig(tab);
}
function _setSendTabOrig(tab){
  document.getElementById('tab-send').style.display=tab==='send'?'block':'none';
  document.getElementById('tab-recv').style.display=tab==='receive'?'block':'none';
  document.getElementById('tab-send-btn').classList.toggle('active',tab==='send');
  document.getElementById('tab-recv-btn').classList.toggle('active',tab==='receive');
}

// ═══════════════════════════════════════════
// SWAP
// ═══════════════════════════════════════════
const hasSwap=()=>typeof PERMIT2_ADDR!=='undefined'&&PERMIT2_ADDR.length===42;
let _quoteTimer=null,_quoteCache={};
function calcSwap(){
  const amt=parseFloat(document.getElementById('swapFrom').value)||0;
  const rate=swapFlipped?(1/FX):FX;
  const out=(amt*rate*0.999).toFixed(6);
  document.getElementById('swapTo').value=amt>0?out:'';
  document.getElementById('swapFromUSD').textContent=swapFlipped?(amt*(1/FX)).toFixed(2):amt.toFixed(2);
  document.getElementById('swapToUSD').textContent=swapFlipped?parseFloat(out).toFixed(2):(parseFloat(out)*(1/FX)).toFixed(2);
}
async function _fetchAppKitQuote(amt){
  const tokenIn=swapFlipped?'EURC':'USDC';
  const tokenOut=swapFlipped?'USDC':'EURC';
  const key=`${tokenIn}-${tokenOut}-${amt}`;
  if(_quoteCache[key]&&Date.now()-_quoteCache[key].ts<10000){_applyQuote(_quoteCache[key].q);return;}
  try{
    const r=await fetch('https://nan-production.up.railway.app/api/appkit/swap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'swapQuote',tokenIn,tokenOut,amountIn:amt.toFixed(6)})});
    const d=await r.json();
    if(d.success&&d.amountOut){_quoteCache[key]={q:d,ts:Date.now()};_applyQuote(d);}
  }catch(e){console.log('[quote]',e.message);}
}
function _applyQuote(q){
  if(!q)return;
  document.getElementById('swapTo').value=parseFloat(q.amountOut).toFixed(6);
  const feeStr=q.fees?.length?' · Fee: '+q.fees.map(f=>f.amount+' '+f.token).join(', '):'';
  const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const el=document.getElementById('swapRate');
  if(el)el.innerHTML=`1 ${q.tokenIn} ≈ ${parseFloat(q.rate).toFixed(4)} ${q.tokenOut}${feeStr} &nbsp;·&nbsp; <span style="color:var(--success);font-size:.65rem;">● App Kit ${t}</span>`;
}
function flipSwap(){
  swapFlipped=!swapFlipped;
  _quoteCache={};
  const USDC_LOGO='data:image/png;base64,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';
  const EURC_LOGO='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QA/wD/AP+gvaeTAAAAB3RJTUUH5wwTFgMEdCLc8gAAViNJREFUeNrtvXecHNWZqP2cquo8Oc8oxxFCQqAIkog2wdiAARuM47Jr7A3e9eV+Rtjedbj22hcDdx02r8N6sfEabDBrYxOMMSAkJIRQBo3yjGY0OXburqrz/XG6hQgKM90zVT3qh98Iaaan+tTpOu95zxsFRVxL87oXkVgIDASGkBKBRCBE5hUCREoX6LWgrZSSS5DycmAeYKuXCD9g5DAMGynjgIZgsxA8bGGvF8guAWGkxwSpXiklgBSakJK0BAvQaLl3rdNTWeQk5PJgFBlv/K+iR25C+nbpWFUrgHcB53L8c5MgPUKCD6gGahCiDvXvzKpEz3EUAiF8gADOlZJPaug3AAnABGmf8FoLeAHBE0Lva9NGrretqn90ehaLnAKR+yWK5IPmdVsAaoB3IWUDapFL1GfkB84DuQrEDKfHehp2Ai8CHUDyhHswEaIL+APQ13LvCqfHWYSiAJhwFqx7GSHw27asRdKEEJkdWgJiEULciZRzAI/TY80zaYQ4iJTfBrn7+KMnpSWRh9OeVJ9u6/aBb61xepxnFUUBMM7MW/cSUthCsw1DIIIAQjBXSnkLkk8gRJA3PgcNpb7nqra7FQulFWSPDRIpYwj+rxTyV0Jqw0iJFDJma7YppJD7773I6TFPaoo2gAlAIr3AauCrQKmU+EDUIKhzemwTjA4E3/QdIUqBzwkpbgdMoB/4phRyk5Ai6fSAJztFDSDPNN/1MkAjcDWwGAigBO0M4DLA6/QYXU4KeA5oRQmEiBByPbAR6N977yqnxzepKAqAHFmwbjMotX2WlGI+asHPAj6Istj7nB5jgRMF1gNPA53AsBBsF4JeKTH33rvS6fEVNEUBMAaaP7c5+9c6oBQhaoSQt0gpPgQ0OT2+Sc5+IfiulGxAiCFgBBgAKHoWRk9RAJwhypgn0WxNE1LoCCGR8hvAxxBCACHU+XayGvDcggmEgSRCdAMPIOX3AAHSwqq1MY4Vg4/OkKIR8AyRSGzN8mq2diHwV0AJQpyHOu8XmTgMoBIAKWuAvwSuRHkXvoo2sh2j1+kxFgxFDeAUZM73fmCxlGI5MBXkOSCuoyg83YYJ/DdwAGgXgmeBdijaCU5FUQC8hbl3bwDAFGnNawXqBWKlEPI6KcV7gQanx1fkjDgI/BewVSK3p/R4lyE9NkAx0OjNFAVAhsxurwEBKYVPCrtSSHEbiL9F7fY6xfkqFGyURmCD/IYU8udCav1CEEO5GWVRK1AU1dg3U4Ny331ASK0JKEcdAYoUFhrH4y3EZ4QUH0dpBd9D5SmEnR6gWzird7Ssum8Ly++xfFeD+BgwH5VOW1z4k4sIsA3oAPlQWk8+qUk9AWf3seCsFQCZiL0S4FqQU0FchYreKzL5eQrkk0ja1N+Jttx/dkYYnnUCILPwG1CupGnAf1IM3jk7kfIwQnwa5S0YBLpa7ju7bANnhQBYsO7l7F91VbSGrwGfQRmKyikG75ytWMAwyhb2T8CXM8WWLICzwVB4NhkBg8AFwCdRqn6Z0wMq4jg6UJX5++0oTfAHKFtBzOnBTQSTXgPIqPwrgVuB2cAlvPGhFylyIgPAC8Ah4CHg5cl+JJiUAiCj8mtAuZTMBD4F/LnT4ypSUPwb8M+Wlt4vkSmBkJPRWzDpBEBmx/cCTUKwSko+CxTLyhQZC09LYX9VSK0d6AGSk00jmFQCILP4Qan5/4Yy8FVR9OkXGRtRoC/z/79AHQ+YTEJAc3oA48DNwDeBZpRRp7j4i4yVEKqS0wLUM3Wz0wPKNwWvAWSKc1QC70OIAHAjcI3T4yoyKXkKeBgheoHngZFCL0JS0AIgo/KXAVcj5T9lmmIUKTKeJBFiD1J+DVW7cLiQjwQFKQBOOOsD/BnwHZSffzIeaYq4C4kKFEoA/wv4YfYHhSgICj0Q6POoijAlTg+kyFmDQK2bEuArQC1wj9ODyuVmCoa5d2/A1FKax/LXa1L/GCp6a4HT4ypyVrMXFT34b0C00LSAghEAC9ZtRkCFDc1ILgfxWYoVeoq4g3bga0LwvBC0SUmiUPIIXC8AMk0zBYhSgXW5lOITwHspNtgo4i6SwL8Kwc+lZA+q/oDr7QKuFgDNd70MmgZSeoEvIOWtKL9swO1jL3LWIVGL/lXgQeDHCJHGtnFzrQH3GwFtuxH4BvBuVAlu94+5yNmIAEqB5UAdUl6QcRV2OT2w0w3alWRcffOAP0VZ+ovpu0UKBylHEOJfgB8B+916FHCdADjBxz8FlcX3ZafHNBFIQBUrkQgEwnWfTI73J1VzFTL3Nslu71R8DfgPoAPcZxNw1eeQWfwCdca/D7XznxXomsCjCzQBKVNi2tLpIeUVQxN4DYEtIW1JrEl2f6fhn5HyLlTwkHSTTcCN5+kS4F+A65weyHgiJdiZ+mSWDc2Nfi47p4Jp1T4efaWP1ztipE0bTXOVjB41li3xGhoLpgS5aXkNR/uTPPf6EC2dcfRM3KYmJp/G8xY+hOoSfScZ74BbcM20Z3b/mcBdwC2oGv2TCpnZ/VKmzTlNQW5cXkNZ0EAAtaUe5tQHqAjq7G6PcaA7zssHR3h+77DTw86Ja5dUsXJOGQ0VXhZPDTIUszjYHac3nMaWkp7hNI9v7+dAdxyvoWHowj0PZX7pAx5GabZH3HIUcMVcZxb/HODjwDomUQqvlGBJiZTg92isnF1KedBg0dQQH7qojpBXe8fdL2na/GJzL19/rE1FQTh9I6O9b8C2JffdNof3L6t+x9fYtqQvYvKrV/rY3R6lP2Kyoy1CIm2jCdC0SScMEsC9wAPAQTcIAUePACcY/KqAO4C7nZ6QfJHR7vF5BKV+D2UBnaoSD5+7dhrnTg2e9vd9hkZ50MCSEr0AJYAAvIaG1zj5wDVNUFfm4dNXNJIyJa8cDvNPvz/GYDTNUMxkJG5hWmoiJ8kRwY8yauto2rea120JAziZUuyYAGhetwUsC3Tdi5T3AR91bBbyjBAcV2XnNwa5cVkNVy+uBAHlATeaXfKLlOAxBHPrA1QEz+x+PYZg2awSvvexOQD8cksfj27ppXMo9SYtapLwEaRMCOQ9Nrq5YN1m9t7rjGHQ2adR1yuBvwGuYBKE9lq2JJG2uWBGCX991RR8Ho2ygE5ThY+aUo/Tw5tQlAYgjhv6zuT1PkPDV6p+4foLqlk+q4SRuMXR/iQ/3djNvs44Po9GgdtFAWYi5TUIuVPDfAYHS5A7IgBUYo9VJhGXSCluBaY7NQG5IiXHXVrLZ5cyryHA8lmlvGthRcFb8PMxN2PdtZsqvTRVerElDMdMSvw6f3xtiO1tEY4NptC1grcRnCuluF0IOoVg54J1LyedSCCacAEw9+4N+M0gcT12Dqpr63QKsJBH1sjlNTQaKrzMqvVz04oaVs8ro6bk7NrtxxNNQGXI4OYVNcytD/DUrgF2H41yoCfOYMTEtCV6YQraCuByKTkCDEvJPicGMeECQJM6UT3SoEntcuB9FKjqb2gCn1djRo2fK86t4KOr6ynPuPSKjA+LpwVZNDXIUMzkn39/jI0HRugZTpNIWxRoXFE58BdS8jrCbG++a1Os5b4LJ3QAEy4AhNQQ8AmUv7/gFr+UKmpvRo2Pj62p5+LmcgJeZbEvzI2ocNAyMcSVIYNPX9HI7Zc28MzuIf7jj50MRdPYFJyzBFSA0N8jjTLg/ol+8wkTABmXnx9VR+1PKLD2XFJCIm0zs9bPR1bXM6fOz+JpIerKiur+RKMJQX252juuOa+SypDBjrYIT+wYoGs4hc+jFZogqEX1rDSa73r5O0BiomIEJkQAZBZ/Fapk9x2oHn0FgZRg2pISv85500NcvbiKW1bVUurXJ8Y3rfJnChJNjL//vrHCy7VLqlg4JUh1iYdn9gyy91iMtCUxtIIKMW5GrY1e4FfNd708MBFCYNwFQPO6LSCEH9u+GPgHCiit15bg1QVz6v3MrFFGvnefWzmhYyigB/hNSCCWso8H8ownXkMwvyHA/IYA06p9PLy5l8Fomra+JClLFtLRbDZqjRwDnmm+6+X0eAuBiTkCSHklQnwZKU8fAucyZtT6+c5H5tBU6cXQJ/5JKkQLtxBgWpL9XXEGY9aEvvfViyu5YmEFXUMp/teDB9nfFaPAVCg/8GlU0tD68X6z8Xe/KWdwI1Keh+rH7nosW2Jakovnl/PND85kZq2fkE/HZ0yctzKWtBmImE5PxZiRKA1qosP3/B6NUr/OzFo/3/zgTFbMLiOWtAvJS+BBBcbNnYg3G7cF2XzXy9SsuQPUuf/2zA25WhRbtgo3XTqzlPcsqeKGZdWsnFPmyC781K4BHn2lj67hlNPTMiYEShNIpG3KAgYzayc2v0vXBA3lXqpCBj6vRiRhMRg1VTESd5+rBMozUAKEa9bcsbdmzR30b/z++MzTeFw0Y/TzAWuALwKXj8vo84hpSUoDOpc0V3Dj8hpuWFbDwikTe2IZiVtsb4vS2pfgoc29PP/6MB4Hjh355PXOONGkRU2ph56RNKWBidWkZtX6mVHjx2sIQj6dvnCaeKog6izMRtXAPAR01ay5wxoPIZD3WViw7mVsG4RgJvA74JxxnqickVIl71yyoJxv3Tqb0oA+PpNzkvceiZvE0zavHolw7+NH6Y+ksWxZSGrrKRFCxflPrfLx11dN4bxpIYI+bcISo7KnkHDC4u6HDvHC3mFMSxaKgfU14EoQx9BitHzr0rxefFw+AU2jElglZWFY/NOW5OYVNdz5nqmU+PUJO6dICSMJi/ufaOfFlmFsG3rDavEXYAbwSbElxNM2R/oSfPPXbWgCLjungi9cN/2U6cL5IrvQS/w6X7t5Jt9+op2fb+qdkPfOA16wg9gVIJJ5v3jeBUBG2s4HPouLq/pkd4XSgM4tK2u5cXkNtROUsXegO87G/SPsbIuSNG22HglzbDCFoQl0vaB812dE9nbSpqRjIIlpS9LmIINRE0MXXDS3jAvnljKl0jeu49CEqrx0+6UNlPh1HtzYQzqjCbh4yhtBux9t5CtI7458XzyvNoDM2X8pKqrpOpRF03VYtsTn0ZhTH+C951fzwZW1zKkPjOt7DkZNnt49yPbWCM+9PswTOwdZ3zLEvq44SdPGo2uFnt12WkSmyo+hCyIJiz0dMV4/FqM/YjIQMekcStEbNqku8YyrnaC6xENjhRcp1ecSTVpY0rUxF15UeXwdOFaz5o7OfNoC8nLLC9apyj6ahsey+CbwuYmfpzPDlhDwaMxvDPCeJVV8cKWK6hsvsmf89S3DfPM3R+kdUVb9s6AQ5hmTTakOeDXOmRLkk5c2smqOKp02ngzFTH74fBd/2DPI0f4kKdP1doF7fFbwCzFjBIAD967O+YJ5efIz7j5dSlahdn7Xduw1dMGyWaV86MI6blhaQ9A3Pmd+O5M7MBQ3eWhzH/f/7ijRhIUQorj430JWM5AS+sMmT+8ZosSnM68hiC0Zt5Ben6Fx/vQQQhP0jKTpj6adnorTsS+tJ3ZoaGGBkP0bfpDzBfMiYjPnaQMVy/xuJ2foZNgSPLrgxuU1XHt+FYumhAh4x0/N7B5O8a3Hj9LWn6Q/kiaSsAoyqm8ikWR6BqRtHnyph6d2DTKt2seX3z+DylD+tQEhIOjTuf6CanyGxkObe9h7LJb1YrmRmzSpm6gqWnmxCOasAWTO/fWoar43AdU5XXAcMC1JWcDg6vMq+cCKGpZMLyHkGx+1f33LMD/d0MPzLcM8s3uQw70JoikLo7j4z4isNjAUMznan6RrOEV/xGRPRwxdEzRV5j+DPODVqC31EPIZdA+nGIqbGTeh6z4zP6rvYAh4vWb1HdH+jblpAfkSq7Wo3b/W2fl5O7YtKQ8arJxdyocuqmNhUxC/J/87v21Ldh6N8uDGHh7f3o9X1/DoYly1jMmMoQkMryCesvnZxh6CPo22vgSGDudNC6naAHmkvtzLuxdVkDJtfrW1jwNdcZKmKxOJpgF/BTwC9OR6sZy2wczu7wUWAx9EtfRyFZomWDm7jI+sqWfZzFJ8eV78KVMyHLfoGEzx1V+1sn7vMEGvjl5YqaiuRQgV1mtL2NMRo7UvwfLZpRiaQNNEXgVB0KszvyFI2pJ0j6QZdKtNQIgkQjyNEEdzjRAc0+zNW/cSoMp7oRb+94A6XFjbb0FTkA9dqPz8XiP/hSJ2HI3y85d62Ho4wrEhZUl24a4xKciWG59R7eOm5bVctbiSadX5jR2QEmIpi59s6OHhzT0cG3RlLoaN2v3/BvgFQo2x5d61o77QmI4AqssrJIyIx2+GmkA0OD0jbxtjpg3XlYsquWpx1bj4lX+6sYfHXumjYzBJfzgNQhQX/zgiMo1TD3QneGhzD8/tHeI9S6r48EV1eX2PkE/nxmXVxFMW//j0MTzuC87SgAagFGlAYNOYLzSmI0Dt6k+hoWHY3htAfBSXVfgxLYnP0Lh5RQ03La9hWlV+d4lE2ua32wd44MVuXjkcxrSlCuJx10MyKRGZKkP9UZOD3XH6w2mCXpX+m896DSV+naqQgWVLDnTHlWbnPukuEPYg5tSDmFPHlDE4agGwYN1mMq7sGhDrcFkXX8tWWX1r5pVz93XTmFmTvzTUaNKiZyTN7vYY9zzexoHuOAGv7kZr8aRHEwKvodE5lGJvZ4z5jUFCPh3D0PLmbq0p9XDu1BCHexP0htMk03bejY850gxYaS35G1tYsnrtJxnY8KNRXWDUAiAT9BMEPgLiPaizv2vQhODycyq459bZVOe5Pv/21ig/fKGL//hjJwNRs+jXdwG6JogmLJ7fOwRC0FjhzWvMQIlf59IFFezrjnOkN+H07b4T7RraNg19UKDZow0OGrUAqF79KUCUgfgqsAwXGf5SpuTDq+u485qpVJV48qaSSwmH+xI8trWf320fIJKwCrlW56RDAsm05EBPnIBHZ06dn0AeIzy9hkZzY4BYymZXe9Rtgn+qQMwSiCcEIjHaY8CoFu/cuzfQ0vQbpLArUME/rijxJaV6CM6dGmTl7DIaK7x5W/zxtM1LB0b48XoVMz4SN92ePXbWka0+1DuS5tev9vHAhm4O9yRI56kgqRAwtz7AoqlBqkpc19w1CMxhjAb9US3g2tWfpjo8f6pAfBzEpaiyRY4iUfH9jRVeblpRy5r55XlLIukcSvHUrkF+t2OA514boms4XfAVeiYzuiboCafpGEyRtiTDcZOKoEFJnpK9JOJ4XYOJqHY8CkxgEGRrzZrRRQee8cwsWLeZ8vIRkUz6LwfxXVRvM8fJRvq9Z0kVH1hZy/Q8+YVNS/L49gG+8sgRDvUmSJkF24PurMLQBLGkzY62CBv2jTCnLsCCpvyUdmso9zKlysfBniS94TRpy3aLAbgUuBzEH4XUD1Ws/RMGNvzwjH5xVEeAkZGyZULI63CJ6g9KA2go9/CxNfV5dfc989ogT+0amPQ5+pMVKSGesnjlUJhdR6N5u+78hiBfumE6M6p9bivZpknkVFNLlY7miT3jhZwx/r0fxJ+jVH/H10XStLmkuYK73zedOfWBvOzQaUvy0oEwj2zpY+vhsNtUvSKjpGs4hWVLplb5KQ/oObvxhFCegfmNQbqG0hzuTbhFM9QEYoGG1iPQdp6pMfC0h+W5d28AYMDXoVXFpzTgojJfJX6dBY0Bls7MjymiP5LmqV2DvLB3mO1tEcKJyZ/FlzWgvvHvN7Lgssa1QqZrOM2zrw1hS7i4uZzls0opC+SmwHp0wcrZpfxPlRdbusYfpKHqcMwYzS+dVgBotgGgVcabLgGWOH2XWdKWZMXsUpbOLM3bNY/2p/j+H7s4NpRUlYInyeKXksyD+karwexz6zM0vMYbRUo8uiBtyeM9EZPpN9p7CfHG7xdKUROvIWgfSPLIll5a+xJMr/ZRFshPztq5U0IsnBJif1fMLVoAwEKQ5zfftXknYLfct+qULz6tAMicJ3TgTuB6p+8O1INYFtC5aXkNVy3OT6++cNziUE+coVgaKZk0Mf0StQj8Hh1Df+N0aGdq4NWXe6kq8eDTBR5DUBowGImZmLYkkrDoHEoRTliZRf/G70aTVt7cbOONrgmSacnOtiitfUlm1uQnbPjDq+sI+jS+8T9tRJLWRDdBOumwQIRQSXr26V48Gn+ZKwp8WrakMmTwjQ/OYs388rxd9/d7Bvn2k+0k0vakWPxZA5VpSc6fXsKtF9ZyTlMQjy6Oq/0C5ULNCoZs6q1lqxdYEtKWjWW/oeQKAQMRk28/2cHOoxFSpl0Y2oCAaMri64+1Er5mCu9flp+T7NWLqyjx6XzxF0cYjKbdogmccdWUUwqA5nVbACqB25FyvtN3JaVSWadU+ZhXHyCYh2IbUsJDm3v42cYeOgZThVIr/h2xbEksZbOgMcjH19YT8usgJU2VPs5pClIRNPKyUFPVkr++qomekTQCaB9M8q/PHCOStPDqwo1JM8ePPW39CX70fBeJtM2tq+pyno+AV2NGjd9t8SH1QsgrgPUL1m2O7b335MeAM9EAKoGPA7OcvivTlkyt8vH+ZTVU5CHeO5ayefa1IR54sZs97bGCrN4jJViZLX1ufYCpVT5Wzy/jtovqxk2YeQ3B6nlv9HzpHk4xFDU50pegpTPG0YGkKnPuqjWRHbvGjrYopt1Nid/gioUVOW8kFSGD9y+r4dev9tE5nHKD7WimlOJjwC4gdqoXntQcumDdZryelGZZ+jxUnf/8Wdty4IKZJax777Sco7ssW/L6sRhfeOgwR3qT41ImbLyxJfgMQU2phxk1fm5YWs3tlzRw+cKKCVVFS/w6a5vLWdAYxLQlg1HreD0G6cJ6+x5d0DWcYmdblCvOrcg5aSzk01k+q4SXDoxwuC/phmNAAFWe72Ehtd6Ki08eGHTKbTSd9swTQt4ipQg5fUe2VJFYc+sDeUnJ3NcV56cbeoinLAzXhDWNDl2DOXUB3ndBNe89v4rKkOGYKqoJmFPv585rpnLlokp+sqGHlw+OMBQ1cYdt7M0YGVvHq0ciVIWMnIWAEIL6ci8VAYNo0nKD0DMkcpalpY4IKU6qBZz00c8E/qwB8XnUMcDRLTKRtnnv+dXccUUj5YHczrK9YeUbfmxrH9GkhUv8uKNC1wR/emkjf3llE+fPKKGuzJNRu527F00og2JlyMPCKUEuO6eCw30JDnTH8U5gR+AzQSAwbcnh3gSzagPMqPHndGQRQjC/IUh/JM2u9qgbjgEeIWnWpLZXSHHkZPkBpztIh4AmJ+9CAroQXHt+Fe9bWk1TRe5loTfuH+HXr/bTHymszL6sP7/Ub/ChC2u5aXkNs+vyV/AkXwS8GnPqAsypg09d1ojP0Hju9SFXHbOEUL0KD3TF+emL3WgCrlhYMebraQJm1PhYObuU7a1Rjg4knHYLehFiJVI2nGq3fJsAWLBuc2aC7BLb1hyv9SclSCG57oJq1szLrdmwZUv2dcV5etcA21ojrnogz2TsHl0wpdzHhXPL+PjF9TSU579Gfr7J2iNiSYsdbVEk0jVVdYRQm8uzrw9RETKYXednerUvp/FdMLOUKxYm+K8Xu9xh/xDCo9ue4xG9B7615k0/PukKkFJcBlzt8PAxNFWaKR9VXpKm5NtPdvDsa8N5Lw8+3pQFDObWB3j/8hq+9P4ZBbH4s1yyoJyv3DSD6TU+dE24zibg92i8fHCEB9Z3kzJzG92cOj9rm8soDxgu8YLI+Wk9OU2TeraK95t42yqQUmS/LsHhNl+mJakt8/J3N8xg0dTc7ZBpUzISN0mmrYJS+3VN8NHVdfzfW2bx8bX1BaW5ZJnfEOSfPj6XBY1B0jkusnyjCegJpznQE89Lht+Maj83r6ihLKiKijqL+BtNancIqSHk25+bUz1JIRxO+7Wl8jkvmhrKuYNv+0CSr/9PK4d64m4w0JwxmqbcbOdNL+HcqaG8BfNMNB5dMKc+wOevm8YlC8qJpU4bpTqhCGDvsRhff6yVjsHc2u41VHi5KhMh6Pj6V+77k7bre5NePffuDZikhS1Mw2sFHA39lYDPI6gMGfhyDGgJJyy2HArz2+39pEzptqitk5K2JOUBnQ+sqGV+o+uaLo0aQxOsmlNGNKkW/0v7R8AlRlhdEwxETB7f1s9ViyupL/OOOV/Ak6lQZegC15133sKbNADNNtBtw/BY/rU4HPln25KmCh9r5pXnfF5//ViMJ3cOqn5zBbL7W7akLKCzen45n7ysIe+9Dd6KRGlcli3Hfde6YmEFf3JxPeVBt5yTFVqm3diL+0Y4lGMFYK8hWDK9hJoyz/FMTAeZAvI8kEbzXZvffM8n/kOo/4JCVfx19vxvS86bFuJTlzfmHPV3oDvO+pZh0pYsGPVZE4IrF1Vyzy2zqMhTjcMs2Si9WNJSXymboajJscEkrX1Jjg0mGYqZxFI2saRFPGXn/SxbV+7lwnml+D2aG9RkQNkCUmmbhzb1sO1IJKdrlQcMvnLjdC6cU+aGrMkbQHxPZQm+eQG805MlUOd/Rwn5dMpDRs7x+fs647zWHiNt2W4I0TwjTEvyZ5c18Im1DXkraHki0aTF83uHeXBj93FfdXb3z7qujIy1Xgh1pv305Y2ck6faegDz6gN8dHU9mw+EGYqZ49K6bSxIIJGy6R5JMRK3xlw8JNtiLODNX6OSHHnHKl7HBcDcuzfS0rSZ+R0ryoTUHK19bEuVZnnD0uqcr/Xs60Ns2D/sGt/zqZCohbegKciqOWU0VebP1ZdI2+zrirPpwAjtA0n2d8XZfDCMlPL4Y3HiDEmUpiCAsqABUgmCaVU+blhaQ8ifW6NVjy5Y2BTkzmum8F/ru9nXFXeNbUbXBH/YM0RtqYfbcuw7eNPyGmIpiyd3DrrquJPl+ELXLI35R1fUCSFu5BRWw4nAsiVLZ5ZwwYyxl/qypaQvbLLtSJhDPYmCyPSzbYnQBdecV8WCxvztth2DSV4+GOaVw2Ge3jVIz0gajyEy2YKnfyoTKZvfbOsnmbZpbgwipYrNOG96KKfIzBK/zi2rann1SITDLuq6IwS8eiTMtEzmqd87dmG3ck4pB7rj/G7HgNObUBVSXgfy8ebPbRpsuf9C4AQbQOb8PwvJF4CpTo1SACU+PWfLfyJl84c9g3QMplyzs5yKbH+DhnIvly0oz9vuH01a/PrVfj7/8GEefaWPcMIi4NVGZQzNlgor8et0DCb55q9bufOnB3hyxwDxdG7uPIFg4ZQQc+oCrrEFgEobHoya7GiLkDZzu0ctU2jFYWYB94KYf6LQf2NbVG1XdYTI39YzSrL93y9bWMGc+tzcXtGkzaNb+jjQHUcvAAFgWpKZNX7uft80puapt4EtJd95soN/f7YTJHmLTbekOqZ9/7kufvDHrpw8XULAbRfWcs2SSmwXSQBDF2xri/DdpzsYiVs5XSvo16kp9Th/BBAilFnjx7/1TnqxY8OUUuLVNd67pCong1M4brH1cJiuYdUhxul5P1MqggZLZ5RQ4svd8NcfSfP1x9p4fHu/qumXx0nIlg/rj6R5eHOPqomXGPsi8Xk0Sny6q1zmAkikLLqGUsdLi4+V1XPL+Mt3NWU8Ho7e5dueAlcdjGVmiFMqvTmFux4dSPKrrX1EkpYbVK/TYtmSC2aU8IGVtcrgliPtA0l+9HwXj23to3sc25lpIjPXr/Tx0w3ddA+nRn0NKeGVw2G2tUac3yHfgqELIgmLn7/US2vf2KMDa0o9nD8jhJ6px+gwOujMX/cckBEAzeteBo1qYBEOCgVNE4S8es415XrDada3jBBNFkaBz5QpWTarhJtX1OS8WPvCaZ7cOcAPn+8imrTHvcah36MRjpv84++PjTp4xrYlPSNpfraxl2dfG3KdsNaEYDhu8vDLvbT152qkFLigx5QAWaXpcY+GSiPX3vi+eDdC3AmMb8jZSbAllPp1Fk8LEcpBBbZtiCQsNM0dIaZnQolfJ+jNj7//wY093PvbdmACS5sLFWEZjltYZ2AvS6RtIgmLrpE0j23tY09HlGSOxsRxuzWUt+RM7utUeHVVMchraE5qATqIC6TtnZ5d+krfVCNqAJpxaN2YlmRalY+/vmpKTq6lx7b28f3nurBs90f9qWIn8DdXTeHmFbmVqbYlHOqN09afIG3aE5rurAlIWTbfevwo4YR12nt5cGMPj27pw2Oo+PvBaNppF9nJEWp5rG8ZprHSy8Ix2qZm1Pj5xgdn8qVfHmHX0ahT1ae9SPmnUnIIOAhvjgQ0cHDTtKXEa2hMqxp7EgZA20CSls5YYZT3liAFzK7zU1OaW+6VZUsee6WfVw5H8DgQVSclHOqJ8+P1XSRNm1tX1R5X6QeiJjvbIry0f4SUJdl8MMyuoxE8ukDXhKv7CgjUs/nH14eY3xgYswDwGoK5dX4CXk0FXzmz1DSEmIYqGAqMrjHIuOL3aJQG9NxLqEiQODbBo0II5W/OdfeLJi027BvhmT2DtPYlHKsX4PNobG+NkLYkIZ+OLlStvM6hFJsPjvD83mGSpo1XFzkd8yYaKeFIb4KuodEbOd+EEMeFnlswmte9oLYhB50wli2ZVetn6YwS9DE+u1LCUMxkOG66wdhyRuP1eTQWTQ1RVZKbHO4aTnPvb4/SPuB8efOQT+dIb4K7f37oeG6Bpgk0oY4KgQIsZgIqkMe0JKYlx6yhagLOaQpxuDdBz0jaFQZqDXSEf5fAIeMfKAGwZn45t1/agHeMEsC0JT/d2M36luG89H2biHuuChl88frpLJmeW3fjtGkTG4eMvVzRhNrt3Krej+peNNjfrfInxjrPPkPjs1c38e5zKzFztSrmgeZ1L2IIPILUohk4WP1Xoo4AuewOtpS81h7jaH/SFZL1dFhSYtmSioCe03i3t0b4wfNdyvPhspXmsuHkhC4ErxwKUxXysGJ2yZjU+BMzBB0W1RoyAFoETUoppCXfA1zi1Gje2qN+LJiWJJK0SOYYtz0R2BIqgx7OnRrCm6NK3Nqf5Pm9w6RNe1ItOLchBPRF0hwdSOQnZ8FZCbAEEV+KXSIMVKTsJcBip0bj0XOr1JM0VaprNOnsLqgejNN/smlLMr06yA3LanI2hqVNm3hSxT1kWmDm8Y7e6BpcREUGCiEIJyx8hjbmedEETjdQvRh4HdierTDpqEm2ocKXkxtsMGryyJY+OodSYzYi5oNgpvjD6QI9kqbN7Do/7z63IufIP1tCaUDPmD3zHPAvpWoRbtquytRzCk0IBqNpXjowwuXnVIy5UG3AqxPy6aSc01anZ7p9C0fdgNlAmOvOr+LSBeVjvk40abHpwAiDUdMRF0u2dPeViyqZXu07rZHItKC5KZBzfcKDPQkMXfDxtfXj4PcQpC2bziH1wA/F0m6IY3cUQxO09iX54XNdLM6hUvWUKi+z6/y0HIs5dxIQwg+uiANQFXBm1Y69xZWVCf/NxUUzVhJpm9oyD39z1RSWzSyl1K+fNuNLSmUMylW1rgwZLJ9VyrKZuXkR3hmBLSWRhMUVCyv4wfOd7D4aLQgPy3ghhPq8O4eSOdX5WzOvnK6hFPs6Y9jSsYgVAWAgTAPpbEG2XKv1CDJx7xM8k0nTZkaNnxuX1XDT8tzP86OlKmRQlYeOSadj4ZQgsZTFQ1ovu9oiTp9fHSVbLzGXGagr8zC3PkD+bTajx5BQKlyhCYwdy5742D8J1Jd5+cCKGv76qilOT8G4omuCW1bVMhBJs+1IhAKorjZuZJesC0p95+FWLM2QiAYB7msxe4akTJVSOtFGKgH81bubuG11bkUjCwn3O1gnBilVsxlXNP8cOzrCDmk62sWckBwwoZxQinqsHO5N8OzrQ6RMGzEBn4ZE7YhTq3yq+8tZoA5LqZKsOodSBRFkNd5YtqStP8lw3HR6KLngs9GqNCm5BZjmxAiEUPHwuVju2/oTvLB3iJQ5Mem/liXRBHxwZS3n5qFhaSFgS8kT2wfYfGDkrD7/g3IFJk3JkzsHOdida5GQPETAjZ1KDW2ZhmQVUOXECLKhkblYlofjJm39SZX/P87jtWxJRcjgXedWct0F1TTmULegUEikbTYdCPPEjgH2dcXPeg1ACEiZNhv2DXN0YOxlwlyQJzFFSN5voI52Ey6HpFSRVVUlRk7FKwRiwqL/hBAsnVnCNz44s6DSWceKbUv2Hovxt784zLEh5zMN3YRpyZySr3RNEPTpjMRNp+IrGqXkfRpCBHAgElBKScCrcdmCChrL3b+TWrZkQWOQi5srXNPGarx56UCYLz3SSm84XRAp1hNJrmvWk6mJoAnh1ClAgAqc1XAgFsFGZQCumlNKXZmjncjPCCmhqdJLc2OgkC2/Z8xg1GR3e5T9XbGCKK9WaNSWeVg5WzVHddCjKB3byqQEjyaYVu0riLZdQkD7YJLXOmJnRUjsxv0jPLd3yOlhTFrqyjxcOLcsIwCce6AcDQASQhRG7T7UmW1XWxRdCJbOKGFBUwDvJDsKqNBfm75wmqd2DbBp/8iEFhc9myj1G8ypC+BxrleAAJztAlxoBLwae4/F+OxPD/APH5nDwqYg1miLGQiBVxdj9nxIqaofmZbElvnzfGiaqoG/+WCYHz7Xxf6uWHHxjyO6BpUhHU1zzBOoI0Sg4AXARJfBkkDnUIqvPtpKyDfK85sAj6bx0TV1XLW4ckzvPxw32bBvhMe399MfSaPn6XAuhLJsD8ctOgaTmLZ0XYWhyYYQOG1cdTYdOB/kkpU1FrJ+8F1Ho+rsdqafn1RHnhK/znuWjG3xA8RTNvu742w5FKZnOJX3xqdapslHcfGPP5adrWDtHAUtACw7N19sLijbxegWiRCq+1EutgNbSlKmxKOLnKMoi+TGZDAGF/QhT+ax5XXhUFzwbsHK8eHTNcePAIUtAFKWLKj23/nibLvfIuNHQQuAs1EDMDRVA7Co+hfJBwVtA3ALMpPWbMtTmHQyRsCkmZvdImukS5uSRNqekBJdAjB07axPBJqMFLQAyLabchIplUGwscJHedA4ZWCHEFAaMKgrG3vug8cQNFZ4WTqrhBkRX97cgCe9P1T2W2tfknDcPOvTgU9kMsxEQQsAryHwGMLRVqC2lNSV+fjzdzWxel4ZFUED+xQ7vMg0iBwr5QGDqxZXcsXCirwGAp1ksFi2pHs4zTd+3cqGfcPj+W4Fx2Q4hhW0ANA14Wg4ri2hLGBwzpQgF80to77cO+6CSAiVSZZrP4HR4DM0rr+gmnjSZuuR8KR48IsoCtoICDhaksuyJYunhfj42npqSj2TQiV8JzyG4JIF5SyeFio2CJk82EiZLGgNAJwrypi2JMtmlnLT8hpWzi51ehrGFQFUl3ioLjHOOq/LeBJJWON/jDs5NpDOVgRyoKq+CoMstAcq281oaqWPP7usgavHGNNfSEhgOGYyGDOLdQHyRDhhcaQ302DEuTkVBlLGEcLHBNsDBOoMXWjllW1bUlni4Us3zmDNvDKnhzMhmJbk20928Pi2/rOiCvJEEElYHOlLYDoXyCYBy7GKQNniinvaowxGC6O8spSqitGMGh9z6/wFUcgkV1KmZG9njJbOGIPRogaQL7qGUrzQMkwsZTuVeNUpBI9rCDYDAxP97kII4imb5/cO0zWccmICRo0lJdOq/dx2UR3VOXQzLiR6w2ke3txLW3/C0c7L7iO3s6s6AiQwLdspoXoEwQOaEDwMHJ3odxcCkmnJjrYo/ZF0TteaiJJKtoSmCh+XnVPBe8+vHnNn2EKiezjNUzsH+d32AXpG0kX33wloIreS3patIjkdtIH1S9IbNQt7PdA70e+ueqypScitvDITUqXXsiXLZ5Vww9Kqs2IhWLZkfcsQ33nqKNGkVTz7n4AmlFcklyNgVgA4225NaJpAdgG5tjgZE1JCLGVh5iAA6su9LJlRMu611TQBR/oSbGuLnjLSb7Lwkw09/PMznSTTk/9eR4OdsQPdtKKGc5qCY76OxPFENgupxTQBYcARK5yUyqqey0TMqQtw1aJKfONcXVUTgoPdCbYcHJnwKkQTiW1L2geT7GiL0NqXKBr93oKUEo+hsWpOGVMqfU4PJ6dbAd02kIaJU41fxfE/xkxdmYcl0zMawHgOVSjDzc62KA9t7qWuzENF0FBlnUd5LVtKqkIGs+sCOd19z0ianpEUSTMbypHD/aHagLUPJDncl2BfZ7xo9DsJmoC6Us+EhmOPFwUfCQgQ8mnH+7aPJ15D0Naf5J7ftFFV4mF6tY+KkDFqzSNlSlbOKeXTl+fWZKRnJMVzrw+z82gk551aE4KBqMm2IxGklOiaOCtsHWNBUDhxK6dAgksEQCFFA2Y/+KGoSThujqkleTJtUxbQMS07p2SmRVNDvH4sxkvPjmTGldtTKaXqfDwZnu7xQpKfjSYXu1de7kISB8gGd1vOfeiSQ70JesNpanPwrU/0fNpSYplq/KPFtCT7uuL8cksf119QTUkOLkUBxFK26jSbh0ezuPZPjZRKg8tl03p+7zCPbulD4lQUoNgphNwESC3z1LwA7JrwYaCWz4Z9w2xrjYz5OoYuqC3z4DNGfx7PafxibF+GLmgfSPK7HQNEk1ZOY6gIGcys9avz6BjHc+JXkZOTtd2smV+Wk9DeeyzG9taIk5rvJjT5B4SUmhBCCl08DjznxEikhO1tUVo642O+Rqlf54qFFdSUeArCRSeEigVv7UvkrArOrgtw9eJKvIZwtMfciUiptJy0pUqYpy2JmaO3xw1YNjRV+vjgyloqQ2M/PUeTFiOJ3AR/jhzECu23SUoNkNLmKNDm1GgiCZNYDjthVYmH2y6qY0qV1+Gz1ZmjC4EuBINREzuHlTG71s8NS90TmSgl+DyqbFl9uZf6co/6e5kXn8fpIti5YduSiqDO8lmlOQUBKcHoaAiQJUUcgY6x996VNN/1MjjWoiz3d9aEKpXl0YWTdzEqdE3QH0nzd788whevn55TTYGgV2dufYBwwiKatB2tk5hI2yybVcbXbp6JRxfYUlUwau1L8q9/OMae9iixlGPx73lA5Gd+XfCctty71h1egHxsC7qmogLLgwbxAnjAhFB9DfZ1xhmO5RaHVVvm4Y7LG/n7x9rY3R51LEsxbUmuXlzJxy+uZ3Zd4E0LpTJk8NmrpzAUM/nNtgGe2T1IPGVlbCLurzhsS8mCpiAXN5fnpzCqS+7XFQJAE4KOwSR7O2PMqw+Myf+sa4JrzquiZyTNi/uGMdwuAY4jiadyUwf9Ho3ls0r5wMoaAPZ1xSbchy9QtpiL5pWxdn75234e8umsyGg5QZ/OtCof0aTFYNTk5UMjdA+nXN1u3bJhyfQSrlxUMea5NW3JlkNh9nfFXdN78cQZT2S+Jlw50TXB9tYIj23txxxjmK2uCa5YWMH5M0oc6xc4WrJekO2tEfZ2xnK6lkcXfHxtPVcsrJjw+5CZsszLZ5cyryFw2tevmVfGXe+dyt+9fzr/+z1TuHpxFY0VPlcbCW0paSj3MKPGP2ZtJW1KHnixh5cOjExIP4d3ug1U4t9g9hsnCoD9wIvAhJsnNQEdgyn2tEfJNcxe1TZzh3Q9E6SEn27s4bfbcy/JoGsiY3jzTegRSAhVHfkTa+vfcfc/GYYmmFrl4+/eP52PrqlzteDWNZGz6i+lZDiWVkdUZ24jBfyrEDyffT4yAkAC9iaQP828aMKxbeUuynUb0LWJLZmdDxJpO29W4esuqOJTlzeoRKsJWE9pS1Jf7uXz75vO4mmhUf++rqlOR2PJqZgohIAFjUGmV+ee/KPa2Tl2pxaw8dgxDma/oQSAdx9gjAAHcCgxSNcEfeE0v97Wz1AORrErFlbwoYvq0LXxTQ7KJz5DsPlAmJ+91EPKzG3U5UGDKxdV8pkrp1Di13O+3qlImZKgV2PR1BAXN6umKJMNKZWN6tolVayaM/YakL3hND98oZuOwZRT6j+onT7c2Ah7710JZARAyzc+RqY4sGNrRtcE3cMpHtrUS1947BWCFk4JHj8Hu/lM+dZ739Ya4cGNPRzsieecbtxY4eVja+t4/7Jq6so84+JzNm1Jc2OAG5bV8J4llTnFIXQPp+gcSrnScyNR5/9zp4ZorBh7S7fekTQPbuymazjlqiSrdzK7OrJshFCqcMdgMpPeOnY8uqDEr1NIJwGvIRiKmjy2tT/nEmmg4iL+7oYZXHt+FSG/ji3z88FK1GdVU+Lho2vq+cJ103nvkmp8nrFZ8G0Jv90xwPqW4XHvcziWezU0qCvz4vfkeP5HZmpfOLorpXmLhv/Gp6YOJxZSRp0cYXYoudBQ7uWqRZWU+PWcouwmkmxg0NO7BhiI5Kc+iybg/3vPVD59eRO2lGTSBXJDKnffZ66cwrvPrVCp2DlcVErJnvYoB7vjrtMALFtSU+rhf18zlebGsVf/Uffp9N2QRIj9CPGmiT6ut9Ws/iRADEQrQpwPONDxQuWg15d5aarwURoYm1oZ8ulUhgyefW2IwZhZMPXsbKlKpadMm8YKH7VluVce9hoajRVeVs0p45IFFezuiHJsUKnbUnJay7YyzipjX02Zh3edW8FfvKuJtfPLqSnxjCkdOks0afHbHQM8s3vIlUVHU6akqsTDp9/VSEP52NX/1zpi/PemXl7riGHZjiVdtSL4CvAqkOzf8H3ghECglvsvpPmulweB3wCfBWZN9AhVrwDJEzsGmNcQoKlybJPuNQTzG4Jcu6SaJ3YOcGww6bqH653QhDpb/2HPECtml7JwSm67TpZp1T6mVftImZKRuMnRftWR5nBvgk0HR0ikbLS3aPC2rQKMptf4uWBGCRVBg4YKL4unhVg2syQv8zkYtXh8ez/tA0knDWPviGVL5tYHuGFZNdUluQni/V1xntk9SMq5EuAAQ0jrj+AbQaw4/k1XmW0FauJ3tUfpHMrNGxnyaXxsbR2He+O09iUKQgCA2pX7I2m2HYmweGqIOfWnD6w5U7yGChYCGElYbD0cxqMLhuNv15JMW1Lq17lgRgk3Lq+lscKT1znsj6RZ3zLMa+0xIi6sOpwyJedOCXLHZY1jtm9kiSYt+sJpFwg5HTBpufeNUJ83CwB1UJFAL0KYOCQgNAFpKzdDoK4JGitUyS7nJ370Y//5pl5iKZuv3DiDkE/P+85R6tO5eH45q+aUId+hQaUy9gl0DTzjEKu/+WCY+37bRixlu27xg9J+Svw6PkPLyW4iJSRMx3NTTKTs5R3swG86ZGfsABawDSGmAgucGK1AEI5bGLrIqfSyEDAUs+gdSdMzknb6QxgVtlTVefd1xVk9ryzvCT5CqPO/Rxd4DQ3PW768hoZHV0E6+Z63x7b288Pnu47bItyGLeGGpdXcdlEdDTm4/gD+44+d/PdLvUQSDhbdgl+D/ALQCdj9G39w/Adveqpa7r8QhGYitN3AMadGKwTs6YixvW3sVYKyXLqgnAvnlBZMnYAsuiYYiVus3zvM/b87yqEeR1o35BVbQtdwilcOh3m9I+bKxQ+QNm3mNwZYPK0k52vt64pzqMdxD8cxhLYboZkt91/4ph+4Nv0qlrRo61MZgmNNEAJVNry5MUhtqcfpD2HUeHRBPG3z8OZentw1QHeB9FA8GWnL5qldg2xvjWC5wC/2ViRK8C6aFmJW7diTfkB5czYfDNM1nHJN5t87cSoBMIxDHYNAPfz7uuP8fFNvznXzZtX5WdtcjqGJCS8emitapobgo1v6eGxrP73htBt8yqMmmbbZdTTKw5t62dMedeW5X9oSryG49cI6zp+e2+4fTlj80++PsaMt4nRuyjDQc7Ifvk0AnFAg8hHgQadGrWmCnuEUrx4Ok0jnZhA8b1qIW1fV5lTI0UmkhM6hFP/0+w6++mgrsZSj9eTGxN7OOH/7iyMc6o27N+9fqKSkRVOD1OTY/TllSvrCKRLOF6f5OsL6tgoAfPs6etuKqFlzBwCGQY9t0wC8z6mR27ba/WbXBWgo9+bkjqkIGixoDLK3M+bKoJPTzoWERFrSG05xsCfBedNKxhwoNZGYluTp3UN896l29nXFsSWurP6TMiXzGgJ8+f0zOG9aKCch1dqX4L9e7GZba4RE2nb6CPBj0La23LeKE41/Wd7m5stmCTXf9bIFjDg5ck0ThBMWj27pY2aNj3Onjj7dNEvIp7NqTinlASMTHuzCp/AUCJQfP5yweHrXIBVBg9suqqO5MX9xAvkkbUlaOuNsOxLhiZ0DvHIojM/jztJfEgh4NWbW+rlwbu4el67hFL/fNUgkYeenfNg4cjo//xCqUMisM3ht3tGEanrx0oFhukfqODfH6+maYMXsUo4NpehwYfTZmWBoAsuW/OcLXUgpufq8KsqDBs0NAdfcz0jcYltrhD/sGeLZ1wY5NpjKOZhmPEmbkvlTA6ydX56zZmhaku7hNL3hNJYtnVT/U8AOoPtULzqpDlm79g6EICIEI8AawLGtxtAE500rYUaNH38OD5KhCy6cW8ZQzGR3e7TgDIJZhFBG0pbOOL/bMUBLZ5wVc0rVwytxRBBIlOfGtODFfcPc/fPD7DoaJZayXH/c8ns0bl5Zy6cub8x5rLvbYzy5U30mubdszYlekJ/A6N2A9NO/4Yfv+KJT7uqmSZeuswEHvQFCqPDgf/lDBxJ5PJQ1l+t9ZHU9PkPjH3/fgS0L7TDwBmlLkrIku9uj/NWPD1AZMvjw6jquXVI14WMxLcm/P9vFSweG6QuniSQtkO7uNiRRWub/umYqNy2vycs1Xz40whM7B9Tu7+zt2SAGMeslvj0nfdFJNYC+Dd+ndu0dAF5gFdAI5J6eNkaGYiaaBrWlXpoqvTkZVkI+lR//WkeMkbjpZIZWTmQ9NqYl6QmrVuEdAyk6BpOYlqSuzDvuLqjBqMmmAyM88GI3v989yL6uOEMxteu7eU5tqfJFLmku58blNUyv8ed0PdOWPLa1n0df6edIr+PJZx3Az4BngWjLPe896QvP5Fw/BDwATIGcj+Fjxmdo7G6P8fTuQZbPKs25d/3MGh/XL63mX545RixlOu2rzYnskcCWsPVImEM9CfZ3JTjSlyDk0wn5dGZU+5jXMLaS6ycSS9kc7k1wqCeecXWl2XIozPqWYSxbYugC9/smlND0GhrXLa1mRo6LH5SW+vSuQXYdjeI1HH+WjgjBA0IweLqYkVMKgJb7VtJ818sjwMPAR3BQAAgBvSOqcvCRvgSzsg0xx0h9uZfrLqhm4/5hXjkUIZ62nHbX5D5HKEEZS1n8Yc8gz+wZxLYlTZVeLl9YwQdW1hLwaG8KJMqqwSfu2LatchHe+vDomuDYUJLHtw3w1K4BhmPW8c8g2/S0ELBsSYlf+fuXzizNOT4kbUkO9yToj6RzbvmeJ0akpEVK0i33rTzlC0dj2Xc8DtWja+w9FuOLDx/m/g/PZmaOkrum1MP9t83hS788wlO7BgrXGPAOiEz1H00X9IVNfv1qP0/vGnzTLUpUw4ugV6M0YOAzNGypGpVEkxZp6+3lqy2povqSpo3HKKQC7G9gS1gzr5xv3jIrL4VMj/YnufPBgxzpS+BxfvHbSHnG7vszuHsJKkPwqyCiwIedurNs3cBjgynSeah2qwnVXvtz106lImTw4MZufM5/gHnHlpJoUhJJWMfzQbNNSaSEIU1ghNNkWytatsTKaAFvRaDShLV8lBdzgETa5iOr6/jkZY1UhIy83INpS/ojJmlTukEL+jFwL3BGdeVOq/v0b/wB/Rt/IGvWfKoLOAe4wtn7UxMcS9k0VXqpzTFkU6CEQMinMRK3ae1LKM+A459jfhFClbd+61dW9bel0gZs+41jwTu9XhPuNu6dDNuWCCH4wMpaPnxRHc2Nwbws/r2dMR7c2MNrHTFMNxiTpXwE+FXL/e8c+fdWRrvddaLaiDvW21gTEE/Z/GRDN49s6aOtP5mX654/vYSPrFYPhtcovKShXFE7+xtHh8mEZUv8Xo0Vs0v5s0sbxtTA5J040pvg4c29/GRDN/G0s12ZAQsptwB7R/NLZywAMg/HH4AfcIbqxXghhDq3/vdLPfx0Q3fuFwR8HtXg4raL6phaObGttYqMH9kU3/kNQT571RSm5aG7T5YfvdDFf63vzrlqUJ5II/h7Dqx8BHHmyWKj0gAsi1ZgKw5qACcSS1o5pwqfSGXI4F3nVnDJOeU0lHsLpqR4kZNj2ZKFTUFuWVnLgqZgTpGkb76uSiByUT9DCSLCvFfAc+aFdM7Y/6ECgz4JMAKiAzgfKHXyjoWA4bhFX9hkyfTcMriy1/N7NKZW+RjOVM9NpO2cSl8XcQ7LljQ3Brl+aQ3XLFE5E/n4KCNJi+893cEfXxsimnSF+/gY8BWQz4GMtnzr0jP+xVE5QPs3/oCaNZ+KAoeBW4A6J+9aE6qZRltfkrKAwZQqL0Fvbj5dTQiqQh7K/Do20B8xiSUt5CQ0DE5WskbcOXUBblhaw1WLKpmSp2NdbzjNr17p4ycv9nBsKIkn14i0/NAKrAPR03LfqlH94lidoCZwEJgN5Kd4/RjxGRpDMZPvPd2hAl7OqcjLB71sVinlQQOPofH7XYP0jKSw3WDlLXJKbAleXTC9xsf1S2u49vwqplXl59yfMm02HRjhH37XTsqy3eIyDqMMf2Oyy436DqSwkcIOS2F/ERVr7DhSQjxlsWHfMPu6Ynm77tz6ALdfXM+7zq2godzrtJW3yBmgCZhTH+ATaxv44MqavC1+gE0Hw/zqlb7jJdNdwhNg/SVYw2MxzY1aA7CFhY1tAi0e6et3+u7hjYSYx7cPMKcukHMftxOpL/Ny+8UNzK7189jWfra1Ol7jrchJSJo2Vy2q4iOr61g0NURFML9ZCYe647xyOKJiCpy+2TeIgN4LKnR/tIx6hgY2/Ii61X+BLg0JxIEyoNnpWQAIxy2GYiaGLpjfEMiLcUbTBGUBg/pyL1MqfWiaoKVTaRku2gXOamwpsSXcuqqOj6yuY+lMVS4tX5+PZUse3dLPI1v6aB9IuqnKzyPAj1A2Ofo3fn/UFxibDSCwSf0/tvYphDkFuN7pmQBVMmvLoTBJ06a21MOK2aV5cfsIoToO1y320lDhJWnabNg3QizlvpZWZxumLQl5dS5uLuf2SxuYl8dWaqCCzjYdGOHH67vYdTSa9wYtOfI74Nmx7PxZxnY3iaXqS5igjBBduCQ2wO/VONAV5xv/08aejtx6CrxtsgQsmR7i/9w0k+WzSvB7tLMuYtBN2FK5bZfPLuHrH5iZ98WftiS7jkb58iNHaOmMuWnxW0h5GCkHcq0RP6ZDUv+GH9G/4UfZCsIHgO2o6sGOV6jM7seRpMXWwxFm1vjzku99IgGvzpr55RztT/JaR8wNCSBnHUKorMRrzqvi6x+YRWUo/41fnnt9mL/75RH6wmkQrsp8HESIP0HK3yOEfSYx/ycjJytJ/8bvU7P6kxZq4X8cIfITZJ0HLKmqCJUGdBorfDm3eD4RIVRVodl1fiqCHjoGUwzHzUwJLBc9JpMQK5PUs2J2GR9bW8fNK2qZUePP++J/cd8wP9/Uy47WiNsWfxTYBPwUIfpb7h+d3/+t5KvSbw/wz8CfAdMcnZ4M2Q9sfcswtaUeqksMKkOevLryVOKQRl2Zh6MDSX67fYCOgSReQzhdEmrSYdmSlCmZUunl+qU1LJtVwvkzSnLOBn0rpi15rSPGr1/tZ8uhsBu1u1aU4a8vHxfL2U9yPDpQiE3APGAOkF+dO5fxRUxiKVWlxWcISv16Xj/UypDBkuklXDinjJ6RNIm0ja4JoikbJmFm3USTrVnQWOFlerWfyxdW8rlrpzG/IUDIl183Xzxls7s9xkObenlx/wgDkbQbwnxPpA94HPgeEMvF+JclLzNYvfbPQEgphb1ToNUBFzg6TSfeoCboC6fZ3hrlUG+Cc6eG8nocyKJpgovmlrFkeghbQlt/krTlCrtoQaMJqAgY3HphHZ+5cgrvPb8Kzzhl3+1uj/L5hw+zrTVMNGm58Tj374j03wIJkPRv/GHOF8zLEcBWDgA7aJa1JvVYT67Xyze2DUNRk51HoxzsjjOtypd3i262c885TUEaK3ysba7gK48c5mh/Eo/hzo44bsaWqk33tGofX7t5FoumBSkPGOMWhHWgO85TuwbpHkqRSEu3fV4SIfqAVqQvwiXL1Xfvy/3CedEABjb8kIENP6Ri7Z8ADGa+fQEuaT+eFeRp06Y3bKJrUFvmzbsKCaowZolfp6HcS2OFl2WzStGFauIBFGxFnYlAykyvA1Ny1eJKPramnncvquSS5nLKA8a42FWkhG2tEX61tZ9nXxtiOGbiwsZxFkL8M/AwgoGWz3yf/v/Oz4XzugL6N36fmjV3dKLSE2fjcC+BExGZendH+hIMxUziKZt4yqa+3Dsuhh6PLmhuDLJkegnlQdWHoCJkMBQ1jzeMLAoChS0laUtSGtC5cI46Rt12YR3XL62muTE4brt+PGXzQsswj27t4/nXh2gfTCLcZfEHiKDO/f8MvJ6Pc/+J5P1e5617CVvYXl3qy4TUfgbMnIhZGguz6wLcc+ssFk4JjntEXzRpsfVIhAfWd7O7I0osaZPMtD0/WwVBNoalxK8T8GosnhriM1c2Ma8hMO6ltdOWZEdbhP/vZ4fc3idyP3AZalMdU7z/qci7Dly95pMY0mNlHutbgdrxn6PRI6VKHukYSDK9xk9jhXdc38+jazRWeLliYQW1ZV76wmkGomk0TXA2BhMKoXo+egzBlYsq+ct3NfGRNXU0VvjGzch3Ii/tH+Grj7bSNZw6Ph6X0o1qzBPJ9+KHcTrqNN/1MoAP1VLs68Al4zc/Ody8gKBXZ3q1j4+uqefmFfnpD3c6+sJpOgZTDMVMIgmL7z/XySuHwngzxkK3t9UaC1IqH7uUqjT38lklfPqKJkr8OlMqlb1kPGwy78QjW/r48fouDnTF3S58XwC+BGwGkuMhAMal5Xemo1AycwPfAdLAu8ZtmsaIlBBOKNU8217rPUuqxj3dt6bUQ00mgMWyJbaUXNJcTtqSHOlLsHH/CJGENWnSjlOmpCKo865zK6kv9wKSeQ1BrjmvckIDplKm5ImdAzy4sZudbVH8XlcU8zwZf0Cd+1+A/Kv+Wcb9/jPawO3Ad4GSiXjPsZBI2yxoDPK3N0ynuTFIZWj8XE4nI56y2d0R5Rebe3mxZZiecLrgsw1NS1Jb5uHycyr400sbmFGTW0u3sRBL2XQNpWjpjPEPT7RzoDuOL0/FQccBC2gH7gYeGq+Fn2Xcda5MwlApyiMweyLecywYumAoZvJCyzBeQ1AZNAj59Ql9WD26oKHcy7vPraQvkmZPe8ztKupp8Xk0bl1Vx9/eMJ2qEs+EC7RE2mZ7W4QHN/Twwxe66Aun3WzwA4gLwX1C8IQQjPRtGH2O/2iYKAHQiYoPeD/KNuBKJCrD7EB3gj++PkwkYbFyzsQWPs5236krU0bJ3e1Rp6clJ+68ZiqfuLiegFd3xK7xnac6+JdnjrGvK3a8NZqrl78qsnOfZbFL01Q17vFk3AVAJjbABgZQXYUWAZXj/b5j4XgqccKiL5KmcyhFz0iKKZU+Svz6hFaCqSn10BtO88yeoYLs1iOlsm98YGUt500vmdD3DidUKvhPNnTzux0DtPYlMDNZhC6fx0Moo98LmkZ8vNV/mCB1PCME4sDrgBeVMTgxJvcxkO2Z1x8x2dcVV2GptiTo03NuJT0aDvYkeGrHQEEGDWkaVIY8XLW4kjl1E1cm4uhAkudfH+I32wb4zbZ+BqKm6tzj/glsQWX5fR8IT8Tih3HyArzj3akbSjTf9fI9qBLG63BpjEAWryGIp20eeLGbLYfD3LC0mqsWV1FX6pmQc6Q4/kdhIaWyZ8yo9lEaGH+BaWeqQg/FVBv0R7b0cmxQ+fcLxJPSjVr4/2+iFn6WCRMAb2CDsP8FaYyg0hpdaxOAN9bf/q44//BEBy+2jPD566bTVOHF7xVuSxd1FfL4H+P4HhKGYyavHAnzn893sbs95qZ2XWdCHLgL+JkTbz7hvpCW+y4EacSE4DngX4FhJ258tKRNSSxpsfVImC/+4jCf/s99bNg34vSwznpe3DfMZx44wHef7GB3e4xYysIsHAHQD/JLEvmsRFoTvfuDIxrA8U7DrcDPpGQmKta5womxjGbMhi6IJm1eOTSCLVVXoiN9CebWB1g2sxSvUdQGJoKkabO+ZZjWviSbDoywYd8wuiYwMl8FQhfwKynkL9tDLceaYnMdGYQjAmDvvStZsG5zEtgjBP8ppagF1jgyA6NEExxPVHn2tSG2t0W4aG4ZkYTFwilBako9bmkZNekYiVt0D6c41JvgwY3dbDsSIZay89bxdwIJA88LwfcFWuf06Dly770Tv/uDQwIgi40R07B+hxDnIWUTMMvJ8YwWryGIJiye2TPIi/uGue2iOq5eXMm0Kj8eQxDy6W4rLFFw2LYknLSwbNh2JMJjW/t5oWWIlGkfNzYWGBJYL4R8EMROsC0ny2Y4JgD23ruK5nVbkAgTIb6LbevA3yGEo0JptGRr1sVTNo9s6eOJHQM0lHtZ01zORy6qozJUULfjOgaiJv/yh2Nsb43QF1bJU4lsGrXTgxs9NkK0A78RWE9JNAsETu3+4LAG0HLvCgCaP7c5jEp5tIEv4qKiomdC9kEciKTptaF7OEVvOM3eYzEWNAZZM7+MC2ZMbDCMG1DxC2Nbpi/uG2bDvhHa+hPsaIvSO5LGtCW6JgpVqzIzi/9+4Nc2Rir7/DuJK7anlvtX0XzXy4eBnwANwC24OFDoZOiaQNdUT4LWvgQHu+Nsb43Q2p+gpTOG36NzcXPZ6IqSFkDs6tsQyjffM5IilrLO+Nf6wmle3DdCIm3x4r4RNu4bZjBmYmgqMKsA1f0sFirK7z+BR4FONyx+cIkAgOMpxEeAz6Majl4HlDs9rrEgyAoDQW84zf+80sdjr/RRVeIBprFwSgjTkgS9GlOqfO/4YKctyXDcUhGABfbcC1QW4NGBJL0j6ZO+Lm1JOgaSxNM2pi3Z2Rble091MBBNI4TSICaBQdUGDiLEz8mW83bJ4gcXCYATiACfBkaAv3R6MLkiAJHRWUfiJl9/rA1NgMfQWDglyJdumEFDhQcyBi0hBGlLsmH/G+6tQkQIMISgpSvG68dizK0PYOgC21b1/4SArqE0f//rNl7riJE2bSxbEs/0VZgkmAhxFBXi+10g6fSA3orrZjpTPwBgClJ+kgI0DJ4KW6qqOEIISnw6s+r86BqsmF3KTctrqC/z8h9/7OL5vUMcG0wSTpy5Cu1Gqks8zKn3c+mCCj50YS37u+I8vm2AXe0RTBsO9ySIJC2klMd3/UlCEngV+HeE+B3QC2/YvdyCa2e7+XObQXUZ+ihCfAKVQDRpBAGoc7Jp2Vg2zKr1c8HMEsoCBi/sHaJjMIWUsuB3Q9OWeA2NWTV+Vs0ppWs4xY62KO0DSXQNDH1S9kwYAl4EHgSeBXqciPI7E1w99c3rtoAyBv4FUl4NLMSlqcS5YkuJZYOUEkOfXDkGEuXPN215PNNyEi76LN3Ac8rPzx+ByN57c2vgOZ64fkfVMPsk+v9FyB1SittRtQVdW1pszPcpBJrOZLstsneUNYpOYiQqr+VRIfgPELtAWMoG6F5c/4ksWLc5+1c/iMVS8mHgL3B5FmGRs444yC9LIX+hox+TyDTgaJDPmeB6AZBlwbqXEQK/lEyXkkuBLwNTnR5XkSLAUeBvJfL3CU+4x2sF7APfKojUlsIRAFkyXoIQ8OfAJ4EFTo+pyFnNXuAHwL8BUbca+05GwUVZZCY4Cvw/4L9Q0rdIESc4inoG/x8FuPihAAXAW7gH+D+o9MoEbre4FJkMWEAEKbuR8kvs3n2P0wPKhYI7ApxI5jhQASwXQt4kpbgRlUtQpMh4cUjAv0kpNwKvAYMt97vXzXc6CloAwHEvgR9ollKcg+pCdJXT4yoyKfk98O9C8LIQdEqJ6XYr/+koeAFwIhmN4GbgTuAiCv+IU8Qd2MBLwLeBRwrxrH8yXB8INAYeQcVd/ysqVqAeFThUpMhoCaMi+1KoOhUvOD2gfDOpNAB4U2vyarCDoN2HaklWpMiZkq3C8Evgs5l/DzBOLbqdZNIJgCwnZBWeg5R/A/x5wbXXKeIENkL0IeV/AT9GGfrGrT2300z6FZHJKlwOvA8hylHVhpqcHlcRV3IMeAghWlEGv9fclr6bbya9AABo/vxTkJ4C+kgJ0vgm6kjQAIyiNleRSUwY6AGeQJhfwCqL4Omg5Z6rnR7XuHN2WMntELx3EUgRRco7EeJbCPE60E8xeOhsxkI9AxtRRr47kSLKexepZ+Ys4KzQAE4kU2OgGihHyrmoQo3FI8HZiJSHEeLTqHj+EWB4sp71T8ZZJwCyZIyEJcC1qOKj1wA3OT2uIhPCQ8BvkTICPA1ECzmaLxfOWgFwIhlhcBXwMVRo8Vpc3quwyKgZQBn2kqhOvE+dbbv9O1EUABnmrXsJKWyPJvV5QmrfRKUZlwBTnB5bkZw4CsSAXWD9JWZTL542Wu692OlxuYLJGAmYC2lgH3A72DpoHwLuRRlLPZwtRtPCx0ZF70ngayiV3wCGix/hmylqACchcyyoA5ZI5FSBuBNY7PS4ipwRW0F+DUQE2AN0F9X9d6YoAE7B3Ls3YAtLaLZRqkvjemA2MBe4jaL25DZMVH/JQ8BB4BeAVVz4p6YoAM6Q5i/+ClKzQCTPB/FVVL5BKTAd1bOgyMRzFGgDRpByBPh7YPfZatEfC8Vd7Ewxa8EuA713J/BBACFolpKPo7wHOspzUIwuHF9SKIu+BH4uBA9ISUvmZ6bTgys0ihrAGFiw7niikVdKyoFaiZwtEN8AznN6fJOcLSD/GsQgMCgEwyih4PoS3G6kKAByZO7dG7CEKQzbE9SksRplODRAzgXx5xRgm3OX0Y3yxHSitKxjwPMUz/d5oSgA8szcuzdgainNYwWmaFK7AyUQTFQ8wbWA1+kxuhgbpd4/gyrq4kMt+O9wFobpTgRFATDONN/9PKQqQY8tAnEfQtShzq9VwCynx+cwEqW+t6Ni8eMIsQf4JnBksqfiuoGiEXC8kTqYAdBje4EPAQJhS2xxPXAvQoR4QxALlJrrZfJFrNi8uXS7AFIIsR/kPUjrOdBtVIZe3OnBni0UNQAHyBQpqQTmI4Se+baNSkq6CCn/FCEml2tRygNScI9AHEDt+gJVfScOHAZGijv+xFMUAC4h0/vQKyXTpC3XIETtW16iAUtQiUrTcd1nJ23VEZfNqEAc680/lsdszXoybaSGDMsjC6V33mTHZQ9RkbfS/OXvqb9E3gP64FLgPUg5HyH8vP3oAKrWwVSUjSGIEhzZr9Fgn/AVQxnnOlCVc95aREUiZVwINqHJPwizYb8d+jUALV/7G6ensMgpKNoA3E5iqfq/5yjYJduA7bxJcAvA1BB2EKQtMNaAdpNErMC2Z6DsCQZCjK6dupRplPcihaa1CuQWsB+VmC8gPcmT7B0SibT0VkR23EVczf8Po6b6BM0e79sAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjMtMTItMTlUMjA6MDM6MDQrMDI6MDAq9aCuAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDIzLTEyLTE5VDIwOjAzOjA0KzAyOjAwW6gYEgAAAABJRU5ErkJggg==';
  const fromLbl=document.getElementById('fromTokenLabel');
  const toLbl=document.getElementById('toTokenLabel');
  const fromLogo=document.getElementById('fromTokenLogo');
  const toLogo=document.getElementById('toTokenLogo');
  if(fromLbl) fromLbl.textContent=swapFlipped?'EURC':'USDC';
  if(toLbl) toLbl.textContent=swapFlipped?'USDC':'EURC';
  if(fromLogo) fromLogo.src=swapFlipped?EURC_LOGO:USDC_LOGO;
  if(toLogo) toLogo.src=swapFlipped?USDC_LOGO:EURC_LOGO;
  document.getElementById('swapFrom').value='';document.getElementById('swapTo').value='';
  document.getElementById('swapFromBal').textContent=swapFlipped?parseFloat(eurcBal).toFixed(2):parseFloat(usdcBal).toFixed(2);
  document.getElementById('swapToBal').textContent=swapFlipped?parseFloat(usdcBal).toFixed(2):parseFloat(eurcBal).toFixed(2);
  updateSwapRateDisplay();
}
﻿async function doSwap(){
  if(!userAddr){toast('Connect wallet first','error');return;}
  if(!onArcNetwork&&!isCircleWallet){toast('Switch to Arc Testnet first','error');return;}
  const fromAmt=parseFloat(document.getElementById('swapFrom').value);
  if(!fromAmt||fromAmt<=0){toast('Enter an amount','error');return;}
  const isUSDCtoEURC=!swapFlipped;
  const tokenIn=isUSDCtoEURC?'USDC':'EURC';
  const tokenOut=isUSDCtoEURC?'EURC':'USDC';
  const fromBal=parseFloat(isUSDCtoEURC?usdcBal:eurcBal);
  if(fromAmt>fromBal){toast('Insufficient '+tokenIn+' balance','error');return;}
  const btn=document.getElementById('swapBtn');
  btn.innerHTML='<span class="spinner"></span>Swapping...';btn.disabled=true;
  if(isCircleWallet&&circleWalletId){
    try{
      // Fire approve + swap without waiting between — Arc confirms in <1s
      // Approve runs in background, swap submits immediately after
      btn.innerHTML='<span class="spinner"></span>Submitting swap…';
      const approveKey='nan_sw_approved_'+circleWalletId+'_'+(isUSDCtoEURC?'u':'e');
      const alreadyApproved=sessionStorage.getItem(approveKey);
      if(!alreadyApproved){
        // Fire approve without waiting
        fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
            contractAddress:isUSDCtoEURC?USDC_ADDR:EURC_ADDR,
            functionSignature:'approve(address,uint256)',
            params:[SWAP_CONTRACT,'115792089237316195423570985008687907853269984665640564039457584007913129639935']})})
          .then(()=>sessionStorage.setItem(approveKey,'1'))
          .catch(()=>{});
        // Wait 2s for Arc to confirm approve (sub-second finality + Circle processing)
        await new Promise(r=>setTimeout(r,2000));
      }
      // Submit swap — non-blocking, Arc confirms in <1s
      const swapRes=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
          contractAddress:SWAP_CONTRACT,
          functionSignature:isUSDCtoEURC?'swapUSDCtoEURC(uint256)':'swapEURCtoUSDC(uint256)',
          params:[Math.floor(fromAmt*1_000_000).toString()]})});
      const d=await swapRes.json();
      if(!d.success)throw new Error(d.error||'Swap failed');
      const amtOut=(fromAmt*(isUSDCtoEURC?FX:(1/FX))*0.999).toFixed(4);
      toast('✓ Swapped '+fromAmt.toFixed(2)+' '+tokenIn+' → '+amtOut+' '+tokenOut+'!','success',6000);
      const _swapTxId=d.txHash||d.transactionId||'pending';
      addTx({hash:_swapTxId,to:SWAP_CONTRACT,toRaw:'NANSwap',amount:fromAmt.toFixed(6),fromToken:tokenIn,toToken:tokenOut,outAmount:amtOut,type:'swap',token:tokenIn,ts:Date.now(),confirmed:true,source:'swap'});
      setTimeout(()=>resolveCircleTxHash(_swapTxId),2000);
      document.getElementById('swapFrom').value='';document.getElementById('swapTo').value='';
      btn.innerHTML='Swap';btn.disabled=false;
      // Poll balance until it changes
      setTimeout(async()=>{
        for(let i=0;i<6;i++){
          await new Promise(r=>setTimeout(r,3000));
          await refreshBalances();
        }
      },0);
      return;
    }catch(err){
      toast('Swap failed: '+err.message.slice(0,120),'error',7000);
      btn.innerHTML='Swap';btn.disabled=false;return;
    }
  }
  try{
    if(signer){
      const swapContract=new ethers.Contract(SWAP_CONTRACT,SWAP_ABI,signer);
      const tokenAddr=isUSDCtoEURC?USDC_ADDR:EURC_ADDR;
      const tokenContract=new ethers.Contract(tokenAddr,ERC20_ABI,signer);
      const amtIn=ethers.parseUnits(fromAmt.toFixed(6),6);
      // Approve exact swap amount — safest, user sees exactly what they're approving
      const currentAllowance=await tokenContract.allowance(userAddr,SWAP_CONTRACT);
      if(currentAllowance<amtIn){
        btn.innerHTML='<span class="spinner"></span>Approving '+fromAmt.toFixed(2)+' '+tokenIn+'…';
        const approveTx=await tokenContract.approve(SWAP_CONTRACT,amtIn,arcGasOpts());
        await approveTx.wait(1);
        btn.innerHTML='<span class="spinner"></span>Swapping…';
      }
      const swapTx=isUSDCtoEURC?await swapContract.swapUSDCtoEURC(amtIn):await swapContract.swapEURCtoUSDC(amtIn);
      await swapTx.wait(1);
      toast('✓ Swap confirmed on Arc!','success',6000);
      addTx({hash:swapTx.hash,to:SWAP_CONTRACT,toRaw:'NANSwap',amount:fromAmt.toFixed(6),type:'out',token:tokenIn,ts:Date.now(),confirmed:true,source:'swap'});
      await refreshBalances();
      setTimeout(()=>refreshBalances(),3000);
      setTimeout(()=>refreshBalances(),8000);
      document.getElementById('swapFrom').value='';document.getElementById('swapTo').value='';
    }
  }catch(err){
    console.error('Swap error:', err);
    // Extract meaningful revert reason
    let msg = err.message || 'Unknown error';
    if(msg.includes('FAILED')) msg = 'Swap contract rejected — the contract may have insufficient liquidity. Try a smaller amount.';
    else if(msg.includes('insufficient')) msg = 'Insufficient balance or liquidity';
    else if(msg.includes('allowance')) msg = 'Approval failed — please try again';
    else msg = msg.slice(0, 120);
    toast('Swap failed: '+msg,'error',8000);
  }
  btn.innerHTML='Swap';btn.disabled=false;
}



function initBridgeUI(){
  const amtInp=document.getElementById('bridgeAmt');
  const addrInp=document.getElementById('bridgeDestAddr');
  const chainSel=document.getElementById('bridgeChainSelect');
  if(amtInp) amtInp.addEventListener('input',updateBridgeSummary);
  if(addrInp) addrInp.addEventListener('input',updateBridgeSummary);
  if(chainSel) chainSel.addEventListener('change',function(){
    document.getElementById('bridgeDestChain').value=this.value;
    updateBridgeSummary();
  });
}
function initSwapUI(){
  document.getElementById('swapModeBanner').style.display='none';
  document.getElementById('swapBtn').textContent='Swap USDC ↔ EURC';
}

// ═══════════════════════════════════════════
// BRIDGE — CCTP
// ═══════════════════════════════════════════
function setBridgeMax(){
  const max=Math.max(0,parseFloat(usdcBal)-GAS_USDC*2).toFixed(6);
  document.getElementById('bridgeAmt').value=max;
  updateBridgeSummary();
}

function toggleBridgeAddr(){
  const on=document.getElementById('bridgeAddrToggle').checked;
  document.getElementById('bridgeAddrWrap').style.display=on?'block':'none';
  const track=document.getElementById('bridgeAddrTrack');
  const knob=document.getElementById('bridgeAddrKnob');
  if(track) track.style.background=on?'rgba(112,0,255,.5)':'var(--surface)';
  if(track) track.style.borderColor=on?'var(--accent3)':'var(--border)';
  if(knob) knob.style.left=on?'21px':'3px';
  updateBridgeSummary();
}

function updateBridgeSummary(){
  const chain=document.getElementById('bridgeChainSelect')?.value||document.getElementById('bridgeDestChain')?.value||'';
  const amt=parseFloat(document.getElementById('bridgeAmt')?.value)||0;
  const addrOn=document.getElementById('bridgeAddrToggle')?.checked;
  const addr=document.getElementById('bridgeDestAddr')?.value?.trim()||'';
  const addrOk=!addrOn||(addr.length>=10);
  const NAMES={'ETH-SEPOLIA':'Ethereum Sepolia','BASE-SEPOLIA':'Base Sepolia','ARB-SEPOLIA':'Arbitrum Sepolia','OP-SEPOLIA':'OP Sepolia','AVAX-FUJI':'Avalanche Fuji','POLYGON-AMOY':'Polygon Amoy'};
  // Update ngn estimate
  const ngnEl=document.getElementById('bridgeNgnEst');
  if(ngnEl) ngnEl.textContent='≈ ₦'+(amt*fxNGN).toLocaleString('en',{maximumFractionDigits:0});
  // Update available balance
  const balEl=document.getElementById('bridgeAvailBal');
  if(balEl) balEl.textContent=(parseFloat(usdcBal)||0).toFixed(2)+' USDC';
  // Show summary if ready
  const ready=chain&&amt>0&&amt<=(parseFloat(usdcBal)||0)&&addrOk;
  const sumEl=document.getElementById('bridgeSummary');
  if(sumEl) sumEl.style.display=ready?'block':'none';
  if(ready){
    const sc=document.getElementById('bridgeSumChain');
    const sa=document.getElementById('bridgeSumAddr');
    const sm=document.getElementById('bridgeSumAmt');
    if(sc) sc.textContent=NAMES[chain]||chain;
    if(sa) sa.textContent=addrOn?(addr.slice(0,6)+'...'+addr.slice(-4)):'Your connected wallet';
    if(sm) sm.textContent=amt.toFixed(2)+' USDC';
  }
}

function toggleCCTP(){
  const panel = document.getElementById('cctpPanel');
  const arrow = document.getElementById('cctpArrow');
  const btn = document.getElementById('cctpToggleBtn');
  const open = panel.style.display === 'block';
  panel.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▾' : '▴';
}

// Chain picker for bridge
const CHAIN_OPTIONS = [
  { value:'ETH-SEPOLIA',  label:'Ethereum Sepolia',  icon:'Ξ' },
  { value:'AVAX-FUJI',    label:'Avalanche Fuji',    icon:'▲' },
  { value:'BASE-SEPOLIA', label:'Base Sepolia',      icon:'🔵' },
  { value:'ARB-SEPOLIA',  label:'Arbitrum Sepolia',  icon:'🔷' },
  { value:'OP-SEPOLIA',   label:'OP Sepolia',        icon:'🔴' },
  { value:'POLYGON-AMOY', label:'Polygon Amoy',      icon:'🟣' },
];

function openChainPicker(){
  // Remove existing picker if open
  const existing = document.getElementById('chainPickerDropdown');
  if(existing){ existing.remove(); return; }

  const btn = document.getElementById('chainPickerBtn');
  if(!btn) return;

  const dropdown = document.createElement('div');
  dropdown.id = 'chainPickerDropdown';
  dropdown.style.cssText = 'position:absolute;z-index:9999;background:#1a1a1a;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:6px;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,.6);';

  const rect = btn.getBoundingClientRect();
  dropdown.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  dropdown.style.left = rect.left + 'px';

  CHAIN_OPTIONS.forEach(chain => {
    const item = document.createElement('button');
    item.type = 'button';
    item.style.cssText = 'width:100%;background:none;border:none;color:#fff;padding:10px 12px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:.88rem;font-family:Inter,sans-serif;text-align:left;';
    item.innerHTML = '<span style="width:20px;text-align:center;">' + chain.icon + '</span><span>' + chain.label + '</span>';
    item.onmouseenter = () => item.style.background = 'rgba(168,85,247,.15)';
    item.onmouseleave = () => item.style.background = 'none';
    item.onclick = () => {
      document.getElementById('bridgeDestChain').value = chain.value;
      document.getElementById('chainPickerLabel').textContent = chain.label;
      dropdown.remove();
    };
    dropdown.appendChild(item);
  });

  document.body.appendChild(dropdown);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closePicker(e){
      if(!dropdown.contains(e.target) && e.target !== btn){
        dropdown.remove();
        document.removeEventListener('click', closePicker);
      }
    });
  }, 100);
}

async function doBridge(){
  const destChain=document.getElementById('bridgeDestChain').value;
  const destAddr=document.getElementById('bridgeDestAddr').value.trim();
  const amt=parseFloat(document.getElementById('bridgeAmt').value);
  if(!userAddr){toast('Connect wallet first','error');return;}
  if(isCircleWallet){
  if(!circleWalletAddress){toast('Wallet not ready — log in again','error');return;}
  const btn=document.getElementById('bridgeBtn');
  btn.innerHTML='<span class="spinner"></span>Bridging via App Kit…';btn.disabled=true;
  try{
    const r=await fetch('https://nan-production.up.railway.app/api/appkit/bridge',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({walletAddress:circleWalletAddress,destChain,destAddr,amount:amt.toString()})});
    const data=await r.json();
    if(!data.success)throw new Error(data.error||'Bridge failed');
    const txHash=data.burnTxHash||null;
    addTx({hash:txHash,to:destAddr,toRaw:'Bridge→'+destChain,amount:amt.toFixed(6),type:'bridge',token:'USDC',ts:Date.now(),confirmed:data.state==='success',source:'appkit-bridge',destChain});
    if(data.state==='success'){toast('✅ Bridge complete! USDC arrived on '+destChain,'success',8000);}
    else{toast('✓ Bridge submitted via App Kit — CCTP processing…','success',6000);}
    await refreshBalances();
  }catch(err){
    toast((err?.message||'Bridge failed').slice(0,140),'error',8000);
  }finally{
    btn.innerHTML='Bridge USDC via CCTP';btn.disabled=false;
  }
  return;
}if(!signer){toast('Connect MetaMask to use the bridge','error');return;}
  if(!onArcNetwork&&!isCircleWallet){toast('Switch to Arc Testnet first','error');return;}
  if(!destAddr||!ethers.isAddress(destAddr)){toast('Enter a valid destination address','error');return;}
  if(!amt||amt<=0){toast('Enter an amount','error');return;}
  await refreshBalances();
  const currentUsdc=parseFloat(usdcBal)||0;
  if(amt+GAS_USDC*2>currentUsdc){toast('Insufficient USDC — need '+(amt+GAS_USDC*2).toFixed(3)+', have '+currentUsdc.toFixed(3),'error',6000);return;}
  const destDomain=CCTP_DEST_DOMAIN[destChain];
  if(destDomain===undefined){toast('Unsupported destination chain','error');return;}
  const btn=document.getElementById('bridgeBtn');
  const statusCard=document.getElementById('bridgeStatusCard');
  const statusContent=document.getElementById('bridgeStatusContent');
  btn.innerHTML='<span class="spinner"></span>Step 1/3: Approving USDC…';btn.disabled=true;
  try{
    const amtParsed=ethers.parseUnits(amt.toFixed(USDC_DECIMALS),USDC_DECIMALS);
    const usdc=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
    const allowance=await usdc.allowance(userAddr,CCTP_TOKEN_MESSENGER);
    if(allowance<amtParsed){
      const bridgeExact=amtParsed;
      const appTx=await usdc.approve(CCTP_TOKEN_MESSENGER,bridgeExact,arcGasOpts());
      btn.innerHTML='<span class="spinner"></span>Confirming approval…';
      await appTx.wait(0);
    }
    btn.innerHTML='<span class="spinner"></span>Step 2/3: Burning USDC on Arc…';
    const mintRecipient=ethers.zeroPadValue(destAddr,32);
    const destinationCaller=ethers.zeroPadValue('0x0000000000000000000000000000000000000000',32);
    const messenger=new ethers.Contract(CCTP_TOKEN_MESSENGER,CCTP_ABI,signer);
    let burnTx=null;
    let burnTxHash=null;
    burnTx=await messenger.depositForBurn(
      amtParsed,
      destDomain,
      mintRecipient,
      USDC_ADDR,
      destinationCaller,
      1000n,
      1000,
      arcGasOpts()
    );
    burnTxHash=burnTx.hash;
    lastTxHash=burnTxHash;
    toast('✓ Burn submitted! Waiting for Circle attestation…','info',8000);
    const receipt=await burnTx.wait(1);
    addTx({hash:burnTxHash,to:destAddr,toRaw:'Bridge→'+destChain,amount:amt.toFixed(6),type:'bridge',token:'USDC',ts:Date.now(),confirmed:true,source:'cctp',destChain});

    // Get message bytes from receipt
    const messageHash='0x'+receipt.logs?.[0]?.topics?.[1]?.slice(2)||'';
    const messageBytes=receipt.logs?.[0]?.data||'';

    statusCard.style.display='block';
    statusContent.innerHTML=`<div style="font-family:'JetBrains Mono',monospace;font-size:.72rem;line-height:2;color:var(--text2);">
      <div>✅ Step 1: USDC burned on Arc</div>
      <div id="attestStatus">⏳ Step 2: Waiting for Circle attestation…</div>
      <div id="mintStatus" style="display:none;"></div>
      <div style="margin-top:6px;">Burn tx: <a href="${ARC_EXP}/tx/${burnTxHash}" target="_blank" style="color:var(--accent3);">${short(burnTxHash)} ↗</a></div>
    </div>`;

    btn.innerHTML='<span class="spinner"></span>Step 3/3: Polling attestation…';

    // Poll Circle Iris API for attestation
    await pollIrisAttestation(burnTxHash,destChain);
    await refreshBalances();
  }catch(err){
    toast((err?.info?.error?.message||err?.reason||err?.message||'Bridge failed').slice(0,140),'error',8000);
  }finally{btn.innerHTML='Bridge USDC via CCTP';btn.disabled=false;}
}

async function pollIrisAttestation(txHash, destChain) {
  const irisUrl = 'https://iris-api-sandbox.circle.com/v2/messages/' + ARC_CCTP_DOMAIN + '?transactionHash=' + txHash;
  const maxAttempts = 80;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    await new Promise(r => setTimeout(r, 15000));

    try {
      // 1. Try server proxy first (avoids CORS)
      let attestation = null, message = null;
      try {
        const pr = await fetch('https://nan-production.up.railway.app/api/cctp-attest', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({action:'getAttestation', txHash, sourceDomain:26}),
        });
        if (pr.ok) {
          const pd = await pr.json();
          if (pd.status === 'complete' && pd.attestation) {
            attestation = pd.attestation;
            message = pd.message;
          }
        }
      } catch(_) {}

      // 2. Fall back to direct Iris if proxy failed
      if (!attestation) {
        try {
          const res = await fetch(irisUrl);
          if (res.ok) {
            const data = await res.json();
            const m = data.messages?.[0];
            if (m?.status === 'complete' && m.attestation && m.attestation !== 'PENDING') {
              attestation = m.attestation;
              message = m.message;
            }
          }
        } catch(_) {}
      }

      // 3. Not ready yet
      if (!attestation || !message) {
        const el = document.getElementById('attestStatus');
        if (el) el.textContent = '⏳ Iris attesting… (' + (attempts * 15) + 's elapsed, up to ~20 min on testnet)';
        continue;
      }

      // 4. Attestation ready
      const attestEl = document.getElementById('attestStatus');
      if (attestEl) attestEl.innerHTML = '✅ Iris attestation received!';
      toast('✓ Attestation ready!', 'success', 5000);

      const destConfig = CCTP_DEST_CONFIG[destChain];

      // 5. Circle email wallet — can't sign on other chains, show manual instructions
      if (isCircleWallet || !wp) {
        const mintEl = document.getElementById('mintStatus');
        if (mintEl) {
          mintEl.style.display = 'block';
          const destName = destConfig?.chainName || destChain;
          const transmitterAddr = destConfig?.transmitter || '—';
          mintEl.innerHTML = `
            <div style="margin-top:10px;background:#1a1a1a;border:1px solid #1a1a1a;border-radius:12px;padding:14px;">
              <div style="font-weight:700;color:#fff;margin-bottom:8px;">✅ Burn complete — mint on ${destName}</div>
              <div style="font-size:.72rem;color:#888;line-height:1.7;margin-bottom:10px;">
                Your USDC is burned on Arc. To receive it on <strong style="color:#ccc;">${destName}</strong>, complete the mint using the attestation below.
              </div>
              <div style="font-size:.68rem;font-family:'JetBrains Mono',monospace;color:#aaa;margin-bottom:6px;">MessageTransmitter on ${destName}:</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:.62rem;color:#a855f7;background:#111;padding:6px 10px;border-radius:7px;margin-bottom:10px;word-break:break-all;">${transmitterAddr}</div>
              <div style="font-size:.68rem;font-family:'JetBrains Mono',monospace;color:#aaa;margin-bottom:4px;">Message bytes:</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:.58rem;color:#666;background:#111;padding:6px 10px;border-radius:7px;margin-bottom:6px;word-break:break-all;">${message}</div>
              <div style="font-size:.68rem;font-family:'JetBrains Mono',monospace;color:#aaa;margin-bottom:4px;">Attestation:</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:.58rem;color:#666;background:#111;padding:6px 10px;border-radius:7px;margin-bottom:12px;word-break:break-all;">${attestation}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button onclick="navigator.clipboard.writeText('${message}').then(()=>toast('Message copied','success',2000))" style="background:#222;border:1px solid #1a1a1a;border-radius:8px;color:#aaa;padding:6px 12px;font-size:.7rem;cursor:pointer;font-family:'Inter',sans-serif;">Copy Message</button>
                <button onclick="navigator.clipboard.writeText('${attestation}').then(()=>toast('Attestation copied','success',2000))" style="background:#222;border:1px solid #1a1a1a;border-radius:8px;color:#aaa;padding:6px 12px;font-size:.7rem;cursor:pointer;font-family:'Inter',sans-serif;">Copy Attestation</button>
                <a href="https://developers.circle.com/cctp/transfer-usdc-on-testnet-from-ethereum-to-avalanche" target="_blank" style="background:#7000ff;border:none;border-radius:8px;color:#fff;padding:6px 12px;font-size:.7rem;cursor:pointer;font-family:'Inter',sans-serif;text-decoration:none;display:inline-flex;align-items:center;">Circle Guide ↗</a>
              </div>
            </div>`;
        }
        toast('✅ Attestation ready — copy the data above to mint on ' + (destConfig?.chainName || destChain), 'success', 10000);
        return;
      }

      // 6. MetaMask — switch to dest chain, mint, switch back to Arc
      if (!destConfig) {
        toast('Unknown destination chain: ' + destChain, 'error', 6000);
        return;
      }

      const mintEl = document.getElementById('mintStatus');
      if (mintEl) { mintEl.style.display = 'block'; mintEl.textContent = '⏳ Switching wallet to ' + destConfig.chainName + '…'; }

      try {
        // Switch to destination chain
        try {
          await wp.request({method:'wallet_switchEthereumChain', params:[{chainId:destConfig.chainId}]});
        } catch(switchErr) {
          if (switchErr.code === 4902 || switchErr.code === -32603) {
            await wp.request({
              method:'wallet_addEthereumChain',
              params:[{
                chainId: destConfig.chainId,
                chainName: destConfig.chainName,
                nativeCurrency: {name:destConfig.currency, symbol:destConfig.currency, decimals:18},
                rpcUrls: [destConfig.rpc],
                blockExplorerUrls: [destConfig.explorer],
              }],
            });
            await wp.request({method:'wallet_switchEthereumChain', params:[{chainId:destConfig.chainId}]});
          } else {
            throw switchErr;
          }
        }

        // Fresh provider + signer on destination chain
        const destProvider = new ethers.BrowserProvider(wp);
        const destSigner = await destProvider.getSigner();

        if (mintEl) mintEl.textContent = '⏳ Minting USDC on ' + destConfig.chainName + '…';

        const transmitter = new ethers.Contract(
          destConfig.transmitter,
          ['function receiveMessage(bytes message, bytes attestation) returns (bool)'],
          destSigner,
        );

        const mintTx = await transmitter.receiveMessage(message, attestation);
        if (mintEl) mintEl.textContent = '⏳ Waiting for confirmation…';
        await mintTx.wait(1);

        const mintUrl = destConfig.explorer + '/tx/' + mintTx.hash;
        if (mintEl) mintEl.innerHTML = '✅ USDC minted on ' + destConfig.chainName + '! '
          + '<a href="' + mintUrl + '" target="_blank" style="color:var(--accent3);">View tx ↗</a>';

        toast('✅ Bridge complete! USDC minted on ' + destConfig.chainName, 'success', 10000);
        addTx({
          hash:mintTx.hash, to:destConfig.transmitter,
          toRaw:'CCTP mint on '+destConfig.chainName,
          amount:'0', type:'bridge', token:'USDC',
          ts:Date.now(), confirmed:true, source:'cctp-mint', destChain,
        });

      } catch(mintErr) {
        console.error('[cctp-mint]', mintErr);
        const reason = mintErr?.reason || mintErr?.message || 'Unknown error';
        if (mintEl) mintEl.innerHTML = '⚠️ Mint failed: ' + reason.slice(0,100)
          + '<br/><small style="color:var(--text3);">Complete manually on ' + destConfig.chainName + '.</small>';
        toast('Mint failed — complete manually on ' + destConfig.chainName, 'warning', 8000);

      } finally {
        // Always switch back to Arc so the rest of the app works
        try {
          await wp.request({method:'wallet_switchEthereumChain', params:[{chainId:ARC_HEX}]});
          provider = new ethers.BrowserProvider(wp);
          signer = await provider.getSigner();
          onArcNetwork = true;
          await refreshBalances();
        } catch(_) {
          toast('Switch back to Arc Testnet to continue using NAN', 'info', 6000);
        }
      }

      return;

    } catch(e) {
      console.warn('pollIrisAttestation attempt', attempts, e.message);
    }
  }

  // Timed out
  const el = document.getElementById('attestStatus');
  if (el) el.textContent = '⚠️ Attestation still pending after 20 min — check Iris manually.';
  toast('Burn confirmed. Check Iris API manually.', 'warning', 10000);
}
  

function prefillSend(addr){
  goPage('send');
  setTimeout(()=>{setType('address',document.getElementById('topt-address'));document.getElementById('recipInput').value=addr;onRecipInput();},200);
}

// ═══════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════
function addTx(tx){
  txHistory.unshift(tx);
  saveTxHistory();
  renderHistory();
  // Record on-chain in background — don't block UI
  _recordTxOnChain(tx).catch(e=>console.log('History record skipped:',e.message));
}

async function _recordTxOnChain(tx){
  if(!userAddr) return;
  try{
    const hashBytes = tx.hash&&tx.hash.length===66
      ? tx.hash
      : ethers.zeroPadValue('0x01',32);
    if(isCircleWallet&&circleWalletId){
      await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
          contractAddress:HISTORY_CONTRACT,
          functionSignature:'record(string,string,string,string,string,bytes32)',
          params:[tx.type||'out',tx.token||'USDC',tx.amount||'0',tx.to||'',tx.toRaw||'',hashBytes]
        })});
    }else if(signer){
      const c=new ethers.Contract(HISTORY_CONTRACT,HISTORY_ABI,signer);
      const t=await c.record(tx.type||'out',tx.token||'USDC',tx.amount||'0',tx.to||'',tx.toRaw||'',hashBytes,arcGasOpts());
      await t.wait(0);
    }
  }catch(e){console.log('On-chain history error:',e.message);}
}
function clearHistory(){
  if(!txHistory.length){toast('Nothing to clear','info',2000);return;}
  if(!confirm('Clear all history?'))return;
  txHistory=[];localStorage.removeItem('arcTx_'+userAddr);renderHistory();toast('Cleared','info',2000);
}
async function loadOnChainHistory(){
  if(!userAddr) return;
  try{
    const readProvider=getArcProvider();
    const c=new ethers.Contract(HISTORY_CONTRACT,HISTORY_ABI,readProvider);
    const records=await c.getHistory(userAddr);
    if(!records.length) return;
    // Merge on-chain records with local — on-chain wins
    const onChain=records.map(r=>({
      hash: r.txHash,
      to: r.toAddr,
      toRaw: r.label,
      amount: r.amount,
      type: r.txType,
      token: r.token,
      ts: Number(r.ts)*1000,
      confirmed: true,
      source: 'onchain',
    }));
    // Merge: keep local ones not yet on-chain
    const onChainHashes=new Set(onChain.map(r=>r.hash));
    const localOnly=txHistory.filter(t=>!onChainHashes.has(t.hash));
    txHistory=[...onChain,...localOnly].sort((a,b)=>b.ts-a.ts);
    saveTxHistory();
    renderHistory();
  }catch(e){console.log('On-chain history load error:',e.message);}
}

function renderHistory(){
  if(!_adminUnlocked){
    const m=getMetrics();
    const ss=document.getElementById('statSends');
    const sw=document.getElementById('statSwaps');
    const sb=document.getElementById('statBridges');
    if(ss) ss.textContent=m.totalSends||txHistory.filter(t=>t.source!=='swap'&&t.type==='out').length||0;
    if(sw) sw.textContent=m.totalSwaps||txHistory.filter(t=>t.source==='swap').length||0;
    if(sb) sb.textContent=m.totalBridges||txHistory.filter(t=>t.source==='cctp').length||0;
  }
  const list=document.getElementById('txList');
  if(!list) return;
  if(!txHistory.length){
    list.innerHTML=`<div style="text-align:center;padding:40px 20px;"><div style="font-size:2rem;margin-bottom:12px;">◎</div><div style="font-size:.82rem;color:var(--text3);line-height:1.6;">No transactions yet.<br/>Send or swap to get started.</div></div>`;
    return;
  }
  const ICONS={
    out:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
    in:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7000ff" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
    swap:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2.2" stroke-linecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>`,
    bridge:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2.2" stroke-linecap="round"><path d="M4 12h16"/><path d="M4 6q4 6 16 0"/><path d="M4 18q4-6 16 0"/></svg>`,
    stake:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`
  };
  const ICO_BG={out:'rgba(112,0,255,.1)',in:'rgba(112,0,255,.1)',swap:'rgba(112,0,255,.1)',bridge:'rgba(112,0,255,.1)',stake:'rgba(112,0,255,.1)'};
  const ICO_BD={out:'rgba(112,0,255,.2)',in:'rgba(112,0,255,.2)',swap:'rgba(112,0,255,.2)',bridge:'rgba(112,0,255,.2)',stake:'rgba(112,0,255,.2)'};

  function dateGroup(ts){
    const d=new Date(ts),now=new Date();
    const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const yest=new Date(today-86400000);
    const txDay=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    if(txDay.getTime()===today.getTime()) return 'Today';
    if(txDay.getTime()===yest.getTime()) return 'Yesterday';
    return d.toLocaleDateString('en',{month:'long',year:'numeric'});
  }
  function timeLabel(ts){
    const d=new Date(ts),now=new Date();
    const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const txDay=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    if(txDay>=new Date(today-86400000)) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    return d.toLocaleDateString('en',{month:'short',day:'numeric'});
  }
  function statusBadge(tx){
    const isSim=tx.hash?.startsWith('sim-');
    if(isSim) return `<span style="font-size:.55rem;background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.2);border-radius:100px;padding:2px 7px;">simulated</span>`;
    const isRealHash=tx.hash&&tx.hash.startsWith('0x')&&tx.hash.length===66;
    const st=(!isRealHash||tx.confirmed)?'confirmed':tx.failed?'failed':'pending';
    const map={confirmed:['rgba(112,0,255,.1)','#7000ff','rgba(112,0,255,.2)'],failed:['rgba(112,0,255,.1)','#c084fc','rgba(112,0,255,.2)'],pending:['rgba(112,0,255,.08)','#a855f7','rgba(112,0,255,.15)']};
    const [bg,col,bd]=map[st];
    return `<span style="font-size:.55rem;background:${bg};color:${col};border:1px solid ${bd};border-radius:100px;padding:2px 7px;font-weight:600;">${st}</span>`;
  }
  function renderTxRow(tx){
    const isSim=tx.hash?.startsWith('sim-');
    const type=tx.type||'out';
    let label='',amt='',amtColor='#ffffff';
    if(type==='out'){label='Sent to '+(tx.toRaw||short(tx.to));amt='−'+parseFloat(tx.amount).toFixed(2)+' '+(tx.token||'USDC');}
    else if(type==='in'){label=tx.toRaw||'Received';amt='+'+parseFloat(tx.amount).toFixed(2)+' '+(tx.token||'USDC');amtColor='#7000ff';}
    else if(type==='swap'){label=parseFloat(tx.amount).toFixed(2)+' '+(tx.fromToken||'USDC')+' → '+parseFloat(tx.outAmount||0).toFixed(2)+' '+(tx.toToken||'EURC');amt='Swap';amtColor='#c084fc';}
    else if(type==='stake'){label='Saved '+parseFloat(tx.amount).toFixed(2)+' USDC';amt='Save';amtColor='#7000ff';}
    else if(type==='bridge'){label='Bridge → '+(tx.destChain||'');amt='−'+parseFloat(tx.amount).toFixed(2)+' USDC';}
    const isRealHash=tx.hash&&tx.hash.startsWith('0x')&&tx.hash.length===66;
    const href=isRealHash?`${ARC_EXP}/tx/${tx.hash}`:`${ARC_EXP}/address/${userAddr}`;
    const viewLink=!isSim?(isRealHash
      ?`<a href="${href}" target="_blank" onclick="verifyTx('${tx.hash}',event)" style="font-size:.58rem;color:var(--accent3);text-decoration:none;">View ↗</a>`
      :`<a href="${href}" target="_blank" style="font-size:.58rem;color:var(--accent3);text-decoration:none;">Wallet ↗</a>`):'';
    const ico=ICONS[type]||ICONS.out;
    return `<div style="display:flex;align-items:center;gap:12px;background:var(--card);border-bottom:1px solid var(--border);padding:13px 14px;cursor:pointer;transition:background .15s;" onmouseover="this.style.background='rgba(112,0,255,.04)'" onmouseout="this.style.background='var(--card)'">
      <div style="width:38px;height:38px;border-radius:12px;background:${ICO_BG[type]||ICO_BG.out};border:1px solid ${ICO_BD[type]||ICO_BD.out};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ico}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.85rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
          <span style="font-size:.6rem;color:var(--text3);">${timeLabel(tx.ts)}</span>
          ${statusBadge(tx)}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:'Syne',sans-serif;font-size:.88rem;font-weight:700;color:${amtColor};">${amt}</div>
        ${viewLink}
      </div>
    </div>`;
  }

  // Group transactions
  const groups={};
  txHistory.forEach(tx=>{
    const g=dateGroup(tx.ts);
    if(!groups[g]) groups[g]=[];
    groups[g].push(tx);
  });

  let html='';
  Object.keys(groups).forEach(group=>{
    html+=`<div style="margin-bottom:8px;">
      <div style="font-size:.58rem;color:var(--text3);letter-spacing:.14em;text-transform:uppercase;margin:10px 2px 6px;">${group}</div>
      <div style="border-radius:14px;overflow:hidden;border:1px solid var(--border);">${groups[group].map(renderTxRow).join('')}</div>
    </div>`;
  });
  list.innerHTML=html;
}


// ═══════════════════════════════════════════
// FAUCET
// ═══════════════════════════════════════════
async function claimFaucet(){
  if(!userAddr){toast('Connect wallet first','error');return;}
  const btn=document.getElementById('faucetBtn');
  btn.innerHTML='<span class="spinner"></span>Claiming…';btn.disabled=true;
  try{
    const res=await fetch('https://nan-production.up.railway.app/api/faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:userAddr})});
    const data=await res.json();
    if(data.success){
      toast('💧 Tokens on the way! Check balance in ~30s','success',7000);
      setTimeout(()=>refreshBalances(),15000);
      setTimeout(()=>refreshBalances(),30000);
    }else{
      const msg=data.error||'';
      if(msg.toLowerCase().includes('limit')||msg.toLowerCase().includes('rate')){toast('⏳ Limit reached — try again in 2 hours','error',6000);}
      else{toast('Opening faucet website…','info',3000);window.open('https://faucet.circle.com','_blank');}
    }
  }catch{toast('Opening faucet website…','info',3000);window.open('https://faucet.circle.com','_blank');}
  btn.innerHTML='💧 Get Free Tokens';btn.disabled=false;
}

// ═══════════════════════════════════════════
// QR CODE
// ═══════════════════════════════════════════
function renderQR(a){
  const b=document.getElementById('qrBox');b.innerHTML='';
  if(!a)return;
  const isDark=document.documentElement.getAttribute('data-theme')!=='light';
  try{new QRCode(b,{text:a,width:100,height:100,colorDark:isDark?'#111111':'#111111',colorLight:'#ffffff'});}
  catch{b.innerHTML='<p style="padding:10px;font-size:.7rem;color:#888">QR unavailable</p>';}
}
function copyAddr(){
  if(!userAddr)return;
  navigator.clipboard.writeText(userAddr).then(()=>{
    toast('Address copied!','success',2000);
    const el=document.getElementById('walAddr');el.textContent='Copied!';
    setTimeout(()=>{el.textContent=short(userAddr);},1500);
  }).catch(()=>toast('Could not copy','error'));
}

function shareAddr(){
  if(!userAddr)return;
  if(navigator.share){
    navigator.share({title:'My NAN Wallet Address',text:userAddr})
      .catch(()=>{});
  } else {
    navigator.clipboard.writeText(userAddr).then(()=>toast('Address copied to clipboard!','success',2000));
  }
}

// ═══════════════════════════════════════════
// AI AGENT (Claude-powered)
// ═══════════════════════════════════════════


// ═══════════════════════════════════════════
// BULK PAY ENGINE
// ═══════════════════════════════════════════
let bulkRecipients = []; // [{addr, amount, name, status}]
let bulkToken = 'USDC';
let bulkDefaultAmt = 10;

function setBulkToken(token){
  bulkToken = token;
  document.getElementById('bulk-usdc').style.background = token==='USDC'?'#7000ff':'var(--surface)';
  document.getElementById('bulk-usdc').style.border = token==='USDC'?'none':'1px solid var(--border)';
  document.getElementById('bulk-usdc').style.color = token==='USDC'?'#f3e8ff':'var(--text3)';
  document.getElementById('bulk-eurc').style.background = token==='EURC'?'#7000ff':'var(--surface)';
  document.getElementById('bulk-eurc').style.border = token==='EURC'?'none':'1px solid var(--border)';
  document.getElementById('bulk-eurc').style.color = token==='EURC'?'#f3e8ff':'var(--text3)';
  updateBulkSummary();
}

function setBulkDefaultAmt(amt){
  bulkDefaultAmt = amt;
  document.getElementById('bulkDefaultAmt').value = '';
  bulkRecipients.forEach(r => r.amount = amt);
  renderBulkRecipients();
  updateBulkSummary();
}

function updateBulkAmounts(){
  const val = parseFloat(document.getElementById('bulkDefaultAmt').value);
  if(!val || val <= 0) return;
  bulkDefaultAmt = val;
  bulkRecipients.forEach(r => r.amount = val);
  renderBulkRecipients();
  updateBulkSummary();
}

async function resolveArcName(name){
  const n = name.toLowerCase().replace('.arc','');
  const found = arcNames.find(a => a.name === n);
  if(found) return found.owner;
  try{
    const readProvider = getArcProvider();
    const c = new ethers.Contract(NAME_REGISTRY, NAME_ABI, readProvider);
    const addr = await c.resolve(n);
    return addr === '0x0000000000000000000000000000000000000000' ? null : addr;
  }catch{ return null; }
}

async function addBulkRecipient(){
  const input = document.getElementById('bulkAddrInput');
  const raw = input.value.trim();
  if(!raw){ toast('Enter a wallet address or .arc name','error'); return; }

  // Check for duplicate
  if(bulkRecipients.find(r => r.addr === raw || r.name === raw)){
    toast('Already in the list','error'); return;
  }

  let addr = raw;
  let name = '';

  // Resolve .arc name
  if(raw.endsWith('.arc')){
    name = raw;
    const resolved = await resolveArcName(raw);
    if(!resolved){ toast('Could not resolve ' + raw,'error'); return; }
    addr = resolved;
  } else if(!raw.startsWith('0x') || raw.length < 10){
    toast('Enter a valid 0x address or .arc name','error'); return;
  }

  const nameInput = document.getElementById('bulkNameInput');
  const displayName = nameInput.value.trim() || name || '';
  bulkRecipients.push({ addr, name: displayName || name, amount: bulkDefaultAmt, status: 'pending' });
  input.value = '';
  nameInput.value = '';
  renderBulkRecipients();
  updateBulkSummary();
}

function removeBulkRecipient(i){
  bulkRecipients.splice(i, 1);
  renderBulkRecipients();
  updateBulkSummary();
}

function updateBulkAmt(i, val){
  bulkRecipients[i].amount = parseFloat(val) || 0;
  updateBulkSummary();
}

function renderBulkRecipients(){
  const el = document.getElementById('bulkRecipientsList');
  if(!el) return;
  if(!bulkRecipients.length){
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:.82rem;">No recipients yet — add a wallet address or .arc name above</div>';
    return;
  }
  el.innerHTML = bulkRecipients.map((r,i) => `
    <div style="display:flex;align-items:center;gap:7px;padding:9px 11px;background:var(--surface);border:1px solid var(--border);border-radius:11px;">
      <div style="width:22px;height:22px;border-radius:50%;background:rgba(168,85,247,.15);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;color:var(--accent3);flex-shrink:0;">${i+1}</div>
      <div style="flex:1;min-width:0;">
        ${r.name ? `<div style="font-size:.78rem;font-weight:600;color:var(--accent3);">${r.name}</div>` : ''}
        <div style="font-family:'JetBrains Mono',monospace;font-size:.68rem;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.addr.slice(0,10)}…${r.addr.slice(-6)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
        <input type="number" value="${r.amount}" min="0.01" step="0.01"
          onchange="updateBulkAmt(${i}, this.value)"
          style="width:64px;padding:5px 7px;border-radius:7px;font-size:.82rem;text-align:right;font-family:'JetBrains Mono',monospace;"/>
        <span style="font-size:.7rem;color:var(--text3);">${bulkToken}</span>
        <button onclick="removeBulkRecipient(${i})" style="width:24px;height:24px;border-radius:6px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--danger);cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
      ${r.status==='done'?'<span style="color:var(--success);font-size:.8rem;">✓</span>':r.status==='failed'?'<span style="color:var(--danger);font-size:.8rem;">✗</span>':''}
    </div>
  `).join('');
}

function updateBulkSummary(){
  const count = bulkRecipients.length;
  const total = bulkRecipients.reduce((s,r) => s+r.amount, 0);
  const gas = count * 0.009;
  const bal = bulkToken==='USDC' ? parseFloat(usdcBal||0) : parseFloat(eurcBal||0);

  const summary = document.getElementById('bulkSummary');
  const sendBtn = document.getElementById('bulkSendBtn');
  if(!summary || !sendBtn) return;

  if(count > 0){
    summary.style.display = 'block';
    document.getElementById('bulkRecipCount').textContent = count + ' wallet' + (count!==1?'s':'');
    document.getElementById('bulkTotalAmt').textContent = total.toFixed(2) + ' ' + bulkToken;
    document.getElementById('bulkBalAmt').textContent = bal.toFixed(2) + ' ' + bulkToken;
    document.getElementById('bulkBalAmt').style.color = bal >= total+gas ? 'var(--success)' : 'var(--danger)';
    document.getElementById('bulkGasAmt').textContent = '~' + gas.toFixed(3) + ' USDC';
    const canSend = count > 0 && bal >= total+gas;
    sendBtn.disabled = !canSend;
    sendBtn.textContent = canSend
      ? `Send ${bulkToken} to ${count} wallet${count!==1?'s':''} →`
      : bal < total+gas ? 'Insufficient balance' : 'Add recipients';
  } else {
    summary.style.display = 'none';
    sendBtn.disabled = true;
    sendBtn.textContent = 'Add recipients to send';
  }
}

async function importBulkCSV(event){
  const file = event.target.files[0];
  if(!file) return;
  const text = await file.text();
  const lines = text.trim().split('\n');
  let added = 0, skipped = 0;
  for(const line of lines){
    const parts = line.split(/[,\t]/);
    const addr = parts[0]?.trim();
    const amt = parseFloat(parts[1]?.trim()) || bulkDefaultAmt;
    if(!addr) continue;
    if(bulkRecipients.find(r => r.addr === addr || r.name === addr)){ skipped++; continue; }
    let resolvedAddr = addr;
    let name = '';
    if(addr.endsWith('.arc')){
      name = addr;
      const res = await resolveArcName(addr);
      if(!res){ skipped++; continue; }
      resolvedAddr = res;
    } else if(!addr.startsWith('0x')){ skipped++; continue; }
    bulkRecipients.push({ addr: resolvedAddr, name, amount: amt, status: 'pending' });
    added++;
  }
  renderBulkRecipients();
  updateBulkSummary();
  toast(`Imported ${added} recipient${added!==1?'s':''}${skipped?' ('+skipped+' skipped)':''}`, 'success', 3000);
  event.target.value = '';
}

function clearBulkRecipients(){
  if(!bulkRecipients.length) return;
  if(confirm('Clear all ' + bulkRecipients.length + ' recipients?')){
    bulkRecipients = [];
    renderBulkRecipients();
    updateBulkSummary();
  }
}

// ── Payroll Groups ──
async function savePayrollGroup(){
  if(!bulkRecipients.length){ toast('Add recipients first','error'); return; }
  const name = prompt('Name this payroll group (e.g. Engineering Team, October Payroll):');
  if(!name) return;
  const groupData = bulkRecipients.map(r=>({addr:r.addr,name:r.name,amount:r.amount}));
  // Save locally always
  const groups = JSON.parse(localStorage.getItem('nan_payroll_groups_'+(userAddr||''))||'{}');
  groups[name] = groupData;
  localStorage.setItem('nan_payroll_groups_'+(userAddr||''), JSON.stringify(groups));
  // Also save to Railway server for cross-device access
  try{
    await fetch('https://nan-production.up.railway.app/api/orders?wallet='+(userAddr||''),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({wallet:userAddr,order:{type:'payroll_group',name,recipients:groupData,token:bulkToken,ts:Date.now(),synced:false}})
    });
  }catch(e){console.log('Payroll group sync error:',e.message);}
  renderPayrollGroups();
  toast('✓ Group "'+name+'" saved!','success',3000);
}

function loadPayrollGroup(){
  const sel = document.getElementById('payrollGroupSelect');
  const name = sel.value;
  if(!name) return;
  const groups = JSON.parse(localStorage.getItem('nan_payroll_groups_'+(userAddr||''))||'{}');
  const group = groups[name];
  if(!group) return;
  bulkRecipients = group.map(r=>({...r, status:'pending'}));
  renderBulkRecipients();
  updateBulkSummary();
  toast('✓ Loaded "'+name+'" — '+group.length+' recipients','success',3000);
}

function renderPayrollGroups(){
  const sel = document.getElementById('payrollGroupSelect');
  if(!sel) return;
  const groups = JSON.parse(localStorage.getItem('nan_payroll_groups_'+(userAddr||''))||'{}');
  const keys = Object.keys(groups);
  sel.innerHTML = '<option value="">— Select saved group —</option>'
    + keys.map(k=>`<option value="${k}">${k} (${groups[k].length} people)</option>`).join('');
}

function renderPayrollHistory(){
  const el=document.getElementById('payrollHistory');
  if(!el)return;
  const hist=JSON.parse(localStorage.getItem('nan_payroll_history_'+(userAddr||''))||'[]');
  if(!hist.length){
    el.innerHTML='<div style="font-size:.75rem;color:var(--text3);text-align:center;padding:12px;">No payroll runs yet</div>';
    return;
  }
  el.innerHTML=hist.map(h=>`
    <div style="padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:.78rem;font-weight:600;color:var(--text);">${new Date(h.date).toLocaleDateString()} · ${new Date(h.date).toLocaleTimeString()}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:700;color:var(--accent3);">${h.total} ${h.token}</span>
      </div>
      <div style="font-size:.68rem;color:var(--text3);">${h.sent} sent · ${h.failed} failed · ${h.recipients.length} recipients</div>
    </div>`).join('');
}

function schedulePayroll(){
  if(!bulkRecipients.length){ toast('Add recipients first','error'); return; }
  const total = bulkRecipients.reduce((s,r)=>s+r.amount,0);
  if(!confirm(`Schedule monthly payroll?\n\n${bulkRecipients.length} recipients · ${total.toFixed(2)} ${bulkToken} total\n\nWill run on the 1st of each month.`)) return;
  const nextRun = getNext1st();
  bulkRecipients.forEach(r=>{
    createOrder({
      type:'standing',
      amount:r.amount,
      token:bulkToken,
      to:r.addr,
      interval:2592000000,
      nextRun,
      freq:'month',
      label:r.name||r.addr.slice(0,10),
    });
  });
  toast('✓ Monthly payroll scheduled for '+new Date(nextRun).toLocaleDateString()+' — '+bulkRecipients.length+' recipients','success',6000);
}

function getNext1st(){
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth()+1, 1, 9, 0, 0);
  return next.getTime();
}

let lastPayrollTxs = [];

function downloadPayrollReceipt(){
  if(!lastPayrollTxs.length){ toast('Run payroll first to generate a receipt','info',3000); return; }
  const now = new Date().toLocaleString();
  const total = lastPayrollTxs.reduce((s,r)=>s+r.amount,0);
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 120 + lastPayrollTxs.length * 44 + 80;
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0,0,600,canvas.height);
  bg.addColorStop(0,'#111111'); bg.addColorStop(1,'#111111');
  ctx.fillStyle = bg; ctx.fillRect(0,0,600,canvas.height);
  ctx.strokeStyle = 'rgba(168,85,247,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(10,10,580,canvas.height-20,16); ctx.stroke();

  // Header
  ctx.fillStyle = '#f3e8ff'; ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left'; ctx.fillText('NAN Payroll Receipt', 28, 48);
  ctx.fillStyle = '#c084fc'; ctx.font = '12px monospace';
  ctx.fillText(now, 28, 68);
  ctx.fillStyle = '#c084fc'; ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(lastPayrollTxs.length+' recipients · '+total.toFixed(2)+' '+bulkToken+' total', 572, 68);

  // Divider
  ctx.strokeStyle = 'rgba(168,85,247,0.2)'; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(28,82); ctx.lineTo(572,82); ctx.stroke();
  ctx.setLineDash([]);

  // Rows
  lastPayrollTxs.forEach((r,i)=>{
    const y = 110 + i*44;
    ctx.fillStyle = i%2===0?'rgba(168,85,247,0.04)':'transparent';
    ctx.fillRect(18, y-16, 564, 40);
    ctx.fillStyle = '#f3e8ff'; ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(r.name||r.addr.slice(0,16)+'…', 28, y+4);
    ctx.fillStyle = '#c084fc'; ctx.font = '10px monospace';
    ctx.fillText(r.addr.slice(0,18)+'…', 28, y+18);
    ctx.fillStyle = r.status==='done'?'#7000ff':'#f87171';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'right';
    ctx.fillText(r.amount.toFixed(2)+' '+bulkToken, 572, y+4);
    ctx.fillStyle = r.status==='done'?'#7000ff':'#f87171';
    ctx.font = '10px monospace';
    ctx.fillText(r.status==='done'?'✓ Sent':'✗ Failed', 572, y+18);
  });

  // Footer
  const fy = canvas.height - 30;
  ctx.fillStyle = 'rgba(168,85,247,0.15)'; ctx.fillRect(0,fy-14,600,44);
  ctx.fillStyle = '#c084fc'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('NAN Wallet · Powered by Circle USDC · Arc Testnet', 300, fy+8);

  const link = document.createElement('a');
  link.download = 'nan-payroll-'+Date.now()+'.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('✓ Payroll receipt downloaded!','success',3000);
}

async function doBulkSend(){
  if(!bulkRecipients.length) return;

  // Dry run confirmation
  const total_amt = bulkRecipients.reduce((s,r)=>s+r.amount,0);
  const preview = bulkRecipients.slice(0,3).map(r=>`  • ${r.name||r.addr.slice(0,10)}… — ${r.amount} ${bulkToken}`).join('\n');
  const more = bulkRecipients.length>3?`\n  … and ${bulkRecipients.length-3} more`:'';
  if(!confirm(`Run Payroll?\n\n${preview}${more}\n\nTotal: ${total_amt.toFixed(2)} ${bulkToken} to ${bulkRecipients.length} recipient${bulkRecipients.length!==1?'s':''}\n\nThis will send real tokens on Arc Testnet.`)) return;

  const btn = document.getElementById('bulkSendBtn');
  const progress = document.getElementById('bulkProgress');
  const progressTitle = document.getElementById('bulkProgressTitle');
  const progressBar = document.getElementById('bulkProgressBar');
  const progressList = document.getElementById('bulkProgressList');

  btn.disabled = true;
  progress.style.display = 'block';

  let done = 0;
  const total = bulkRecipients.length;
  progressList.innerHTML = '';

  const tokenAddr = bulkToken === 'USDC' ? USDC_ADDR : EURC_ADDR;
  const decimals = bulkToken === 'USDC' ? USDC_DECIMALS : EURC_DECIMALS;

  // Render all status rows first
  bulkRecipients.forEach((r, i) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:.72rem;';
    item.innerHTML = `<span style="color:var(--text3);font-family:'JetBrains Mono',monospace;">${r.name||r.addr.slice(0,12)}…</span><span id="bulk-status-${i}" style="color:var(--text3);">⏳</span>`;
    progressList.appendChild(item);
  });
  progressTitle.textContent = `Sending to ${total} recipients in parallel…`;

  // Send in batches of 10 — avoids rate limits and nonce conflicts
  const BATCH_SIZE = 10;
  for(let batchStart = 0; batchStart < bulkRecipients.length; batchStart += BATCH_SIZE){
    const batch = bulkRecipients.slice(batchStart, batchStart + BATCH_SIZE);
    progressTitle.textContent = `Sending batch ${Math.floor(batchStart/BATCH_SIZE)+1} of ${Math.ceil(bulkRecipients.length/BATCH_SIZE)}…`;
    await Promise.allSettled(batch.map(async (r, bi) => {
      const i = batchStart + bi;
    try {
      if(isCircleWallet && circleWalletId){
        const res = await fetch('https://nan-production.up.railway.app/api/circle-wallets', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            action: 'transfer',
            walletId: circleWalletId,
            walletAddress: circleWalletAddress,
            destinationAddress: r.addr,
            amount: r.amount.toString(),
            tokenSymbol: bulkToken,
          }),
        });
        const data = await res.json();
        if(!data.success) throw new Error(data.error || 'Transfer failed');
        addTx({hash:data.txHash||data.transactionId,to:r.addr,toRaw:r.name||r.addr,amount:r.amount.toFixed(6),type:'out',token:bulkToken,ts:Date.now(),confirmed:true,source:'circle'});
      } else if(signer){
        const c = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
        const tx = await c.transfer(r.addr, ethers.parseUnits(r.amount.toFixed(decimals), decimals), arcGasOpts());
        await tx.wait(1);
        addTx({hash:tx.hash,to:r.addr,toRaw:r.name||r.addr,amount:r.amount.toFixed(6),type:'out',token:bulkToken,ts:Date.now(),confirmed:true,source:'metamask'});
      } else {
        throw new Error('No wallet connected');
      }
      r.status = 'done';
      document.getElementById('bulk-status-'+i).textContent = '✓';
      document.getElementById('bulk-status-'+i).style.color = 'var(--success)';
      done++;
      progressBar.style.width = (done/total*100)+'%';
    } catch(e) {
      r.status = 'failed';
      document.getElementById('bulk-status-'+i).textContent = '✗ '+e.message.slice(0,30);
      document.getElementById('bulk-status-'+i).style.color = 'var(--danger)';
      console.error('Bulk send error for', r.addr, e.message);
    }
    }));
    // Small delay between batches
    if(batchStart + BATCH_SIZE < bulkRecipients.length){
      progressTitle.textContent = 'Batch done — starting next batch…';
      await new Promise(r=>setTimeout(r,1000));
    }
  } // end batch loop

  await refreshBalances();
  progressTitle.textContent = `Done! ${done}/${total} sent successfully`;
  progressBar.style.width = '100%';
  progressBar.style.background = done===total ? 'linear-gradient(90deg,#7000ff,#7000ff)' : 'linear-gradient(90deg,#f87171,#f87171)';
  renderBulkRecipients();
  toast(done===total ? `✅ All ${done} payments sent!` : `Sent ${done}/${total} — ${total-done} failed`, done===total?'success':'error', 5000);

  lastPayrollTxs = [...bulkRecipients];

  // Save payroll history
  try{
    const histKey='nan_payroll_history_'+(userAddr||'');
    const hist=JSON.parse(localStorage.getItem(histKey)||'[]');
    hist.unshift({
      date:new Date().toISOString(),
      total:bulkRecipients.reduce((s,r)=>s+(r.status==='done'?r.amount:0),0).toFixed(2),
      token:bulkToken,
      sent:done,
      failed:total-done,
      recipients:bulkRecipients.map(r=>({name:r.name||r.addr.slice(0,10),addr:r.addr,amount:r.amount,status:r.status}))
    });
    // Keep last 20 payroll runs
    localStorage.setItem(histKey,JSON.stringify(hist.slice(0,20)));
    renderPayrollHistory();
  }catch(e){console.warn('Payroll history save error:',e.message);}

  bulkRecipients = bulkRecipients.filter(r => r.status !== 'done');
  setTimeout(() => {
    renderBulkRecipients();
    updateBulkSummary();
    btn.disabled = false;
    if(!bulkRecipients.length) progress.style.display = 'none';
  }, 3000);
}

// ═══════════════════════════════════════════
// NAN ORDER ENGINE — Limit Orders + Scheduled Sends + Standing Orders
// ═══════════════════════════════════════════
let nanOrders = []; // {id, type, status, ...}
let orderEngineRunning = false;

function genOrderId(){return 'ord_'+Date.now().toString(36);}

// Save orders to Redis via API + localStorage fallback
async function saveOrders(){
  try{localStorage.setItem('nan_orders',JSON.stringify(nanOrders));}catch{}
  if(!userAddr)return;
  try{
    // Sync all pending orders to server
    for(const order of nanOrders){
      if(!order.synced){
        await fetch('https://nan-production.up.railway.app/api/orders?wallet='+userAddr,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({wallet:userAddr,order:{...order,email:otpEmail||null,synced:true}})
        });
        order.synced=true;
      }
    }
  }catch(e){console.log('Order sync error:',e);}
}

async function loadOrders(){
  // Load from localStorage first (instant)
  try{const s=localStorage.getItem('nan_orders');if(s)nanOrders=JSON.parse(s).filter(o=>o.status==='pending');}catch{}
  // Then sync from server
  if(!userAddr)return;
  try{
    const res=await fetch('https://nan-production.up.railway.app/api/orders?wallet='+userAddr);
    const data=await res.json();
    if(data.orders&&data.orders.length){
      // Merge server orders with local
      const serverIds=new Set(data.orders.map(o=>o.id));
      const localOnly=nanOrders.filter(o=>!serverIds.has(o.id));
      nanOrders=[...data.orders,...localOnly].filter(o=>o.status==='pending');
      localStorage.setItem('nan_orders',JSON.stringify(nanOrders));
    }
  }catch(e){console.log('Order load error:',e);}
}

// Start the order monitoring loop
function startOrderEngine(){
  if(orderEngineRunning)return;
  orderEngineRunning=true;
  loadOrders();
  setInterval(async()=>{
    if(!nanOrders.length)return;
    for(const order of nanOrders){
      if(order.status!=='pending')continue;
      try{
        if(order.type==='limit'){await checkLimitOrder(order);}
        else if(order.type==='scheduled'){await checkScheduledOrder(order);}
        else if(order.type==='standing'){await checkStandingOrder(order);}
      }catch(e){console.log('Order check error:',e);}
    }
    nanOrders=nanOrders.filter(o=>o.status==='pending');
    saveOrders();
  },15000); // Check every 15 seconds
}

async function checkLimitOrder(order){
  await fetchLiveFX();
  const rate = order.sellToken==='USDC' ? FX : 1/FX;
  const targetMet = order.condition==='gte' ? rate>=order.targetRate : rate<=order.targetRate;
  if(!targetMet)return;
  order.status='executing';
  toast(`🎯 Limit order triggered! ${order.amount} ${order.sellToken} → ${order.buyToken} at ${rate.toFixed(4)}`,'success',6000);
  // Navigate to swap and auto-execute
  if(order.sellToken==='USDC'&&swapFlipped){flipSwap();}
  else if(order.sellToken==='EURC'&&!swapFlipped){flipSwap();}
  document.getElementById('swapFrom').value=order.amount;
  calcSwap();
  setTimeout(async()=>{
    try{
      await doSwap();
      order.status='done';
      addAgentMsg(`✅ Limit order executed! Swapped ${order.amount} ${order.sellToken} → ${order.buyToken} at rate ${rate.toFixed(4)}`);
    }catch{order.status='pending';}
  },1000);
}

async function checkScheduledOrder(order){
  const now=Date.now();
  if(now<order.executeAt)return;
  order.status='executing';
  toast(`⏰ Scheduled send executing — ${order.amount} ${order.token} to ${order.to.slice(0,8)}…`,'info',5000);
  try{
    document.getElementById('recipInput').value=order.to;
    document.getElementById('amtInput').value=order.amount;
    sendToken=order.token||'USDC';
    document.getElementById('sendTokenLabel').textContent=sendToken;
    validateSend();
    await doSend();
    order.status='done';
    addAgentMsg(`✅ Scheduled send complete! Sent ${order.amount} ${order.token} to ${order.to.slice(0,8)}…`);
    // If recurring, reschedule
    if(order.recurring&&order.interval){
      const newOrder={...order,id:genOrderId(),status:'pending',executeAt:now+order.interval};
      nanOrders.push(newOrder);
      saveOrders();
    }
  }catch{order.status='pending';order.executeAt=now+60000;}// Retry in 1 min
}

async function checkStandingOrder(order){
  const now=Date.now();
  if(now<order.nextRun)return;
  order.status='executing';
  toast(`📅 Standing order — ${order.amount} ${order.token} to ${order.to.slice(0,8)}…`,'info',5000);
  try{
    document.getElementById('recipInput').value=order.to;
    document.getElementById('amtInput').value=order.amount;
    sendToken=order.token||'USDC';
    document.getElementById('sendTokenLabel').textContent=sendToken;
    validateSend();
    await doSend();
    order.status='pending';
    order.nextRun=now+order.interval;
    order.runCount=(order.runCount||0)+1;
    saveOrders();
    addAgentMsg(`✅ Standing order ran! Sent ${order.amount} ${order.token} to ${order.to.slice(0,8)}… (run #${order.runCount})`);
  }catch{order.status='pending';order.nextRun=now+300000;}// Retry in 5 min
}

function addAgentMsg(text){
  agentMsgs.push({role:'assistant',content:text});
  if(agentOpen)renderAgentMsgs();
}

// Parse natural language order commands
function parseOrderCommand(msg){
  const m=msg.toLowerCase();
  
  // LIMIT ORDER: "sell 50 USDC for EURC when rate hits 0.95" / "when 1 USDC = 0.93 EURC swap 100"
  const limitMatch=m.match(/(?:sell|swap|convert)\s+(\d+(?:\.\d+)?)\s+(usdc|eurc)\s+(?:for|to)\s+(usdc|eurc)\s+(?:when|if|at)\s+(?:rate\s+)?(?:hits?|reaches?|=|equals?)\s*(\d+(?:\.\d+)?)/i)
    || m.match(/when\s+(?:1\s+)?(usdc|eurc)\s*[=]\s*(\d+(?:\.\d+)?)\s*(usdc|eurc).*?(?:sell|swap|convert)\s+(\d+(?:\.\d+)?)/i);
  if(limitMatch){
    const amount=parseFloat(limitMatch[1]||limitMatch[4]);
    const sellToken=(limitMatch[2]||limitMatch[1]||'USDC').toUpperCase();
    const buyToken=(limitMatch[3]||limitMatch[3]||'EURC').toUpperCase();
    const targetRate=parseFloat(limitMatch[4]||limitMatch[2]);
    const currentRate=sellToken==='USDC'?FX:1/FX;
    const condition=targetRate>=currentRate?'gte':'lte';
    return{type:'limit',amount,sellToken,buyToken,targetRate,condition,currentRate};
  }

  // SCHEDULED SEND: "send 20 USDC to 0x... on friday" / "send 10 USDC to 0x... in 2 hours"
  const schedMatch=m.match(/send\s+(\d+(?:\.\d+)?)\s+(usdc|eurc)\s+to\s+(0x[a-f0-9]+|\S+\.arc)\s+(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|in\s+\d+\s+(?:hour|minute|day)s?)/i);
  if(schedMatch){
    const amount=parseFloat(schedMatch[1]);
    const token=schedMatch[2].toUpperCase();
    const to=schedMatch[3];
    const when=schedMatch[4];
    const executeAt=parseWhen(when);
    return{type:'scheduled',amount,token,to,executeAt,when};
  }

  // STANDING ORDER: "send 20 USDC to 0x... every friday" / "every month send 100 USDC to 0x..."
  const standMatch=m.match(/(?:send\s+(\d+(?:\.\d+)?)\s+(usdc|eurc)\s+to\s+(0x[a-f0-9]+|\S+\.arc)\s+every\s+(day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))|(?:every\s+(\w+)\s+send\s+(\d+(?:\.\d+)?)\s+(usdc|eurc)\s+to\s+(0x[a-f0-9]+|\S+\.arc))/i);
  if(standMatch){
    const amount=parseFloat(standMatch[1]||standMatch[6]);
    const token=(standMatch[2]||standMatch[7]||'USDC').toUpperCase();
    const to=standMatch[3]||standMatch[8];
    const freq=standMatch[4]||standMatch[5]||'week';
    const interval=parseInterval(freq);
    const nextRun=parseNextOccurrence(freq);
    return{type:'standing',amount,token,to,interval,nextRun,freq};
  }

  return null;
}

function parseWhen(when){
  const now=Date.now();
  const w=when.toLowerCase();
  if(w.includes('hour')){const h=parseInt(w.match(/\d+/)[0]);return now+h*3600000;}
  if(w.includes('minute')){const mn=parseInt(w.match(/\d+/)[0]);return now+mn*60000;}
  if(w.includes('day')&&!w.includes('monday')&&!w.includes('wednesday')&&!w.includes('friday')&&!w.includes('saturday')&&!w.includes('sunday')){const d=parseInt(w.match(/\d+/)[0]);return now+d*86400000;}
  // Day of week
  const days={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
  for(const [day,idx] of Object.entries(days)){
    if(w.includes(day)){
      const d=new Date();const target=idx;
      let diff=target-d.getDay();
      if(diff<=0)diff+=7;
      return now+diff*86400000;
    }
  }
  return now+3600000;// Default 1 hour
}

function parseInterval(freq){
  const f=freq.toLowerCase();
  if(f==='day')return 86400000;
  if(f==='week'||['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(f))return 604800000;
  if(f==='month')return 2592000000;
  return 604800000;
}

function parseNextOccurrence(freq){
  return parseWhen(freq);
}

function createOrder(orderData){
  const order={...orderData,id:genOrderId(),status:'pending',createdAt:Date.now(),email:otpEmail||null,synced:false};
  nanOrders.push(order);
  saveOrders();
  return order;
}

function cancelOrder(id){
  const order=nanOrders.find(o=>o.id===id);
  if(order){
    order.status='cancelled';
    nanOrders=nanOrders.filter(o=>o.status==='pending');
    saveOrders();
    // Delete from server
    if(userAddr){
      fetch('https://nan-production.up.railway.app/api/orders?wallet='+userAddr,{
        method:'DELETE',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({wallet:userAddr,id})
      }).catch(()=>{});
    }
  }
}

function listOrders(){
  return nanOrders.filter(o=>o.status==='pending');
}

function formatOrderSummary(order){
  if(order.type==='limit'){
    return `🎯 Limit: Sell ${order.amount} ${order.sellToken}→${order.buyToken} when rate ${order.condition==='gte'?'≥':'≤'} ${order.targetRate} (now: ${order.currentRate?.toFixed(4)||'?'})`;
  }
  if(order.type==='scheduled'){
    return `⏰ Scheduled: Send ${order.amount} ${order.token} to ${order.to?.slice(0,10)}… on ${new Date(order.executeAt).toLocaleString()}`;
  }
  if(order.type==='standing'){
    return `📅 Standing: Send ${order.amount} ${order.token} to ${order.to?.slice(0,10)}… every ${order.freq} (next: ${new Date(order.nextRun).toLocaleString()})`;
  }
  return '';
}

let agentMsgs=[{role:'assistant',content:"Hey! I'm NAN AI ✦  Ask me anything — crypto questions, DeFi, staking, CCTP bridging, or your live wallet. Try \"send 10 USDC\" and I'll set it up!"}];
let agentOpen=false;

let _agentToggleLock=false;
function toggleAgent(){
  if(_agentToggleLock)return;
  _agentToggleLock=true;
  setTimeout(()=>{_agentToggleLock=false;},400);
  try{
    agentOpen=!agentOpen;
    const panel=document.getElementById('agentPanel');
    console.log('[NAN AI] toggleAgent called, agentOpen='+agentOpen+', panel='+!!panel);
    if(!panel){console.error('agentPanel not found!');return;}
    panel.style.display=agentOpen?'flex':'none';
    panel.style.flexDirection='column';
    panel.style.position='fixed';
    panel.style.top='0';
    panel.style.left='0';
    panel.style.right='0';
    panel.style.bottom='0';
    panel.style.zIndex='999999999';
    if(agentOpen){
      try{renderAgentMsgs();}catch(e){console.error('renderAgentMsgs error:',e);}
      try{renderAgentChips();}catch(e){console.error('renderAgentChips error:',e);}
      try{scrollAgentBottom();}catch(e){}
    }
  }catch(e){console.error('toggleAgent error:',e);}
}

// AI button listeners — single source of truth, no onclick in HTML
function attachAIListeners(){
  function addToggle(el){
    if(!el||el._aiListenerAdded)return;
    el._aiListenerAdded=true;
    // Use click for desktop, touchend for mobile (prevents double-fire)
    el.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      toggleAgent();
    });
    el.addEventListener('touchend',function(e){
      e.preventDefault();
      e.stopPropagation();
      toggleAgent();
    },{passive:false});
  }
  addToggle(document.getElementById('aiBtn'));
  addToggle(document.getElementById('nanAiMoreBtn'));
  addToggle(document.getElementById('agentCloseBtn'));
}

// Attach on load and also expose for after-connect call
document.addEventListener('DOMContentLoaded', attachAIListeners);

// fix: auto-connect from landing page — calls correct function names
// connectSpecific() handles metamask/walletconnect/coinbase/circle/rabby
// ── Floating OTP modal (used when page-land is hidden) ──
async function sendFloatingOTP(){
  const email = document.getElementById('floatingEmailInput').value.trim();
  if(!email||!email.includes('@')){ toast('Enter a valid email','error'); return; }
  const btn = document.querySelector('#floatingEmailStep button');
  btn.textContent = 'Sending…'; btn.disabled = true;
  try{
    const res = await fetch('/api/otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send',email})});
    const data = await res.json();
    if(!data.success) throw new Error(data.error||'Failed');
    window._otpToken = data.token; window._otpExpiry = data.expiresAt;
    otpEmail = email;
    document.getElementById('floatingOtpEmailLabel').textContent = email;
    document.getElementById('floatingEmailStep').style.display = 'none';
    document.getElementById('floatingOtpStep').style.display = 'block';
    setTimeout(()=>document.getElementById('floatingOtpInput').focus(), 100);
  } catch(e){
    toast('Failed to send code: '+e.message,'error');
    btn.textContent = 'Send Code →'; btn.disabled = false;
  }
}
async function verifyFloatingOTP(){
  const otp = document.getElementById('floatingOtpInput').value.trim();
  if(!otp||otp.length<6){ toast('Enter the 6-digit code','error'); return; }
  const btns = document.querySelectorAll('#floatingOtpStep button');
  const btn = btns[0];
  btn.textContent = 'Verifying…'; btn.disabled = true;
  try{
    // Step 1: Verify OTP
    const res = await fetch('/api/otp',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'verify',email:otpEmail,otp,token:window._otpToken,expiresAt:window._otpExpiry})});
    const data = await res.json();
    if(!data.success) throw new Error(data.error||'Invalid code');

    // Step 2: Get or create Circle wallet
    btn.textContent = 'Setting up wallet…';
    const cwRes = await fetch('https://nan-production.up.railway.app/api/circle-wallets',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'getWallet',email:otpEmail})});
    const cw = await cwRes.json();
    if(!cw.walletId) throw new Error('Could not create wallet');

    circleWalletId=cw.walletId;
    circleWalletAddress=cw.address;
    circleWalletBlockchain=cw.blockchain;
    circleUserToken=cw.userToken;
    circleUserId=cw.userId;
    localStorage.setItem('circleWalletId',cw.walletId);
    localStorage.setItem('circleWalletAddr',cw.address);
    document.getElementById('floatingOtpModal').style.display='none';
    await onConnected(true,false);
  } catch(e){
    toast('Error: '+e.message,'error');
    btn.textContent = 'Verify & Connect'; btn.disabled = false;
  }
}

// sendEmailOTP() handles email — was incorrectly called sendOTP() before
// emailInput is the correct element id — was incorrectly otpEmail before
(function(){
  const params = new URLSearchParams(window.location.search);
  const connectType = params.get('connect');
  const connectEmail = params.get('email');
  if(!connectType) return;

  function tryConnect(){
    try{
      // hide landing page immediately in case overlay didn't catch it
      const land = document.getElementById('page-land');
      if(land){ land.style.display='none'; land.classList.remove('active'); }

      if(connectType === 'email' || connectType === 'circle'){
        // Always show floating OTP modal when coming from landing
        const modal = document.getElementById('floatingOtpModal');
        if(modal){
          modal.style.display = 'flex';
          const inp = document.getElementById('floatingEmailInput');
          if(inp){
            if(connectEmail){
              inp.value = connectEmail;
              setTimeout(()=>sendFloatingOTP(), 300);
            } else {
              inp.focus();
            }
          }
        }
      } else {
        // handles: metamask, walletconnect, coinbase, circle, rabby
        if(typeof connectSpecific === 'function') connectSpecific(connectType);
      }
    } catch(e){ console.log('Auto-connect error:', e.message); }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryConnect, 1200));
  } else {
    setTimeout(tryConnect, 1200);
  }
})();
function resizeAIPanel(){
  const btn=document.getElementById('aiBtn');
  if(!btn)return;
  btn.style.right='18px';
  btn.style.bottom='96px';
}
window.addEventListener('resize',resizeAIPanel);

function renderAgentMsgs(){
  const el=document.getElementById('agentMessages');
  if(!el)return;
  el.innerHTML=agentMsgs.map(m=>`
    <div style="display:flex;flex-direction:column;align-items:${m.role==='user'?'flex-end':'flex-start'};">
      <div style="max-width:85%;padding:9px 13px;border-radius:${m.role==='user'?'14px 14px 3px 14px':'14px 14px 14px 3px'};background:${m.role==='user'?'#7000ff':'var(--card)'};border:${m.role==='user'?'none':'1px solid var(--border)'};color:var(--text);font-size:.75rem;line-height:1.55;">${m.content}</div>
      ${m.action?`<button onclick='executeAgentAction(${JSON.stringify(m.action)})' style="margin-top:6px;padding:7px 14px;border-radius:10px;background:#7000ff;border:none;color:#f3e8ff;font-size:.7rem;font-weight:700;cursor:pointer;">⚡ ${m.action.action.toUpperCase()} ${m.action.amount||''} ${m.action.token||''}</button>`:''}
    </div>
  `).join('');
}
function renderAgentChips(){
  if(agentMsgs.length>1){document.getElementById('agentChips').innerHTML='';return;}
  // Context-aware chips based on current wallet state
  const chips=[];
  const usdc=parseFloat(usdcBal||0), eurc=parseFloat(eurcBal||0);
  if(usdc>0) chips.push("What's my balance?");
  if(usdc>1) chips.push("Swap USDC → EURC");
  if(eurc>1) chips.push("Swap EURC → USDC");
  if(usdc>5) chips.push("Supply USDC to earn");
  if(usdc>0||eurc>0) chips.push("Send tokens");
  chips.push("Bridge to Sepolia");
  chips.push("My pending orders");
  if(nanOrders.length>0) chips.push("Cancel all orders");
  chips.push("How does earn work?");
  document.getElementById('agentChips').innerHTML=chips.slice(0,6).map(c=>`<button onclick="sendAgentMsg('${c}')" style="font-size:.72rem;color:var(--accent3);background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:20px;padding:4px 10px;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;">${c}</button>`).join('');
}
function scrollAgentBottom(){const el=document.getElementById('agentMessages');setTimeout(()=>{el.scrollTop=el.scrollHeight;},50);}

async function sendAgentMsg(text){
  const input=document.getElementById('agentInput');
  const msg=text||input.value.trim();
  if(!msg)return;
  input.value='';
  document.getElementById('agentChips').innerHTML='';
  agentMsgs.push({role:'user',content:msg});
  agentMsgs.push({role:'assistant',content:'<span class="spinner" style="border-top-color:var(--accent3);"></span>'});
  renderAgentMsgs();scrollAgentBottom();

  // Build rich context for AI
  const lendPos=parseFloat(document.getElementById('lendSupplied')?.textContent||'0');
  const borrowPos=parseFloat(document.getElementById('lendBorrowed')?.textContent||'0');
  const myNames=arcNames.filter(n=>n.owner===userAddr).map(n=>n.name+'.arc').join(', ')||'none';
  const pendingOrders=nanOrders.length;
  const context=`You are NAN AI ✦ — a smart DeFi assistant inside NAN Wallet on Arc Testnet. Be concise, friendly, direct. No markdown.

LIVE WALLET DATA (use these exact numbers):
- Address: ${userAddr||'Not connected'}
- Wallet: ${isCircleWallet?'Circle Programmable Wallet (email login)':'External wallet (MetaMask/Rabby)'}
- USDC Balance: ${parseFloat(usdcBal||0).toFixed(2)} USDC
- EURC Balance: ${parseFloat(eurcBal||0).toFixed(2)} EURC
- Network: ${onArcNetwork||isCircleWallet?'Arc Testnet (Chain 5042002)':'Not connected to Arc'}
- FX Rate: 1 USDC = ${FX.toFixed(4)} EURC · 1 EURC = ${(1/FX).toFixed(4)} USDC
- Gas: ~0.009 USDC (paid in USDC via Circle Paymaster — no ETH needed!)

ABOUT ARC (Circle's L1 blockchain):
- Arc is the "Economic OS for the internet" — a stablecoin-native L1 by Circle
- Launched public testnet October 2025 with 100+ companies including Aave, Curve, Maple
- Sub-second transaction finality (<1 second!)
- Gas fees paid in USDC — never need volatile tokens
- Native USDC + EURC — fully backed 1:1 by Circle
- Mainnet launching 2026

ABOUT CIRCLE PRODUCTS IN NAN:
- USDC: World's largest regulated digital dollar — 100% backed, 30+ chains
- EURC: World's largest regulated digital euro — MiCAR compliant
- CCTP (Cross-Chain Transfer Protocol): Burns USDC on Arc, mints natively on destination — $126B+ cumulative volume, 26+ chains. Arc supports Standard Transfer only as source. CCTP V1 (Legacy) phase-out begins July 31, 2026 — still active until deprecation completes..
- Circle Programmable Wallets: Real Circle-managed wallets created via API on email login
- Circle Gateway: Unified USDC balance across all chains — instant transfers under 500ms, permissionless
- USDC Paymaster: Sponsor gas in USDC so users never need native tokens
- Band Protocol: On-chain price oracle for live USDC/EURC FX rates
- Circle MCP Server: Official Circle AI tooling at api.circle.com/v1/codegen/mcp

CIRCLE GATEWAY DATA:
- Your unified Gateway USDC balance: ${gatewayBalance?.total||'loading'} USDC across all chains
- Gateway enables instant crosschain USDC without waiting for finality

NAN WALLET FEATURES:
- Send USDC/EURC to any wallet address or .arc name
- Swap at live FX rates (NANSwap on Arc)
- Lend USDC and earn 4.80% APY (NANLendingPool on Arc)
- Borrow against USDC collateral at 7.20% APR
- Bridge USDC cross-chain via Circle CCTP V2 + Circle Gateway unified balance
- Register .arc names (NANNameRegistry on Arc)
- Email login creates a real Circle Developer-Controlled Wallet on Arc Testnet
- All transactions on Arc Testnet — real on-chain!

RECENT TRANSACTIONS:
${txHistory.slice(0,5).map(t=>`${t.type} ${t.amount} ${t.token||''} - ${new Date(t.ts).toLocaleDateString()}`).join('\n')||'None yet'}

PENDING ORDERS:
${listOrders().length>0?listOrders().map(o=>formatOrderSummary(o)).join('\n'):'No pending orders'}

RULES:
- Use REAL wallet numbers above — never fabricate
- Keep replies under 80 words, friendly and enthusiastic  
- NEVER show raw JSON, code, or ACTION tags in your text
- If user wants to DO something, add <ACTION> AFTER your text reply:
  send:     <ACTION>{"action":"send","amount":1,"token":"USDC","to":"0x..."}</ACTION>
  swap:     <ACTION>{"action":"swap","amount":1,"from":"USDC","to":"EURC"}</ACTION>
  limit:    <ACTION>{"action":"limit","amount":50,"sellToken":"USDC","buyToken":"EURC","targetRate":0.95,"condition":"gte"}</ACTION>
  schedule: <ACTION>{"action":"schedule","amount":20,"token":"USDC","to":"0x...","when":"friday"}</ACTION>
  standing: <ACTION>{"action":"standing","amount":100,"token":"USDC","to":"0x...","freq":"monthly"}</ACTION>
  cancel:   <ACTION>{"action":"cancel_all"}</ACTION>
  list:     <ACTION>{"action":"list_orders"}</ACTION>
  lend:     <ACTION>{"action":"navigate","tab":"lend"}</ACTION>
  bridge:   <ACTION>{"action":"navigate","tab":"bridge"}</ACTION>
  name:     <ACTION>{"action":"navigate","tab":"arcname"}</ACTION>
  history:  <ACTION>{"action":"navigate","tab":"history"}</ACTION>
- ACTION block is invisible to user — never mention it`;

  try{
    const res=await fetch('https://nan-production.up.railway.app/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        system:context+`\n- USDC Supplied: ${lendPos} USDC\n- USDC Borrowed: ${borrowPos} USDC\n- .arc Names: ${myNames}\n- Pending Orders: ${pendingOrders}`,usdcBal:usdcBal,eurcBal:eurcBal,userAddress:userAddr,
        messages:agentMsgs.slice(0,-1).filter(m=>!m.content.includes('spinner')).map(m=>({role:m.role,content:m.content}))
      }),
    });
    const data=await res.json();
    if(!res.ok || data.error){
      agentMsgs[agentMsgs.length-1]={role:'assistant',content:`⚠️ ${data.error||'API error '+res.status}. Make sure GROQ_API_KEY is set in Vercel → Settings → Environment Variables.`};
      renderAgentMsgs();scrollAgentBottom();
      return;
    }
    const reply=data.reply||"Sorry, couldn't reach the AI.";
    const actionMatch=reply.match(/<ACTION>([\s\S]*?)<\/ACTION>/);
    let action=null;
    try{if(actionMatch)action=JSON.parse(actionMatch[1].trim());}catch{}
    const clean=reply.replace(/<ACTION>[\s\S]*?<\/ACTION>/g,'').trim();
    agentMsgs[agentMsgs.length-1]={role:'assistant',content:clean,action};
    // Speak the AI response
    speakResponse(clean);
  }catch(err){
    console.error('Agent error:', err);
    agentMsgs[agentMsgs.length-1]={role:'assistant',content:`⚠️ ${err.message||'Connection error'}. Check that GROQ_API_KEY is set in Vercel environment variables.`};
  }
  renderAgentMsgs();scrollAgentBottom();
}

function executeAgentAction(action){
  switch(action.action){
    case 'send':
      agentOpen=false;document.getElementById('agentPanel').style.display='none';
      goPage('send');
      setTimeout(()=>{document.getElementById('recipInput').value=action.to||'';document.getElementById('amtInput').value=action.amount||'';sendToken=action.token||'USDC';document.getElementById('sendTokenLabel').textContent=sendToken;validateSend();},200);break;
    case 'swap':
      agentOpen=false;document.getElementById('agentPanel').style.display='none';
      goPage('swap');setTimeout(()=>{document.getElementById('swapFrom').value=action.amount||'';calcSwap();},200);break;
    case 'navigate':
      agentOpen=false;document.getElementById('agentPanel').style.display='none';
      goPage(action.tab);break;
    case 'limit':{
      const order=createOrder({type:'limit',amount:action.amount,sellToken:action.sellToken||'USDC',buyToken:action.buyToken||'EURC',targetRate:action.targetRate,condition:action.condition||'gte',currentRate:FX});
      addAgentMsg(`🎯 Limit order set! I'll sell ${action.amount} ${action.sellToken||'USDC'} → ${action.buyToken||'EURC'} when rate ${action.condition==='gte'?'reaches':'drops to'} ${action.targetRate}. Current rate: ${FX.toFixed(4)}. Order ID: ${order.id}`);
      break;}
    case 'schedule':{
      const executeAt=parseWhen(action.when||'1 hour');
      const order=createOrder({type:'scheduled',amount:action.amount,token:action.token||'USDC',to:action.to,executeAt,when:action.when});
      addAgentMsg(`⏰ Scheduled! Will send ${action.amount} ${action.token||'USDC'} to ${(action.to||'').slice(0,10)}… on ${new Date(executeAt).toLocaleString()}. Order ID: ${order.id}`);
      break;}
    case 'standing':{
      const interval=parseInterval(action.freq||'week');
      const nextRun=parseNextOccurrence(action.freq||'week');
      const order=createOrder({type:'standing',amount:action.amount,token:action.token||'USDC',to:action.to,interval,nextRun,freq:action.freq||'week'});
      addAgentMsg(`📅 Standing order created! Will send ${action.amount} ${action.token||'USDC'} to ${(action.to||'').slice(0,10)}… every ${action.freq||'week'}. Next run: ${new Date(nextRun).toLocaleString()}. Order ID: ${order.id}`);
      break;}
    case 'cancel_all':{
      const count=nanOrders.length;
      nanOrders=[];saveOrders();
      // Delete all from server
      if(userAddr){fetch('https://nan-production.up.railway.app/api/orders?wallet='+userAddr,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:userAddr,id:'all'})}).catch(()=>{});}
      addAgentMsg(`🗑️ Cancelled all ${count} pending order${count!==1?'s':''}. Your queue is clear!`);
      break;}
    case 'list_orders':{
      const orders=listOrders();
      if(!orders.length){addAgentMsg('📋 No pending orders. Your queue is empty!');}
      else{addAgentMsg('📋 Your pending orders:\n\n'+orders.map((o,i)=>`${i+1}. ${formatOrderSummary(o)}`).join('\n'));}
      renderAgentMsgs();scrollAgentBottom();
      break;}
  }
  renderAgentMsgs();scrollAgentBottom();
}

// ═══════════════════════════════════════════
// WALLET PICKER
// ═══════════════════════════════════════════
function showWalletPicker(){
  document.getElementById('walletModalOverlay').classList.add('show');
}
function hideWalletPicker(e){
  if(!e||e.target===document.getElementById('walletModalOverlay')){
    document.getElementById('walletModalOverlay').classList.remove('show');
  }
}
async function connectSpecific(walletType){
  hideWalletPicker();
  if(walletType==='walletconnect'){
    toast('WalletConnect — use MetaMask mobile or scan QR','info',5000);
    return;
  }
  if(walletType==='circle'){
    // Show floating OTP modal (works whether page-land is visible or not)
    const modal=document.getElementById('floatingOtpModal');
    const landHidden=document.getElementById('page-land')?.style.display==='none';
    if(modal && landHidden){
      modal.style.display='flex';
      setTimeout(()=>document.getElementById('floatingEmailInput')?.focus(),100);
    } else {
      // page-land is visible, focus email input there
      const emailInput=document.getElementById('emailInput');
      if(emailInput){ emailInput.focus(); emailInput.scrollIntoView({behavior:'smooth'}); }
    }
    return;
  }
  let detectedWp=null;
  const providers=window.ethereum?.providers;
  if(providers?.length){
    if(walletType==='metamask') detectedWp=providers.find(p=>p.isMetaMask&&!p.isRabby)||providers.find(p=>p.isMetaMask);
    else if(walletType==='rabby') detectedWp=providers.find(p=>p.isRabby);
    else if(walletType==='coinbase') detectedWp=providers.find(p=>p.isCoinbaseWallet);
    if(!detectedWp) detectedWp=providers[0];
  } else {
    detectedWp=window.ethereum||null;
  }
  if(!detectedWp){toast(walletType+' not found — is it installed?','error',6000);return;}
  await _doConnect(detectedWp, walletType);
}

// ═══════════════════════════════════════════
// LEND & BORROW (on-chain — NANLendingPool)
// ═══════════════════════════════════════════
let lendPositions={supplied:0,borrowed:0,interest:0};
let lendAsset='USDC';
let lendDuration=1, lendFee=2;

// ═══════════════════════════════════════════
// CIRCLE GATEWAY — Unified USDC Balance
// ═══════════════════════════════════════════
let gatewayBalance={total:'0.00',balances:{}};

async function depositToGateway() {
  if (!circleWalletId) return toast('Connect with email wallet to deposit to Gateway','warning');
  const _wId = circleWalletId;
  const amount = document.getElementById('gatewayDepositAmt')?.value;
  if (!amount || parseFloat(amount) < 1) return toast('Enter at least 1 USDC','warning');
  toast('Approving Gateway contract...','info');
  try {
    const r = await fetch('https://nan-production.up.railway.app/api/gateway-deposit', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ walletId: _wId, walletAddress: circleWalletAddress, amount }),
    });
    const data = await r.json();
    if (!data.success) return toast(data.error || 'Deposit failed','error');
    toast('✅ Deposit submitted! Gateway balance updates in up to 20 mins per Circle docs','success',8000);
    // Poll gateway balance every 2 min for up to 20 min
    let polls=0;
    const gp=setInterval(async()=>{
      polls++;
      await refreshGatewayBalance();
      if(polls>=10)clearInterval(gp);
    },120000);
  } catch(err) {
    toast('Gateway deposit error: ' + err.message,'error');
  }
}

async function refreshGatewayBalance(){
  if(!userAddr) return;
  const display=document.getElementById('gatewayTotal');
  const chains=document.getElementById('gatewayChains');
  if(display) display.textContent='Loading...';
  try{
    const res=await fetch('https://nan-production.up.railway.app/api/gateway',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'getBalance',address:userAddr}),
    });
    if(!res.ok) throw new Error('Gateway API returned '+res.status);
    const data=await res.json();
    if(data.success){
      gatewayBalance=data;
      if(display) display.textContent=data.total+' USDC';
      if(chains){
        const entries=Object.entries(data.balances||{}).filter(([_,v])=>parseFloat(v)>0);
        chains.innerHTML=entries.length===0
          ?'<div style="font-size:.72rem;color:var(--text3);text-align:center;">No Gateway balance yet — bridge USDC to create one</div>'
          :entries.map(([chain,amount])=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:rgba(168,85,247,.06);border-radius:6px;"><span style="font-size:.72rem;color:var(--text2);">${chain.replace(/_/g,' ')}</span><span style="font-size:.72rem;font-weight:600;color:var(--accent3);">${parseFloat(amount).toFixed(2)} USDC</span></div>`).join('');
      }
    }else{
      if(display) display.textContent='—';
      if(chains) chains.innerHTML='<div style="font-size:.72rem;color:var(--text3);text-align:center;">'+(data.error||'Gateway unavailable — bridge USDC to get started')+'</div>';
    }
  }catch(e){
    if(display) display.textContent='—';
    if(chains) chains.innerHTML='<div style="font-size:.72rem;color:var(--text3);text-align:center;">Gateway unavailable — bridge USDC to get started</div>';
    console.log('[gateway]',e.message);
  }
}

// ═══════════════════════════════════════════
// CIRCLE MCP — AI with Circle context
// ═══════════════════════════════════════════
let poolStats={usdcLiq:0,eurcLiq:0,totalUsers:0,totalTxns:0};

async function checkPoolLiquidity(){
  try{
    const readProvider=getArcProvider();
    const swapRead=new ethers.Contract(SWAP_CONTRACT,SWAP_ABI,readProvider);
    const [usdcLiq,eurcLiq]=await swapRead.getLiquidity();
    poolStats.usdcLiq=parseFloat(ethers.formatUnits(usdcLiq,6));
    poolStats.eurcLiq=parseFloat(ethers.formatUnits(eurcLiq,6));
    console.log('Pool liquidity — USDC:',poolStats.usdcLiq,'EURC:',poolStats.eurcLiq);

    // Show liquidity info on swap page
    // Pool stats logged to console only — no banner shown to users
    console.log('Pool liquidity — USDC:',poolStats.usdcLiq,'EURC:',poolStats.eurcLiq);
  }catch(e){console.log('Pool check error:',e.message);}
}

// Track user metrics for grant application
function trackEvent(event,data={}){
  try{
    const metrics=JSON.parse(localStorage.getItem('nan_metrics')||'{"events":[]}');
    metrics.events.push({event,data,ts:Date.now(),addr:userAddr?.slice(0,10)||'anon'});
    if(metrics.events.length>100) metrics.events=metrics.events.slice(-100);
    localStorage.setItem('nan_metrics',JSON.stringify(metrics));
  }catch(e){}
}

function getMetrics(){
  try{
    const metrics=JSON.parse(localStorage.getItem('nan_metrics')||'{"events":[]}');
    const events=metrics.events||[];
    return{
      totalSessions:events.filter(e=>e.event==='connect').length,
      totalSends:events.filter(e=>e.event==='send').length,
      totalSwaps:events.filter(e=>e.event==='swap').length,
      totalBridges:events.filter(e=>e.event==='bridge').length,
      totalLends:events.filter(e=>e.event==='lend').length,
      totalNames:events.filter(e=>e.event==='arcname').length,
    };
  }catch(e){return{};}
}

function updateBorrowMax(){
  const maxBorrow = lendPositions ? Math.max(0, lendPositions.supplied*0.75 - lendPositions.borrowed) : 0;
  const maxEl = document.getElementById('borrowMaxHint');
  if(maxEl) maxEl.textContent = maxBorrow > 0 ? 'Max: '+maxBorrow.toFixed(2)+' USDC' : 'No capacity';
}
function initLendUI(){
  // Update max borrow display
  const maxBorrow = lendPositions ? Math.max(0, (lendPositions.supplied*0.75) - lendPositions.borrowed) : 0;
  const onChainCol = lendPositions.collateral||0;
  const maxBorrowDisplay = Math.max(0, onChainCol*0.75 - lendPositions.borrowed);
  const maxEl = document.getElementById('borrowMaxDisplay');
  if(maxEl){
    if(onChainCol===0) maxEl.textContent = 'Supply USDC to enable borrowing';
    else if(maxBorrowDisplay<=0) maxEl.textContent = 'Limit reached';
    else maxEl.textContent = maxBorrowDisplay.toFixed(2)+' USDC';
  }
  const maxEl2 = document.getElementById('borrowMaxHint');
  if(maxEl2) maxEl2.textContent = maxBorrowDisplay > 0 ? 'MAX: '+maxBorrowDisplay.toFixed(2)+' USDC' : '';
  const hintEl = document.getElementById('borrowMaxHint');
  if(hintEl) hintEl.textContent = maxBorrow > 0 ? 'Max: '+maxBorrow.toFixed(2)+' USDC' : '';
  updateLendPositions();
  refreshLendPosition();
  refreshArcNames();
  refreshGatewayBalance();
  checkPoolLiquidity();
}
function setLendTab(tab,el){
  document.querySelectorAll('#page-lend .stab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.stake-panel').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('lp-'+tab).classList.add('active');
}
function setLendAsset(asset,el){
  lendAsset=asset;
  el.closest('.type-sel').querySelectorAll('.topt').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}
function setSupplyMax(){document.getElementById('supplyAmt').value=Math.max(0,parseFloat(lendAsset==='USDC'?usdcBal:eurcBal)-0.02).toFixed(6);}
function setBorrowMax(){document.getElementById('borrowAmt').value=(lendPositions.supplied*0.75).toFixed(6);}
function setRepayMax(){document.getElementById('repayAmt').value=lendPositions.borrowed.toFixed(6);}
function setWithdrawMax(){document.getElementById('withdrawAmt').value=lendPositions.supplied.toFixed(6);}

function updateLendPositions(){
  // Update savings card
  const supEl=document.getElementById('suppliedAmt');
  if(supEl) supEl.textContent=lendPositions.supplied.toFixed(2)+' USDC';
  const borEl=document.getElementById('borrowedAmt');
  if(borEl) borEl.textContent=lendPositions.borrowed.toFixed(2)+' USDC';
  const intEl=document.getElementById('accruedInterest');
  if(intEl) intEl.textContent='+'+lendPositions.interest.toFixed(6)+' earned';
  // Update repay panel
  const rbEl=document.getElementById('repayBorrowed');
  if(rbEl) rbEl.textContent=lendPositions.borrowed.toFixed(2)+' USDC';
  const riEl=document.getElementById('repayInterest');
  if(riEl) riEl.textContent=lendPositions.interest.toFixed(6)+' USDC';
  const rtEl=document.getElementById('repayTotal');
  if(rtEl) rtEl.textContent=(lendPositions.borrowed+lendPositions.interest).toFixed(2)+' USDC';
  // Update withdraw available
  const waEl=document.getElementById('withdrawAvail');
  if(waEl) waEl.textContent=lendPositions.supplied.toFixed(2);
  // Update supply available
  const saEl=document.getElementById('supplyAvail');
  if(saEl) saEl.textContent=parseFloat(usdcBal||0).toFixed(2);
  // Update borrow max
  const bmEl=document.getElementById('borrowMaxDisplay');
  if(bmEl) bmEl.textContent=(lendPositions.supplied*0.75).toFixed(2)+' USDC';
  // Hidden compat elements
  const hfEl=document.getElementById('healthFactor');
  if(hfEl){const hf=lendPositions.borrowed>0?(lendPositions.supplied*0.8/lendPositions.borrowed).toFixed(2):'—';hfEl.textContent=hf;}
  const tsEl=document.getElementById('totalSupplied');
  if(tsEl) tsEl.textContent=lendPositions.supplied>0?'$'+lendPositions.supplied.toFixed(2):'—';
  const urEl=document.getElementById('utilizationRate');
  if(urEl) urEl.textContent=lendPositions.supplied>0?((lendPositions.borrowed/lendPositions.supplied)*100).toFixed(1)+'%':'—';
}

async function doSupply(){
  if(!userAddr){toast('Connect wallet first','error');return;}
  const amt=parseFloat(document.getElementById('supplyAmt').value);
  if(!amt||amt<=0){toast('Enter an amount','error');return;}
  const bal=lendAsset==='USDC'?parseFloat(usdcBal):parseFloat(eurcBal);
  if(amt>bal){toast('Insufficient '+lendAsset,'error');return;}
  const btn=document.querySelector('#lp-supply button.btn');
  btn.innerHTML='<span class="spinner"></span>Approving...';btn.disabled=true;
  try{
    const tokenAddr=lendAsset==='USDC'?USDC_ADDR:EURC_ADDR;
    // Both USDC and EURC use 6 decimals on Arc Testnet
    const amtAtomic = Math.floor(amt*1_000_000).toString();
    if(isCircleWallet&&circleWalletId){
      // Circle email wallet path
      btn.innerHTML='<span class="spinner"></span>Approving...';
      const supApprKey='nan_lend_approved_'+circleWalletId+'_'+lendAsset;
      if(!sessionStorage.getItem(supApprKey)){
        fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
            contractAddress:tokenAddr,functionSignature:'approve(address,uint256)',
            params:[LENDING_CONTRACT,'115792089237316195423570985008687907853269984665640564039457584007913129639935']})})
          .then(()=>sessionStorage.setItem(supApprKey,'1')).catch(()=>{});
        await new Promise(r=>setTimeout(r,2000));
      }
      btn.innerHTML='<span class="spinner"></span>Supplying on Arc...';
      const supRes=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
          contractAddress:LENDING_CONTRACT,functionSignature:'supply(uint256)',
          params:[amtAtomic]})});
      const supData=await supRes.json();
      if(!supData.success)throw new Error(supData.error||'Supply failed — check NANLendingPool is deployed & you have enough USDC');
      toast('✓ Supply submitted!','success',4000);
      // Arc confirms in <1s — refresh balance after short delay
      setTimeout(async()=>{for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,3000));await refreshBalances();}},0);
      const supplyHash=supData.txHash||supData.transactionId||'pending';
      setTimeout(()=>resolveCircleTxHash(supplyHash),2000);
      addTx({hash:supplyHash,to:LENDING_CONTRACT,toRaw:'NANLendingPool',amount:amt.toFixed(6),type:'out',token:lendAsset,ts:Date.now(),confirmed:true,source:'lending'});
      if(supData.pending&&supData.transactionId){
        pollTxStatus(supData.transactionId,'',async()=>{
          txHistory[0].confirmed=true;saveTxHistory();
          toast('✓ Supply confirmed on-chain!','success',4000);
          await refreshBalances();await refreshLendPosition();
        });
      }else{setTimeout(()=>{refreshBalances();refreshLendPosition();},8000);}
    } else if(signer){
      // MetaMask path
      const tokenContract=new ethers.Contract(tokenAddr,ERC20_ABI,signer);
      const lendContract=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,signer);
      const amtParsed=ethers.parseUnits(amt.toFixed(6),6);
      const lendAllowance=await tokenContract.allowance(userAddr,LENDING_CONTRACT);
      if(lendAllowance<amtParsed){
        btn.innerHTML='<span class="spinner"></span>Approving…';
        const lendExact=ethers.parseUnits(amt.toFixed(6),6);
        const approveTx=await tokenContract.approve(LENDING_CONTRACT,lendExact,arcGasOpts());
        await approveTx.wait(0);
      }
      btn.innerHTML='<span class="spinner"></span>Supplying on Arc...';
      const tx=await lendContract.supply(amtParsed,arcGasOpts());
      await tx.wait(0);
      toast('✓ Supplied '+amt.toFixed(2)+' '+lendAsset+'! Adding as collateral…','info',4000);
      addTx({hash:tx.hash,to:LENDING_CONTRACT,toRaw:'NANLendingPool Supply',amount:amt.toFixed(6),type:'out',token:lendAsset,ts:Date.now(),confirmed:true,source:'lending'});
      
      
      
      await refreshBalances();
      await refreshLendPosition();
    } else {
      throw new Error('No wallet connected');
    }
  }catch(err){
    const msg=err?.reason||err?.message||'Supply failed';
    toast('Supply failed: '+msg.slice(0,100),'error',5000);
  }
  document.getElementById('supplyAmt').value='';
  btn.innerHTML='Supply '+lendAsset;btn.disabled=false;
}

async function refreshLendPosition(){
  if(!userAddr)return;
  try{
    const readProvider=provider||getArcProvider();
    const lendContract=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,readProvider);
    const pos=await lendContract.getPosition(userAddr);
    // Log all position values to console for debugging
    // Correct index mapping confirmed from contract:
    // pos[0]=supplied, pos[1]=supplyInterest, pos[2]=borrowed
    // pos[3]=borrowInterest, pos[4]=collateral, pos[5]=healthFactor
    lendPositions.supplied=parseFloat(ethers.formatUnits(pos[0],6));
    lendPositions.interest=parseFloat(ethers.formatUnits(pos[1],6));
    lendPositions.borrowed=parseFloat(ethers.formatUnits(pos[2],6));
    lendPositions.collateral=parseFloat(ethers.formatUnits(pos[4],6));
    console.log('Position:',lendPositions);
    updateLendPositions();
  }catch(e){console.log('Lend position fetch error:',e.message);}
}

function updateBorrowPreview(){
  const amt = parseFloat(document.getElementById('borrowAmt').value)||0;
  const preview = document.getElementById('borrowPreview');
  const receiveEl = document.getElementById('borrowReceiveAmt');
  const interestEl = document.getElementById('borrowDailyInterest');
  if(!preview) return;
  if(amt > 0){
    preview.style.display = 'block';
    if(receiveEl) receiveEl.textContent = amt.toFixed(2)+' USDC';
    const dailyInterest = (amt * 0.072 / 365).toFixed(4);
    if(interestEl) interestEl.textContent = dailyInterest+' USDC/day';
  } else {
    preview.style.display = 'none';
  }
}
async function doBorrow(){
  const amt=parseFloat(document.getElementById('borrowAmt').value);
  if(!amt||amt<=0){toast('Enter an amount to borrow','error');return;}
  if(!userAddr){toast('Connect wallet first','error');return;}
  // Refresh position first to get latest on-chain data
  await refreshLendPosition();
  if(lendPositions.supplied===0&&(lendPositions.collateral||0)===0){
    toast('Supply USDC first before borrowing','error',4000);return;
  }
  // Use on-chain collateral as ground truth (from getPosition pos[4])
  const onChainCollateral = lendPositions.collateral||0;
  const maxBorrow = Math.max(0, onChainCollateral*0.75 - lendPositions.borrowed);
  if(onChainCollateral===0){
    toast('No collateral registered — supply USDC first, it will auto-register as collateral','error',5000);return;
  }
  if(amt > maxBorrow){
    toast('Max you can borrow: '+maxBorrow.toFixed(2)+' USDC','error',4000);return;
  }

  const btn=document.getElementById('borrowBtn');
  if(btn){btn.innerHTML='<span class="spinner"></span>Processing…';btn.disabled=true;}

  try{
    const amtParsed=ethers.parseUnits(amt.toFixed(6),6);
    const amtAtomic=Math.floor(amt*1_000_000).toString();

    // Collateral is registered during supply — just borrow directly

    if(isCircleWallet&&circleWalletId){
      if(btn)btn.innerHTML='<span class="spinner"></span>Borrowing on Arc…';
      const r=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
          contractAddress:LENDING_CONTRACT,functionSignature:'borrow(uint256)',params:[amtAtomic]})});
      const d=await r.json();
      if(!d.success)throw new Error(d.error||'Borrow failed');
      toast('✓ Borrow submitted!','success',4000);
      setTimeout(()=>resolveCircleTxHash(d.txHash||d.transactionId),2000);
      addTx({hash:d.txHash||d.transactionId||'pending',to:LENDING_CONTRACT,toRaw:'Borrow',amount:amt.toFixed(6),type:'in',token:'USDC',ts:Date.now(),confirmed:true,source:'lending'});
      setTimeout(async()=>{for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,3000));await refreshBalances();refreshLendPosition();}},0);

    }else if(signer){
      const lendContract=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,signer);
      toast('Confirming borrow…','info',3000);
      const tx=await lendContract.borrow(amtParsed,arcGasOpts());
      await tx.wait(0);
      toast('✓ Borrowed '+amt.toFixed(2)+' USDC on Arc!','success',5000);
      addTx({hash:tx.hash,to:LENDING_CONTRACT,toRaw:'Borrow',amount:amt.toFixed(6),type:'in',token:'USDC',ts:Date.now(),confirmed:true,source:'lending'});
      await refreshBalances();
      await refreshLendPosition();

    }else{throw new Error('No wallet connected');}

  }catch(err){
    const msg=err.reason||err.message||'';
    console.error('Borrow error:',msg);
    if(msg.includes('LTV')||msg.includes('ltv')||msg.includes('collateral')||msg.includes('estimateGas')||msg.includes('Exceeds')){
      const maxB=Math.max(0,lendPositions.supplied*0.75-lendPositions.borrowed).toFixed(2);
      toast('Cannot borrow — max is '+maxB+' USDC. Try a smaller amount.','error',6000);
    }else if(msg.includes('insufficient')||msg.includes('liquidity')){
      toast('Not enough liquidity in the pool right now','error',5000);
    }else if(msg.includes('user rejected')||msg.includes('denied')){
      toast('Transaction cancelled','error',3000);
    }else{
      toast('Borrow failed — '+msg.slice(0,60),'error',6000);
    }
  }finally{
    if(btn){btn.innerHTML='Borrow USDC';btn.disabled=false;}
  }
}

async function doRepay(){
  const amt=parseFloat(document.getElementById('repayAmt').value);
  if(!amt||amt<=0){toast('Enter an amount','error');return;}
  if(amt>lendPositions.borrowed){toast('More than you owe','error');return;}
  const btn=document.querySelector('#lp-repay button');
  btn.innerHTML='<span class="spinner"></span>Repaying…';btn.disabled=true;
  try{
    const amtAtomic=Math.floor(amt*1_000_000).toString();
    if(isCircleWallet&&circleWalletId){
      // Approve first
      const repApprKey='nan_repay_approved_'+circleWalletId;
      if(!sessionStorage.getItem(repApprKey)){
        fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:USDC_ADDR,functionSignature:'approve(address,uint256)',params:[LENDING_CONTRACT,'115792089237316195423570985008687907853269984665640564039457584007913129639935']})})
          .then(()=>sessionStorage.setItem(repApprKey,'1')).catch(()=>{});
        await new Promise(r=>setTimeout(r,2000));
      }
      const r=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:LENDING_CONTRACT,functionSignature:'repay(uint256)',params:[amtAtomic]})});
      const d=await r.json();
      if(!d.success)throw new Error(d.error||'Repay failed');
      toast('✓ Repay submitted!','success',4000);
      setTimeout(async()=>{for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,3000));await refreshBalances();}},0);
      addTx({hash:d.txHash||d.transactionId,to:LENDING_CONTRACT,toRaw:'NANLendingPool Repay',amount:amt.toFixed(6),type:'out',token:'USDC',ts:Date.now(),confirmed:true,source:'lending'});
      setTimeout(()=>{refreshBalances();refreshLendPosition();},8000);
    }else if(signer){
      const usdc=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
      const lendContract=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,signer);
      const amtParsed=ethers.parseUnits(amt.toFixed(6),6);
      const repayAllowance=await usdc.allowance(userAddr,LENDING_CONTRACT);
      if(repayAllowance<amtParsed){
        const repayExact=ethers.parseUnits(amt.toFixed(6),6);
        const appTx=await usdc.approve(LENDING_CONTRACT,repayExact,arcGasOpts());
        await appTx.wait(1);
      }
      const tx=await lendContract.repay(amtParsed,arcGasOpts());
      await tx.wait(0);
      toast('✓ Repaid '+amt.toFixed(2)+' USDC on Arc!','success',5000);
      addTx({hash:tx.hash,to:LENDING_CONTRACT,toRaw:'NANLendingPool Repay',amount:amt.toFixed(6),type:'out',token:'USDC',ts:Date.now(),confirmed:true,source:'lending'});
      await refreshBalances();await refreshLendPosition();
    }else{throw new Error('No wallet connected');}
  }catch(err){toast('Repay failed: '+err.message.slice(0,100),'error',5000);}
  document.getElementById('repayAmt').value='';
  btn.innerHTML='Repay Debt';btn.disabled=false;
}
async function doWithdraw(){
  const amt=parseFloat(document.getElementById('withdrawAmt').value);
  if(!amt||amt<=0){toast('Enter an amount','error');return;}
  if(amt>lendPositions.supplied){toast('More than supplied','error');return;}
  if(lendPositions.borrowed>0&&(lendPositions.supplied-amt)*0.8<lendPositions.borrowed){toast('Would make health factor unsafe','error');return;}
  const btn=document.querySelector('#lp-withdraw button');
  btn.innerHTML='<span class="spinner"></span>Withdrawing…';btn.disabled=true;
  try{
    const amtAtomic=Math.floor(amt*1_000_000).toString();
    if(isCircleWallet&&circleWalletId){
      const r=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:LENDING_CONTRACT,functionSignature:'withdraw(uint256)',params:[amtAtomic]})});
      const d=await r.json();
      if(!d.success)throw new Error(d.error||'Withdraw failed');
      toast('✓ Withdraw submitted!','success',4000);
      setTimeout(async()=>{for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,3000));await refreshBalances();}},0);
      addTx({hash:d.txHash||d.transactionId,to:LENDING_CONTRACT,toRaw:'NANLendingPool Withdraw',amount:amt.toFixed(6),type:'in',token:'USDC',ts:Date.now(),confirmed:true,source:'lending'});
      setTimeout(()=>{refreshBalances();refreshLendPosition();},8000);
    }else if(signer){
      const lendContract=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,signer);
      const tx=await lendContract.withdraw(ethers.parseUnits(amt.toFixed(6),6),arcGasOpts());
      await tx.wait(0);
      toast('✓ Withdrew '+amt.toFixed(2)+' USDC + interest on Arc!','success',5000);
      addTx({hash:tx.hash,to:LENDING_CONTRACT,toRaw:'NANLendingPool Withdraw',amount:amt.toFixed(6),type:'in',token:'USDC',ts:Date.now(),confirmed:true,source:'lending'});
      await refreshBalances();await refreshLendPosition();
    }else{throw new Error('No wallet connected');}
  }catch(err){toast('Withdraw failed: '+err.message.slice(0,100),'error',5000);}
  document.getElementById('withdrawAmt').value='';
  btn.innerHTML='Withdraw + Interest';btn.disabled=false;
}

// ═══════════════════════════════════════════
// ARC NAME SERVICE
// ═══════════════════════════════════════════
function saveArcNames(){localStorage.setItem('nan_arcnames_'+(userAddr||''),JSON.stringify(arcNames));}
let arcNameDurationYears=1;
let arcNameFeeUsdc=2;

function setArcNameDuration(years,fee,el){
  arcNameDurationYears=years;arcNameFeeUsdc=fee;
  document.querySelectorAll('.price-opt').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('arcNameFeeDisplay').textContent=fee+' USDC';
}
async function checkArcName(){
  const val=document.getElementById('arcNameSearch').value.trim().toLowerCase().replace('.arc','');
  const res=document.getElementById('arcNameResult');
  if(!val){res.style.display='none';return;}
  res.style.display='block';
  res.style.background='rgba(168,85,247,.06)';res.style.border='1px solid rgba(168,85,247,.2)';res.style.color='var(--text2)';
  res.textContent='Checking...';
  try{
    if(provider){
      const nameContract=new ethers.Contract(NAME_REGISTRY,NAME_ABI,provider);
      const available=await nameContract.isAvailable(val);
      if(available){
        res.style.background='rgba(112,0,255,.07)';res.style.border='1px solid rgba(112,0,255,.22)';res.style.color='var(--success)';
        res.textContent='✓ '+val+'.arc is available!';
      }else{
        const owner=await nameContract.resolve(val);
        res.style.background='rgba(248,113,113,.07)';res.style.border='1px solid rgba(248,113,113,.22)';res.style.color='var(--danger)';
        res.textContent='✗ '+val+'.arc is taken — owned by '+short(owner);
      }
    } else {
      // Fallback local check
      const taken=arcNames.find(n=>n.name===val);
      res.style.background=taken?'rgba(248,113,113,.07)':'rgba(112,0,255,.07)';
      res.style.border=taken?'1px solid rgba(248,113,113,.22)':'1px solid rgba(112,0,255,.22)';
      res.style.color=taken?'var(--danger)':'var(--success)';
      res.textContent=taken?'✗ '+val+'.arc is taken':'✓ '+val+'.arc is available!';
    }
  }catch(e){
    res.textContent='Could not check — try again';
  }
}
async function registerArcName(){
  if(!userAddr){toast('Connect wallet first','error');return;}
  const name=document.getElementById('arcNameInput').value.trim().toLowerCase().replace('.arc','');
  if(!name||name.length<2){toast('Enter a valid name (min 2 chars)','error');return;}
  if(!/^[a-z0-9-]+$/.test(name)){toast('Only letters, numbers and hyphens allowed','error');return;}
  const bal=parseFloat(usdcBal);
  if(bal<arcNameFeeUsdc+0.009){
    toast('Insufficient USDC — need '+(arcNameFeeUsdc+0.009).toFixed(3)+' USDC','error',5000);return;
  }
  if(!confirm(`Register "${name}.arc" for ${arcNameFeeUsdc} USDC?\n\nDuration: ${arcNameDurationYears} year(s)\nFee: ${arcNameFeeUsdc} USDC\nGas: ~0.009 USDC`)){return;}
  const btn=document.querySelector('#page-arcname .card:nth-child(3) .btn');
  if(btn){btn.innerHTML='<span class="spinner"></span>Approving...';btn.disabled=true;}
  try{
    const feeAtomic=Math.floor(arcNameFeeUsdc*1_000_000).toString();
    if(isCircleWallet&&circleWalletId){
      if(btn)btn.innerHTML='<span class="spinner"></span>Approving USDC…';
      const appR=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:USDC_ADDR,functionSignature:'approve(address,uint256)',params:[NAME_REGISTRY,'115792089237316195423570985008687907853269984665640564039457584007913129639935']})});
      const appD=await appR.json();
      if(!appD.success)throw new Error(appD.error||'Approve failed');
      sessionStorage.setItem('nan_name_approving_'+circleWalletId,'1');
      // Don't wait — Arc confirms in <1s, proceed immediately
      await new Promise(r=>setTimeout(r,2000));
      if(btn)btn.innerHTML='<span class="spinner"></span>Registering on Arc…';
      const regR=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:NAME_REGISTRY,functionSignature:'register(string,uint8)',params:[name,arcNameDurationYears]})});
      const regD=await regR.json();
      if(!regD.success)throw new Error(regD.error||'Registration failed');
      toast('✓ '+name+'.arc registered on Arc! 🎉','success',7000);
      setTimeout(()=>resolveCircleTxHash(regD.txHash||regD.transactionId),2000);
      addTx({hash:regD.txHash||regD.transactionId,to:NAME_REGISTRY,toRaw:'Registered '+name+'.arc',amount:arcNameFeeUsdc.toFixed(6),type:'out',token:'USDC',ts:Date.now(),confirmed:!!regD.txHash,source:'arcname'});
      await refreshBalances();await refreshArcNames();
    }else if(signer){
      const usdcContract=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
      const nameContract=new ethers.Contract(NAME_REGISTRY,NAME_ABI,signer);
      const fee=ethers.parseUnits(arcNameFeeUsdc.toString(),6);
      const nameAllowance=await usdcContract.allowance(userAddr,NAME_REGISTRY);
      if(nameAllowance<fee){
        if(btn)btn.innerHTML='<span class="spinner"></span>Approving…';
        const nameExact=ethers.parseUnits(arcNameFeeUsdc.toFixed(6),6);
        const approveTx=await usdcContract.approve(NAME_REGISTRY,nameExact,arcGasOpts());
        await approveTx.wait(0);
      }
      if(btn)btn.innerHTML='<span class="spinner"></span>Registering on Arc...';
      const tx=await nameContract.register(name,arcNameDurationYears,arcGasOpts());
      await tx.wait(0);
      toast('✓ '+name+'.arc registered on Arc Testnet! 🎉','success',7000);
      addTx({hash:tx.hash,to:NAME_REGISTRY,toRaw:'Registered '+name+'.arc',amount:arcNameFeeUsdc.toFixed(6),type:'out',token:'USDC',ts:Date.now(),confirmed:true,source:'arcname'});
      await refreshBalances();await refreshArcNames();
    }else{throw new Error('No wallet connected — use email login or MetaMask');}
  }catch(err){
    const msg=err?.reason||err?.message||'Registration failed';
    if(msg.includes('No signer')){
      toast('Connect a wallet to register names on-chain','error',5000);
    } else if(msg.includes('taken')||msg.includes('already registered')){
      toast(name+'.arc is already taken','error',4000);
    } else if(msg.includes('execution reverted')){
      toast('Registration failed — check contract is deployed: '+msg.slice(0,80),'error',7000);
    } else {
      toast('Registration failed — '+msg.slice(0,80),'error',6000);
    }
  }
  document.getElementById('arcNameInput').value='';
  if(btn){btn.innerHTML='Register .arc Name';btn.disabled=false;}
  renderMyArcNames();renderArcDirectory();
}

async function refreshArcNames(){
  if(!userAddr||!provider)return;
  try{
    const nameContract=new ethers.Contract(NAME_REGISTRY,NAME_ABI,provider);
    const names=await nameContract.getNamesForAddress(userAddr);
    // Merge on-chain names with local
    for(const n of names){
      if(!arcNames.find(a=>a.name===n)){
        arcNames.unshift({name:n,owner:userAddr,expires:'On-chain',years:1,fee:2,ts:Date.now()});
      }
    }
    saveArcNames();
    renderMyArcNames();renderArcDirectory();
  }catch(e){console.log('Arc name fetch error:',e.message);}
}
function renderMyArcNames(){
  const myNames=arcNames.filter(n=>n.owner===userAddr);
  const el=document.getElementById('myArcNamesList');
  if(!myNames.length){el.innerHTML='<div class="empty"><div class="empty-icon" style="font-size:1.2rem;">◎</div><div class="empty-text">No names registered yet.</div></div>';return;}
  el.innerHTML=myNames.map(n=>`
    <div class="arcname-row">
      <div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:600;color:var(--text);">${n.name}.arc</div>
        <div style="font-size:.65rem;color:var(--text3);">Expires ${n.expires}</div>
      </div>
      <span style="font-size:.65rem;padding:3px 8px;border-radius:4px;background:rgba(112,0,255,.08);color:var(--success);border:1px solid rgba(112,0,255,.2);">Active</span>
    </div>
  `).join('');
}
function renderArcDirectory(){
  renderMyArcNames();
  const el=document.getElementById('arcNameDirectory');
  if(!arcNames.length){el.innerHTML='<div class="empty"><div class="empty-icon">◎</div><div class="empty-text">No names registered yet. Be the first!</div></div>';return;}
  el.innerHTML=arcNames.map(n=>`
    <div class="arcname-row" style="cursor:pointer;" onclick="prefillSend('${n.owner}')">
      <div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.75rem;font-weight:600;color:var(--accent3);">${n.name}.arc</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--text3);">${short(n.owner)}</div>
      </div>
      <button class="send-sm">Send</button>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════
// CIRCLE TX POLL HELPER
// ═══════════════════════════════════════════
// Poll Circle API until tx is COMPLETE and we have the real txHash
// Then update history entry with real hash so View link works on arcscan
// Verify tx exists on Arc RPC before opening arcscan
// Arcscan indexing can lag — RPC is always accurate
async function verifyTx(hash, event) {
  try {
    event.preventDefault();
    const rpc = 'https://rpc.testnet.arc.network';
    const r = await fetch(rpc, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',method:'eth_getTransactionReceipt',params:[hash],id:1})
    });
    const data = await r.json();
    if(data.result && data.result.transactionHash) {
      // Tx confirmed on RPC — open arcscan
      window.open(ARC_EXP+'/tx/'+hash, '_blank');
    } else {
      // Not yet indexed on RPC either — show message
      toast('Transaction is confirming on Arc — try again in a few seconds','info',4000);
    }
  } catch(e) {
    // RPC error — just open arcscan anyway
    window.open(ARC_EXP+'/tx/'+hash, '_blank');
  }
}

async function resolveCircleTxHash(circleId) {
  if(!circleId||circleId.startsWith('0x')||circleId==='pending'||circleId==='ok') return;
  const MAX_ATTEMPTS=15; // poll up to 15 times
  const INTERVAL=4000;   // every 4 seconds = up to 60s total
  for(let i=0;i<MAX_ATTEMPTS;i++){
    await new Promise(r=>setTimeout(r,INTERVAL));
    try{
      const res=await fetch('https://nan-production.up.railway.app/api/transaction/'+circleId);
      if(!res.ok) continue;
      const data=await res.json();
      const txHash=data.txHash;
      const state=data.state;
      // Once COMPLETE with a real hash, update history
      if((state==='COMPLETE'||state==='CONFIRMED')&&txHash&&txHash.startsWith('0x')&&txHash.length===66){
        const idx=txHistory.findIndex(t=>t.hash===circleId);
        if(idx>=0){
          txHistory[idx].hash=txHash;
          txHistory[idx].confirmed=true;
          saveTxHistory();
          if(document.getElementById('page-history')?.classList.contains('active')||
             document.querySelector('#page-history.show')){
            renderHistory();
          }
        }
        return; // done
      }
      if(state==='FAILED'||state==='CANCELLED'||state==='DENIED') return;
    }catch(e){/* continue polling */}
  }
}

async function waitForCircleTx(txId, label='tx', timeoutMs=90000) {
  if(!txId) return true;
  const start = Date.now();
  let interval = 2000;
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, interval));
    interval = Math.min(interval * 1.3, 8000);
    try {
      const res = await fetch('https://nan-production.up.railway.app/api/transaction/' + txId);
      if (!res.ok) continue;
      const data = await res.json();
      const state = data.state || data.status || '';
      if (state === 'CONFIRMED' || state === 'COMPLETE') return true;
      if (['FAILED','CANCELLED','DENIED'].includes(state))
        throw new Error(label + ' failed: ' + state);
    } catch(e) {
      if (e.message.includes('failed:')) throw e;
    }
  }
  throw new Error(label + ' timed out after ' + (timeoutMs/1000) + 's');
}

// ═══════════════════════════════════════════
// NAIRA PAGE
// ═══════════════════════════════════════════
const NGN_USDC_RATE=1620,NGN_EURC_RATE=1765;
let ngnFlipped=false,ngnToToken='USDC';

function simulateNgnDeposit(){
  const amt = parseFloat(document.getElementById('ngnSimAmt').value)||0;
  if(!amt){ toast('Enter an amount','error'); return; }
  const cur = parseFloat(document.getElementById('ngnBal').textContent)||0;
  document.getElementById('ngnBal').textContent = (cur+amt).toLocaleString();
  toast('₦'+amt.toLocaleString()+' deposited (simulated)','success',3000);
}

function setNairaTab(tab){
  ['deposit','withdraw','convert'].forEach(t=>{
    document.getElementById('npanel-'+t).style.display=t===tab?'block':'none';
    document.getElementById('ntab-'+t).classList.toggle('active',t===tab);
  });
}
function calcNgnWithdraw(){
  const amt=parseFloat(document.getElementById('ngnWithdrawAmt').value)||0;
  document.getElementById('ngnWithdrawUsdc').textContent='≈ '+(amt/NGN_USDC_RATE).toFixed(4)+' USDC deducted · Rate: ₦'+NGN_USDC_RATE+' / USDC';
}
function verifyNgnAcct(){
  const num=document.getElementById('ngnAcctNum').value;
  const bar=document.getElementById('ngnAcctNameBar');
  const txt=document.getElementById('ngnAcctNameTxt');
  if(num.length===10){bar.style.display='flex';txt.textContent='✓ Account verified (demo)';}
  else bar.style.display='none';
}
function doNgnWithdraw(){
  const amt=parseFloat(document.getElementById('ngnWithdrawAmt').value)||0;
  const bank=document.getElementById('ngnBankName').value;
  const acct=document.getElementById('ngnAcctNum').value;
  if(!amt){toast('Enter an amount','error');return;}
  if(!bank){toast('Select a bank','error');return;}
  if(acct.length!==10){toast('Enter a valid 10-digit account number','error');return;}
  toast('₦'+amt.toLocaleString()+' withdrawal submitted to '+bank,'success',5000);
}
function calcNgnConvert(){
  const amt=parseFloat(document.getElementById('ngnConvertFrom').value)||0;
  const rate=ngnToToken==='USDC'?NGN_USDC_RATE:NGN_EURC_RATE;
  const out=ngnFlipped?(amt*rate*0.995).toFixed(2):(amt/rate*0.995).toFixed(4);
  document.getElementById('ngnConvertTo').value=amt>0?out:'';
}
function flipNgnConvert(){
  ngnFlipped=!ngnFlipped;
  const el=document.getElementById('ngnFromToken');
  el.innerHTML=ngnFlipped?(ngnToToken==='USDC'?'<span class="tok-dot usdc-dot"></span>USDC ▾':'<span class="tok-dot eurc-dot"></span>EURC ▾'):'₦ NGN <span style="font-size:.65rem;color:var(--text3);margin-left:2px;">▾</span>';
  document.getElementById('ngnConvertFrom').value='';
  document.getElementById('ngnConvertTo').value='';
  document.getElementById('ngnConvertBtn').textContent=ngnFlipped?ngnToToken+' → NGN':'NGN → '+ngnToToken;
}
function toggleNgnToToken(){
  ngnToToken=ngnToToken==='USDC'?'EURC':'USDC';
  const el=document.getElementById('ngnToToken');
  el.innerHTML=ngnToToken==='USDC'?'<span class="tok-dot usdc-dot"></span>USDC <span style="font-size:.65rem;color:var(--text3);">▾</span>':'<span class="tok-dot eurc-dot"></span>EURC <span style="font-size:.65rem;color:var(--text3);">▾</span>';
  document.getElementById('ngnRateDisplay').textContent='₦'+(ngnToToken==='USDC'?NGN_USDC_RATE:NGN_EURC_RATE)+' = 1 '+ngnToToken;
  document.getElementById('ngnToBalLabel').textContent='Bal: '+(ngnToToken==='USDC'?parseFloat(usdcBal).toFixed(2):parseFloat(eurcBal).toFixed(2))+' '+ngnToToken;
  document.getElementById('ngnConvertBtn').textContent='Convert NGN → '+ngnToToken;
  calcNgnConvert();
}
function doNgnConvert(){
  const amt=parseFloat(document.getElementById('ngnConvertFrom').value)||0;
  if(!amt){toast('Enter an amount','error');return;}
  toast('NGN conversion submitted — coming soon on mainnet!','info',5000);
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
window.addEventListener('load',()=>{
  initTheme();
  resizeAIPanel();
  const _lp = new URLSearchParams(window.location.search);
  const _land = document.getElementById('page-land');
  const _ct = _lp.get('connect');
  const _em = _lp.get('email');
  const _verified = _lp.get('verified');

  if(_ct === 'email' && _verified === '1' && _em){
    // OTP already verified on landing page — skip page-land, go straight to wallet
    if(_land) _land.style.display='none';
    // Show loading indicator
    document.body.insertAdjacentHTML('beforeend',
      '<div id="verifiedLoader" style="position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;">'
      +'<div style="width:44px;height:44px;border:3px solid rgba(112,0,255,.2);border-top-color:#7000ff;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:16px;"></div>'
      +'<div style="color:var(--text3);font-size:.85rem;">Setting up your wallet…</div>'
      +'</div>');
    setTimeout(async function(){
      try{
        otpEmail = _em;
        // Get Circle wallet using stored OTP verification data
        const storedToken = localStorage.getItem('nan_otp_token');
        const cwRes = await fetch('https://nan-production.up.railway.app/api/circle-wallets',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'getWallet',email:_em,otpToken:storedToken})});
        const cw = await cwRes.json();
        // Server returns { success, wallet: { id, address, blockchain } }
        const walletData = cw.wallet || cw;
        const walletId = walletData.id || walletData.walletId;
        const walletAddr = walletData.address;
        if(!walletId) throw new Error(cw.error||'Wallet setup failed');
        circleWalletId=walletId;
        circleWalletAddress=walletAddr;
        circleWalletBlockchain=walletData.blockchain||'ARC-TESTNET';
        circleUserToken=cw.userToken||null;
        circleUserId=cw.userId||null;
        // CRITICAL: set userAddr before calling onConnected
        userAddr=walletAddr;
        isCircleWallet=true;
        provider=getArcProvider();
        onArcNetwork=true;
        localStorage.setItem('circleWalletId',walletId);
        localStorage.setItem('circleWalletAddr',walletAddr);
        localStorage.removeItem('nan_otp_token');
        localStorage.removeItem('nan_otp_verified');
        const loader=document.getElementById('verifiedLoader');
        if(loader) loader.remove();
        await onConnected(true,false);
      } catch(e){
        const loader=document.getElementById('verifiedLoader');
        if(loader) loader.remove();
        if(_land) _land.style.display='flex';
        toast('Could not set up wallet: '+e.message,'error');
      }
    }, 600);
  } else if(_ct && _ct!=='email'){
    // MetaMask/Coinbase/WalletConnect — skip page-land, show loading + trigger wallet
    if(_land) _land.style.display='none';
    // Show animated connect splash
    const _isLight = document.documentElement.getAttribute('data-theme')==='light';
    const _bg = _isLight ? '#ffffff' : '#000000';
    const _txt = _isLight ? '#111111' : '#ffffff';
    const _txt2 = _isLight ? '#555' : 'rgba(255,255,255,.7)';
    const _txt3 = _isLight ? '#999' : 'rgba(255,255,255,.35)';
    const _btn = _isLight ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.12)';
    const _nanLogoL='<svg width="180" height="44" viewBox="0 0 280 70" fill="none"><g transform="translate(35,35)"><path d="M16,0 C16,-15 0,-15 0,0 C0,15 16,15 25,0 C34,-15 50,-15 50,0 C50,15 34,15 25,0 Z" fill="none" stroke="#7000ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><line x1="65" y1="-13" x2="65" y2="13" stroke="#111" stroke-width="5.5" stroke-linecap="round"/><line x1="65" y1="-13" x2="83" y2="13" stroke="#111" stroke-width="5.5" stroke-linecap="round"/><line x1="83" y1="-13" x2="83" y2="13" stroke="#111" stroke-width="5.5" stroke-linecap="round"/><line x1="91" y1="13" x2="100" y2="-13" stroke="#111" stroke-width="5.5" stroke-linecap="round"/><line x1="109" y1="13" x2="100" y2="-13" stroke="#111" stroke-width="5.5" stroke-linecap="round"/><line x1="94" y1="3" x2="106" y2="3" stroke="#111" stroke-width="5.5" stroke-linecap="round"/><line x1="117" y1="-13" x2="117" y2="13" stroke="#111" stroke-width="5.5" stroke-linecap="round"/><line x1="117" y1="-13" x2="135" y2="13" stroke="#111" stroke-width="5.5" stroke-linecap="round"/><line x1="135" y1="-13" x2="135" y2="13" stroke="#111" stroke-width="5.5" stroke-linecap="round"/></g></svg>';
    const _nanLogoD=_nanLogoL.replace(/stroke="#111"/g,'stroke="#fff"');
    const _nanLogo=_isLight?_nanLogoL:_nanLogoD;
    const _goBack='<button onclick="window.location.href=String.fromCharCode(47)" style="background:none;border:1px solid '+_btn+';border-radius:10px;color:'+_txt3+';padding:9px 20px;font-size:.8rem;cursor:pointer;">← Go back</button>';
    document.body.insertAdjacentHTML('beforeend','<div id="connectLoader" style="position:fixed;inset:0;background:'+_bg+';display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;"><div style="margin-bottom:20px;">'+_nanLogo+'</div><div style="font-size:1rem;font-weight:600;color:'+_txt2+';margin-bottom:6px;">Connecting wallet…</div><div style="font-size:.825rem;color:'+_txt3+';margin-bottom:28px;">Check your wallet for a request</div><div style="display:flex;gap:7px;margin-bottom:32px;"><div style="width:8px;height:8px;border-radius:50%;background:#7000ff;animation:dotBounce 1.2s ease-in-out infinite;"></div><div style="width:8px;height:8px;border-radius:50%;background:#9333ea;animation:dotBounce 1.2s ease-in-out infinite .2s;"></div><div style="width:8px;height:8px;border-radius:50%;background:#c084fc;animation:dotBounce 1.2s ease-in-out infinite .4s;"></div></div>'+_goBack+'<style>@keyframes dotBounce{0%,100%{transform:translateY(0);opacity:.3;}50%{transform:translateY(-10px);opacity:1;}}</style></div>');
      (async function(){try{
        if(typeof connectSpecific==='function') await connectSpecific(_ct);
        var l=document.getElementById('connectLoader'); if(l)l.remove();
      } catch(e){
        var l=document.getElementById('connectLoader'); if(l)l.remove();
        if(_land) _land.style.display='flex';
      }})();
  } else {
    // Normal — show page-land
    if(_land && !_lp.get('pay')) _land.style.display='flex';
  }
  initSwapUI();
  initBridgeUI();
  fetchLiveFX();
  setInterval(fetchLiveFX,60000);
  setInterval(async()=>{
    if(userAddr){
      if(!isCircleWallet)await checkNetwork();
      if(onArcNetwork||isCircleWallet){await refreshBalances();}
    }
  },10000);
  if(userAddr) startOrderEngine();
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&userAddr)refreshBalances();
  });
});

// ═══════════════════════════════════════════
// PAYMENT REQUESTS ENGINE
// ═══════════════════════════════════════════
let paymentRequests=[];
let currentPRToken='USDC';
let currentPRExpiry=0;
let activePRId=null;

function loadPaymentRequests(){
  try{paymentRequests=JSON.parse(localStorage.getItem('nan_payreqs_'+(userAddr||''))||'[]');}catch{paymentRequests=[];}
  checkPendingPaymentRequests();
}
async function checkPendingPaymentRequests(){
  if(!userAddr)return;
  const pending=paymentRequests.filter(p=>p.status==='pending'&&p.to===userAddr);
  if(!pending.length)return;
  const readProvider=getArcProvider();
  const usdc=new ethers.Contract(USDC_ADDR,ERC20_ABI,readProvider);
  const currentBal=await usdc.balanceOf(userAddr);
  const current=parseFloat(ethers.formatUnits(currentBal,6));
  for(const pr of pending){
    if(pr.expiresAt&&Date.now()>pr.expiresAt){pr.status='expired';continue;}
    if(pr.amount&&current>=parseFloat(pr.amount)){
      pr.status='paid';pr.paidAt=Date.now();
      toast('✓ Payment received for: '+pr.label,'success',5000);
    }
  }
  savePaymentRequests();
  renderPaymentRequests();
}
function savePaymentRequests(){
  localStorage.setItem('nan_payreqs_'+(userAddr||''),JSON.stringify(paymentRequests));
}
function genPRId(){
  return 'pr_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
}
function buildPRLink(pr){
  const base=window.location.origin+'/';
  const id=pr.onChainId||pr.id;
  const p=new URLSearchParams({pay:id,to:pr.to,amt:pr.amount||'',tok:pr.token,lbl:pr.label,note:pr.note||''});
  return base+'?'+p.toString();
}
function setPRToken(token,el){
  currentPRToken=token;
  document.querySelectorAll('#page-payreq-new .topt').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('prTokenLabel').textContent=token;
  updatePRPreview();
}
function setPRExpiry(hours,el){
  currentPRExpiry=hours;
  document.querySelectorAll('#prExpiryGrid .topt').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}
function updatePRPreview(){
  const amt=document.getElementById('prAmount').value;
  const label=document.getElementById('prLabel').value.trim();
  const btn=document.getElementById('prCreateBtn');
  const wrap=document.getElementById('prPreviewWrap');
  if(label){
    wrap.style.display='block';
    document.getElementById('prPreviewAmt').textContent=amt?parseFloat(amt).toFixed(2)+' '+currentPRToken:'Open amount · '+currentPRToken;
    document.getElementById('prPreviewLabel').textContent=label;
    document.getElementById('prPreviewAddr').textContent=userAddr?short(userAddr):'—';
    btn.disabled=false;
  }else{
    wrap.style.display='none';
    btn.disabled=true;
  }
}
function initNewPRForm(){
  document.getElementById('prAmount').value='';
  document.getElementById('prLabel').value='';
  document.getElementById('prNote').value='';
  currentPRToken='USDC';currentPRExpiry=0;
  document.querySelectorAll('#page-payreq-new .topt').forEach(b=>b.classList.remove('active'));
  document.getElementById('pr-usdc').classList.add('active');
  document.querySelectorAll('#prExpiryGrid .topt')[0].classList.add('active');
  document.getElementById('prTokenLabel').textContent='USDC';
  document.getElementById('prPreviewWrap').style.display='none';
  document.getElementById('prCreateBtn').disabled=true;
}
async function createPaymentRequest(){
  const label=document.getElementById('prLabel').value.trim();
  const amt=parseFloat(document.getElementById('prAmount').value)||null;
  const note=document.getElementById('prNote').value.trim();
  const email=document.getElementById('prEmail')?.value.trim()||otpEmail||'';
  if(!label){toast('Enter a label','error');return;}
  if(!userAddr){toast('Connect wallet first','error');return;}
  const btn=document.getElementById('prCreateBtn');
  btn.innerHTML='<span class="spinner"></span>Creating on-chain…';btn.disabled=true;
  try{
    const tokenAddr=currentPRToken==='USDC'?USDC_ADDR:EURC_ADDR;
    const amtAtomic=amt&&amt>0?ethers.parseUnits(amt.toFixed(6),6):BigInt(0);
    const expiresAt=currentPRExpiry>0?Math.floor(Date.now()/1000)+currentPRExpiry*3600:0;
    let onChainId=null;
    if(isCircleWallet&&circleWalletId){
      // Generate link immediately — don't wait for Circle API or chain confirmation
      onChainId='circ_'+Date.now();
      // Submit to chain in background
      fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
          contractAddress:PAYREQ_CONTRACT,
          functionSignature:'createRequest(address,uint256,string,string,uint256)',
          params:[tokenAddr,amtAtomic.toString(),label,note||'',String(expiresAt)]})})
      .then(async r=>{
        const d=await r.json();
        if(!d.success){console.warn('PR create failed:',d.error);return;}
        // After 5s get real on-chain ID and update
        await new Promise(r=>setTimeout(r,5000));
        try{
          const rp=getArcProvider();
          const c=new ethers.Contract(PAYREQ_CONTRACT,PAYREQ_ABI,rp);
          const ids=await c.getCreatorRequests(circleWalletAddress||userAddr);
          if(ids.length>0){
            const realId=ids[ids.length-1].toString();
            const idx=paymentRequests.findIndex(p=>p.onChainId===onChainId);
            if(idx>=0){paymentRequests[idx].onChainId=realId;savePaymentRequests();}
          }
        }catch(e){console.warn('PR ID update:',e.message);}
      })
      .catch(e=>console.warn('PR submit error:',e.message));
    }else if(signer){
      const c=new ethers.Contract(PAYREQ_CONTRACT,PAYREQ_ABI,signer);
      const tx=await c.createRequest(tokenAddr,amtAtomic,label,note||'',expiresAt,arcGasOpts());
      // wait(1) ensures logs are available — Arc sub-second so still fast
      const receipt=await tx.wait(1);
      const event=receipt?.logs?.find(l=>l.fragment?.name==='RequestCreated');
      onChainId=event?.args?.id?.toString();
      // Fallback: read ID from chain if event not parsed
      if(!onChainId){
        await new Promise(r=>setTimeout(r,1000));
        const ids=await c.getCreatorRequests(userAddr);
        onChainId=ids.length>0?ids[ids.length-1].toString():'0';
      }
    }else{throw new Error('No wallet connected');}
    // Store locally with on-chain ID as reference
    const safeId=onChainId||('local_'+Date.now());
    const pr={id:'onchain_'+safeId,onChainId:safeId,to:userAddr,token:currentPRToken,amount:amt,label,note,creatorEmail:email,expiresAt:currentPRExpiry>0?Date.now()+currentPRExpiry*3600000:null,status:'pending',createdAt:Date.now()};
    paymentRequests.unshift(pr);
    savePaymentRequests();
    const link=buildPRLink(pr);
    navigator.clipboard.writeText(link).catch(()=>{});
    toast('✓ Created! Link copied — share it to get paid','success',4000);
    try{viewPaymentRequest(pr.id);}catch(e){console.warn('viewPR err:',e.message);}
  }catch(err){
    console.error('[createPaymentRequest] error:', err);
    toast('Create failed: '+err.message.slice(0,150),'error',7000);
    btn.innerHTML='Create & Share Link';btn.disabled=false;
  }
}
function viewPaymentRequest(id){
  const pr=paymentRequests.find(p=>p.id===id);
  if(!pr)return;
  activePRId=id;
  document.getElementById('prViewTitle').textContent=pr.label;
  document.getElementById('prViewStatus').textContent=pr.status==='paid'?'✓ Paid':pr.status==='expired'?'⚠ Expired':'⏳ Pending';
  document.getElementById('prViewStatus').style.color=pr.status==='paid'?'var(--success)':pr.status==='expired'?'var(--warning)':'var(--text3)';
  document.getElementById('prViewAmt').textContent=pr.amount?parseFloat(pr.amount).toFixed(2)+' '+pr.token:'Open · '+pr.token;
  document.getElementById('prViewLabel2').textContent=pr.label;
  document.getElementById('prViewFrom').textContent=short(pr.to);
  document.getElementById('prViewDate').textContent=new Date(pr.createdAt).toLocaleDateString();
  document.getElementById('prViewExpiry').textContent=pr.expiresAt?new Date(pr.expiresAt).toLocaleString():'Never';
  if(pr.note){document.getElementById('prViewNoteRow').style.display='flex';document.getElementById('prViewNote').textContent=pr.note;}
  else{document.getElementById('prViewNoteRow').style.display='none';}
  const link=buildPRLink(pr);
  document.getElementById('prViewLink').textContent=link;
  const qrBox=document.getElementById('prViewQR');
  qrBox.innerHTML='';
  try{new QRCode(qrBox,{text:link,width:120,height:120,colorDark:'#111111',colorLight:'#ffffff'});}catch{}
  document.getElementById('prMarkPaidBtn').style.display=pr.status==='paid'?'none':'block';
  goPage('payreq-view');
}
function renderPaymentRequests(){
  loadPaymentRequests();
  const list=document.getElementById('payreqList');
  if(!list)return;
  const total=paymentRequests.length;
  const paid=paymentRequests.filter(p=>p.status==='paid').length;
  const pending=paymentRequests.filter(p=>p.status==='pending').length;
  const el1=document.getElementById('prStatTotal');
  const el2=document.getElementById('prStatPaid');
  const el3=document.getElementById('prStatPending');
  if(el1)el1.textContent=total;
  if(el2)el2.textContent=paid;
  if(el3)el3.textContent=pending;
  if(!paymentRequests.length){
    list.innerHTML='<div style="text-align:center;padding:32px 16px;"><div style="font-size:2rem;margin-bottom:10px;">🧾</div><div style="font-size:.88rem;font-weight:700;color:var(--text);margin-bottom:5px;">No requests yet</div><div style="font-size:.78rem;color:var(--text3);margin-bottom:16px;">Create one to start getting paid</div><button onclick="goPage(\'payreq-new\')" style="background:#7000ff;border:none;border-radius:10px;color:#f3e8ff;font-family:\'Inter\',sans-serif;font-weight:700;font-size:.82rem;padding:10px 20px;cursor:pointer;">+ Create First Request</button></div>';
    return;
  }
  list.innerHTML=paymentRequests.map(pr=>{
    const isExpired=pr.expiresAt&&Date.now()>pr.expiresAt&&pr.status==='pending';
    const status=isExpired?'expired':pr.status;
    const statusColor=status==='paid'?'var(--success)':status==='expired'?'var(--warning)':'var(--accent3)';
    const statusLabel=status==='paid'?'✓ Paid':status==='expired'?'Expired':'Pending';
    const amtText=pr.amount?parseFloat(pr.amount).toFixed(2)+' '+pr.token:'Open · '+pr.token;
    return `<div onclick="viewPaymentRequest('${pr.id}')" style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border);cursor:pointer;" onmouseover="this.style.background='rgba(168,85,247,.04)'" onmouseout="this.style.background=''"><div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:10px;background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.2);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">🧾</div><div><div style="font-size:.85rem;font-weight:600;color:var(--text);margin-bottom:2px;">${pr.label}</div><div style="font-size:.72rem;color:var(--text3);">${new Date(pr.createdAt).toLocaleDateString()}</div></div></div><div style="text-align:right;"><div style="font-size:.88rem;font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace;">${amtText}</div><div style="font-size:.68rem;font-weight:600;color:${statusColor};">${statusLabel}</div></div></div>`;
  }).join('');
}
function copyPRLink(){
  const link=document.getElementById('prViewLink').textContent;
  navigator.clipboard.writeText(link).then(()=>toast('✓ Link copied!','success',2000));
}
function sharePRLink(){
  const link=document.getElementById('prViewLink').textContent;
  const pr=paymentRequests.find(p=>p.id===activePRId);
  if(!pr)return;
  const amt=pr.amount?pr.amount+' '+pr.token:pr.token;
  const text='Pay me '+amt+' — '+pr.label+'\n\n'+link+'\n\nPowered by NAN Wallet on Arc Testnet';
  if(navigator.share){navigator.share({title:'Payment Request — '+pr.label,text,url:link}).catch(()=>{});}
  else{navigator.clipboard.writeText(text).then(()=>toast('✓ Copied — paste to share!','success',3000));}
}
function markPRAsPaid(){
  const pr=paymentRequests.find(p=>p.id===activePRId);
  if(!pr)return;
  pr.status='paid';pr.paidAt=Date.now();
  savePaymentRequests();
  document.getElementById('prViewStatus').textContent='✓ Paid';
  document.getElementById('prViewStatus').style.color='var(--success)';
  document.getElementById('prMarkPaidBtn').style.display='none';
  toast('✓ Marked as paid!','success',2500);
}
async function doPayNow(){
  const to=document.getElementById('payNowTo').textContent;
  const token=document.getElementById('payNowToken').textContent;
  const fixedAmt=document.getElementById('payNowAmt').textContent;
  const customAmt=document.getElementById('payNowCustomAmt').value;
  const amt=fixedAmt==='Open amount'?parseFloat(customAmt):parseFloat(fixedAmt);
  if(!amt||amt<=0){toast('Enter an amount','error');return;}
  if(!userAddr){toast('Connect wallet first','error');return;}
  const params=new URLSearchParams(window.location.search);
  const prId=params.get('pay');
  if(!prId){toast('Invalid payment request','error');return;}
  const btn=document.getElementById('payNowBtn');
  btn.innerHTML='<span class="spinner"></span>Approving…';btn.disabled=true;
  try{
    const tokenAddr=token==='USDC'?USDC_ADDR:EURC_ADDR;
    const decimals=token==='USDC'?USDC_DECIMALS:EURC_DECIMALS;
    const amtParsed=ethers.parseUnits(amt.toFixed(decimals),decimals);
    const amtAtomic=amtParsed.toString();
    if(isCircleWallet&&circleWalletId){
      const payApprKey='nan_pay_approved_'+circleWalletId+'_'+token;
      if(!sessionStorage.getItem(payApprKey)){
        fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:tokenAddr,
            functionSignature:'approve(address,uint256)',params:[PAYREQ_CONTRACT,'115792089237316195423570985008687907853269984665640564039457584007913129639935']})})
          .then(()=>sessionStorage.setItem(payApprKey,'1')).catch(()=>{});
        await new Promise(r=>setTimeout(r,2000));
      }
      btn.innerHTML='<span class="spinner"></span>Paying…';
      const r=await fetch('https://nan-production.up.railway.app/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:PAYREQ_CONTRACT,
          functionSignature:'pay(uint256,uint256)',params:[prId,amtAtomic]})});
      const d=await r.json();
      if(!d.success)throw new Error(d.error||'Payment failed');
      toast('✓ Payment confirmed on-chain!','success',5000);
    }else if(signer){
      const tokenContract=new ethers.Contract(tokenAddr,ERC20_ABI,signer);
      const payAllowance=await tokenContract.allowance(userAddr,PAYREQ_CONTRACT);
      if(payAllowance<amtParsed){
        btn.innerHTML='<span class="spinner"></span>Approving…';
        const payExact=ethers.parseUnits(amt.toFixed(6),6);
        const appTx=await tokenContract.approve(PAYREQ_CONTRACT,payExact,arcGasOpts());
        await appTx.wait(1);
      }
      btn.innerHTML='<span class="spinner"></span>Paying…';
      const c=new ethers.Contract(PAYREQ_CONTRACT,PAYREQ_ABI,signer);
      const tx=await c.pay(prId,amtParsed,arcGasOpts());
      await tx.wait(0);
      toast('✓ Payment confirmed on-chain!','success',5000);
    }else{throw new Error('No wallet connected');}
    addTx({hash:'onchain',to,toRaw:'Payment Request #'+prId,amount:amt.toFixed(6),type:'out',token,ts:Date.now(),confirmed:true,source:'payreq'});
    await refreshBalances();
  }catch(err){
    toast('Payment failed: '+err.message.slice(0,100),'error',5000);
    btn.innerHTML='⚡ Pay instantly via NAN';btn.disabled=false;
  }
}

async function sendPaymentNotification(pr){
  if(!pr.creatorEmail)return;
  try{
    await fetch('https://nan-production.up.railway.app/api/notify',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        email:pr.creatorEmail,
        subject:'✓ Payment received — '+pr.label,
        message:'You received '+(pr.amount||'a payment of')+' '+pr.token+' for "'+pr.label+'" on NAN Wallet.\n\nCheck your wallet at nanarc.xyz'
      })
    });
  }catch(e){console.log('Notify error:',e);}
}

function deletePR(){
  if(!confirm('Delete this payment request?'))return;
  paymentRequests=paymentRequests.filter(p=>p.id!==activePRId);
  savePaymentRequests();
  toast('Deleted','info',2000);
  goPage('payreq');
}
(function handlePRDeepLink(){
  const params=new URLSearchParams(window.location.search);
  if(!params.has('pay'))return;
  const to=params.get('to'),amt=params.get('amt'),tok=params.get('tok')||'USDC',lbl=params.get('lbl')||'',note=params.get('note')||'';
  window._prDeepLink={to,amt,tok,lbl,note};
  const orig=window.onConnected;
  window.onConnected=async function(isEmail,isDev){
    await orig(isEmail,isDev);
    const dl=window._prDeepLink;
    if(!dl)return;
    setTimeout(()=>{
      document.getElementById('payNowAmt').textContent=dl.amt?parseFloat(dl.amt).toFixed(2)+' '+dl.tok:'Open amount';
      document.getElementById('payNowLabel').textContent=dl.lbl||'Payment Request';
      document.getElementById('payNowNote').textContent=dl.note||'';
      document.getElementById('payNowTo').textContent=dl.to||'';
      document.getElementById('payNowToken').textContent=dl.tok||'USDC';
      const amtInput=document.getElementById('payNowAmtInput');
      if(amtInput)amtInput.style.display=dl.amt?'none':'block';
      document.getElementById('payNowAddrDisplay').textContent=dl.to||'';
      const qrBox=document.getElementById('payNowQR');
      if(qrBox){qrBox.innerHTML='';try{new QRCode(qrBox,{text:dl.to||'',width:120,height:120,colorDark:'#111111',colorLight:'#ffffff'});}catch{}}
      goPage('pay-now');
      if(dl.lbl)toast('💸 Pay: '+dl.lbl,'info',5000);
      window._prDeepLink=null;
    },600);
  };
})();



// ══ NAN ADMIN DASHBOARD ══
let _secretTaps=0,_secretTimer=null,_adminUnlocked=false;

function handleSecretTap(){
  _secretTaps++;
  clearTimeout(_secretTimer);
  if(_secretTaps>=5){ _secretTaps=0; openAdmin(); }
  else { _secretTimer=setTimeout(()=>{ _secretTaps=0; },2000); }
}
function openAdmin(){
  document.getElementById('adminOverlay').style.display='block';
  document.getElementById('adminAuth').style.display='flex';
  document.getElementById('adminDash').style.display='none';
  document.getElementById('adminPwInput').value='';
  document.getElementById('adminPwErr').style.display='none';
  setTimeout(()=>document.getElementById('adminPwInput').focus(),100);
}
function closeAdmin(){
  document.getElementById('adminOverlay').style.display='none';
  _adminUnlocked=false;
}
async function checkAdminPw(){
  const pw = document.getElementById('adminPwInput').value;
  if(!pw) return;
  try {
    const res = await fetch('https://nan-production.up.railway.app/api/admin/auth', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    if(data.success){
      _adminUnlocked=true;
      document.getElementById('adminAuth').style.display='none';
      document.getElementById('adminDash').style.display='block';
      loadAdminStats();
    } else {
      document.getElementById('adminPwErr').style.display='block';
      document.getElementById('adminPwInput').value='';
    }
  } catch(e) {
    document.getElementById('adminPwErr').style.display='block';
    document.getElementById('adminPwInput').value='';
  }
}
async function loadAdminStats(){
  if(!_adminUnlocked)return;
  const loading=document.getElementById('adminLoading');
  const statsEl=document.getElementById('adminStats');
  loading.style.display='block';
  statsEl.style.display='none';

  function setMsg(msg){
    loading.innerHTML=`<div style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:#888;text-align:center;padding:20px;line-height:2;">${msg}</div>`;
  }

  // Try server-side analytics first (fast)
  try{
    setMsg('Loading NAN analytics…');
    const res=await fetch('https://nan-production.up.railway.app/api/analytics');
    if(res.ok){
      const d=await res.json();
      if(!d.error&&d.wallets!==undefined){
        document.getElementById('statBlock').textContent=(d.block||0).toLocaleString();
        document.getElementById('statSupply').textContent=parseInt(d.usdcSupply||0).toLocaleString('en')+' USDC';
        document.getElementById('statWallets').textContent=(d.wallets||0).toLocaleString();
        document.getElementById('statTxns').textContent=(d.transactions||0).toLocaleString();
        document.getElementById('statSwaps').textContent=(d.swaps||0).toLocaleString();
        document.getElementById('statBridges').textContent=(d.bridges||0).toLocaleString();
        document.getElementById('statLends').textContent=(d.lends||0).toLocaleString();
        const ne=document.getElementById('statNames');if(ne)ne.textContent=(d.arcNames||0).toLocaleString();
        const pe=document.getElementById('statPayreqs');if(pe)pe.textContent=(d.payRequests||0).toLocaleString();
        const recEl=document.getElementById('statRecentWallets');
        const wallets=d.recentWallets||[];
        recEl.innerHTML=wallets.length===0?'<div style="font-size:.75rem;color:#666;">No activity yet</div>':
          wallets.map(a=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1a1a1a;border:1px solid #1a1a1a;border-radius:10px;margin-bottom:4px;"><div style="display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#7000ff;display:inline-block;"></span><span style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:#ccc;">${a.slice(0,8)}…${a.slice(-6)}</span></div><a href="https://testnet.arcscan.app/address/${a}" target="_blank" style="font-size:.6rem;color:#a855f7;text-decoration:none;">View ↗</a></div>`).join('');
        document.getElementById('adminLastRefresh').textContent=new Date().toLocaleTimeString()+(d.cached?' (cached)':'');
        loading.style.display='none';
        statsEl.style.display='block';
        loadAdminPoolStats();
        return;
      }
    }
  }catch(e){ console.warn('Server analytics failed, falling back to RPC scan:', e.message); }

  // Fallback: browser RPC scan
  setMsg('Server unavailable — scanning blockchain…');
  const RPC='https://rpc.testnet.arc.network';
  const SWAP  ='0x5cE359b74BE53b1B370641571cBef157dD575c79';
  const LEND  ='0x4CC84BbEf992439Cb01FeF2E1150B37916d1f2ce';
  const NAME  ='0x043D072B12CBe488DBA3d2975c42Db3055F2836f';
  const PAYREQ='0x1940232f42D4e2083785bC869FbAD8dd43133817';
  const HIST  ='0xC64Fad1CFFDE16167d5887211066b47E1df48B4d';
  const USDC  ='0x3600000000000000000000000000000000000000';
  const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const ZERO='0x0000000000000000000000000000000000000000';
  const nanC=new Set([SWAP,LEND,NAME,PAYREQ,HIST,USDC].map(x=>x.toLowerCase()));
  let _id=0;

  async function rpc(m,p=[]){
    const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:m,params:p,id:++_id})});
    if(!r.ok)throw new Error('RPC '+r.status);
    const d=await r.json();
    if(d.error)throw new Error(d.error.message);
    return d.result;
  }

  // Single request per contract — no loop
  async function oneLogs(addr, topics, from, to){
    const f={fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16),address:addr};
    if(topics)f.topics=topics;
    try{const r=await rpc('eth_getLogs',[f]);return Array.isArray(r)?r:[];}
    catch(e){return [];}
  }

  try{
    setMsg('Connecting…');
    const bh=await rpc('eth_blockNumber');
    const latest=parseInt(bh,16);
    document.getElementById('statBlock').textContent=latest.toLocaleString();

    const sh=await rpc('eth_call',[{to:USDC,data:'0x18160ddd'},'latest']);
    document.getElementById('statSupply').textContent=(parseInt(sh,16)/1e6).toLocaleString('en',{maximumFractionDigits:0})+' USDC';

    // Find what chunk size RPC accepts by testing
    setMsg('Finding optimal chunk size…');
    let CHUNK=500000;
    for(const sz of [500000,200000,100000,50000,20000,10000,5000]){
      try{
        await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'0x'+sz.toString(16),address:HIST}]);
        CHUNK=sz;
        break;
      }catch(e){continue;}
    }
    setMsg(`Using ${CHUNK.toLocaleString()} block chunks…`);

    // Scan in chunks — show progress
    async function scanContract(addr, topics, label){
      const logs=[];
      const chunks=Math.ceil(latest/CHUNK);
      for(let i=0;i<chunks;i++){
        const from=i*CHUNK, to=Math.min(from+CHUNK-1,latest);
        const r=await oneLogs(addr,topics,from,to);
        logs.push(...r);
        setMsg(`${label}<br/>${logs.length} events · ${Math.round(((i+1)/chunks)*100)}%`);
        await new Promise(r=>setTimeout(r,0));
      }
      return logs;
    }

    const hL=await scanContract(HIST,null,'📋 NAN History');
    const sL=await scanContract(SWAP,null,'🔄 Swaps');
    const lL=await scanContract(LEND,null,'💰 Lend');
    const nL=await scanContract(NAME,null,'🏷 .arc Names');
    const pL=await scanContract(PAYREQ,null,'📨 Pay Requests');
    const uL=await scanContract(USDC,[TRANSFER],'💸 USDC Transfers');

    setMsg('Processing…');
    const wallets=new Set();
    [...hL,...sL,...lL,...nL,...pL].forEach(log=>{
      if(log.topics&&log.topics.length>=2){
        const a='0x'+log.topics[1].slice(-40),al=a.toLowerCase();
        if(al!==ZERO&&!nanC.has(al))wallets.add(al);
      }
    });

    let bridges=0;
    const recent=new Map();
    uL.forEach(log=>{
      if(!log.topics||log.topics.length<3)return;
      const f='0x'+log.topics[1].slice(-40),t='0x'+log.topics[2].slice(-40);
      if(t.toLowerCase()===ZERO)bridges++;
      const fl=f.toLowerCase();
      if(fl!==ZERO&&!nanC.has(fl)){const bn=parseInt(log.blockNumber,16);if(!recent.has(fl)||recent.get(fl)<bn)recent.set(fl,bn);}
    });

    document.getElementById('statWallets').textContent=wallets.size.toLocaleString();
    document.getElementById('statTxns').textContent=hL.length.toLocaleString();
    document.getElementById('statSwaps').textContent=sL.length.toLocaleString();
    document.getElementById('statBridges').textContent=bridges.toLocaleString();
    document.getElementById('statLends').textContent=lL.length.toLocaleString();
    const ne=document.getElementById('statNames');if(ne)ne.textContent=nL.length.toLocaleString();
    const pe=document.getElementById('statPayreqs');if(pe)pe.textContent=pL.length.toLocaleString();

    const recEl=document.getElementById('statRecentWallets');
    const top=[...recent.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
    recEl.innerHTML=top.length===0?'<div style="font-size:.75rem;color:#666;">No activity yet</div>':
      top.map(([a])=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1a1a1a;border:1px solid #1a1a1a;border-radius:10px;margin-bottom:4px;"><div style="display:flex;align-items:center;gap:8px;"><span style="width:6px;height:6px;border-radius:50%;background:#7000ff;display:inline-block;"></span><span style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:#ccc;">${a.slice(0,8)}…${a.slice(-6)}</span></div><a href="https://testnet.arcscan.app/address/${a}" target="_blank" style="font-size:.6rem;color:#a855f7;text-decoration:none;">View ↗</a></div>`).join('');

    document.getElementById('adminLastRefresh').textContent=new Date().toLocaleTimeString()+' · all-time';
    loading.style.display='none';
    statsEl.style.display='block';
    loadAdminPoolStats();

  }catch(err){
    console.error('Admin error:',err);
    loading.innerHTML=`<div style="font-size:.78rem;color:#f87171;text-align:center;padding:20px;"><div style="margin-bottom:8px;">⚠️ ${err.message}</div><div style="font-size:.7rem;color:#666;margin-bottom:14px;">Make sure you are on nanarc.xyz</div><button onclick="loadAdminStats()" style="background:#1a1a1a;border:1px solid #1a1a1a;border-radius:8px;color:#c084fc;padding:8px 16px;cursor:pointer;">↻ Retry</button></div>`;
  }
}

async function loadAdminPoolStats(){
  try{
    const readProvider=getArcProvider();

    // NANSwap pool
    const swapRead=new ethers.Contract(SWAP_CONTRACT,SWAP_ABI,readProvider);
    const [usdcLiq,eurcLiq]=await swapRead.getLiquidity();
    const u=parseFloat(ethers.formatUnits(usdcLiq,6));
    const e=parseFloat(ethers.formatUnits(eurcLiq,6));
    const uEl=document.getElementById('adminPoolUSDC');
    const eEl=document.getElementById('adminPoolEURC');
    if(uEl) uEl.textContent=u.toFixed(2)+' USDC';
    if(eEl) eEl.textContent=e.toFixed(2)+' EURC';
    const statusEl=document.getElementById('adminSeedStatus');
    if(statusEl){
      if(u<10||e<10){
        statusEl.innerHTML='<span style="color:#f87171;">⚠️ Swap pool low — MetaMask swaps may fail. Tap Seed Pool.</span>';
      } else {
        statusEl.innerHTML='<span style="color:#7000ff;">✓ Swap pool healthy.</span>';
      }
    }

    // NANLendingPool
    const lendRead=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,readProvider);
    const [totalSup,totalBor]=await Promise.all([
      lendRead.totalSupplied(),
      lendRead.totalBorrowed(),
    ]);
    const ts=parseFloat(ethers.formatUnits(totalSup,6));
    const tb=parseFloat(ethers.formatUnits(totalBor,6));
    const avail=Math.max(0,ts-tb);
    const lendEl=document.getElementById('adminLendStats');
    if(lendEl){
      const util=ts>0?((tb/ts)*100).toFixed(1):0;
      const color=avail<10?'#f87171':avail<100?'#fbbf24':'#7000ff';
      lendEl.innerHTML=`
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;">
          <div style="background:rgba(112,0,255,.06);border:1px solid rgba(112,0,255,.18);border-radius:10px;padding:10px;">
            <div style="font-size:.6rem;color:var(--text3);margin-bottom:3px;">TOTAL SUPPLIED</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:.9rem;font-weight:700;color:#7000ff;">${ts.toFixed(2)}</div>
          </div>
          <div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.18);border-radius:10px;padding:10px;">
            <div style="font-size:.6rem;color:var(--text3);margin-bottom:3px;">TOTAL BORROWED</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:.9rem;font-weight:700;color:#fbbf24;">${tb.toFixed(2)}</div>
          </div>
          <div style="background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.18);border-radius:10px;padding:10px;">
            <div style="font-size:.6rem;color:var(--text3);margin-bottom:3px;">AVAILABLE</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:.9rem;font-weight:700;color:${color};">${avail.toFixed(2)}</div>
          </div>
        </div>
        <div style="margin-top:8px;font-size:.72rem;color:var(--text3);">Utilization: ${util}% · ${avail<10?'⚠️ Low — supply USDC to enable borrows':'✓ Healthy'}</div>`;
    }
  }catch(e){console.warn('Pool stats error:',e.message);}
}

async function adminSeedPool(){
  if(!signer){toast('Connect MetaMask first to seed pool','error',4000);return;}
  if(!onArcNetwork){toast('Switch to Arc Testnet first','error',4000);return;}
  const btn=document.getElementById('adminSeedBtn');
  const statusEl=document.getElementById('adminSeedStatus');
  btn.disabled=true;btn.textContent='Seeding…';
  try{
    const usdcC=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
    const eurcC=new ethers.Contract(EURC_ADDR,ERC20_ABI,signer);
    const swapC=new ethers.Contract(SWAP_CONTRACT,SWAP_ABI,signer);
    const [uBal,eBal]=await Promise.all([usdcC.balanceOf(userAddr),eurcC.balanceOf(userAddr)]);
    const u=parseFloat(ethers.formatUnits(uBal,6));
    const e=parseFloat(ethers.formatUnits(eBal,6));
    if(u<1||e<1){toast('Need at least 1 USDC and 1 EURC to seed pool','error',5000);btn.disabled=false;btn.textContent='Seed Pool';return;}
    // Seed with up to 500 of each, or full balance if less
    const seedAmt=Math.min(500, u*0.9, e*0.9);
    const seedU=ethers.parseUnits(seedAmt.toFixed(6),6);
    const seedE=ethers.parseUnits(seedAmt.toFixed(6),6);
    statusEl.innerHTML='<span style="color:#c084fc;">Approving tokens…</span>';
    const [appU,appE]=await Promise.all([
      usdcC.approve(SWAP_CONTRACT,ethers.MaxUint256,arcGasOpts()),
      eurcC.approve(SWAP_CONTRACT,ethers.MaxUint256,arcGasOpts()),
    ]);
    await Promise.all([appU.wait(0),appE.wait(0)]);
    statusEl.innerHTML='<span style="color:#c084fc;">Adding liquidity…</span>';
    const liqTx=await swapC.addLiquidity(seedU,seedE,arcGasOpts());
    await liqTx.wait(1);
    toast('✓ Pool seeded with '+seedAmt.toFixed(2)+' USDC + '+seedAmt.toFixed(2)+' EURC','success',6000);
    await loadAdminPoolStats();
  }catch(err){
    toast('Seed failed: '+err.message.slice(0,100),'error',6000);
  }finally{
    btn.disabled=false;btn.textContent='Seed Pool';
  }
}
// Railway redeploy trigger Sun May 31 08:32:21 UTC 2026
