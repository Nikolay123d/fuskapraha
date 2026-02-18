// ==== AUTH FLOW (register/login/verify/reset + Google redirect) ====
// Kept separate from notifications (06-notifications.js) to avoid "fat" modules.

(function authFlowModule(){
  // Handle Google redirect return (must run on every page load)
  let __REDIRECT_HANDLED = false;

  async function ensureUserPublic(u, extra={}){
    if(!u) return;
    const pubRef = db.ref('usersPublic/'+u.uid);
    const snap = await pubRef.get();
    const cur = snap.val() || {};

    const merged = {
      nick: cur.nick || extra.nick || u.displayName || 'Uživatel',
      role: cur.role || extra.role || 'seeker',
      avatar: cur.avatar || extra.avatar || window.DEFAULT_AVATAR,
      plan: cur.plan || 'free',
      createdAt: cur.createdAt || Date.now()
    };
    await pubRef.update(merged);

    // Privacy: never expose email in usersPublic
    try{ await pubRef.child('email').remove(); }catch(e){}
  }
  window.ensureUserPublic = ensureUserPublic;

  async function handleGoogleRedirectResult(){
    if(__REDIRECT_HANDLED) return;
    __REDIRECT_HANDLED = true;
    try{
      // Ensure persistence promise resolved before reading redirect result
      try{ await (window.__AUTH_PERSIST_PROMISE__||Promise.resolve()); }catch(e){}
      const res = await auth.getRedirectResult();
      if(res && res.user){
        try{ sessionStorage.removeItem('__mk_auth_redirecting'); }catch(e){}
        try{ await ensureUserPublic(res.user); }catch(e){}
        try{ closeModalAuth?.(); }catch(e){}
      }
    }catch(e){
      const code = e?.code || '';
      if(code==='auth/unauthorized-domain'){
        toast('Google přihlášení: doména není povolená ve Firebase (Authorized domains).');
      }else if(code){
        toast('Google přihlášení: '+code);
      }else{
        toast('Google přihlášení: '+(e?.message||'Chyba'));
      }
      console.error('[AUTH] getRedirectResult failed', e);
    }
  }

  // Handle redirect result exactly once (prevents double handlers / UI resets)
  window.__AUTH_REDIRECT_PROMISE__ = (async()=>{
    try{ await (window.__AUTH_PERSIST_PROMISE__||Promise.resolve()); }catch(e){}
    try{ await handleGoogleRedirectResult(); }catch(e){}
  })();

  // Email verification window helpers
  function setVerifyDeadline(user){
    try{
      const until = Date.now() + 30*60*1000; // 30 minutes after registration
      localStorage.setItem('verify_until_'+user.uid, String(until));
    }catch(e){}
  }

  function getVerifyDeadline(userOrUid){
    try{
      const uid = (typeof userOrUid === 'string') ? userOrUid : (userOrUid?.uid||'');
      if(!uid) return 0;
      const v = localStorage.getItem('verify_until_'+uid);
      return v ? parseInt(v, 10) : 0;
    }catch(e){
      return 0;
    }
  }
  window.getVerifyDeadline = getVerifyDeadline;

  async function handleRegister(){
    const email = (document.getElementById('authEmail')?.value||'').trim();
    const pass = (document.getElementById('authPass')?.value||'');
    const nick = (document.getElementById('authNick')?.value||'').trim();
    const role = (document.getElementById('authRole')?.value||'');

    if(!email || !pass || pass.length < 6) return toast('Zadejte e-mail a heslo (min. 6)');
    if(!nick) return toast('Zadejte přezdívku (nick)');
    if(!role) return toast('Vyberte roli');

    try{
      const remember = !!document.getElementById('authRemember')?.checked;
      await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    }catch(e){}

    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await ensureUserPublic(cred.user, {nick, role});
    try{ await cred.user.sendEmailVerification(); toast('Potvrzovací e-mail odeslán (zkontrolujte SPAM)'); }catch(e){}
    setVerifyDeadline(cred.user);
    try{ closeModalAuth?.(); }catch(e){}
  }
  window.handleRegister = handleRegister;

  async function handleLogin(){
    const email = (document.getElementById('authEmail')?.value||'').trim();
    const pass = (document.getElementById('authPass')?.value||'');
    if(!email || !pass) return toast('Zadejte e-mail a heslo');

    try{
      const remember = !!document.getElementById('authRemember')?.checked;
      await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    }catch(e){}

    await auth.signInWithEmailAndPassword(email, pass);
    try{ closeModalAuth?.(); }catch(e){}
  }
  window.handleLogin = handleLogin;

  async function resendVerification(){
    const u = auth?.currentUser;
    if(!u) return;
    try{ await u.sendEmailVerification(); toast('Znovu odesláno (zkontrolujte SPAM)'); }
    catch(e){ toast('Chyba: '+(e?.message||'')); }
  }
  window.resendVerification = resendVerification;

  async function doPasswordReset(){
    // Allow reset when logged out as well
    const email = (document.getElementById('authEmail')?.value||'').trim() || auth?.currentUser?.email || prompt('E-mail pro obnovu:');
    if(!email) return;
    try{
      await auth.sendPasswordResetEmail(email);
      toast('E-mail pro obnovu odeslán (zkontrolujte SPAM)');
    }catch(e){
      toast(e?.message || 'Chyba');
    }
  }

  // Topbar hooks
  document.getElementById('btnLogin')?.addEventListener('click', async ()=>{
    try{ cookieBanner(); }catch(e){}
    try{ await unlockAudio(); }catch(e){}
    try{ await ensureNotifications(); }catch(e){}
    try{ openModalAuth?.('login'); }catch(e){ try{ document.getElementById('modalAuth').hidden=false; }catch(_e){} }
  });

  document.getElementById('btnSignout')?.addEventListener('click', ()=> auth.signOut().catch(()=>{}));
  document.getElementById('resetPassTop')?.addEventListener('click', doPasswordReset);
  document.getElementById('authResetPass')?.addEventListener('click', doPasswordReset);
})();
