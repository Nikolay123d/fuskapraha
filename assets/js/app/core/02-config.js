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
window.ADMIN_UIDS = [
  "PsnyM4j68AR2EyXZaC9ElNqnow12",
  "VrP5IzhgxmT0uKWc9UWlXSCe6nM2",
  "rN93vIzh0AUhX1YsSWb6Th6W9w82"
];

// TEMP/Fallback: Admin by email (Firebase Auth). Keep for bootstrap until /roles is stable.
window.ADMIN_EMAILS = [
  "urciknikolaj642@gmail.com",
  "urciknikolaj62@gmail.com"
];
window.ADMIN_EMAIL = window.ADMIN_EMAILS[0];

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

// Normalize avatar urls from old versions (e.g. "./img/default-avatar.svg")
function normalizeAvatarUrl(url){
  try{
    let s = String(url||'').trim();
    if(!s) return window.DEFAULT_AVATAR;
    if(s.startsWith('./img/')) s = 'assets/img/'+s.slice(6);
    else if(s.startsWith('img/')) s = 'assets/img/'+s.slice(4);
    else if(s.startsWith('/img/')) s = 'assets/img/'+s.slice(5);
    return s;
  }catch(e){
    return window.DEFAULT_AVATAR;
  }
}


// === overlay manager (prevents window-on-window issues) ===
function closeAllOverlays(opts={keep:null}){
  const keep=opts.keep;

  // Hide all modals/overlays/sheets/popups (prevents "window-on-window")
  try{
    document.querySelectorAll('.modal, .overlay, .sheet, .popup').forEach(el=>{
      if(keep && el.id===keep) return;
      try{ el.hidden=true; }catch(e){}
      try{ el.classList.remove('open','show','active'); }catch(e){}
    });
  }catch(e){}

  // Ensure DM mobile overlay is fully closed (moves DOM back)
  try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){}

  // Explicit legacy ids (some are not marked as modal)
  const ids=['fabMenu','dmMobileOverlay','modalUserCard','modalAuth','promoModal','greetOverlay','cookieModal','notifPrompt'];
  ids.forEach(id=>{
    if(keep===id) return;
    const el=document.getElementById(id);
    if(!el) return;
    try{ el.hidden=true; }catch(e){}
    try{ el.classList.remove('open','show','active'); }catch(e){}
  });

  // Clear body flags
  document.body.classList.remove('modal-open');
  document.body.classList.remove('auth-open');
  document.body.classList.remove('dm-room-open');

  // Drawer
  const d=document.getElementById('drawer');
  const o=document.getElementById('drawerOverlay');
  if(d && keep!=='drawer'){ d.classList.remove('open'); }
  if(o && keep!=='drawer'){ o.hidden=true; }

  // Blur focused input (mobile keyboards)
  try{ document.activeElement && document.activeElement.blur && document.activeElement.blur(); }catch(e){}

  // Single source of truth for modal state (if present)
  try{ if(window.MK && window.MK.state) window.MK.state.modal = null; }catch(e){}
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

