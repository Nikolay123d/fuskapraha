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
  // Historically the badge id changed: bellBadge is the current one.
  setBadge(document.getElementById('bellBadge') || document.getElementById('notifBadge'), __notifUnread);
}

// Bell badge = unread notifications by ts > users/{uid}/notifLastSeenTs
let __notifLastSeenTs = 0;
let __notifLastSeenRef = null;
let __notifLastSeenCb = null;
let __notifUnreadRef = null;
let __notifUnreadCb = null;

function watchNotificationsUnread(uid){
  try{ if(__notifLastSeenRef && __notifLastSeenCb) __notifLastSeenRef.off('value', __notifLastSeenCb); }catch(e){}
  try{ if(__notifUnreadRef && __notifUnreadCb) __notifUnreadRef.off('value', __notifUnreadCb); }catch(e){}
  __notifLastSeenRef = null;
  __notifLastSeenCb = null;
  __notifUnreadRef = null;
  __notifUnreadCb = null;
  __notifUnread = 0;
  __notifLastSeenTs = 0;
  updateTopBadges();
  if(!uid) return;

  __notifLastSeenRef = db.ref('users/'+uid+'/notifLastSeenTs');
  __notifLastSeenCb = (snap)=>{
    const v = snap.val();
    __notifLastSeenTs = (typeof v === 'number' && isFinite(v)) ? v : 0;

    // Re-bind unread query whenever lastSeen changes
    try{ if(__notifUnreadRef && __notifUnreadCb) __notifUnreadRef.off('value', __notifUnreadCb); }catch(e){}
    __notifUnreadRef = db.ref('notifications/'+uid)
      .orderByChild('ts')
      .startAt(__notifLastSeenTs + 1)
      .limitToLast(200);

    __notifUnreadCb = (ss)=>{
      const val = ss.val() || {};
      const c = Object.keys(val).length;
      __notifUnread = c;
      updateTopBadges();
    };
    __notifUnreadRef.on('value', __notifUnreadCb);
  };
  __notifLastSeenRef.on('value', __notifLastSeenCb);
}
window.watchNotificationsUnread = watchNotificationsUnread;

async function markNotificationsRead(){
  const me = auth?.currentUser;
  if(!me) return;
  const nowTs = Date.now();
  try{ await db.ref('users/'+me.uid+'/notifLastSeenTs').set(nowTs); }catch(e){ console.warn('markNotificationsRead failed', e); }
}
window.markNotificationsRead = markNotificationsRead;

// Lightweight notifications rendering for the Bell modal
function __escHtml(s){
  return String(s||'').replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function __formatNotifTitle(n){
  const t = String(n?.type||'').toLowerCase();
  if(t==='dm') return 'DM';
  if(t==='friend') return 'Přátelé';
  if(t==='vacancy') return 'Nabídka práce';
  if(t.startsWith('premium')) return 'Premium';
  return 'Upozornění';
}

function handleNotificationClick(n){
  const me = auth?.currentUser;
  if(!me) return;

  try{ closeModal && closeModal('modalNotif'); }catch(e){}

  const type = String(n?.type||'').toLowerCase();
  if(type==='friend'){
    try{ window.__HIGHLIGHT_FRIEND_UID__ = n.from || n.fromUid || null; }catch(e){}
    try{ showView('view-friends', {forceEnter:true}); }catch(e){}
    return;
  }
  if(type==='dm'){
    let peer = n.from || n.fromUid || n.peerUid || null;
    if(!peer && n.room && typeof n.room==='string'){
      const parts = n.room.split('_');
      if(parts.length>=2){
        peer = parts.find(x=>x && x!==me.uid) || null;
      }
    }
    if(peer) openDM(peer);
    return;
  }
  if(type.startsWith('premium')){
    // MVP: open premium/bot flow (dedicated view can be added later)
    try{ if(window.openPremiumBot) window.openPremiumBot(); }catch(e){}
    return;
  }
}

window.handleNotificationClick = handleNotificationClick;

async function loadNotificationsFeed(limit=100){
  const me = auth?.currentUser;
  const feed = document.getElementById('notifFeed');
  if(!feed) return;
  if(!me){
    feed.innerHTML = '<div class="mini-hint">Pro zobrazení upozornění se přihlaste.</div>';
    return;
  }

  const lim = Math.max(10, Math.min(200, Number(limit)||100));
  feed.innerHTML = '<div class="mini-hint">Načítám…</div>';
  try{
    const snap = await db.ref('notifications/'+me.uid).orderByChild('ts').limitToLast(lim).get();
    const val = snap.val() || {};
    const rows = Object.entries(val).map(([id, n])=>({id, ...(n||{})}))
      .sort((a,b)=> (Number(a.ts||0) - Number(b.ts||0)));
    if(!rows.length){
      feed.innerHTML = '<div class="mini-hint">Žádná upozornění.</div>';
      return;
    }
    feed.innerHTML = '';
    rows.forEach(n=>{
      const row = document.createElement('div');
      row.className = 'msg';
      const ts = Number(n.ts||0);
      const timeStr = ts ? new Date(ts).toLocaleString() : '';
      const title = __formatNotifTitle(n);
      const text = n.text ? __escHtml(n.text).replace(/\n/g,'<br>') : '';
      row.innerHTML = `
        <div class="bubble">
          <div style="font-size:12px;opacity:.7;margin-bottom:4px">${__escHtml(title)}${timeStr?(' · '+__escHtml(timeStr)):''}</div>
          ${text || '<span style="opacity:.7">(bez textu)</span>'}
        </div>
      `;
      row.addEventListener('click', ()=>{
        try{ handleNotificationClick(n); }catch(e){}
      });
      feed.appendChild(row);
    });
  }catch(e){
    console.error(e);
    feed.innerHTML = '<div class="mini-hint">Chyba při načítání upozornění.</div>';
  }
}

window.loadNotificationsFeed = loadNotificationsFeed;

async function clearNotifications(){
  const me = auth?.currentUser;
  if(!me) return;
  try{
    await db.ref('notifications/'+me.uid).remove();
  }catch(e){ console.error(e); }
  try{ await markNotificationsRead(me.uid); }catch(e){}
  try{ await loadNotificationsFeed(100); }catch(e){}
}

window.clearNotifications = clearNotifications;

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

// Convenience wrappers (used by router lifecycle)
window.startDmThreadsLive = (uid)=>watchDmThreadsLive(uid);
window.stopDmThreadsLive = ()=>watchDmThreadsLive(null);

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

