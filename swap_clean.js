async function doSwap(){
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
      const approveTx=await tokenContract.approve(SWAP_CONTRACT,amtIn);
      await approveTx.wait(1);
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

