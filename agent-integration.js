// agent-integration.js
// NAN Wallet — AI Agent integration stub
// All agent logic lives in app.js. This file exists to satisfy the script tag
// and to expose any future integrations cleanly.

(function(){
  // Confirm the agent panel elements are present after DOM is ready
  document.addEventListener('DOMContentLoaded', function(){
    const btn   = document.getElementById('aiBtn');
    const panel = document.getElementById('agentPanel');
    if(!btn || !panel){
      console.warn('[NAN Agent] aiBtn or agentPanel not found in DOM');
      return;
    }
    // Ensure button is visible once wallet is connected (handled by app.js onConnected)
    // Nothing extra needed — app.js fully controls the agent
    console.log('[NAN Agent] Agent integration ready ✦');
  });
})();
