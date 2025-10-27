// ==== init
firebase.initializeApp(window.FIREBASE_CONFIG);
const auth=firebase.auth();
const db=firebase.database();
const stg=firebase.storage();

const $=(q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const esc=(s='')=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ==== toasts
function showToast(el,txt,ms=2600){ const n=(typeof el==='string')?$(el):el; n.textContent=txt; n.hidden=false; clearTimeout(n._t); n._t=setTimeout(()=>n.hidden=true,ms); }

// ==== globals
if(!localStorage.getItem('city')) localStorage.setItem('city','praha');
let CURRENT_CITY = localStorage.getItem('city');
let CHAT_REF=null, RENT_REF=null, DM_REF=null;
let CURRENT_DM_UID=null;

function isAdmin(u){ return u?.email === window.ADMIN_EMAIL; }

// ==== utils
async function fileToUrl(file){
  return new Promise(async (res,rej)=>{
    try{
      if(window.USE_STORAGE){
        const ref=stg.ref().child(`uploads/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
        await ref.put(file); const url=await ref.getDownloadURL(); res(url);
      } else {
        const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file);
      }
    }catch(e){ rej(e); }
  });
}

function bubble({id,name,avatar,text,photo,city}){
  const wrap=document.createElement('div'); wrap.className='msg'; wrap.dataset.id=id||'';
  const ava=document.createElement('div'); ava.className='ava';
  const img=new Image(); img.src=avatar||window.DEFAULT_AVATAR; ava.appendChild(img);
  const b=document.createElement('div'); b.className='bubble';
  const n=document.createElement('div'); n.className='name'; n.textContent=name||'Користувач';
  const t=document.createElement('div'); t.className='text';
  t.innerHTML=(text?esc(text):'') + (photo?`<img src="${photo}" loading="lazy">`:'');
  const actions=document.createElement('div'); actions.className='actions';
  actions.innerHTML=`
    <button data-like="1">👍</button>
    <button data-like="-1">👎</button>
    <button data-report>⚠️ Поскаржитись</button>
    <button data-dm>✉️ Написати</button>
    <button data-del class="adm-only" style="display:none">🗑 Видалити</button>`;
  b.append(n,t,actions); wrap.append(ava,b);

  actions.addEventListener('click', async (e)=>{
    const me=auth.currentUser; if(!me) return alert('Увійдіть');
    if(e.target.dataset.like){ await db.ref(`likes/${city}/${id}/${me.uid}`).set(+e.target.dataset.like); }
    if(e.target.hasAttribute('data-report')){
      const reason=prompt('Причина скарги?'); if(!reason) return;
      await db.ref(`reports/${city}/${id}`).push({by:me.uid,reason,ts:Date.now()});
      showToast('#globalToast','Скарга надіслана. Дякуємо!');
    }
    if(e.target.hasAttribute('data-dm') && wrap.dataset.by){ openDmWith(wrap.dataset.by); switchTo('dm'); }
    if(e.target.hasAttribute('data-del')){
      await db.ref(`messages/${city}/${id}`).update({deleted:true,deletedBy:me.uid,tsDel:Date.now()}); wrap.remove();
    }
  });
  return wrap;
}

function userPublic(uid){ return db.ref('usersPublic/'+uid).get().then(s=>s.val()||null); }
async function ensureMyPublic(u){
  if(!u) return;
  const s=await db.ref('usersPublic/'+u.uid).get();
  if(!s.exists()){
    await db.ref('usersPublic/'+u.uid).set({ name: u.displayName || 'Користувач', avatar: window.DEFAULT_AVATAR, role: 'seeker', plan: 'free' });
  }
}

// ==== вкладки / меню
function switchTo(tab){ $$('.tab').forEach(t=>t.classList.remove('active')); $$(`[data-tab="${tab}"]`)[0]?.classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); $(`#view-${tab}`)?.classList.add('active'); }
$('#toggleTabs').addEventListener('click',()=> $('#tabs').classList.toggle('hidden'));
$('#tabs').addEventListener('click',(e)=>{ const b=e.target.closest('.tab'); if(!b) return; switchTo(b.dataset.tab); });
$('#citySelect').value=CURRENT_CITY;
$('#citySelect').addEventListener('change',()=>{ CURRENT_CITY=$('#citySelect').value; localStorage.setItem('city',CURRENT_CITY); subChat(); subRent(); loadCityBg(); loadReports(); loadPoi(); });

// ==== онлайн-оценка
setInterval(()=> $('#onlineCounter').textContent='Онлайн (прибл.): '+(Math.floor(Math.random()*12)+3), 4000);

// ==== Участники
$('#participantsBtn').addEventListener('click', async()=>{
  const box=$('#participantsModal'); const list=$('#participantsList'); list.innerHTML='';
  const s=await db.ref('usersPublic').get(); const all=s.val()||{};
  for(const [uid,info] of Object.entries(all)){
    const row=document.createElement('div'); row.className='msg'; row.dataset.uid=uid;
    row.innerHTML=`<div class="ava"><img src="${info.avatar||window.DEFAULT_AVATAR}"></div>
      <div class="bubble"><div class="name">${esc(info.name||'Користувач')}</div>
      <div class="muted">${esc(info.role||'seeker')} · ${esc(info.plan||'free')}</div>
      <div class="actions">
        <button data-dm>✉️ Написати</button>
        <button data-add>+ Додати в друзі</button>
      </div></div>`;
    list.appendChild(row);
  }
  list.onclick=async e=>{
    const row=e.target.closest('.msg'); if(!row) return; const uid=row.dataset.uid; const me=auth.currentUser;
    if(e.target.dataset.dm){ openDmWith(uid); box.hidden=true; switchTo('dm'); }
    if(e.target.dataset.add){ if(!me) return alert('Увійдіть'); await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid,ts:Date.now(),status:'pending'}); }
  };
  box.hidden=false;
});
$$('#participantsModal [data-close]').forEach(b=> b.onclick=()=> $('#participantsModal').hidden=true);

// ==== CHAT
function renderMessage(city,id,val){
  if(val.deleted) return null;
  const el=bubble({id,name:val._name, avatar:val._avatar, text:val.text, photo:val.photo, city});
  el.dataset.by = val.by;
  return el;
}
async function subChat(){
  if(CHAT_REF){ try{ CHAT_REF.off(); }catch{} }
  $('#chatFeed').innerHTML='';
  CHAT_REF=db.ref('messages/'+CURRENT_CITY).limitToLast(200);
  CHAT_REF.on('child_added', async s=>{
    const m=s.val(); const up=await userPublic(m.by)||{};
    m._name=up.name||'Користувач'; m._avatar=up.avatar||window.DEFAULT_AVATAR;
    const el=renderMessage(CURRENT_CITY, s.key, m); if(el){ $('#chatFeed').appendChild(el); $('#chatFeed').scrollTop = $('#chatFeed').scrollHeight; }
  });
  CHAT_REF.on('child_changed', s=>{
    const el=$(`#chatFeed .msg[data-id="${s.key}"]`); if(el && s.val().deleted) el.remove();
  });
}
subChat();

$('#chatFile').addEventListener('change', e=>{ if(e.target.files?.length) showToast('#chatToast','✔️ Фото додано. Натисніть «Відправити».'); });

$('#chatSend').onclick = async()=>{
  if(!auth.currentUser) return ensureAuth();
  const ban=await db.ref('bans/'+auth.currentUser.uid).get();
  if(ban.exists() && ban.val().until > Date.now()) return alert('Тимчасова заборона на відправку');

  let photo=null; const f=$('#chatFile').files[0]; if(f) { try{ photo=await fileToUrl(f); }catch(e){ showToast('#globalToast','⚠️ Не вдалось завантажити фото'); } }
  const urlTextCandidate=$('#chatInput').value.trim();
  const txt = urlTextCandidate || null;
  if(!txt && !photo) return;

  await db.ref('messages/'+CURRENT_CITY).push({by:auth.currentUser.uid, text:txt, photo:photo, ts:Date.now()});
  $('#chatInput').value=''; $('#chatFile').value=''; showToast('#globalToast','✔️ Повідомлення надіслано');
};

$('#clearChat').onclick = async()=>{
  const me=auth.currentUser; if(!me) return;
  const isMod=(await db.ref('roles/'+me.uid+'/moderator').get()).val()===true;
  if(!isAdmin(me) && !isMod) return alert('Лише адмін/модератор');
  if(!confirm('Очистити весь чат?')) return;
  const snap=await db.ref('messages/'+CURRENT_CITY).get();
  snap.forEach(child=> db.ref('messages/'+CURRENT_CITY+'/'+child.key).update({deleted:true,deletedBy:me.uid,tsDel:Date.now()}));
};

// ==== RENT
async function subRent(){
  if(RENT_REF){ try{ RENT_REF.off(); }catch{} }
  $('#rentFeed').innerHTML='';
  RENT_REF=db.ref('rentMessages/'+CURRENT_CITY).limitToLast(200);
  RENT_REF.on('child_added', async s=>{
    const m=s.val(); const up=await userPublic(m.by)||{};
    m._name=up.name||'Користувач'; m._avatar=up.avatar||window.DEFAULT_AVATAR;
    const el=renderMessage(CURRENT_CITY, s.key, m); if(el) $('#rentFeed').appendChild(el);
  });
}
subRent();

$('#rentSend').onclick = async()=>{
  if(!auth.currentUser) return ensureAuth();
  let photo=null; const f=$('#rentFile').files[0]; if(f) { try{ photo=await fileToUrl(f); }catch(e){ showToast('#globalToast','⚠️ Не вдалось завантажити фото'); } }
  const txt=$('#rentInput').value.trim()||null; if(!txt && !photo) return;
  await db.ref('rentMessages/'+CURRENT_CITY).push({by:auth.currentUser.uid,text:txt,photo:photo,ts:Date.now()});
  $('#rentInput').value=''; $('#rentFile').value=''; showToast('#globalToast','✔️ Оголошення надіслано');
};

// ==== DMs
function openDmWith(uid){
  if(DM_REF){ try{ DM_REF.off(); }catch{} }
  CURRENT_DM_UID=uid; $('#dmMessages').innerHTML=''; $('#dmHeader').textContent='Діалог';
  const me=auth.currentUser?.uid; if(!me){ ensureAuth(); return; }
  const tid=[me,uid].sort().join('_');
  DM_REF=db.ref('privateMessages/'+tid).limitToLast(200);
  DM_REF.on('child_added', async s=>{
    const m=s.val(); const up=await userPublic(m.by)||{};
    const el=bubble({id:s.key,name:up.name||'Користувач',avatar:up.avatar||window.DEFAULT_AVATAR,text:m.text,photo:m.photo,city:'dm'}); $('#dmMessages').appendChild(el);
    $('#dmMessages').scrollTop = $('#dmMessages').scrollHeight;
  });
  $('#dmSend').onclick = async ()=>{
    const txt=$('#dmInput').value.trim(); let photo=null; const f=$('#dmFile').files[0];
    if(f){ try{ photo=await fileToUrl(f); }catch(e){ showToast('#globalToast','⚠️ Фото не завантажилось'); } }
    if(!txt && !photo) return;
    await db.ref('privateMessages/'+tid).push({by:me,text:txt||null,photo:photo||null,ts:Date.now()});
    $('#dmInput').value=''; $('#dmFile').value=''; showToast('#globalToast','✔️ Повідомлення відправлено');
  };
}
document.addEventListener('click', (e)=>{ if(e.target && e.target.matches('[data-dm-open]')) openDmWith(e.target.getAttribute('data-dm-open')); });
document.addEventListener('click', (e)=>{ if(e.target && e.target.matches('[data-open-profile]')) alert('Профіль користувача (демо)'); });
$('#dmFile').addEventListener('change', e=>{ if(e.target.files?.length) showToast('#dmToast','✔️ Фото додано до ЛС. Натисніть «Надіслати».'); });

// ==== Help & Announce
$('#helpPost')?.addEventListener('click', async()=>{
  const u=auth.currentUser; if(!isAdmin(u)) return alert('Тільки для адміна');
  const v={title:$('#helpTitle').value.trim(), link:$('#helpLink').value.trim()||null, image:$('#helpImage').value.trim()||null, ts:Date.now()};
  await db.ref('help/'+CURRENT_CITY+'/cards').push(v);
  $('#helpTitle').value=''; $('#helpLink').value=''; $('#helpImage').value='';
});
function subHelp(){
  db.ref('help/'+CURRENT_CITY+'/cards').off();
  $('#helpGrid').innerHTML='';
  db.ref('help/'+CURRENT_CITY+'/cards').on('child_added', s=>{
    const v=s.val(); const c=document.createElement('div'); c.className='card';
    c.innerHTML=`${v.image?`<img src="${v.image}" style="width:100%;border-radius:10px">`:''}<b>${esc(v.title||'')}</b>${v.link?` · <a href="${v.link}" target="_blank">Відкрити</a>`:''}`;
    $('#helpGrid').prepend(c);
  });
}
subHelp();

$('#anPost')?.addEventListener('click', async()=>{
  const u=auth.currentUser; if(!isAdmin(u)) return alert('Тільки для адміна');
  const v={title:$('#anTitle').value.trim(), image:$('#anImage').value.trim()||null, text:$('#anText').value.trim()||'', ts:Date.now()};
  await db.ref('announce/'+CURRENT_CITY).push(v);
  $('#anTitle').value=''; $('#anImage').value=''; $('#anText').value='';
});
function subAnnounce(){
  db.ref('announce/'+CURRENT_CITY).off();
  $('#anGrid').innerHTML='';
  db.ref('announce/'+CURRENT_CITY).on('child_added', s=>{
    const v=s.val(); const c=document.createElement('div'); c.className='card';
    c.innerHTML=`${v.image?`<img src="${v.image}" style="width:100%;border-radius:10px">`:''}<b>${esc(v.title||'')}</b><div>${esc(v.text||'')}</div>`;
    $('#anGrid').prepend(c);
  });
}
subAnnounce();

// ==== MAP
let map, markers=[];
function initMap(){ if(map) return; map=L.map('map').setView([50.0755,14.4378],12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map); }
initMap();
$('#mapCenter').onclick=()=> map.setView([50.0755,14.4378],12);
function loadPoi(){
  markers.forEach(m=>m.remove()); markers=[]; db.ref('map/poi/'+CURRENT_CITY).off();
  db.ref('map/poi/'+CURRENT_CITY).on('child_added', s=>{
    const v=s.val()||{}; const ico = v.avatar? L.icon({iconUrl:v.avatar,iconSize:[36,36],className:'poi-ava'}) : undefined;
    const m=L.marker([v.lat||50.08, v.lng||14.43], ico?{icon:ico}:{ });
    m.addTo(map);
    m.bindPopup(`<div><b>${esc(v.title||'Точка')}</b></div><div>Тип: ${esc(v.type||'')}</div>${v.photo?`<div><img src="${v.photo}" style="max-width:180px;border-radius:8px;margin-top:6px"></div>`:''}<div class="muted">lat: ${v.lat} · lng: ${v.lng}</div>`);
    markers.push(m);
  });
}
loadPoi();
$('#poiAdd').onclick = async()=>{
  const u=auth.currentUser; if(!u) return ensureAuth();
  const isMod=(await db.ref('roles/'+u.uid+'/moderator').get()).val()===true;
  if(!isAdmin(u) && !isMod) return alert('Лише адмін/модератор');
  const c=map.getCenter();
  const lat=parseFloat($('#poiLat').value)||c.lat; const lng=parseFloat($('#poiLng').value)||c.lng;
  const v={title:$('#poiTitle').value.trim(), type:$('#poiType').value.trim(), avatar:$('#poiAvatar').value.trim()||null, photo:$('#poiPhoto').value.trim()||null, lat,lng,ts:Date.now(),by:u.uid};
  await db.ref('map/poi/'+CURRENT_CITY).push(v);
  $('#poiTitle').value=$('#poiType').value=$('#poiAvatar').value=$('#poiPhoto').value=$('#poiLat').value=$('#poiLng').value='';
};

// ==== фон города
async function loadCityBg(){ try{ const cs=await db.ref('settings/theme/cityBackgrounds/'+CURRENT_CITY).get(); const url=cs.exists()?cs.val():null;
  if(url){ document.documentElement.style.setProperty('--wall', `url('${url}')`); localStorage.setItem('bg_'+CURRENT_CITY,url); }
  else{ const cached=localStorage.getItem('bg_'+CURRENT_CITY); if(cached) document.documentElement.style.setProperty('--wall', `url('${cached}')`); }
}catch{} }
loadCityBg();
$('#saveCityBg').onclick = async()=>{
  const u=auth.currentUser; if(!u) return ensureAuth();
  const isMod=(await db.ref('roles/'+u.uid+'/moderator').get()).val()===true;
  if(!isAdmin(u) && !isMod) return alert('Лише адмін/модератор');
  const url=$('#cityBgUrl').value.trim(); if(!url) return;
  await db.ref('settings/theme/cityBackgrounds/'+CURRENT_CITY).set(url);
  document.documentElement.style.setProperty('--wall', `url('${url}')`); $('#cityBgUrl').value='';
};
$('#cityBgFile').addEventListener('change', async(e)=>{
  const u=auth.currentUser; if(!u) return ensureAuth();
  const isMod=(await db.ref('roles/'+u.uid+'/moderator').get()).val()===true;
  if(!isAdmin(u) && !isMod) return alert('Лише адмін/модератор');
  const f=e.target.files[0]; if(!f) return; const url=await fileToUrl(f);
  await db.ref('settings/theme/cityBackgrounds/'+CURRENT_CITY).set(url);
  document.documentElement.style.setProperty('--wall', `url('${url}')`); e.target.value='';
});

// ==== Профіль
$('#profileBtn').onclick=()=> $('#profileModal').hidden=false;
$$('#profileModal [data-close]').forEach(b=> b.onclick=()=> $('#profileModal').hidden=true);

async function refreshMe(){
  const u=auth.currentUser; if(!u) return;
  const me=await userPublic(u.uid)||{};
  $('#myName').textContent=me.name||'Користувач';
  $('#myRole').textContent=me.role||'seeker';
  $('#myAvatar').src=me.avatar||window.DEFAULT_AVATAR;
}
$('#saveProfile').onclick = async()=>{
  if(!auth.currentUser) return;
  const uid=auth.currentUser.uid;
  const up={}; const n=$('#setNick').value.trim(); if(n) up.name=n;
  const a=$('#setAvatarUrl').value.trim(); if(a) up.avatar=a;
  const r=$('#setRole').value; if(r) up.role=r;
  await db.ref('usersPublic/'+uid).update(up);
  $('#setNick').value=''; $('#setAvatarUrl').value='';
  refreshMe();
};
$('#avatarFile').addEventListener('change', async(e)=>{
  const f=e.target.files[0]; if(!f) return; const url=await fileToUrl(f);
  await db.ref('usersPublic/'+auth.currentUser.uid).update({avatar:url}); refreshMe(); e.target.value='';
});

$('#buyPremium').onclick=async()=>{
  const me=auth.currentUser; if(!me) return ensureAuth();
  const amount = prompt('План:\n- 50 CZK: Basic (без бота)\n- 100 CZK: Premium\n- 150 CZK: Premium+\nВведіть суму (50/100/150):','100');
  if(!amount) return;
  showToast('#globalToast','✔️ Заявка створена. Додайте чек. Якщо лист від нас — ⚠️ ПЕРЕВІРТЕ СПАМ!');
  await db.ref('payments/requests/'+me.uid).push({amount:+amount, ts:Date.now()});
};

// ==== Ролі/бан/репорти
async function loadReports(){ const box=$('#reportsBox'); if(!box) return;
  box.innerHTML=''; const s=await db.ref('reports/'+CURRENT_CITY).get(); const all=s.val()||{};
  Object.entries(all).forEach(([msgId,items])=>{ Object.values(items||{}).forEach(rep=>{
    const div=document.createElement('div'); div.className='msg';
    div.innerHTML=`<div class="bubble"><div class="name">Скарга</div>
    <div>msg: ${msgId}</div><div>${esc(rep.reason||'')}</div>
    <div class="muted">${new Date(rep.ts).toLocaleString()}</div>
    <div class="actions"><button data-godel data-id="${msgId}">Видалити повідомлення</button></div></div>`;
    box.appendChild(div); }); });
  box.onclick=async e=>{
    if(e.target.dataset.godel){
      const me=auth.currentUser; const isMod=(await db.ref('roles/'+me.uid+'/moderator').get()).val()===true;
      if(!isAdmin(me) && !isMod) return;
      await db.ref('messages/'+CURRENT_CITY+'/'+e.target.dataset.id).update({deleted:true,deletedBy:me.uid,tsDel:Date.now()});
      showToast('#globalToast','✔️ Видалено');
    }
  };
}
$('#makeMod')?.addEventListener('click', async()=>{ const uid=$('#roleUid').value.trim(); if(!uid) return; await db.ref('roles/'+uid).update({moderator:true}); showToast('#globalToast','Готово'); });
$('#removeMod')?.addEventListener('click', async()=>{ const uid=$('#roleUid').value.trim(); if(!uid) return; await db.ref('roles/'+uid).update({moderator:false}); showToast('#globalToast','Готово'); });
$('#ban30')?.addEventListener('click', async()=>{
  const uid=$('#roleUid').value.trim(); if(!uid) return;
  const reason=$('#banReason').value.trim()||'порушення правил';
  await db.ref('bans/'+uid).set({until: Date.now()+30*60*1000, reason}); showToast('#globalToast','⛔ Бан 30 хв');
});
$('#unban')?.addEventListener('click', async()=>{ const uid=$('#roleUid').value.trim(); if(!uid) return; await db.ref('bans/'+uid).remove(); showToast('#globalToast','✅ Розбан'); });

// ==== простий міні-логін/реєстрація/verify/reset
async function ensureAuth(){
  const u=auth.currentUser; if(u) return u;
  const mode = prompt('Вхід/Реєстрація: введіть EMAIL (або скасувати)'); if(!mode) return null;
  const email = mode.trim();
  const pass = prompt('Пароль (мін. 6 символів)'); if(!pass) return null;
  try{
    let cred;
    try { cred = await auth.signInWithEmailAndPassword(email,pass); }
    catch{ cred = await auth.createUserWithEmailAndPassword(email,pass);
           try{ await cred.user.sendEmailVerification(); showToast('#globalToast','Лист підтвердження надіслано. ⚠️ Перевірте СПАМ!'); }catch{} }
    await ensureMyPublic(cred.user); showToast('#globalToast','Вітаємо! Ви увійшли.');
    return cred.user;
  }catch(e){ alert('Auth error: '+e.message); return null; }
}

$('#resetPass')?.addEventListener('click', async()=>{
  const email = auth.currentUser?.email || prompt('Вкажіть email для відновлення:');
  if(!email) return;
  try{ await auth.sendPasswordResetEmail(email); showToast('#globalToast','Лист для відновлення відправлено. ⚠️ Перевірте СПАМ!'); }
  catch(e){ alert(e.message); }
});

auth.onAuthStateChanged(async u=>{
  $$('.adm-only').forEach(x=> x.style.display = (u && isAdmin(u)) ? 'block' : 'none');
  if(u){ await ensureMyPublic(u); await refreshMe(); loadReports(); }
});

$('#btnSignout').onclick=()=> auth.signOut();

// старт
loadReports();

// === Participants view renderer ===
(function(){
  function el(h){ const t=document.createElement('template'); t.innerHTML=h.trim(); return t.content.firstChild; }
  function byId(id){ return document.getElementById(id); }

  async function renderParticipants(){
    const box=byId('participantsView'); if(!box) return;
    box.innerHTML='<h3>👤 Účastníci</h3><div class="small">Načítám…</div>';
    if(!(firebase && firebase.database)) { box.innerHTML+='<div class="small">Firebase není načten</div>'; return; }
    const snap = await firebase.database().ref('usersPublic').once('value');
    const v = snap.val()||{};
    const uids = Object.keys(v);
    if(uids.length===0){ box.innerHTML='<div class="small">Zatím prázdné</div>'; return; }
    const wrap=el('<div></div>');
    uids.forEach(uid=>{
      const u=v[uid]||{};
      const role=(u.role==='employer'?'employer':'seeker');
      const row=el(`<div class="row">
        <img class="avatar" src="${u.avatar||'default-avatar.svg'}">
        <div><b>${u.nick||'Uživatel'}</b> ${role==='employer'?'<span class="badge-role emp">Zaměstnavatel</span>':'<span class="badge-role seek">Hledám práci</span>'}
          <div class="small mono">${uid}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button class="btn" data-act="profile" data-id="${uid}">Profil</button>
          <button class="btn" data-act="dm" data-id="${uid}">Napsat</button>
          <button class="btn" data-act="add" data-id="${uid}">Přidat do přátel</button>
        </div>
      </div>`);
      row.querySelector('[data-act="profile"]').onclick=()=> window.showProfile && showProfile(uid);
      row.querySelector('[data-act="dm"]').onclick=()=> window.openDM && openDM(uid);
      row.querySelector('[data-act="add"]').onclick=()=>{
        const me=firebase.auth().currentUser; if(!me) return;
        firebase.database().ref('friends/requests/'+uid+'/'+me.uid).set(true);
      };
      wrap.appendChild(row);
    });
    box.innerHTML=''; box.appendChild(wrap);
  }

  document.addEventListener('DOMContentLoaded', function(){
    const btn=document.getElementById('enhParticipants');
    if(!(window.firebase && firebase.auth)) return;
    firebase.auth().onAuthStateChanged(function(u){
      if(!u) return;
      if(btn){ btn.onclick=()=> renderParticipants(); }
      // also auto-render once to confirm it's working
      if(btn) btn.click();
    });
  });
})();



// === Preloader removal after initial auth/render hooks ===
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(function(){
    var pre=document.getElementById('preloader');
    if(pre) pre.remove();
  }, 600); // small delay to let first data paint
});


// Robust preloader handling + global error hooks
(function(){
  function hidePreloader(){
    var p=document.getElementById('preloader');
    if(p && p.parentNode) p.parentNode.removeChild(p);
  }
  // Hide on DOM ready
  document.addEventListener('DOMContentLoaded', ()=> {
    setTimeout(hidePreloader, 400); // quick
    // Extra fallback in case of slow libs
    setTimeout(hidePreloader, 3000);
    setTimeout(hidePreloader, 7000);
  });
  // Hide on full load
  window.addEventListener('load', ()=> setTimeout(hidePreloader, 200));
  // If any error occurs — hide preloader and show toast
  window.addEventListener('error', (e)=>{
    try{ hidePreloader(); }catch(_){}
    try{
      (window.toast||console.warn)('Chyba při načítání: ' + (e.message||'viz konzoli'));
      console.error('Global error:', e.error||e.message, e.filename, e.lineno, e.colno);
    }catch(_){}
  });
  window.addEventListener('unhandledrejection', (e)=>{
    try{ hidePreloader(); }catch(_){}
    try{
      (window.toast||console.warn)('Chyba skriptu: ' + (e.reason && (e.reason.message||e.reason)) );
      console.error('Unhandled rejection:', e.reason);
    }catch(_){}
  });
})();

// === QR platba (SPD) ===
function czIbanFrom(banka4, account){ // account (base, without prefix), pad to 10? up to 16
  function padLeft(n,len){ n=String(n); while(n.length<len) n='0'+n; return n; }
  const bb = banka4;
  const acc = padLeft(account.replace(/\D/g,''), 16);
  const country='CZ';
  // compute checksum: IBAN = country + "00" + bb + acc; move country code to end and replace letters
  const base = bb + acc + country.charCodeAt(0)-55 + country.charCodeAt(1)-55 + '00';
  // but easier: build numeric string with C=12,Z=35 (C=12, Z=35)
  const replaced = bb + acc + '12' + '35' + '00';
  // mod 97
  function mod97(s){ let m=0; for(let i=0;i<s.length;i++){ m = (m*10 + (s.charCodeAt(i)-48))%97; } return m; }
  const check = 98 - mod97(replaced);
  const kk = (check<10? '0'+check : ''+check);
  return `CZ${kk}${bb}${acc}`;
}
function buildSPD({acc_bank4, acc_number, amount=null, message=''}){
  const iban = czIbanFrom(acc_bank4, acc_number);
  const parts=[`SPD*1.0*ACC:${iban}`, 'CC:CZK'];
  if(amount) parts.push(`AM:${amount}`);
  if(message) parts.push(`MSG:${message}`);
  return parts.join('*');
}
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id==='qrPay'){
    const spd = buildSPD({acc_bank4:'0300', acc_number:'354037257', message:'Premium makame.cz'});
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data='+encodeURIComponent(spd);
    const card = document.createElement('div');
    card.className='modal';
    card.innerHTML = `<div class="card" style="text-align:center"><header><b>QR platba (SPD)</b><button data-close>✖</button></header><img src="${url}" alt="QR"><div class="muted" style="margin-top:6px;word-break:break-all">${spd}</div></div>`;
    card.addEventListener('click',(ev)=>{ if(ev.target.matches('[data-close]') || ev.target===card) card.remove(); });
    document.body.appendChild(card);
  }
});
