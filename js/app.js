// ==== Режим фото: через Firebase Storage (true) или только URL (false)
window.PF_USE_STORAGE = true;

const DEFAULT_AVATAR = "public/images/avatar.jpg";
const ADMIN_EMAIL    = "urciknikolaj642@gmail.com";

(function setWallpaper(){
  const fallback = "https://i.ibb.co/27hgtZfY/Prague.jpg";
  const url = localStorage.getItem('wallUrl') || fallback;
  document.documentElement.style.setProperty('--wall-url', `url('${url}')`);
})();

const tabButtons   = document.querySelectorAll('.tab-button');
const tabContents  = document.querySelectorAll('.tab-content');
function setActiveTab(id){
  tabButtons.forEach(b=>b.classList.toggle('active', b.dataset.target===id));
  tabContents.forEach(c=> c.classList.toggle('active', c.id===id));
  if (id==='mapTab'){
    if(!window.__mapInitOnce){ try{ initLeaflet(); window.__mapInitOnce=true; }catch(e){ console.error(e); } }
    setTimeout(()=>{ try{ map.invalidateSize(false); }catch{} }, 120);
  }
}
tabButtons.forEach(btn=> btn.addEventListener('click', ()=> setActiveTab(btn.dataset.target)));

// ===== Звуки только после входа
let audioCtx=null; function ensureAudio(){ if(!audioCtx){ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } }
function tone(freq=880,dur=140,type='sine',vol=0.16){ if(!window.__soundEnabled) return; ensureAudio(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(audioCtx.destination); o.start(); setTimeout(()=>{ g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.08); o.stop(audioCtx.currentTime+0.1); }, dur); }
const SND={ notify(){tone(1100,160,'triangle',0.2)}, sent(){tone(720,100,'sine',0.18)}, dm(){tone(920,160,'sine',0.2)}, error(){tone(280,240,'square',0.22)} };
window.__soundEnabled=false;
const soundModal=document.getElementById('soundModal');
document.getElementById('soundEnable').onclick=()=>{ window.__soundEnabled=true; ensureAudio(); SND.notify(); soundModal.classList.remove('show'); localStorage.setItem('sound_on','1'); };
document.getElementById('soundLater').onclick=()=>{ soundModal.classList.remove('show'); };
document.getElementById('soundClose').onclick=()=>{ soundModal.classList.remove('show'); };

// Firebase init
firebase.initializeApp(window.PF_FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.database();
const storage = firebase.storage();

const onlineNeon   = document.getElementById('onlineNeon');
function updateOnlineCount(){ db.ref('presence').on('value', snap=>{ const val=snap.val()||{}; const real=Object.keys(val).length; onlineNeon.textContent=`Онлайн (прибл.): ${real*10}`; }); }
updateOnlineCount();
window.addEventListener('beforeunload', async ()=>{ try{ if(auth.currentUser) await db.ref('presence/'+auth.currentUser.uid).remove(); }catch{} });

// ===== Авторизация
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

document.getElementById('profileBtn').onclick=()=>{ if(!auth.currentUser) showAuth(); else openProfile(auth.currentUser.uid,true); };

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
    hideAuth();
    if(!localStorage.getItem('sound_on')){ soundModal.classList.add('show'); }
  }catch(e){ regError.textContent=e.message||String(e); SND.error(); }
});

loginSubmit.addEventListener('click', async ()=>{
  loginError.textContent='';
  try{
    await auth.signInWithEmailAndPassword(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value.trim());
    hideAuth();
    if(!localStorage.getItem('sound_on')){ soundModal.classList.add('show'); }
  }catch(e){ loginError.textContent=e.message||String(e); SND.error(); }
});

auth.onAuthStateChanged(async (u)=>{
  document.getElementById('profileBtn').style.background=`url(${(u&&u.photoURL)||DEFAULT_AVATAR}) center/cover`;
  if(u){
    await db.ref('presence/'+u.uid).set({ ts:Date.now(), nick: u.displayName||u.email });
    subscribeNotifications(u.uid);
    refreshFriendsBlocks();
    renderDMInbox();
  }
});

// ===== Уведомления
const bellBtn      = document.getElementById('bellBtn');
const bellBadge    = document.getElementById('bellBadge');
const bellModal    = document.getElementById('bellModal');
const bellClose    = document.getElementById('bellClose');
const notifList    = document.getElementById('notifList');
document.getElementById('notifClearAll').onclick=()=>{ notifList.innerHTML=''; bellBadge.textContent='0'; bellBadge.style.display='none'; };

function renderNotifItem(id,v){
  const row=document.createElement('div');
  row.style.cssText='padding:8px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center';
  const type=(v.type||'info').toUpperCase();
  row.innerHTML=`<div style="flex:1"><div style="font-weight:700">${type}</div><div style="font-size:13px">${v.text||''}</div></div>`;
  const x=document.createElement('button'); x.textContent='✖'; x.className='tab-button alt'; x.style.padding='4px 8px';
  x.onclick=()=>{ row.remove(); const n=Math.max(0, Number(bellBadge.textContent||'0')-1); bellBadge.textContent=String(n); if(n===0) bellBadge.style.display='none'; };
  row.appendChild(x);
  notifList.prepend(row);
}
function subscribeNotifications(uid){
  if(!uid) return;
  db.ref('notifications/'+uid).on('child_added',snap=>{
    renderNotifItem(snap.key,snap.val()||{});
    const n=Number(bellBadge.textContent||'0')+1; bellBadge.textContent=String(n);
    bellBadge.style.display='inline-block'; SND.notify();
  });
}
bellBtn.addEventListener('click',()=>{ bellModal.classList.add('show'); });
bellClose.addEventListener('click',()=> bellModal.classList.remove('show'));

// ===== Профиль
const profileModal=document.getElementById('profileModal'); const profileClose=document.getElementById('profileClose'); const profileContent=document.getElementById('profileContent'); profileClose.addEventListener('click',()=> profileModal.classList.remove('show'));
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }
function timeStr(ts){ return new Date(ts).toLocaleString(); }

async function openProfile(uid,isSelf=false){
  profileModal.classList.add('show'); profileContent.innerHTML='<p>Завантаження…</p>';
  try{
    const s=await db.ref('users/'+uid).get(); const user=s.exists()?s.val():{nick:'Анонім',avatar:DEFAULT_AVATAR}; const email=user.email||''; const self=auth.currentUser&&auth.currentUser.uid===uid;
    const flags=(await db.ref('settings/userFlags/'+uid).get()).val()||{}; const planKey=flags.premium||'none';
    const PLAN={none:{label:'—',bg:'#f1f5f9',col:'#111'}, trial:{label:'TRIAL',bg:'#c084fc',col:'#fff'}, premium:{label:'ПРЕМІУМ',bg:'#16a34a',col:'#fff'}, premiumPlus:{label:'ПРЕМІУМ+',bg:'#0ea5e9',col:'#fff'}}[planKey];
    const about=user.about||''; const contacts=user.contacts||'';
    profileContent.innerHTML=`
      <div style="display:flex;gap:12px;align-items:center">
        <img id="profAvatar" src="${user.avatar||DEFAULT_AVATAR}" style="width:84px;height:84px;border-radius:12px;object-fit:cover">
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <h3 style="margin:0;color:#0b1220;text-shadow:0 0 12px rgba(57,255,145,.7)">${escapeHtml(user.nick||'Анонім')}</h3>
            <span class="user-badge" style="background:${PLAN.bg};color:${PLAN.col};font-weight:900">${PLAN.label}</span>
            ${uid===auth.currentUser?.uid?'<span class="user-badge">Мій профіль</span>':''}
          </div>
          <div style="color:${email?'#333':'#666'}">${escapeHtml(email)}</div>
        </div>
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:1fr;gap:8px">
        <div><b>Про себе:</b><br>${about?escapeHtml(about):'<i>не вказано</i>'}</div>
        <div><b>Контакти:</b><br>${contacts?escapeHtml(contacts):'<i>не вказано</i>'}</div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        ${self?`
          <label class="tab-button" style="cursor:pointer"><input type="file" id="avatarFile" accept="image/*" style="display:none">Змінити аватар</label>
          <button id="editAbout" class="tab-button">✏️ Редагувати профіль</button>
          <button id="signOutBtn" class="tab-button" style="background:#ffe1e1">Вийти</button>
        `:`
          <button id="pmBtn" class="tab-button">Написати ЛС</button>
          <button id="addFriendBtn" class="tab-button">Додати в друзі</button>
        `}
      </div>`;

    if(self){
      document.getElementById('avatarFile').addEventListener('change', async (e)=>{
        const f=e.target.files[0]; if(!f) return;
        if(!window.PF_USE_STORAGE){ alert('Завантаження аватарів вимкнено. Використайте URL у профілі.'); return; }
        const ref = storage.ref().child(`avatars/${uid}/${Date.now()}_${f.name}`);
        await ref.put(f);
        const url = await ref.getDownloadURL();
        await db.ref('users/'+uid+'/avatar').set(url);
        await auth.currentUser.updateProfile({ photoURL:url });
        document.getElementById('profAvatar').src=url;
        document.getElementById('profileBtn').style.background=`url(${url}) center/cover`;
        SND.notify();
      });
      document.getElementById('signOutBtn').onclick=async()=>{ try{ await db.ref('presence/'+auth.currentUser.uid).remove(); }catch{} await auth.signOut(); profileModal.classList.remove('show'); };
      document.getElementById('editAbout').onclick=async()=>{ const a=prompt('Про себе', about)||''; const c=prompt('Контакти', contacts)||''; await db.ref('users/'+uid).update({ about:a, contacts:c }); openProfile(uid,true); };
    }else{
      document.getElementById('pmBtn').onclick=()=> openPrivateChat(uid);
      document.getElementById('addFriendBtn').onclick=()=> sendFriendRequest(uid);
    }
  }catch{ profileContent.innerHTML='<p>Помилка завантаження профілю</p>'; }
}

// ===== Чаты
const messagesEl=document.getElementById('messages'); const chatAreaMain=document.getElementById('chatArea');
const rentMessagesEl=document.getElementById('rentMessages'); const chatAreaRent=document.getElementById('rentArea');
const fileInput=document.getElementById('fileInput'); const rentFileInput=document.getElementById('rentFileInput');
const photoToast=document.getElementById('photoToast'); const rentPhotoToast=document.getElementById('rentPhotoToast');
const imageUrlBtn=document.getElementById('imageUrlBtn'); const imageUrlInput=document.getElementById('imageUrlInput');
const rentImageUrlBtn=document.getElementById('rentImageUrlBtn'); const rentImageUrlInput=document.getElementById('rentImageUrlInput');
let MSG_LIMIT=300;

let pendingImageFile=null, pendingRentImageFile=null;
let pendingImageUrl=null, pendingRentImageUrl=null;

imageUrlBtn.onclick=()=>{ imageUrlInput.style.display = imageUrlInput.style.display==='none'?'block':'none'; };
rentImageUrlBtn.onclick=()=>{ rentImageUrlInput.style.display = rentImageUrlInput.style.display==='none'?'block':'none'; };

fileInput.addEventListener('change',()=>{ pendingImageFile=fileInput.files[0]||null; if(pendingImageFile){ photoToast.style.display='block'; setTimeout(()=> photoToast.style.display='none', 3200); SND.notify(); }});
rentFileInput.addEventListener('change',()=>{ pendingRentImageFile=rentFileInput.files[0]||null; if(pendingRentImageFile){ rentPhotoToast.style.display='block'; setTimeout(()=> rentPhotoToast.style.display='none', 3200); SND.notify(); }});
imageUrlInput.addEventListener('input',()=>{ pendingImageUrl = imageUrlInput.value.trim()||null; });
rentImageUrlInput.addEventListener('input',()=>{ pendingRentImageUrl = rentImageUrlInput.value.trim()||null; });

function renderMessage(m,container){
  if(!m||!m.ts) return;
  const wrap=document.createElement('div'); wrap.className='message'+((auth.currentUser&&m.uid===auth.currentUser.uid)?' self':'');
  const avatar=document.createElement('img'); avatar.className='avatar'; avatar.src=m.avatar||DEFAULT_AVATAR; avatar.alt=m.nick||'avatar'; avatar.title=m.nick||'Профіль'; avatar.onclick=()=>openProfile(m.uid);
  const txt=document.createElement('div'); txt.className='message-content';
  const meta=document.createElement('div'); meta.className='message-meta'; meta.textContent=`${m.nick||'Анонім'} · ${timeStr(m.ts)}` + (m.recipientUid?' · особисте':'');
  txt.appendChild(meta);
  if(m.text){ const p=document.createElement('div'); p.className='text'; p.innerText=m.text; txt.appendChild(p); }
  if(m.image){ const im=document.createElement('img'); im.src=m.image; im.className='chat-image'; im.alt='Фото'; txt.appendChild(im); }
  wrap.appendChild(avatar); wrap.appendChild(txt); container.appendChild(wrap);
  const area=container.closest('.chat-area'); if(area) area.scrollTop=area.scrollHeight;
}

db.ref('messages').limitToLast(MSG_LIMIT).on('child_added',snap=>{ const m=snap.val(); m.id=snap.key; renderMessage(m, messagesEl); });
db.ref('rentMessages').limitToLast(MSG_LIMIT).on('child_added',snap=>{ const m=snap.val(); m.id=snap.key; renderMessage(m, rentMessagesEl); });

function activeChatPath(){ return document.getElementById('rentTab').classList.contains('active') ? 'rentMessages' : 'messages'; }

async function isBanned(uid){ const s=await db.ref('settings/userFlags/'+uid+'/banned').get(); return s.val()===true; }
async function canSend(){ return !!auth.currentUser && !(await isBanned(auth.currentUser.uid)); }

async function uploadIfNeeded(file){
  if(!file) return null;
  if(!window.PF_USE_STORAGE) throw new Error('USE_STORAGE=false');
  const uid = auth.currentUser.uid;
  const ref = storage.ref().child(`chat_images/${uid}/${Date.now()}_${file.name}`);
  await ref.put(file);
  return await ref.getDownloadURL();
}

function validHttpUrl(u){
  try{ const x=new URL(u); return x.protocol==='http:'||x.protocol==='https:'; }catch{return false;}
}

function pickImageUrl(prefix){
  const url = (prefix===''? pendingImageUrl : pendingRentImageUrl);
  return (url && validHttpUrl(url)) ? url : null;
}

function setupSend(prefix){
  const txtEl = document.getElementById(`${prefix}MessageInput`);
  const btnEl = document.getElementById(`${prefix}SendButton`);
  btnEl.addEventListener('click', async ()=>{
    if(!auth.currentUser){ showAuth(); return; }
    if(!await canSend()){ renderNotifItem('system',{type:'system',text:'Ваш акаунт обмежено (бан)'}); SND.error(); return; }
    const text = txtEl.value.trim();
    let file = (prefix===''? pendingImageFile : pendingRentImageFile);
    let link = pickImageUrl(prefix);
    if(!text && !file && !link) return;

    let imageUrl = link;
    try{
      if(!imageUrl && file){
        imageUrl = await uploadIfNeeded(file);
      }
      if(!imageUrl && file && !window.PF_USE_STORAGE){
        renderNotifItem('info',{type:'info',text:'Завантаження у Storage вимкнено. Вставте URL через кнопку 🌐 URL.'});
        return;
      }
      const msg={ uid:auth.currentUser.uid, nick:auth.currentUser.displayName||auth.currentUser.email||'Анонім', avatar:auth.currentUser.photoURL||DEFAULT_AVATAR, text:text||null, image:imageUrl||null, ts:Date.now() };
      await db.ref(activeChatPath()).push(msg);
      txtEl.value=''; SND.sent();
    }catch(e){
      console.error(e);
      renderNotifItem('error',{type:'error',text:'Фото не завантажено. Перевірте Storage або вставте URL через 🌐.'});
      SND.error();
    } finally {
      if(prefix===''){
        pendingImageFile=null; fileInput.value=''; imageUrlInput.value=''; pendingImageUrl=null;
      }else{
        pendingRentImageFile=null; rentFileInput.value=''; rentImageUrlInput.value=''; pendingRentImageUrl=null;
      }
    }
  });
}
setupSend(""); setupSend("rent");

// ===== Help карточки
(function initHelp(){
  const data=[
    {img:"public/images/hospital.webp", title:"Nemocnice Motol", sub:"V Úvalu 84"},
    {img:"public/images/lawyers.jpg", title:"Юридична допомога", sub:"Консультації"},
    {img:"public/images/shops.jpg", title:"Українські магазини", sub:"Продукти"}
  ];
  const hg=document.getElementById('helpGrid');
  hg.innerHTML = data.map(i=>`<div class="help-card"><img src="${i.img}"><h3>${i.title}</h3><p>${i.sub}</p></div>`).join('');
})();

// ===== Карта
let map, markers=[], poi=[];
function initLeaflet(){
  map=L.map('map', { keyboard: true }).setView([50.0755,14.4378],12);
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
