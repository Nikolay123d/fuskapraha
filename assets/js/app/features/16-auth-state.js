/*
  Auth state manager (single source of truth)
  - Fires auth:ready once
  - Runs restore ONLY after auth is ready (prevents duplicate listeners + empty DM after F5)
  - Starts only lightweight global watchers (badges)
  - Heavy subscriptions are started by the router when a tab/modal is actually opened
*/

(function initAuthState(){
  let lastUserUid = null;
  let offRoles = null;
  let offPublic = null;

  // --- Topbar/profile + roles watchers (single source of truth) ---
  function renderTopBar(profile, roles){
    profile = profile || {};
    roles = roles || {};
    const ava = safeImgSrc(profile.avatar || window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg', window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg');
    try{
      const img = document.getElementById('meMiniAva');
      if(img) img.src = ava;
    }catch(e){}

    // Plan badge
    try{
      const plan = String(profile.plan || 'free').toLowerCase();
      const planEl = document.getElementById('topPlanBadge');
      if(planEl){
        if(plan && plan !== 'free'){
          planEl.textContent = plan.toUpperCase();
          planEl.style.display = 'inline-block';
        }else{
          planEl.style.display = 'none';
        }
      }
    }catch(e){}

    // Admin/mod badge
    try{
      const isAdmin = roles.admin === true;
      const isMod = roles.moderator === true;
      const badge = document.getElementById('topAdminBadge');
      if(badge){
        if(isAdmin){ badge.textContent = 'ADMIN'; badge.style.display='inline-block'; }
        else if(isMod){ badge.textContent = 'MOD'; badge.style.display='inline-block'; }
        else{ badge.style.display='none'; }
      }
      document.body.classList.toggle('is-admin', isAdmin);
      document.body.classList.toggle('is-mod', isMod);
      // Compatibility flag
      try{ window.__isAdmin = !!(isAdmin || isMod); }catch(_e){}
    }catch(e){}
  }

  function watchMyPublic(uid){
    // global watcher – must never be cleared by tab unsubscribe
    try{ window.MK?.subs?.clear && window.MK.subs.clear('global:myPublic'); }catch(e){}
    try{ offPublic && offPublic(); }catch(e){}
    offPublic = null;
    try{ window.__myPublic = null; }catch(e){}
    if(!uid) return;
    try{
      const ref = db.ref('usersPublic/'+uid);
      const cb = (snap)=>{
        const v = snap.val() || {};
        try{ window.__myPublic = v; }catch(e){}
        try{ window.dispatchEvent(new CustomEvent('myPublic:changed', {detail:v||{}})); }catch(e){}
        try{ window.renderFabMenu && window.renderFabMenu(); }catch(e){}
        renderTopBar(v, (window.__myRoles||{}));
      };
      ref.on('value', cb);
      offPublic = ()=>ref.off('value', cb);
      try{ window.MK?.subs?.set && window.MK.subs.set('global:myPublic', offPublic, 'global'); }catch(e){}
    }catch(e){}
  }

  function watchMyRoles(uid){
    // global watcher – must never be cleared by tab unsubscribe
    try{ window.MK?.subs?.clear && window.MK.subs.clear('global:myRoles'); }catch(e){}
    try{ offRoles && offRoles(); }catch(e){}
    offRoles = null;
    try{ window.__myRoles = {admin:false, moderator:false}; }catch(e){}
    if(!uid){
      renderTopBar(window.__myPublic||{}, window.__myRoles||{});
      return;
    }
    try{
      const ref = db.ref('roles/'+uid);
      const cb = (snap)=>{
        const v = snap.val() || {};

        // Roles bootstrap via UID allowlist was removed.
        // Source of truth: /roles/{uid} is managed by admins only.

        const roles = {
          admin: v && v.admin === true,
          moderator: v && v.moderator === true
        };
        try{ window.__myRoles = roles; }catch(e){}
        try{ window.dispatchEvent(new CustomEvent('myRoles:changed', {detail:roles||{}})); }catch(e){}
        try{ window.renderFabMenu && window.renderFabMenu(); }catch(e){}
        renderTopBar(window.__myPublic||{}, roles);
      };
      ref.on('value', cb);
      offRoles = ()=>ref.off('value', cb);
      try{ window.MK?.subs?.set && window.MK.subs.set('global:myRoles', offRoles, 'global'); }catch(e){}
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
      try{ document.body.classList.toggle('is-auth', !!isIn); }catch(e){}

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
        // Always show profile button; if not signed in it opens auth modal.
        meBtn.removeAttribute('hidden');
        try{ meBtn.classList.toggle('needs-auth', !isIn); }catch(e){}
        if(!isIn){
          // Reset to safe defaults while logged out (prevents blank topbar on slow auth init)
          try{
            const ava=document.getElementById('meMiniAva');
            if(ava) ava.src = safeImgSrc(window.DEFAULT_AVATAR, window.DEFAULT_AVATAR);
          }catch(e){}
          try{ const b=document.getElementById('topPlanBadge'); if(b) b.style.display='none'; }catch(e){}
          try{ const b=document.getElementById('topAdminBadge'); if(b) b.style.display='none'; }catch(e){}
        }
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
        const peer = pendingDmPeer || window.MK?.state?.dmPeer || localStorage.getItem('mk_last_dm_peer') || '';
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
        try{ offRoles && offRoles(); }catch(e){}
        offRoles = null;
        try{ offPublic && offPublic(); }catch(e){}
        offPublic = null;
        try{ window.__myPublic = null; }catch(e){}
        try{ window.__myRoles = {admin:false, moderator:false}; }catch(e){}
        try{ renderTopBar({}, {admin:false, moderator:false}); }catch(e){}
        try{ stopDmThreadsLive && stopDmThreadsLive(); }catch(e){}
        try{ stopDmInboxLive && stopDmInboxLive(); }catch(e){}
        try{ stopDmRequestsLive && stopDmRequestsLive(); }catch(e){}
        try{ watchDmUnread && watchDmUnread(null); }catch(e){}
        try{ watchDmRequestsUnread && watchDmRequestsUnread(null); }catch(e){}
        try{ watchNotificationsUnread && watchNotificationsUnread(null); }catch(e){}
        try{ watchFriendRequestsBadge && watchFriendRequestsBadge(null); }catch(e){}
        try{ if(typeof watchMyPlan === 'function') watchMyPlan(null); }catch(e){}
      }
      lastUserUid = uid;

      if(!u){
        updateDrawerForAuth(false);
        try{ watchMyPublic(null); }catch(e){}
        try{ watchMyRoles(null); }catch(e){}
        try{ window.__isAdmin = false; }catch(e){}
        try{ document.body.classList.remove('is-admin','is-mod'); }catch(e){}
        try{
          const img = document.getElementById('meMiniAva');
          if(img) img.src = window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg';
          const b1=document.getElementById('topAdminBadge'); if(b1) b1.style.display='none';
          const b2=document.getElementById('topPlanBadge'); if(b2) b2.style.display='none';
        }catch(e){}

        // stop badge watchers
        try{ watchDmUnread && watchDmUnread(null); }catch(e){}
        try{ watchDmRequestsUnread && watchDmRequestsUnread(null); }catch(e){}
        try{ watchNotificationsUnread && watchNotificationsUnread(null); }catch(e){}
        try{ watchFriendRequestsBadge && watchFriendRequestsBadge(null); }catch(e){}
        try{ stopDmRequestsLive && stopDmRequestsLive(); }catch(e){}
        try{ if(typeof watchMyPlan === 'function') watchMyPlan(null); }catch(e){}
        try{ stopDmThreadsLive && stopDmThreadsLive(); }catch(e){}
        try{ stopDmInboxLive && stopDmInboxLive(); }catch(e){}
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

      // Header/profile watchers (global; not tied to tabs)
      try{ watchMyPublic(u.uid); }catch(e){}
      try{ watchMyRoles(u.uid); }catch(e){}

      // Plan watcher (Stage5) - updates UI + cached plan variables
      try{ if(typeof watchMyPlan === 'function') watchMyPlan(u.uid); }catch(e){}

      // Autoposting engine (client-side scheduler)
      try{ if(window.startAutopostEngine) startAutopostEngine(u.uid); }catch(e){}

      // Lightweight analytics: lastSeen + streak (admin-only visibility)
      try{ window.MK_stats_touch && MK_stats_touch('login'); }catch(e){}

      // Lightweight global badge watchers
      try{ watchDmUnread && watchDmUnread(u.uid); }catch(e){}
      try{ watchDmRequestsUnread && watchDmRequestsUnread(u.uid); }catch(e){}
      try{ watchNotificationsUnread && watchNotificationsUnread(u.uid); }catch(e){}
      try{ watchFriendRequestsBadge && watchFriendRequestsBadge(u.uid); }catch(e){}

      // Restore view/modal after auth is ready
      try{ await runRestoreOnce(u); }catch(e){}
    });
  }

  bind();
})();
