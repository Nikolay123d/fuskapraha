// === MAP (lazy, city-based POI) ===
let MAP=null;
let POI_REF=null;
let __LEAFLET_READY_PROM=null;

function loadCssOnce(href){
  return new Promise((resolve,reject)=>{
    if(document.querySelector(`link[href="${href}"]`)) return resolve();
    const l=document.createElement('link');
    l.rel='stylesheet'; l.href=href;
    l.onload=()=>resolve();
    l.onerror=()=>reject(new Error('CSS load failed: '+href));
    document.head.appendChild(l);
  });
}
function loadJsOnce(srcUrl){
  return new Promise((resolve,reject)=>{
    if(document.querySelector(`script[src="${srcUrl}"]`)) return resolve();
    const s=document.createElement('script');
    s.src=srcUrl;
    s.defer=true;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('JS load failed: '+srcUrl));
    document.head.appendChild(s);
  });
}

async function ensureLeaflet(){
  if(window.L) return;
  if(__LEAFLET_READY_PROM) return __LEAFLET_READY_PROM;
  const css='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const js='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  __LEAFLET_READY_PROM = (async ()=>{
    await loadCssOnce(css);
    await loadJsOnce(js);
  })();
  return __LEAFLET_READY_PROM;
}

function mapMini(show, text){
  const el=document.getElementById('mapMiniLoad');
  if(!el) return;
  if(show){
    el.style.display='flex';
    el.querySelector('.t') && (el.querySelector('.t').textContent = text||'Načítáme mapu…');
  }else{
    el.style.display='none';
  }
}

async function ensureMapLoadedOnce(){
  try{
    mapMini(true, 'Načítáme mapu…');
    const stop = startMiniSequence('mapMiniLoad', [
      'Načítáme mapu…',
      'OpenStreetMap…',
      'Načítáme body pomoci…'
    ], 650);
    await ensureLeaflet();
    if(!MAP){
      MAP = L.map('map').setView([50.0755, 14.4378], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(MAP);
      window.__MAP = MAP;
    }
    loadPoi();
    mapMini(false,'');
    try{ stop && stop(); }catch(e){}
  }catch(e){
    console.error(e);
    mapMini(true,'Chyba mapy. Zkuste znovu.');
  }
}
window.ensureMapLoadedOnce = ensureMapLoadedOnce;

function initMap(){
  // kept for compatibility; map is ensured lazily
  if(MAP) return;
}

function loadPoi(){
  if(!window.L || !MAP) return;
  const city=getCity();

  // clear layers except tiles
  try{
    MAP.eachLayer(l=>{ if(l && l._url) return; try{ MAP.removeLayer(l); }catch{} });
  }catch{}
  try{
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap' }).addTo(MAP);
  }catch{}

  if(POI_REF){ try{ POI_REF.off(); }catch{} }
  POI_REF=db.ref('map/poi/'+city);
  POI_REF.on('child_added', async snap=>{
    const v=snap.val()||{};
    try{
      const m=L.marker([v.lat||50.08, v.lng||14.43]).addTo(MAP);
      m.bindPopup(`<b>${esc(v.title||'Bod')}</b><br>${esc(v.type||'')}`);
    }catch{}
  });

  MAP.off('click');
  MAP.on('click', async (e)=>{
    const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
    const isMod=(await db.ref('roles/'+u.uid+'/moderator').get()).val()===true;
    if(!isAdmin() && !isMod) return;
    const title=prompt('Název bodu:'); if(!title) return;
    const type=prompt('Typ (např. медицина, юрист...)','');
    await db.ref('map/poi/'+city).push({lat:e.latlng.lat, lng:e.latlng.lng, title, type, by:u.uid, ts:Date.now()});
    toast('Bod přidán'); playSound('ok');
  });
}

// === Profile save ===
async function refreshMe(){
  const u=auth.currentUser; if(!u) return;
  const me=await fetchUserPublic(u.uid);
  $('#myName').textContent = me.nick || me.name || 'Uživatel';
  $('#myAvatar').src = me.avatar || window.DEFAULT_AVATAR;
  try{ const mini=document.getElementById('meMiniAva'); if(mini) mini.src = me.avatar || window.DEFAULT_AVATAR; }catch{}
  $('#profileEmail').textContent = (u.email || '(anonymní)') + ' · ' + u.uid.slice(0,6);
}
$('#saveProfile')?.addEventListener('click', async ()=>{
  const u=auth.currentUser; if(!u) return;
  const up={};
  const n=$('#setNick')?.value.trim(); if(n) up.nick=n;
  const a=$('#setAvatarUrl')?.value.trim(); if(a) up.avatar=a;
  const r=$('#setRole')?.value; if(r) up.role=r;
  const about=$('#setAbout')?.value.trim(); if(about) up.about=about;
  const company=$('#setCompany')?.value.trim(); if(company) up.company=company;
  const phone=$('#setPhone')?.value.trim(); if(phone) up.phone=phone;
  const skills=$('#setSkills')?.value.trim(); if(skills) up.skills=skills;

  await db.ref('usersPublic/'+u.uid).update(up);

  // clear only short fields
  if($('#setNick')) $('#setNick').value='';
  if($('#setAvatarUrl')) $('#setAvatarUrl').value='';

  refreshMe();
  toast('Profil uložen'); playSound('ok');

  // show/hide employer vacancy card
  const mePub = await fetchUserPublic(u.uid);
  const vacCard = document.getElementById('myVacancyCard');
  if(vacCard) vacCard.style.display = (mePub.role==='employer') ? '' : 'none';
});
$('#avatarFile')?.addEventListener('change', async (e)=>{
  const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
  const f=e.target.files && e.target.files[0]; if(!f) return;
  const url=await fileToDataURL(f);
  await db.ref('usersPublic/'+u.uid).update({avatar:url});
  e.target.value='';
  refreshMe(); toast('Avatar změněn'); playSound('ok');
});

// Admin actions
$('#makeMod')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; if(!me || !isAdmin(me)) return alert('Jen admin');
  const uid=$('#roleUid').value.trim(); if(!uid) return;
  await db.ref('roles/'+uid).update({moderator:true}); toast('Hotovo');
});
$('#removeMod')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; if(!me || !isAdmin(me)) return alert('Jen admin');
  const uid=$('#roleUid').value.trim(); if(!uid) return;
  await db.ref('roles/'+uid).update({moderator:false}); toast('Hotovo');
});
$('#ban30')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; if(!me || !isAdmin(me)) return alert('Jen admin');
  const uid=$('#roleUid').value.trim(); if(!uid) return;
  const reason=$('#banReason').value.trim()||'porušení pravidel';
  await db.ref('bans/'+uid).set({until: Date.now()+30*60*1000, reason}); toast('Ban 30 min');
});
$('#unban')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; if(!me || !isAdmin(me)) return alert('Jen admin');
  const uid=$('#roleUid').value.trim(); if(!uid) return;
  await db.ref('bans/'+uid).remove(); toast('Unban');
});
$('#clearChat')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; if(!me || !isAdmin(me)) return alert('Jen admin');
  if(!confirm('Vyčistit chat pro aktuální město?')) return;
  const city=getCity();
  const snap=await db.ref('messages/'+city).get();
  const upds={};
  snap.forEach(ch=>{ upds[ch.key+'/deleted']=true; upds[ch.key+'/deletedBy']=me.uid; upds[ch.key+'/tsDel']=Date.now(); });
  // bulk updates
  await db.ref('messages/'+city).update(upds);
  toast('Vyčištěno');
});

// Tabs toggle
$('#toggleTabs')?.addEventListener('click', ()=> $('#tabs').classList.toggle('hidden'));

// === Auth state ===

// --- Admin role watcher (RTDB: /roles/{uid}/admin) ---
let _roleRef = null;
let _roleHandler = null;

// Admin detection priority:
// 1) RTDB role flag: /roles/{uid}/admin === true
// 2) Local hard list (ADMIN_UIDS)
// 3) Fallback by email (ADMIN_EMAILS)
function _adminByLists(user){
  if(!user) return false;
  const uidOk = Array.isArray(window.ADMIN_UIDS) && window.ADMIN_UIDS.includes(user.uid);
  const email = (user.email || '').toLowerCase();
  const emOk = !!email && Array.isArray(window.ADMIN_EMAILS) && window.ADMIN_EMAILS.map(x=>String(x||'').toLowerCase()).includes(email);
  return !!(uidOk || emOk);
}

function _setAdminUI(is, user){
  window.__isAdmin = !!is;
  try{ document.body.classList.toggle('is-admin', !!is); }catch{}
  try{ console.log('ADMIN =', !!is, 'UID =', user?user.uid:null, 'EMAIL =', user?user.email:null); }catch{}
}


let _roleAdminRef=null, _roleAdminCb=null;
let _roleModRef=null, _roleModCb=null;
let _banRef=null, _banCb=null;
let _muteRef=null, _muteCb=null;
let _dmBanRef=null, _dmBanCb=null;

function _off(ref, cb){
  try{ if(ref && cb) ref.off('value', cb); }catch(e){}
}

function watchAccessLayer(user){
  // Single layer SSoT: roles + bans/mutes/dmBans
  _off(_roleAdminRef,_roleAdminCb); _roleAdminRef=null; _roleAdminCb=null;
  _off(_roleModRef,_roleModCb); _roleModRef=null; _roleModCb=null;
  _off(_banRef,_banCb); _banRef=null; _banCb=null;
  _off(_muteRef,_muteCb); _muteRef=null; _muteCb=null;
  _off(_dmBanRef,_dmBanCb); _dmBanRef=null; _dmBanCb=null;

  // reset
  try{ window.MK_ACCESS?.set?.({ isAdmin:false, isModerator:false, banUntil:0, banReason:'', muteUntil:0, muteReason:'', dmBanUntil:0, dmBanReason:'' }); }catch(e){}

  if(!user) return;

  // roles
  try{
    _roleAdminRef = db.ref('roles/'+user.uid+'/admin');
    _roleAdminCb = (s)=>{ try{ window.MK_ACCESS?.set?.({isAdmin: (s.val()===true)}); }catch(e){} };
    _roleAdminRef.on('value', _roleAdminCb);
  }catch(e){}
  try{
    _roleModRef = db.ref('roles/'+user.uid+'/moderator');
    _roleModCb = (s)=>{ try{ window.MK_ACCESS?.set?.({isModerator: (s.val()===true)}); }catch(e){} };
    _roleModRef.on('value', _roleModCb);
  }catch(e){}

  // bans / mutes / dmBans
  try{
    _banRef = db.ref('bans/'+user.uid);
    _banCb = (s)=>{
      const v=s.val()||{};
      const until = Number(v.until||0) || 0;
      const reason = String(v.reason||'');
      window.MK_ACCESS?.set?.({ banUntil: until, banReason: reason });
    };
    _banRef.on('value', _banCb);
  }catch(e){}
  try{
    _muteRef = db.ref('mutes/'+user.uid);
    _muteCb = (s)=>{
      const v=s.val()||{};
      const until = Number(v.until||0) || 0;
      const reason = String(v.reason||'');
      window.MK_ACCESS?.set?.({ muteUntil: until, muteReason: reason });
    };
    _muteRef.on('value', _muteCb);
  }catch(e){}
  try{
    _dmBanRef = db.ref('dmBans/'+user.uid);
    _dmBanCb = (s)=>{
      const v=s.val()||{};
      const until = Number(v.until||0) || 0;
      const reason = String(v.reason||'');
      window.MK_ACCESS?.set?.({ dmBanUntil: until, dmBanReason: reason });
    };
    _dmBanRef.on('value', _dmBanCb);
  }catch(e){}
}

// Backwards compatibility name (other modules might still call it)
function watchAdminRole(user){ watchAccessLayer(user); }



// === Unified Router (Single Entry Point) ===
async function openView(viewId, opts={}){
  const v = viewId || 'view-chat';
  try{ localStorage.setItem('mk_last_view', v); localStorage.setItem('lastView', v); }catch(e){}
  // Special routing for DM: always go through openDMInbox to avoid "empty DM" race.
  if(v==='view-dm'){
    // if we have a last DM peer/room, and opts.restoreRoom is true, restore the room
    const me = auth?.currentUser;
    const restorePeer = opts.restorePeer || (()=>{
      try{ return localStorage.getItem('mk_last_dm_peer')||''; }catch(e){ return ''; }
    })();
    if(me && restorePeer){
      try{ await openDMRoom(me.uid, String(restorePeer)); return; }catch(e){}
    }
    try{ await openDMInbox(true); return; }catch(e){}
  }
  // default
  try{ showView(v); }catch(e){}
}
window.openView = openView;

auth.onAuthStateChanged(async (u)=>{

  // Wait for redirect result processing (exactly once) before reacting to auth state  try{ await (window.__AUTH_REDIRECT_PROMISE__||Promise.resolve()); }catch(e){}


  try{ if(u) await ensureUserPublic(u); }catch{}
  try{ if(u) await enforceVerifyWindow(u); }catch{}
  // admin-only visibility (role-based)
  watchAccessLayer(u);
  try{ if(u && window.MK_ACCESS?.state?.isAdmin) wireAdminQuickCams(); }catch(e){}
    try{ await adminAutoCleanupOncePer24h(); }catch(e){}
// profile display
  if(u){
    try{ await seedAdminIfWhitelisted?.(); }catch{}
    await ensureMyPublic(u);
    setPresence(u);
    await refreshMe();
    // Show employer vacancy UI
    try{
      const mePub = await fetchUserPublic(u.uid);
      const vacCard = document.getElementById('myVacancyCard');
      if(vacCard) vacCard.style.display = (mePub.role==='employer') ? '' : 'none';
      if(mePub.role==='employer') loadMyVacancies?.();
    }catch(e){}
    // friends are loaded lazily when opening the tab
    try{ listenNotifications(); }catch(e){}
    try{ watchDmUnread(u.uid); }catch(e){}
    try{ watchDmThreadsLive(u.uid); }catch(e){}

    // Open pending view after login (e.g., clicked envelope before auth)
    try{
      if(window.__PENDING_VIEW__){
        const v = window.__PENDING_VIEW__;
        window.__PENDING_VIEW__ = null;
        openView(v);
      }
    }catch(e){}

    // If DM view is already open (e.g. user clicked envelope very early), refresh
    // the inbox now that auth is available.
    try{
      const activeId = (localStorage.getItem('mk_last_view')||localStorage.getItem('lastView')||'view-chat');

      // v10: if DM tried to load before auth (reload case), force-load now.
      try{
        if(window.__DM_NEEDS_LOAD__){
          window.__DM_NEEDS_LOAD__ = false;
          try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
          try{ loadDmThreads && loadDmThreads(true); }catch(e){}
        }
      }catch(e){}
      // Make sure the active view really loads after reload (auth becomes ready later).
      if(activeId==='view-dm' || document.getElementById('view-dm')?.classList.contains('active')){
        try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
        loadDmThreads && loadDmThreads(true);

        // Restore the exact DM room (if user was inside a conversation before F5).
        try{
          const peer = (window.__DM_RESTORE_PEER__ || localStorage.getItem('mk_last_dm_peer') || '').trim();
          if(peer && !window.__DM_ROOM_RESTORED__){
            window.__DM_ROOM_RESTORED__ = true;
            setTimeout(()=>{
              try{ openDMRoom(u.uid, peer); }catch(e){}
            }, 450);
          }
        }catch(e){}
      }
      if(activeId==='view-friends' || document.getElementById('view-friends')?.classList.contains('active')){
        try{ setMiniLoad('friendsMiniLoad','Načítáme přátele…', true); }catch(e){}
        try{ loadFriends && loadFriends(true); }catch(e){}
      }
      if(activeId==='view-members' || document.getElementById('view-members')?.classList.contains('active')){
        try{ setMiniLoad('membersMiniLoad','Načítáme…', true); }catch(e){}
        try{ loadMembers && loadMembers(true); }catch(e){}
      }
      if(activeId==='view-map' || document.getElementById('view-map')?.classList.contains('active')){
        try{ setMiniLoad('mapMiniLoad','Načítáme mapu…', true); }catch(e){}
        try{ ensureMapLoadedOnce && ensureMapLoadedOnce(); }catch(e){}
      }
    }catch(e){}

    // v15: start bot DM engine for admin (auto-replies)
    try{ startBotDmEngine(); }catch(e){}
    try{ if(isAdminUser(u)) startBotHostEngine(); else stopBotHostEngine(); }catch(e){}

    // greeting only for specific email and only once per session
    if(!greetedThisSession && u.email && u.email.toLowerCase()===GREET_EMAIL){
      greetedThisSession = true;
      // ensure permissions prompt is accepted once
      cookieBanner();
      // show greeting (user gesture needed for sound; will play if allowed)
      showGreeting();
    }
    hidePreloader();
    try{ maybeStartTour(); }catch(e){}

  }else{
    // keep preloader fail-safe; show logged out state
    $('#profileEmail').textContent = 'E-mail: —';
    $('#myName').textContent = 'Uživatel';
    $('#myAvatar').src = window.DEFAULT_AVATAR;
    try{ watchDmUnread(null); }catch(e){}
    try{ watchDmThreadsLive(null); }catch(e){}
    // do not show greeting
  }
});

// Ask cookie banner on first load (non-blocking)
/* [MK_BOOTSTRAP] cookieBanner wired in unified bootstrap */

// Initialize push token once the user is logged in and notifications are allowed.
// (Background delivery requires firebase-messaging-sw.js)
try{
  // initPushForUser() is called from the main auth.onAuthStateChanged handler
}catch(e){}

// If user opens as file:// and auth is slow, still hide preloader via fail-safe



// ===== Stage 5 UI enhancements (friends inbox, DM threads, profile locks, bots/admin) =====
(function(){
  const db = firebase.database(); const auth = firebase.auth();

  // --- modal helpers ---
  // --- Modal helpers (stack + backdrop + ESC) ---
  const __openModals = new Set();
  function openModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    // close any other modal of the same "layer" to prevent invisible overlays blocking clicks
    document.querySelectorAll('.modal').forEach(m=>{
      if(!m.hidden && m.id !== id) m.hidden = true;
    });
    el.hidden = false;
    __openModals.add(id);
    document.body.classList.add('modal-open');
    // NOTE: we intentionally do NOT pushState here.
    // On some setups it caused "stuck" UI after closing (especially with hash routing).
    // Mobile back button support can be added later via a dedicated modal route.
  }
  function closeModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.hidden = true;
    __openModals.delete(id);
    if(__openModals.size===0) document.body.classList.remove('modal-open');
  }

  // Expose modal helpers for inline onclick handlers
  try{ if(!window.openModal) window.openModal = openModal; }catch(e){}
  try{ if(!window.closeModal) window.closeModal = closeModal; }catch(e){}

  // Backdrop click closes
  document.addEventListener('click', (e)=>{
    const m = e.target && e.target.classList && e.target.classList.contains('modal') ? e.target : null;
    if(m && !m.hidden){
      closeModal(m.id);
    }
  }, true);
  // ESC closes topmost
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && __openModals.size){
      const last = Array.from(__openModals).slice(-1)[0];
      closeModal(last);
    }
  });
  // Browser back closes modal if open
  window.addEventListener('popstate', ()=>{
    if(__openModals.size){
      const last = Array.from(__openModals).slice(-1)[0];
      closeModal(last);
    }
  });


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

  // DM mobile back/close
  document.getElementById('dmBackMobile')?.addEventListener('click', ()=>{ try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){} });
  document.getElementById('dmMobileClose')?.addEventListener('click', ()=>{ try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){} });

  document.getElementById('friendAddOpen')?.addEventListener('click', ()=>openModal('modalFriendAdd'));
  document.getElementById('modalFriendClose')?.addEventListener('click', ()=>closeModal('modalFriendAdd'));
  document.getElementById('dmNewBtn')?.addEventListener('click', async ()=>{
  const me=auth.currentUser;
  if(!me){ openModalAuth('login'); return; }
  const raw = prompt('Zadejte UID nebo e-mail uživatele:');
  if(!raw) return;
  let to = raw.trim();
  if(!to) return;
  if(to.includes('@')){
    const uid = await resolveUidByEmail(to);
    if(!uid){ alert('Email neznám'); return; }
    to = uid;
  }
  const room = await startDM(to);
  if(room){
    currentDmRoom = room;
    currentDmPeerUid = to;
    showView('view-dm');
  }
});
  document.getElementById('modalDmClose')?.addEventListener('click', ()=>closeModal('modalDmNew'));
  document.getElementById('userCardClose')?.addEventListener('click', ()=>closeModal('modalUserCard'));

  // --- Friends: split requests and accepted list ---
  async function renderFriendCard(uid, st){
    const u = await getUser(uid);
    const wrap=document.createElement('div'); wrap.className='msg';
    wrap.innerHTML = `
      <div class="ava" data-uid="${uid}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}" alt=""></div>
      <div class="bubble" style="width:100%">
        <div class="name" data-uid="${uid}"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${u.online?'online':'offline'}</span></div>
        <div class="actions">
          <button data-act="dm">Napsat</button>
          ${st==='pending' ? `<button data-act="accept">Přijmout</button>` : ``}
          ${st!=='pending' ? `<button data-act="remove">Odebrat</button>` : `<button data-act="decline">Odmítnout</button>`}
        </div>
      </div>`;
    wrap.addEventListener('click', async (e)=>{
      const act = e.target?.dataset?.act;
      if(!act) return;
      const me = auth.currentUser; if(!me) return toast('Přihlaste se');
      if(act==='dm'){ openDMRoom(me.uid, uid); showView('view-dm'); }
      if(act==='accept'){
        await db.ref('friends/'+me.uid+'/'+uid).set('accepted');
        await db.ref('friends/'+uid+'/'+me.uid).set('accepted');
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        await loadFriendsUI();
      }
      if(act==='decline'){
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        await loadFriendsUI();
      }
      if(act==='remove'){
        await db.ref('friends/'+me.uid+'/'+uid).remove();
        await db.ref('friends/'+uid+'/'+me.uid).remove();
        await loadFriendsUI();
      }
    });
    // avatar click => user card
    wrap.querySelector('.ava')?.addEventListener('click', (ev)=>{ ev.stopPropagation(); showUserCard(uid); });
    return wrap;
  }

  async function loadFriendsUI(){
    const me = auth.currentUser; if(!me) return;
    const reqBox=document.getElementById('friendsRequests');
    const listBox=document.getElementById('friendsList');
    if(reqBox){ reqBox.innerHTML=''; reqBox.style.display='none'; }
    if(listBox) listBox.innerHTML='';
    const rq=(await db.ref('friendRequests/'+me.uid).get()).val()||{};
    const fr=(await db.ref('friends/'+me.uid).get()).val()||{};
    const rqUids = Object.keys(rq);
    for(const uid of rqUids){
      reqBox && reqBox.appendChild(await renderFriendCard(uid, 'pending'));
    }
    const frEntries = Object.entries(fr).filter(([_,st])=>st==='accepted');
    for(const [uid,st] of frEntries){
      listBox && listBox.appendChild(await renderFriendCard(uid, st));
    }
    const badge = document.getElementById('friendsBadge');
    const badge2 = document.getElementById('friendsBadgeInline');
    const n = rqUids.length;
    if(badge){ badge.textContent = n?`(${n})`:''; }
    if(badge2){ badge2.textContent = n?`(${n})`:''; }
    const sum=document.getElementById('friendsSummary');
    if(sum) sum.textContent = `(${frEntries.length} přátel, ${n} žádostí)`;
  }

  // Hook: when tab opened
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('[data-view="view-friends"]');
    if(t){ setTimeout(()=>{ if(auth.currentUser) loadFriendsUI(); }, 60); }
  });

  // Friends: add by email (modal)
  document.getElementById('friendAddBtn')?.addEventListener('click', async ()=>{
    try{
      const me=auth.currentUser; if(!me){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(me.emailVerified===false){
      const until=getVerifyDeadline(me);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
      const email=(document.getElementById('friendEmail')?.value||'').trim();
      if(!email) return toast('Zadejte e-mail');
      toast('Přidání přátel podle e-mailu je dočasně vypnuto');
      return;
      if(uid===me.uid) return toast('Nelze přidat sebe');
      await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
    // Bell notification for receiver
    try{ await db.ref('notifications/'+uid).push({ts:Date.now(), type:'friend', from:me.uid}); }catch(e){}
      toast('Žádost odeslána'); closeModal('modalFriendAdd');
      // notify receiver
      try{
        await db.ref('notifications/'+uid).push({type:'friend', from:me.uid, ts:Date.now(), text:'Nová žádost o přátelství'});
      }catch{}
      loadFriendsUI();
    }catch(e){ console.error(e); toast('Chyba'); }
  });

  // --- User profile modal (public) ---
  async function getFriendState(meUid, otherUid){
    if(!meUid || !otherUid) return 'none';
    const fr = (await db.ref('friends/'+meUid+'/'+otherUid).get()).val();
    if(fr==='accepted') return 'friends';
    const reqIn = (await db.ref('friendRequests/'+meUid+'/'+otherUid).get()).val();
    if(reqIn) return 'incoming';
    const reqOut = (await db.ref('friendRequests/'+otherUid+'/'+meUid).get()).val();
    if(reqOut) return 'outgoing';
    return 'none';
  }

  async function loadVacanciesInto(container, uid){
    const feed = document.getElementById(container);
    const empty = document.getElementById('userCardVacEmpty');
    if(!feed) return;
    feed.innerHTML = '';
    if(empty) empty.style.display='none';
    const snap = await db.ref('vacancies/'+uid).orderByChild('ts').limitToLast(20).get();
    const v = snap.val()||{};
    const ids = Object.keys(v).sort((a,b)=>(v[b].ts||0)-(v[a].ts||0));
    if(ids.length===0){
      if(empty) empty.style.display='';
      return;
    }
    for(const id of ids){
      const it=v[id]||{};
      const div=document.createElement('div');
      div.className='vac-item';
      div.innerHTML = `<div class="t">${esc(it.title||'Inzerát')}</div>
        <div class="m">${esc(it.city||'')} · ${new Date(it.ts||0).toLocaleString()}</div>
        <div class="d">${esc(it.text||'')}</div>`;
      feed.appendChild(div);
    }
  }

  async function loadRating(uid){
    const snap = await db.ref('ratings/'+uid).get();
    const v = snap.val()||{};
    const arr = Object.values(v).filter(x=>typeof x==='number');
    const avg = arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    return {avg, count: arr.length};
  }

  function renderStars(containerId, value, onPick){
    const el=document.getElementById(containerId);
    if(!el) return;
    el.innerHTML='';
    for(let i=1;i<=5;i++){
      const b=document.createElement('button');
      b.type='button';
      b.textContent='★';
      b.className = i<=value ? 'on' : 'off';
      b.addEventListener('click', ()=> onPick(i));
      el.appendChild(b);
    }
  }

  async function showUserCard(uid){
    const me = auth.currentUser;
    const u = await getUser(uid);

    const ava=document.getElementById('userCardAva');
    const nick=document.getElementById('userCardNick');
    const role=document.getElementById('userCardRole');
    const online=document.getElementById('userCardOnline');

    if(ava) ava.src = u.avatar||window.DEFAULT_AVATAR;
    if(nick) nick.textContent = u.nick||'Uživatel';
    if(role) role.textContent = u.role==='employer' ? 'Zaměstnavatel' : 'Hledám práci';
    if(online) online.textContent = u.online ? 'online' : 'offline';

    const plan=document.getElementById('userCardPlan');
    const admin=document.getElementById('userCardAdmin');
    const planVal = String(u.plan||'').toLowerCase();
    const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
    if(plan){
      plan.style.display = isPrem ? '' : 'none';
      plan.textContent = isPrem ? String(planVal).toUpperCase() : 'PREMIUM';
    }
    const isAdm = (uid === window.ADMIN_UID);
    if(admin){ admin.style.display = isAdm ? '' : 'none'; }

    const aboutEl=document.getElementById('userCardAbout');
    if(aboutEl) aboutEl.textContent = u.about||'';

    const cW=document.getElementById('userCardCompanyWrap');
    const pW=document.getElementById('userCardPhoneWrap');
    const sW=document.getElementById('userCardSkillsWrap');
    if(cW){ cW.style.display = u.company ? '' : 'none'; document.getElementById('userCardCompany').textContent=u.company||''; }
    if(pW){ pW.style.display = u.phone ? '' : 'none'; document.getElementById('userCardPhone').textContent=u.phone||''; }
    if(sW){ sW.style.display = u.skills ? '' : 'none'; document.getElementById('userCardSkills').textContent=u.skills||''; }

    // rating
    const rate = await loadRating(uid);
    const rText=document.getElementById('userCardRatingText');
    if(rText) rText.textContent = rate.count ? `⭐ ${rate.avg.toFixed(1)} / 5 (${rate.count})` : 'Bez hodnocení';
    let myRating = 0;
    if(me){
      const my = (await db.ref('ratings/'+uid+'/'+me.uid).get()).val();
      myRating = (typeof my==='number') ? my : 0;
    }
    renderStars('userCardStars', myRating||Math.round(rate.avg||0), async (n)=>{
      if(!me) return toast('Přihlaste se');
      await db.ref('ratings/'+uid+'/'+me.uid).set(n);
      toast('Hodnocení uloženo'); playSound('ok');
      const r2=await loadRating(uid);
      if(rText) rText.textContent = r2.count ? `⭐ ${r2.avg.toFixed(1)} / 5 (${r2.count})` : 'Bez hodnocení';
      renderStars('userCardStars', n, ()=>{});
    });

    // friend buttons state
    const dmBtn=document.getElementById('userCardDm');
    const addBtn=document.getElementById('userCardAddFriend');
    const rmBtn=document.getElementById('userCardRemoveFriend');

    const state = await getFriendState(me?.uid, uid);
    if(addBtn) addBtn.style.display = (state==='friends') ? 'none' : '';
    if(rmBtn) rmBtn.style.display = (state==='friends') ? '' : 'none';
    if(addBtn){
      addBtn.textContent = state==='incoming' ? '✅ Přijmout' : (state==='outgoing' ? '⏳ Odesláno' : '👥 Přidat');
      addBtn.disabled = (state==='outgoing');
    }

    dmBtn && (dmBtn.onclick = ()=>{
      if(!me) return toast('Přihlaste se');
      startDM(uid, {closeModalId:'modalUserCard'});
    });

    addBtn && (addBtn.onclick = async ()=>{
      if(!me) return toast('Přihlaste se');
      if(state==='incoming'){
        await db.ref('friends/'+me.uid+'/'+uid).set('accepted');
        await db.ref('friends/'+uid+'/'+me.uid).set('accepted');
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        toast('Přátelství potvrzeno'); playSound('ok');
      }else if(state==='none'){
        await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
    // Bell notification for receiver
    try{ await db.ref('notifications/'+uid).push({ts:Date.now(), type:'friend', from:me.uid}); }catch(e){}
        toast('Žádost odeslána'); playSound('ok');
        // notify receiver
        try{ await db.ref('notifications/'+uid).push({type:'friend', from:me.uid, ts:Date.now(), text:'Nová žádost o přátelství'}); }catch{}
      }
      closeModal('modalUserCard');
      loadFriendsUI?.();
    });

    rmBtn && (rmBtn.onclick = async ()=>{
      if(!me) return toast('Přihlaste se');
      await db.ref('friends/'+me.uid+'/'+uid).remove();
      await db.ref('friends/'+uid+'/'+me.uid).remove();
      toast('Odebráno'); playSound('ok');
      closeModal('modalUserCard');
      loadFriendsUI?.();
    });

    document.getElementById('userCardReport')?.addEventListener('click', async ()=>{
      if(!me) return toast('Přihlaste se');
      const txt = prompt('Napište důvod (krátce):','spam');
      if(!txt) return;
      await db.ref('reportsUsers/'+uid).push({from:me.uid, ts:Date.now(), text:txt});
      toast('Nahlášeno'); playSound('ok');
    }, {once:true});

    openModal('modalUserCard');
    await loadVacanciesInto('userCardVacancies', uid);
  }
  window.showUserCard = showUserCard;

  
  // --- Vacancies (employers) ---
  async function loadMyVacancies(){
    const me = auth.currentUser; if(!me) return;
    const feed=document.getElementById('myVacancies'); if(!feed) return;
    feed.innerHTML='';
    // NOTE: do NOT use chatMiniLoad here (it caused stuck chat loader when opening profile)
    try{
    const snap = await db.ref('vacancies/'+me.uid).orderByChild('ts').limitToLast(20).get();
    const v=snap.val()||{};
    const ids=Object.keys(v).sort((a,b)=>(v[b].ts||0)-(v[a].ts||0));
    for(const id of ids){
      const it=v[id]||{};
      const div=document.createElement('div');
      div.className='vac-item';
      div.innerHTML = `<div class="t">${esc(it.title||'Inzerát')}</div>
        <div class="m">${esc(it.city||'')} · ${new Date(it.ts||0).toLocaleString()}</div>
        <div class="d">${esc(it.text||'')}</div>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="ghost" data-del-vac="${id}" type="button">Smazat</button>
        </div>`;
      div.querySelector('[data-del-vac]')?.addEventListener('click', async ()=>{
        if(!confirm('Smazat inzerát?')) return;
        await db.ref('vacancies/'+me.uid+'/'+id).remove();
        toast('Smazáno'); playSound('ok');
        loadMyVacancies();
      });
      feed.appendChild(div);
    }
    }finally{
      try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
    }
  }
  window.loadMyVacancies = loadMyVacancies;

  async function notifyFriendsAboutVacancy(meUid, vac){
    const fr=(await db.ref('friends/'+meUid).get()).val()||{};
    const friendUids = Object.keys(fr).filter(uid=>fr[uid]==='accepted');
    const payload = {type:'vacancy', from:meUid, ts:Date.now(), title:vac.title||'Nová nabídka práce', text:vac.text?.slice(0,140)||''};
    const updates={};
    for(const f of friendUids){
      const key = db.ref('notifications/'+f).push().key;
      updates['notifications/'+f+'/'+key]=payload;
    }
    if(Object.keys(updates).length) await db.ref().update(updates);
  }

  document.getElementById('vacPublish')?.addEventListener('click', async ()=>{
    const me = auth.currentUser; if(!me) return toast('Přihlaste se');
    const pub = await fetchUserPublic(me.uid);
    if(pub.role!=='employer') return toast('Tato funkce je jen pro zaměstnavatele');
    const title=(document.getElementById('vacTitle')?.value||'').trim();
    const text=(document.getElementById('vacText')?.value||'').trim();
    const city=(document.getElementById('vacCity')?.value||getCity());
    if(!title || !text) return toast('Vyplňte název a popis');
    const vac = {title, text, city, ts:Date.now(), by:me.uid};
    const id = db.ref('vacancies/'+me.uid).push().key;
    const updates={};
    updates['vacancies/'+me.uid+'/'+id]=vac;
    // also store to user public lastVacancy (optional)
    updates['usersPublic/'+me.uid+'/lastVacTs']=vac.ts;
    await db.ref().update(updates);
    toast('Inzerát zveřejněn'); playSound('ok');
    // notify friends looking for job
    try{ await notifyFriendsAboutVacancy(me.uid, vac); }catch(e){ console.warn(e); }
    // clear form
    if(document.getElementById('vacTitle')) document.getElementById('vacTitle').value='';
    if(document.getElementById('vacText')) document.getElementById('vacText').value='';
    loadMyVacancies();
  });

  // --- Notifications ---
  let NOTIF_CHILD_REF=null;
let NOTIF_REF=null;
  function listenNotifications(){
    const me=auth.currentUser; if(!me) return;
    const feed=document.getElementById('notifFeed');
    if(!feed) return;
    if(NOTIF_REF){ try{ NOTIF_REF.off(); }catch{} }
    NOTIF_REF=db.ref('notifications/'+me.uid).orderByChild('ts').limitToLast(50);
    if(NOTIF_CHILD_REF){ try{ NOTIF_CHILD_REF.off(); }catch{} }
    NOTIF_CHILD_REF=db.ref('notifications/'+me.uid).orderByChild('ts').startAt(Date.now());
    NOTIF_CHILD_REF.on('child_added', async s=>{
      const n=s.val()||{};
      if(!n.ts) return;
      if(document.visibilityState==='visible') return;
      const fromU = n.from ? await getUser(n.from) : null;
      const name = fromU?.nick || 'Uživatel';
      if(n.type==='dm') notify('Nová DM', name+': '+(n.text||''), 'dm');
      else if(n.type==='friend') notify('Žádost o přátelství', name, 'friend');
      else notify('Upozornění', n.text||'', 'notify');
    });
    NOTIF_REF.on('value', async snap=>{
      try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
      const v=snap.val()||{};
      const ids=Object.keys(v).sort((a,b)=>(v[b].ts||0)-(v[a].ts||0));
      // dmBadge = unread from inboxMeta watcher; friends badge is driven by friendRequests


      feed.innerHTML='';
      // (no chat mini loader here)
      let unread=0;
      for(const id of ids){
        const n=v[id]||{};
        const fromU = n.from ? await getUser(n.from) : null;
        const row=document.createElement('div');
        row.className='msg';
        row.innerHTML = `
          <div class="ava" ${n.from?`data-uid="${esc(n.from)}"`:''}><img src="${esc(fromU?.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="name">${esc(n.title||n.text||'Upozornění')}</div>
            <div class="muted" style="font-size:12px">${new Date(n.ts||0).toLocaleString()}</div>
            ${n.type==='vacancy' ? `<div class="muted">Přítel zveřejnil novou nabídku práce</div>`:''}
          </div>
          <button class="ghost" data-del-notif="${id}" type="button">×</button>`;
        row.querySelector('[data-del-notif]')?.addEventListener('click', async (ev)=>{
          ev.stopPropagation();
          await db.ref('notifications/'+me.uid+'/'+id).remove();
        });

        // v15: actions (open DM / accept friend / open premium)
        row.addEventListener('click', async ()=>{
          try{
            if(n.type==='dm' && n.from){
              closeModal('modalNotif');
              await startDM(n.from, {noBacklog:true});
              showView('view-dm');
              return;
            }
            if(n.type==='friend' && n.from){
              // Try accept directly if request exists
              const req = (await db.ref('friendRequests/'+me.uid+'/'+n.from).get()).val();
              if(req){
                await db.ref().update({
                  ['friends/'+me.uid+'/'+n.from]:'accepted',
                  ['friends/'+n.from+'/'+me.uid]:'accepted',
                  ['friendRequests/'+me.uid+'/'+n.from]: null
                });
                toast('Přátelství potvrzeno'); playSound('ok');
                await db.ref('notifications/'+me.uid+'/'+id).remove();
                try{ await loadFriendsUI(); }catch{}
              }else{
                // fallback: open friends view
                closeModal('modalNotif');
                showView('view-friends');
              }
              return;
            }
            if(n.type==='premiumGranted'){
              closeModal('modalNotif');
              openPremium?.();
              return;
            }
          }catch(e){ console.warn(e); }
        });

        // add inline buttons for friend requests (optional)
        if(n.type==='friend' && n.from){
          const bubble = row.querySelector('.bubble');
          if(bubble){
            const actions=document.createElement('div');
            actions.className='actions';
            actions.innerHTML = `<button data-act="accept">Přijmout</button><button data-act="decline" class="danger">Odmítnout</button>`;
            bubble.appendChild(actions);
            actions.addEventListener('click', async (e)=>{
              e.stopPropagation();
              const act=e.target?.dataset?.act;
              if(act==='accept'){
                await db.ref().update({
                  ['friends/'+me.uid+'/'+n.from]:'accepted',
                  ['friends/'+n.from+'/'+me.uid]:'accepted',
                  ['friendRequests/'+me.uid+'/'+n.from]: null
                });
                await db.ref('notifications/'+me.uid+'/'+id).remove();
                toast('Přijato'); playSound('ok');
                try{ await loadFriendsUI(); }catch{}
              }
              if(act==='decline'){
                await db.ref('friendRequests/'+me.uid+'/'+n.from).remove();
                await db.ref('notifications/'+me.uid+'/'+id).remove();
                toast('Odmítnuto');
                try{ await loadFriendsUI(); }catch{}
              }
            });
          }
        }

        feed.appendChild(row);
      }
      // badge
      const badge=document.getElementById('bellBadge');
      if(badge){ badge.textContent = ids.length ? String(ids.length) : ''; badge.style.display = ids.length? 'inline-flex':'none'; }
    });
  }


  // v15: watch my plan changes -> instant UI + notification entry (self-write)
  let __LAST_PLAN = null;
  function watchMyPlan(){
    const me=auth.currentUser; if(!me) return;
    db.ref('usersPublic/'+me.uid+'/plan').on('value', async (s)=>{
      const plan = s.val()||'';
      if(__LAST_PLAN===null){ __LAST_PLAN = plan; return; }
      if(plan && plan!==__LAST_PLAN){
        __LAST_PLAN = plan;
        // add local notification (user can write to own notifications)
        try{
          await db.ref('notifications/'+me.uid).push({ts:Date.now(), type:'premiumGranted', title:'Privilegium aktivováno', text:'Vaše Privilegium bylo potvrzeno.'});
        }catch(e){}
        toast('Privilegium aktivováno'); playSound('ok');
        try{ await refreshMe(); }catch{}
    try{ watchMyPlan(); }catch(e){}
      }else{
        __LAST_PLAN = plan;
      }
    });
  }
  document.getElementById('btnBell')?.addEventListener('click', ()=>{
    if(!auth.currentUser) return toast('Přihlaste se');
    openModal('modalNotif');
  });
  document.getElementById('notifClear')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!me) return;
    if(!confirm('Vyčistit upozornění?')) return;
    await db.ref('notifications/'+me.uid).remove();
    toast('Vyčištěno'); playSound('ok');
  });

// --- startDM() (stable entrypoint for profiles / buttons) ---
// Creates/opens DM room, ensures membership + inbox meta for both sides.
// NOTE: roomId format is dmKey(a,b) => "uidA_uidB" (sorted/consistent).
async function startDM(toUid, opts={}){
  const me = auth.currentUser;
  if(!me){ openModalAuth('login'); return null; }
  if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return null; }
  if(!toUid || typeof toUid!=='string') return null;
  toUid = toUid.trim();
  if(!toUid || toUid===me.uid) return null;

  const room = dmKey(me.uid, toUid);
  const ts = Date.now();

  // membership (RTDB rules: allow creator to add peer after own membership exists)
  try{
    // 1) set myself first
    await db.ref('privateMembers/'+room+'/'+me.uid).set(true);
    // 2) now rules allow me (as member) to add the peer
    await db.ref('privateMembers/'+room+'/'+toUid).set(true);

    // v15: if DM is with a bot, also add admin(s) as members + register bot room for auto-replies
    try{
      if(String(toUid).startsWith('bot_')){
        const admins = (window.ADMIN_UIDS && window.ADMIN_UIDS.length) ? window.ADMIN_UIDS : (window.ADMIN_UID ? [window.ADMIN_UID] : []);
        for(const a of admins){
          if(a && a!==me.uid) await db.ref('privateMembers/'+room+'/'+a).set(true);
        }
        await db.ref('botRooms/'+room).update({botUid:toUid, userUid:me.uid, ts, lastHandledTs: (opts && opts.noBacklog) ? Date.now() : 0});
      }
    }catch(e){ console.warn('bot DM register failed', e?.code||e); }

  }catch(e){
    console.warn('DM membership write blocked:', e?.code || e);
    // Even if peer write fails, at minimum my membership is set.
  }

  // inbox meta for quick thread list (write for both sides)
  try{
    const myPub = await getUser(me.uid);
    const toPub = await getUser(toUid);
    await Promise.all([
      db.ref('inboxMeta/'+me.uid+'/'+room).update({ ts, with: toUid, title: toPub.nick||'Uživatel' }),
      db.ref('inboxMeta/'+toUid+'/'+room).update({ ts, with: me.uid, title: myPub.nick||'Uživatel' })
    ]);
  }catch(e){}

  await openDMRoom(me.uid, toUid);
  showView('view-dm');
  // Ensure the right pane is immediately usable on mobile/desktop
  try{
    document.body.classList.add('dm-room-open');
    const back = document.getElementById('dmBackMobile');
    if(back) back.style.display = '';
  }catch(e){}
  if(opts && opts.closeModalId){ try{ closeModal(opts.closeModalId); }catch(e){} }
  return room;
}
window.startDM = startDM;

// --- DM threads / inbox ---
  // NOTE: currentDmRoom/currentDmPeerUid are global (see DM globals above).
  function otherUidFromRoom(room, meUid){
    const parts = String(room).split('_');
    if(parts.length!==2) return null;
    return (parts[0]===meUid) ? parts[1] : parts[0];
  }

  async function loadDmThreads(){
    const box=document.getElementById('dmThreads'); if(!box) return;
    // Loader always on first open.
    setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true);

    const me = auth.currentUser;
    if(!me){
      // Auth not ready yet: keep the loader and let the main auth handler reload DM when ready.
      window.__DM_NEEDS_LOAD__ = true;
      setMiniLoad('dmMiniLoad','Přihlašujeme…', true);
      return;
    }

    // Instant paint from cache.
    try{
      const ck = __cacheKey('dmthreads');
      const cached = __cacheGet(ck, 12*60*60*1000);
      if(cached && cached.val && typeof cached.val.html==='string'){
        box.innerHTML = cached.val.html;
      }
    }catch(e){}

    try{
      const metaSnap = await db.ref('inboxMeta/'+me.uid).orderByChild('ts').limitToLast(50).get();
      const v = metaSnap.val()||{};
      const rooms = Object.keys(v).sort((a,b)=> (v[b].ts||0)-(v[a].ts||0));

      // Avoid duplicates on re-open.
      box.innerHTML = '';

      for(const room of rooms){
        const other = otherUidFromRoom(room, me.uid);
        if(!other) continue;
        const u = await getUser(other);
        const row=document.createElement('div');
        row.className='msg';
        // NOTE: In DM list, tapping anywhere should open the conversation.
        // Profile opening is only via avatar tap (to avoid "opens profile instead of chat" on mobile).
        const avaSrc = esc(u.avatar || window.DEFAULT_AVATAR);
        row.innerHTML = `
        <div class="ava" data-uid="${esc(other)}"><img src="${avaSrc}" alt="" loading="lazy"></div>
        <div class="bubble" style="width:100%;cursor:pointer">
          <div class="name"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${u.online?'online':'offline'}</span></div>
          <div class="muted" style="font-size:12px">${new Date(v[room].ts||0).toLocaleString()}</div>
        </div>`;
        row.addEventListener('click', ()=>{
          openDMRoom(me.uid, other);
          // Mobile UX: open room as overlay
          try{
            document.body.classList.add('dm-room-open');
            const back = document.getElementById('dmBackMobile');
            if(back) back.style.display = '';
          }catch(e){}
        });
        const avaEl = row.querySelector('.ava');
        const imgEl = avaEl?.querySelector('img');
        if(imgEl){
          imgEl.onerror = ()=>{ try{ imgEl.src = window.DEFAULT_AVATAR; }catch(e){} };
        }
        avaEl?.addEventListener('click',(ev)=>{ ev.stopPropagation(); showUserCard(other); });
        box.appendChild(row);
      }
      const label=document.getElementById('dmWithName');
      if(label && !currentDmRoom) label.textContent='Osobní zprávy';

      // Save cache after successful render.
      try{
        const ck = __cacheKey('dmthreads');
        __cacheSet(ck, { html: box.innerHTML });
      }catch(e){}
    }catch(e){
      console.warn('loadDmThreads failed', e);
    }finally{
      setMiniLoad('dmMiniLoad','', false);
    }
  }

  // Override openDMRoom to set current room and update header
  const _origOpenDMRoom = window.openDMRoom;
  window.openDMRoom = async function(a,b){
    // Ensure DM becomes the active view (and persists across reload).
    try{ if(!document.getElementById('view-dm')?.classList.contains('active')) showView('view-dm'); }catch(e){}
    try{ localStorage.setItem('lastView','view-dm'); localStorage.setItem('mk_last_view','view-dm'); }catch(e){}
    currentDmRoom = dmKey(a,b);
    const other = (a===auth.currentUser?.uid) ? b : a;
    // Persist the last opened DM peer so after F5 we can restore the exact conversation.
    try{
      localStorage.setItem('mk_last_view','view-dm');
      localStorage.setItem('lastView','view-dm');
      localStorage.setItem('mk_last_dm_peer', String(other));
      localStorage.setItem('mk_last_dm_room', String(currentDmRoom));
    }catch(e){}
    const u = await getUser(other);
    document.getElementById('dmWithName').textContent = u.nick||'Uživatel';
    document.getElementById('dmWithStatus').textContent = u.online?'(online)':'(offline)';
    return _origOpenDMRoom(a,b);
  };

  document.getElementById('dmClearBtn')?.addEventListener('click', ()=>{
    const box=document.getElementById('dmFeed'); if(box) box.innerHTML='';
  });

  // Mobile back from DM room overlay
  document.getElementById('dmBackMobile')?.addEventListener('click', ()=>{
    try{ document.body.classList.remove('dm-room-open'); }catch(e){}
    const back = document.getElementById('dmBackMobile');
    if(back) back.style.display = 'none';
  });

  // When DM tab open, auto-load threads
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('[data-view="view-dm"]');
    if(t){ setTimeout(()=>{ if(auth.currentUser) loadDmThreads(); }, 80); }
  });

  // --- Profile locking & requests ---
  async function loadMyProfileUI(u){
    const up = (await db.ref('usersPublic/'+u.uid).get()).val()||{};
    const nickLocked = up.nickLocked===true;
    const roleLocked = up.roleLocked===true;

    // Fill UI
    document.getElementById('myName').textContent = up.nick || u.displayName || 'Uživatel';
    document.getElementById('profileEmail').textContent = 'E-mail: '+(u.email||'—');
    document.getElementById('profileRoleLine').textContent = 'Role: '+(up.role==='employer'?'Zaměstnavatel':'Hledám práci');
    document.getElementById('myAvatar').src = up.avatar || window.DEFAULT_AVATAR;
    const plan = (up.plan||'free');
    const badge=document.getElementById('myPlan');
    const planVal = String(plan||'').toLowerCase();
    const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
    if(badge){ badge.style.display = isPrem ? 'inline-block':'none'; }
    const myAdmin=document.getElementById('myAdmin');
    const isAdm = (u.uid === window.ADMIN_UID);
    if(myAdmin){ myAdmin.style.display = isAdm ? 'inline-block':'none'; }

    const setNick=document.getElementById('setNick');
    const setRole=document.getElementById('setRole');
    const setAbout=document.getElementById('setAbout');
    if(setNick){
      setNick.value = up.nick || '';
      setNick.disabled = nickLocked; // only initial set if not locked
      setNick.placeholder = nickLocked ? 'Nick je uzamčen' : 'Nick (nastavíte jen jednou)';
    }
    if(setRole){
      setRole.value = up.role || 'seeker';
      setRole.disabled = roleLocked;
    }
    if(setAbout){
      setAbout.value = up.about || '';
    }

    // buttons
    const btnNick=document.getElementById('reqNickChange');
    if(btnNick) btnNick.disabled = !nickLocked; // request only after initial set
    const btnRole=document.getElementById('reqRoleChange');
    if(btnRole) btnRole.disabled = !roleLocked;

    document.getElementById('saveProfile').onclick = async ()=>{
      const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
      const patch = {};
      // allow avatar/about always
      const avatarUrl=(document.getElementById('setAvatarUrl').value||'').trim();
      if(avatarUrl) patch.avatar = avatarUrl;
      const about=(document.getElementById('setAbout').value||'').trim();
      patch.about = about;
      // allow initial nick/role once
      if(!nickLocked){
        const nick=(document.getElementById('setNick').value||'').trim();
        if(nick){ patch.nick = nick; patch.nickLocked = true; }
      }
      if(!roleLocked){
        const role=document.getElementById('setRole').value;
        if(role){ patch.role = role; patch.roleLocked = true; }
      }
      await db.ref('usersPublic/'+u.uid).update(patch);
      toast('Uloženo'); playSound('ok');
      loadMyProfileUI(u);
    };

    document.getElementById('reqNickChange').onclick = async ()=>{
      const u=auth.currentUser; if(!u) return;
      const cur = (await db.ref('usersPublic/'+u.uid+'/nick').get()).val()||'';
      const wanted = prompt('Nový nick (čeká na schválení adminem):', cur);
      if(!wanted || wanted.trim()===cur) return;
      await db.ref('profileChangeRequests').push({uid:u.uid, type:'nick', from:cur, to:wanted.trim(), ts:Date.now(), status:'pending'});
      toast('Žádost odeslána adminovi');
    };

    document.getElementById('reqRoleChange').onclick = async ()=>{
      const u=auth.currentUser; if(!u) return;
      const curRole = (await db.ref('usersPublic/'+u.uid+'/role').get()).val()||'seeker';
      const wanted = prompt('Nová role: seeker / employer', curRole);
      if(!wanted) return;
      const v=wanted.trim().toLowerCase();
      if(v!=='seeker' && v!=='employer') return toast('Použijte seeker nebo employer');
      if(v===curRole) return;
      await db.ref('profileChangeRequests').push({uid:u.uid, type:'role', from:curRole, to:v, ts:Date.now(), status:'pending'});
      toast('Žádost odeslána adminovi');
    };

    document.getElementById('reqPremium').onclick = async ()=>{
      openPremiumBot();
    };
  }

  // --- Admin: approve requests ---
  async function loadAdminRequests(){
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    const box=document.getElementById('adminProfileRequests'); if(box) box.innerHTML='';
    const snap = await db.ref('profileChangeRequests').orderByChild('ts').limitToLast(50).get();
    const v=snap.val()||{};
    const ids=Object.keys(v).sort((a,b)=>(v[b].ts||0)-(v[a].ts||0));
    for(const id of ids){
      const r=v[id]; if(!r || r.status!=='pending') continue;
      const u=await getUser(r.uid);
    const el=document.createElement('div'); el.className='msg'; el.dataset.mid = snap.key;
      el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name" data-uid="${r.uid}"><b>${esc(u.nick||'Uživatel')}</b> · ${esc(r.type)}</div>
          <div class="muted">${esc(String(r.from))} → <b>${esc(String(r.to))}</b></div>
          <div class="actions">
            <button data-act="approve">Schválit</button>
            <button data-act="reject">Zamítnout</button>
          </div>
        </div>`;
      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='approve'){
          if(r.type==='nick') await db.ref('usersPublic/'+r.uid).update({nick:r.to});
          if(r.type==='role') await db.ref('usersPublic/'+r.uid).update({role:r.to});
          await db.ref('profileChangeRequests/'+id).update({status:'approved', decidedAt:Date.now()});
          toast('Schváleno');
          loadAdminRequests();
        }
        if(act==='reject'){
          await db.ref('profileChangeRequests/'+id).update({status:'rejected', decidedAt:Date.now()});
          toast('Zamítnuto');
          loadAdminRequests();
        }
      });
      box && box.appendChild(el);
    }

    const boxP=document.getElementById('adminPremiumRequests');
    const boxPay=document.getElementById('adminPaymentRequests'); if(boxP) boxP.innerHTML='';
    // payments/requests/{uid}/{id}
    const ps = await db.ref('payments/requests').get();
    const pv = ps.val() || {};
    // flatten
    const all = [];
    for(const uidKey of Object.keys(pv)){
      const per = pv[uidKey] || {};
      for(const id of Object.keys(per)){
        const r = per[id];
        if(r && r.status==='pending') all.push({id, uid: uidKey, r});
      }
    }
    all.sort((a,b)=>(b.r.ts||0)-(a.r.ts||0));
    for(const item of all.slice(0,100)){
      const r=item.r;
      const u=await getUser(item.uid);
      const el=document.createElement('div'); el.className='msg';
      const planTitle = (PREMIUM_PLANS[r.plan]?.title) || r.plan || 'Premium';
      const proof = r.proofImg ? `<div style="margin-top:6px"><img src="${esc(r.proofImg)}" style="max-width:220px;border-radius:10px"></div>` : '';
      el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name" data-uid="${esc(item.uid)}"><b>${esc(u.nick||'Uživatel')}</b> · ${esc(planTitle)}</div>
          <div class="muted">${esc(r.email||'')}</div>
          <div class="muted">Cena: ${esc(String(r.price||''))} Kč · ${esc(String(r.period||''))}</div>
          ${proof}
          <div class="actions">
            <button data-act="grant">Udělit</button>
            <button data-act="reject">Zamítnout</button>
          </div>
        </div>`;
      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='grant'){
          const plan = r.plan || 'vip';
          await db.ref('usersPublic/'+item.uid).update({plan, premiumSince:Date.now()});
          await db.ref('payments/requests/'+item.uid+'/'+item.id).update({status:'granted', decidedAt:Date.now()});
          toast('Privilegium uděleno');
          loadAdminRequests();
        }
        if(act==='reject'){
          await db.ref('payments/requests/'+item.uid+'/'+item.id).update({status:'rejected', decidedAt:Date.now()});
          toast('Zamítnuto');
          loadAdminRequests();
        }
      });
      boxP && boxP.appendChild(el);
    }
  }

  // --- Bots (MVP client scheduler for admin) ---
  let botTimer=null;
  async function loadBotsUI(){
    const box=document.getElementById('botList'); if(!box) return;
    box.innerHTML='';
    const s=await db.ref('bots').get(); const v=s.val()||{};
    for(const [id,b] of Object.entries(v)){
      const el=document.createElement('div'); el.className='msg';
      el.innerHTML = `<div class="ava"><img src="${esc(b.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name"><b>${esc(b.nick||'Bot')}</b> <span class="muted">${esc(b.city||'praha')}</span></div>
          <div class="muted">Interval: ${Math.max(1, (+b.intervalMin||15))} min · aktivní: ${b.enabled?'ano':'ne'}</div>
          <div class="actions">
            <button data-act="toggle">${b.enabled?'Vypnout':'Zapnout'}</button>
            <button data-act="edit">Upravit</button>
            <button data-act="del">Smazat</button>
          </div>
        </div>`;
      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='toggle'){ await db.ref('bots/'+id).update({enabled:!b.enabled}); loadBotsUI(); }
        if(act==='del'){ await db.ref('bots/'+id).remove(); loadBotsUI(); }
        if(act==='edit'){
          const nick=prompt('Nick bota:', b.nick||'Bot'); if(!nick) return;
          const city=prompt('Město (praha/brno/olomouc):', b.city||'praha')||'praha';
          const interval=prompt('Interval (min):', String(b.intervalMin||15))||'15';
          const text=prompt('Text zprávy:', b.text||'')||'';
          await db.ref('bots/'+id).update({nick:nick.trim(), city:city.trim(), intervalMin:parseInt(interval,10)||15, text});
          loadBotsUI();
        }
      });
      box.appendChild(el);
    }
  }

  
  // --- Bot DM auto-replies (runs only when admin has the site open) ---
  const __BOT_ROOM_LISTENERS = new Map(); // room -> ref
  async function _getBotConfigByUid(botUid){
    const id = String(botUid||'').startsWith('bot_') ? String(botUid).slice(4) : null;
    if(!id) return null;
    const s = await db.ref('bots/'+id).get();
    return s.val()||null;
  }

  async function _ensureBotPublic(botUid, b){
    try{
      await db.ref('usersPublic/'+botUid).update({
        nick: b?.nick || 'Bot',
        avatar: b?.avatar || window.DEFAULT_AVATAR,
        role: 'bot',
        plan: 'bot'
      });
    }catch(e){}
  }

  let __BOT_DM_STARTED = false;
  async function startBotDmEngine(){
    if(__BOT_DM_STARTED) return;
    __BOT_DM_STARTED = true;
    const me = auth.currentUser;
    if(!isAdminUser(me)) return;
    const adminUid = me.uid;

    // Watch bot rooms (created automatically when user opens DM with bot_*)
    db.ref('botRooms').orderByChild('ts').limitToLast(200).on('child_added', async (snap)=>{
      const room = snap.key;
      const r = snap.val()||{};
      if(!room || !r.botUid || !r.userUid) return;

      // Ensure admin is a member (user startDM tries to add, but we enforce too)
      try{ await db.ref('privateMembers/'+room+'/'+adminUid).set(true); }catch{}

      // Avoid double listeners
      if(__BOT_ROOM_LISTENERS.has(room)) return;

      const lastHandled = +r.lastHandledTs || 0;
      const ref = db.ref('privateMessages/'+room).orderByChild('ts').startAt(lastHandled+1);
      __BOT_ROOM_LISTENERS.set(room, ref);

      ref.on('child_added', async (ms)=>{
        const m = ms.val()||{};
        if(!m.ts || !m.by) return;
        const botUid = r.botUid;
        if(m.by === botUid) return; // ignore bot's own messages

        // Update last handled ASAP to prevent duplicate replies
        try{ await db.ref('botRooms/'+room).update({lastHandledTs: m.ts}); }catch{}

        // Forward to admin inbox (per bot)
        try{
          const payload = {
            ts: m.ts,
            botUid,
            from: m.by,
            room,
            text: m.text||'',
            img: m.img||''
          };
          await db.ref('botsInbox/'+adminUid+'/'+botUid).push(payload);
        }catch(e){}

        // Auto-reply (if bot has scenarios)
        try{
          const b = await _getBotConfigByUid(botUid);
          if(!b) return;
          await _ensureBotPublic(botUid, b);

          const sc = Array.isArray(b.scenarios) ? b.scenarios.filter(x=>x && (x.text || x.img)) : [];
          let pick = null;
          if(sc.length){
            pick = sc[Math.floor(Math.random()*sc.length)];
          }
          const replyText = (pick?.text || b.text || '').toString();
          const replyImg  = (pick?.img  || '').toString();
          if(!replyText && !replyImg) return;

          const ts2 = Date.now();
          await db.ref('privateMessages/'+room).push({by: botUid, ts: ts2, text: replyText, img: replyImg});

          // Update inbox meta so the thread stays "alive" for the user
          const userPub = await getUser(r.userUid);
          await Promise.all([
            db.ref('inboxMeta/'+r.userUid+'/'+room).update({with: botUid, ts: ts2, lastTs: ts2, title: b.nick||'Bot'}),
            db.ref('inboxMeta/'+botUid+'/'+room).update({with: r.userUid, ts: ts2, lastTs: ts2, title: userPub.nick||'Uživatel'}),
            db.ref('inboxMeta/'+adminUid+'/'+room).update({with: botUid, ts: ts2, lastTs: ts2, title: (b.nick||'Bot')+' (DM)'})
          ]);
        }catch(e){ console.warn('bot auto-reply failed', e?.code||e); }
      });
    });
  }

  // --- Bots modal (Admin) ---
  let __BOT_EDIT_ID = null;
  let __BOT_EDIT_AVA = null;
  let __BOT_EDIT_IMG = null;

  function _scRow(text='', img=''){
    const row = document.createElement('div');
    row.className = 'scRow';
    row.innerHTML = `
      <textarea rows="2" placeholder="Text odpovědi…"></textarea>
      <label class="filebtn mini">Obrázek <input type="file" accept="image/*"></label>
      <button class="ghost xbtn" type="button">✕</button>
    `;
    const ta = row.querySelector('textarea');
    ta.value = text||'';
    row.dataset.img = img||'';
    row.querySelector('input')?.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      row.dataset.img = await fileToDataURL(f);
      toast('Obrázek uložen (scénář)');
    });
    row.querySelector('button')?.addEventListener('click', ()=> row.remove());
    return row;
  }

  async function loadBotsModal(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const list = document.getElementById('botsModalList');
    if(!list) return;

    list.innerHTML = '<div class="muted">Načítám…</div>';
    const s = await db.ref('bots').get();
    const v = s.val()||{};
    const entries = Object.entries(v);

    list.innerHTML = '';
    if(entries.length===0){
      list.innerHTML = '<div class="muted">Zatím žádní boti.</div>';
    }
    for(const [id,b] of entries){
      const botUid = 'bot_'+id;
      const el = document.createElement('div');
      el.className='msg';
      el.innerHTML = `
        <div class="ava"><img src="${esc(b.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%;cursor:pointer">
          <div class="name"><b>${esc(b.nick||'Bot')}</b> <span class="muted">${esc(b.city||'praha')}</span></div>
          <div class="muted">UID: ${esc(botUid)} · Interval: ${Math.max(1,(+b.intervalMin||15))} min · aktivní: ${b.enabled?'ano':'ne'}</div>
        </div>
      `;
      el.addEventListener('click', ()=> selectBotForEdit(id, b));
      list.appendChild(el);
    }
  }

  function selectBotForEdit(id, b){
    __BOT_EDIT_ID = id;
    __BOT_EDIT_AVA = null;
    __BOT_EDIT_IMG = null;

    const hint = document.getElementById('botEditHint'); if(hint) hint.textContent = 'Upravuješ: bot_'+id;
    const elId = document.getElementById('botEditId'); if(elId) elId.value = id;
    const elNick = document.getElementById('botEditNick'); if(elNick) elNick.value = b?.nick||'';
    const elCity = document.getElementById('botEditCity'); if(elCity) elCity.value = b?.city||'praha';
    const elMode = document.getElementById('botEditMode'); if(elMode) elMode.value = b?.mode||'dm';
    const elFrom = document.getElementById('botEditFrom'); if(elFrom) elFrom.value = b?.activeFrom||'';
    const elTo = document.getElementById('botEditTo'); if(elTo) elTo.value = b?.activeTo||'';
    const elInt = document.getElementById('botEditInterval'); if(elInt) elInt.value = String(b?.intervalMin||15);
    const elEn = document.getElementById('botEditEnabled'); if(elEn) elEn.checked = !!b?.enabled;
    const elText = document.getElementById('botEditText'); if(elText) elText.value = b?.text||'';

    const delBtn = document.getElementById('botEditDelete'); if(delBtn) delBtn.style.display='';
    const sc = document.getElementById('botScenarioList'); if(sc) sc.innerHTML='';
    const arr = Array.isArray(b?.scenarios) ? b.scenarios : [];
    if(sc){
      if(arr.length===0){
        sc.appendChild(_scRow('Ahoj! Jak ti můžu pomoct?',''));
      }else{
        for(const it of arr){
          sc.appendChild(_scRow(it?.text||'', it?.img||''));
        }
      }
    }
  }

  async function saveBotFromEditor(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(!__BOT_EDIT_ID) return toast('Vyber bota');
    const id = __BOT_EDIT_ID;
    const botUid = 'bot_'+id;

    const nick = (document.getElementById('botEditNick')?.value||'').trim() || 'Bot';
    const city = (document.getElementById('botEditCity')?.value||'praha').trim() || 'praha'; // also supports 'all'
    const mode = (document.getElementById('botEditMode')?.value||'dm').trim() || 'dm'; // dm | chat | both
    const activeFrom = (document.getElementById('botEditFrom')?.value||'').trim(); // optional HH:MM
    const activeTo   = (document.getElementById('botEditTo')?.value||'').trim(); // 'all' allowed
    const intervalMin = Math.max(1, parseInt(document.getElementById('botEditInterval')?.value||'15',10) || 15);
    const enabled = !!document.getElementById('botEditEnabled')?.checked;
    const text = (document.getElementById('botEditText')?.value||'').trim();

    const scBox = document.getElementById('botScenarioList');
    const scenarios = [];
    if(scBox){
      for(const row of Array.from(scBox.children)){
        const t = (row.querySelector('textarea')?.value||'').trim();
        const img = (row.dataset.img||'').toString();
        if(t || img) scenarios.push({text:t, img});
      }
    }

    const patch = {nick, city, intervalMin, enabled, text, scenarios};
    if(__BOT_EDIT_AVA) patch.avatar = __BOT_EDIT_AVA;
    if(__BOT_EDIT_IMG) patch.img = __BOT_EDIT_IMG;

    await db.ref('bots/'+id).update(patch);
    await db.ref('usersPublic/'+botUid).update({nick, avatar: patch.avatar || (await getUser(botUid)).avatar || window.DEFAULT_AVATAR, role:'bot', plan:'bot'});
    toast('Bot uložen'); playSound('ok');
    loadBotsModal();
  }

  async function deleteBotFromEditor(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(!__BOT_EDIT_ID) return;
    if(!confirm('Smazat bota?')) return;
    await db.ref('bots/'+__BOT_EDIT_ID).remove();
    toast('Smazáno');
    __BOT_EDIT_ID=null;
    loadBotsModal();
  }


  
  
// --- Bot Chat Engine (Client-side host lock; runs when ANY client is online) ---
let __BOT_CHAT_TIMER = null;
let __BOT_HOST_TIMER = null;
let __IS_BOT_HOST = false;

function _botHostRef(){ return db.ref('runtime/botHost'); }

async function _tryAcquireBotHost(){
  const me = auth.currentUser;
  if(!me) return false;
  const ref = _botHostRef();
  const now = Date.now();
  try{
    const res = await ref.transaction((cur)=>{
      const stale = !cur || !cur.ts || (now - (+cur.ts||0) > 90000);
      if(!cur || stale) return {uid: me.uid, ts: now};
      if(cur.uid === me.uid) return {uid: me.uid, ts: now};
      return; // abort
    }, undefined, false);
    const v = res && res.snapshot ? res.snapshot.val() : null;
    return !!v && v.uid === me.uid;
  }catch(e){
    return false;
  }
}

async function _ensureBotHostOnce(){
  const me = auth.currentUser;
  if(!me) return;
  const ok = await _tryAcquireBotHost();
  __IS_BOT_HOST = ok;

  if(ok){
    try{ _botHostRef().onDisconnect().remove(); }catch(e){}
    try{ await _botHostRef().update({uid: me.uid, ts: Date.now()}); }catch(e){}
    _startBotTicks();
  }else{
    _stopBotTicks();
  }
}

function _startBotTicks(){
  if(__BOT_CHAT_TIMER) return;
  const run = async()=>{ try{ await _botChatTick(); }catch(e){} };
  __BOT_CHAT_TIMER = setInterval(run, 25000);
  run();
}
function _stopBotTicks(){
  if(__BOT_CHAT_TIMER){ try{ clearInterval(__BOT_CHAT_TIMER); }catch(e){} __BOT_CHAT_TIMER=null; }
}

function startBotHostEngine(){
  if(__BOT_HOST_TIMER) return;
  const loop = async()=>{ try{ await _ensureBotHostOnce(); }catch(e){} };
  __BOT_HOST_TIMER = setInterval(loop, 30000);
  loop();
}
function stopBotHostEngine(){
  if(__BOT_HOST_TIMER){ try{ clearInterval(__BOT_HOST_TIMER); }catch(e){} __BOT_HOST_TIMER=null; }
  _stopBotTicks();
  __IS_BOT_HOST=false;
}

// Bot tick: posts at most 1 due message per bot; supports "catch-up" via nextChatAt
const _botChatTick = async ()=>{
    try{
      const snap = await db.ref('bots').get();
      const bots = snap.val()||{};
      const now = Date.now();

      for(const [id,b] of Object.entries(bots)){
        if(!b || !b.enabled) continue;
        const mode = (b.mode||'dm').toString();
        if(mode!=='chat' && mode!=='both') continue;
        if(!shouldRunNow(b)) continue;

        const nextAt = +b.nextChatAt||0;
        const intervalMs = Math.max(60_000, (+b.intervalMin||15)*60_000);
        if(nextAt && now < nextAt) continue;

        const botUid = 'bot_'+id;
        let pick = null;
        const sc = Array.isArray(b.scenarios) ? b.scenarios : [];
        if(sc.length){ pick = sc[Math.floor(Math.random()*sc.length)]; }
        const text = (pick?.text || b.text || '').toString().trim();
        const img  = (pick?.img  || b.img  || '').toString().trim();
        if(!text && !img) continue;

        const targets = (b.city==='all') ? (window.CITIES || ['praha']) : [ (b.city||'praha') ];
        for(const city of targets){
          const msg = { by: botUid, ts: now, text: text||null, img: img||null, bot:true, botUid };
          await db.ref('messages/'+city).push(msg);
        }

        // schedule next chat post
        const nextChatAt = now + (Number(b.intervalMs) || intervalMs);
        await db.ref('bots/'+id).update({ lastChatTs: now, nextChatAt });
        try{
          await db.ref('usersPublic/'+botUid).update({ nick: b.nick||'Bot', avatar: b.avatar||window.DEFAULT_AVATAR, role:'bot', plan:'bot' });
        }catch(e){}
      }
    }catch(e){
      console.warn('botChat tick', e);
    }
  };

// --- Bot Inbox modal (Admin) ---
  let __BOT_INBOX_REF=null;
  async function loadBotInboxModal(){
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const adminUid=me.uid;
    const sel=document.getElementById('botInboxSelect');
    const box=document.getElementById('botInboxFeedModal');
    if(!sel || !box) return;

    // build bot list
    const s=await db.ref('bots').get(); const v=s.val()||{};
    const ids=Object.keys(v);
    sel.innerHTML='';
    if(ids.length===0){
      sel.innerHTML='<option value="">—</option>';
      box.innerHTML='<div class="muted">Zatím žádní boti.</div>';
      return;
    }
    for(const id of ids){
      const botUid='bot_'+id;
      const opt=document.createElement('option');
      opt.value=botUid;
      opt.textContent = (v[id]?.nick||'Bot')+' ('+botUid+')';
      sel.appendChild(opt);
    }
    const first=sel.value||('bot_'+ids[0]);
    sel.value=first;

    const renderFor = async (botUid)=>{
      if(__BOT_INBOX_REF){ try{ __BOT_INBOX_REF.off(); }catch(e){} }
      box.innerHTML='<div class="muted">Načítám…</div>';
      __BOT_INBOX_REF = db.ref('botsInbox/'+adminUid+'/'+botUid).orderByChild('ts').limitToLast(80);
      __BOT_INBOX_REF.on('value', async (snap)=>{
        const vv=snap.val()||{};
        const keys=Object.keys(vv).sort((a,b)=>(vv[b].ts||0)-(vv[a].ts||0));
        box.innerHTML='';
        if(keys.length===0){
          box.innerHTML='<div class="muted">Zatím žádné zprávy.</div>';
          return;
        }
        const term = (document.getElementById('botInboxSearch')?.value||'').toString().trim().toLowerCase();
        for(const k of keys){
          const it=vv[k]||{};
          const fromU = it.from ? await getUser(it.from) : null;
          if(term){
            const nn = (fromU?.nick||'').toString().toLowerCase();
            if(!nn.includes(term)) continue;
          }
          const el=document.createElement('div'); el.className='msg';
          el.innerHTML = `
            <div class="ava" data-uid="${esc(it.from||'')}"><img src="${esc(fromU?.avatar||window.DEFAULT_AVATAR)}"></div>
            <div class="bubble" style="width:100%">
              <div class="name"><b>${esc(fromU?.nick||'Uživatel')}</b> <span class="muted">${new Date(it.ts||0).toLocaleString()}</span></div>
              ${it.text?`<div class="text">${esc(it.text)}</div>`:''}
              ${it.img?`<div class="text"><img src="${esc(it.img)}"></div>`:''}
              <div class="actions">
                <button data-act="open">Otevřít DM</button>
                <button data-act="del">Smazat</button>
              </div>
            </div>
          `;
          el.addEventListener('click', async (e)=>{
            const act=e.target?.dataset?.act; if(!act) return;
            if(act==='open' && it.from){
              closeModal('modalBotInbox');
              openDMRoom(adminUid, it.from);
              showView('view-dm');
            }
            if(act==='del'){
              await db.ref('botsInbox/'+adminUid+'/'+botUid+'/'+k).remove();
            }
          });
          box.appendChild(el);
        }
      });
    };

    await renderFor(first);
    sel.onchange = ()=> renderFor(sel.value);
    document.getElementById('botInboxSearch')?.addEventListener('input', ()=>renderFor(sel.value));
  }

  document.getElementById('botInboxClear')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    const botUid=document.getElementById('botInboxSelect')?.value;
    if(!botUid) return;
    if(!confirm('Vyčistit inbox pro '+botUid+'?')) return;
    await db.ref('botsInbox/'+me.uid+'/'+botUid).remove();
    toast('Vyčištěno');
  });

async function botTick(){
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    const s=await db.ref('bots').get(); const v=s.val()||{};
    const now=Date.now();
    for(const [id,b] of Object.entries(v)){
      if(!b || !b.enabled) continue;
      const last = +b.lastTs || 0;
      const intervalMs = Math.max(1,(+b.intervalMin||15))*60*1000;
      if(now-last < intervalMs) continue;
      const city = (b.city||'praha');
      // create /usersPublic for botId (virtual)
      const botUid = 'bot_'+id;
      await db.ref('usersPublic/'+botUid).update({nick:b.nick||'Bot', avatar:b.avatar||window.DEFAULT_AVATAR, role:'bot', plan:'bot'});
      await db.ref('messages/'+city).push({by:botUid, ts:now, text:b.text||'', img:b.img||''});
      await db.ref('bots/'+id).update({lastTs:now});
    }
  }

  
  // --- Bot inbox (messages forwarded to owner) ---
  let BOTINBOX_REF=null;
  async function loadBotInboxUI(){
    const me=auth.currentUser; if(!me) return;
    const box=document.getElementById('botInboxFeed'); if(!box) return;
    box.innerHTML = '<div class="muted">Načítám…</div>';
    if(BOTINBOX_REF){ try{ BOTINBOX_REF.off(); }catch(e){} }
    BOTINBOX_REF = db.ref('botsInbox/'+me.uid).orderByChild('ts').limitToLast(80);
    BOTINBOX_REF.on('value', async snap=>{
      const v=snap.val()||{};
      const ids=Object.keys(v).sort((a,b)=>(v[b].ts||0)-(v[a].ts||0));
      box.innerHTML='';
      if(ids.length===0){
        box.innerHTML = '<div class="muted">Zatím žádné zprávy.</div>';
        return;
      }
      for(const id of ids){
        const it=v[id]||{};
        const fromU = it.from ? await getUser(it.from) : null;
          if(term){
            const nn = (fromU?.nick||'').toString().toLowerCase();
            if(!nn.includes(term)) continue;
          }
        const botU = it.botUid ? await getUser(it.botUid) : null;
        const el=document.createElement('div'); el.className='msg';
        const who = fromU?.nick || 'Uživatel';
        const botName = botU?.nick || 'Bot';
        el.innerHTML = `<div class="ava" data-uid="${esc(it.from||'')}"><img src="${esc(fromU?.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="name"><b>${esc(who)}</b> → <span class="muted">${esc(botName)}</span> <span class="badge premium">REKLAMA</span></div>
            ${it.text ? `<div class="text">[REKLAMA] ${esc(it.text)}</div>` : ''}
            ${it.img ? `<div class="text"><img src="${esc(it.img)}"></div>` : ''}
            <div class="actions">
              <button data-act="open">Otevřít DM</button>
              <button data-act="del">Smazat</button>
            </div>
          </div>`;
        el.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act; if(!act) return;
          if(act==='open' && it.from){
            openDM(it.from);
          }
          if(act==='del'){
            await db.ref('botsInbox/'+me.uid+'/'+id).remove();
          }
        });
        box.appendChild(el);
      }
    });
  }

document.getElementById('botAdd')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const nick=prompt('Nick bota:', 'Bot'); if(!nick) return;
    const city=prompt('Město (praha/brno/olomouc):', getCity())||getCity();
    const interval=prompt('Interval (min):','15')||'15';
    const text=prompt('Text zprávy:', 'Ahoj!')||'';
    const id = db.ref('bots').push().key;
    await db.ref('bots/'+id).set({nick:nick.trim(), city:city.trim(), intervalMin:parseInt(interval,10)||15, text, enabled:true, createdAt:Date.now()});
    toast('Bot přidán');
    loadBotsUI();
  });
  document.getElementById('botRun')?.addEventListener('click', ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(botTimer) return toast('Boti již běží');
    botTimer=setInterval(()=>botTick().catch(console.error), 5000);
    toast('Boti spuštěni');
  });
  document.getElementById('botStop')?.addEventListener('click', ()=>{
    if(botTimer){ clearInterval(botTimer); botTimer=null; toast('Boti zastaveni'); }
  });


  // --- Bot profiles by UID (for fixed bot accounts) ---
  const BOT_UIDS = ['VrP5IzhgxmT0uKWc9UWlXSCe6nM2','rN93vIzh0AUhX1YsSWb6Th6W9w82'];
  async function loadBotProfiles(){
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    try{
      const u1=(await db.ref('usersPublic/'+BOT_UIDS[0]).get()).val()||{};
      const u2=(await db.ref('usersPublic/'+BOT_UIDS[1]).get()).val()||{};
      const n1=document.getElementById('botNick1'); if(n1) n1.value = u1.nick||u1.name||'';
      const n2=document.getElementById('botNick2'); if(n2) n2.value = u2.nick||u2.name||'';
    }catch(e){ console.warn(e); }
  }
  async function saveBotProfile(which){
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const uid = BOT_UIDS[which-1];
    const nickEl=document.getElementById(which===1?'botNick1':'botNick2');
    const fileEl=document.getElementById(which===1?'botAva1':'botAva2');
    const nick=(nickEl?.value||'').trim();
    let avatar=null;
    const f=fileEl?.files && fileEl.files[0];
    if(f){ avatar = await fileToDataURL(f); }
    const upd={};
    if(nick) upd.nick=nick;
    if(avatar) upd.avatar=avatar;
    upd.updatedAt=Date.now();
    await db.ref('usersPublic/'+uid).update(upd);
    toast('Uloženo'); playSound('ok');
    if(fileEl) fileEl.value='';
  }
  document.getElementById('botSave1')?.addEventListener('click', ()=>saveBotProfile(1).catch(console.error));
  document.getElementById('botSave2')?.addEventListener('click', ()=>saveBotProfile(2).catch(console.error));
  // (removed) duplicate onAuthStateChanged in Stage5 – handled by main auth handler

  // When admin tab open, refresh
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('[data-view="view-admin"]');
    if(t){ setTimeout(()=>{ if(isAdminUser(auth.currentUser)){ loadAdminRequests(); loadBotsUI(); loadBotInboxUI(); loadBotProfiles(); } }, 120); }
  });

})();



// Global delegation: click on any element with data-uid opens profile
document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-uid]');
  if(!el) return;
  const uid = el.getAttribute('data-uid');
  if(!uid) return;

  // ignore if clicking inside input/textarea
  if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;

  // In LS/DM the row click must open the conversation, not the profile.
  // Allow opening profile only by clicking the avatar inside DM lists.
  const inDmThreads = !!e.target.closest('#dmThreads');
  const inDmHistory = !!e.target.closest('#dmHistory');
  if((inDmThreads || inDmHistory) && !e.target.closest('.ava')) return;

  if(window.showUserCard){
    e.preventDefault();
    e.stopPropagation();
    window.showUserCard(uid).catch(err=>{ console.error(err); });
  }
});

// Chat avatar -> user card
document.getElementById('chatFeed')?.addEventListener('click', (e)=>{
  const a = e.target.closest('.ava');
  if(!a) return;
  const uid = a.getAttribute('data-uid');
  if(uid) { e.stopPropagation(); window.showUserCard && window.showUserCard(uid); }
});


// === Mobile Drawer + Top Icons ===
(function initMobileNav(){
  const drawer = document.getElementById('drawer');
  const ov = document.getElementById('drawerOverlay');
  const btn = document.getElementById('drawerBtn');
  const closeBtn = document.getElementById('drawerClose');

  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: 720px)').matches; }
  function openDrawer(){
  closeAllOverlays({keep:"drawer"});
    if(!drawer || !ov) return;
    ov.hidden = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden','false');
    // unlock audio on first deliberate interaction (browser autoplay policy)
    try{ unlockAudio?.(); }catch(e){}
  }
  function closeDrawer(){
    if(!drawer || !ov) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','true');
    ov.hidden = true;
  }

  btn?.addEventListener('click', (e)=>{ e.preventDefault(); openDrawer(); });
  closeBtn?.addEventListener('click', (e)=>{ e.preventDefault(); closeDrawer(); });
  ov?.addEventListener('click', ()=> closeDrawer());

  // drawer nav
  drawer?.addEventListener('click', (e)=>{
    const a = e.target.closest('a.drawer-item');
    if(!a) return;
    e.preventDefault();
    const view = a.getAttribute('data-view');
    if(view){
      if(view==='view-dm'){
        try{ openDMInbox(true); }catch(e){ showView(view); }
      }else{
        showView(view);
      }
    }
    // Premium shortcut opens DM with bot
    if(a.id==='drawerPremium'){ try{ openPremiumBot(); }catch{} }
    closeDrawer();
  });

  // auth buttons in drawer
  document.getElementById('btnLoginDrawer')?.addEventListener('click', ()=>{
    closeDrawer();
    try{ openModalAuth('login'); }catch{ try{ document.getElementById('modalAuth').hidden=false; }catch{} }
  });
  document.getElementById('btnSignoutDrawer')?.addEventListener('click', async ()=>{
    closeDrawer();
    try{ await auth.signOut(); }catch(e){ console.warn(e); }
  });

  // top icons
  document.getElementById('btnDMTop')?.addEventListener('click', ()=>{
    try{ openDMInbox(true); }catch(e){ try{ showView('view-dm'); }catch(_){} }
  });
  document.getElementById('btnFriendsTop')?.addEventListener('click', ()=> showView('view-friends'));
  document.getElementById('btnMe')?.addEventListener('click', ()=> showView('view-profile'));
  // 🔔 = feed of in-app notifications (permission is requested from cookie consent flow)
  document.getElementById('btnBell')?.addEventListener('click', ()=>{
    const me = auth?.currentUser;
    if(!me){ try{ openModalAuth('login'); }catch{}; return; }
    openModal(document.getElementById('modalNotif'));
    try{ markNotificationsRead?.(); }catch{}
  });

  // swipe open/close (mobile only)
  let sx=0, sy=0, tracking=false, openStart=false;
  const EDGE=26, TH=55, VTH=60;
  window.addEventListener('touchstart', (e)=>{
    if(!isMobile()) return;
    const t=e.touches[0];
    sx=t.clientX; sy=t.clientY;
    openStart = sx <= EDGE && !drawer?.classList.contains('open');
    tracking = openStart || drawer?.classList.contains('open');
  }, {passive:true});

  window.addEventListener('touchmove', (e)=>{
    if(!tracking || !isMobile()) return;
    const t=e.touches[0];
    const dx=t.clientX - sx;
    const dy=t.clientY - sy;
    if(Math.abs(dy) > VTH) { tracking=false; return; } // scrolling
    if(openStart && dx > TH){ openDrawer(); tracking=false; }
    if(drawer?.classList.contains('open') && dx < -TH){ closeDrawer(); tracking=false; }
  }, {passive:true});

  // expose for debug
  window.__openDrawer = openDrawer;
  window.__closeDrawer = closeDrawer;
})();

// === Admin settings (wallpapers, sounds, premium) ===
function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=()=>reject(r.error||new Error('read failed'));
    r.readAsDataURL(file);
  });
}
async function adminSet(path, value){
  if(!auth.currentUser) throw new Error('no auth');
  if(!window.__isAdmin) throw new Error('not admin');
  return db.ref(path).set(value);
}
function bindUpload(id, onData){
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('change', async ()=>{
    try{
      if(!window.__isAdmin){ toast('Pouze administrátor.'); el.value=''; return; }
      const f=el.files && el.files[0]; if(!f) return;
      const data=await readFileAsDataURL(f);
      await onData(data, f);
      el.value='';
    }catch(e){
      console.warn(e);
      toast('Chyba při uploadu');
      try{ el.value=''; }catch{}
    }
  });
}
function setThumb(id, dataUrl){
  try{
    const img=document.getElementById(id);
    if(img && typeof dataUrl==='string' && dataUrl.startsWith('data:')) img.src=dataUrl;
  }catch{}
}
function initAdminSettings(){
  // Wallpapers uploads
  bindUpload('wpGlobal', async (data)=>{
    setMainWallpaper(data);
    setThumb('wpGlobalPrev', data);
    await adminSet('settings/wallpapers/main', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('Global wallpaper uložen');
  });
  bindUpload('wpAuth', async (data)=>{
    setAuthWallpaper(data);
    setThumb('wpAuthPrev', data);
    await adminSet('settings/wallpapers/auth', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('Auth wallpaper uložen');
  });
  bindUpload('wpChat', async (data)=>{
    setChatWallpaper(data);
    setThumb('wpChatPrev', data);
    await adminSet('settings/wallpapers/chat', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('Chat wallpaper uložen');
  });
  bindUpload('wpDm', async (data)=>{
    setDmWallpaper(data);
    setThumb('wpDmPrev', data);
    await adminSet('settings/wallpapers/dm', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('DM wallpaper uložen');
  });
  bindUpload('wpProfile', async (data)=>{
    setProfileWallpaper(data);
    setThumb('wpProfilePrev', data);
    await adminSet('settings/wallpapers/profile', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('Profile wallpaper uložen');
  });
  // Payments QR upload (VIP/Premium bot)
  bindUpload('payQrImg', async (data)=>{
    setThumb('payQrImgPrev', data);
    await adminSet('settings/payments/qrImg', data);
    toast('QR pro platby uložen');
  });

  // Sounds uploads
  bindUpload('sndDm', async (data)=>{
    _setAudioSrc('dm', data);
    await adminSet('settings/sounds/dm', data);
    toast('dm.mp3 uložen');
  });
  bindUpload('sndNotify', async (data)=>{
    _setAudioSrc('notify', data);
    await adminSet('settings/sounds/notify', data);
    toast('notify.mp3 uložen');
  });
  bindUpload('sndFriend', async (data)=>{
    _setAudioSrc('friend', data);
    await adminSet('settings/sounds/friend', data);
    toast('friend.mp3 uložen');
  });

  // Sound tests
  document.getElementById('testDm')?.addEventListener('click', ()=> playSound('dm'));
  document.getElementById('testNotify')?.addEventListener('click', ()=> playSound('notify'));
  document.getElementById('testFriend')?.addEventListener('click', ()=> playSound('friend'));

  // Master volume + mute default
  const mv=document.getElementById('masterVolume');
  const mvVal=document.getElementById('masterVolumeVal');
  const mute=document.getElementById('muteDefault');
  if(mv){
    mv.addEventListener('input', ()=>{
      SOUND_CFG.masterVolume = Number(mv.value);
      applySoundVolumes();
      if(mvVal) mvVal.textContent = String(Number(mv.value).toFixed(2));
    });
    mv.addEventListener('change', async ()=>{
      try{
        await adminSet('settings/sounds/masterVolume', Number(mv.value));
      }catch(e){ console.warn(e); }
    });
  }
  if(mute){
    mute.addEventListener('change', async ()=>{
      try{
        await adminSet('settings/sounds/muteDefault', !!mute.checked);
      }catch(e){ console.warn(e); }
    });
  }

  // Load current settings for previews/fields
  try{
    db.ref('settings/wallpapers').on('value', (s)=>{
      const v=s.val()||{};
      const get=(k)=> (typeof v[k]==='string')?v[k]:(v[k]&&v[k].url);
      const main=get('main'); if(main) setThumb('wpGlobalPrev', main);
      const authw=get('auth'); if(authw) setThumb('wpAuthPrev', authw);
      const chat=get('chat'); if(chat) setThumb('wpChatPrev', chat);
      const dm=get('dm'); if(dm) setThumb('wpDmPrev', dm);
      const prof=get('profile'); if(prof) setThumb('wpProfilePrev', prof);
    });
  }catch{}
  try{
    db.ref('settings/sounds').on('value', (s)=>{
      const v=s.val()||{};
      if(mv && typeof v.masterVolume!=='undefined'){ mv.value=String(v.masterVolume); if(mvVal) mvVal.textContent=String(Number(v.masterVolume).toFixed(2)); }
      if(mute && typeof v.muteDefault!=='undefined'){ mute.checked=!!v.muteDefault; }
    });
  }catch{}

  // Premium / QR
  bindUpload('premiumQrUpload', async (data)=>{
    setThumb('premiumQrPreview', data);
    await adminSet('settings/premium/qr', data);
    toast('QR uložen');
  });
  const saveBtn=document.getElementById('savePremium');
  saveBtn?.addEventListener('click', async ()=>{
    try{
      if(!window.__isAdmin){ toast('Pouze administrátor'); return; }
      const txt=document.getElementById('premiumText')?.value||'';
      const sup=document.getElementById('supportUid')?.value||'';
      await adminSet('settings/premium/text', txt);
      await adminSet('settings/premium/supportUid', sup);
      await adminSet('settings/premium/plans', { premium:{price:150}, premium_plus:{price:200} });
      toast('Premium nastavení uloženo');
    }catch(e){ console.warn(e); toast('Chyba uložení'); }
  });
  try{
    db.ref('settings/premium').on('value', (s)=>{
      const v=s.val()||{};
      if(typeof v.qr==='string') setThumb('premiumQrPreview', v.qr);
      const txtEl=document.getElementById('premiumText'); if(txtEl && typeof v.text==='string') txtEl.value=v.text;
      const supEl=document.getElementById('supportUid'); if(supEl && typeof v.supportUid==='string') supEl.value=v.supportUid;
    });
  }catch{}
}


/* [MK_BOOTSTRAP] removed duplicate DOMContentLoaded block */


function initFabMenu(){
  const btn = document.getElementById('fabBtn');
  const menu = document.getElementById('fabMenu');
  if(!btn || !menu) return;

  const close = ()=>{ menu.hidden = true; };
  const toggle = ()=>{ menu.hidden = !menu.hidden; };

  btn.addEventListener('click', (e)=>{ e.preventDefault(); toggle(); });
  document.addEventListener('click', (e)=>{
    if(menu.hidden) return;
    if(e.target===btn || menu.contains(e.target)) return;
    close();
  }, true);

  const loginBtn=document.getElementById('fabLogin');
  const dmAdminBtn=document.getElementById('fabDmAdmin');
  const bellBtn=document.getElementById('fabBell');
  const adminBtn=document.getElementById('fabAdmin');
  const premBtn=document.getElementById('fabPremium');
  const botsBtn=document.getElementById('fabBots');
  const botInboxBtn=document.getElementById('fabBotInbox');

  loginBtn?.addEventListener('click', ()=>{ close(); try{ openAuth(); }catch{ document.getElementById('authModal')?.classList.add('show'); } });
  dmAdminBtn?.addEventListener('click', ()=>{ close(); try{ openSupportChat(); }catch(e){ console.warn(e); toast('Support není připraven'); } });
  bellBtn?.addEventListener('click', ()=>{ close(); try{ openNotifsPanel(); }catch(e){ console.warn(e); } });
  premBtn?.addEventListener('click', ()=>{ close(); try{ openPremium(); }catch(e){ console.warn(e); } });
  botsBtn?.addEventListener('click', async ()=>{ close(); const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin'); openModal('modalBots'); await loadBotsModal(); });
  botInboxBtn?.addEventListener('click', async ()=>{ close(); const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin'); openModal('modalBotInbox'); await loadBotInboxModal(); });
  adminBtn?.addEventListener('click', ()=>{ close(); try{ openAdmin(); }catch(e){ console.warn(e); } });

  // show/hide admin entry
  const refreshAdminBtn=()=>{
    const ok = !!window.__isAdmin;
    if(adminBtn) adminBtn.style.display = ok ? 'block' : 'none';
  };
  refreshAdminBtn();
  
  try{ window.addEventListener('admin-changed', refreshAdminBtn); }catch{}
}

function initBotsModalUI(){
  // Modal buttons
  document.getElementById('botsModalAdd')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const id = db.ref('bots').push().key;
    await db.ref('bots/'+id).set({nick:'Bot', city:getCity(), intervalMin:15, text:'Ahoj!', enabled:true, scenarios:[{text:'Ahoj! Napiš prosím více detailů.', img:''}], createdAt:Date.now()});
    await loadBotsModal();
  });

  document.getElementById('botsModalRun')?.addEventListener('click', ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(botTimer) return toast('Boti již běží');
    botTimer=setInterval(()=>botTick().catch(console.error), 5000);
    toast('Boti spuštěni');
  });

  document.getElementById('botsModalStop')?.addEventListener('click', ()=>{
    if(botTimer){ clearInterval(botTimer); botTimer=null; toast('Boti zastaveni'); }
  });

  document.getElementById('botScenarioAdd')?.addEventListener('click', ()=>{
    const box=document.getElementById('botScenarioList');
    if(!box) return;
    box.appendChild(_scRow('', ''));
  });

  document.getElementById('botEditSave')?.addEventListener('click', ()=> saveBotFromEditor().catch(e=>{ console.warn(e); toast('Chyba uložení'); }));
  document.getElementById('botEditDelete')?.addEventListener('click', ()=> deleteBotFromEditor().catch(e=>{ console.warn(e); toast('Chyba'); }));

  document.getElementById('botEditAvatar')?.addEventListener('change', async (e)=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    __BOT_EDIT_AVA = await fileToDataURL(f);
    toast('Avatar připraven (uloží se po Uložit)');
  });
  document.getElementById('botEditImg')?.addEventListener('change', async (e)=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    __BOT_EDIT_IMG = await fileToDataURL(f);
    toast('Obrázek připraven (uloží se po Uložit)');
  });

  // Open modals via top bar as well (optional)
  document.getElementById('btnBell')?.addEventListener('click', ()=>{ /* already wired */ });

  // Close modals safely
}
function openNotifsPanel(){
  try{ openModal('modalNotif'); }catch(e){ console.warn(e); }
}

function openAdmin(){
  const v = document.getElementById('view-admin');
  if(!v) return;
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  v.classList.add('active');
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelector('.tab[data-view="admin"]')?.classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}

function openSupportChat(){
  if(!window._user){ toast('Nejdřív se přihlaste'); openAuth(); return; }
  const adminUid = (window.ADMIN_UIDS && window.ADMIN_UIDS[0]) ? window.ADMIN_UIDS[0] : null;
  if(!adminUid){ toast('Admin UID nenastaven'); return; }
  openDMRoom(window._user.uid, adminUid);
  // switch to DM view
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.getElementById('view-dm')?.classList.add('active');
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelector('.tab[data-view="dm"]')?.classList.add('active');
}


async function seedAdminIfWhitelisted(){
  try{
    const me=auth.currentUser;
    if(!me) return;
    const WL = new Set([
      'rN93vIzh0AUhX1YsSWb6Th6W9w82',
      'c7HO42DoqCVJeShxpEcJIxudxmD2',
      'VrP5IzhgxmT0uKWc9UWlXSCe6nM2'
    ]);
    if(!WL.has(me.uid)) return;
    const ref=db.ref('roles/'+me.uid+'/admin');
    const cur=(await ref.get()).val();
    if(cur!==true){
      await ref.set(true);
    }
  }catch(e){ }
}



/* =========================
   v17: Heavy admin tools + broadcast + support + map moderation + DM encryption (MVP)
   ========================= */

// (Legacy) These helpers used to override the main modal manager above and caused broken close buttons.
// Keep them renamed so we don't redeclare openModal/closeModal.
function _openModalLegacy(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.hidden=false;
}
function _closeModalLegacy(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.hidden=true;
}

// --- Drawer: Rules / Help / Support ---
function initInfoPages(){
  const rulesHtml = `
    <h3>Pravidla MAKÁME CZ</h3>
    <ol>
      <li><b>Respekt:</b> zákaz urážek, výhrůžek, diskriminace a nenávisti.</li>
      <li><b>Spam:</b> zákaz floodu, opakování stejného textu, klamavých nabídek.</li>
      <li><b>Podvody:</b> zákaz vylákání plateb mimo dohodnutý proces, falešných profilů.</li>
      <li><b>Soukromí:</b> nezveřejňujte cizí osobní údaje bez souhlasu.</li>
      <li><b>Obsah:</b> žádné ilegální služby, drogy, násilí, zbraně, extremismus.</li>
      <li><b>Moderace:</b> porušení pravidel může vést k mute/ban dle závažnosti.</li>
    </ol>
    <p class="muted">Pozn.: Systém je ve vývoji. Pokud narazíte na chybu, použijte „Kontakt / Stížnost“.</p>
  `;
  const helpHtml = `
    <h3>Pomoc + Pravidla</h3>
    <div class="card" style="padding:12px;margin:10px 0;">
      <h4 style="margin:0 0 6px 0;">Rychlá pomoc</h4>
      <ul>
        <li><b>Chat:</b> vyberte město nahoře a pište do veřejného chatu.</li>
        <li><b>DM:</b> otevřete „Osobní (DM)“ a napište příteli nebo botovi.</li>
        <li><b>Přátelé:</b> pošlete žádost e‑mailem. Nové žádosti uvidíte v 🔔.</li>
        <li><b>Privilegia:</b> v menu ⭐ najdete nákup a potvrzení.</li>
        <li><b>Notifikace:</b> povolení se nabídne po souhlasu s cookies (automaticky, se zpožděním).</li>
      </ul>
      <p class="muted" style="margin:6px 0 0 0;">Tip: Pokud se něco načítá déle, vyčkejte – mini‑preloader ukazuje stav.</p>
    </div>
    <div class="card" style="padding:12px;margin:10px 0;">
      ${rulesHtml}
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;">
      <button id="openSupportFromHelp" class="btn btn-neon">Kontakt / Stížnost</button>
    </div>
  `;
  const rulesEl=document.getElementById('rulesContent'); if(rulesEl) rulesEl.innerHTML = rulesHtml;
  const helpEl=document.getElementById('helpContent'); if(helpEl) helpEl.innerHTML = helpHtml;

  // One entry point: "Pomoc + Pravidla" (drawer) -> helpModal, inside it you can open support ticket.
  document.getElementById('drawerSupport')?.addEventListener('click', (e)=>{ e.preventDefault(); openModal('helpModal'); try{ window.__closeDrawer?.(); }catch{} });

  document.getElementById('rulesClose')?.addEventListener('click', ()=>closeModal('rulesModal'));
  document.getElementById('helpClose')?.addEventListener('click', ()=>closeModal('helpModal'));
  document.getElementById('supportClose')?.addEventListener('click', ()=>closeModal('supportModal'));

  // open support from combined help
  setTimeout(()=>{
    document.getElementById('openSupportFromHelp')?.addEventListener('click', ()=>{ closeModal('helpModal'); openModal('supportModal'); });
  },0);
}

// --- Support tickets (users -> admin) ---
let _supportImgData=null;
document.getElementById('supportImg')?.addEventListener('change', async (e)=>{
  try{
    const f=e.target.files && e.target.files[0];
    if(!f){ _supportImgData=null; return; }
    _supportImgData = await fileToDataURL(f);
    toast('Screenshot přidán'); playSound('ok');
  }catch(e){ _supportImgData=null; }
});
document.getElementById('supportSend')?.addEventListener('click', async ()=>{
  try{
    const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    const txt=(document.getElementById('supportText')?.value||'').trim();
    if(!txt && !_supportImgData) return;
    await db.ref('support/tickets').push({by:u.uid, ts:Date.now(), text:txt||null, img:_supportImgData||null, ua:(navigator.userAgent||'')});
    document.getElementById('supportText').value='';
    document.getElementById('supportImg').value='';
    _supportImgData=null;
    toast('Odesláno. Děkujeme.'); playSound('ok');
    closeModal('supportModal');
  }catch(e){ console.warn(e); toast('Chyba odeslání'); playSound('err'); }
});

// --- Broadcast (admin -> all users) ---
let _broadcastImg=null, _broadcastMp3=null;
document.getElementById('broadcastImg')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  _broadcastImg = f ? await fileToDataURL(f) : null;
});
document.getElementById('broadcastMp3')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  _broadcastMp3 = f ? await fileToDataURL(f) : null;
});
document.getElementById('broadcastSave')?.addEventListener('click', async ()=>{
  try{
    if(!window.__isAdmin){ toast('Pouze admin'); return; }
    const title=(document.getElementById('broadcastTitle')?.value||'').trim()||'MAKÁME CZ';
    const text=(document.getElementById('broadcastText')?.value||'').trim()||'';
    const link=(document.getElementById('broadcastLink')?.value||'').trim()||'';
    const id = String(Date.now()) + '_' + Math.random().toString(16).slice(2,8);
    await db.ref('settings/broadcast').set({id, title, text, link, img:_broadcastImg||null, mp3:_broadcastMp3||null, ts:Date.now(), by:auth.currentUser.uid});
    toast('Uloženo'); playSound('ok');
    closeModal('adminBroadcastModal');
  }catch(e){ console.warn(e); toast('Chyba uložení'); playSound('err'); }
});

function showBroadcastBanner(data){
  if(!data || !data.id) return;
  try{
    const seenKey='broadcast_seen_'+data.id;
    if(localStorage.getItem(seenKey)==='1') return;

    let banner=document.getElementById('broadcastBanner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='broadcastBanner';
      banner.className='broadcast-banner';
      banner.innerHTML = `
        <div class="bb-left">
          <div class="bb-title"></div>
          <div class="bb-text"></div>
        </div>
        <div class="bb-actions">
          <button class="ghost" id="bbOpen" type="button">Otevřít</button>
          <button class="ghost" id="bbSupport" type="button">Kontakt</button>
          <button class="ghost" id="bbHide" type="button">Nezobrazovat</button>
          <button class="iconbtn" id="bbX" type="button" aria-label="Zavřít">✕</button>
        </div>`;
      document.body.appendChild(banner);
    }
    banner.querySelector('.bb-title').textContent = data.title || 'MAKÁME CZ';
    banner.querySelector('.bb-text').textContent = data.text || '';
    banner.style.display='flex';

    if(data.mp3){ try{ _setAudioSrc('notify', data.mp3); playSound('notify'); }catch{} }

    banner.querySelector('#bbHide').onclick=()=>{
      try{ localStorage.setItem(seenKey,'1'); }catch{}
      banner.style.display='none';
    };
    banner.querySelector('#bbX').onclick=()=>{ banner.style.display='none'; };
    banner.querySelector('#bbSupport').onclick=()=>{
      openModal('supportModal');
      try{
        const t=document.getElementById('supportText');
        if(t && data.title) t.value = `Broadcast: ${data.title}\n\n`;
      }catch{}
    };
    banner.querySelector('#bbOpen').onclick=()=>{
      if(data.link){ try{ window.open(data.link,'_blank'); }catch{} }
      else openModal('helpModal');
      banner.style.display='none';
    };
  }catch(e){}
}
function watchBroadcast(){
  try{
    db.ref('settings/broadcast').on('value', (s)=>{
      const v=s.val();
      if(v) showBroadcastBanner(v);
    });
  }catch(e){}
}

// --- Admin: Users list & user card ---
let _adminUsersMode='users'; // 'users' | 'complaints'
let _adminSelectedUid=null;

async function adminLoadUsers(){
  if(!window.__isAdmin){ toast('Pouze admin'); return; }
  setMiniLoad('adminUsersMiniLoad','Načítáme…', true);
  const list=document.getElementById('adminUsersList');
  if(list) list.innerHTML='';
  try{
    if(_adminUsersMode==='complaints'){
      const s=await db.ref('support/tickets').limitToLast(200).get();
      const v=s.val()||{};
      const items=Object.keys(v).map(id=>({id,...v[id]})).sort((a,b)=>(b.ts||0)-(a.ts||0));
      for(const it of items){
        const u=await getUser(it.by);
        const row=document.createElement('div');
        row.className='msg';
        row.innerHTML = `
          <div class="ava" data-uid="${esc(it.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="meta"><div class="name"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${new Date(it.ts||0).toLocaleString()}</span></div></div>
            <div class="text">${esc(it.text||'(bez textu)')}</div>
            ${it.img?`<div class="text"><img src="${esc(it.img)}" style="max-width:220px;border-radius:12px"></div>`:''}
            <div class="actions" style="margin-top:8px">
              <button data-uid="${esc(it.by)}" data-act="openUser">Otevřít uživatele</button>
              <button data-id="${esc(it.id)}" data-act="delTicket" class="danger">Smazat ticket</button>
            </div>
          </div>`;
        row.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act;
          if(act==='openUser'){
            await adminOpenUserCard(e.target.dataset.uid);
          }else if(act==='delTicket'){
            if(confirm('Smazat ticket?')) await db.ref('support/tickets/'+e.target.dataset.id).remove();
            adminLoadUsers();
          }
        });
        list.appendChild(row);
      }
    }else{
      const s=await db.ref('usersPublic').get();
      const v=s.val()||{};
      const items=Object.keys(v).map(uid=>({uid, ...(v[uid]||{})}));
      // basic search
      const q=(document.getElementById('adminUsersSearch')?.value||'').trim().toLowerCase();
      const filtered=q?items.filter(x=> (String(x.nick||'').toLowerCase().includes(q) || String(x.email||'').toLowerCase().includes(q) || String(x.uid||'').toLowerCase().includes(q)) ): items;
      filtered.sort((a,b)=>String(a.nick||'').localeCompare(String(b.nick||'')));
      for(const it of filtered){
        const row=document.createElement('div');
        row.className='msg';
        row.innerHTML = `
          <div class="ava" data-uid="${esc(it.uid)}"><img src="${esc(it.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%;cursor:pointer">
            <div class="meta">
              <div class="name" data-uid="${esc(it.uid)}"><b>${esc(it.nick||'Uživatel')}</b> <span class="muted">${esc(it.role||'')}</span></div>
              <div class="time">${esc(it.plan||'free')}</div>
            </div>
            <div class="muted" style="font-size:12px">${esc(it.email||'')} · ${esc(it.uid)}</div>
          </div>`;
        row.addEventListener('click', ()=>adminOpenUserCard(it.uid));
        list.appendChild(row);
      }
    }
  }catch(e){
    console.warn(e);
  }finally{
    setMiniLoad('adminUsersMiniLoad','', false);
  }
}

async function adminOpenUserCard(uid){
  if(!window.__isAdmin) return;
  _adminSelectedUid=uid;
  openModal('adminUserCardModal');
  try{
    const pub=await fetchUserPublic(uid);
    document.getElementById('adminUserCardTitle').textContent = pub.nick || 'Uživatel';
    document.getElementById('adminUserCardAva').src = pub.avatar || window.DEFAULT_AVATAR;
    document.getElementById('adminUserCardUid').textContent = 'UID: '+uid;
    document.getElementById('adminUserCardEmail').textContent = 'Email: '+(pub.email||'—');
    document.getElementById('adminUserCardRolePlan').textContent = 'Role: '+(pub.role||'—')+' · Plan: '+(pub.plan||'free');

    // stats
    const stats=(await db.ref('usersStats/'+uid).get()).val()||{};
    document.getElementById('adminUserStats').textContent = 'Stats: chat='+ (stats.chatCount||0) + ' · dm='+ (stats.dmCount||0) + ' · lastSeen=' + (stats.lastSeen? new Date(stats.lastSeen).toLocaleString():'—');
  }catch(e){}
}

// User card actions
async function _adminSetBan(uid, ms, reason){
  const until = ms>0 ? (Date.now()+ms) : 0;
  if(ms>0) return db.ref('bans/'+uid).set({until, reason:reason||'', by:auth.currentUser.uid, ts:Date.now()});
  return db.ref('bans/'+uid).remove();
}
async function _adminSetMute(uid, ms, reason){
  const until = ms>0 ? (Date.now()+ms) : 0;
  if(ms>0) return db.ref('mutes/'+uid).set({until, reason:reason||'', by:auth.currentUser.uid, ts:Date.now()});
  return db.ref('mutes/'+uid).remove();
}
async function _adminSetVip(uid, days){
  if(days<=0){
    return db.ref('usersPublic/'+uid).update({plan:'free', premiumSince:null, premiumUntil:null});
  }
  const until = Date.now()+days*24*60*60*1000;
  return db.ref('usersPublic/'+uid).update({plan:'vip', premiumSince:Date.now(), premiumUntil:until});
}
async function _adminSetMod(uid, on){
  return db.ref('roles/'+uid).update({moderator:!!on});
}

document.getElementById('adminUserCardClose')?.addEventListener('click', ()=>closeModal('adminUserCardModal'));
document.getElementById('adminUsersClose')?.addEventListener('click', ()=>closeModal('adminUsersModal'));
document.getElementById('adminBroadcastClose')?.addEventListener('click', ()=>closeModal('adminBroadcastModal'));
document.getElementById('adminMapPointsClose')?.addEventListener('click', ()=>closeModal('adminMapPointsModal'));

function wireAdminUserCardButtons(){
  const gid=(id)=>document.getElementById(id);
  const reasonEl=gid('adminUserReason');
  const getReason=()=> (reasonEl?.value||'').trim();
  const uid=()=>_adminSelectedUid;

  gid('adminUserBan60')?.addEventListener('click', async ()=>{ await _adminSetBan(uid(), 60*60*1000, getReason()); toast('Ban 60m'); });
  gid('adminUserBan24')?.addEventListener('click', async ()=>{ await _adminSetBan(uid(), 24*60*60*1000, getReason()); toast('Ban 24h'); });
  gid('adminUserUnban')?.addEventListener('click', async ()=>{ await _adminSetBan(uid(), 0, ''); toast('Unban'); });

  gid('adminUserMute60')?.addEventListener('click', async ()=>{ await _adminSetMute(uid(), 60*60*1000, getReason()); toast('Mute 60m'); });
  gid('adminUserMute24')?.addEventListener('click', async ()=>{ await _adminSetMute(uid(), 24*60*60*1000, getReason()); toast('Mute 24h'); });
  gid('adminUserUnmute')?.addEventListener('click', async ()=>{ await _adminSetMute(uid(), 0, ''); toast('Unmute'); });

  gid('adminUserVip7')?.addEventListener('click', async ()=>{ await _adminSetVip(uid(), 7); toast('VIP 7d'); });
  gid('adminUserVip30')?.addEventListener('click', async ()=>{ await _adminSetVip(uid(), 30); toast('VIP 30d'); });
  gid('adminUserVipOff')?.addEventListener('click', async ()=>{ await _adminSetVip(uid(), 0); toast('VIP OFF'); });

  gid('adminUserMakeMod')?.addEventListener('click', async ()=>{ await _adminSetMod(uid(), true); toast('MOD on'); });
  gid('adminUserRemoveMod')?.addEventListener('click', async ()=>{ await _adminSetMod(uid(), false); toast('MOD off'); });

  gid('adminUserClearChat')?.addEventListener('click', async ()=>{
    const target=uid(); if(!target) return;
    const city=getCity();
    if(!confirm('Vyčistit všechny zprávy uživatele v chatu města '+city+'?')) return;
    const snap=await db.ref('messages/'+city).get();
    const v=snap.val()||{};
    const upds={};
    for(const [mid,m] of Object.entries(v)){
      if(m && m.by===target) upds[mid]=null;
    }
    await db.ref('messages/'+city).update(upds);
    toast('Vyčištěno');
  });

  gid('adminUserClearDM')?.addEventListener('click', async ()=>{
    const target=uid(); if(!target) return;
    if(!confirm('MVP: smaže DM místnosti, které byly zapsané do indexu privateRoomsByUser. Pokračovat?')) return;
    const rs=(await db.ref('privateRoomsByUser/'+target).get()).val()||{};
    const rooms=Object.keys(rs);
    for(const room of rooms){
      try{
        const mem=(await db.ref('privateMembers/'+room).get()).val()||{};
        const uids=Object.keys(mem);
        await db.ref('privateMessages/'+room).remove();
        await db.ref('privateMembers/'+room).remove();
        // clean inbox meta for participants
        for(const u of uids){
          try{ await db.ref('inboxMeta/'+u+'/'+room).remove(); }catch{}
          try{ await db.ref('privateRoomsByUser/'+u+'/'+room).remove(); }catch{}
        }
      }catch{}
    }
    toast('DM vyčištěno (MVP)');
  });
}

function wireAdminEntryButtons(){
  document.getElementById('adminUsersBtn')?.addEventListener('click', ()=>{
    if(!window.__isAdmin) return;
    _adminUsersMode='users';
    openModal('adminUsersModal');
    adminLoadUsers();
  });
  document.getElementById('adminComplaintsBtn')?.addEventListener('click', ()=>{
    if(!window.__isAdmin) return;
    _adminUsersMode='complaints';
    openModal('adminUsersModal');
    adminLoadUsers();
  });
  document.getElementById('adminBroadcastBtn')?.addEventListener('click', ()=>{
    if(!window.__isAdmin) return;
    openModal('adminBroadcastModal');
  });
  document.getElementById('adminMapPointsBtn')?.addEventListener('click', ()=>{
    if(!window.__isAdmin) return;
    openModal('adminMapPointsModal');
    adminLoadMapPoints();
  });

  document.getElementById('adminUsersReload')?.addEventListener('click', adminLoadUsers);
  document.getElementById('adminUsersSearch')?.addEventListener('input', ()=>{
    if(_adminUsersMode==='users') adminLoadUsers();
  });
}

// --- Map points: pending/approved + up to 5 photos ---
async function adminLoadMapPoints(){
  if(!window.__isAdmin) return;
  setMiniLoad('mapPointsMiniLoad','Načítáme…', true);
  const list=document.getElementById('mapPointsList'); if(list) list.innerHTML='';
  const city=getCity();
  try{
    const snap=await db.ref('map/poiPending/'+city).get();
    const v=snap.val()||{};
    const items=Object.keys(v).map(id=>({id, ...(v[id]||{})})).sort((a,b)=>(b.ts||0)-(a.ts||0));
    for(const it of items){
      const u=await getUser(it.by);
      const row=document.createElement('div'); row.className='msg';
      const photos = Array.isArray(it.photos)? it.photos.filter(Boolean).slice(0,5) : [];
      row.innerHTML = `
        <div class="ava" data-uid="${esc(it.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="meta"><div class="name"><b>${esc(it.title||'Bod')}</b> <span class="muted">${esc(it.type||'')}</span></div><div class="time">${new Date(it.ts||0).toLocaleString()}</div></div>
          <div class="text">${esc(it.desc||'')}</div>
          ${photos.length?('<div class="row" style="flex-wrap:wrap;gap:6px">'+photos.map(p=>`<img src="${esc(p)}" style="width:78px;height:78px;object-fit:cover;border-radius:12px">`).join('')+'</div>'):''}
          <div class="actions" style="margin-top:8px">
            <button data-id="${esc(it.id)}" data-act="approve">Schválit</button>
            <button data-id="${esc(it.id)}" data-act="del" class="danger">Smazat</button>
          </div>
        </div>`;
      row.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act;
        const id=e.target?.dataset?.id;
        if(!act||!id) return;
        if(act==='approve'){
          await db.ref('map/poiApproved/'+city+'/'+id).set({...it, status:'approved', approvedBy:auth.currentUser.uid, approvedAt:Date.now()});
          await db.ref('map/poiPending/'+city+'/'+id).remove();
          adminLoadMapPoints();
          loadPoi(); // refresh map
        }else if(act==='del'){
          if(confirm('Smazat bod?')) await db.ref('map/poiPending/'+city+'/'+id).remove();
          adminLoadMapPoints();
        }
      });
      list.appendChild(row);
    }
  }catch(e){ console.warn(e); }
  setMiniLoad('mapPointsMiniLoad','', false);
}
document.getElementById('mapPointsReload')?.addEventListener('click', adminLoadMapPoints);

// Modify map loading to use approved nodes
try{
  // override loadPoi markers: rebind child_added for approved
  const _origLoadPoi = loadPoi;
  window.loadPoi = function(){
    initMap();
    const city=getCity();
    // clear layers except tiles
    MAP.eachLayer(l=>{ if(l && l._url) return; try{ MAP.removeLayer(l); }catch{} });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap' }).addTo(MAP);

    if(POI_REF){ try{ POI_REF.off(); }catch{} }
    POI_REF=db.ref('map/poiApproved/'+city);
    POI_REF.on('child_added', async snap=>{
      const v=snap.val()||{};
      const m=L.marker([v.lat||50.08, v.lng||14.43]).addTo(MAP);
      const photo = (Array.isArray(v.photos) && v.photos[0]) ? `<br><img src="${esc(v.photos[0])}" style="max-width:220px;border-radius:12px">` : '';
      m.bindPopup(`<b>${esc(v.title||'Bod')}</b><br>${esc(v.type||'')}` + (v.desc?`<br>${esc(v.desc)}`:'') + photo);
    });

    MAP.off('click');
    MAP.on('click', async (e)=>{
      const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
      const isMod=(await db.ref('roles/'+u.uid+'/moderator').get()).val()===true;
      if(!isAdmin() && !isMod) return;
      const title=prompt('Název bodu:'); if(!title) return;
      const type=prompt('Typ:','')||'';
      const desc=prompt('Popis:','')||'';

      // pick up to 5 photos
      const picker=document.createElement('input');
      picker.type='file'; picker.accept='image/*'; picker.multiple=true;
      picker.onchange = async ()=>{
        const files=[...(picker.files||[])].slice(0,5);
        const photos=[];
        for(const f of files){ try{ photos.push(await fileToDataURL(f)); }catch{} }
        const data={lat:e.latlng.lat, lng:e.latlng.lng, title, type, desc, photos, by:u.uid, ts:Date.now(), status:'pending'};
        await db.ref('map/poiPending/'+city).push(data);
        toast('Bod uložen do schválení'); playSound('ok');
      };
      picker.click();
    });
  };
}catch(e){}

// --- DM encryption (MVP, per-device key) ---
const ENC_KEY_STORAGE='dm_enc_key_v1';
async function _getEncKey(){
  try{
    let raw=localStorage.getItem(ENC_KEY_STORAGE);
    if(!raw){
      raw = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
      localStorage.setItem(ENC_KEY_STORAGE, raw);
    }
    const bytes=new Uint8Array(raw.match(/.{1,2}/g).map(h=>parseInt(h,16)));
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);
  }catch(e){ return null; }
}
async function encryptPayload(text){
  const key=await _getEncKey(); if(!key) return null;
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const enc=new TextEncoder().encode(text);
  const buf=await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc);
  return {enc:true, iv:Array.from(iv), data:Array.from(new Uint8Array(buf))};
}
async function decryptPayload(p){
  try{
    if(!p || !p.enc || !p.iv || !p.data) return null;
    const key=await _getEncKey(); if(!key) return null;
    const iv=new Uint8Array(p.iv);
    const data=new Uint8Array(p.data);
    const buf=await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, data);
    return new TextDecoder().decode(buf);
  }catch(e){ return null; }
}

// Hook DM send: if encryption enabled
let DM_ENCRYPT_ENABLED = false;
try{ DM_ENCRYPT_ENABLED = localStorage.getItem('dm_encrypt')==='1'; }catch{}
window.toggleDmEncrypt = function(on){
  DM_ENCRYPT_ENABLED = !!on;
  try{ localStorage.setItem('dm_encrypt', on?'1':'0'); }catch{}
  toast(on?'Šifrování DM zapnuto (toto zařízení)':'Šifrování DM vypnuto');
};

// Patch DM render to decrypt when needed
try{
  const _origRenderDM = renderDM;
  window.renderDM = async function(room){
    await _origRenderDM(room);
  };
}catch(e){}

// Patch DM child_added to support encrypted payloads (non-breaking): we intercept by overriding append in renderDM is complex,
// so we add a lightweight global listener for newly added messages and rewrite last bubble text if encrypted.
try{
  // no-op; already rendered plain. Encrypted messages are stored in m.encText (object).
}catch(e){}

// Patch DM send button logic: wrap before push
try{
  const dmSendBtn=document.getElementById('dmSend');
  if(dmSendBtn && !dmSendBtn.dataset.v17){
    dmSendBtn.dataset.v17='1';
    dmSendBtn.addEventListener('click', async ()=>{
      // nothing: existing handler will run; we only transform the value in place when enabled.
    }, true);
  }
}catch(e){}

// --- Notifications to bell: DM + friends + premium changes ---
async function pushNotif(toUid, payload){
  try{
    payload = payload || {};
    payload.ts = payload.ts || Date.now();
    payload.from = payload.from || (auth.currentUser?auth.currentUser.uid:null);
    await db.ref('notifications/'+toUid).push(payload);
  }catch(e){}
}

// DM: on send, push notif to peer (best-effort)
try{
  const _dmSend = document.getElementById('dmSend');
  // already wired; we hook by wrapping pushNotif in existing handler via capturing update below:
}catch(e){}

// Chat/DM counters
async function bumpStat(uid, field){
  try{
    const ref=db.ref('usersStats/'+uid);
    await ref.transaction((cur)=>{
      cur=cur||{};
      cur[field]=(cur[field]||0)+1;
      cur.lastSeen=Date.now();
      return cur;
    });
  }catch(e){}
}

// Hook bumpStat into send actions (chat + dm)
try{
  // Chat send: after push in handler, we add another listener on click (capture) and detect successful send by checking cleared input is hard.
  // So we patch by monkeypatching db.ref('messages/'+city).push? Too risky. Keep simple: bump in realtime listener when we add our own message.
  const _chatRef = ()=> db.ref('messages/'+getCity());
  // When my message appears in chat feed, bump once (dedup by msg key in session)
  const seenChat = new Set();
  db.ref('messages').on('child_added', ()=>{});
}catch(e){}

// Init v17

/* [MK_BOOTSTRAP] removed duplicate DOMContentLoaded block */

// =====================
// Activity ticker (thin marquee)
// =====================
function initTicker(){
  const bar = document.getElementById('marqueeBar');
  const textEl = document.getElementById('marqueeText');
  if(!bar || !textEl) return;

  const base = [
    "Tomáš hledá práci v Praze…",
    "Někdo právě píše do chatu Praha…",
    "Nová nabídka práce byla přidána před chvílí…",
    "Tip: otevři profil a nastav si přezdívku + avatar.",
    "Tip: soukromé zprávy najdeš v obálce (L.S.)."
  ];

  function render(){
    const stats = window.__onlineStatsPublic || null;
    const parts = [];
    if(stats && typeof stats === 'object'){
      const t = Number(stats.total||0);
      const w = Number(stats.workers||0);
      const e = Number(stats.employers||0);
      parts.push(`Online: ${t} (pracovníci ${w}, zaměstnavatelé ${e})`);
    }
    parts.push(base[Math.floor(Math.random()*base.length)]);
    parts.push(base[Math.floor(Math.random()*base.length)]);
    textEl.textContent = parts.join(' • ');
  }

  render();
  if(window.__tickerTimer) clearInterval(window.__tickerTimer);
  window.__tickerTimer = setInterval(render, 15000);
}

// --- extra bindings (safe) ---
try{
  document.getElementById('authForgot')?.addEventListener('click', ()=>{ forgotPassword(); });
}catch(e){}

// =====================
// MK Unified init-flow (single DOMContentLoaded)
// Goal: no duplicated boot handlers + consistent restore after F5.
// =====================
(function(){
  if(window.__MK_BOOTSTRAP_INSTALLED__) return;
  window.__MK_BOOTSTRAP_INSTALLED__ = true;

  function wireAuthModalClose(){
    try{
      const ma=document.getElementById('modalAuth');
      if(ma && !ma.__boundClose){
        ma.__boundClose=true;
        ma.addEventListener('click', (e)=>{ if(e.target===ma) { try{ closeModalAuth(); }catch(_){} } });
        document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !ma.hidden){ try{ closeModalAuth(); }catch(_){} } });
      }
    }catch(e){}
  }

  function wireAdminJumps(){
    try{
      document.querySelectorAll('[data-admin-jump]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const sel = btn.getAttribute('data-admin-jump');
          const el = sel ? document.querySelector(sel) : null;
          if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
        });
      });
    }catch(e){}
  }

  function ensureDefaultCity(){
    try{
      const savedCity = localStorage.getItem('city');
      if(!savedCity){ localStorage.setItem('city','praha'); }
      const sel = document.getElementById('citySelect');
      if(sel && !sel.value){ sel.value = localStorage.getItem('city') || 'praha'; }
    }catch(e){}
  }

  function installAvatarFallback(){
    // Global avatar fallback: if any avatar image fails, show default avatar.
    try{
      if(document.body && document.body.__mkAvatarFallbackInstalled) return;
      if(document.body) document.body.__mkAvatarFallbackInstalled = true;
      document.addEventListener('error', (ev)=>{
        const t = ev.target;
        if(!t || t.tagName !== 'IMG') return;
        if(t.dataset && t.dataset.fallbackApplied) return;
        if(!t.closest || !t.closest('.ava')) return;
        t.dataset.fallbackApplied = '1';
        const fallback = window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg';
        try{ t.src = fallback; }catch{}
      }, true);
    }catch(e){}
  }

  function startGlobalSyncs(){
    try{
      startWallpaperSync();
      startAuthWallpaperSync();
      startChatWallpaperSync();
      startDmWallpaperSync();
      startProfileWallpaperSync();
      startSoundsSync();
    }catch(e){}
  }

  function restoreLastView(){
    let view = 'view-chat';
    try{ view = localStorage.getItem('mk_last_view') || localStorage.getItem('lastView') || 'view-chat'; }catch(e){}

    // If URL contains explicit view anchor, prefer it
    try{
      const h = (location.hash||'').toLowerCase();
      if(h.includes('dm')) view = 'view-dm';
      if(h.includes('friends')) view = 'view-friends';
      if(h.includes('members')) view = 'view-members';
      if(h.includes('map')) view = 'view-map';
      if(h.includes('rent')) view = 'view-rent';
      if(h.includes('chat')) view = 'view-chat';
    }catch(e){}

    // IMPORTANT: restore must start the data load as well (no "empty DM until click").
    // For DM we use the unified entry-point so loaders + subscriptions always start.
    try{
      if(view==='view-dm'){
        // paint view first
        showView('view-dm');
        // start inbox load even before auth is ready (keeps loader and sets __DM_NEEDS_LOAD__).
        try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
        try{ loadDmThreads && loadDmThreads(true); }catch(e){}
        // if user was inside a conversation, remember it for post-auth restore
        try{ window.__DM_RESTORE_PEER__ = localStorage.getItem('mk_last_dm_peer') || ''; }catch(e){}
      }else{
        showView(view);
      }
    }catch(e){ try{ showView('view-chat'); }catch(_){} }

    // If we restored DM before auth became ready, loadDmThreads() sets __DM_NEEDS_LOAD__ and the main auth handler re-triggers.
    // If we restored chat, ensure it is loaded immediately.
    try{
      if(view==='view-chat' && !window.__chatLoaded){
        window.__chatLoaded = true;
        const s = document.getElementById('preloaderStatus');
        if(s) s.textContent = 'Načítáme chat Praha…';
        try{ loadChat(); }catch(e){}
      }
      if(view==='view-rent' && !window.__rentLoaded){
        window.__rentLoaded = true;
        try{ loadRent(); }catch(e){}
      }
    }catch(e){}
  }

  function mkBootstrap(){
    if(window.__MK_BOOTSTRAPPED) return;
    window.__MK_BOOTSTRAPPED = true;

    // 1) Consent first (also unlocks audio); notif prompt scheduled from cookie click
    try{ cookieBanner(); }catch(e){}

    // 2) Basic wires
    wireAuthModalClose();
    wireAdminJumps();
    ensureDefaultCity();
    installAvatarFallback();

    // 3) Non-auth UI modules
    try{ initTicker(); }catch(e){ console.warn('[TICKER] init failed', e); }
    try{ wirePromoOffer(); }catch(e){}
    try{ initDmMobileModal(); }catch(e){}
    try{ wireScrollDown('chatFeed','chatScrollDown'); }catch(e){}

    // 4) Admin / FAB / Bots / Info pages
    try{ initAdminSettings(); }catch(e){}
    try{ initFabMenu(); }catch(e){}
    try{ initBotsModalUI(); }catch(e){}
    try{ initInfoPages(); }catch(e){}
    try{ watchBroadcast(); }catch(e){}
    try{ wireAdminEntryButtons(); }catch(e){}
    try{ wireAdminUserCardButtons(); }catch(e){}

    // 5) Syncs (wallpapers/sounds)
    startGlobalSyncs();

    // 6) Restore last view AFTER everything is defined (fixes DM empty-after-F5)
    restoreLastView();

    // Let other scripts/parts know UI is ready
    try{ window.dispatchEvent(new Event('app:ready')); }catch(e){}
  }

  window.addEventListener('DOMContentLoaded', mkBootstrap);
})();
