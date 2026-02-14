/*
  Auth state manager (single source of truth)
  - Fires auth:ready once
  - Runs restore ONLY after auth is ready (prevents duplicate listeners + empty DM after F5)
  - Starts only lightweight global watchers (badges)
  - Heavy subscriptions are started by the router when a tab/modal is actually opened
*/

(function initAuthState(){
  let lastUserUid = null;
  let offRole = null;
  let offMePublic = null;

  // Cached header state
  let __meProfile = null;
  let __meRoles = null;

  // --- Header watchers (SINGLE source of truth) ---
  // usersPublic/{uid} -> nick, avatar, plan
  // roles/{uid} -> admin, moderator
  // NEVER take role/avatar from chat messages or localStorage.
  function renderTopBar(profile, roles){
    try{
      const p = profile || {};
      const r = roles || {};

      const ava = (p.avatar && String(p.avatar).trim())
        ? String(p.avatar).trim()
        : (window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg');

      // Mini avatar in the topbar
      const mini = document.getElementById('meMiniAva');
      if(mini && mini.getAttribute('src') !== ava) mini.src = ava;

      // Profile view header
      const myAva = document.getElementById('myAvatar');
      if(myAva && myAva.getAttribute('src') !== ava) myAva.src = ava;

      const myName = document.getElementById('myName');
      if(myName) myName.textContent = p.nick || p.name || 'Uživatel';

      // Plan badge (profile view)
      // Avoid showing expired Premium just because `plan` string is still present.
      const now = Date.now();
      const plan = String(p.plan||'').toLowerCase();
      const until = Number(p.planUntil || 0);
      const active = !!plan && (until === 0 || !until || until >= now);
      const isPaid = active && !['free','none','0','basic'].includes(plan);
      const planEl = document.getElementById('myPlan');
      if(planEl){
        if(isPaid){
          planEl.style.display = '';
          let label = 'PREMIUM';
          if(plan === 'vip') label = 'VIP';
          else if(plan === 'premiumplus' || plan === 'premium_plus' || plan === 'premium+') label = 'PREMIUM+';
          planEl.textContent = label;
        }else{
          planEl.style.display = 'none';
        }
      }

      // Admin badge (profile view)
      const isAdmin = !!(r.admin || r.moderator);
      const admEl = document.getElementById('myAdmin');
      if(admEl) admEl.style.display = isAdmin ? '' : 'none';

      // Visual markers on topbar avatar button
      const btnMe = document.getElementById('btnMe');
      if(btnMe){
        btnMe.classList.toggle('is-admin', isAdmin);
        btnMe.classList.toggle('is-premium', isPaid);
      }
    }catch(e){}
  }

  function _applyRoles(nextRoles){
    __meRoles = nextRoles || {};
    const isAdmin = !!(__meRoles.admin || __meRoles.moderator);

    try{ window.__isAdmin = isAdmin; }catch(e){}
    try{ window.__isMod = !!__meRoles.moderator; }catch(e){}

    // CSS gate for admin-only blocks (drawer/admin view)
    try{ document.body.classList.toggle('is-admin', isAdmin); }catch(e){}

    // Optional explicit drawer admin toggle (if id exists)
    try{
      const a = document.getElementById('drawerAdmin');
      if(a){
        if(isAdmin) a.removeAttribute('hidden');
        else a.setAttribute('hidden','');
      }
    }catch(e){}

    renderTopBar(__meProfile, __meRoles);
  }

  function _applyProfile(nextProfile){
    __meProfile = nextProfile || {};
    renderTopBar(__meProfile, __meRoles);
  }

  // --- Roles watcher (admin/moderator) ---
  async function watchAdminRole(uid){
    // Unified registry (global)
    try{ window.MK?.subs?.off('global', 'roles'); }catch(e){}
    try{ offRole && offRole(); }catch(e){}
    offRole = null;

    // Reset role flags immediately
    try{ window.__isAdmin = false; }catch(e){}
    try{ window.__isMod = false; }catch(e){}
    try{ document.body.classList.remove('is-admin'); }catch(e){}
    _applyRoles(null);

    if(!uid) return;

    try{
      const ref = db.ref('roles/'+uid);
      const cb = (snap)=>{
        const v = snap.val() || {};
        _applyRoles({
          admin: v.admin === true,
          moderator: (v.moderator === true) || (v.mod === true)
        });
      };
      ref.on('value', cb);
      offRole = ()=>ref.off('value', cb);

      // Register unified global off
      try{ window.MK?.subs?.set('global', 'roles', offRole); }catch(e){}
    }catch(e){}
  }

  // --- Public profile watcher (nick/avatar/plan) ---
  async function watchMyPublic(uid){
    // Unified registry (global)
    try{ window.MK?.subs?.off('global', 'usersPublicMe'); }catch(e){}
    try{ offMePublic && offMePublic(); }catch(e){}
    offMePublic = null;
    _applyProfile(null);

    if(!uid) return;

    try{
      const ref = db.ref('usersPublic/'+uid);
      const cb = (snap)=>{ _applyProfile(snap.val()||{}); };
      ref.on('value', cb);
      offMePublic = ()=>ref.off('value', cb);

      // Register unified global off
      try{ window.MK?.subs?.set('global', 'usersPublicMe', offMePublic); }catch(e){}
    }catch(e){}
  }

  // --- Verification window gating (kept from legacy) ---
  async function enforceVerifyWindow(user){
    try{
      if(!user) return;
      const ddl = getVerifyDeadline(user.uid);
      if(!ddl) return;
      const nowTs = Date.now();
      if(nowTs > ddl){
        toast('Ověření vypršelo. Prosím ověřte účet.');
        try{ openModalAuth && openModalAuth('verify'); }catch(e){}
      }
    }catch(e){}
  }

  function updateDrawerForAuth(isIn){
    try{
      const loginBtn = document.getElementById('btnLoginDrawer');
      const signoutBtn = document.getElementById('btnSignoutDrawer');
      const meBtn = document.getElementById('btnMe');
      if(loginBtn){
        if(isIn) loginBtn.setAttribute('hidden','');
        else loginBtn.removeAttribute('hidden');
      }
      if(signoutBtn){
        if(isIn) signoutBtn.removeAttribute('hidden');
        else signoutBtn.setAttribute('hidden','');
      }
      if(meBtn){
        if(isIn) meBtn.removeAttribute('hidden');
        else meBtn.setAttribute('hidden','');
      }
    }catch(e){}
  }

  async function runRestoreOnce(user){
    if(window.__BOOT_RESTORE_DONE__) return;

    // Restore is requested by bootstrap OR there is a pending navigation intent
    const hasIntent = !!(window.__RESTORE_REQUESTED__ || window.__PENDING_VIEW__ || window.__PENDING_DM_PEER__ || window.__PENDING_BELL_OPEN__);
    if(!hasIntent) return;

    window.__BOOT_RESTORE_DONE__ = true;

    const doRestore = async ()=>{
      try{ window.__RESTORING_VIEW__ = true; }catch(e){}

      // Restore city (after auth-ready by requirement)
      try{
        const city = window.MK?.state?.city || localStorage.getItem('mk_city') || localStorage.getItem('city') || '';
        if(city){
          try{ const sel = document.getElementById('citySelect'); if(sel) sel.value = city; }catch(e){}
          try{ setCity && setCity(city); }catch(e){}
        }
      }catch(e){}

      // Pending overrides (user clicked before auth ready)
      const pendingView = window.__PENDING_VIEW__ || '';
      const pendingDmPeer = window.__PENDING_DM_PEER__ || '';
      const pendingBell = !!window.__PENDING_BELL_OPEN__;

      try{ window.__PENDING_VIEW__ = null; }catch(e){}
      try{ window.__PENDING_DM_PEER__ = null; }catch(e){}
      try{ window.__PENDING_BELL_OPEN__ = false; }catch(e){}

      // Hash deep-link (optional)
      const hash = (location.hash||'').replace('#','');
      const hashMap = {
        chat: 'view-chat',
        dm: 'view-dm',
        friends: 'view-friends',
        members: 'view-members',
        rent: 'view-rent',
        map: 'view-map',
        profile: 'view-profile',
        admin: 'view-admin',
        bell: '__bell__'
      };

      let desired = '';
      if(hash && hashMap[hash]) desired = hashMap[hash];

      // Pending intent has priority over storage (but hash is still respected if explicit)
      if(pendingView) desired = pendingView;

      // Storage fallback
      if(!desired){
        const tab = window.MK?.state?.tab || localStorage.getItem('mk_last_tab') || '';
        if(tab === 'bell') desired = '__bell__';
        else if(tab) desired = 'view-' + tab;
      }
      if(!desired){
        const view = window.MK?.state?.view || localStorage.getItem('mk_last_view') || '';
        if(view) desired = view;
      }
      if(!desired) desired = 'view-chat';

      // Bell is a modal layered over an underlying view
      let openBell = false;
      if(desired === '__bell__'){
        openBell = true;
        desired = window.MK?.state?.view || localStorage.getItem('mk_last_view') || 'view-chat';
      }
      if(pendingBell) openBell = true;

      // Validate view exists
      if(desired && !document.getElementById(desired)) desired = 'view-chat';

      // Auth gating for private views
      const needsAuth = ['view-dm','view-friends','view-members','view-profile','view-admin'].includes(desired);
      if(needsAuth && !user) desired = 'view-chat';

      // Navigate
      if(desired === 'view-dm' && user){
        // IMPORTANT: after F5 we restore only the DM tab (inbox list), not the last open thread.
        // Thread restore is allowed only for an explicit pending intent (user clicked a profile/DM button).
        const peer = pendingDmPeer || '';
        if(peer){
          try{ await openDM(peer); }
          catch(e){
            console.warn('restore openDM failed', e);
            try{ await openDMInbox(false); }catch(_e){}
          }
        }else{
          try{ await openDMInbox(false); }catch(e){ console.warn(e); }
        }
      }else{
        try{ showView(desired, {forceEnter:true}); }catch(e){ console.warn(e); }
      }

      // Open bell modal after view restore (if requested)
      if(openBell){
        if(user){
          try{ window.MK?.persist?.tab?.('bell'); }catch(e){}
          try{ openModal && openModal('modalNotif'); }catch(e){}
          try{ await markNotificationsRead?.(); }catch(e){}
          try{ await loadNotificationsFeed?.(100); }catch(e){}
        }else{
          try{ openModalAuth && openModalAuth('login'); }catch(e){}
        }
      }

      try{ window.__RESTORE_REQUESTED__ = false; }catch(e){}
      try{ setTimeout(()=>{ window.__RESTORING_VIEW__ = false; }, 0); }catch(e){}
    };

    if(window.__MK_BOOTSTRAPPED){
      doRestore();
    }else{
      window.addEventListener('app:ready', ()=>doRestore(), {once:true});
    }
  }

  async function bind(){
    // Wait for redirect processing (Google auth) from 06-notifications.js
    try{ await (window.__AUTH_REDIRECT_PROMISE__||Promise.resolve()); }catch(e){}

    auth.onAuthStateChanged(async (u)=>{
      // mark auth ready
      try{ window.__AUTH_READY__ = true; }catch(e){}
      try{ window.__AUTH_USER__ = u || null; }catch(e){}

      // Fire a lightweight event on every auth change (modules can re-sync UI without adding their own auth listeners).
      try{
        const detail = u ? { uid: u.uid, email: u.email || null } : { uid: null, email: null };
        window.dispatchEvent(new CustomEvent('auth:state', { detail }));
      }catch(e){
        try{ window.dispatchEvent(new Event('auth:state')); }catch(_){}
      }

      // fire auth:ready once
      if(!window.__AUTH_READY_FIRED__){
        try{
          window.__AUTH_READY_FIRED__ = true;
          window.dispatchEvent(new CustomEvent('auth:ready', {detail:{user:u||null}}));
        }catch(e){
          try{
            window.__AUTH_READY_FIRED__ = true;
            window.dispatchEvent(new Event('auth:ready'));
          }catch(_e){}
        }
      }

      const uid = u ? u.uid : null;

      // cleanup if user changed
      if(lastUserUid && lastUserUid !== uid){
        try{ offRole && offRole(); }catch(e){}
        offRole = null;
        try{ offMePublic && offMePublic(); }catch(e){}
        offMePublic = null;
        try{ stopDmThreadsLive && stopDmThreadsLive(); }catch(e){}
        try{ watchDmUnread && watchDmUnread(null); }catch(e){}
        try{ watchNotificationsUnread && watchNotificationsUnread(null); }catch(e){}
        try{ watchFriendRequestsBadge && watchFriendRequestsBadge(null); }catch(e){}
        try{ watchDmRequestsBadge && watchDmRequestsBadge(null); }catch(e){}
        try{ watchPaymentsDecisionBadge && watchPaymentsDecisionBadge(null); }catch(e){}
        try{ if(typeof watchMyPlan === 'function') watchMyPlan(null); }catch(e){}
      }
      lastUserUid = uid;

      if(!u){
        updateDrawerForAuth(false);
        try{ window.__isAdmin = false; }catch(e){}
        try{ document.body.classList.remove('is-admin'); }catch(e){}
        try{ watchAdminRole && watchAdminRole(null); }catch(e){}
        try{ watchMyPublic && watchMyPublic(null); }catch(e){}

        // stop badge watchers
        try{ watchDmUnread && watchDmUnread(null); }catch(e){}
        try{ watchNotificationsUnread && watchNotificationsUnread(null); }catch(e){}
        try{ watchFriendRequestsBadge && watchFriendRequestsBadge(null); }catch(e){}
        try{ watchDmRequestsBadge && watchDmRequestsBadge(null); }catch(e){}
        try{ watchPaymentsDecisionBadge && watchPaymentsDecisionBadge(null); }catch(e){}
        try{ if(typeof watchMyPlan === 'function') watchMyPlan(null); }catch(e){}
        try{ stopDmThreadsLive && stopDmThreadsLive(); }catch(e){}
        try{ updateTopBadges && updateTopBadges(); }catch(e){}

        // if currently on a private view, bounce to chat
        try{
          const active = document.querySelector('.view.active')?.id || '';
          if(active==='view-dm' || active==='view-profile' || active==='view-admin'){
            showView('view-chat', {forceEnter:true});
          }
        }catch(e){}

        // run restore once (will resolve to chat)
        try{ await runRestoreOnce(null); }catch(e){}
        return;
      }

      // signed in
      updateDrawerForAuth(true);

      // Ensure public user record exists
      try{ await ensureMyPublic && ensureMyPublic(u); }catch(e){ console.warn('ensureMyPublic', e); }

      // Optional verification window gate
      try{ await enforceVerifyWindow(u); }catch(e){}

      // Presence
      try{ setupPresence && setupPresence(u.uid); }catch(e){}

      // Header (avatar/nick/plan)
      try{ await watchMyPublic(u.uid); }catch(e){}

      // Admin role
      try{ await watchAdminRole(u.uid); }catch(e){}

      // Plan watcher (Stage5) - updates UI + cached plan variables
      try{ if(typeof watchMyPlan === 'function') watchMyPlan(u.uid); }catch(e){}

      // Lightweight global badge watchers
      try{ watchDmUnread && watchDmUnread(u.uid); }catch(e){}
      try{ watchNotificationsUnread && watchNotificationsUnread(u.uid); }catch(e){}
      try{ watchFriendRequestsBadge && watchFriendRequestsBadge(u.uid); }catch(e){}
      try{ watchDmRequestsBadge && watchDmRequestsBadge(u.uid); }catch(e){}
      try{ watchPaymentsDecisionBadge && watchPaymentsDecisionBadge(u.uid); }catch(e){}

      // Restore view/modal after auth is ready
      try{ await runRestoreOnce(u); }catch(e){}
    });
  }

  bind();
})();
