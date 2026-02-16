// === Firebase init ===
// Guard against accidental double initialization ("already exists" crashes)
try{
  if(!firebase.apps || !firebase.apps.length){
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }
}catch(e){
  // If already initialized, just reuse existing app.
  try{ firebase.app(); }catch(_){ console.warn('[firebase] init error', e); }
}
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
    "UNAVENÝ ZE ŠABLON?",
    "PRÁCE V REÁLNÉM ČASE.",
    "NAJDI ZAMĚSTNAVATELE HNED.",
    "NEKONEČNÁ LENTA NABÍDEK.",
    "NOVÉ PRONÁJMY A SLUŽBY.",
    "AUTOPOSTING PRO INZERÁTY."
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
function isAdminUser(u){
  // Single source of truth: roles/{uid}/admin (cached by auth-state watcher)
  try{ return !!(window.__myRoles && window.__myRoles.admin === true); }catch(e){ return false; }
}
function isModeratorUser(u){
  try{ if(window.__myRoles && window.__myRoles.moderator===true) return true; }catch(e){}
  return false;
}
function isAdmin(){ return isAdminUser(firebase.auth().currentUser); }

// Ensure usersPublic and email index for friends
async function ensureMyPublic(u){
  if(!u) return;
  const fallbackNick = (()=>{
    try{
      const suf = String(u.uid||'').slice(-4);
      return suf ? `Uživatel #${suf}` : 'Uživatel';
    }catch(e){ return 'Uživatel'; }
  })();
  const ref = db.ref('usersPublic/'+u.uid);
  const s = await ref.get();
  if(!s.exists()){
    await ref.set({
      // Privacy: never default nickname to e-mail.
      nick: (u.displayName || fallbackNick),
      avatar: window.DEFAULT_AVATAR,
      role:'seeker',
      plan:'free',
      createdAt: Date.now()
    });
  }else{
    const v=s.val()||{};
    const nick = v.nick || u.displayName || fallbackNick;
    const upd = {
      nick,
      avatar: v.avatar || window.DEFAULT_AVATAR,
      updatedAt: Date.now()
    };

    // Privacy cleanup: remove legacy public e-mail field if it exists.
    if(v.email) upd.email = null;


    // Backfill defaults (older rows or legacy create flows)
    if(!v.role) upd.role = 'seeker';
    if(!v.plan) upd.plan = 'free';
    if(!v.createdAt) upd.createdAt = Date.now();

    try{ await ref.update(upd); }catch(e){}

    // Privacy: never store email in usersPublic. If legacy record still has it, remove.
    if(v.email){
      try{ await ref.child('email').remove(); }catch(e){}
    }
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
  // Fallback: attempt to read private /users (will fail for other users due to rules).
  try{
    const u = (await db.ref('users/'+uid).get()).val();
    if (u) return { nick: u.name || u.nick || 'Uživatel', avatar: u.avatar };
  }catch(e){
    // ignore permission errors
  }
  return { nick:'Uživatel', avatar: window.DEFAULT_AVATAR };
}
const USER_CACHE = new Map();
const USER_LITE_CACHE = new Map();

// Lite profile helper (no presence lookup) – used for fast lists (DM inbox, chat render, etc.)
async function getUserLite(uid){
  if(!uid) return { nick:'Uživatel', avatar: window.DEFAULT_AVATAR };
  try{ if(USER_LITE_CACHE.has(uid)) return USER_LITE_CACHE.get(uid); }catch(e){}
  const u = await fetchUserPublic(uid);
  try{ USER_LITE_CACHE.set(uid, u); }catch(e){}
  return u;
}

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

window.getUserLite = getUserLite;

// Minimal admin/mod audit log
// Writes: auditLogs/{id} { actorUid, action, target, ts, meta? }
async function auditLog(action, target, meta){
  const me = auth?.currentUser;
  if(!me) return;
  try{
    const act = String(action || '').trim().slice(0,60);
    if(!act) return;

    let tgt = '';
    if(typeof target === 'string') tgt = target;
    else if(target == null) tgt = '';
    else{
      try{ tgt = JSON.stringify(target); }catch(e){ tgt = String(target); }
    }
    tgt = tgt.trim().slice(0,140);

    let metaStr = null;
    if(typeof meta === 'string') metaStr = meta;
    else if(meta != null){
      try{ metaStr = JSON.stringify(meta); }catch(e){ metaStr = String(meta); }
    }
    if(metaStr != null) metaStr = String(metaStr).slice(0,1000);

    const payload = {
      actorUid: me.uid,
      action: act,
      target: tgt,
      ts: Date.now()
    };
    if(metaStr != null) payload.meta = metaStr;

    await db.ref('auditLogs').push(payload);
  }catch(e){
    // do not surface audit failures to user
  }
}

window.auditLog = auditLog;

// file -> dataURL (no storage)
// If opts.max/maxW/maxH is provided and the file is an image, it will be resized
// on the client to a medium size (fast mobile UX).
async function fileToDataURL(f, opts){
  opts = opts || {};
  const max = Number(opts.max || 0);
  const maxW = Number(opts.maxW || max || 0);
  const maxH = Number(opts.maxH || max || 0);
  const quality = (opts.quality == null) ? 0.82 : Number(opts.quality);

  const isImg = !!(f && f.type && String(f.type).startsWith('image/'));
  const shouldResize = isImg && (maxW > 0 || maxH > 0);

  // default: keep original
  const readOriginal = () => new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = ()=>rej(r.error || new Error('read error'));
    r.readAsDataURL(f);
  });

  if(!shouldResize) return await readOriginal();

  // Resize with canvas
  return await new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onerror = ()=>reject(r.error || new Error('read error'));
    r.onload = ()=>{
      const img = new Image();
      img.onerror = ()=>reject(new Error('Bad image'));
      img.onload = ()=>{
        try{
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if(!w || !h) return resolve(r.result);

          const mw = maxW || w;
          const mh = maxH || h;
          const scale = Math.min(1, mw / w, mh / h);
          const nw = Math.max(1, Math.round(w * scale));
          const nh = Math.max(1, Math.round(h * scale));

          const canvas = document.createElement('canvas');
          canvas.width = nw;
          canvas.height = nh;
          const ctx = canvas.getContext('2d', {alpha:false});
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0,0,nw,nh);
          ctx.drawImage(img, 0, 0, nw, nh);

          let out;
          try{
            out = canvas.toDataURL('image/jpeg', Math.min(0.92, Math.max(0.5, quality)));
          }catch(e){
            out = canvas.toDataURL();
          }
          resolve(out);
        } catch(e){
          resolve(r.result);
        }
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  }).catch(async ()=>{
    // fallback
    return await readOriginal();
  });
}

