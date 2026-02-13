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
  // Bell icon badge (unread notifications)
  setBadge(document.getElementById('bellBadge'), __notifUnread);
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

// ---------------------------------------------------------------------------
// Notifications unread badge (lastSeenTs model)
// usersPublic/{uid}/notifLastSeenTs
// unread = count(notifications/{uid} where ts > lastSeenTs)
// ---------------------------------------------------------------------------

let __notifLastSeenRef = null;
let __notifLastSeenCb = null;
let __notifUnreadRef = null;
let __notifUnreadCb = null;
let __notifLastSeenTs = 0;

function _detachNotifUnread(){
  try{ if(__notifUnreadRef && __notifUnreadCb) __notifUnreadRef.off('value', __notifUnreadCb); }catch(e){}
  __notifUnreadRef = null;
  __notifUnreadCb = null;
}
function _attachNotifUnread(uid){
  _detachNotifUnread();
  if(!uid) return;

  // Limit the scan window so we don't pull an unbounded feed.
  const q = db.ref('notifications/'+uid).orderByChild('ts').startAt(__notifLastSeenTs + 1).limitToLast(200);
  __notifUnreadRef = q;
  __notifUnreadCb = (snap)=>{
    const v = snap.val() || {};
    const n = Object.keys(v).length;
    __notifUnread = n;
    updateTopBadges();
  };
  q.on('value', __notifUnreadCb);
}

function watchNotificationsBadge(uid){
  // Detach previous listeners
  try{ if(__notifLastSeenRef && __notifLastSeenCb) __notifLastSeenRef.off('value', __notifLastSeenCb); }catch(e){}
  __notifLastSeenRef = null;
  __notifLastSeenCb = null;
  _detachNotifUnread();

  __notifUnread = 0;
  __notifLastSeenTs = 0;
  updateTopBadges();
  if(!uid) return;

  // Watch lastSeen
  __notifLastSeenRef = db.ref('usersPublic/'+uid+'/notifLastSeenTs');
  __notifLastSeenCb = (snap)=>{
    const ts = Number(snap.val()||0);
    __notifLastSeenTs = ts;
    _attachNotifUnread(uid);
  };
  __notifLastSeenRef.on('value', __notifLastSeenCb);
}

// Expose for auth-state
try{ window.watchNotificationsBadge = watchNotificationsBadge; }catch(e){}

async function markNotificationsSeen(){
  const me = auth.currentUser;
  if(!me) return;
  try{
    await db.ref('usersPublic/'+me.uid+'/notifLastSeenTs').set(Date.now());
  }catch(e){}
}

async function loadNotificationsList(){
  const me = auth.currentUser;
  if(!me) return;
  const feed = document.getElementById('notifFeed');
  if(!feed) return;

  feed.innerHTML = '';
  try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}

  try{
    const snap = await db.ref('notifications/'+me.uid).orderByChild('ts').limitToLast(60).get();
    const v = snap.val() || {};
    const ids = Object.keys(v).sort((a,b)=> (Number(v[b]?.ts||0) - Number(v[a]?.ts||0)));

    for(const id of ids){
      const n = v[id] || {};
      const fromU = n.from ? await getUser(n.from) : null;

      const type = String(n.type||'').toLowerCase();
      let title = n.title || '';
      let text  = n.text  || '';
      // Fallbacks for legacy/compact payloads
      if(!title){
        if(type === 'dm') title = 'Nová DM';
        else if(type === 'friend') title = 'Žádost o přátelství';
        else if(type === 'friendaccepted') title = 'Přátelství potvrzeno';
        else if(type === 'premiumgranted') title = 'Privilegium';
        else if(type === 'vacancy') title = 'Nabídka práce';
        else title = 'Upozornění';
      }
      if(!text){
        const who = (fromU?.nick || fromU?.email || (n.from || '') || 'Uživatel');
        if(type === 'dm') text = who + (n.text ? (': ' + n.text) : '');
        else if(type === 'friend') text = who + ' poslal žádost';
        else if(type === 'friendaccepted') text = who + ' potvrdil přátelství';
      }

      const row = document.createElement('div');
      row.className = 'msg';
      row.innerHTML = `
        <div class="ava" ${n.from?`data-uid="${esc(n.from)}"`:''}><img src="${esc(fromU?.avatar||window.DEFAULT_AVATAR)}" alt="" loading="lazy"></div>
        <div class="bubble" style="width:100%">
          <div class="name"><b>${esc(title)}</b> ${esc(text)}</div>
          <div class="muted" style="font-size:12px">${new Date(n.ts||0).toLocaleString()}</div>
        </div>
        <button class="ghost" data-del="${esc(id)}" type="button">×</button>
      `;

      // delete
      row.querySelector('[data-del]')?.addEventListener('click', async (ev)=>{
        ev.stopPropagation();
        try{ await db.ref('notifications/'+me.uid+'/'+id).remove(); }catch(e){}
      });

      // click actions
      row.addEventListener('click', async ()=>{
        try{
          const t = String(n.type||'').toLowerCase();
          if(t==='dm' && n.from){
            try{ window.closeModal && window.closeModal('modalNotif'); }catch(e){}
            await openDM(n.from);
            return;
          }
          if(t==='friend' || t==='friendaccepted'){
            try{ window.closeModal && window.closeModal('modalNotif'); }catch(e){}
            showView('view-friends');
            return;
          }
          if(t==='premiumgranted'){
            try{ window.closeModal && window.closeModal('modalNotif'); }catch(e){}
            try{ if(window.openPremium) openPremium(); else openPremiumBot && openPremiumBot(); }catch(e){}
            return;
          }
        }catch(e){}
      });

      feed.appendChild(row);
    }

    if(ids.length===0){
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.padding = '10px 12px';
      empty.textContent = 'Žádná upozornění.';
      feed.appendChild(empty);
    }
  }catch(e){
    console.warn('[NOTIFS] load failed', e);
    const err = document.createElement('div');
    err.className = 'muted';
    err.style.padding='10px 12px';
    err.textContent = 'Chyba načítání upozornění.';
    feed.appendChild(err);
  }
}

async function openNotifications(){
  const me = auth.currentUser;
  if(!me){
    toast('Přihlaste se');
    openModalAuth('login');
    return;
  }
  try{ window.openModal && window.openModal('modalNotif'); }catch(e){}
  // mark seen on open
  try{ await markNotificationsSeen(); }catch(e){}
  // render list
  try{ await loadNotificationsList(); }catch(e){}
}

// Wire UI (only once)
try{
  if(!window.__MK_NOTIF_UI_WIRED){
    window.__MK_NOTIF_UI_WIRED = true;
    document.getElementById('btnBell')?.addEventListener('click', ()=>{ openNotifications(); });
    document.getElementById('notifClear')?.addEventListener('click', async ()=>{
      const me = auth.currentUser; if(!me) return;
      if(!confirm('Vyčistit upozornění?')) return;
      try{ await db.ref('notifications/'+me.uid).remove(); }catch(e){}
      try{ await markNotificationsSeen(); }catch(e){}
      try{ await loadNotificationsList(); }catch(e){}
    });
    // When modal opens via other code, ensure lastSeen updates.
    document.getElementById('modalNotif')?.addEventListener('click', (e)=>{
      // no-op placeholder: modal backdrop close is handled in Stage5.
    });
    window.openNotifications = openNotifications;
  }
}catch(e){}



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
  const now = Date.now();
  const email = u.email || cur.email || '';
  const emailLower = email ? String(email).toLowerCase() : null;
  const merged = {
    email,
    emailLower,
    nick: cur.nick || extra.nick || u.displayName || u.email || 'Uživatel',
    role: cur.role || extra.role || '',
    avatar: cur.avatar || extra.avatar || window.DEFAULT_AVATAR,
    plan: cur.plan || 'free',
    planUntil: (typeof cur.planUntil === 'number' ? cur.planUntil : 0),
    notifLastSeenTs: (typeof cur.notifLastSeenTs === 'number' ? cur.notifLastSeenTs : now),
    createdAt: cur.createdAt || now
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

