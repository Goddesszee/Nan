// ═══════════════════════════════════════════
// CONFIG — Arc Testnet
// ═══════════════════════════════════════════
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
function toast(msg,type='info',ms=4000){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=msg;el.className='show '+type;
  clearTimeout(_tt);_tt=setTimeout(()=>{el.className='';},ms);
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
  const lbl=document.getElementById('balCurrencyLabel');
  const amt=document.getElementById('balAmt');
  const usd=document.getElementById('balUsd');
  if(balCurrency==='USD'){
    amt.textContent=usdc.toFixed(2);
    lbl.textContent='USDC';
    usd.textContent='≈ $'+usdc.toFixed(2)+' USD · '+eurc.toFixed(2)+' EURC';
  } else if(balCurrency==='EURC'){
    amt.textContent=eurc.toFixed(2);
    lbl.textContent='EURC';
    usd.textContent='≈ $'+(eurc*(1/FX)).toFixed(2)+' USD';
  } else {
    const total=usdc+(eurc*(1/FX));
    amt.textContent=total.toFixed(2);
    lbl.textContent='USDC';
    usd.textContent='Total portfolio value';
  }
}
function showBalSkeleton(){
  document.getElementById('balAmt').innerHTML='<span class="skel skel-bal"></span>';
  document.getElementById('balUsd').innerHTML='<span class="skel skel-small"></span>';
  document.getElementById('usdcBal2').innerHTML='<span class="skel skel-small"></span>';
  document.getElementById('eurcBal2').innerHTML='<span class="skel skel-small"></span>';
}
function showPage(name){
  // Handled by ui.js — this is a no-op stub to prevent conflicts
  if(typeof goPage === 'function') goPage(name);
}
function goPage(name){
  if(!userAddr){toast('Connect wallet first','error');return;}
  showPage(name);
  if(name==='lend'){initLendUI();}
  if(name==='history')renderHistory();
  if(name==='arcname'){renderArcDirectory();}
  if(name==='swap')refreshBalances();
}
function toggleTheme(){
  const root=document.documentElement;
  const isLight=root.getAttribute('data-theme')==='light';
  const t=isLight?'dark':'light';
  root.setAttribute('data-theme',t==='light'?'light':'');
  localStorage.setItem('nan_theme',t);
  document.getElementById('themeToggle').textContent=t==='light'?'🌙':'☀️';
}
function initTheme(){
  const s=localStorage.getItem('nan_theme')||'dark';
  document.documentElement.setAttribute('data-theme',s==='light'?'light':'');
  document.getElementById('themeToggle').textContent=s==='light'?'🌙':'☀️';
}
function updateTopBar(connected){
  const btn=document.getElementById('connectTopBtn');
  const landBtn=document.getElementById('landConnectBtn');
  if(connected){
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
        btn.style.borderColor='rgba(52,211,153,.4)';
        setTimeout(()=>{btn.textContent=orig;btn.style.color='';btn.style.borderColor='';},1800);
      });
    };
    const discBtn=document.getElementById('disconnectTopBtn');
    if(discBtn)discBtn.style.display='block';
    // Hide the landing connect button completely
    if(landBtn) landBtn.style.display='none';
  }else{
    btn.style.display='none';
    if(landBtn) landBtn.style.display='block';
  }
}

// ═══════════════════════════════════════════
// FX RATE
// ═══════════════════════════════════════════
async function fetchLiveFX(){
  try{
    const res=await fetch('/api/fx-rate');
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
    const res=await fetch('/api/otp',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'send',email}),
    });
    const data=await res.json();
    if(data.success){
      if(data.dev){toast('Dev mode: OTP printed to server console','info',6000);}
      else{toast('✓ Code sent to '+email,'success',6000);}
      document.getElementById('otpBox').style.display='block';
      document.getElementById('otpInput').focus();
      document.getElementById('stepDot1').style.width='8px';document.getElementById('stepDot1').style.background='rgba(139,92,246,.4)';
      document.getElementById('stepDot2').style.width='20px';document.getElementById('stepDot2').style.background='#8b5cf6';
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
      if(!window._otpToken||window._otpToken==='dev'||window._otpToken.length!==64){
        toast('Session lost — click Send Code again','error',5000);
        document.getElementById('otpBox').style.display='none';
        window._otpToken=null;window._otpExpiry=null;
        return;
      }
  const btn=document.getElementById('verifyBtn');
  btn.innerHTML='<span class="spinner"></span>';btn.disabled=true;
  try{
    const res=await fetch('/api/otp',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'verify',email:otpEmail,otp,token:window._otpToken,expiresAt:window._otpExpiry}),
    });
    const data=await res.json();
    if(!data.success){toast(data.error||'Wrong code — try again','error',5000);btn.innerHTML='Verify →';btn.disabled=false;return;}
    try{
      const cwRes=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'getWallet',email:otpEmail})});
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

// ── Show seed phrase modal to new users ──
function showSeedPhrase(mnemonic, privateKey, address){
  const modal = document.createElement('div');
  modal.id='seedPhraseModal';
  modal.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;`;
  modal.innerHTML=`
    <div style="background:var(--bg);border:2px solid rgba(251,191,36,.4);border-radius:16px;padding:28px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:2rem;margin-bottom:8px;">🔐</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--text);margin-bottom:6px;">Save Your Wallet Keys</div>
        <div style="font-size:.75rem;color:var(--danger);font-weight:600;">⚠️ Save these NOW — you won't see them again</div>
      </div>

      <div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.25);border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--gold);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">Wallet Address (public — share freely)</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--text);word-break:break-all;line-height:1.6;">${address}</div>
        <a href="https://testnet.arcscan.app/address/${address}" target="_blank" style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--accent3);display:block;margin-top:6px;">View on Arc Explorer ↗</a>
      </div>

      ${mnemonic ? `
      <div style="background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.25);border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--danger);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">Seed Phrase (NEVER share — gives full access)</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
          ${mnemonic.split(' ').map((word,i)=>`
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--text);">
              <span style="color:var(--text3);font-size:.65rem;">${i+1}.</span> ${word}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div style="background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.25);border-radius:10px;padding:14px;margin-bottom:20px;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--danger);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">Private Key (NEVER share)</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--text);word-break:break-all;line-height:1.6;">${privateKey}</div>
      </div>

      <div style="background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.2);border-radius:8px;padding:10px;margin-bottom:16px;font-size:.7rem;color:var(--success);line-height:1.6;">
        ✓ Your keys are stored ONLY in this browser<br/>
        ✓ NAN's server never sees your private key<br/>
        ✓ You are the only person who controls this wallet
      </div>

      <button id="seedCopyBtn" style="width:100%;padding:13px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);border-radius:8px;color:var(--gold);font-family:'Space Grotesk',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer;margin-bottom:10px;">📋 Copy Private Key to Clipboard</button>

      <button id="seedContinueBtn" style="width:100%;padding:13px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border:none;border-radius:8px;color:#ede9fe;font-family:'Space Grotesk',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer;">✓ I've Saved My Keys — Continue</button>

      <div style="text-align:center;font-size:.72rem;color:var(--text3);margin-top:10px;font-family:'JetBrains Mono',monospace;">Get free USDC at faucet.circle.com after closing</div>
    </div>
  `;
  document.body.appendChild(modal);

  // Attach events AFTER appending to avoid quote escaping issues
  document.getElementById('seedCopyBtn').addEventListener('click', function(){
    const text='NAN Wallet Backup\n\nAddress: '+address+'\nPrivate Key: '+privateKey+'\n\nNEVER share your private key!';
    navigator.clipboard.writeText(text).then(()=>{
      this.innerHTML='✅ Copied! Now click Continue below';
      this.style.background='rgba(52,211,153,.15)';
      this.style.border='1px solid rgba(52,211,153,.4)';
      this.style.color='#34d399';
      toast('✓ Keys copied to clipboard — save somewhere safe!','success',5000);
    }).catch(()=>{
      this.innerHTML='✅ Screenshot this screen to save';
      toast('Tip: Screenshot this page to save your keys','warning',5000);
    });
  });

  document.getElementById('seedContinueBtn').addEventListener('click', function(){
    modal.remove();
    toast('✓ Welcome to NAN! Get free USDC at faucet.circle.com 🎉','success',8000);
  });
}

function copySeedBackup(privateKey, address){
  const text = `NAN Wallet Backup\n\nAddress: ${address}\nPrivate Key: ${privateKey}\n\nIMPORTANT: Never share your private key with anyone.`;
  navigator.clipboard.writeText(text).then(()=>{
    toast('✓ Wallet backup copied to clipboard — save it somewhere safe!','success',6000);
    // Show visual confirmation on the copy button
    const copyBtn=document.getElementById('seedCopyBtn');
    if(copyBtn){
      copyBtn.innerHTML='✅ Copied! Now click Continue below';
      copyBtn.style.background='rgba(52,211,153,.15)';
      copyBtn.style.borderColor='rgba(52,211,153,.4)';
      copyBtn.style.color='var(--success)';
      // Enable continue button
      const contBtn=document.getElementById('seedContinueBtn');
      if(contBtn){
        contBtn.disabled=false;
        contBtn.style.opacity='1';
        contBtn.style.cursor='pointer';
      }
    }
  }).catch(()=>{
    // Fallback if clipboard fails
    toast('✓ Key ready — screenshot this screen to save it','warning',6000);
    const contBtn=document.getElementById('seedContinueBtn');
    if(contBtn){contBtn.disabled=false;contBtn.style.opacity='1';contBtn.style.cursor='pointer';}
  });
}

function closeSeedModal(){
  const modal=document.getElementById('seedPhraseModal');
  if(modal) modal.remove();
  toast('✓ Welcome to NAN! Get free USDC at faucet.circle.com 🎉','success',8000);
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
    btn.style.background='rgba(139,92,246,.1)';
    btn.style.borderColor='rgba(139,92,246,.3)';
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
async function _ensureUnlimitedApprovals(){
  const key='nan_approved_v2_'+userAddr;
  if(localStorage.getItem(key))return;
  try{
    const usdcC=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
    const eurcC=new ethers.Contract(EURC_ADDR,ERC20_ABI,signer);
    const CONTRACTS=[SWAP_CONTRACT,LENDING_CONTRACT,NAME_REGISTRY];
    const THRESHOLD=ethers.parseUnits('1000000',6);
    for(const contract of CONTRACTS){
      const uAllow=await usdcC.allowance(userAddr,contract);
      if(uAllow<THRESHOLD){
        const tx=await usdcC.approve(contract,ethers.MaxUint256,arcGasOpts());
        await tx.wait(1);
        console.log('USDC approved for',contract);
        addTx({hash:tx.hash,to:contract,toRaw:'Unlimited USDC Approval',amount:'0',type:'out',token:'USDC',ts:Date.now(),confirmed:true,source:'approval'});
      }
    }
    const eAllow=await eurcC.allowance(userAddr,SWAP_CONTRACT);
    if(eAllow<THRESHOLD){
      const tx=await eurcC.approve(SWAP_CONTRACT,ethers.MaxUint256,arcGasOpts());
      await tx.wait(1);
      console.log('EURC approved for',SWAP_CONTRACT);
      addTx({hash:tx.hash,to:SWAP_CONTRACT,toRaw:'Unlimited EURC Approval',amount:'0',type:'out',token:'EURC',ts:Date.now(),confirmed:true,source:'approval'});
    }
    localStorage.setItem(key,'1');
    toast('✓ Token approvals verified','success',3000);
  }catch(e){console.warn('Approval check failed:',e.message);}
}

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
    await Promise.all([appU.wait(1),appE.wait(1)]);
    const seedU=uBal/2n;
    const seedE=eBal/2n;
    const liqTx=await swapC.addLiquidity(seedU,seedE,arcGasOpts());
    await liqTx.wait(1);
    toast('✓ Pool liquidity added — swaps ready!','success',5000);
    await refreshBalances();
  }catch(e){console.warn('[pool] Liquidity seed skipped:',e.message);}
}

async function onConnected(isEmail=false, isDev=false){
  document.getElementById('page-land').style.display='none';
  document.getElementById('page-land').style.visibility='hidden';
  document.getElementById('page-land').style.zIndex='-1';
  document.getElementById('bottomNav').classList.add('show');
  showPage('send');
  updateTopBar(true);

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
  renderQR(userAddr);
  renderHistory();
  renderArcDirectory();
  initLendUI();
  document.getElementById('aiBtn').style.display='flex';
  startOrderEngine();
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
  provider=signer=userAddr=wp=null;
  onArcNetwork=false;lastTxHash=lastTxId=null;
  circleWalletId=circleWalletAddress=circleWalletBlockchain=null;
  circleUserToken=circleUserId=otpEmail=null;
  isCircleWallet=false;
  localStorage.removeItem('circleWalletId');
  localStorage.removeItem('circleWalletAddr');
  if(txPollTimer){clearInterval(txPollTimer);txPollTimer=null;}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('bottomNav').classList.remove('show');
  const landPage=document.getElementById('page-land');
  landPage.style.display='flex';
  landPage.style.visibility='visible';
  landPage.style.zIndex='10';
  landPage.classList.add('active');
  // Reset email login box
  const loginBox=document.getElementById('emailLoginBox');
  if(loginBox){loginBox.style.display='block';}
  document.getElementById('connectTopBtn').style.display='none';
  const _disc=document.getElementById('disconnectTopBtn');
  if(_disc)_disc.style.display='none';
  document.getElementById('wrongNetBanner').classList.remove('show');
  document.getElementById('onboardChecklist').style.display='none';
  document.getElementById('devBadge').style.display='none';
  document.getElementById('emailInput').value='';
  document.getElementById('otpBox').style.display='none';
  document.getElementById('aiBtn').style.display='none';
  document.getElementById('agentPanel').style.display='none';
  agentMsgs=[{role:'assistant',content:"Hey! I'm NAN AI ✦  Ask me anything — crypto questions, DeFi, staking, gas fees, or your live wallet. Try \"send 10 USDC\" and I'll set it up!"}];
  toast('Disconnected','info',2000);
}

// ═══════════════════════════════════════════
// BALANCE REFRESH
// ═══════════════════════════════════════════
async function refreshBalances(){
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
      const res=await fetch('/api/transaction/'+txId,{
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
function setMax(){document.getElementById('amtInput').value=(sendToken==='USDC'?Math.max(0,parseFloat(usdcBal)-GAS_USDC):Math.max(0,parseFloat(eurcBal))).toFixed(6);validateSend();}
function validateSend(){
  const addr=document.getElementById('recipInput').value.trim();
  const amt=parseFloat(document.getElementById('amtInput').value)||0;
  const uF=parseFloat(usdcBal)||0,eF=parseFloat(eurcBal)||0;
  const btn=document.getElementById('sendBtn');
  if(!isCircleWallet&&!onArcNetwork){
    btn.disabled=true;btn.textContent='Switch to Arc Testnet';return;
  }
  if(!addr){btn.disabled=true;btn.textContent='Enter address & amount';return;}
  if(!amt||amt<=0){btn.disabled=true;btn.textContent='Enter an amount';return;}
  if(recipType==='address'&&(!resolvedTo||lastResolvedInput!==addr)){btn.disabled=true;btn.textContent='Enter a valid 0x address';return;}
  if(recipType==='arcname'&&(!resolvedTo||lastResolvedInput!==addr)){btn.disabled=true;btn.textContent='Arc name not found';return;}
  if(sendToken==='USDC'&&amt+GAS_USDC>uF){btn.disabled=true;btn.textContent='Insufficient USDC (inc. gas)';return;}
  if(sendToken==='EURC'){if(amt>eF){btn.disabled=true;btn.textContent='Insufficient EURC';return;}if(uF<GAS_USDC){btn.disabled=true;btn.textContent='Need USDC for gas';return;}}
  btn.disabled=false;btn.textContent='Send '+amt.toFixed(2)+' '+sendToken;
}
function showConfirm(){
  const raw=document.getElementById('recipInput').value.trim();
  const amt=parseFloat(document.getElementById('amtInput').value);
  const actualTo=(resolvedTo&&lastResolvedInput===raw)?resolvedTo:null;
  if(!actualTo){toast('Recipient not resolved','error');return;}
  const via=recipType==='address'?'Wallet address':recipType==='x'?'Twitter handle':'Discord handle';
  document.getElementById('confAmt').textContent=amt.toFixed(6)+' '+sendToken;
  document.getElementById('confTo').textContent=short(actualTo)+(recipType!=='address'?' ('+raw+')':'');
  document.getElementById('confVia').textContent=via;
  document.getElementById('sendCard').style.display='none';
  document.getElementById('confirmCard').classList.add('show');
}
function cancelConfirm(){document.getElementById('confirmCard').classList.remove('show');document.getElementById('sendCard').style.display='block';}

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
      const res=await fetch('/api/circle-wallets',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'transfer',walletId:circleWalletId,walletAddress:circleWalletAddress,destinationAddress:to,amount:amt.toString(),tokenSymbol:sendToken}),
      });
      const data=await res.json();
      if(!data.success){throw new Error(data.error||'Transfer failed');}
      lastTxHash=data.txHash||data.transactionId;
      const isConfirmed=!!data.txHash&&!data.pending;
      addTx({hash:lastTxHash,to,toRaw:raw,amount:amt.toFixed(6),type:'out',token:sendToken,ts:Date.now(),confirmed:isConfirmed,source:'circle'});
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
    const receipt=await tx.wait(1);
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
  document.getElementById('successMsg').textContent=amt.toFixed(2)+' '+sendToken+' sent to '+short(to);
  document.getElementById('successHash').textContent=hash||'';
  document.getElementById('successCard').classList.add('show');
  const btn=document.getElementById('confirmSendBtn');
  btn.innerHTML='✓ Confirm & Send';btn.disabled=false;
}
function openExplorer(){if(lastTxHash)window.open(ARC_EXP+'/tx/'+lastTxHash,'_blank');}

function shareOnX(){
  const msg=document.getElementById('successMsg').textContent;
  const hash=lastTxHash||'';
  const explorerUrl=hash?ARC_EXP+'/tx/'+hash:'https://testnet.arcscan.app';
  const text=`Just sent ${msg} on @arc_io Testnet using NAN Wallet! ⚡\n\n🔗 ${explorerUrl}\n\nBuilt with @circle USDC — the stablecoin-native L1\n\n#Arc #USDC #DeFi #NAN #Web3`;
  window.open('https://x.com/intent/tweet?text='+encodeURIComponent(text),'_blank');
}

function showReceipt(){
  const msg=document.getElementById('successMsg').textContent;
  const hash=lastTxHash||'';
  const shortHash=hash?hash.slice(0,10)+'...'+hash.slice(-6):'pending';
  const now=new Date().toLocaleString();
  const modal=document.createElement('div');
  modal.id='receiptModal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);';
  modal.innerHTML=`
    <div style="max-width:360px;width:100%;position:relative;">
      <div id="receiptCard" style="background:linear-gradient(135deg,#07081a 0%,#0e1030 50%,#07081a 100%);border:1px solid rgba(139,92,246,.4);border-radius:20px;padding:28px 24px;position:relative;overflow:hidden;box-shadow:0 0 60px rgba(139,92,246,.3);">
        <!-- Background glow -->
        <div style="position:absolute;top:-60px;right:-60px;width:180px;height:180px;background:radial-gradient(circle,rgba(139,92,246,.25) 0%,transparent 70%);pointer-events:none;"></div>
        <div style="position:absolute;bottom:-40px;left:-40px;width:140px;height:140px;background:radial-gradient(circle,rgba(109,40,217,.2) 0%,transparent 70%);pointer-events:none;"></div>

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:30px;height:30px;background:#8b5cf6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#ede9fe;box-shadow:0 0 12px rgba(139,92,246,.5);">N</div>
            <div>
              <div style="font-size:.75rem;font-weight:700;color:#ede9fe;letter-spacing:.08em;">NAN WALLET</div>
              <div style="font-size:.65rem;color:#a78bfa;letter-spacing:.12em;">ARC TESTNET</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:.65rem;color:#a78bfa;font-family:monospace;">RECEIPT</div>
            <div style="font-size:.65rem;color:#6b5fa0;font-family:monospace;">${now}</div>
          </div>
        </div>

        <!-- Success check -->
        <div style="text-align:center;margin-bottom:20px;">
          <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,rgba(52,211,153,.2),rgba(52,211,153,.1));border:2px solid rgba(52,211,153,.4);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:1.8rem;box-shadow:0 0 24px rgba(52,211,153,.2);">✓</div>
          <div style="font-size:1.3rem;font-weight:700;color:#ede9fe;margin-bottom:4px;">Transaction Confirmed</div>
          <div style="font-size:.75rem;color:#a78bfa;">${msg}</div>
        </div>

        <!-- Divider -->
        <div style="border-top:1px dashed rgba(139,92,246,.25);margin:16px 0;"></div>

        <!-- Details -->
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.72rem;color:#6b5fa0;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;">Network</span>
            <span style="font-size:.72rem;color:#a78bfa;font-family:monospace;display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;background:#a78bfa;border-radius:50%;display:inline-block;box-shadow:0 0 4px #a78bfa;"></span>Arc Testnet</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.72rem;color:#6b5fa0;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;">Status</span>
            <span style="font-size:.72rem;color:#34d399;font-family:monospace;">● Confirmed</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.72rem;color:#6b5fa0;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;">Gas</span>
            <span style="font-size:.72rem;color:#ede9fe;font-family:monospace;">~0.009 USDC</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.72rem;color:#6b5fa0;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;">Tx Hash</span>
            <a href="${ARC_EXP}/tx/${hash}" target="_blank" style="font-size:.65rem;color:#8b5cf6;font-family:monospace;text-decoration:none;">${shortHash} ↗</a>
          </div>
        </div>

        <!-- Divider -->
        <div style="border-top:1px dashed rgba(139,92,246,.25);margin:16px 0;"></div>

        <!-- Powered by -->
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:.65rem;color:#6b5fa0;font-family:monospace;letter-spacing:.1em;text-transform:uppercase;">Powered by</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:6px;">
            <span style="font-size:.72rem;color:#a78bfa;font-weight:600;">Circle USDC</span>
            <span style="color:#6b5fa0;">·</span>
            <span style="font-size:.72rem;color:#a78bfa;font-weight:600;">Arc Network</span>
            <span style="color:#6b5fa0;">·</span>
            <span style="font-size:.72rem;color:#a78bfa;font-weight:600;">NAN Wallet</span>
          </div>
        </div>

        <!-- Buttons -->
        <div style="display:flex;gap:8px;">
          <button onclick="downloadReceipt()" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(139,92,246,.2),rgba(109,40,217,.2));border:1px solid rgba(139,92,246,.35);border-radius:10px;color:#a78bfa;font-family:'Space Grotesk',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;">⬇ Save Image</button>
          <button onclick="shareReceiptX()" style="flex:1;padding:10px;background:#000;border:1px solid #333;border-radius:10px;color:#fff;font-family:'Space Grotesk',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;">𝕏 Post</button>
          <button onclick="document.getElementById('receiptModal').remove()" style="flex:1;padding:10px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border:none;border-radius:10px;color:#ede9fe;font-family:'Space Grotesk',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;">Done ✓</button>
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
  bg.addColorStop(0,'#07081a');bg.addColorStop(0.5,'#0e1030');bg.addColorStop(1,'#07081a');
  ctx.fillStyle=bg;ctx.fillRect(0,0,600,400);

  // Purple glow
  const glow=ctx.createRadialGradient(550,50,0,550,50,200);
  glow.addColorStop(0,'rgba(139,92,246,0.3)');glow.addColorStop(1,'rgba(139,92,246,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,600,400);

  // Border
  ctx.strokeStyle='rgba(139,92,246,0.5)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.roundRect(10,10,580,380,16);ctx.stroke();

  // NAN logo - rounded square like the brand
  ctx.fillStyle='#8b5cf6';
  roundRect(ctx,28,28,44,44,10);ctx.fill();
  // NAN network icon - 3 dots + lines
  ctx.fillStyle='#ede9fe';
  ctx.beginPath();ctx.arc(42,50,3.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(58,42,3.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(58,58,3.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ede9fe';ctx.lineWidth=1.5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(45.5,50);ctx.lineTo(54.5,43.5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(45.5,50);ctx.lineTo(54.5,56.5);ctx.stroke();

  // NAN title
  ctx.fillStyle='#ede9fe';ctx.font='bold 20px Space Grotesk, sans-serif';
  ctx.textAlign='left';ctx.fillText('NAN WALLET',82,45);
  ctx.fillStyle='#a78bfa';ctx.font='11px JetBrains Mono, monospace';
  ctx.fillText('ARC TESTNET',82,63);

  // Date
  ctx.fillStyle='#6b5fa0';ctx.font='10px JetBrains Mono, monospace';
  ctx.textAlign='right';ctx.fillText(now,580,45);

  // Check circle
  ctx.fillStyle='rgba(52,211,153,0.15)';
  ctx.beginPath();ctx.arc(300,155,45,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(52,211,153,0.4)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(300,155,45,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#34d399';ctx.font='36px sans-serif';
  ctx.textAlign='center';ctx.fillText('✓',300,168);

  // Transaction confirmed
  ctx.fillStyle='#ede9fe';ctx.font='bold 22px Space Grotesk, sans-serif';
  ctx.textAlign='center';ctx.fillText('Transaction Confirmed',300,225);
  ctx.fillStyle='#a78bfa';ctx.font='14px Space Grotesk, sans-serif';
  ctx.fillText(msg,300,250);

  // Divider
  ctx.strokeStyle='rgba(139,92,246,0.2)';ctx.lineWidth=1;
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
    ctx.fillStyle='#6b5fa0';ctx.font='11px JetBrains Mono, monospace';
    ctx.textAlign='left';ctx.fillText(label.toUpperCase(),40,y);
    ctx.fillStyle=label==='Status'?'#34d399':'#ede9fe';
    ctx.textAlign='right';ctx.fillText(value,560,y);
  });

  // Footer
  ctx.fillStyle='rgba(139,92,246,0.15)';ctx.fillRect(0,360,600,40);
  ctx.fillStyle='#a78bfa';ctx.font='11px Space Grotesk, sans-serif';
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
  document.getElementById('sendCard').style.display='block';
  document.getElementById('recipInput').value='';document.getElementById('amtInput').value='';
  hideRes();resolvedTo=null;lastResolvedInput='';lastTxHash=null;
  validateSend();document.getElementById('page-send').scrollTop=0;
}
function setSendTab(tab){
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
    const r=await fetch('/api/appkit-swap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'quote',tokenIn,tokenOut,amountIn:amt.toFixed(6)})});
    const d=await r.json();
    if(d.success&&d.quote){_quoteCache[key]={q:d.quote,ts:Date.now()};_applyQuote(d.quote);}
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
  document.getElementById('fromToken').innerHTML=swapFlipped?'<span class="tok-dot eurc-dot" style="margin-right:2px;"></span>EURC':'<span class="tok-dot usdc-dot" style="margin-right:2px;"></span>USDC';
  document.getElementById('toToken').innerHTML=swapFlipped?'<span class="tok-dot usdc-dot" style="margin-right:2px;"></span>USDC':'<span class="tok-dot eurc-dot" style="margin-right:2px;"></span>EURC';
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
      const r=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:isUSDCtoEURC?USDC_ADDR:EURC_ADDR,functionSignature:'approve(address,uint256)',params:[SWAP_CONTRACT,Math.floor(fromAmt*1_000_000).toString()]})});
      const appData=await r.json();
      if(!appData.success)throw new Error(appData.error||'Approve failed');
      await waitForCircleTx(appData.transactionId,'approve');
      const r2=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:SWAP_CONTRACT,functionSignature:isUSDCtoEURC?'swapUSDCtoEURC(uint256)':'swapEURCtoUSDC(uint256)',params:[Math.floor(fromAmt*1_000_000).toString()]})});
      const d=await r2.json();
      if(!d.success)throw new Error(d.error||'Swap failed');
      const rate=isUSDCtoEURC?FX:(1/FX);
      const amtOut=(fromAmt*rate*0.999).toFixed(4);
      toast('Swapped '+fromAmt.toFixed(2)+' '+tokenIn+' to '+amtOut+' '+tokenOut,'success',8000);
      addTx({hash:d.txHash,to:SWAP_CONTRACT,toRaw:'NANSwap',amount:fromAmt.toFixed(6),fromToken:tokenIn,toToken:tokenOut,outAmount:amtOut,type:'swap',token:tokenIn,ts:Date.now(),confirmed:!!d.txHash,source:'swap'});
      document.getElementById('swapFrom').value='';document.getElementById('swapTo').value='';
      lastTxHash=d.txHash;btn.innerHTML='Swap';btn.disabled=false;
      setTimeout(()=>refreshBalances(),5000);return;
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
      // Only approve if allowance is insufficient
      const currentAllowance=await tokenContract.allowance(userAddr,SWAP_CONTRACT);
      if(currentAllowance<amtIn){
        const approveTx=await tokenContract.approve(SWAP_CONTRACT,ethers.MaxUint256,arcGasOpts());
        await approveTx.wait(1);
      }
      const swapTx=isUSDCtoEURC?await swapContract.swapUSDCtoEURC(amtIn):await swapContract.swapEURCtoUSDC(amtIn);
      await swapTx.wait(1);
      toast('Swap confirmed on Arc!','success',6000);
      addTx({hash:swapTx.hash,to:SWAP_CONTRACT,toRaw:'NANSwap',amount:fromAmt.toFixed(6),type:'out',token:tokenIn,ts:Date.now(),confirmed:true,source:'swap'});
      await refreshBalances();
      document.getElementById('swapFrom').value='';document.getElementById('swapTo').value='';
    }
  }catch(err){
    toast('Swap failed: '+err.message.slice(0,100),'error',6000);
  }
  btn.innerHTML='Swap';btn.disabled=false;
}



function initSwapUI(){
  document.getElementById('swapModeBanner').style.display='none';
  document.getElementById('swapBtn').textContent='Swap USDC ↔ EURC';
}

// ═══════════════════════════════════════════
// BRIDGE — CCTP
// ═══════════════════════════════════════════
function setBridgeMax(){document.getElementById('bridgeAmt').value=Math.max(0,parseFloat(usdcBal)-GAS_USDC*2).toFixed(6);}

function toggleCCTP(){
  const panel = document.getElementById('cctpPanel');
  const arrow = document.getElementById('cctpArrow');
  const btn = document.getElementById('cctpToggleBtn');
  const open = panel.style.display === 'block';
  panel.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▾' : '▴';
}
async function doBridge(){
  const destChain=document.getElementById('bridgeDestChain').value;
  const destAddr=document.getElementById('bridgeDestAddr').value.trim();
  const amt=parseFloat(document.getElementById('bridgeAmt').value);
  if(!userAddr){toast('Connect wallet first','error');return;}
  if(isCircleWallet){if(!circleWalletId){toast('Wallet not ready — log in again','error');return;}const btn=document.getElementById('bridgeBtn');btn.innerHTML='<span class="spinner"></span>Step 1/3: Approving USDC…';btn.disabled=true;try{const r=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'bridge',walletId:circleWalletId,destChain,destAddr,bridgeAmount:amt.toString()})});const data=await r.json();if(!data.success)throw new Error(data.error||'Bridge failed');lastTxHash=data.burnTxHash;addTx({hash:data.burnTxHash,to:destAddr,toRaw:'Bridge→'+destChain,amount:amt.toFixed(6),type:'bridge',token:'USDC',ts:Date.now(),confirmed:true,source:'cctp',destChain});toast('✓ USDC burned! Polling attestation…','success',8000);await refreshBalances();await pollIrisAttestation(data.burnTxHash,destChain);}catch(err){toast((err?.message||'Bridge failed').slice(0,140),'error',8000);}finally{btn.innerHTML='Bridge USDC via CCTP';btn.disabled=false;}return;}if(!signer){toast('Connect MetaMask to use the bridge','error');return;}
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
      const appTx=await usdc.approve(CCTP_TOKEN_MESSENGER,amtParsed,arcGasOpts());
      btn.innerHTML='<span class="spinner"></span>Confirming approval…';
      await appTx.wait(1);
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
        const pr = await fetch('/api/cctp-attest', {
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
          mintEl.innerHTML = '⚠️ Auto-mint unavailable for email wallets. '
            + 'Complete the mint manually on ' + (destConfig?.chainName || destChain) + '. '
            + '<a href="https://developers.circle.com/cctp/transfer-usdc-on-testnet-from-ethereum-to-avalanche" '
            + 'target="_blank" style="color:var(--accent3);">Circle guide ↗</a>';
        }
        toast('Attestation ready — complete mint manually on ' + (destConfig?.chainName || destChain), 'info', 10000);
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
function addTx(tx){txHistory.unshift(tx);saveTxHistory();renderHistory();}
function clearHistory(){
  if(!txHistory.length){toast('Nothing to clear','info',2000);return;}
  if(!confirm('Clear all history?'))return;
  txHistory=[];localStorage.removeItem('arcTx_'+userAddr);renderHistory();toast('Cleared','info',2000);
}
function renderHistory(){
  // Update stats
  const m=getMetrics();
  const ss=document.getElementById('statSends');
  const sw=document.getElementById('statSwaps');
  const sb=document.getElementById('statBridges');
  if(ss) ss.textContent=m.totalSends||txHistory.filter(t=>t.source!=='swap'&&t.type==='out').length||0;
  if(sw) sw.textContent=m.totalSwaps||txHistory.filter(t=>t.source==='swap').length||0;
  if(sb) sb.textContent=m.totalBridges||txHistory.filter(t=>t.source==='cctp').length||0;
  const list=document.getElementById('txList');
  if(!txHistory.length){list.innerHTML='<div class="empty"><div class="empty-icon">◎</div><div class="empty-text">No transactions yet.<br/><span style="font-size:.72rem;color:var(--text3);">Send or swap to get started.</span></div></div>';return;}
  list.innerHTML=txHistory.map(tx=>{
    const isSim=tx.hash?.startsWith('sim-');
    let icon='↑',cls='out',label='',amt='';
    if(tx.type==='out'){icon='↑';cls='out';label='Sent to '+(tx.toRaw||short(tx.to));amt='−'+parseFloat(tx.amount).toFixed(2)+' '+(tx.token||'USDC');}
    if(tx.type==='in'){icon='↓';cls='in';label=tx.toRaw||'Received';amt='+'+parseFloat(tx.amount).toFixed(2)+' '+(tx.token||'USDC');}
    if(tx.type==='swap'){icon='⇄';cls='swap';label=parseFloat(tx.amount).toFixed(2)+' '+tx.fromToken+' → '+parseFloat(tx.outAmount).toFixed(2)+' '+tx.toToken;amt='Swap';}
    if(tx.type==='stake'){icon='◈';cls='stake';label='Staked '+parseFloat(tx.amount).toFixed(2)+' USDC';amt='Stake';}
    if(tx.type==='bridge'){icon='⬡';cls='bridge';label='Bridge → '+(tx.destChain||'');amt='−'+parseFloat(tx.amount).toFixed(2)+' USDC';}
    const srcBadge=tx.source==='circle'?'<span style="color:var(--accent3);font-size:.65rem;">●Circle</span>':tx.source==='cctp'?'<span style="color:#60a5fa;font-size:.65rem;">●CCTP</span>':tx.source==='sim'?'<span style="color:var(--warning);font-size:.65rem;">⚗sim</span>':'';
    const statusClass=tx.confirmed?'confirmed':tx.failed?'failed':'pending';
    const timeStr=isSim?`<span class="tx-status sim">simulated</span>`:
      `${new Date(tx.ts).toLocaleString()} · <a href="${ARC_EXP}/tx/${tx.hash}" target="_blank">View ↗</a> ${srcBadge}`;
    return `<div class="tx-item"><div class="tx-ico ${cls}">${icon}</div><div class="tx-info"><div class="tx-title">${label}</div><div class="tx-time">${timeStr}</div>${!isSim?`<span class="tx-status ${statusClass}">${tx.confirmed?'confirmed':tx.failed?'failed':'pending'}</span>`:''}</div><div class="tx-amt ${cls==='out'||cls==='bridge'?'out':'in'}">${amt}</div></div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// FAUCET
// ═══════════════════════════════════════════
async function claimFaucet(){
  if(!userAddr){toast('Connect wallet first','error');return;}
  const btn=document.getElementById('faucetBtn');
  btn.innerHTML='<span class="spinner"></span>Claiming…';btn.disabled=true;
  try{
    const res=await fetch('/api/faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:userAddr})});
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
  try{new QRCode(b,{text:a,width:100,height:100,colorDark:isDark?'#07081a':'#1e1040',colorLight:'#ffffff'});}
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
  document.getElementById('bulk-usdc').style.background = token==='USDC'?'linear-gradient(135deg,#8b5cf6,#7c3aed)':'var(--surface)';
  document.getElementById('bulk-usdc').style.border = token==='USDC'?'none':'1px solid var(--border)';
  document.getElementById('bulk-usdc').style.color = token==='USDC'?'#ede9fe':'var(--text3)';
  document.getElementById('bulk-eurc').style.background = token==='EURC'?'linear-gradient(135deg,#8b5cf6,#7c3aed)':'var(--surface)';
  document.getElementById('bulk-eurc').style.border = token==='EURC'?'none':'1px solid var(--border)';
  document.getElementById('bulk-eurc').style.color = token==='EURC'?'#ede9fe':'var(--text3)';
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
      <div style="width:22px;height:22px;border-radius:50%;background:rgba(139,92,246,.15);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;color:var(--accent3);flex-shrink:0;">${i+1}</div>
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
function savePayrollGroup(){
  if(!bulkRecipients.length){ toast('Add recipients first','error'); return; }
  const name = prompt('Name this payroll group (e.g. Engineering Team, October Payroll):');
  if(!name) return;
  const groups = JSON.parse(localStorage.getItem('nan_payroll_groups')||'{}');
  groups[name] = bulkRecipients.map(r=>({addr:r.addr,name:r.name,amount:r.amount}));
  localStorage.setItem('nan_payroll_groups', JSON.stringify(groups));
  renderPayrollGroups();
  toast('✓ Group "'+name+'" saved!','success',3000);
}

function loadPayrollGroup(){
  const sel = document.getElementById('payrollGroupSelect');
  const name = sel.value;
  if(!name) return;
  const groups = JSON.parse(localStorage.getItem('nan_payroll_groups')||'{}');
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
  const groups = JSON.parse(localStorage.getItem('nan_payroll_groups')||'{}');
  const keys = Object.keys(groups);
  sel.innerHTML = '<option value="">— Select saved group —</option>'
    + keys.map(k=>`<option value="${k}">${k} (${groups[k].length} people)</option>`).join('');
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
  bg.addColorStop(0,'#07081a'); bg.addColorStop(1,'#0e1030');
  ctx.fillStyle = bg; ctx.fillRect(0,0,600,canvas.height);
  ctx.strokeStyle = 'rgba(139,92,246,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(10,10,580,canvas.height-20,16); ctx.stroke();

  // Header
  ctx.fillStyle = '#ede9fe'; ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left'; ctx.fillText('NAN Payroll Receipt', 28, 48);
  ctx.fillStyle = '#a78bfa'; ctx.font = '12px monospace';
  ctx.fillText(now, 28, 68);
  ctx.fillStyle = '#6b5fa0'; ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(lastPayrollTxs.length+' recipients · '+total.toFixed(2)+' '+bulkToken+' total', 572, 68);

  // Divider
  ctx.strokeStyle = 'rgba(139,92,246,0.2)'; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(28,82); ctx.lineTo(572,82); ctx.stroke();
  ctx.setLineDash([]);

  // Rows
  lastPayrollTxs.forEach((r,i)=>{
    const y = 110 + i*44;
    ctx.fillStyle = i%2===0?'rgba(139,92,246,0.04)':'transparent';
    ctx.fillRect(18, y-16, 564, 40);
    ctx.fillStyle = '#ede9fe'; ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(r.name||r.addr.slice(0,16)+'…', 28, y+4);
    ctx.fillStyle = '#6b5fa0'; ctx.font = '10px monospace';
    ctx.fillText(r.addr.slice(0,18)+'…', 28, y+18);
    ctx.fillStyle = r.status==='done'?'#34d399':'#f87171';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'right';
    ctx.fillText(r.amount.toFixed(2)+' '+bulkToken, 572, y+4);
    ctx.fillStyle = r.status==='done'?'#34d399':'#f87171';
    ctx.font = '10px monospace';
    ctx.fillText(r.status==='done'?'✓ Sent':'✗ Failed', 572, y+18);
  });

  // Footer
  const fy = canvas.height - 30;
  ctx.fillStyle = 'rgba(139,92,246,0.15)'; ctx.fillRect(0,fy-14,600,44);
  ctx.fillStyle = '#a78bfa'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('NAN Wallet · Powered by Circle USDC · Arc Testnet', 300, fy+8);

  const link = document.createElement('a');
  link.download = 'nan-payroll-'+Date.now()+'.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('✓ Payroll receipt downloaded!','success',3000);
}

async function doBulkSend(){
  if(!bulkRecipients.length) return;
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

  for(let i = 0; i < bulkRecipients.length; i++){
    const r = bulkRecipients[i];
    progressTitle.textContent = `Sending ${i+1} of ${total}...`;
    progressBar.style.width = (i/total*100) + '%';

    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:.72rem;';
    item.innerHTML = `<span style="color:var(--text3);font-family:'JetBrains Mono',monospace;">${r.name||r.addr.slice(0,12)}…</span><span id="bulk-status-${i}" style="color:var(--text3);">⏳</span>`;
    progressList.appendChild(item);

    try {
      if(isCircleWallet && circleWalletId){
        const res = await fetch('/api/circle-wallets', {
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
        addTx({hash:data.txHash||data.transactionId,to:r.addr,toRaw:r.name||r.addr,amount:r.amount.toFixed(6),type:'out',token:bulkToken,ts:Date.now(),confirmed:!!data.txHash,source:'circle'});
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
    } catch(e) {
      r.status = 'failed';
      document.getElementById('bulk-status-'+i).textContent = '✗';
      document.getElementById('bulk-status-'+i).style.color = 'var(--danger)';
      console.error('Bulk send error for', r.addr, e.message);
    }

    progressBar.style.width = ((i+1)/total*100) + '%';
    await new Promise(res => setTimeout(res, 500));
  }

  await refreshBalances();
  progressTitle.textContent = `Done! ${done}/${total} sent successfully`;
  progressBar.style.width = '100%';
  progressBar.style.background = done===total ? 'linear-gradient(90deg,#34d399,#10b981)' : 'linear-gradient(90deg,#f87171,#ef4444)';
  renderBulkRecipients();
  toast(done===total ? `✅ All ${done} payments sent!` : `Sent ${done}/${total} — ${total-done} failed`, done===total?'success':'error', 5000);

  lastPayrollTxs = [...bulkRecipients];
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
        await fetch('/api/orders?wallet='+userAddr,{
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
    const res=await fetch('/api/orders?wallet='+userAddr);
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
      fetch('/api/orders?wallet='+userAddr,{
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

function toggleAgent(){
  agentOpen=!agentOpen;
  const panel=document.getElementById('agentPanel');
  if(agentOpen){
    panel.style.display='flex';
    panel.style.flexDirection='column';
    requestAnimationFrame(()=>{ panel.style.transform='translateY(0)'; });
    renderAgentMsgs();renderAgentChips();scrollAgentBottom();
  }else{
    panel.style.transform='translateY(100%)';
    setTimeout(()=>{ panel.style.display='none'; },350);
  }
}
function resizeAIPanel(){
  const btn=document.getElementById('aiBtn');
  if(!btn)return;
  if(window.innerWidth>1040){
    btn.style.right='calc(50% - 520px)';
    btn.style.bottom='120px';
  }else{
    btn.style.right='0px';
    btn.style.bottom='90px';
  }
}
window.addEventListener('resize',resizeAIPanel);

function renderAgentMsgs(){
  const el=document.getElementById('agentMessages');
  if(!el)return;
  el.innerHTML=agentMsgs.map(m=>`
    <div style="display:flex;flex-direction:column;align-items:${m.role==='user'?'flex-end':'flex-start'};">
      <div style="max-width:85%;padding:9px 13px;border-radius:${m.role==='user'?'14px 14px 3px 14px':'14px 14px 14px 3px'};background:${m.role==='user'?'linear-gradient(135deg,#8b5cf6,#7c3aed)':'var(--card)'};border:${m.role==='user'?'none':'1px solid var(--border)'};color:var(--text);font-size:.75rem;line-height:1.55;">${m.content}</div>
      ${m.action?`<button onclick='executeAgentAction(${JSON.stringify(m.action)})' style="margin-top:6px;padding:7px 14px;border-radius:10px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border:none;color:#ede9fe;font-size:.7rem;font-weight:700;cursor:pointer;">⚡ ${m.action.action.toUpperCase()} ${m.action.amount||''} ${m.action.token||''}</button>`:''}
    </div>
  `).join('');
}
function renderAgentChips(){
  if(agentMsgs.length>1){document.getElementById('agentChips').innerHTML='';return;}
  const chips=["What's my balance?","Sell USDC when rate hits","Send 20 USDC on Friday","My pending orders","Cancel all orders","Swap USDC → EURC","Bridge via CCTP"];
  document.getElementById('agentChips').innerHTML=chips.map(c=>`<button onclick="sendAgentMsg('${c}')" style="font-size:.72rem;color:var(--accent3);background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:20px;padding:4px 10px;cursor:pointer;font-family:'Space Grotesk',sans-serif;">${c}</button>`).join('');
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

  const context=`You are NAN AI ✦, a friendly DeFi assistant embedded in NAN Wallet — a stablecoin wallet built on Arc Testnet, Circle's new Layer-1 blockchain.

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
    const res=await fetch('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        system:context,usdcBal:usdcBal,eurcBal:eurcBal,userAddress:userAddr,
        messages:agentMsgs.slice(0,-1).filter(m=>!m.content.includes('spinner')).map(m=>({role:m.role,content:m.content}))
      }),
    });
    const data=await res.json();
    const reply=data.reply||"Sorry, couldn't reach the AI.";
    const actionMatch=reply.match(/<ACTION>([\s\S]*?)<\/ACTION>/);
    let action=null;
    try{if(actionMatch)action=JSON.parse(actionMatch[1].trim());}catch{}
    const clean=reply.replace(/<ACTION>[\s\S]*?<\/ACTION>/g,'').trim();
    agentMsgs[agentMsgs.length-1]={role:'assistant',content:clean,action};
    // Speak the AI response
    speakResponse(clean);
  }catch{
    agentMsgs[agentMsgs.length-1]={role:'assistant',content:'Connection error — is the server running?'};
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
      if(userAddr){fetch('/api/orders?wallet='+userAddr,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:userAddr,id:'all'})}).catch(()=>{});}
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
    toast('Use the email login above for Circle wallet','info',4000);
    const emailInput=document.getElementById('emailInput');
    if(emailInput)emailInput.focus();
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
// LEND & BORROW (simulated)
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
    const r = await fetch('/api/gateway-deposit', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ walletId: _wId, amount }),
    });
    const data = await r.json();
    if (!data.success) return toast(data.error || 'Deposit failed','error');
    toast(`✅ Depositing ${amount} USDC to Gateway — refreshing balance...`,'success');
    setTimeout(() => refreshGatewayBalance(), 10000);
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
    const res=await fetch('/api/gateway',{
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
          :entries.map(([chain,amount])=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:rgba(139,92,246,.06);border-radius:6px;"><span style="font-size:.72rem;color:var(--text2);">${chain.replace(/_/g,' ')}</span><span style="font-size:.72rem;font-weight:600;color:var(--accent3);">${parseFloat(amount).toFixed(2)} USDC</span></div>`).join('');
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
    // Warn if pool is low
    if(poolStats.usdcLiq<1||poolStats.eurcLiq<1){
      console.warn('Pool liquidity low — swaps will simulate');
    }
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
  document.getElementById('suppliedAmt').textContent=lendPositions.supplied.toFixed(2)+' USDC';
  document.getElementById('borrowedAmt').textContent=lendPositions.borrowed.toFixed(2)+' USDC';
  document.getElementById('accruedInterest').textContent=lendPositions.interest.toFixed(6)+' USDC';
  const hf=lendPositions.borrowed>0?(lendPositions.supplied*0.8/lendPositions.borrowed).toFixed(2):'—';
  const hfEl=document.getElementById('healthFactor');
  hfEl.textContent=hf;
  hfEl.style.color=hf==='—'?'var(--text3)':parseFloat(hf)>1.5?'var(--success)':parseFloat(hf)>1.1?'var(--warning)':'var(--danger)';
  document.getElementById('repayDisplay').textContent=lendPositions.borrowed.toFixed(2)+' USDC';
  document.getElementById('withdrawDisplay').textContent=lendPositions.supplied.toFixed(2)+' USDC';
  const total=lendPositions.supplied>0?'$'+lendPositions.supplied.toFixed(2):'—';
  document.getElementById('totalSupplied').textContent=total;
  const util=lendPositions.supplied>0?((lendPositions.borrowed/lendPositions.supplied)*100).toFixed(1)+'%':'—';
  document.getElementById('utilizationRate').textContent=util;
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
    const amtAtomic=Math.floor(amt*1_000_000).toString();
    if(isCircleWallet&&circleWalletId){
      // Circle email wallet path
      btn.innerHTML='<span class="spinner"></span>Approving...';
      const appRes=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
          contractAddress:tokenAddr,functionSignature:'approve(address,uint256)',
          params:[LENDING_CONTRACT,amtAtomic]})});
      const appData=await appRes.json();
      if(!appData.success)throw new Error(appData.error||'Approve failed');
      btn.innerHTML='<span class="spinner"></span>Waiting for approval...';
      await waitForCircleTx(appData.transactionId, 'approve');
      btn.innerHTML='<span class="spinner"></span>Supplying on Arc...';
      const supRes=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
          contractAddress:LENDING_CONTRACT,functionSignature:'supply(uint256)',
          params:[amtAtomic]})});
      const supData=await supRes.json();
      if(!supData.success)throw new Error(supData.error||'Supply failed — check NANLendingPool is deployed & you have enough USDC');
      toast('✓ Supplied '+amt.toFixed(2)+' '+lendAsset+' on Arc!','success',5000);
      const supplyHash=supData.txHash||supData.transactionId||'pending';
      addTx({hash:supplyHash,to:LENDING_CONTRACT,toRaw:'NANLendingPool',amount:amt.toFixed(6),type:'out',token:lendAsset,ts:Date.now(),confirmed:!!supData.txHash&&!supData.pending,source:'lending'});
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
      const approveTx=await tokenContract.approve(LENDING_CONTRACT,amtParsed,arcGasOpts());
      btn.innerHTML='<span class="spinner"></span>Supplying on Arc...';
      await approveTx.wait(1);
      const tx=await lendContract.supply(amtParsed,arcGasOpts());
      await tx.wait(1);
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
      const r=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,
          contractAddress:LENDING_CONTRACT,functionSignature:'borrow(uint256)',params:[amtAtomic]})});
      const d=await r.json();
      if(!d.success)throw new Error(d.error||'Borrow failed');
      toast('✓ Borrowed '+amt.toFixed(2)+' USDC!','success',5000);
      addTx({hash:d.txHash||d.transactionId,to:LENDING_CONTRACT,toRaw:'Borrow',amount:amt.toFixed(6),type:'in',token:'USDC',ts:Date.now(),confirmed:true,source:'lending'});
      setTimeout(()=>{refreshBalances();refreshLendPosition();},6000);

    }else if(signer){
      const lendContract=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,signer);
      const usdcForBorrow=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
      toast('Approving borrow…','info',3000);
      const approveBorrowTx=await usdcForBorrow.approve(LENDING_CONTRACT,amtParsed,arcGasOpts());
      await approveBorrowTx.wait(1);
      toast('Confirming borrow…','info',3000);
      const tx=await lendContract.borrow(amtParsed,arcGasOpts());
      await tx.wait(1);
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
      const appR=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:USDC_ADDR,functionSignature:'approve(address,uint256)',params:[LENDING_CONTRACT,amtAtomic]})});
      const appD=await appR.json();
      if(!appD.success)throw new Error(appD.error||'Approve failed');
      btn.innerHTML='<span class="spinner"></span>Waiting…';
      await waitForCircleTx(appD.transactionId,'approve');
      const r=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:LENDING_CONTRACT,functionSignature:'repay(uint256)',params:[amtAtomic]})});
      const d=await r.json();
      if(!d.success)throw new Error(d.error||'Repay failed');
      toast('✓ Repaid '+amt.toFixed(2)+' USDC on-chain!','success',5000);
      addTx({hash:d.txHash||d.transactionId,to:LENDING_CONTRACT,toRaw:'NANLendingPool Repay',amount:amt.toFixed(6),type:'out',token:'USDC',ts:Date.now(),confirmed:!!d.txHash,source:'lending'});
      setTimeout(()=>{refreshBalances();refreshLendPosition();},8000);
    }else if(signer){
      const usdc=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
      const lendContract=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,signer);
      const amtParsed=ethers.parseUnits(amt.toFixed(6),6);
      const appTx=await usdc.approve(LENDING_CONTRACT,amtParsed,arcGasOpts());
      await appTx.wait(1);
      const tx=await lendContract.repay(amtParsed,arcGasOpts());
      await tx.wait(1);
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
      const r=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:LENDING_CONTRACT,functionSignature:'withdraw(uint256)',params:[amtAtomic]})});
      const d=await r.json();
      if(!d.success)throw new Error(d.error||'Withdraw failed');
      toast('✓ Withdrew '+amt.toFixed(2)+' USDC + interest on-chain!','success',5000);
      addTx({hash:d.txHash||d.transactionId,to:LENDING_CONTRACT,toRaw:'NANLendingPool Withdraw',amount:amt.toFixed(6),type:'in',token:'USDC',ts:Date.now(),confirmed:!!d.txHash,source:'lending'});
      setTimeout(()=>{refreshBalances();refreshLendPosition();},8000);
    }else if(signer){
      const lendContract=new ethers.Contract(LENDING_CONTRACT,LENDING_ABI,signer);
      const tx=await lendContract.withdraw(ethers.parseUnits(amt.toFixed(6),6),arcGasOpts());
      await tx.wait(1);
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
  res.style.background='rgba(139,92,246,.06)';res.style.border='1px solid rgba(139,92,246,.2)';res.style.color='var(--text2)';
  res.textContent='Checking...';
  try{
    if(provider){
      const nameContract=new ethers.Contract(NAME_REGISTRY,NAME_ABI,provider);
      const available=await nameContract.isAvailable(val);
      if(available){
        res.style.background='rgba(52,211,153,.07)';res.style.border='1px solid rgba(52,211,153,.22)';res.style.color='var(--success)';
        res.textContent='✓ '+val+'.arc is available!';
      }else{
        const owner=await nameContract.resolve(val);
        res.style.background='rgba(248,113,113,.07)';res.style.border='1px solid rgba(248,113,113,.22)';res.style.color='var(--danger)';
        res.textContent='✗ '+val+'.arc is taken — owned by '+short(owner);
      }
    } else {
      // Fallback local check
      const taken=arcNames.find(n=>n.name===val);
      res.style.background=taken?'rgba(248,113,113,.07)':'rgba(52,211,153,.07)';
      res.style.border=taken?'1px solid rgba(248,113,113,.22)':'1px solid rgba(52,211,153,.22)';
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
      const appR=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:USDC_ADDR,functionSignature:'approve(address,uint256)',params:[NAME_REGISTRY,feeAtomic]})});
      const appD=await appR.json();
      if(!appD.success)throw new Error(appD.error||'Approve failed');
      if(btn)btn.innerHTML='<span class="spinner"></span>Waiting for approval…';
      await waitForCircleTx(appD.transactionId,'approve');
      if(btn)btn.innerHTML='<span class="spinner"></span>Registering on Arc…';
      const regR=await fetch('/api/circle-wallets',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'contractCall',walletId:circleWalletId,contractAddress:NAME_REGISTRY,functionSignature:'register(string,uint8)',params:[name,arcNameDurationYears]})});
      const regD=await regR.json();
      if(!regD.success)throw new Error(regD.error||'Registration failed');
      toast('✓ '+name+'.arc registered on Arc! 🎉','success',7000);
      addTx({hash:regD.txHash||regD.transactionId,to:NAME_REGISTRY,toRaw:'Registered '+name+'.arc',amount:arcNameFeeUsdc.toFixed(6),type:'out',token:'USDC',ts:Date.now(),confirmed:!!regD.txHash,source:'arcname'});
      await refreshBalances();await refreshArcNames();
    }else if(signer){
      const usdcContract=new ethers.Contract(USDC_ADDR,ERC20_ABI,signer);
      const nameContract=new ethers.Contract(NAME_REGISTRY,NAME_ABI,signer);
      const fee=ethers.parseUnits(arcNameFeeUsdc.toString(),6);
      const approveTx=await usdcContract.approve(NAME_REGISTRY,fee,arcGasOpts());
      if(btn)btn.innerHTML='<span class="spinner"></span>Registering on Arc...';
      await approveTx.wait(1);
      const tx=await nameContract.register(name,arcNameDurationYears,arcGasOpts());
      await tx.wait(1);
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
      // Fallback simulation for testing only
      usdcBal=String(bal-arcNameFeeUsdc-0.009);
      const expiry=new Date();expiry.setFullYear(expiry.getFullYear()+arcNameDurationYears);
      arcNames.unshift({name,owner:userAddr,expires:expiry.toLocaleDateString(),years:arcNameDurationYears,fee:arcNameFeeUsdc,ts:Date.now()});
      saveArcNames();
      toast('✓ '+name+'.arc registered! (simulated — deploy NANNameRegistry for on-chain)','success',6000);
      refreshBalances();
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
      <span style="font-size:.65rem;padding:3px 8px;border-radius:4px;background:rgba(52,211,153,.08);color:var(--success);border:1px solid rgba(52,211,153,.2);">Active</span>
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
async function waitForCircleTx(txId, label='tx', timeoutMs=55000) {
  if(!txId) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const res = await fetch('/api/transaction/' + txId);
      const data = await res.json();
      const state = data.state || data.status || '';
      if (state === 'CONFIRMED' || state === 'COMPLETE') return true;
      if (['FAILED','CANCELLED','DENIED'].includes(state))
        throw new Error(label + ' failed: ' + state);
    } catch(e) {
      if (e.message.includes('failed:')) throw e;
    }
  }
  throw new Error(label + ' timed out');
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
  document.getElementById('page-land').style.display='flex';
  initSwapUI();
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
  try{paymentRequests=JSON.parse(localStorage.getItem('nan_payreqs')||'[]');}catch{paymentRequests=[];}
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
  localStorage.setItem('nan_payreqs',JSON.stringify(paymentRequests));
}
function genPRId(){
  return 'pr_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
}
function buildPRLink(pr){
  const base=window.location.origin+window.location.pathname;
  const p=new URLSearchParams({pay:pr.id,to:pr.to,amt:pr.amount||'',tok:pr.token,lbl:pr.label,note:pr.note||''});
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
function createPaymentRequest(){
  const label=document.getElementById('prLabel').value.trim();
  const amt=parseFloat(document.getElementById('prAmount').value)||null;
  const note=document.getElementById('prNote').value.trim();
  const email=document.getElementById('prEmail')?.value.trim()||otpEmail||'';
  if(!label){toast('Enter a label','error');return;}
  if(!userAddr){toast('Connect wallet first','error');return;}
  const pr={id:genPRId(),to:userAddr,token:currentPRToken,amount:amt,label,note,creatorEmail:email,expiresAt:currentPRExpiry>0?Date.now()+currentPRExpiry*3600000:null,status:'pending',createdAt:Date.now()};
  paymentRequests.unshift(pr);
  savePaymentRequests();
  const link=buildPRLink(pr);
  navigator.clipboard.writeText(link).catch(()=>{});
  toast('✓ Created! Link copied — share it to get paid','success',4000);
  viewPaymentRequest(pr.id);
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
  try{new QRCode(qrBox,{text:link,width:120,height:120,colorDark:'#1e1040',colorLight:'#ffffff'});}catch{}
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
    list.innerHTML='<div style="text-align:center;padding:32px 16px;"><div style="font-size:2rem;margin-bottom:10px;">🧾</div><div style="font-size:.88rem;font-weight:700;color:var(--text);margin-bottom:5px;">No requests yet</div><div style="font-size:.78rem;color:var(--text3);margin-bottom:16px;">Create one to start getting paid</div><button onclick="goPage(\'payreq-new\')" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);border:none;border-radius:10px;color:#ede9fe;font-family:\'Space Grotesk\',sans-serif;font-weight:700;font-size:.82rem;padding:10px 20px;cursor:pointer;">+ Create First Request</button></div>';
    return;
  }
  list.innerHTML=paymentRequests.map(pr=>{
    const isExpired=pr.expiresAt&&Date.now()>pr.expiresAt&&pr.status==='pending';
    const status=isExpired?'expired':pr.status;
    const statusColor=status==='paid'?'var(--success)':status==='expired'?'var(--warning)':'var(--accent3)';
    const statusLabel=status==='paid'?'✓ Paid':status==='expired'?'Expired':'Pending';
    const amtText=pr.amount?parseFloat(pr.amount).toFixed(2)+' '+pr.token:'Open · '+pr.token;
    return `<div onclick="viewPaymentRequest('${pr.id}')" style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border);cursor:pointer;" onmouseover="this.style.background='rgba(139,92,246,.04)'" onmouseout="this.style.background=''"><div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:10px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">🧾</div><div><div style="font-size:.85rem;font-weight:600;color:var(--text);margin-bottom:2px;">${pr.label}</div><div style="font-size:.72rem;color:var(--text3);">${new Date(pr.createdAt).toLocaleDateString()}</div></div></div><div style="text-align:right;"><div style="font-size:.88rem;font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace;">${amtText}</div><div style="font-size:.68rem;font-weight:600;color:${statusColor};">${statusLabel}</div></div></div>`;
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
function doPayNow(){
  const to=document.getElementById('payNowTo').textContent;
  const token=document.getElementById('payNowToken').textContent;
  const fixedAmt=document.getElementById('payNowAmt').textContent;
  const customAmt=document.getElementById('payNowCustomAmt').value;
  const amt=fixedAmt==='Open amount'?parseFloat(customAmt):parseFloat(fixedAmt);
  if(!amt||amt<=0){toast('Enter an amount','error');return;}
  if(!userAddr){toast('Connect wallet first','error');return;}
  goPage('send');
  setTimeout(()=>{
    document.getElementById('recipInput').value=to;
    document.getElementById('amtInput').value=amt.toFixed(2);
    sendToken=token||'USDC';
    document.getElementById('sendTokenLabel').textContent=sendToken;
    onRecipInput();
    validateSend();
    toast('Fill in the send form to complete payment','info',4000);
  },300);
}

async function sendPaymentNotification(pr){
  if(!pr.creatorEmail)return;
  try{
    await fetch('/api/otp',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'notify',
        email:pr.creatorEmail,
        subject:'✓ Payment received — '+pr.label,
        message:'You received '+(pr.amount||'a')+ ' '+pr.token+' for "'+pr.label+'" on NAN Wallet.\n\nCheck your wallet at nanarc.xyz'
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
      goPage('pay-now');
      if(dl.lbl)toast('💸 Pay: '+dl.lbl,'info',5000);
      window._prDeepLink=null;
    },600);
  };
})();
