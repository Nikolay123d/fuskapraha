
// === config injected ===
// ==== Firebase config
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  authDomain: "praga-4baee.firebaseapp.com",
  databaseURL: "https://praga-4baee-default-rtdb.firebaseio.com",
  projectId: "praga-4baee",
  storageBucket: "praga-4baee.appspot.com",
  messagingSenderId: "336023952536",
  appId: "1:336023952536:web:f7437feaa25b6eadcd04ed",
  measurementId: "G-BGDJD6R12N"
};

// Admin email
window.ADMIN_EMAIL = "urciknikolaj642@gmail.com";

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
  ok: new Audio('./sounds/ok.wav'),
  err: new Audio('./sounds/err.wav'),
  party: new Audio('./sounds/celebration.wav')
};
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
function notify(title, body){
  try{
    if(!('Notification' in window)) return;
    if(localStorage.getItem('notifAllowed')!=='1') return;
    if(document.visibilityState==='visible') return; // only when tab hidden
    new Notification(title, { body });
    playSound('notif');
  }catch{}
}

// Cookie banner
function cookieBanner(){
  const b = $('#cookieBanner');
  if(!b) return;
  const ok = localStorage.getItem('cookieAccepted')==='1';
  if(ok){ b.style.display='none'; return; }
  b.style.display='block';
  $('#cookieAccept')?.addEventListener('click', ()=>{
    localStorage.setItem('cookieAccepted','1');
    document.cookie = 'cookieAccepted=1; path=/; max-age=31536000';
    b.style.display='none';
    // Ask permissions once user interacted
    unlockAudio();
    ensureNotifications();
  }, {once:true});
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
window.addEventListener('DOMContentLoaded', ()=> showView(localStorage.getItem('lastView')||'view-chat'));

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
  window.addEventListener('DOMContentLoaded', apply);
  $('#citySelect')?.addEventListener('change', ()=>{ setCity($('#citySelect').value); apply(); loadChat(); loadRent(); loadFriends(); loadPoi(); });
  document.addEventListener('change', (e)=>{
    const t=e.target;
    if(t && t.id==='wallCamera'){
      const f=t.files && t.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{
        const c=getCity();
        try{ localStorage.setItem('wall_'+c, r.result); }catch{}
        document.documentElement.style.setProperty('--wall', `url('${r.result}')`);
        toast('Pozadí bylo změněno');
        playSound('ok');
      };
      r.readAsDataURL(f);
      t.value='';
    }
  });
})();

// === Firebase init ===
firebase.initializeApp(window.FIREBASE_CONFIG);
const auth=firebase.auth();
const db=firebase.database();
const stg=firebase.storage(); // not used when USE_STORAGE=false

function isAdmin(u){ return (u && u.email && u.email.toLowerCase() === String(window.ADMIN_EMAIL).toLowerCase()); }

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
function closeModalAuth(){ const m=$('#modalAuth'); if(m) m.hidden=true; }

async function googleSignIn(){
  const provider = new firebase.auth.GoogleAuthProvider();
  await auth.signInWithPopup(provider);
}

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
$('#btnSignout')?.addEventListener('click', ()=> auth.signOut().catch(()=>{}));
$('#resetPass')?.addEventListener('click', async ()=>{
  const email = auth.currentUser?.email || prompt('E-mail pro obnovu:');
  if(!email) return;
  try{ await auth.sendPasswordResetEmail(email); toast('E-mail pro obnovu odeslán (zkontrolujte SPAM)'); }
  catch(e){ alert(e.message||'Chyba'); }
});

// === Preloader control ===
function hidePreloader(){
  const p = $('#preloader'); if(!p) return;
  p.classList.add('hidden');
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
  const key = String(window.ADMIN_EMAIL).toLowerCase().replace(/\./g,',');
  db.ref('emails/'+key).get().then(s=>{
    const creatorUid = s.val() && s.val().uid;
    if(!creatorUid) return toast('Nelze najít zakladatele (uid)');
    openDMRoom(me.uid, creatorUid);
    showView('view-dm');
    // set input
    $('#dmTo').value = creatorUid;
  });
}
function sendFriendRequestToCreator(){
  const me = auth.currentUser;
  if(!me) return;
  const key = String(window.ADMIN_EMAIL).toLowerCase().replace(/\./g,',');
  db.ref('emails/'+key).get().then(s=>{
    const creatorUid = s.val() && s.val().uid;
    if(!creatorUid) return toast('Nelze najít zakladatele');
    db.ref('friendRequests/'+creatorUid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
    toast('Žádost odeslána');
    playSound('ok');
  });
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
  if(offChat){ offChat(); offChat=null; }
  const city=getCity();
  const ref=db.ref('messages/'+city).limitToLast(50);
  const cb=async (snap)=>{
    const m=snap.val()||{};
    if(m.deleted) return;
    const u=await getUser(m.by);
    const d=document.createElement('div'); d.className='msg';
    const name=(u?.nick||u?.name||'Uživatel')+(u?.online?'<span class="online"></span>':'');
    d.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
                  `<div class="bubble"><div class="name">${name}</div>`+
                  (m.text? `<div class="text">${esc(m.text)}</div>`:'' )+
                  (m.img||m.photo? `<div class="text"><img src="${esc(m.img||m.photo)}"></div>`:'')+
                  `</div>`;
    feed.appendChild(d);
    playSound('chat');
    notify('Nová zpráva', (u?.nick||'Uživatel')+': '+(m.text||''));
  };
  ref.on('child_added', cb);
  offChat=()=> ref.off('child_added', cb);
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
function openDMRoom(a,b){
  const room = dmKey(a,b);
  // set membership for both
  db.ref('privateMembers/'+room+'/'+a).set(true);
  db.ref('privateMembers/'+room+'/'+b).set(true);
  // render
  renderDM(room);
}
async function renderDM(room){
  const box=$('#dmFeed'); if(!box) return;
  box.innerHTML='';
  if(DM_REF){ try{ DM_REF.off(); }catch{} }
  const ref=db.ref('privateMessages/'+room).limitToLast(50);
  DM_REF = ref;
  ref.on('child_added', async snap=>{
    const m=snap.val()||{};
    const u=await getUser(m.by);
    const el=document.createElement('div'); el.className='msg';
    el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div>`+
      (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
      (m.img?`<div class="text"><img src="${esc(m.img)}"></div>`:'')+
      `</div>`;
    box.appendChild(el);
    playSound('dm');
    notify('Nová DM', (u.nick||'Uživatel')+': '+(m.text||''));
  });
}
$('#dmOpen')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; if(!me){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(me.emailVerified===false){
      const until=getVerifyDeadline(me);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
  let to=$('#dmTo').value.trim(); if(!to) return;
  if(to.includes('@')){ const uid=await resolveUidByEmail(to); if(!uid) return alert('Email neznám'); to=uid; }
  openDMRoom(me.uid,to);
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
  try{
    const me=auth.currentUser; if(!me){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(me.emailVerified===false){
      const until=getVerifyDeadline(me);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
    let to=$('#dmTo').value.trim(); if(!to) return;
    if(to.includes('@')){ const uid=await resolveUidByEmail(to); if(!uid) return alert('Email neznám'); to=uid; $('#dmTo').value=uid; }
    const text=$('#dmText').value.trim();
    const img=pendingDmImg;
    if(!text && !img) return;
    const room=dmKey(me.uid,to);
    // ensure members
    await db.ref('privateMembers/'+room+'/'+me.uid).set(true);
    await db.ref('privateMembers/'+room+'/'+to).set(true);
    await db.ref('privateMessages/'+room).push({by:me.uid, ts:Date.now(), text: text||null, img: img||null});
    await db.ref('inboxMeta/'+to+'/'+room).set({from:me.uid, ts:Date.now()});
    await db.ref('inboxMeta/'+me.uid+'/'+room).set({from:to, ts:Date.now()});
    $('#dmText').value=''; $('#dmPhoto').value=''; pendingDmImg=null;
    toast('Odesláno'); playSound('ok');
    renderDM(room);
  }catch(e){ console.error(e); playSound('err'); }
});

// === FRIENDS ===
async function friendItem(uid, st){
  const wrap=document.createElement('div'); wrap.className='msg';
  const u=await getUser(uid);
  wrap.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
                   `<div class="bubble"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div>`+
                   `<div class="muted">${esc(st)}</div>`+
                   `<div class="actions">`+
                   `<button data-act="chat">Napsat</button>`+
                   (st==='pending' ? `<button data-act="accept">Přijmout</button>` : `<button data-act="remove">Odebrat</button>`) +
                   `</div></div>`;
  wrap.addEventListener('click', async (e)=>{
    const a=e.target.dataset.act; if(!a) return;
    const me=auth.currentUser; if(!me) return;
    if(a==='accept'){
      await db.ref('friends/'+me.uid+'/'+uid).set('accepted');
      await db.ref('friends/'+uid+'/'+me.uid).set('accepted');
      await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
      loadFriends();
    }
    if(a==='remove'){
      await db.ref('friends/'+me.uid+'/'+uid).remove();
      await db.ref('friends/'+uid+'/'+me.uid).remove();
      loadFriends();
    }
    if(a==='chat'){
      $('#dmTo').value = uid;
      openDMRoom(me.uid, uid);
      showView('view-dm');
    }
  });
  return wrap;
}
let FR_REQ_REF=null;
async function loadFriends(){
  const me=auth.currentUser; if(!me) return;
  const box=$('#friendsList'); if(!box) return;
  box.innerHTML='';
  const rq=(await db.ref('friendRequests/'+me.uid).get()).val()||{};
  const pendingUids = Object.keys(rq);
  // badge
  $('#friendsBadge').textContent = pendingUids.length ? `🔔${pendingUids.length}` : '';
  for(const uid of pendingUids){
    box.appendChild(await friendItem(uid, 'pending'));
  }
  const fr=(await db.ref('friends/'+me.uid).get()).val()||{};
  for(const [uid,st] of Object.entries(fr)){
    box.appendChild(await friendItem(uid, st));
  }
  // realtime listen for incoming requests
  if(FR_REQ_REF){ try{ FR_REQ_REF.off(); }catch{} }
  FR_REQ_REF = db.ref('friendRequests/'+me.uid);
  FR_REQ_REF.on('child_added', async (snap)=>{
    const fromUid = snap.key;
    if(!fromUid) return;
    const u=await getUser(fromUid);
    toast('Nová žádost o přátelství: '+(u.nick||'Uživatel'));
    playSound('chat');
    notify('Žádost o přátelství', u.nick||'Uživatel');
    loadFriends();
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
    d.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div>`+
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
    if(!isAdmin(u) && !isMod) return;
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
  const n=$('#setNick').value.trim(); if(n) up.nick=n;
  const a=$('#setAvatarUrl').value.trim(); if(a) up.avatar=a;
  const r=$('#setRole').value; if(r) up.role=r;
  await db.ref('usersPublic/'+u.uid).update(up);
  $('#setNick').value=''; $('#setAvatarUrl').value='';
  refreshMe();
  toast('Uloženo'); playSound('ok');
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
auth.onAuthStateChanged(async (u)=>{

  try{ if(u) await ensureUserPublic(u); }catch{}
  try{ if(u) await enforceVerifyWindow(u); }catch{}
  // admin-only visibility
  $$('.adm-only').forEach(x=> x.style.display = (u && isAdmin(u)) ? '' : 'none');
  // profile display
  if(u){
    await ensureMyPublic(u);
    setPresence(u);
    await refreshMe();
    await loadFriends();
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

// If user opens as file:// and auth is slow, still hide preloader via fail-safe



// ===== Stage 5 UI enhancements (friends inbox, DM threads, profile locks, bots/admin) =====
(function(){
  const db = firebase.database(); const auth = firebase.auth();
  const ADMIN_EMAIL = String(window.ADMIN_EMAIL||'').toLowerCase();

  function isAdminUser(u){ return !!(u && u.email && u.email.toLowerCase()===ADMIN_EMAIL); }

  // --- modal helpers ---
  function openModal(id){ const el=document.getElementById(id); if(el) el.hidden=false; }
  function closeModal(id){ const el=document.getElementById(id); if(el) el.hidden=true; }

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
  document.getElementById('dmNewBtn')?.addEventListener('click', ()=>openModal('modalDmNew'));
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
    if(reqBox) reqBox.innerHTML='';
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

  // --- User card modal ---
  async function showUserCard(uid){
    const u = await getUser(uid);
    document.getElementById('userCardAva').src = u.avatar||window.DEFAULT_AVATAR;
    document.getElementById('userCardNick').textContent = u.nick||'Uživatel';
    document.getElementById('userCardRole').textContent = u.role==='employer' ? '· Zaměstnavatel' : '· Hledám práci';
    document.getElementById('userCardOnline').textContent = u.online ? 'online' : 'offline';
    openModal('modalUserCard');

    const me = auth.currentUser;
    const dmBtn=document.getElementById('userCardDm');
    const addBtn=document.getElementById('userCardAddFriend');

    dmBtn.onclick = ()=>{
      if(!me) return toast('Přihlaste se');
      openDMRoom(me.uid, uid); closeModal('modalUserCard'); showView('view-dm');
    };
    addBtn.onclick = async ()=>{
      if(!me) return toast('Přihlaste se');
      await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
      toast('Žádost odeslána'); closeModal('modalUserCard');
    };
  }
  window.showUserCard = showUserCard;

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
        <div class="ava" data-uid="${other}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}" alt=""></div>
        <div class="bubble" style="width:100%;cursor:pointer">
          <div class="name" data-uid="${uid}"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${u.online?'online':'offline'}</span></div>
          <div class="muted" style="font-size:12px">${new Date(v[room].ts||0).toLocaleString()}</div>
        </div>`;
      row.addEventListener('click', ()=>{
        openDMRoom(me.uid, other);
        closeModal('modalDmNew');
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
    if(badge){ badge.style.display = (plan && plan!=='free' && plan!=='none') ? 'inline-block':'none'; }

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
      const u=auth.currentUser; if(!u) return;
      await db.ref('premiumRequests').push({uid:u.uid, email:u.email||'', ts:Date.now(), status:'pending'});
      toast('Žádost o Premium odeslána');
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
          <div class="name" data-uid="${uid}"><b>${esc(u.nick||'Uživatel')}</b> · ${esc(r.type)}</div>
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

    const boxP=document.getElementById('adminPremiumRequests'); if(boxP) boxP.innerHTML='';
    const ps = await db.ref('premiumRequests').orderByChild('ts').limitToLast(50).get();
    const pv=ps.val()||{};
    const pids=Object.keys(pv).sort((a,b)=>(pv[b].ts||0)-(pv[a].ts||0));
    for(const id of pids){
      const r=pv[id]; if(!r||r.status!=='pending') continue;
      const u=await getUser(r.uid);
      const el=document.createElement('div'); el.className='msg';
      el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name" data-uid="${uid}"><b>${esc(u.nick||'Uživatel')}</b> · Premium</div>
          <div class="muted">${esc(r.email||'')}</div>
          <div class="actions">
            <button data-act="grant">Udělit</button>
            <button data-act="reject">Zamítnout</button>
          </div>
        </div>`;
      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='grant'){
          await db.ref('usersPublic/'+r.uid).update({plan:'premium', premiumSince:Date.now()});
          await db.ref('premiumRequests/'+id).update({status:'granted', decidedAt:Date.now()});
          toast('Premium uděleno');
          loadAdminRequests();
        }
        if(act==='reject'){
          await db.ref('premiumRequests/'+id).update({status:'rejected', decidedAt:Date.now()});
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
      }
    }
  });

  // When admin tab open, refresh
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('[data-view="view-admin"]');
    if(t){ setTimeout(()=>{ if(isAdminUser(auth.currentUser)){ loadAdminRequests(); loadBotsUI(); } }, 120); }
  });

})();


// Chat avatar -> user card
document.getElementById('chatFeed')?.addEventListener('click', (e)=>{
  const a = e.target.closest('.ava');
  if(!a) return;
  const uid = a.getAttribute('data-uid');
  if(uid) { e.stopPropagation(); window.showUserCard && window.showUserCard(uid); }
});
