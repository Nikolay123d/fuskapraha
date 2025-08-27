// Core app logic
const DEFAULT_AVATAR = "public/images/avatar.jpg";
const ADMIN_EMAIL    = "urciknikolaj642@gmail.com";

// UI helpers
const tabButtons   = document.querySelectorAll('.tab-button');
const tabContents  = document.querySelectorAll('.tab-content');
const bellBtn      = document.getElementById('bellBtn');
const bellBadge    = document.getElementById('bellBadge');
const bellModal    = document.getElementById('bellModal');
const bellClose    = document.getElementById('bellClose');
const onlineNeon   = document.getElementById('onlineNeon');

function setActiveTab(id){
  tabButtons.forEach(b=>b.classList.toggle('active', b.dataset.target===id));
  tabContents.forEach(c=> c.style.display = (c.id===id) ? 'block' : 'none');
  if (id==='mapTab'){
    if(!window.__mapInitOnce){ initLeaflet(); window.__mapInitOnce=true; }
    setTimeout(()=>{ try{ map.invalidateSize(false); }catch{} }, 60);
  }
}
tabButtons.forEach(btn=> btn.addEventListener('click', ()=> setActiveTab(btn.dataset.target)));

// Sound
let audioCtx=null; function ensureAudio(){ if(!audioCtx){ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } }
function beep(freq=880,dur=120,type='sine',vol=0.15){ if(!window.__soundEnabled) return; ensureAudio(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(audioCtx.destination); o.start(); setTimeout(()=>{ g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.08); o.stop(audioCtx.currentTime+0.1); }, dur); }
const SND={ notify(){beep(1200,140,'triangle',0.18)}, sent(){beep(760,90,'sine',0.14)}, error(){beep(320,220,'square',0.18)} };
window.__soundEnabled=false;
document.getElementById('enableSoundBtn').addEventListener('click',()=>{ window.__soundEnabled=true; ensureAudio(); SND.notify(); });

// Firebase init
firebase.initializeApp(window.PF_FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.database();

// Presence
function updateOnlineCount(){ db.ref('presence').on('value', snap=>{ const val=snap.val()||{}; const real=Object.keys(val).length; onlineNeon.textContent=`Онлайн (прибл.): ${real*10}`; }); }
updateOnlineCount();
window.addEventListener('beforeunload', async ()=>{ try{ if(auth.currentUser) await db.ref('presence/'+auth.currentUser.uid).remove(); }catch{} });

// Auth modal
const authModal=document.getElementById('authModal'); const modalClose=document.getElementById('modalClose');
const registerForm=document.getElementById('registerForm'); const loginForm=document.getElementById('loginForm');
const loginShow=document.getElementById('loginShow'); const backToRegister=document.getElementById('backToRegister');
const registerSubmit=document.getElementById('registerSubmit'); const loginSubmit=document.getElementById('loginSubmit');
const regError=document.getElementById('regError'); const loginError=document.getElementById('loginError');

function showAuth(){ authModal.classList.add('show'); regError.textContent=''; loginError.textContent=''; }
function hideAuth(){ authModal.classList.remove('show'); }
modalClose.addEventListener('click', hideAuth);
loginShow.addEventListener('click',()=>{ registerForm.style.display='none'; loginForm.style.display='block'; });
backToRegister.addEventListener('click',()=>{ registerForm.style.display='block'; loginForm.style.display='none'; });

registerSubmit.addEventListener('click', async ()=>{
  regError.textContent='';
  const nick=document.getElementById('nickInput').value.trim();
  const email=document.getElementById('emailInput').value.trim();
  const pass=document.getElementById('passwordInput').value.trim();
  if(!nick || !email || pass.length<6){ regError.textContent='Заповніть поля (пароль ≥ 6)'; SND.error(); return; }
  try{
    const cred=await auth.createUserWithEmailAndPassword(email,pass);
    await cred.user.updateProfile({ displayName:nick, photoURL:DEFAULT_AVATAR });
    await db.ref('users/'+cred.user.uid).set({ nick,email,avatar:DEFAULT_AVATAR,createdAt:Date.now() });
    await db.ref('presence/'+cred.user.uid).set({ ts:Date.now(), nick });
    hideAuth(); SND.notify();
  }catch(e){ regError.textContent=e.message||String(e); SND.error(); }
});

loginSubmit.addEventListener('click', async ()=>{
  loginError.textContent='';
  try{ await auth.signInWithEmailAndPassword(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value.trim()); hideAuth(); SND.notify(); }
  catch(e){ loginError.textContent=e.message||String(e); SND.error(); }
});

// Profile button
document.getElementById('profileBtn').onclick=()=>{ if(!auth.currentUser) showAuth(); else openProfile(auth.currentUser.uid,true); };

// Notifications
function renderNotifItem(id,v){ const row=document.createElement('div'); row.style.cssText='padding:8px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center'; row.innerHTML=`<div style="flex:1"><div style="font-weight:700">${(v.type||'info').toUpperCase()}</div><div style="font-size:13px">${v.text||''}</div></div>`; document.getElementById('notifList').prepend(row); }
function subscribeNotifications(uid){ if(!uid) return; db.ref('notifications/'+uid).on('child_added',snap=>{ renderNotifItem(snap.key,snap.val()||{}); bellBadge.style.display='inline-block'; const n=Number(bellBadge.textContent||'0')+1; bellBadge.textContent=String(n); SND.notify(); }); }
bellBtn.addEventListener('click',()=>{ bellModal.classList.add('show'); bellBadge.textContent='0'; bellBadge.style.display='none'; });
bellClose.addEventListener('click',()=> bellModal.classList.remove('show'));

// Presence + admin flag
const ADMIN_EMAIL = "urciknikolaj642@gmail.com";
window.__isAdmin=false;
auth.onAuthStateChanged(async (u)=>{
  document.getElementById('profileBtn').style.background=`url(${(u&&u.photoURL)||DEFAULT_AVATAR}) center/cover`;
  if(u){ await db.ref('presence/'+u.uid).set({ ts:Date.now(), nick: u.displayName||u.email }); }
  if(u){ try{ const roleSnap=await db.ref('users/'+u.uid+'/role').get(); const role=roleSnap.exists()?roleSnap.val():null; window.__isAdmin = (u.email===ADMIN_EMAIL)||role==='admin'; }catch{ window.__isAdmin=(u.email===ADMIN_EMAIL); } } else { window.__isAdmin=false; }
  if(u){ subscribeNotifications(u.uid); refreshFriendsBlocks(); renderDMInbox(); }
});

// Helpers
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }
function timeStr(ts){ return new Date(ts).toLocaleString(); }

// Profile modal (simplified)
async function openProfile(uid,isSelf=false){
  alert("Профіль (спрощено для цієї версії). Повна версія в admin.js");
}

// Chat rendering and send (links only for images)
const messagesEl=document.getElementById('messages'); const chatAreaMain=document.getElementById('chatArea');
const rentMessagesEl=document.getElementById('rentMessages'); const chatAreaRent=document.getElementById('rentArea');
let MSG_LIMIT=300;

function renderMessage(m,container){ if(!m||!m.ts) return; const wrap=document.createElement('div'); wrap.className='message'+((auth.currentUser&&m.uid===auth.currentUser.uid)?' self':''); const avatar=document.createElement('img'); avatar.className='avatar'; avatar.src=m.avatar||DEFAULT_AVATAR; avatar.alt=m.nick||'avatar'; avatar.title=m.nick||'Профіль'; const txt=document.createElement('div'); txt.className='message-content'; const meta=document.createElement('div'); meta.className='message-meta'; meta.textContent=`${m.nick||'Анонім'} · ${timeStr(m.ts)}` + (m.recipientUid?' · особисте':''); txt.appendChild(meta); if(m.text){ const p=document.createElement('div'); p.className='text'; p.innerText=m.text; txt.appendChild(p); } if(m.image){ const im=document.createElement('img'); im.src=m.image; im.className='chat-image'; im.alt='Фото'; txt.appendChild(im); } wrap.appendChild(avatar); wrap.appendChild(txt); container.appendChild(wrap); container.parentElement.scrollTop = container.parentElement.scrollHeight; }

db.ref('messages').limitToLast(MSG_LIMIT).on('child_added',snap=>{ const m=snap.val(); m.id=snap.key; renderMessage(m, messagesEl); });
db.ref('rentMessages').limitToLast(MSG_LIMIT).on('child_added',snap=>{ const m=snap.val(); m.id=snap.key; renderMessage(m, rentMessagesEl); });

function activeChatPath(){ return document.getElementById('rentTab').classList.contains('active') ? 'rentMessages' : 'messages'; }

async function isBanned(uid){ const s=await db.ref('settings/userFlags/'+uid+'/banned').get(); return s.val()===true; }
async function canSend(){ return !!auth.currentUser && !(await isBanned(auth.currentUser.uid)); }

function setupSend(areaPrefix){
  const urlEl = document.getElementById(`${areaPrefix}FileUrl`);
  const txtEl = document.getElementById(`${areaPrefix}MessageInput`);
  const btnEl = document.getElementById(`${areaPrefix}SendButton`);
  btnEl.addEventListener('click', async ()=>{
    if(!auth.currentUser){ showAuth(); return; }
    if(!await canSend()){ alert('Ваш акаунт обмежено (бан)'); return; }
    const text = txtEl.value.trim();
    const img  = (urlEl && urlEl.value.trim()) || null;
    if(!text && !img) return;
    const msg={ uid:auth.currentUser.uid, nick:auth.currentUser.displayName||auth.currentUser.email||'Анонім', avatar:auth.currentUser.photoURL||DEFAULT_AVATAR, text:text||null, image:img||null, ts:Date.now() };
    try{ await db.ref(activeChatPath()).push(msg); txtEl.value=''; if(urlEl) urlEl.value=''; SND.sent(); }catch{ alert('Не вдалося відправити'); }
  });
}
setupSend("");       // main chat
setupSend("rent");   // rent chat

// Help cards (with provided images)
(function initHelp(){
  const data=[
    {img:"public/images/hospital.webp", title:"Nemocnice Motol", sub:"V Úvalu 84"},
    {img:"public/images/lawyers.jpg", title:"Юридична допомога", sub:"Консультації"},
    {img:"public/images/shops.jpg", title:"Українські магазини", sub:"Продукти"}
  ];
  const hg=document.getElementById('helpGrid');
  hg.innerHTML = data.map(i=>`<div class="help-card"><img src="${i.img}"><h3>${i.title}</h3><p>${i.sub}</p></div>`).join('');
})();

// Map
let map, markers=[], poi=[];
function initLeaflet(){
  map=L.map('map').setView([50.0755,14.4378],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  poi=[
    {t:'volunteer',name:'Український волонтерський центр',p:[50.087,14.43]},
    {t:'aid',      name:'Центр допомоги UA',               p:[50.09,14.47]},
    {t:'pharmacy', name:'Аптека Praha 1',                  p:[50.07,14.41]},
    {t:'pharmacy', name:'Аптека Praha 3',                  p:[50.084,14.45]},
    {t:'volunteer',name:'Volunteers Hub',                  p:[50.08,14.50]},
    {t:'aid',      name:'Пункт видачі гуманітарки',        p:[50.095,14.39]}
  ];
  renderPoi(poi);
  document.getElementById('centerBtn').onclick=()=> map.setView([50.0755,14.4378],12);
  document.querySelectorAll('#mapTab button[data-f]').forEach(b=> b.onclick=()=>{
    const list = (b.dataset.f==='all')? poi : poi.filter(o=>o.t===b.dataset.f);
    renderPoi(list);
  });
  document.getElementById('mapSearch').oninput=e=> searchPoi(e.target.value.trim());
}
function clearMarkers(){ markers.forEach(m=>m.remove()); markers=[]; }
function renderPoi(list){ clearMarkers(); list.forEach(o=>{ const m=L.marker(o.p).addTo(map).bindPopup(`<b>${o.name}</b><br>${o.t}`); markers.push(m); }); }
function searchPoi(q){ const l=q.toLowerCase(); renderPoi(poi.filter(o=>o.name.toLowerCase().includes(l)||o.t.includes(l))); }
