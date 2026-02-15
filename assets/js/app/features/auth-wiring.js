// Feature: auth modal wiring (buttons -> handlers)
// Extracted from former Stage5 monolith.

(function mkAuthWiring(){
  if(window.__MK_AUTH_WIRING__) return;
  window.__MK_AUTH_WIRING__ = true;

  // --- Auth modal wiring ---
    document.getElementById('authClose')?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      closeModalAuth();
    });
    document.getElementById('authSwitchToRegister')?.addEventListener('click', ()=>openModalAuth('register'));
    document.getElementById('authSwitchToLogin')?.addEventListener('click', ()=>openModalAuth('login'));
    document.getElementById('authLoginBtn')?.addEventListener('click', async ()=>{
      try{ await handleLogin(); }catch(e){ toast(e.message||'Chyba'); }
    });
    document.getElementById('authRegisterBtn')?.addEventListener('click', async ()=>{
      try{ await handleRegister(); }catch(e){ toast(e.message||'Chyba'); }
    });
    document.getElementById('authGoogleBtn')?.addEventListener('click', async ()=>{
      try{ await googleSignIn(); closeModalAuth(); }catch(e){ toast(e.message||'Chyba'); }
    });
    document.getElementById('authResendVerify')?.addEventListener('click', resendVerification);
})();
