// ==== NOTIFICATIONS / BADGES (Topbar) ====
function setBadge(el, n){
  if(!el) return;
  const v = Number(n||0);
  el.textContent = v > 99 ? '99+' : String(v);
  el.hidden = !(v > 0);
}

let __dmUnread = 0;
let __notifUnread = 0;
let __inboxMetaRef = null;
let __inboxMetaCb = null;

function updateTopBadges(){
  setBadge(document.getElementById('dmBadge'), __dmUnread);
  setBadge(document.getElementById('notifBadge'), __notifUnread);
}

// DM badge = суммарные непрочитанные по inboxMeta/{uid}.*.unread
function watchDmUnread(uid){
  try{ if(__inboxMetaRef && __inboxMetaCb) __inboxMetaRef.off('value', __inboxMetaCb); }catch(e){}
  __inboxMetaRef = null;
  __inboxMetaCb = null;
  __dmUnread = 0;
  updateTopBadges();
  if(!uid) return;

  __inboxMetaRef = db.ref('inboxMeta/'+uid);
  __inboxMetaCb = (snap)=>{
    let total = 0;
    const v = snap.val();
    if(v){
      for(const k of Object.keys(v)){
        const n = Number(v[k]?.unread || 0);
        if(n > 0) total += n;
      }
    }
    __dmUnread = total;
    updateTopBadges();
  };
  __inboxMetaRef.on('value', __inboxMetaCb);
}



let __dmThreadsLiveRef = null;
let __dmThreadsLiveCb = null;
let __dmThreadsLiveTimer = null;

// Live refresh DM thread list when inboxMeta changes (so new messages appear immediately)
function watchDmThreadsLive(uid){
  try{ if(__dmThreadsLiveRef && __dmThreadsLiveCb) __dmThreadsLiveRef.off('value', __dmThreadsLiveCb); }catch(e){}
  __dmThreadsLiveRef = null;
  __dmThreadsLiveCb = null;
  if(__dmThreadsLiveTimer){ try{ clearTimeout(__dmThreadsLiveTimer); }catch(e){} __dmThreadsLiveTimer=null; }
  if(!uid) return;

  __dmThreadsLiveRef = db.ref('inboxMeta/'+uid).orderByChild('ts').limitToLast(50);
  __dmThreadsLiveCb = ()=>{
    // debounce to avoid spam on fast updates
    if(__dmThreadsLiveTimer) return;
    __dmThreadsLiveTimer = setTimeout(async ()=>{
      __dmThreadsLiveTimer = null;
      try{
        // Only auto-refresh when DM tab was opened at least once OR is currently visible.
        const cur = ((window.MK && window.MK.state && window.MK.state.view) ? window.MK.state.view : (localStorage.getItem('mk_last_view')||localStorage.getItem('lastView')||'view-chat'));
        if(cur==='view-dm' || window.__dmThreadsLoaded){
          if(window.loadDmThreads) await window.loadDmThreads();
        }
      }catch(e){}
    }, 350);
  };
  __dmThreadsLiveRef.on('value', __dmThreadsLiveCb);
}

// Handle Google redirect return (must run on every page load)
let __REDIRECT_HANDLED = false;
async function handleGoogleRedirectResult(){
  if(__REDIRECT_HANDLED) return;
  __REDIRECT_HANDLED = true;
  try{
    // Ensure persistence promise resolved before reading redirect result
    try{ await (window.__AUTH_PERSIST_PROMISE__||Promise.resolve()); }catch(e){}
    const res = await auth.getRedirectResult();
    // NOTE: res.user can be null on normal loads; that's ok.
    if(res && res.user){
      try{ sessionStorage.removeItem('__mk_auth_redirecting'); }catch(e){}
      try{ await ensureUserPublic(res.user); }catch(e){}
      try{ closeModalAuth(); }catch(e){}
    }
  }catch(e){
    // Show the real error (otherwise it looks like “nothing happens”)
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

async function ensureUserPublic(u, extra={}){
  if(!u) return;
  const pubRef = db.ref('usersPublic/'+u.uid);
  const snap = await pubRef.get();
  const cur = snap.val() || {};
  const merged = {
    email: u.email || cur.email || '',
    nick: cur.nick || extra.nick || u.displayName || u.email || 'Uživatel',
    role: cur.role || extra.role || '',
    avatar: cur.avatar || extra.avatar || window.DEFAULT_AVATAR,
    createdAt: cur.createdAt || Date.now()
  };
  await pubRef.update(merged);

  // email index for friend add
  // emails/* mapping disabled (rules no longer allow it)
}

function setVerifyDeadline(u){
  // 30 minutes after registration
  try{
    const until = Date.now() + 30*60*1000;
    localStorage.setItem('verify_until_'+u.uid, String(until));
  }catch{}
}
function getVerifyDeadline(u){
  try{
    const v = localStorage.getItem('verify_until_'+u.uid);
    return v ? parseInt(v,10) : 0;
  }catch{ return 0; }
}

async function requireAuthForAction(){
  const u = auth.currentUser;
  if(u) return true;
  openModalAuth('login');
  return false;
}

async function handleRegister(){
  const email = $('#authEmail').value.trim();
  const pass = $('#authPass').value;
  const nick = $('#authNick').value.trim();
  const role = $('#authRole').value;
  if(!email || !pass || pass.length<6) return toast('Zadejte e-mail a heslo (min. 6)');
  if(!nick) return toast('Zadejte přezdívku (nick)');
  if(!role) return toast('Vyberte roli');
  try{
    const remember = !!document.getElementById('authRemember')?.checked;
    await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
  }catch(e){}
  const cred = await auth.createUserWithEmailAndPassword(email, pass);
  await ensureUserPublic(cred.user, {nick, role});
  try{ await cred.user.sendEmailVerification(); toast('Potvrzovací e-mail odeslán (zkontrolujte SPAM)'); }catch{}
  setVerifyDeadline(cred.user);
  closeModalAuth();
}
async function handleLogin(){
  const email = $('#authEmail').value.trim();
  const pass = $('#authPass').value;
  if(!email || !pass) return toast('Zadejte e-mail a heslo');
  try{
    const remember = !!document.getElementById('authRemember')?.checked;
    await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
  }catch(e){}
  await auth.signInWithEmailAndPassword(email, pass);
  closeModalAuth();
}


async function enforceVerifyWindow(u){
  if(!u) return;
  if(u.emailVerified) return;
  const until = getVerifyDeadline(u);
  if(!until) return; // legacy users: don't hard block
  if(Date.now() <= until) return;

  // Block sending until verified
  window.__EMAIL_VERIFY_REQUIRED__ = true;
  toast('Potvrďte e-mail (ověření vypršelo)');
}

async function forgotPassword(){
  const email = document.getElementById("authEmail")?.value?.trim();
  if(!email) return toast("Zadejte e-mail");
  try{
    await auth.sendPasswordResetEmail(email);
    toast("Odesláno: zkontrolujte e-mail (SPAM)");
  }catch(e){
    const code = e?.code || "";
    toast("Reset hesla: "+(code||e?.message||"Chyba"));
  }
}

async function resendVerification(){
  const u=auth.currentUser;
  if(!u) return;
  try{ await u.sendEmailVerification(); toast('Znovu odesláno (zkontrolujte SPAM)'); }
  catch(e){ toast('Chyba: '+(e.message||'')); }
}

$('#btnLogin')?.addEventListener('click', async ()=>{
  cookieBanner();
  await unlockAudio();
  await ensureNotifications();
  openModalAuth('login');
});
$('#btnSignout')?.addEventListener('click', ()=> auth.signOut().catch(()=>{}));
async function doPasswordReset(){
  // allow reset when logged out as well
  const email = (document.getElementById('authEmail')?.value||'').trim() || auth.currentUser?.email || prompt('E-mail pro obnovu:');
  if(!email) return;
  try{
    await auth.sendPasswordResetEmail(email);
    toast('E-mail pro obnovu odeslán (zkontrolujte SPAM)');
  }catch(e){
    toast(e.message||'Chyba');
  }
}
document.getElementById('resetPassTop')?.addEventListener('click', doPasswordReset);
document.getElementById('authResetPass')?.addEventListener('click', doPasswordReset);

