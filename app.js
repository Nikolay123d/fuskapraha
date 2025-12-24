
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
async function promptLogin(){
  const email = prompt('Zadejte e-mail:');
  if(!email) return;
  const pass = prompt('Zadejte heslo (min. 6):');
  if(!pass) return;
  try{
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(e1){
    try{
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      try{ await cred.user.sendEmailVerification(); toast('Potvrzovací e-mail odeslán (zkontrolujte SPAM)'); }catch{}
    }catch(e2){
      alert((e2 && e2.message) || 'Chyba přihlášení');
    }
  }
}
$('#btnLogin')?.addEventListener('click', async ()=>{
  cookieBanner();
  await unlockAudio();
  await ensureNotifications();
  await promptLogin();
});
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
    d.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
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
    const u=auth.currentUser; if(!u) return toast('Přihlaste se');
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
    el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="name">${esc(u.nick||'Uživatel')}</div>`+
      (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
      (m.img?`<div class="text"><img src="${esc(m.img)}"></div>`:'')+
      `</div>`;
    box.appendChild(el);
    playSound('dm');
    notify('Nová DM', (u.nick||'Uživatel')+': '+(m.text||''));
  });
}
$('#dmOpen')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; if(!me) return toast('Přihlaste se');
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
    const me=auth.currentUser; if(!me) return toast('Přihlaste se');
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
    $('#dmText').value=''; $('#dmPhoto').value=''; pendingDmImg=null;
    toast('Odesláno'); playSound('ok');
    renderDM(room);
  }catch(e){ console.error(e); playSound('err'); }
});

// === FRIENDS ===
async function friendItem(uid, st){
  const wrap=document.createElement('div'); wrap.className='msg';
  const u=await getUser(uid);
  wrap.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
                   `<div class="bubble"><div class="name">${esc(u.nick||'Uživatel')}</div>`+
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
    const me=auth.currentUser; if(!me) return toast('Přihlaste se');
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
  const u=auth.currentUser; if(!u) return toast('Přihlaste se');
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
    d.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="name">${esc(u.nick||'Uživatel')}</div>`+
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
    const u=auth.currentUser; if(!u) return toast('Přihlaste se');
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
  const u=auth.currentUser; if(!u) return toast('Přihlaste se');
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
