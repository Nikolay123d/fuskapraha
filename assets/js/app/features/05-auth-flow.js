// ==== AUTH FLOW (register/login/verify/reset + Google redirect) ====
// Kept separate from notifications (06-notifications.js) to avoid "fat" modules.

(function authFlowModule(){
  // Handle Google redirect return (must run on every page load)
  let __REDIRECT_HANDLED = false;


function normalizeNick(n){
  n = String(n||'').trim().replace(/\s+/g,' ');
  if(n.length > 32) n = n.slice(0,32);
  return n;
}

function setVerifyUI(user){
  try{
    const el = document.getElementById('verifyEmail');
    if(el) el.textContent = (user && user.email) ? user.email : 'вашу почту';
  }catch(e){}
}

function openVerifyView(user){
  setVerifyUI(user);
  try{ showView('view-verify'); }catch(e){}
}


  async function ensureUserPublic(u, extra={}){
    if(!u) return;
    const pubRef = db.ref('usersPublic/'+u.uid);
    const snap = await pubRef.get();
    const cur = snap.val() || {};

    const merged = {
      nick: cur.nick || normalizeNick(extra.nick) || normalizeNick(u.displayName) || ('Uživatel #' + (u.uid||'').slice(-4)),
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
  const email = String(document.getElementById('authEmail').value||'').trim();
  const pass  = String(document.getElementById('authPass').value||'');
  const role  = (document.getElementById('authRole')?.value||'seeker');
  let nick    = normalizeNick(document.getElementById('authNick').value);

  if(!email || !pass){ toast('Введите e-mail и пароль'); return; }
  if(pass.length < 6){ toast('Пароль минимум 6 символов'); return; }
  if(!nick){ toast('Введите ник'); return; }
  if(role!=='seeker' && role!=='employer'){ toast('Выберите роль'); return; }

  try{
    const auth = firebase.auth();
    const cred = await auth.createUserWithEmailAndPassword(email, pass);

    // 1) Always try to send verification e-mail first (so profile rules can't block it)
    try{
      await cred.user.sendEmailVerification();
      toast('Письмо для активации отправлено. Проверьте Спам.');
      setVerifyDeadline(cred.user, 30); // 30 minutes soft window
      try{ localStorage.setItem('unv_msgs_'+cred.user.uid,'0'); }catch(e){}
      try{ localStorage.setItem('verify_last_sent_'+cred.user.uid, String(Date.now())); }catch(e){}
    }catch(e){
      console.warn('sendEmailVerification failed', e);
      toast('Не удалось отправить письмо. Нажмите “Отправить ещё раз” на экране активации.');
    }

    // 2) Create public profile (nick/role) — do not block UX if rules reject something
    try{
      await ensureUserPublic(cred.user, {nick, role});
    }catch(e){
      console.warn('ensureUserPublic failed', e);
      toast('Профиль создан частично. Откройте “Профиль” и сохраните ещё раз.');
    }

    closeModalAuth();
    openVerifyView(cred.user);
  }catch(e){
    toast(e?.message || 'Ошибка регистрации');
  }
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
  const auth = firebase.auth();
  const u = auth.currentUser;
  if(!u){ toast('Сначала войдите'); return; }

  const k = 'verify_last_sent_' + u.uid;
  const now = Date.now();
  const last = parseInt(localStorage.getItem(k)||'0',10)||0;
  const waitMs = 30*1000;

  if(now - last < waitMs){
    const sec = Math.ceil((waitMs - (now-last))/1000);
    toast('Подождите ' + sec + 'с и попробуйте снова.');
    try{
      const hint = document.getElementById('verifyHint');
      if(hint) hint.textContent = 'Можно отправить ещё раз через ' + sec + 'с.';
    }catch(e){}
    return;
  }

  try{
    await u.sendEmailVerification();
    try{ localStorage.setItem(k, String(now)); }catch(e){}
    toast('Письмо отправлено ещё раз (проверьте Спам).');
    setVerifyUI(u);
    try{
      const hint = document.getElementById('verifyHint');
      if(hint) hint.textContent = 'Письмо отправлено. Если не пришло — проверьте Спам.';
    }catch(e){}
  }catch(e){
    console.warn('sendEmailVerification failed', e);
    toast(e?.message || 'Ошибка отправки письма');
  }
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

  // Verify view hooks
  document.getElementById('btnVerifyResend')?.addEventListener('click', resendVerification);
  document.getElementById('btnVerifyCheck')?.addEventListener('click', async ()=>{
    const u = auth.currentUser;
    if(!u){ toast('Сначала войдите'); return; }
    try{ await u.reload(); }catch(e){}
    if(auth.currentUser && auth.currentUser.emailVerified){
      toast('E-mail подтверждён ✅');
      try{ localStorage.removeItem('unv_msgs_'+u.uid); }catch(e){}
      try{ showView('view-chat'); }catch(e){}
    }else{
      toast('Пока не подтверждено. Проверьте почту и Спам.');
      setVerifyUI(u);
    }
  });
  document.getElementById('btnVerifySkip')?.addEventListener('click', ()=>{ try{ showView('view-chat'); }catch(e){} });
})();
