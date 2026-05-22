with open('index.html','r',encoding='utf-8') as f:
    c=f.read()
old='if(isCircleWallet&&circleWalletId&&circleWalletAddress){'
new=('if(isCircleWallet&&circleWalletId){'
    'try{'
    'const r=await fetch("/api/circle-wallets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"contractCall",walletId:circleWalletId,contractAddress:isUSDCtoEURC?USDC_ADDR:EURC_ADDR,functionSignature:"approve(address,uint256)",params:[SWAP_CONTRACT,Math.floor(fromAmt*1000000).toString()]})});'
    'const appData=await r.json();'
    'if(!appData.success)throw new Error(appData.error||"Approve failed");'
    'await waitForCircleTx(appData.transactionId,"approve");'
    'const r2=await fetch("/api/circle-wallets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"contractCall",walletId:circleWalletId,contractAddress:SWAP_CONTRACT,functionSignature:isUSDCtoEURC?"swapUSDCtoEURC(uint256)":"swapEURCtoUSDC(uint256)",params:[Math.floor(fromAmt*1000000).toString()]})});'
    'const d=await r2.json();'
    'if(!d.success)throw new Error(d.error||"Swap failed");'
    'const rate=isUSDCtoEURC?FX:(1/FX);'
    'const amtOut=(fromAmt*rate*0.999).toFixed(4);'
    'toast("Swapped!","success",8000);'
    'addTx({hash:d.txHash,to:SWAP_CONTRACT,toRaw:"NANSwap",amount:fromAmt.toFixed(6),fromToken:tokenIn,toToken:tokenOut,outAmount:amtOut,type:"swap",token:tokenIn,ts:Date.now(),confirmed:!!d.txHash,source:"swap"});'
    'document.getElementById("swapFrom").value="";'
    'document.getElementById("swapTo").value="";'
    'lastTxHash=d.txHash;'
    'btn.innerHTML="Swap via Circle App Kit";btn.disabled=false;'
    'setTimeout(()=>refreshBalances(),5000);return;'
    '}catch(err){'
    'toast("Swap failed: "+err.message.slice(0,120),"error",7000);'
    'btn.innerHTML="Swap via Circle App Kit";btn.disabled=false;return;'
    '}}')
print('Found:',old in c)
c=c.replace(old,new,1)
with open('index.html','w',encoding='utf-8') as f:
    f.write(c)
print('Done')
