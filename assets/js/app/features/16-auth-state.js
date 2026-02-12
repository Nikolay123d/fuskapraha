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

function watchAdminRole(user){
  // detach previous listener
  try{
    if(_roleRef && _roleHandler){ _roleRef.off('value', _roleHandler); }
  }catch{}
  _roleRef = null;
  _roleHandler = null;

  if(!user){
    _setAdminUI(false, null);
    return;
  }

  // immediate optimistic state from lists (so admin UI is available even if rules block /roles read)
  const listIsAdmin = _adminByLists(user);
  _setAdminUI(listIsAdmin, user);

  // role-based override (preferred)
  try{
    _roleRef = db.ref('roles/'+user.uid+'/admin');
    _roleHandler = (snap)=>{
      const roleIsAdmin = (snap.val() === true);
      _setAdminUI(roleIsAdmin || listIsAdmin, user);
    };
    _roleRef.on('value', _roleHandler);
  }catch(e){
    // keep list-based admin if /roles cannot be read
  }
}

auth.onAuthStateChanged(async (u)=>{
  try{ window.__AUTH_READY__ = true; window.__AUTH_USER__ = u||null; }catch(e){}

  // Wait for redirect result processing (exactly once) before reacting to auth state  try{ await (window.__AUTH_REDIRECT_PROMISE__||Promise.resolve()); }catch(e){}


  try{ if(u) await ensureUserPublic(u); }catch{}
  try{ if(u) await enforceVerifyWindow(u); }catch{}
  // admin-only visibility (role-based)
  watchAdminRole(u);
  try{ if(u && isAdminUser(u)) wireAdminQuickCams(); }catch(e){}
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
        showView(v);
      }
    }catch(e){}

    // If DM view is already open (e.g. user clicked envelope very early), refresh
    // the inbox now that auth is available.
    try{
      const activeId = ((window.MK && window.MK.state && window.MK.state.view) ? window.MK.state.view : (localStorage.getItem('mk_last_view')||localStorage.getItem('lastView')||'view-chat'));

      // v10: if DM tried to load before auth (reload case), force-load now.
      try{
        if(window.__DM_NEEDS_LOAD__){
          window.__DM_NEEDS_LOAD__ = false;
          try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
          try{ ensureDMInboxLoaded && ensureDMInboxLoaded('auth'); }catch(e){}
        }
      }catch(e){}
      // Make sure the active view really loads after reload (auth becomes ready later).
      if(activeId==='view-dm' || document.getElementById('view-dm')?.classList.contains('active')){
        try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
        try{ if(window.loadDmThreads) window.loadDmThreads(true); }catch(e){}

        // HARD RETRY: some devices fire auth before the DM DOM is fully painted.
        // This guarantees that after F5 / hash #dm / envelope navigation, the inbox loads without needing a second click.
        try{
          const __dmRetry = ()=>{
            try{
              const isDmHash = ((location.hash||'').toLowerCase().includes('dm'));
              const isDmActive = document.getElementById('view-dm')?.classList.contains('active');
              if(isDmHash || isDmActive || window.__DM_NEEDS_LOAD__){
                window.__DM_NEEDS_LOAD__ = false;
                try{ ensureDMInboxLoaded && ensureDMInboxLoaded('auth-retry'); }catch(e){}
                try{ if(window.loadDmThreads) window.loadDmThreads(true); }catch(e){}
              }
            }catch(e){}
          };
          setTimeout(__dmRetry, 0);
          setTimeout(__dmRetry, 350);
          setTimeout(__dmRetry, 950);
        }catch(e){}

        // Restore the exact DM room (if user was inside a conversation before F5).
        try{
          const st = (typeof getDmState==='function') ? getDmState() : {mode:'list', peer:''};
          const peer = ((st.mode==='thread' && st.peer) ? st.peer : (window.__DM_RESTORE_PEER__||'')).trim();
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
      // Restore last active tab after reload (only one tab, keeps lazy loading)
      // NOTE: restoreAfterReload disabled: restoreLastView already restores the correct view,
      // and a second restore here could override DM room restore or force a wrong tab.
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



