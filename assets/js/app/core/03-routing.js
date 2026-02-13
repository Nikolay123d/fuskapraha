// === Push Notifications (FCM Web Push) ===
// For background notifications (when the tab is closed) you MUST:
// 1) Set the public VAPID key from Firebase Console -> Project settings -> Cloud Messaging -> Web configuration
// 2) Host over HTTPS (or localhost)
// 3) Deploy firebase-messaging-sw.js at the site root
window.WEB_PUSH_VAPID_KEY = window.WEB_PUSH_VAPID_KEY || 'BLag7sO2f6dIoVR6s4iAm7b_ohrxQNZ2QMIDTaFeA2dHi';
window.FCM_PUBLIC_VAPID_KEY = window.FCM_PUBLIC_VAPID_KEY || window.WEB_PUSH_VAPID_KEY;

// Cookie banner

function cookieBanner(){
  const b = $('#cookieBanner');
  if(!b) return;

  // IMPORTANT: The UI sets `body.modal-open #views { pointer-events:none }`.
  // If the cookie banner is inside #views, it becomes non-clickable.
  // Force-move it to document.body so it always receives pointer events.
  try{
    if(b.parentElement !== document.body){
      document.body.appendChild(b);
    }
    // Ensure maximum stacking order.
    b.style.zIndex = '2147483647';
    b.style.pointerEvents = 'auto';
  }catch(e){}

  // already decided
  const choice = localStorage.getItem('cookieChoice');
  if(choice==='all' || choice==='necessary' || choice==='reject'){
    try{ b.hidden = true; }catch(e){ b.style.display='none'; }
    return;
  }

  // show modal
  try{ b.hidden = false; }catch(e){ b.style.display='block'; }

  // guard: wire once
  if(b.dataset.wired==='1') return;
  b.dataset.wired='1';

  const close = ()=>{ try{ b.hidden = true; }catch(e){ b.style.display='none'; } };

  $('#cookieClose')?.addEventListener('click', close);

  const setChoice = async (val)=>{
    try{ localStorage.setItem('cookieChoice', val); }catch(e){}
    // keep a minimal consent cookie to avoid asking repeatedly
    try{ document.cookie = 'cookieChoice='+encodeURIComponent(val)+'; path=/; max-age=31536000'; }catch(e){}
    close();

    // Unlock audio on first real user gesture (cookie click counts)
    try{ await unlockAudio(); }catch(e){}

    // IMPORTANT: Notification.requestPermission() is often blocked unless it is
    // triggered by a direct user action. To avoid browsers silently blocking it,
    // we show a prompt after 30s with an explicit "Enable" button.
    try{ scheduleNotifPromptAfterConsent(30_000); }catch(e){}
  };

  $('#cookieAll')?.addEventListener('click', ()=>setChoice('all'));
  $('#cookieNecessary')?.addEventListener('click', ()=>setChoice('necessary'));
  $('#cookieReject')?.addEventListener('click', ()=>setChoice('reject'));
}



// First-time mini tour (one time per browser)
function maybeStartTour(){
  try{
    if(localStorage.getItem('tour_done')==='1') return;
    const m=document.getElementById('tourModal');
    if(!m) return;
    const steps=[
      {t:'Chat', x:'Tady je hlavní chat podle města. Nahoře si vyber město a piš hned.'},
      {t:'Osobní zprávy (DM)', x:'DM funguje jako v Telegramu. Otevři profil uživatele a dej “Napsat”.'},
      {t:'Privilegia', x:'V “Privilegia” si můžeš aktivovat Premium a vytvořit své vlastní boty.'},
      {t:'Upozornění', x:'Kolokolek ukazuje žádosti a novinky. Kliknutím přejdeš rovnou na akci.'}
    ];
    let i=0;
    const title=document.getElementById('tourTitle');
    const text=document.getElementById('tourText');
    const btnNext=document.getElementById('tourNext');
    const btnSkip=document.getElementById('tourSkip');
    const render=()=>{
      const s=steps[i]||steps[steps.length-1];
      if(title) title.textContent = s.t;
      if(text) text.textContent = s.x;
      if(btnNext) btnNext.textContent = (i>=steps.length-1)?'Hotovo':'Další';
    };
    const done=()=>{
      try{ localStorage.setItem('tour_done','1'); }catch(e){}
      try{ window.closeModal ? window.closeModal('tourModal') : (m.hidden=true); }catch(e){ m.hidden=true; }
    };
    btnSkip && (btnSkip.onclick=done);
    btnNext && (btnNext.onclick=()=>{ if(i>=steps.length-1) return done(); i++; render(); });
    render();
    try{ window.openModal ? window.openModal('tourModal') : (m.hidden=false); }catch(e){ m.hidden=false; }
  }catch(e){}
}

// Preferred API name (spec): openView/openModal
// We keep showView for legacy code, but route everything through one function.
window.openView = showView;
// Promo/announcement offer (shown only once per new ts)
function schedulePromoOffer(){
  try{
    const key='promo_seen_ts';
    const seen = +localStorage.getItem(key)||0;

    // New path: announcements/global {ts,title,text,img,sound,btnText,btnUrl}
    // Backward compatible: settings/promo {ts,title,text,img,sound}
    const tryPaths = ['announcements/global','settings/promo'];

    const tryNext = (i)=>{
      if(i>=tryPaths.length) return;
      db.ref(tryPaths[i]).get().then(s=>{
        const p=s.val();
        if(!p || !p.ts){ tryNext(i+1); return; }
        const ts=+p.ts||0;
        if(ts<=seen) return;

        // remember before showing to avoid loop on reload
        try{ localStorage.setItem(key, String(ts)); }catch(e){}

        // Prefer promoOverlay modal (exists in HTML)
        const overlay=document.getElementById('promoOverlay');
        if(overlay){
          const title = p.title || 'Oznámení';
          const text  = p.text  || '';
          const imgUrl = p.img || '';
          const soundUrl = p.sound || '';

          const headerB = overlay.querySelector('header b');
          if(headerB) headerB.textContent = title;

          const img = overlay.querySelector('.promo-img');
          if(img) img.src = imgUrl || img.getAttribute('src') || '';

          const h2 = overlay.querySelector('.promo-text h2');
          if(h2) h2.textContent = title;

          const muted = overlay.querySelector('.promo-text .muted');
          if(muted) muted.textContent = text;

          const buyBtn = document.getElementById('promoBuy');
          if(buyBtn){
            const bt = p.btnText || buyBtn.textContent || 'OK';
            buyBtn.textContent = bt;
            buyBtn.onclick = ()=>{
              closeModal('promoOverlay');
              if(p.btnUrl){ try{ window.open(p.btnUrl,'_blank','noopener'); }catch(e){} return; }
              // default: open premium modal if present
              const prem = document.getElementById('premiumOverlay');
              if(prem) openModal('premiumOverlay'); else toast(title);
            };
          }

          const laterBtn = document.getElementById('promoLater');
          if(laterBtn) laterBtn.onclick = ()=> closeModal('promoOverlay');

          const closeBtn = document.getElementById('promoClose');
          if(closeBtn) closeBtn.onclick = ()=> closeModal('promoOverlay');

          openModal('promoOverlay');
          if(soundUrl){ try{ playSoundUrl(soundUrl); }catch(e){} }
        }else{
          toast((p.title||'Oznámení')+': '+(p.text||''));
          if(p.sound){ try{ playSoundUrl(p.sound); }catch(e){} }
        }
      }).catch(()=>{ tryNext(i+1); });
    };

    tryNext(0);
  }catch(e){}
}



// Views
// Close any open overlays/modals when switching tabs (prevents "window on window")
// Close any open overlays/modals when switching tabs (prevents "window on window")
function __closeAllOverlays(){
  // Prefer unified overlay closer from config, but keep legacy safety net.
  try{ if(typeof closeAllOverlays==='function') closeAllOverlays({keep:null}); }catch(e){}
  try{ if(typeof modalRoot!="undefined" && modalRoot) modalRoot.innerHTML=""; }catch(e){}
  try{ document.querySelectorAll(".modal, .overlay, .sheet, .popup").forEach(el=>{ try{ el.hidden=true; }catch(e){} try{ el.classList.remove("open","show","active"); }catch(e){} }); }catch(e){}
  try{ document.body.classList.remove("modal-open"); }catch(e){}
  try{ document.body.classList.remove("dm-room-open"); }catch(e){}
  try{ document.activeElement && document.activeElement.blur && document.activeElement.blur(); }catch(e){}
  try{ if(window.MK && window.MK.state) window.MK.state.modal = null; }catch(e){}
}
window.closeAllModals = __closeAllOverlays;


// --- Routing hash helper (keeps DM path consistent between envelope/menu) ---
function setHashSafe(tag){
  try{
    const h = (location.hash||'').replace('#','').toLowerCase();
    const t = String(tag||'').toLowerCase();
    if(!t) return;
    if(h===t) return;
    const base = location.pathname + location.search;
    history.replaceState(null,'', base + '#' + t);
  }catch(e){}
}

function clearHashSafe(){
  try{
    const base = location.pathname + location.search;
    if((location.hash||'')==='') return;
    history.replaceState(null,'', base);
  }catch(e){}
}

// ---------------------------------------------------------------------------
// View lifecycle (lazy init + clean unsubscribe on leave)
// ---------------------------------------------------------------------------
// We keep a small, explicit "exit" hook for every heavy tab.
// The router calls it on every real tab switch so Firebase listeners do not
// multiply and background CPU/network stays flat.

// Current active view id (Single Source of Truth for lifecycle)
window.__MK_ACTIVE_VIEW__ = window.__MK_ACTIVE_VIEW__ || '';

function __exitView(viewId){
  const v = String(viewId||'').trim();
  if(!v) return;
  try{
    if(v==='view-chat')      { window.__chatUnsub?.(); }
    else if(v==='view-dm')   { window.__dmUnsub?.(); try{ window.stopDmThreadsLive?.(); }catch(e){} }
    else if(v==='view-friends'){ window.__friendsUnsub?.(); }
    else if(v==='view-members'){ window.__membersUnsub?.(); }
    else if(v==='view-map') { window.__mapUnsub?.(); }
    // rent/profile have no long-lived listeners in current MVP
  }catch(e){}
}

function unsubscribeAll(){
  try{
    const active = window.__MK_ACTIVE_VIEW__ || document.querySelector('.view.active')?.id || '';
    __exitView(active);
  }catch(e){}
}
window.unsubscribeAll = unsubscribeAll;


function showView(id, opts){
  opts = opts || {};
  id = String(id||'').trim();
  if(!id) id = 'view-chat';
  if(id && !id.startsWith('view-')) id = 'view-' + id;

  // Enter/exit lifecycle: detach previous tab listeners on REAL tab switches.
  const prev = window.__MK_ACTIVE_VIEW__ || document.querySelector('.view.active')?.id || '';
  const entering = prev !== id;
  if(entering){
    try{ unsubscribeAll(); }catch(e){}
    __closeAllOverlays();
    $$('.view').forEach(v=>v.classList.remove('active'));
  }else if(opts.forceCloseOverlays){
    try{ __closeAllOverlays(); }catch(e){}
  }

  const el = $('#'+id);
  if(el){
    el.classList.add('active');

    // Single Source of Truth: persist view/tab via MK.state (with legacy fallbacks)
    try{
      if(window.MK && window.MK.persist && window.MK.persist.view){
        window.MK.persist.view(id);
      }else{
        try{ localStorage.setItem('lastView', id); localStorage.setItem('mk_last_view', id); }catch(_){}
      }
    }catch(e){
      try{ localStorage.setItem('lastView', id); localStorage.setItem('mk_last_view', id); }catch(_){}
    }

    // Keep a quick-access tab alias for legacy code
    try{
      const tabNow = (window.MK && window.MK.state && window.MK.state.tab) ? window.MK.state.tab : id.replace('view-','');
      window.__ACTIVE_TAB__ = tabNow;
      if(window.MK && window.MK.persist && window.MK.persist.tab){
        window.MK.persist.tab(tabNow);
      }else{
        try{ localStorage.setItem('mk_last_tab', tabNow); }catch(_){}
      }
    }catch(e){}
  }

  // Update active view marker used by unsubscribeAll()
  try{ window.__MK_ACTIVE_VIEW__ = id; }catch(e){}
  // sync URL hash with active view (so refresh restores correctly)
  try{
    const tab = (id||'').replace('view-','');
    if(tab==='chat') clearHashSafe();
    else if(tab && tab!=='profile') setHashSafe(tab);
  }catch(e){}

  // keep tab highlight in sync
  try{ $$('.tab').forEach(t=>{ try{ t.classList.toggle('active', (t.dataset.view===id)); }catch(e){} }); }catch(e){}
  try{ if(id!=='view-chat') setMiniLoad('chatMiniLoad','', false); }catch(e){}


  // NOTE: DM list loading happens in the per-tab enter block below.

  // Lazy-load heavy modules per tab (prevents slow startup and "loops")
  window.__friendsLoaded = window.__friendsLoaded || false;
  window.__membersLoaded = window.__membersLoaded || false;
  window.__dmThreadsLoaded = window.__dmThreadsLoaded || false;
  window.__mapLoaded = window.__mapLoaded || false;

  try{
    if(id==='view-chat'){
      if(entering || opts.forceEnter || !window.__chatLoaded){
        window.__chatLoaded=true;
        try{ loadChat(); }catch{}
      }
      return;
    }
    if(id==='view-rent'){
      if(entering || opts.forceEnter || !window.__rentLoaded){
        window.__rentLoaded=true;
        try{ loadRent(); }catch{}
      }
      return;
    }
    if(id==='view-friends'){
      if(entering || opts.forceEnter || !window.__friendsLoaded){
        window.__friendsLoaded=true;
        try{ loadFriends(); }catch{}
      }
      return;
    }
    if(id==='view-members'){
      if(entering || opts.forceEnter || !window.__membersLoaded){
        window.__membersLoaded=true;
        try{ loadMembers(); }catch{}
      }
      return;
    }
    if(id==='view-dm'){
      if(entering || opts.forceEnter || !window.__dmThreadsLoaded){
        window.__dmThreadsLoaded = true;
        // DM threads list (inbox)
        // If user navigates to DM without selecting a thread, we are in LIST mode.
        // During restore-after-reload we keep the previously saved dmMode.
        try{ if(!opts.keepDmState && !window.__RESTORING_VIEW__) setDmState('list', null); }catch(e){}
        try{ if(!opts.keepDmState && !window.__RESTORING_VIEW__){ currentDmRoom=null; currentDmPeerUid=null; } }catch(e){}
        try{ if(!opts.keepDmState && !window.__RESTORING_VIEW__) document.body.classList.remove('dm-room-open'); }catch(e){}
        try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
        try{ ensureDMInboxLoaded && ensureDMInboxLoaded('tab-enter'); }catch{}
        // Live update thread list only while DM tab is open (lazy subscriptions)
        try{ if(auth?.currentUser && window.watchDmThreadsLive){ watchDmThreadsLive(auth.currentUser.uid); } }catch(e){}
      }
      return;
    }
    if(id==='view-map'){
      if(entering || opts.forceEnter || !window.__mapLoaded){
        window.__mapLoaded=true;
        try{ ensureMapLoadedOnce && ensureMapLoadedOnce(); }catch{}
      }
      setTimeout(()=>{ try{ window.__MAP && window.__MAP.invalidateSize(true); }catch{} }, 150);
      return;
    }
  }catch(e){}
}


// Persist last active tab (used for reload restore)
function setActiveTab(tab){
  try{
    const t = String(tab||'').trim();
    window.__ACTIVE_TAB__ = t;
    if(window.MK && window.MK.persist && window.MK.persist.tab){
      window.MK.persist.tab(t);
    }else{
      localStorage.setItem('mk_last_tab', t);
    }
  }catch(e){}
}
window.setActiveTab = setActiveTab;

function rememberDmRoom(roomId){
  try{
    const r = String(roomId||'').trim();
    if(!r) return;
    if(window.MK && window.MK.persist && window.MK.persist.dmLastRoom){
      window.MK.persist.dmLastRoom(r);
    }else{
      localStorage.setItem('mk_last_dm_room', r);
    }
  }catch(e){}
}
window.rememberDmRoom = rememberDmRoom;

async function restoreAfterReload(){
  try{
    const tab = ((window.MK && window.MK.state && window.MK.state.tab) ? window.MK.state.tab : (localStorage.getItem('mk_last_tab') || '')).trim();
    const view = ((window.MK && window.MK.state && window.MK.state.view) ? window.MK.state.view : (localStorage.getItem('mk_last_view') || localStorage.getItem('lastView') || '')).trim();

    // Prefer explicit tab, otherwise derive from last view
    const t = tab || (view ? view.replace('view-','') : 'chat');

    // Only restore one tab (lazy strategy)
    if(t === 'dm'){
      try{ showView('view-dm'); }catch(e){}
        try{ setHashSafe('dm'); }catch(e){}
try{ await openDMInbox(true); }catch(e){ try{ ensureDMInboxLoaded && ensureDMInboxLoaded('restore'); }catch(_){} }
      return;
    }
    if(t === 'friends'){
      try{ showView('view-friends'); }catch(e){}
      try{ loadFriends && loadFriends(); }catch(e){}
      return;
    }
    if(t === 'members'){
      try{ showView('view-members'); }catch(e){}
      try{ loadMembers && loadMembers(); }catch(e){}
      return;
    }
    if(t === 'rent'){
      try{ showView('view-rent'); }catch(e){}
      try{ loadRent && loadRent(); }catch(e){}
      return;
    }
    // default chat
    try{ showView('view-chat'); }catch(e){}
    try{ loadChat && loadChat(); }catch(e){}
  }catch(e){}
}
window.restoreAfterReload = restoreAfterReload;

// Unified DM entry-point (top envelope, drawer item, tabs)
// Prevents the "DM shows empty when opened from icon" bug by ensuring:
// 1) view is switched, 2) DOM is painted, 3) threads are loaded.
async function openDMInbox(forceReload=true){
  const me = auth?.currentUser;
  if(!me){
    // If auth is still initializing, do NOT force-auth modal. Just remember intent and paint DM with loader.
    if(!window.__AUTH_READY__){
      window.__PENDING_VIEW__ = 'view-dm';
      try{ window.__DM_NEEDS_LOAD__ = true; }catch(e){}
      try{ setHashSafe('dm'); }catch(e){}
      try{ showView('view-dm'); }catch(e){}
      try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
      return;
    }
    // Auth is ready but user is not signed in -> open auth modal (explicit user action).
    window.__PENDING_VIEW__ = 'view-dm';
    try{ window.__DM_NEEDS_LOAD__ = true; }catch(e){}
    try{ openModalAuth('login'); }catch(e){ try{ document.getElementById('modalAuth').hidden=false; }catch(_){} }
    return;
  }
  try{ showView('view-dm'); }catch(e){}
  // DM entry via envelope/menu must always mean: list (not last thread)
  try{ setDmState('list', null); }catch(e){}
  try{ window.__DM_ROOM_RESTORED__ = false; window.__DM_RESTORE_PEER__=''; }catch(e){}
  try{ currentDmRoom=null; currentDmPeerUid=null; }catch(e){}
  try{ document.body.classList.remove('dm-room-open'); }catch(e){}
  try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){}
  // Unified loader + robust "ensure" (auth-gated + retries)
  try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
  try{ if(window.loadDmThreads) window.loadDmThreads(true); }catch(e){}
  setTimeout(()=>{ try{ ensureDMInboxLoaded && ensureDMInboxLoaded('openDMInbox'); }catch(e){} }, 0);
}
window.openDMInbox = openDMInbox;

// Unified DM entry-point by UID (from profile/usercard/friends/notifications)
async function openDM(toUid){
  const peer = String(toUid||'').trim();
  if(!peer) return;
  const me = auth?.currentUser;
  if(!me){
    // If auth still booting, queue intent instead of forcing auth modal
    if(!window.__AUTH_READY__){
      window.__PENDING_VIEW__ = 'view-dm';
      window.__PENDING_DM_PEER__ = peer;
      try{ showView('view-dm'); }catch(e){}
      try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
      return;
    }
    window.__PENDING_VIEW__ = 'view-dm';
    window.__PENDING_DM_PEER__ = peer;
    try{ openModalAuth('login'); }catch(e){}
    return;
  }
  try{ showView('view-dm', {forceEnter:true, keepDmState:true}); }catch(e){}
  try{
    // Prefer startDM (creates inboxMeta + members) if available
    if(typeof window.startDM === 'function'){
      await window.startDM(peer);
    }
    if(typeof window.openDMRoom === 'function'){
      window.openDMRoom(me.uid, peer);
    }
  }catch(e){ console.error(e); }
}
window.openDM = openDM;

// Ensure DM inbox loads after reload without requiring tab switching.
// We call it on: restoreLastView('view-dm'), auth ready, and when DM becomes active.
function ensureDMInboxLoaded(reason){
  try{
    // Run only when DM view is active
    const dmView = document.getElementById('view-dm');
    if(!dmView || !dmView.classList.contains('active')) return;

    // Auth not ready yet -> defer (do NOT spam loaders/modals here)
    const me = auth?.currentUser;
    if(!me){
      try{ window.__DM_NEEDS_LOAD__ = true; }catch(e){}
      return;
    }

    // If threads already rendered, just ensure loader is hidden
    try{
      const box = document.getElementById('dmThreads');
      if(box && box.children && box.children.length>0){
        try{ setMiniLoad('dmMiniLoad','', false); }catch(e){}
        return;
      }
    }catch(e){}

    // Avoid parallel loads
    if(window.__dmThreadsLoading) return;
    window.__dmThreadsLoading = true;

    // Show loader while loading (loadDmThreads has its own finally-hide)
    try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}

    Promise.resolve().then(()=>{
      try{ return window.loadDmThreads ? window.loadDmThreads(true) : null; }catch(e){ return null; }
    }).catch(()=>{}).finally(()=>{
      try{ window.__dmThreadsLoading = false; }catch(e){}
      // Hard-stop: never let the DM loader spin forever
      setTimeout(()=>{ try{ setMiniLoad('dmMiniLoad','', false); }catch(e){} }, 50);
    });

    // Extra hard-timeout (mobile/slow network edge)
    setTimeout(()=>{
      try{
        if(window.__dmThreadsLoading){
          window.__dmThreadsLoading = false;
          setMiniLoad('dmMiniLoad','', false);
        }
      }catch(e){}
    }, 4500);

  }catch(e){}
}
window.ensureDMInboxLoaded = ensureDMInboxLoaded;


document.addEventListener('click',(e)=>{
  const t = e.target.closest('[data-view]');
  if(!t) return;
  e.preventDefault();
  // Single entry point for tab navigation
  showView(t.dataset.view, {forceCloseOverlays:true});
});

/* [MK_BOOTSTRAP] removed duplicate DOMContentLoaded block */


// City state
function getCity(){
  const sel = $('#citySelect');
  let c = '';
  try{ c = (window.MK && window.MK.state && window.MK.state.city) ? String(window.MK.state.city||'') : ''; }catch(e){ c=''; }
  if(!c){ try{ c = String(localStorage.getItem('city')||''); }catch(e){ c=''; } }
  if(!c){ c = sel ? sel.value : 'praha'; }
  c = (String(c||'').trim() || 'praha');
  if(sel) sel.value = c;
  try{ if(window.MK && window.MK.persist && window.MK.persist.city) window.MK.persist.city(c); }catch(e){}
  return c;
}
function setCity(c){
  try{
    if(window.MK && window.MK.persist && window.MK.persist.city){
      window.MK.persist.city(c);
    }else{
      localStorage.setItem('city', c);
    }
  }catch(e){}
}
window.getCity=getCity;

// Wallpapers (global, cached) — no per-city overrides
(function(){
  function applyWallVarsFromCache(){
    try{
      const main = localStorage.getItem('wall_main') || localStorage.getItem('wall') || '';
      const authw = localStorage.getItem('wall_auth') || '';
      const chatw = localStorage.getItem('wall_chat') || '';
      const dmw   = localStorage.getItem('wall_dm') || '';
      const profw = localStorage.getItem('wall_profile') || '';
      if(main) document.documentElement.style.setProperty('--wall', `url('${main}')`);
      if(authw) document.documentElement.style.setProperty('--authwall', `url('${authw}')`);
      if(chatw) document.documentElement.style.setProperty('--chatwall', `url('${chatw}')`);
      if(dmw)   document.documentElement.style.setProperty('--dmwall', `url('${dmw}')`);
      if(profw) document.documentElement.style.setProperty('--profilewall', `url('${profw}')`);
    }catch{}
  }

  // Run as early as possible to prevent default wallpaper flash
  
/* [MK_BOOTSTRAP] removed duplicate DOMContentLoaded block */


  // When city changes, do NOT touch wallpapers; only reload city feeds
  $('#citySelect')?.addEventListener('change', ()=>{
    try{ setCity($('#citySelect').value); }catch(e){}
    // Lazy tab init: reload only the currently active view
    try{
      const active = document.querySelector('.view.active')?.id || '';
      if(active==='view-chat')     { loadChat(); }
      else if(active==='view-rent'){ loadRent(); }
      else if(active==='view-members'){ loadMembers(); }
    }catch(e){}
  });

  // Admin wallpaper inputs -> update cache immediately + RTDB
  document.addEventListener('change', (e)=>{
    const t = e.target;
    if(!t) return;

    const handle = (id, setLocalFn, dbPath, okMsg)=>{
      if(t.id !== id) return false;

      if(!window.__isAdmin){
        toast('Pouze administrátor může měnit pozadí.');
        try{ t.value=''; }catch(e){}
        return true;
      }

      const f = t.files && t.files[0];
      if(!f) return true;

      const r = new FileReader();
      r.onload = ()=>{
        const data = r.result;

        try{ setLocalFn(data); }catch(e){}
        applyWallVarsFromCache();

        try{
          db.ref(dbPath).set({
            url: data,
            ts: Date.now(),
            by: auth.currentUser ? auth.currentUser.uid : null
          });
        }catch(e){ console.warn(e); }

        toast(okMsg||'Uloženo'); playSound('ok');
        try{ t.value=''; }catch(e){}
      };
      r.readAsDataURL(f);
      return true;
    };

    handle('wallMainInput', (data)=>{ try{ localStorage.setItem('wall_main', data); }catch(e){} }, 'settings/wallpapers/main', 'Pozadí hlavní uloženo');
    handle('wallAuthInput', (data)=>{ try{ localStorage.setItem('wall_auth', data); }catch(e){} }, 'settings/wallpapers/auth', 'Pozadí přihlášení uloženo');
    handle('wallChatInput', (data)=>{ try{ localStorage.setItem('wall_chat', data); }catch(e){} }, 'settings/wallpapers/chat', 'Pozadí chatu uloženo');
    handle('wallDmInput',   (data)=>{ try{ localStorage.setItem('wall_dm', data); }catch(e){} }, 'settings/wallpapers/dm', 'Pozadí DM uloženo');
    handle('wallProfileInput', (data)=>{ try{ localStorage.setItem('wall_profile', data); }catch(e){} }, 'settings/wallpapers/profile', 'Pozadí profilu uloženo');
  });
})();
// ==
