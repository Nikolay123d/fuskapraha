try{ if(!window.__PRELOADER_T0) window.__PRELOADER_T0 = Date.now(); }catch(e){}


// --- Mini loader helpers ---

function initDmMobileModal(){
  const overlay = document.getElementById('dmMobileOverlay');
  const mount = document.getElementById('dmMobileMount');
  const card = document.getElementById('dmConversationCard');
  const closeBtn = document.getElementById('dmMobileClose');
  if(!overlay || !mount || !card || !closeBtn) return;
  if(overlay.dataset.wired==='1') return;
  overlay.dataset.wired='1';

  let origParent = card.parentElement;
  let origNext = card.nextSibling;

  function open(){
    // only for narrow screens
    if(window.matchMedia && !window.matchMedia('(max-width: 720px)').matches) return;
    // move card into modal
    try{
      mount.appendChild(card);
      overlay.hidden=false;
      // update title from current peer if available
      try{
        const t=document.getElementById('dmMobileTitle');
        if(t){
          const u = window._lastDmPeerPublic || null;
          t.textContent = u && u.nick ? ('DM: '+u.nick) : 'Konverzace';
        }
      }catch(e){}
    }catch(e){}
  }
  function close(){
    try{
      overlay.hidden=true;
      // move back
      if(origParent){
        if(origNext) origParent.insertBefore(card, origNext);
        else origParent.appendChild(card);
      }
    }catch(e){}
  }

  closeBtn.addEventListener('click', close);

  // expose
  window.openDmMobile = open;
  window.closeDmMobile = close;
}


// --- time formatting ---
function fmtTime(ts){
  try{ return new Date(ts||0).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }catch(e){ return ''; }
}

function setMiniLoad(id, text, show){
  const el = document.getElementById(id);
  if(!el) return;
  const st = el.querySelector('.mini-status');
  if(typeof text==='string' && text.length){
    if(st) st.textContent = text; else el.textContent = text;
  }
  el.setAttribute('role','status');
  el.setAttribute('aria-live','polite');
  el.style.display = show ? 'flex' : 'none';
  if(show) startMiniTipsFor(el); else stopMiniTipsFor(el);
}

/** Rotating mini-loader texts while an async load is in progress. */
function startMiniSequence(id, texts, stepMs){
  const el = document.getElementById(id);
  if(!el) return ()=>{};
  const arr = Array.isArray(texts) && texts.length ? texts : ['Načítám…'];
  const ms = Math.max(250, +stepMs||700);
  let i=0;
  setMiniLoad(id, arr[0], true);
  const t = setInterval(()=>{
    i = (i+1)%arr.length;
    setMiniLoad(id, arr[i], true);
  }, ms);
  return ()=>{ try{ clearInterval(t); }catch(e){} };
}

// === Mini tips (rotating hints under mini-loaders) ===
const __MINI_TIPS = [
  "Tip: Přidej si přátele a piš v soukromí přes obálku.",
  "Tip: V profilu si nastav přezdívku a avatar — budeš víc vidět.",
  "Věděl jsi, že… V Premium můžeš mít vlastní boty pro inzerci?",
  "Tip: Mapu otevři jen když ji potřebuješ — zrychlíš start aplikace.",
  "Tip: Klepni na zvonek — uvidíš žádosti, zprávy a systémové novinky."
];
function startMiniTipsFor(el){
  try{
    if(!el) return;
    const tipEl = el.querySelector('.mini-tip');
    if(!tipEl) return;
    if(el.__tipTimer) clearInterval(el.__tipTimer);
    let i = 0;
    tipEl.textContent = __MINI_TIPS[0];
    el.__tipTimer = setInterval(()=>{
      i = (i + 1) % __MINI_TIPS.length;
      tipEl.textContent = __MINI_TIPS[i];
    }, 2800);
  }catch(e){}
}
function stopMiniTipsFor(el){
  try{
    if(el && el.__tipTimer){ clearInterval(el.__tipTimer); el.__tipTimer=null; }
  }catch(e){}
}

// === Local cache + staged prefetch (speed / "no empty screens")
// The goal is: instant paint from localStorage, then live sync in the background.
function __cacheKey(kind, extra){
  const uid = (window.auth && auth.currentUser && auth.currentUser.uid) ? auth.currentUser.uid : 'anon';
  const suffix = (extra!=null && String(extra).length) ? String(extra) : '';
  return `mk_cache_${kind}_${uid}${suffix ? '_' + suffix : ''}`;
}

function __cacheGet(key, maxAgeMs){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || typeof obj.ts!=='number') return null;
    if(maxAgeMs && (Date.now() - obj.ts) > maxAgeMs) return null;
    return obj;
  }catch(e){
    return null;
  }
}

function __cacheSet(key, val){
  try{
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), val }));
  }catch(e){}
}

function __cacheDelPrefix(prefix){
  try{
    for(let i=localStorage.length-1;i>=0;i--){
      const k = localStorage.key(i);
      if(k && k.startsWith(prefix)) localStorage.removeItem(k);
    }
  }catch(e){}
}

let __PREFETCH_STARTED = false;
async function __runPrefetchStages(){
  if(__PREFETCH_STARTED) return;
  __PREFETCH_STARTED = true;

  const stages = [
    { name:'dmThreads', fn: async()=>{ try{ await loadDmThreads(); }catch(e){} } },
    { name:'friends',   fn: async()=>{ try{ await loadFriends(); }catch(e){} } },
    { name:'members',   fn: async()=>{ try{ await loadMembers(); }catch(e){} } },
    { name:'mapPoi',    fn: async()=>{ try{ if(typeof prefetchMapPoi==='function') await prefetchMapPoi(); }catch(e){} } },
  ];

  for(const s of stages){
    // idle scheduling between stages (keeps UI responsive)
    await new Promise((resolve)=>{
      const run = async()=>{ try{ await s.fn(); }catch(e){} resolve(); };
      if('requestIdleCallback' in window){
        try{ window.requestIdleCallback(()=>run(), { timeout: 1400 }); }catch(e){ setTimeout(run, 350); }
      } else {
    try{ stopBotHostEngine(); }catch(e){}
    try{ if(window.__stopBotDmEngine) window.__stopBotDmEngine(); }catch(e){}
        setTimeout(run, 350);
      }
    });
  }
}

// Clear user-scoped caches on logout to avoid "wrong account" artifacts.

// Start staged prefetch safely (called after chat first paint)
function __startPrefetchStages(){
  try{
    if('requestIdleCallback' in window){
      requestIdleCallback(()=>{ __runPrefetchStages(); }, {timeout:1500});
    }else{
      setTimeout(()=>{ __runPrefetchStages(); }, 800);
    }
  }catch(e){}
}
function __clearUserCachesOnLogout(){
  try{ __cacheDelPrefix('mk_cache_'); }catch(e){}
}



/** Admin: quick camera buttons in headers (change wallpapers instantly for all) */
let __ADMIN_CAM_WIRED = false;
function wireAdminQuickCams(){
  const me = auth.currentUser;
  if(!me || !isAdminUser(me) || __ADMIN_CAM_WIRED) return;
  __ADMIN_CAM_WIRED = true;

  const svg = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 7l1.5-2h3L15 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3Z" stroke="currentColor" stroke-width="1.6"/><path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" stroke-width="1.6"/></svg>';

  const mk = (targetInputId, title)=>{
    const inp = document.getElementById(targetInputId);
    if(!inp) return null;
    const b = document.createElement('button');
    b.type='button';
    b.className='admin-cam-btn';
    b.title = title || 'Změnit pozadí';
    b.innerHTML = svg;
    b.addEventListener('click', ()=>{ try{ inp.click(); }catch(e){} });
    return b;
  };

  // Chat header
  try{
    const chatHeader = document.querySelector('#view-chat .top-actions') || document.querySelector('#view-chat header') || document.querySelector('#view-chat');
    const btn = mk('wpChat','Admin: pozadí chatu');
    if(btn && chatHeader) chatHeader.appendChild(btn);
  }catch(e){}

  // DM header
  try{
    const dmHeader = document.querySelector('#view-dm .top-actions') || document.querySelector('#view-dm header') || document.querySelector('#view-dm');
    const btn = mk('wpDm','Admin: pozadí DM');
    if(btn && dmHeader) dmHeader.appendChild(btn);
  }catch(e){}

  // Profile modal header (best-effort)
  try{
    const profHeader = document.querySelector('#modalUserCard header') || document.querySelector('#modalProfile header') || document.querySelector('#view-profile header');
    const btn = mk('wpProfile','Admin: pozadí profilu');
    if(btn && profHeader) profHeader.appendChild(btn);
  }catch(e){}

  // Main + Auth wallpapers (use admin settings inputs)
  try{
    const top = document.querySelector('.topbar') || document.body;
    const b1 = mk('wallCamera','Admin: hlavní pozadí');
    const b2 = mk('authWallCamera','Admin: pozadí přihlášení');
    if(b1) top.appendChild(b1);
    if(b2) top.appendChild(b2);
  }catch(e){}
}

function wireScrollDown(feedId, btnId){
  const feed=document.getElementById(feedId);
  const btn=document.getElementById(btnId);
  if(!feed || !btn) return;
  const update=()=>{
    const atBottom = (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 220;
    btn.style.display = atBottom ? 'none' : 'block';
  };
  feed.addEventListener('scroll', update);
  btn.addEventListener('click', ()=>{ feed.scrollTop = feed.scrollHeight; });
  setTimeout(update, 500);
}

// === config injected ===
// ==== Firebase config
window.__isAdmin = false;
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDV2BslF-Ll37a1XO3GEfzNMXa7YsSXL1o",
  // IMPORTANT (Google login): use the *.firebaseapp.com authDomain.
  // It always serves /__/auth/handler even if Firebase Hosting (web.app) has ZERO deploys.
  // This fixes "Site Not Found" and "missing initial state" redirect failures.
  // Ensure these are authorized:
  //  - Firebase Console → Authentication → Settings → Authorized domains:
  //      nikolay123d.github.io, web-app-b4633.firebaseapp.com, web-app-b4633.web.app
  //  - Google Cloud Console → OAuth client → Authorized redirect URIs:
  //      https://web-app-b4633.firebaseapp.com/__/auth/handler
  //      https://web-app-b4633.web.app/__/auth/handler
  authDomain: "web-app-b4633.firebaseapp.com",
  databaseURL: "https://web-app-b4633-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "web-app-b4633",
  storageBucket: "web-app-b4633.firebasestorage.app",
  messagingSenderId: "1041887915171",
  appId: "1:1041887915171:web:84d62eae54e9291b47a316",
  measurementId: "G-C65BPE81SJ"
};

// --- Admin bootstrap ---
// IMPORTANT: ADMIN_UID must be a Firebase Auth UID (not e-mail).
// You can extend ADMIN_UIDS safely for more admins.
window.ADMIN_UID = "PsnyM4j68AR2EyXZaC9ElNqnow12"; // Nikolaj (main)
window.ADMIN_UIDS = []; // disabled (SSoT: roles/<uid>/admin)

// TEMP/Fallback: Admin by email (Firebase Auth). Keep for bootstrap until /roles is stable.
window.ADMIN_EMAILS = []; // disabled (SSoT: roles/<uid>/admin)
window.ADMIN_EMAIL = ""; // disabled (SSoT: roles/<uid>/admin)

// Admin role is stored in RTDB at /roles/{uid}/admin === true
// --- Wallpapers helpers (main + auth) ---
function setMainWallpaper(dataUrl){
  if(typeof dataUrl!=='string') return;
  document.documentElement.style.setProperty('--wall', `url('${dataUrl}')`);
  document.documentElement.style.setProperty('--wallRaw', dataUrl);
}
function setAuthWallpaper(dataUrl){
  if(typeof dataUrl!=='string') return;
  document.documentElement.style.setProperty('--authwall', `url('${dataUrl}')`);
  document.documentElement.style.setProperty('--authwallRaw', dataUrl);
}

function setChatWallpaper(dataUrl){
  if(typeof dataUrl!=='string') return;
  document.documentElement.style.setProperty('--chatwall', `url('${dataUrl}')`);
  document.documentElement.style.setProperty('--chatwallRaw', dataUrl);
}
function setDmWallpaper(dataUrl){
  if(typeof dataUrl!=='string') return;
  document.documentElement.style.setProperty('--dmwall', `url('${dataUrl}')`);
  document.documentElement.style.setProperty('--dmwallRaw', dataUrl);
}
function setProfileWallpaper(dataUrl){
  if(typeof dataUrl!=='string') return;
  document.documentElement.style.setProperty('--profilewall', `url('${dataUrl}')`);
  document.documentElement.style.setProperty('--profilewallRaw', dataUrl);
}


// === Premium bot (client-side) ===
const PREMIUM_BOT_UID = 'bot_premium';

// Render helper: bots can carry their own display (nick/avatar) while being posted by a real uid.
async function resolveMsgUser(m){
  try{
    if(m && m.bot===true){
      if(m.botNick || m.botAvatar){
        return {
          nick: m.botNick || 'Bot',
          avatar: m.botAvatar || './assets/img/robot.svg',
          online: true,
          plan: 'premium'
        };
      }
      if(m.botUid===PREMIUM_BOT_UID){
        return {nick:'Bot — Privilegia', avatar:'./assets/img/rose.svg', online:true, plan:'premium'};
      }
    }
    return await getUser(m && m.by);
  }catch(e){
    return {nick:'Uživatel', avatar: window.DEFAULT_AVATAR};
  }
}
const PREMIUM_QR_IMG_DEFAULT = './assets/img/csob-qr.png';

async function getPremiumQrImg(){
  try{
    const v=(await db.ref('settings/payments/qrImg').get()).val();
    return v || PREMIUM_QR_IMG_DEFAULT;
  }catch(e){ return PREMIUM_QR_IMG_DEFAULT; }
}

const PREMIUM_PLANS = {
  vip: { code:'vip', title:'VIP', price:100, period:'navždy', desc:'VIP umožní psát zaměstnavateli do L.S., přístup k chatu, až 10 foto v chatu.' },
  premium: { code:'premium', title:'Premium', price:150, period:'měsíc', desc:'Premium: speciální design profilu, možnost vytvářet inzeráty, bot s omezenými možnostmi (bez avatara), interval 1 hod.' },
  premiumPlus: { code:'premiumPlus', title:'Premium+', price:200, period:'měsíc', desc:'Premium+: bot má avatar, text+foto pod příspěvkem, zprávy botu chodí vám do DM pod značkou reklama.' }
};

// Use Firebase Storage? If false — images are saved as dataURL into DB
window.USE_STORAGE = false;

// Default avatar
window.DEFAULT_AVATAR = "./assets/img/default-avatar.svg";

// === viewport helpers (must exist before any DM/UI openers) ===
// Some handlers call openDMRoom() early; missing helpers previously crashed DM.
function isMobileViewport(){
  try{ return window.matchMedia && window.matchMedia('(max-width: 820px)').matches; }catch(e){ return (window.innerWidth||0) <= 820; }
}
window.isMobileViewport = isMobileViewport;

// === tiny helpers ===
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

// === overlay manager (prevents window-on-window issues) ===
function closeAllOverlays(opts={keep:null}){
  const keep=opts.keep;
  const ids=['fabMenu','dmMobileOverlay','modalUserCard','modalAuth','promoModal','greetOverlay','cookieModal','notifPrompt'];
  ids.forEach(id=>{
    if(keep===id) return;
    const el=document.getElementById(id);
    if(!el) return;
    if(id==='fabMenu'){
      el.hidden=true;
    }else{
      el.hidden=true;
    }
  });
  document.body.classList.remove('modal-open');
  document.body.classList.remove('auth-open');
  document.body.classList.remove('dm-room-open');
  // drawer
  const d=document.getElementById('drawer'); const o=document.getElementById('drawerOverlay');
  if(d && keep!=='drawer'){ d.classList.remove('open'); }
  if(o && keep!=='drawer'){ o.hidden=true; }
}
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Toast with auto-hide
function toast(msg, ms=2400){
  const el = $('#globalToast');
  if(!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.style.display='none'; }, ms);
}

// Sounds (must be unlocked by user interaction)
const SND = {
  chat: new Audio('./assets/sounds/new_chat.wav'),
  dm: new Audio('./assets/sounds/new_dm.wav'),
  notify: new Audio('./assets/sounds/new_chat.wav'),
  friend: new Audio('./assets/sounds/ok.wav'),
  ok: new Audio('./assets/sounds/ok.wav'),
  err: new Audio('./assets/sounds/err.wav'),
  party: new Audio('./assets/sounds/celebration.wav')
};

let SOUND_CFG = { masterVolume: 1, muteDefault: false };
function _setAudioSrc(key, url){
  try{
    if(typeof url!=='string' || !url) return;
    const a=SND[key]; if(!a) return;
    // if same src, skip
    if(a.src === url) return;
    a.src = url;
  }catch{}
}
function applySoundVolumes(){
  try{
    const mv = Number(SOUND_CFG.masterVolume);
    Object.keys(SND).forEach(k=>{
      try{
        SND[k].volume = Math.max(0, Math.min(1, mv));
      }catch{}
    });
  }catch{}
}
let _sndUnsub=null;
function startSoundsSync(){
  try{
    if(_sndUnsub){ _sndUnsub(); _sndUnsub=null; }
    const ref=db.ref('settings/sounds');
    const handler=(snap)=>{
      const v=snap.val()||{};
      if(typeof v.masterVolume!=='undefined') SOUND_CFG.masterVolume = v.masterVolume;
      if(typeof v.muteDefault!=='undefined') SOUND_CFG.muteDefault = v.muteDefault;
      if(typeof v.dm==='string') _setAudioSrc('dm', v.dm);
      if(typeof v.notify==='string') _setAudioSrc('notify', v.notify); // reuse chat key for notify
      if(typeof v.friend==='string') _setAudioSrc('friend', v.friend); // friend uses ok sound slot
      applySoundVolumes();
      try{
        // if admin wants mute by default, enforce for new users
        if(SOUND_CFG.muteDefault===true && localStorage.getItem('soundAllowed')==null){
          localStorage.setItem('soundAllowed','0');
        }
      }catch{}
    };
    ref.on('value', handler);
    _sndUnsub=()=>ref.off('value', handler);
  }catch(e){}
}
function playSound(k){
  try{
    if(localStorage.getItem('soundAllowed')!=='1') return;
    const a=SND[k]; if(!a) return;
    a.currentTime=0; a.play().catch(()=>{});
  }catch{}
}
async function unlockAudio(){
  try{
    localStorage.setItem('soundAllowed','1');
    // attempt short play/pause to unlock
    const a=SND.ok;
    a.volume=0.0001;
    await a.play();
    a.pause(); a.currentTime=0;
    a.volume=1;
  }catch(e){
    // still store, but may not play until next user gesture
    localStorage.setItem('soundAllowed','1');
  }
}

// One-time audio unlock on first user gesture (for iOS/Android autoplay rules)
(function(){
  if(window.__audioUnlockWired) return;
  window.__audioUnlockWired = true;
  const once = async ()=>{
    try{
      if(localStorage.getItem('soundAllowed')!=='1'){
        await unlockAudio();
      }
    }catch(e){}
    try{ document.removeEventListener('pointerdown', once, {capture:true}); }catch(e){}
    try{ document.removeEventListener('touchstart', once, {capture:true}); }catch(e){}
  };
  document.addEventListener('pointerdown', once, {capture:true, passive:true});
  document.addEventListener('touchstart', once, {capture:true, passive:true});
})();

// Notifications permission
async function ensureNotifications(force=false){
  if(!('Notification' in window)) return;
  const saved = localStorage.getItem('notifAllowed');
  const perm = ('Notification' in window) ? Notification.permission : 'denied';

  if(perm === 'granted'){
    try{ localStorage.setItem('notifAllowed','1'); }catch(e){}
    return;
  }
  if(perm === 'denied'){
    try{ localStorage.setItem('notifAllowed','0'); }catch(e){}
    return;
  }

  // perm === 'default' — ask only on explicit user gesture (cookie click / settings)
  if(!force){
    if(saved === '0') return;
  }

  try{
    const p = await Notification.requestPermission();
    try{ localStorage.setItem('notifAllowed', p==='granted' ? '1' : '0'); }catch(e){}
  }catch(e){
    try{ localStorage.setItem('notifAllowed','0'); }catch(e){}
  }
}

// Show a delayed prompt that requires a user click to request notifications.
// This avoids browsers blocking Notification.requestPermission() when called
// from timers/background code.
let __notifPromptTimer = null;
function scheduleNotifPromptAfterConsent(delayMs=30000){
  try{
    if(localStorage.getItem('notifAllowed')==='1') return;
    if(!('Notification' in window)) return;
    if(Notification.permission!=='default') return;
  }catch(e){}

  try{ if(__notifPromptTimer) clearTimeout(__notifPromptTimer); }catch(e){}
  __notifPromptTimer = setTimeout(()=>{
    try{ showNotifPrompt(); }catch(e){}
  }, delayMs);
}

function showNotifPrompt(){
  // create once
  let p = document.getElementById('notifPrompt');
  if(!p){
    p = document.createElement('div');
    p.id = 'notifPrompt';
    p.innerHTML = `
      <div class="np-card">
        <div class="np-title">Povolit upozornění?</div>
        <div class="np-text">Dostaneš DM a systémové notifikace i když máš kartu na pozadí.</div>
        <div class="np-actions">
          <button type="button" class="ghost" id="npLater">Později</button>
          <button type="button" id="npEnable">Povolit</button>
        </div>
      </div>`;
    document.body.appendChild(p);
  }
  p.style.display = 'block';
  // wire
  const hide = ()=>{ try{ p.style.display='none'; }catch(e){} };
  p.querySelector('#npLater')?.addEventListener('click', ()=>{ try{ localStorage.setItem('notifAllowed','0'); }catch(e){} hide(); }, {once:true});
  p.querySelector('#npEnable')?.addEventListener('click', async ()=>{
    // This click is the required user gesture.
    try{ await unlockAudio(); }catch(e){}
    try{ await ensureNotifications(true); }catch(e){}
    try{
      if(('Notification' in window) && Notification.permission==='granted'){
        localStorage.setItem('notifAllowed','1');
        try{ if(auth?.currentUser) initPushForUser(auth.currentUser); }catch(e){}
        schedulePromoOffer();
      }
    }catch(e){}
    hide();
  }, {once:true});
}
function notify(title, body, type='notify'){
  try{
    if(!('Notification' in window)) return;
    if(localStorage.getItem('notifAllowed')!=='1') return;
    if(document.visibilityState==='visible') return; // only when tab hidden
    new Notification(title, { body });
    if(type==='dm') playSound('dm');
    else if(type==='friend') playSound('friend');
    else if(type==='chat') playSound('chat');
    else playSound('notify');
  }catch{}
}

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
function __closeAllOverlays(){
  try{ if(typeof modalRoot!="undefined" && modalRoot) modalRoot.innerHTML=""; }catch(e){}
  try{ document.querySelectorAll(".modal, .overlay, .sheet, .popup").forEach(el=>{ try{ el.hidden=true; }catch(e){} try{ el.classList.remove("open","show","active"); }catch(e){} }); }catch(e){}
  try{ document.body.classList.remove("modal-open"); }catch(e){}
}

function showView(id){
  __closeAllOverlays();
  $$('.view').forEach(v=>v.classList.remove('active'));
  const el = $('#'+id);
  if(el){ el.classList.add('active'); try{ localStorage.setItem('lastView', id); localStorage.setItem('mk_last_view', id); }catch(e){} }
  // keep tab highlight in sync
  try{ $$('.tab').forEach(t=>{ try{ t.classList.toggle('active', (t.dataset.view===id)); }catch(e){} }); }catch(e){}
  try{ if(id!=='view-chat') setMiniLoad('chatMiniLoad','', false); }catch(e){}

  // Lazy-load heavy modules per tab (prevents slow startup and "loops")
  window.__friendsLoaded = window.__friendsLoaded || false;
  window.__membersLoaded = window.__membersLoaded || false;
  window.__dmThreadsLoaded = window.__dmThreadsLoaded || false;
  window.__mapLoaded = window.__mapLoaded || false;

  try{
    if(id==='view-chat'){
      if(!window.__chatLoaded){ window.__chatLoaded=true; try{ loadChat(); }catch{} }
      return;
    }
    if(id==='view-rent'){
      if(!window.__rentLoaded){ window.__rentLoaded=true; try{ loadRent(); }catch{} }
      return;
    }
    if(id==='view-friends'){
      if(!window.__friendsLoaded){ window.__friendsLoaded=true; }
      // friends can refresh often, but ensure loader finally inside loadFriends
      try{ loadFriends(); }catch{}
      return;
    }
    if(id==='view-members'){
      if(!window.__membersLoaded){ window.__membersLoaded=true; }
      try{ loadMembers(); }catch{}
      return;
    }
    if(id==='view-dm'){
      // DM threads list (inbox)
      // IMPORTANT: do NOT "load once" here. If the user opens DM via the top
      // envelope before auth becomes ready, a one-time load would freeze DM in an
      // empty state. We always attempt to load.
      try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
      try{ loadDmThreads && loadDmThreads(true); }catch{}
      return;
    }
    if(id==='view-map'){
      if(!window.__mapLoaded){ window.__mapLoaded=true; try{ ensureMapLoadedOnce && ensureMapLoadedOnce(); }catch{} }
      setTimeout(()=>{ try{ window.__MAP && window.__MAP.invalidateSize(true); }catch{} }, 150);
      return;
    }
  }catch(e){}
}

// Unified DM entry-point (top envelope, drawer item, tabs)
// Prevents the "DM shows empty when opened from icon" bug by ensuring:
// 1) view is switched, 2) DOM is painted, 3) threads are loaded.
async function openDMInbox(forceReload=true){
  const me = auth?.currentUser;
  if(!me){
    window.__PENDING_VIEW__ = 'view-dm';
    try{ openModalAuth('login'); }catch(e){ try{ document.getElementById('modalAuth').hidden=false; }catch(_){} }
    return;
  }
  try{ showView('view-dm'); }catch(e){}
  // Ensure DOM is ready then load threads (reliable for envelope + menu)
  setMiniLoad('dmMiniLoad','Načítám…', true);
  setTimeout(()=>{
    try{ loadDmThreads && loadDmThreads(!!forceReload); }catch(e){}
  }, 0);
}
window.openDMInbox = openDMInbox;
document.addEventListener('click',(e)=>{
  const t = e.target.closest('[data-view]');
  if(!t) return;
  e.preventDefault();
  $$('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  openView(t.dataset.view);
});

/* [MK_BOOTSTRAP] removed duplicate DOMContentLoaded block */


// City state
function getCity(){
  const sel = $('#citySelect');
  const saved = localStorage.getItem('city');
  if(saved){ if(sel) sel.value=saved; return saved; }
  return sel ? sel.value : 'praha';
}
function setCity(c){ localStorage.setItem('city', c); }
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
    try{ loadChat(); }catch(e){}
    try{ loadRent(); }catch(e){}
    try{ if(window.__membersLoaded) loadMembers(); }catch(e){}
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
// === Firebase init ===
firebase.initializeApp(window.FIREBASE_CONFIG);
const auth=firebase.auth();


// --- Auth hero rotator (mobile intro) ---
let __authHeroTimer=null;
let __authHeroTyping=false;
function stopAuthHeroRotator(){
  try{ if(__authHeroTimer){ clearTimeout(__authHeroTimer); __authHeroTimer=null; } }catch(e){}
  __authHeroTyping=false;
}
function startAuthHeroRotator(){
  const box=document.getElementById("authHeroLine");
  if(!box) return;
  const txtEl=box.querySelector(".txt")||box;
  stopAuthHeroRotator();
  const lines=[
    "Hledáš práci 24/7?",
    "Zaměstnavatelé přímo — bez agentur.",
    "Nejčerstvější nabídky v reálném čase.",
    "Unavený z šablon? Zaregistruj se.",
    "Napiš do chatu a domluv si směnu hned.",
    "Najdi práci online — rychle a jednoduše."
  ];
  let i=0;
  const typeLine=(s,cb)=>{
    __authHeroTyping=true;
    let k=0;
    const step=()=>{
      if(!__authHeroTyping) return;
      txtEl.textContent=s.slice(0,k);
      k++;
      if(k<=s.length){ __authHeroTimer=setTimeout(step, 22); }
      else { __authHeroTimer=setTimeout(()=>{ __authHeroTimer=null; cb&&cb(); }, 1200); }
    };
    step();
  };
  const loop=()=>{
    const _ma=document.getElementById("modalAuth"); if(!_ma || _ma.hidden) return;
    const line=String(lines[i%lines.length]||"").toUpperCase();
    i++;
    typeLine(line, ()=>{
      // clear then next
      __authHeroTimer=setTimeout(()=>{ if(!__authHeroTyping) return; txtEl.textContent=""; __authHeroTimer=setTimeout(loop, 240); }, 400);
    });
  };
  loop();
}

// --- Auth persistence (COST+STABILITY) ---
// Ensure auth session survives reloads and redirect roundtrips (GitHub Pages + mobile).
window.__AUTH_PERSIST_PROMISE__ = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch((e)=>{ console.warn("Auth persistence error", e); });

const db=firebase.database();


// --- FCM messaging (push notifications) ---
let messaging = null;
let __swReg = null;
try{ messaging = firebase.messaging(); }catch(e){ messaging = null; }


async function adminAutoCleanupOncePer24h(){
  try{
    const me = auth.currentUser;
    if(!me) return;
    if(!isAdminUser(me)) return;

    const key='admin_cleanup_ts';
    const last = +localStorage.getItem(key) || 0;
    const now = Date.now();
    if(now - last < 24*60*60*1000) return;

    // mark immediately to avoid repeated runs on reload
    try{ localStorage.setItem(key, String(now)); }catch(e){}

    const cutoff = now - 30*24*60*60*1000; // 30 days
    const cities = ['praha','brno','olomouc','ostrava','plzen','liberec','hradec','pardubice','ceske_budejovice','usti','zlin','karlovy_vary','jihlava','teplice'];

    async function trimPath(path){
      try{
        const snap = await db.ref(path).orderByChild('ts').limitToLast(500).get();
        const val = snap.val();
        if(!val) return;
        const updates = {};
        Object.keys(val).forEach(k=>{
          const ts = +val[k]?.ts || 0;
          if(ts && ts < cutoff) updates[path+'/'+k] = null;
        });
        if(Object.keys(updates).length) await db.ref().update(updates);
      }catch(e){}
    }

    for(const c of cities){
      await trimPath('messages/'+c);
      await trimPath('rentMessages/'+c);
    }
    toast('Admin: staré zprávy vyčištěny (30 dní).');
    playSound('ok');
  }catch(e){}
}


async function initPushForUser(u){
  try{
    if(!u || !messaging) return;
    if(!('serviceWorker' in navigator)) return;
    if(!('Notification' in window)) return;
    // permission must be granted
    if(Notification.permission !== 'granted') return;
    const vapidKey = String(window.WEB_PUSH_VAPID_KEY||window.FCM_PUBLIC_VAPID_KEY||'').trim();
    // FCM expects a base64url VAPID public key. If it's missing/placeholder/invalid,
    // we skip init instead of throwing and breaking bootstrap.
    const looksOk = /^[A-Za-z0-9_-]+$/.test(vapidKey) && vapidKey.length >= 80 && !vapidKey.startsWith('PASTE_');
    if(!looksOk){
      console.warn('[FCM] VAPID key missing/invalid; push init skipped');
      return;
    }
    // register SW once
    if(!__swReg){
      __swReg = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    }
    const token = await messaging.getToken({ vapidKey, serviceWorkerRegistration: __swReg });
    if(!token) return;
    // store per-user token for later server-side sending
    await db.ref('fcmTokens/'+u.uid+'/'+token).set({ts: Date.now(), ua: navigator.userAgent||''});
    console.log('[FCM] token saved');
  }catch(e){
    console.warn('[FCM] init failed', e);
  }
}

// Foreground messages (tab open)
try{
  messaging && messaging.onMessage((payload)=>{
    try{
      const n = payload?.notification || {};
      const title = n.title || 'Makáme';
      const body = n.body || '';
      // Show local notification (only if tab is hidden) + sound
      notify(title, body, 'notify');
    }catch(e){}
  });
}catch(e){}

// --- DM state (global) ---
  // currentDmRoom is global (see top)
// DM peer uid is declared in the main DM state block below

const stg=firebase.storage(); // not used when USE_STORAGE=false

// --- Global wallpapers sync (admin-set, same on all devices) ---
let _wallUnsub = null;
function startWallpaperSync(){
  try{
    if(_wallUnsub){ _wallUnsub(); _wallUnsub=null; }
    const ref=db.ref('settings/wallpapers/main');
    const handler=(snap)=>{
      const val=snap.val();
      const url = (typeof val==='string') ? val : (val && val.url);
      if(typeof url==='string' && url.startsWith('data:image')){
        try{ localStorage.setItem('wall_main', url); }catch{}
        document.documentElement.style.setProperty('--wall', `url('${url}')`);
      }
    };
    ref.on('value', handler);
    _wallUnsub=()=>ref.off('value', handler);
  }catch(e){}
}
// --- Auth wallpaper sync (admin-set, same on all devices) ---
let _authWallUnsub = null;
function startAuthWallpaperSync(){
  try{
    if(_authWallUnsub){ _authWallUnsub(); _authWallUnsub=null; }
    const ref=db.ref('settings/wallpapers/auth');
    const handler=(snap)=>{
      const val=snap.val();
      const url = (typeof val==='string') ? val : (val && val.url);
      if(typeof url==='string'){
        try{ localStorage.setItem('wall_auth', url); }catch{}
        setAuthWallpaper(url);
      }
    };
    ref.on('value', handler);
    _authWallUnsub=()=>ref.off('value', handler);
  }catch(e){}
}

// --- Chat wallpaper sync ---
let _chatWallUnsub=null;
function startChatWallpaperSync(){
  try{
    if(_chatWallUnsub){ _chatWallUnsub(); _chatWallUnsub=null; }
    const ref=db.ref('settings/wallpapers/chat');
    const handler=(snap)=>{
      const val=snap.val();
      const url=(typeof val==='string')?val:(val&&val.url);
      if(typeof url==='string' && url.startsWith('data:image')){
        try{ localStorage.setItem('wall_chat', url); }catch{}
        setChatWallpaper(url);
      }
    };
    ref.on('value', handler);
    _chatWallUnsub=()=>ref.off('value', handler);
  }catch(e){}
}
// --- DM wallpaper sync ---
let _dmWallUnsub=null;
function startDmWallpaperSync(){
  try{
    if(_dmWallUnsub){ _dmWallUnsub(); _dmWallUnsub=null; }
    const ref=db.ref('settings/wallpapers/dm');
    const handler=(snap)=>{
      const val=snap.val();
      const url=(typeof val==='string')?val:(val&&val.url);
      if(typeof url==='string' && url.startsWith('data:image')){
        try{ localStorage.setItem('wall_dm', url); }catch{}
        setDmWallpaper(url);
      }
    };
    ref.on('value', handler);
    _dmWallUnsub=()=>ref.off('value', handler);
  }catch(e){}
}
// --- Profile wallpaper sync ---
let _profileWallUnsub=null;
function startProfileWallpaperSync(){
  try{
    if(_profileWallUnsub){ _profileWallUnsub(); _profileWallUnsub=null; }
    const ref=db.ref('settings/wallpapers/profile');
    const handler=(snap)=>{
      const val=snap.val();
      const url=(typeof val==='string')?val:(val&&val.url);
      if(typeof url==='string' && url.startsWith('data:image')){
        try{ localStorage.setItem('wall_profile', url); }catch{}
        setProfileWallpaper(url);
      }
    };
    ref.on('value', handler);
    _profileWallUnsub=()=>ref.off('value', handler);
  }catch(e){}
}



// Admin helpers
// Admin can be determined by: UID whitelist OR e-mail whitelist OR /roles/{uid}/admin === true (handled in watchAdminRole()).

// Ensure usersPublic and email index for friends
async function ensureMyPublic(u){
  if(!u) return;
  const ref = db.ref('usersPublic/'+u.uid);
  const s = await ref.get();
  if(!s.exists()){
    await r

// === Access / Moderation Single Layer (SSoT) ===
// Source of truth in RTDB:
//  - roles/<uid>/{admin,moderator}
//  - bans/<uid> {until, reason}
//  - mutes/<uid> {until, reason}        (chat-only)
//  - dmBans/<uid> {until, reason}       (DM-only)
// Frontend never re-invents permissions via email/UID lists.
(function initAccessLayer(){
  if(window.MK_ACCESS) return;

  const state = {
    isAdmin: false,
    isModerator: false,
    banUntil: 0, banReason: '',
    muteUntil: 0, muteReason: '',
    dmBanUntil: 0, dmBanReason: ''
  };

  function _emit(){
    try{ window.dispatchEvent(new CustomEvent('mk_access_changed', { detail: {...state} })); }catch(e){}
  }
  function _set(patch){
    Object.assign(state, patch||{});
    try{
      document.body.classList.toggle('is-admin', !!state.isAdmin);
      document.body.classList.toggle('is-moderator', !!state.isModerator);
    }catch(e){}
    _emit();
  }

  function _now(){ return Date.now(); }
  function isStaff(){ return !!(state.isAdmin || state.isModerator); }

  function canChat(){
    const now=_now();
    if(state.banUntil && state.banUntil>now) return { ok:false, code:'ban', until:state.banUntil, reason: state.banReason||'' };
    if(state.muteUntil && state.muteUntil>now) return { ok:false, code:'mute', until:state.muteUntil, reason: state.muteReason||'' };
    return { ok:true };
  }
  function canDM(){
    const now=_now();
    if(state.banUntil && state.banUntil>now) return { ok:false, code:'ban', until:state.banUntil, reason: state.banReason||'' };
    if(state.dmBanUntil && state.dmBanUntil>now) return { ok:false, code:'dmban', until:state.dmBanUntil, reason: state.dmBanReason||'' };
    return { ok:true };
  }

  function fmtUntil(ts){
    try{ return new Date(ts).toLocaleString(); }catch(e){ return String(ts); }
  }
  function explainBlock(g){
    if(!g || g.ok) return '';
    const base = (g.code==='ban') ? 'Dočasný zákaz odesílání (ban)' :
                 (g.code==='mute') ? 'Dočasný zákaz psaní do chatu (mute)' :
                 (g.code==='dmban') ? 'Dočasný zákaz psaní do L.S.' : 'Dočasný zákaz';
    const until = g.until ? ('\nPlatí do: '+fmtUntil(g.until)) : '';
    const reason = g.reason ? ('\nDůvod: '+g.reason) : '';
    return base+until+reason;
  }

  window.MK_ACCESS = {
    state,
    set: _set,
    isStaff,
    canChat,
    canDM,
    explainBlock
  };
})();

function isModeratorUser(){ return !!window.MK_ACCESS?.state?.isModerator; }
function isStaffUser(){ return !!window.MK_ACCESS?.isStaff?.(); }
// keep legacy names used across code
function isAdminUser(_u){ return !!window.MK_ACCESS?.state?.isAdmin; }
function isAdmin(){ return !!window.MK_ACCESS?.state?.isAdmin; }

ef.set({ nick: (u.displayName||u.email||'Uživatel'), email: u.email||null, avatar: window.DEFAULT_AVATAR, role:'seeker', plan:'free', createdAt: Date.now() });
  }else{
    const v=s.val()||{};
    // keep email in usersPublic if missing
    if(u.email && !v.email) await ref.update({email:u.email});
  }
  // email -> uid index for add-friend by email
  // emails/* mapping disabled (rules no longer allow it)
}

// Presence
function setPresence(u){
  const ref=db.ref('.info/connected');
  ref.on('value', snap=>{
    if(snap.val()===false) return;
    const up=db.ref('presence/'+u.uid);
    up.onDisconnect().set({online:false,ts:firebase.database.ServerValue.TIMESTAMP});
    up.set({online:true,ts:firebase.database.ServerValue.TIMESTAMP});
  });
}

// Fetch userPublic
async function fetchUserPublic(uid){
  const up = (await db.ref('usersPublic/'+uid).get()).val();
  if (up){
    // Normalize legacy avatar paths (older DB entries used "img/..." which 404s on GitHub Pages)
    try{
      if(typeof up.avatar === 'string'){
        let a = up.avatar.trim();
        // common legacy patterns
        if(a === 'img/default-avatar.svg') a = 'assets/img/default-avatar.svg';
        a = a.replace(/^\.\/?img\//, 'assets/img/');
        a = a.replace(/^img\//, 'assets/img/');
        if(a) up.avatar = a;
      }
      if(!up.avatar) up.avatar = window.DEFAULT_AVATAR;
    }catch(e){}
    return up;
  }
  const u = (await db.ref('users/'+uid).get()).val();
  if (u) return { nick: u.name || u.nick || 'Uživatel', email: u.email, avatar: u.avatar };
  return { nick:'Uživatel', avatar: window.DEFAULT_AVATAR };
}
const USER_CACHE = new Map();
async function getUser(uid){
  if(USER_CACHE.has(uid)) return USER_CACHE.get(uid);
  const u = await fetchUserPublic(uid);
  // presence
  try{
    const p=await db.ref('presence/'+uid).get();
    u.online=!!(p.val()&&p.val().online);
  }catch{}
  USER_CACHE.set(uid,u);
  return u;
}

// file to dataURL (no storage)
async function fileToDataURL(f){
  return await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
}

