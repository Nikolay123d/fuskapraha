

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
  if(text) el.textContent = text;
  el.style.display = show ? 'block' : 'none';
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
  apiKey: "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  authDomain: "praga-4baee.firebaseapp.com",
  databaseURL: "https://praga-4baee-default-rtdb.firebaseio.com",
  projectId: "praga-4baee",
  // New style bucket name (Firebase Storage)
  storageBucket: "praga-4baee.firebasestorage.app",
  messagingSenderId: "336023952536",
  appId: "1:336023952536:web:f7437feaa25b6eadcd04ed",
  measurementId: "G-BGDJD6R12N"
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
const PREMIUM_QR_IMG = './img/csob-qr.png';
const PREMIUM_PLANS = {
  vip: { code:'vip', title:'VIP', price:100, period:'navždy', desc:'VIP umožní psát zaměstnavateli do L.S., přístup k chatu, až 10 foto v chatu.' },
  premium: { code:'premium', title:'Premium', price:150, period:'měsíc', desc:'Premium: speciální design profilu, možnost vytvářet inzeráty, bot s omezenými možnostmi (bez avatara), interval 1 hod.' },
  premiumPlus: { code:'premiumPlus', title:'Premium+', price:200, period:'měsíc', desc:'Premium+: bot má avatar, text+foto pod příspěvkem, zprávy botu chodí vám do DM pod značkou reklama.' }
};

// Use Firebase Storage? If false — images are saved as dataURL into DB
window.USE_STORAGE = false;

// Default avatar
window.DEFAULT_AVATAR = "./img/default-avatar.svg";

// Fix asset paths for dist
window.DEFAULT_AVATAR = "./img/default-avatar.svg";

// === tiny helpers ===
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
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
  chat: new Audio('./sounds/new_chat.wav'),
  dm: new Audio('./sounds/new_dm.wav'),
  notify: new Audio('./sounds/new_chat.wav'),
  friend: new Audio('./sounds/ok.wav'),
  ok: new Audio('./sounds/ok.wav'),
  err: new Audio('./sounds/err.wav'),
  party: new Audio('./sounds/celebration.wav')
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

// Notifications permission
async function ensureNotifications(){
  if(!('Notification' in window)) return;
  const saved = localStorage.getItem('notifAllowed');
  if(saved==='1' || saved==='0') return;
  try{
    const p = await Notification.requestPermission();
    localStorage.setItem('notifAllowed', p==='granted' ? '1' : '0');
  }catch(e){
    localStorage.setItem('notifAllowed','0');
  }
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

    // After cookie decision, ask notifications once.
    try{
      await ensureNotifications();
      // If granted, init push + schedule promo offer
      if(('Notification' in window) && Notification.permission==='granted'){
        try{ localStorage.setItem('notifAllowed','1'); }catch(e){}
        try{ if(auth?.currentUser) initPushForUser(auth.currentUser); }catch(e){}
        schedulePromoOffer();
      }
    }catch(e){}
  };

  $('#cookieAll')?.addEventListener('click', ()=>setChoice('all'));
  $('#cookieNecessary')?.addEventListener('click', ()=>setChoice('necessary'));
  $('#cookieReject')?.addEventListener('click', ()=>setChoice('reject'));
}


// Views
function showView(id){
  $$('.view').forEach(v=>v.classList.remove('active'));
  const el = $('#'+id);
  if(el){ el.classList.add('active'); localStorage.setItem('lastView', id); }
  if(id==='view-map'){ setTimeout(()=>{ try{ window.__MAP && window.__MAP.invalidateSize(true); }catch{} }, 150); }
}
document.addEventListener('click',(e)=>{
  const t = e.target.closest('[data-view]');
  if(!t) return;
  e.preventDefault();
  $$('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  showView(t.dataset.view);
});
window.addEventListener('DOMContentLoaded', ()=>{
  try{ cookieBanner(); }catch(e){}
  try{ showView(localStorage.getItem('lastView')||'view-chat'); }catch(e){}
});
// City state
function getCity(){
  const sel = $('#citySelect');
  const saved = localStorage.getItem('city');
  if(saved){ if(sel) sel.value=saved; return saved; }
  return sel ? sel.value : 'praha';
}
function setCity(c){ localStorage.setItem('city', c); }
window.getCity=getCity;

// Wallpaper change (per city)
(function(){
  const apply = ()=>{
    try{
      const c = getCity();
      const w = localStorage.getItem('wall_'+c) || localStorage.getItem('wall');
      if(w){
        document.documentElement.style.setProperty('--wall', `url('${w}')`);
      }
    }catch{}
  };
  window.addEventListener('DOMContentLoaded', ()=>{ apply();
  try{ wirePromoOffer(); }catch(e){}
  try{ initDmMobileModal(); }catch(e){} startWallpaperSync(); startAuthWallpaperSync(); startChatWallpaperSync(); startDmWallpaperSync(); startProfileWallpaperSync(); startSoundsSync(); });
  $('#citySelect')?.addEventListener('change', ()=>{ setCity($('#citySelect').value); apply(); startWallpaperSync(); startAuthWallpaperSync(); startChatWallpaperSync(); startDmWallpaperSync(); startProfileWallpaperSync(); startSoundsSync(); wireScrollDown('chatFeed','chatScrollDown');
  // Members UI
  $('#membersRefresh')?.addEventListener('click', ()=>loadMembers());
  $('#membersSearch')?.addEventListener('input', ()=>loadMembers());

loadChat(); loadRent(); loadFriends(); loadMembers(); loadPoi(); });
  document.addEventListener('change', (e)=>{ 
  const t=e.target;
  if(t && t.id==='wallCamera'){
    if(!window.__isAdmin){
      toast('Pouze administrátor může měnit pozadí.');
      t.value='';
      return;
    }
    const f=t.files && t.files[0];
    if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      const data=r.result;
      setMainWallpaper(data);
      try{ localStorage.setItem('wall_main', data); }catch(_){}
      // Persist for all devices
      db.ref('settings/wallpapers/main').set({url:data, ts:Date.now(), by: (auth.currentUser?auth.currentUser.uid:null)});

      toast('Pozadí bylo uloženo pro všechny uživatele.');
    };
    r.readAsDataURL(f);
  }
if(t && t.id==='authWallCamera'){
  if(!window.__isAdmin){
    toast('Pouze administrátor může měnit pozadí.');
    t.value='';
    return;
  }
  const f=t.files && t.files[0];
  if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    const data=r.result;
    setAuthWallpaper(data);
    try{ localStorage.setItem('wall_auth', data); }catch(_){}
    db.ref('settings/wallpapers/auth').set({url:data, ts:Date.now(), by: (auth.currentUser?auth.currentUser.uid:null)});
    toast('Pozadí přihlášení bylo uloženo pro všechny uživatele.');
    t.value='';
  };
  r.readAsDataURL(f);
}

}); 
})();

// ==
// === Firebase init ===
firebase.initializeApp(window.FIREBASE_CONFIG);
const auth=firebase.auth();
const db=firebase.database();

// --- FCM messaging (push notifications) ---
let messaging = null;
let __swReg = null;
try{ messaging = firebase.messaging(); }catch(e){ messaging = null; }

async function initPushForUser(u){
  try{
    if(!u || !messaging) return;
    if(!('serviceWorker' in navigator)) return;
    if(!('Notification' in window)) return;
    // permission must be granted
    if(Notification.permission !== 'granted') return;
    const vapidKey = String(window.WEB_PUSH_VAPID_KEY||window.FCM_PUBLIC_VAPID_KEY||'').trim();
    if(!vapidKey || vapidKey.startsWith('PASTE_')){
      console.warn('[FCM] Missing WEB_PUSH_VAPID_KEY');
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
let currentDmPeerUid = null;

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



// Admin helpers (UID-based)
function isAdminUser(u){
  if(!u) return false;
  const em = (u.email || (u.providerData&&u.providerData[0]&&u.providerData[0].email) || '').toLowerCase();
  const list = (window.ADMIN_EMAILS||[window.ADMIN_EMAIL]).filter(Boolean).map(e=>String(e).toLowerCase());
  return list.includes(em);
}
function isAdmin(){ return isAdminUser(firebase.auth().currentUser); }

// Ensure usersPublic and email index for friends
async function ensureMyPublic(u){
  if(!u) return;
  const ref = db.ref('usersPublic/'+u.uid);
  const s = await ref.get();
  if(!s.exists()){
    await ref.set({ nick: u.displayName || 'Uživatel', email: u.email||null, avatar: window.DEFAULT_AVATAR, role:'seeker', plan:'free', createdAt: Date.now() });
  }else{
    const v=s.val()||{};
    // keep email in usersPublic if missing
    if(u.email && !v.email) await ref.update({email:u.email});
  }
  // email -> uid index for add-friend by email
  if(u.email){
    const key = u.email.toLowerCase().replace(/\./g,',');
    await db.ref('emails/'+key).set({uid:u.uid, ts: Date.now()});
  }
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
  if (up) return up;
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

// === AUTH UI ===

// === Auth UI (Email/Password + Google) ===
function openModalAuth(mode='login'){
  const m = $('#modalAuth'); if(!m) return;
  // Ensure preloader never blocks clicks in auth
  try{ hidePreloader(); }catch(e){}
  document.body.classList.add('auth-open');
  m.hidden=false;
  m.dataset.mode = mode;
  $('#authTitle').textContent = (mode==='login' ? 'Přihlášení' : 'Registrace');
  $('#authNickRow').style.display = (mode==='register' ? '' : 'none');
  $('#authRoleRow').style.display = (mode==='register' ? '' : 'none');
  $('#authLoginBtn').style.display = (mode==='login' ? '' : 'none');
  $('#authRegisterBtn').style.display = (mode==='register' ? '' : 'none');
  $('#authSwitchToRegister').style.display = (mode==='login' ? '' : 'none');
  $('#authSwitchToLogin').style.display = (mode==='register' ? '' : 'none');
}
function closeModalAuth(){
  const m=$('#modalAuth');
  if(m) m.hidden=true;
  document.body.classList.remove('auth-open');
}

async function googleSignIn(){
  const provider = new firebase.auth.GoogleAuthProvider();
  // Mobile browsers often block popups; use redirect there.
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'');
  if(isMobile){
    await auth.signInWithRedirect(provider);
    return;
  }
  await auth.signInWithPopup(provider);
}

// Handle Google redirect return (mobile)
try{
  auth.getRedirectResult().catch(()=>{});
}catch{}

async function ensureUserPublic(u, extra={}){
  if(!u) return;
  const pubRef = db.ref('usersPublic/'+u.uid);
  const snap = await pubRef.get();
  const cur = snap.val() || {};
  const merged = {
    email: u.email || cur.email || '',
    nick: cur.nick || extra.nick || '',
    role: cur.role || extra.role || '',
    avatar: cur.avatar || extra.avatar || window.DEFAULT_AVATAR,
    createdAt: cur.createdAt || Date.now()
  };
  await pubRef.update(merged);

  // email index for friend add
  if(u.email){
    const key = String(u.email).toLowerCase().replace(/\./g,',');
    await db.ref('emails/'+key).update({uid: u.uid});
  }
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

// === Preloader control ===
function hidePreloader(){
  const p = $('#preloader'); if(!p) return;
  p.classList.add('hidden');
  try{ document.body.classList.add('app-ready'); }catch(e){}
  try{
    const mb = document.getElementById('marqueeBar'); if(mb) mb.style.display='';
    const tob = document.getElementById('topOnlineBar'); if(tob) tob.style.display='';
  }catch(e){}
}
(function preloaderFailSafe(){
  const btn = $('#goSiteBtn');
  btn && btn.addEventListener('click', hidePreloader);
  let sec=10;
  const tEl = $('#preloaderTimer');
  const iv = setInterval(()=>{
    sec--;
    if(tEl) tEl.textContent = 'Automaticky přejdeme za '+sec+' s';
    if(sec<=0){ clearInterval(iv); hidePreloader(); }
  }, 1000);
  // hard stop
  setTimeout(hidePreloader, 11500);
})();

// === Greeting (Dasha only, non-anon) ===
const GREET_EMAIL = 'darausoan@gmail.com';
let greetedThisSession = false;
function openDmWithCreator(){
  const me = auth.currentUser;
  if(!me) return;
  const creatorUid = window.ADMIN_UID;
  openDMRoom(me.uid, creatorUid);
  showView('view-dm');
  $('#dmTo').value = creatorUid;
}
function sendFriendRequestToCreator(){
  const me = auth.currentUser;
  if(!me) return;
  const creatorUid = window.ADMIN_UID;
  db.ref('friendRequests/'+creatorUid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
  toast('Žádost odeslána');
  playSound('ok');
}
function showGreeting(){
  const o=$('#greetOverlay'); if(!o) return;
  o.hidden=false;
  playSound('party');
  let sec=10; const sEl=$('#greetSec');
  const iv=setInterval(()=>{ sec--; if(sEl) sEl.textContent=String(sec); if(sec<=0){ clearInterval(iv); o.hidden=true; } }, 1000);
}
$('#greetClose')?.addEventListener('click', ()=> $('#greetOverlay').hidden=true);
$('#greetDm')?.addEventListener('click', ()=> { $('#greetOverlay').hidden=true; openDmWithCreator(); });
$('#greetAddFriend')?.addEventListener('click', ()=> { $('#greetOverlay').hidden=true; sendFriendRequestToCreator(); });

// === CHAT ===
let offChat=null;
async function loadChat(){
  const feed=$('#chatFeed'); if(!feed) return;
  feed.innerHTML='';
  setMiniLoad('chatMiniLoad','Načítáme chat…', true);
  if(offChat){ offChat(); offChat=null; }
  const city=getCity();
  const ref=db.ref('messages/'+city).limitToLast(50);
  const upsert=async (snap)=>{
    setMiniLoad('chatMiniLoad','', false);
    const m=snap.val()||{};
    if(m.deleted) return;
    // If message already rendered (child_changed), replace content
    let d = feed.querySelector(`[data-mid="${snap.key}"]`);
    const isNew = !d;
    if(!d){ d=document.createElement('div'); d.className='msg'; d.dataset.mid = snap.key; }
    const u = (m.bot && m.botUid===PREMIUM_BOT_UID) ? {nick:'Bot — Privilegia', avatar:'./img/rose.svg'} : await getUser(m.by);
    const planVal = String(u.plan||'').toLowerCase();
    const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
    const isAdm = (isAdminUser(auth.currentUser) && auth.currentUser && m.by === auth.currentUser.uid);
    const badges = (isAdm?'<span class="badge admin">ADMIN</span>':'') + (isPrem?'<span class="badge premium">PREMIUM</span>':'');
    const name = `<span class="nick" data-uid="${esc(m.by)}">${esc(u?.nick||u?.name||'Uživatel')}</span>`+
                 badges +
                 (u?.online?'<span class="online"></span>':'');
    d.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
                  `<div class="bubble"><div class="meta"><div class="name">${name}</div><div class="time">${fmtTime(m.ts||m.createdAt||Date.now())}</div></div>`+
                  (m.text? `<div class="text">${esc(m.text)}</div>`:'' )+
                  (m.img||m.photo? `<div class="text"><img src="${esc(m.img||m.photo)}"></div>`:'')+
                  (isAdminUser(auth.currentUser) && m.by ? `<div class="adminActions">
                    <button data-act="del" title="Smazat">🗑</button>
                    <button data-act="ban" title="Ban 24h">⛔</button>
                    <button data-act="mute" title="Mute 24h">🔇</button>
                  </div>` : '')+
                  `</div>`;
    if(isNew) feed.appendChild(d);
    // Admin moderation actions
    if(isAdminUser(auth.currentUser)){
      d.querySelectorAll('.adminActions button').forEach(btn=>{
        btn.addEventListener('click', async (ev)=>{
          ev.stopPropagation();
          const act = btn.dataset.act;
          const id = snap.key;
          try{
            if(act==='del'){
              await db.ref('messages/'+city+'/'+id).remove();
              toast('Smazáno');
            }
            if(act==='ban'){
              if(confirm('Ban uživatele na 24h?')){
                await db.ref('bans/'+m.by).set({until: Date.now()+24*60*60*1000, by: auth.currentUser.uid, ts: Date.now()});
                toast('Ban 24h');
              }
            }
            if(act==='mute'){
              if(confirm('Mute uživatele na 24h?')){
                await db.ref('mutes/'+m.by).set({until: Date.now()+24*60*60*1000, by: auth.currentUser.uid, ts: Date.now()});
                toast('Mute 24h');
              }
            }
          }catch(e){ console.error(e); toast('Chyba'); playSound('err'); }
        });
      });
    }
    if(isNew){
      playSound('chat');
      notify('Nová zpráva', (u?.nick||'Uživatel')+': '+(m.text||''));
    }
  };

  const onRemove = (snap)=>{
    const el = feed.querySelector(`[data-mid="${snap.key}"]`);
    if(el) el.remove();
  };

  ref.on('child_added', upsert);
  ref.on('child_changed', upsert);
  ref.on('child_removed', onRemove);
  offChat=()=>{ ref.off('child_added', upsert); ref.off('child_changed', upsert); ref.off('child_removed', onRemove); };
}
window.addEventListener('DOMContentLoaded', loadChat);
$('#citySelect')?.addEventListener('change', loadChat);

let pendingChatImg=null;
$('#msgPhoto')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  if(!f){ pendingChatImg=null; return; }
  pendingChatImg = await fileToDataURL(f);
  toast('Foto přidáno. Stiskněte Odeslat.');
  playSound('ok');
});
$('#sendBtn')?.addEventListener('click', async ()=>{
  try{
    const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
    const ban=await db.ref('bans/'+u.uid).get();
    if(ban.exists() && ban.val().until > Date.now()) return alert('Dočasný zákaz odesílání');
    const text=$('#msgText').value.trim();
    const img=pendingChatImg;
    if(!text && !img) return;
    const m={by:u.uid, ts:Date.now(), text: text||null, img: img||null};
    await db.ref('messages/'+getCity()).push(m);
    // cleanup
    $('#msgText').value='';
    $('#msgPhoto').value='';
    pendingChatImg=null;
    playSound('ok');
    toast('Odesláno');
  }catch(e){
    console.error(e);
    playSound('err');
  }
});

// === DM (strict members) ===
function dmKey(a,b){ return [a,b].sort().join('_'); }
async function resolveUidByEmail(email){
  const key=email.toLowerCase().replace(/\./g,',');
  const s=await db.ref('emails/'+key).get();
  return (s.val()&&s.val().uid)||null;
}
let DM_REF=null;
async function openDMRoom(a,b){
  const room = dmKey(a,b);
  // set global DM state for sending
  currentDmRoom = room;
  // determine peer uid (other participant)
  const meUid = auth.currentUser ? auth.currentUser.uid : null;
  currentDmPeerUid = (meUid && meUid===a) ? b : (meUid && meUid===b ? a : b);
  // Ensure membership is written BEFORE we attach listeners / try to send
  const updates = {};
  updates['privateMembers/'+room+'/'+a] = true;
  updates['privateMembers/'+room+'/'+b] = true;
  try{
    await db.ref().update(updates);
  }catch(e){
    // fallback (best effort)
    try{ await db.ref('privateMembers/'+room+'/'+a).set(true); }catch(_){}
    try{ await db.ref('privateMembers/'+room+'/'+b).set(true); }catch(_){}
  }
  // render
  renderDM(room);
}
async function renderDM(room){
  setMiniLoad('dmMiniLoad','Načítáme zprávy…', true);
  wireScrollDown('dmFeed','dmScrollDown');

  const box=$('#dmFeed'); if(!box) return;
  box.innerHTML='';
  showPremiumBotPanel(room);
  if(DM_REF){ try{ DM_REF.off(); }catch{} }
  const ref=db.ref('privateMessages/'+room).limitToLast(50);
  DM_REF = ref;
  ref.on('child_added', async snap=>{
    setMiniLoad('dmMiniLoad','', false);
    const m=snap.val()||{};
    const u = (m.bot && m.botUid===PREMIUM_BOT_UID) ? {nick:'Bot — Privilegia', avatar:'./img/rose.svg'} : await getUser(m.by);
    const el=document.createElement('div'); el.className='msg';
    el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
      (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
      (m.img?`<div class="text"><img src="${esc(m.img)}"></div>`:'')+
      `</div>`;
    box.appendChild(el);
    playSound('dm');
    notify('Nová DM', (u.nick||'Uživatel')+': '+(m.text||''));
  });
}
// --- Premium bot helpers ---
function isPremiumBotRoom(room){
  const u=auth.currentUser; if(!u) return false;
  const botRoom = dmKey(u.uid, PREMIUM_BOT_UID);
  return room === botRoom;
}

function showPremiumBotPanel(room){
  const panel = document.getElementById('botPremiumPanel');
  if(!panel) return;
  panel.style.display = isPremiumBotRoom(room) ? 'block' : 'none';
  if(!isPremiumBotRoom(room)) return;

  const stepEl = document.getElementById('botPremiumStep');
  const actions = document.getElementById('botPremiumActions');
  const hint = document.getElementById('botPremiumHint');

  const stateKey = 'premium_bot_state_'+auth.currentUser.uid;
  const st = JSON.parse(localStorage.getItem(stateKey) || '{"step":"choose","plan":null,"proof":null}');
  actions.innerHTML = '';

  function setState(next){
    localStorage.setItem(stateKey, JSON.stringify(next));
    showPremiumBotPanel(room);
  }

  if(st.step==='choose'){
    stepEl.textContent = '1/3 — vyberte balíček';
    hint.textContent = 'Bot vysvětlí rozdíly. Vyberte si jednu variantu.';
    const intro = `Ahoj! Jsem bot pro nákup privilegií.

Vyber si balíček a já ti vysvětlím výhody.

VIP (100 Kč / navždy): zvýraznění profilu, badge VIP, vyšší důvěra.
Premium (150 Kč / měsíc): badge Premium, možnost reklamy 1× za hodinu (přes bot) + přednostní pozice.
Premium+ (200 Kč / měsíc): vše z Premium + výrazné zvýraznění a reklama 1× za 30 minut.

Po výběru ti pošlu QR kód. Zaplať a pošli sem fotku/printscreen platby, pak stiskni "Podat žádost".`;
    ensureBotIntro(room, intro);
    addPlanBtn('VIP 100 Kč', 'vip');
    addPlanBtn('Premium 150 Kč', 'premium');
    addPlanBtn('Premium+ 200 Kč', 'premiumPlus');
    return;
  }

  if(st.step==='pay'){
    stepEl.textContent = '2/3 — platba';
    hint.innerHTML = `Zvolený balíček: <b>${PREMIUM_PLANS[st.plan].title}</b> (${PREMIUM_PLANS[st.plan].price} Kč / ${PREMIUM_PLANS[st.plan].period}).<br>Naskenujte QR, zaplaťte a pošlete sem fotku/printscreen.`;
    addBtn('Změnit balíček', ()=>setState({step:'choose',plan:null,proof:null}), 'ghost');
    addBtn('Zobrazit QR', ()=>botSendQR(room), 'primary');
    addBtn('Už jsem poslal(a) fotku', ()=>setState({...st, step:'submit'}), 'primary');
    // send QR once
    ensureBotQR(room);
    return;
  }

  if(st.step==='submit'){
    stepEl.textContent = '3/3 — odeslat žádost';
    hint.textContent = 'Pošlete prosím fotku/printscreen platby do chatu s botem a pak stiskněte "Podat žádost".';
    addBtn('Zpět', ()=>setState({...st, step:'pay'}), 'ghost');
    addBtn('Podat žádost', async ()=>{
      const proof = await findLastProof(room);
      if(!proof) return toast('Nevidím žádnou fotku platby. Pošlete ji do tohoto chatu.');
      const req = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || '',
        plan: st.plan,
        price: PREMIUM_PLANS[st.plan].price,
        period: PREMIUM_PLANS[st.plan].period,
        proofImg: proof,
        ts: Date.now(),
        status: 'pending'
      };
      const id = db.ref('payments/requests/'+auth.currentUser.uid).push().key;
      await db.ref('payments/requests/'+auth.currentUser.uid+'/'+id).set(req);
      botSay(room, '✅ Žádost byla odeslána adminovi. Děkujeme! (Stav: pending)');
      toast('Žádost odeslána do admin sekce');
      setState({step:'choose',plan:null,proof:null});
    }, 'primary');
    return;
  }

  function addBtn(text, fn, cls){
    const b=document.createElement('button');
    b.type='button';
    b.textContent=text;
    b.className = cls==='ghost'?'ghost':'';
    b.onclick=fn;
    actions.appendChild(b);
  }
  function addPlanBtn(label, plan){
    addBtn(label, async ()=>{
      // write user selection
      await db.ref('privateMessages/'+room).push({by: auth.currentUser.uid, text: `Chci koupit: ${PREMIUM_PLANS[plan].title}`, ts: Date.now()});
      botSay(room, `Vybral(a) jste ${PREMIUM_PLANS[plan].title}. Cena: ${PREMIUM_PLANS[plan].price} Kč (${PREMIUM_PLANS[plan].period}).`);
      botSendQR(room);
      setState({step:'pay',plan,proof:null});
    }, 'primary');
  }
}

async function botSay(room, text){
  return db.ref('privateMessages/'+room).push({by: auth.currentUser.uid, botUid: PREMIUM_BOT_UID, text, ts: Date.now(), bot:true});
}

async function botSendQR(room){
  await botSay(room, 'Prosím zaplaťte pomocí QR a pošlete sem fotku/printscreen platby.');
  await db.ref('privateMessages/'+room).push({by: auth.currentUser.uid, botUid: PREMIUM_BOT_UID, img: PREMIUM_QR_IMG, text:'QR platba', ts: Date.now(), bot:true});
}

async function ensureBotIntro(room, introText){
  // if no bot message exists, send intro
  const snap = await db.ref('privateMessages/'+room).limitToLast(5).get();
  const v=snap.val()||{};
  const anyBot = Object.values(v).some(m=>m && m.bot===true && m.botUid===PREMIUM_BOT_UID);
  if(!anyBot){
    await botSay(room, introText);
  }
  // ensure membership meta (inbox)
  const u=auth.currentUser; if(!u) return;
  await db.ref('inboxMeta/'+u.uid+'/'+room).set({with: PREMIUM_BOT_UID, ts: Date.now(), lastTs: Date.now(), title:'Bot — Nákup privilegia'});
}

async function ensureBotQR(room){
  // send QR if not sent yet in last 10 msgs
  const snap = await db.ref('privateMessages/'+room).limitToLast(10).get();
  const v=snap.val()||{};
  const hasQr = Object.values(v).some(m=>m && m.bot===true && m.botUid===PREMIUM_BOT_UID && m.img===PREMIUM_QR_IMG);
  if(!hasQr){
    await botSendQR(room);
  }
}

async function findLastProof(room){
  const snap = await db.ref('privateMessages/'+room).limitToLast(30).get();
  const v=snap.val()||{};
  const msgs = Object.values(v).filter(Boolean).sort((a,b)=>(a.ts||0)-(b.ts||0));
  // last image sent by current user
  for(let i=msgs.length-1;i>=0;i--){
    const m=msgs[i];
    if(m.by===auth.currentUser.uid && m.img) return m.img;
  }
  return null;
}

async function openPremiumBot(){
  const u=auth.currentUser;
  if(!u) return toast('Nejprve se přihlaste');
  openDMRoom(u.uid, PREMIUM_BOT_UID);
  showView('view-dm');
  const room = dmKey(u.uid, PREMIUM_BOT_UID);
  showPremiumBotPanel(room);
}

$('#dmOpen')?.addEventListener('click', async ()=>{
  const me=auth.currentUser;
  if(!me){ openModalAuth('login'); return; }
  showView('view-dm');
  // refresh inbox threads if helper exists
  try{ if(typeof window.loadDMThreads==='function') window.loadDMThreads(); }catch(e){}
});
let pendingDmImg=null;
$('#dmPhoto')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  if(!f){ pendingDmImg=null; return; }
  pendingDmImg = await fileToDataURL(f);
  toast('Foto přidáno do DM. Stiskněte Odeslat.');
  playSound('ok');
});
$('#dmSend')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; 
  if(!me){ openModalAuth('login'); return; }
  if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
  if(me.emailVerified===false){
    const until=getVerifyDeadline(me);
    if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
  }

  if(!currentDmRoom || !currentDmPeerUid){
    toast('Nejprve otevřete konverzaci');
    playSound('err');
    return;
  }

  try{
    const text=$('#dmText')?.value?.trim() || '';
    const img=pendingDmImg;
    if(!text && !img) return;

    const room=currentDmRoom;
    const ts=Date.now();

    // Ensure members in correct order for current rules:
    // 1) set myself
    await db.ref('privateMembers/'+room+'/'+me.uid).set(true);
    // 2) now (as a member) set peer
    await db.ref('privateMembers/'+room+'/'+currentDmPeerUid).set(true);

    // 3) write message
    await db.ref('privateMessages/'+room).push({by:me.uid, ts, text: text||null, img: img||null});

    // 4) update inbox meta (room-keyed)
    await db.ref('inboxMeta/'+currentDmPeerUid+'/'+room).set({with: me.uid, ts, lastTs: ts});
    await db.ref('inboxMeta/'+me.uid+'/'+room).set({with: currentDmPeerUid, ts, lastTs: ts});

    if($('#dmText')) $('#dmText').value='';
    if($('#dmPhoto')) $('#dmPhoto').value='';
    pendingDmImg=null;
    toast('Odesláno'); playSound('ok');
    renderDM(room);
  }catch(e){ console.error(e); playSound('err'); }
});

// === FRIENDS ===
async function friendItem(uid, st){
  const wrap=document.createElement('div'); wrap.className='msg';
  const u=await getUser(uid);
  const nick = u?.nick || 'Uživatel';
  const avatar = u?.avatar || window.DEFAULT_AVATAR;
  const status = st || 'friend';
  const actions = (()=>{
    if(status==='pending'){
      return `<button data-act="accept">Přijmout</button><button data-act="decline" class="danger">Odmítnout</button>`;
    }
    return `<button data-act="chat">Napsat</button><button data-act="remove" class="danger">Odebrat</button>`;
  })();
  wrap.innerHTML = `
    <div class="ava" data-uid="${esc(uid)}"><img src="${esc(avatar)}"></div>
    <div class="bubble">
      <div class="name" data-uid="${esc(uid)}">${esc(nick)}</div>
      <div class="muted">${esc(status)}</div>
      <div class="actions">${actions}</div>
    </div>`;
  wrap.addEventListener('click', async (e)=>{
    const a=e.target?.dataset?.act; if(!a) return;
    const me=auth.currentUser; if(!me){ setMiniLoad('friendsMiniLoad','', false); return; }
    try{
      if(a==='accept'){
        await db.ref().update({
          ['friends/'+me.uid+'/'+uid]:'accepted',
          ['friends/'+uid+'/'+me.uid]:'accepted'
        });
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        try{ await db.ref('notifications/'+uid).push({ts:Date.now(), type:'friendAccepted', from:me.uid}); }catch{}
        toast('Přidáno');
        loadFriends();
        return;
      }
      if(a==='decline'){
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        toast('Odmítnuto');
        loadFriends();
        return;
      }
      if(a==='remove'){
        await db.ref('friends/'+me.uid+'/'+uid).remove();
        await db.ref('friends/'+uid+'/'+me.uid).remove();
        toast('Odebráno');
        loadFriends();
        return;
      }
      if(a==='chat'){
        // open DM with that user
        openDM(uid);
        return;
      }
    }catch(err){ console.error(err); playSound('err'); }
  });
  return wrap;
}
let FR_REQ_REF=null;
let __friendsReqSig='';
let __friendsReqTimer=null;


// === Members (online) ===
let offMembers=null;
async function loadMembers(){
  const feed = $('#membersFeed'); if(!feed) return;
  const q = ($('#membersSearch')?.value||'').toLowerCase().trim();
  feed.innerHTML = '';
  setMiniLoad('membersMiniLoad','Načítáme účastníky…', true);
  if(offMembers){ offMembers(); offMembers=null; }

  // Listen to last active
  setTimeout(()=>setMiniLoad('membersMiniLoad','', false), 1200);
 users (presence)
  const ref = db.ref('presence').orderByChild('ts').limitToLast(200);
  const cb = async (snap)=>{
    const pres = snap.val()||{};
    const now = Date.now();
    const uids = Object.keys(pres).filter(uid=>{
      const ts = pres[uid]?.ts||0;
      return (now - ts) < 5*60*1000; // online in last 5 min
    }).reverse();

    // render
    feed.innerHTML='';
    for(const uid of uids){
      try{
        const up = await db.ref('usersPublic/'+uid).get();
        const pu = up.val()||{};
        const nick = String(pu.nick||pu.name||'Uživatel');
        if(q && !nick.toLowerCase().includes(q)) continue;

        const row = document.createElement('div');
        row.className='member';
        const isAdm = isAdminUser(auth.currentUser);
        row.innerHTML =
          `<div class="ava"><img src="${esc(pu.avatar||window.DEFAULT_AVATAR)}"></div>`+
          `<div class="meta"><div class="name">${esc(nick)}</div>`+
          `<div class="sub">${esc(uid)}</div></div>`+
          `<div class="acts">`+
            `<button class="ghost" data-act="dm" data-uid="${esc(uid)}">DM</button>`+
            (isAdm ? `<button class="ghost" data-act="ban" data-uid="${esc(uid)}">Ban 24h</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="mute" data-uid="${esc(uid)}">Mute 24h</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="grant7" data-uid="${esc(uid)}">Donat 7d</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="grant30" data-uid="${esc(uid)}">Donat 30d</button>` : ``)+
          `</div>`;
        row.addEventListener('click', (e)=>{
          const btn = e.target?.closest('button'); 
          if(!btn) return;
          e.preventDefault(); e.stopPropagation();
          const act = btn.dataset.act;
          const tuid = btn.dataset.uid;
          if(act==='dm'){ openDM(tuid); return; }
          if(!isAdminUser(auth.currentUser)) return;
          if(act==='ban'){
            if(confirm('Ban uživatele na 24h?')){
              db.ref('bans/'+tuid).set({until: Date.now()+24*60*60*1000, by: auth.currentUser.uid, ts: Date.now()});
            }
          }
          if(act==='mute'){
            if(confirm('Mute uživatele na 24h?')){
              db.ref('mutes/'+tuid).set({until: Date.now()+24*60*60*1000, by: auth.currentUser.uid, ts: Date.now()});
            }
          }
          if(act==='grant7' || act==='grant30'){
            const days = (act==='grant7') ? 7 : 30;
            if(confirm('Vydat donat / privilegium na '+days+' dní?')){
              const until = Date.now() + days*24*60*60*1000;
              db.ref('grants/'+tuid).push({type:'donation', until, ts: Date.now(), by: auth.currentUser.uid});
              toast('Vydáno: '+days+' dní');
            }
          }
});
        feed.appendChild(row);
      }catch{}
    }
  };
  ref.on('value', cb);
  offMembers=()=>ref.off('value', cb);
}


async function loadFriends(){
  setMiniLoad('friendsMiniLoad','Načítáme přátele…', true);
  const me=auth.currentUser; if(!me) return;
  const reqBox=$('#friendsRequests');
  const listBox=$('#friendsList');
  if(reqBox){ reqBox.innerHTML=''; reqBox.style.display='none'; }
  if(listBox) listBox.innerHTML='';
  const reqEmpty=$('#friendsReqEmpty');
  const listEmpty=$('#friendsListEmpty');
  if(reqEmpty) reqEmpty.style.display='none';
  if(listEmpty) listEmpty.style.display='none';

  // incoming requests
  const rq=(await db.ref('friendRequests/'+me.uid).get()).val()||{};
  const pendingUids = Object.keys(rq||{});
  const cnt=pendingUids.length;

  const topBadge=document.getElementById('friendsBadgeTop');
  const tabBadge=document.getElementById('friendsBadgeTab');
  if(topBadge){ topBadge.textContent = cnt ? String(cnt) : ''; topBadge.style.display = cnt ? 'inline-flex' : 'none'; }
  if(tabBadge){ tabBadge.textContent = cnt ? ('('+cnt+')') : ''; }
  const inlineBadge=document.getElementById('friendsBadgeInline');
  if(inlineBadge){ inlineBadge.textContent = cnt ? ('('+cnt+')') : ''; }

  const reqSection = document.getElementById('friendsReqSection');
  if(cnt===0){
    if(reqSection) reqSection.style.display='none';
  }else if(reqBox){
    if(reqSection) reqSection.style.display='flex';
    reqBox.style.display='flex';
    const note=document.getElementById('friendsReqNote');
    if(note) note.textContent = 'Máte nové žádosti o přátelství ('+cnt+')';

    for(const uid of pendingUids){
      reqBox.appendChild(await friendItem(uid, 'pending'));
    }
  }

  // accepted friends
  const fr=(await db.ref('friends/'+me.uid).get()).val()||{};
  const friendsUids = Object.keys(fr||{});
  if(friendsUids.length===0){
    if(listEmpty) listEmpty.style.display='block';
  }else if(listBox){
    for(const [uid,st] of Object.entries(fr)){
      listBox.appendChild(await friendItem(uid, st || 'friend'));
    }
  }

  setMiniLoad('friendsMiniLoad','', false);

  // realtime listen for incoming requests (badge refresh)
  if(FR_REQ_REF){ try{ FR_REQ_REF.off(); }catch(e){} }
  FR_REQ_REF=db.ref('friendRequests/'+me.uid);
  FR_REQ_REF.on('value', (snap)=>{
    const val=snap.val()||{};
    const sig=Object.keys(val).sort().join('|');
    if(sig===__friendsReqSig) return;
    __friendsReqSig=sig;
    if(__friendsReqTimer) clearTimeout(__friendsReqTimer);
    __friendsReqTimer=setTimeout(()=>loadFriends(), 200);
  });
}
$('#friendAddBtn')?.addEventListener('click', async ()=>{
  try{
    const me=auth.currentUser; if(!me){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(me.emailVerified===false){
      const until=getVerifyDeadline(me);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
    const email=$('#friendEmail').value.trim(); if(!email) return;
    const uid = await resolveUidByEmail(email);
    if(!uid) return alert('Email neznám');
    await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
    toast('Žádost odeslána'); playSound('ok');
    $('#friendEmail').value='';
  }catch(e){ console.error(e); playSound('err'); toast('Chyba'); }
});

// === RENT (city-based) ===
function ttlDays(d){ return d*24*60*60*1000; }
async function rentAdd(){
  const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
  const title=$('#rentTitle').value.trim();
  const price=parseInt($('#rentPrice').value||'0',10);
  const ttl=parseInt($('#rentTTL').value||'0',10);
  const f=$('#rentPhoto').files && $('#rentPhoto').files[0];
  let img=null; if(f){ img=await fileToDataURL(f); }
  const d={by:u.uid, title, price, img, status:'active', ts:Date.now()};
  if(ttl>0) d.expiresAt= Date.now()+ttlDays(ttl);
  await db.ref('rentMessages/'+getCity()).push(d);
  toast('Inzerát přidán'); playSound('ok');
  $('#rentTitle').value=''; $('#rentPrice').value=''; $('#rentTTL').value='0'; $('#rentPhoto').value='';
  loadRent();
}
async function loadRent(){
  const city=getCity();
  const s=await db.ref('rentMessages/'+city).get();
  const v=s.val()||{};
  const arr=Object.keys(v).map(id=>({id,...v[id]}));
  const q={status: $('#rentStatus').value, sort: $('#rentSort').value};
  let a=arr.filter(x=> !x.expiresAt || x.expiresAt>Date.now());
  if(q.status) a=a.filter(x=>x.status===q.status);
  if(q.sort==='price') a.sort((A,B)=>(+A.price||0)-(+B.price||0));
  else a.sort((A,B)=> ( (B.ts||0) - (A.ts||0) ));
  const box=$('#rentFeed'); if(!box) return;
  box.innerHTML='';
  for(const x of a){
    const u=await getUser(x.by);
    const d=document.createElement('div'); d.className='msg';
    d.innerHTML = `<div class="ava" data-uid="${esc(x.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(x.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(x.ts||0)}</div></div>`+
      `<div class="text"><b>${esc(x.title||'(bez názvu)')}</b> · ${esc(x.price||'')} Kč</div>`+
      (x.img?`<div class="text"><img src="${esc(x.img)}"></div>`:'')+
      `<div class="muted">${new Date(x.ts||Date.now()).toLocaleString()}</div>`+
      `</div>`;
    box.appendChild(d);
  }
}
$('#rentAdd')?.addEventListener('click', rentAdd);
$('#rentApply')?.addEventListener('click', loadRent);

// === MAP (city-based POI) ===
let MAP=null;
function initMap(){
  if(MAP) return;
  MAP = L.map('map').setView([50.0755, 14.4378], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(MAP);
  window.__MAP = MAP;
}
let POI_REF=null;
function loadPoi(){
  initMap();
  const city=getCity();
  // clear layers except tiles
  MAP.eachLayer(l=>{ if(l && l._url) return; try{ MAP.removeLayer(l); }catch{} });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap' }).addTo(MAP);

  if(POI_REF){ try{ POI_REF.off(); }catch{} }
  POI_REF=db.ref('map/poi/'+city);
  POI_REF.on('child_added', async snap=>{
    const v=snap.val()||{};
    const m=L.marker([v.lat||50.08, v.lng||14.43]).addTo(MAP);
    m.bindPopup(`<b>${esc(v.title||'Bod')}</b><br>${esc(v.type||'')}`);
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
window.addEventListener('DOMContentLoaded', loadPoi);

// === Profile save ===
async function refreshMe(){
  const u=auth.currentUser; if(!u) return;
  const me=await fetchUserPublic(u.uid);
  $('#myName').textContent = me.nick || me.name || 'Uživatel';
  $('#myAvatar').src = me.avatar || window.DEFAULT_AVATAR;
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

  try{ if(u) await ensureUserPublic(u); }catch{}
  try{ if(u) await enforceVerifyWindow(u); }catch{}
  // admin-only visibility (role-based)
  watchAdminRole(u);
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
    await loadFriends();
    try{ listenNotifications();
       }catch(e){}

    // v15: start bot DM engine for admin (auto-replies)
    try{ startBotDmEngine(); }catch(e){}

    // greeting only for specific email and only once per session
    if(!greetedThisSession && u.email && u.email.toLowerCase()===GREET_EMAIL){
      greetedThisSession = true;
      // ensure permissions prompt is accepted once
      cookieBanner();
      // show greeting (user gesture needed for sound; will play if allowed)
      showGreeting();
    }
    hidePreloader();
  }else{
    // keep preloader fail-safe; show logged out state
    $('#profileEmail').textContent = 'E-mail: —';
    $('#myName').textContent = 'Uživatel';
    $('#myAvatar').src = window.DEFAULT_AVATAR;
    // do not show greeting
  }
});

// Ask cookie banner on first load (non-blocking)
window.addEventListener('DOMContentLoaded', cookieBanner);

// Initialize push token once the user is logged in and notifications are allowed.
// (Background delivery requires firebase-messaging-sw.js)
try{
  auth.onAuthStateChanged((u)=>{ if(u) initPushForUser(u); });
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
    // pushState for mobile back button
    try{
      history.pushState({modal:id}, '', location.href);
    }catch(e){}
  }
  function closeModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.hidden = true;
    __openModals.delete(id);
    if(__openModals.size===0) document.body.classList.remove('modal-open');
  }
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
  document.getElementById('authClose')?.addEventListener('click', closeModalAuth);
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
      const key=email.toLowerCase().replace(/\./g,',');
      const toS=await db.ref('emails/'+key).get(); const uid=(toS.val()&&toS.val().uid);
      if(!uid) return toast('E-mail neznám');
      if(uid===me.uid) return toast('Nelze přidat sebe');
      await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
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
  setMiniLoad('chatMiniLoad','Načítáme chat…', true);
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
      const v=snap.val()||{};
      const ids=Object.keys(v).sort((a,b)=>(v[b].ts||0)-(v[a].ts||0));
      let dmCount=0, friendCount=0;
      for(const id of ids){
        const n=v[id]||{};
        if(n.type==='dm') dmCount++;
        if(n.type==='friend') friendCount++;
      }
      const dmB=document.getElementById('dmBadge');
      if(dmB){ dmB.textContent=dmCount?String(dmCount):''; dmB.style.display=dmCount?'inline-flex':'none'; }
      // friends badge is driven by friendRequests


      feed.innerHTML='';
  setMiniLoad('chatMiniLoad','Načítáme chat…', true);
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
                await db.ref('friends/'+me.uid+'/'+n.from).set('accepted');
                await db.ref('friends/'+n.from+'/'+me.uid).set('accepted');
                await db.ref('friendRequests/'+me.uid+'/'+n.from).remove();
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
                await db.ref('friends/'+me.uid+'/'+n.from).set('accepted');
                await db.ref('friends/'+n.from+'/'+me.uid).set('accepted');
                await db.ref('friendRequests/'+me.uid+'/'+n.from).remove();
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
  if(opts && opts.closeModalId){ try{ closeModal(opts.closeModalId); }catch(e){} }
  return room;
}
window.startDM = startDM;

// --- DM threads / inbox ---
  let currentDmRoom=null;
  function otherUidFromRoom(room, meUid){
    const parts = String(room).split('_');
    if(parts.length!==2) return null;
    return (parts[0]===meUid) ? parts[1] : parts[0];
  }

  async function loadDmThreads(){
    const me = auth.currentUser; if(!me) return;
    const box=document.getElementById('dmThreads'); if(!box) return;
    box.innerHTML='';
    const metaSnap = await db.ref('inboxMeta/'+me.uid).orderByChild('ts').limitToLast(50).get();
    const v = metaSnap.val()||{};
    const rooms = Object.keys(v).sort((a,b)=> (v[b].ts||0)-(v[a].ts||0));
    for(const room of rooms){
      const other = otherUidFromRoom(room, me.uid);
      if(!other) continue;
      const u = await getUser(other);
      const row=document.createElement('div');
      row.className='msg';
      row.innerHTML = `
        <div class="ava" data-uid="${esc(other)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}" alt=""></div>
        <div class="bubble" style="width:100%;cursor:pointer">
          <div class="name" data-uid="${esc(other)}"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${u.online?'online':'offline'}</span></div>
          <div class="muted" style="font-size:12px">${new Date(v[room].ts||0).toLocaleString()}</div>
        </div>`;
      row.addEventListener('click', ()=>{
        openDMRoom(me.uid, other);
        // no DM modal in this build
      });
      row.querySelector('.ava')?.addEventListener('click',(ev)=>{ ev.stopPropagation(); showUserCard(other); });
      box.appendChild(row);
    }
    const label=document.getElementById('dmWithName');
    if(label && !currentDmRoom) label.textContent='Osobní zprávy';
  }

  // Override openDMRoom to set current room and update header
  const _origOpenDMRoom = window.openDMRoom;
  window.openDMRoom = async function(a,b){
    currentDmRoom = dmKey(a,b);
    const other = (a===auth.currentUser?.uid) ? b : a;
    const u = await getUser(other);
    document.getElementById('dmWithName').textContent = u.nick||'Uživatel';
    document.getElementById('dmWithStatus').textContent = u.online?'(online)':'(offline)';
    return _origOpenDMRoom(a,b);
  };

  document.getElementById('dmClearBtn')?.addEventListener('click', ()=>{
    const box=document.getElementById('dmFeed'); if(box) box.innerHTML='';
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
      const el=document.createElement('div'); el.className='msg';
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

  async function startBotDmEngine(){
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
    const city = (document.getElementById('botEditCity')?.value||'praha').trim() || 'praha';
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
        for(const k of keys){
          const it=vv[k]||{};
          const fromU = it.from ? await getUser(it.from) : null;
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


  // Load things on auth
  auth.onAuthStateChanged(async (u)=>{
    if(u){
      try{ await ensureMyPublic(u); }catch(e){}
      try{ await loadFriendsUI(); }catch(e){}
      try{ await loadDmThreads(); }catch(e){}
      try{ await loadMyProfileUI(u); }catch(e){}
      // admin panels
      const adminTab = document.querySelector('.tab.adm-only');
      if(adminTab) adminTab.style.display = isAdminUser(u)?'inline-block':'none';
      if(isAdminUser(u)){
        loadAdminRequests();
        loadBotsUI();
        loadBotInboxUI();
        loadBotProfiles();
      }
    }
  });

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
    if(view){ showView(view); }
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
  document.getElementById('btnDMTop')?.addEventListener('click', ()=> showView('view-dm'));
  document.getElementById('btnFriendsTop')?.addEventListener('click', ()=> showView('view-friends'));
  document.getElementById('btnMe')?.addEventListener('click', ()=> showView('view-profile'));
  document.getElementById('btnBell')?.addEventListener('click', async ()=>{
    try{
      if(!('Notification' in window)){ toast?.('Prohlížeč nepodporuje oznámení'); return; }
      const res = await Notification.requestPermission();
      localStorage.setItem('notifAllowed', res==='granted' ? '1' : '0');
      toast?.(res==='granted' ? 'Oznámení povolena' : 'Oznámení zamítnuta');
    }catch(e){ console.warn(e); toast?.('Chyba při žádosti o oznámení'); }
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

window.addEventListener('DOMContentLoaded', ()=> {
  try{ initAdminSettings(); }catch(e){ console.warn(e); }
  try{ initFabMenu(); }catch(e){ console.warn(e); }
  try{ initBotsModalUI(); }catch(e){ console.warn(e); }
});

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
