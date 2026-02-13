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

    // IMPORTANT: restore must start the data load as well (no "empty DM until click").
    // For DM we use the unified entry-point so loaders + subscriptions always start.
    try{
      if(view==='view-dm'){
        // paint view first
        try{ window.__RESTORING_VIEW__ = true; }catch(e){}
        showView('view-dm');
        try{ window.__RESTORING_VIEW__ = false; }catch(e){}
        // start inbox load even before auth is ready (keeps loader and sets __DM_NEEDS_LOAD__).
        try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
        try{ if(window.loadDmThreads) window.loadDmThreads(true); }catch(e){}
        // if user was inside a conversation, remember it for post-auth restore
        try{
          const st = getDmState();
          window.__DM_RESTORE_PEER__ = (st.mode==='thread' && st.peer) ? st.peer : '';
        }catch(e){ window.__DM_RESTORE_PEER__=''; }
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
    try{ initAdminPanelUX(); }catch(e){}

    // 5) Syncs (wallpapers/sounds)
    startGlobalSyncs();

    // 6) Restore last view is deliberately delayed until auth becomes ready.
    // Doing it here (before authReady) can create duplicate listeners and the
    // classic "DM opens empty until second click" issue.
    try{ window.__RESTORE_REQUESTED__ = true; }catch(e){}

    // Let other scripts/parts know UI is ready
    try{ window.dispatchEvent(new Event('app:ready')); }catch(e){}
  }

  window.addEventListener('DOMContentLoaded', mkBootstrap);
})();
