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
    // Turn the admin chips into real tabs (one visible card at a time).
    // We DO NOT remove any actions – we only hide/show sections.
    function showAdminCard(sel){
      const view = document.getElementById('view-admin');
      if(!view) return;

      const cards = view.querySelectorAll('.admin-card');
      cards.forEach(c=>{ c.style.display='none'; c.classList.remove('active'); });

      const card = sel ? view.querySelector(sel) : null;
      if(card){
        card.style.display='block';
        card.classList.add('active');
        try{ card.scrollIntoView({block:'start', behavior:'smooth'}); }catch(e){}
      }

      // Active chip highlight
      view.querySelectorAll('[data-admin-jump]').forEach(ch=>{
        ch.classList.toggle('active', ch.getAttribute('data-admin-jump')===sel);
      });

      try{ localStorage.setItem('mk_admin_tab', sel); }catch(e){}
    }

    // Wire chips
    try{
      document.querySelectorAll('[data-admin-jump]').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          const sel = btn.getAttribute('data-admin-jump');
          if(!sel) return;
          e.preventDefault();
          showAdminCard(sel);
        });
      });
    }catch(e){}

    // When admin view becomes active – open last tab (or default)
    window.addEventListener('view:changed', (e)=>{
      if(e && e.detail && e.detail.id==='view-admin'){
        let sel = null;
        try{ sel = localStorage.getItem('mk_admin_tab'); }catch(_){}
        showAdminCard(sel || '#adminUsersCard');
      }
    });

    // Expose for debugging
    window.showAdminCard = showAdminCard;
  }

  function ensureDefaultCity(){
    try{
      // Single Source of Truth: MK.state.city
      const mkCity = (window.MK && window.MK.state) ? String(window.MK.state.city||'').trim() : '';
      if(!mkCity){
        if(window.MK && window.MK.persist && window.MK.persist.city) window.MK.persist.city('praha');
        else try{ localStorage.setItem('city','praha'); }catch(_){}
      }

      const sel = document.getElementById('citySelect');
      if(sel){
        const c = (window.MK && window.MK.state) ? String(window.MK.state.city||'praha') : (localStorage.getItem('city') || 'praha');
        if(!sel.value) sel.value = c;
        // keep MK in sync if user hard-refreshed with empty LS
        try{ if(window.MK && window.MK.persist && window.MK.persist.city) window.MK.persist.city(sel.value||c); }catch(e){}
      }
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
    // Default is ALWAYS Prague chat for a brand new visitor.
    // Only restore a different tab if we have an explicit saved value OR the URL hash asks for it.
    let view = 'view-chat';
    let hasSaved = false;
    try{
      const mv = (window.MK && window.MK.storage && window.MK.keys) ? String(window.MK.storage.get(window.MK.keys.lastView,'')||'').trim() : (localStorage.getItem('mk_last_view')||'').trim();
      const lv = (window.MK && window.MK.storage && window.MK.keys) ? String(window.MK.storage.get(window.MK.keys.lastViewLegacy,'')||'').trim() : (localStorage.getItem('lastView')||'').trim();
      hasSaved = !!(mv || lv);
      view = (window.MK && window.MK.state && window.MK.state.view) ? window.MK.state.view : (mv || lv || 'view-chat');
    }catch(e){}

    // If URL contains explicit view anchor, prefer it
    try{
      const h = (location.hash||'').toLowerCase();
      if(h.includes('dm')) view = 'view-dm';
      if(h.includes('friends')) view = 'view-friends';
      if(h.includes('members')) view = 'view-members';
      if(h.includes('map')) view = 'view-map';
      if(h.includes('rent')) view = 'view-rent';
      if(h.includes('chat')) view = 'view-chat';
      // NOTE: we intentionally do NOT support restoring "profile" from URL hash.
    }catch(e){}

    // Safety: never land on profile as the initial screen.
    // (It confused new users and also breaks expectations for "Prague chat first".)
    try{
      if(view==='view-profile' && !((location.hash||'').toLowerCase().includes('profile'))){
        view='view-chat';
      }
      // No saved view + no hash => always chat.
      if(!hasSaved && !(location.hash||'').trim()) view='view-chat';
    }catch(e){}

    // IMPORTANT: restore happens only AFTER auth-ready (see restoreLastViewAfterAuthReady).
    // Here we only switch the view (and let the per-view loaders kick in lazily).
    try{
      if(view==='view-dm'){
        try{ window.__RESTORING_VIEW__ = true; }catch(e){}
        showView('view-dm');
        try{ window.__RESTORING_VIEW__ = false; }catch(e){}
      }else{
        showView(view);
      }
    }catch(e){ try{ showView('view-chat'); }catch(_){} }

    // View-specific loaders are started lazily by showView().
  }

  // Strict restore pipeline:
  // auth-ready -> restoreLastView() -> (optional) restore DM room
  async function restoreLastViewAfterAuthReady(){
    try{
      // Wait until Firebase Auth is fully initialized (incl. redirect result).
      await (window.MK && window.MK.authReady ? window.MK.authReady : Promise.resolve());
    }catch(e){}

    // If the user is NOT logged in, do not auto-restore into auth-only views.
    // This prevents the classic "stuck DM after F5" scenario.
    try{
      const me = firebase.auth().currentUser;
      const pending = !!window.__PENDING_VIEW__;
      const saved = (window.MK && window.MK.state && window.MK.state.view) ? String(window.MK.state.view) : '';
      if(!me && !pending && (saved==='view-dm' || saved==='view-friends')){
        showView('view-chat');
        return;
      }
    }catch(e){}

    // If user explicitly clicked something (envelope/menu) before auth was ready,
    // that intent has priority over saved state.
    try{
      if(window.__PENDING_VIEW__){
        const v = window.__PENDING_VIEW__;
        window.__PENDING_VIEW__ = null;
        showView(v);
      }else{
        restoreLastView();
      }
    }catch(e){
      try{ showView('view-chat'); }catch(_e){}
    }

    // Restore last DM room only after auth-ready (and only if user is logged in).
    try{
      const me = firebase.auth().currentUser;
      if(!me) return;

      const active = document.querySelector('.view.active')?.id || '';
      if(active !== 'view-dm') return;

      const st = (typeof getDmState==='function') ? getDmState() : {mode:'list', peer:''};
      const peer = (st && st.mode==='thread') ? String(st.peer||'').trim() : '';
      if(peer){
        // Give the layout a moment to paint (mobile overlays etc).
        setTimeout(()=>{
          try{ openDMRoom && openDMRoom(me.uid, peer); }catch(e){}
        }, 180);
      }
    }catch(e){}
  }

  function mkBootstrap(){
    if(window.__MK_BOOTSTRAPPED) return;
    window.__MK_BOOTSTRAPPED = true;

    // Prevent mobile keyboard from popping on restore/reload
    try{ window.blurActiveElement && window.blurActiveElement(); }catch(e){}

    // 1) Consent first (also unlocks audio); notif prompt scheduled from cookie click
    try{ cookieBanner(); }catch(e){}

    // 2) Basic wires
    wireAuthModalClose();
    wireAdminJumps();
    ensureDefaultCity();
    installAvatarFallback();

    // 3) Non-auth UI modules
    // DM/view lifecycle persistence helpers
    try{
      if(!window.MK_DM_LIFECYCLE_WIRED){
        window.MK_DM_LIFECYCLE_WIRED = true;
        window.addEventListener('beforeunload', ()=>{
          try{
            const activeView = document.querySelector('.view.active')?.id;
            if(activeView){
              try{
                if(window.MK && window.MK.persist && window.MK.persist.view) window.MK.persist.view(activeView);
                else { localStorage.setItem('mk_last_view', activeView); localStorage.setItem('lastView', activeView); }
              }catch(e){ try{ localStorage.setItem('mk_last_view', activeView); localStorage.setItem('lastView', activeView); }catch(_){} }
            }
          }catch(e){}
        });
        window.addEventListener('pageshow', ()=>{
          try{
            const v = ((window.MK && window.MK.state && window.MK.state.view) ? window.MK.state.view : (localStorage.getItem('mk_last_view')||localStorage.getItem('lastView')||'')).trim();
            if(v==='view-dm' && document.getElementById('view-dm')?.classList.contains('active')){
              setTimeout(()=>{ try{ ensureDMInboxLoaded && ensureDMInboxLoaded('pageshow'); }catch(e){} }, 250);
            }
          }catch(e){}
        });
      }
    }catch(e){}

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

    // 6) Restore last view strictly AFTER auth-ready (prevents broken DM after F5)
    restoreLastViewAfterAuthReady();

    // Let other scripts/parts know UI is ready
    try{ window.dispatchEvent(new Event('app:ready')); }catch(e){}
  }

  window.addEventListener('DOMContentLoaded', mkBootstrap);
})();
