// Helpers
const $=(q,r=document)=>r.querySelector(q), $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const defAvatar = window.DEFAULT_AVATAR;
const defBg = window.DEFAULT_BG;
let CURRENT_CITY=localStorage.getItem('city')||'praha', CURRENT_DM_UID=null, ME=null;
function toast(t){const g=$('#globalToast'); g.textContent=t; g.hidden=false; setTimeout(()=>g.hidden=true,2500);}
function fileToUrl(file){ return new Promise((res,rej)=>{const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file);}); }
function threadId(a,b){ return [a,b].sort().join('_'); }
function escapeHtml(s=''){ return s.replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]); }

// Tabs & UI
document.addEventListener('DOMContentLoaded',()=>{
  $('#tabs').addEventListener('click',e=>{const b=e.target.closest('.tab'); if(!b) return; const t=b.dataset.tab; $$('.tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); $('#view-'+t).classList.add('active');});
  $('#toggleTabs').addEventListener('click',()=>{ const bar=$('#tabs'); bar.hidden=!bar.hidden; });
  $('#citySelect').value=CURRENT_CITY;
  $('#citySelect').addEventListener('change',()=>{CURRENT_CITY=$('#citySelect').value; localStorage.setItem('city',CURRENT_CITY); applyCityBg(); subChat(); subRent(); subPoi();});
  $('#participantsBtn').addEventListener('click',openParticipants);
  $('#participantsClose').addEventListener('click',()=>$('#participantsModal').hidden=true);
  $('#profileBtn').addEventListener('click',()=>$('#profileModal').hidden=false);
  $('#profileClose').addEventListener('click',()=>$('#profileModal').hidden=true);
  $('#userClose').addEventListener('click',()=>$('#userModal').hidden=true);
  $('#cookieOk').addEventListener('click',()=>{localStorage.setItem('cookie_ok','1'); $('#cookieBar').hidden=true;});
  if(!localStorage.getItem('cookie_ok')) $('#cookieBar').hidden=false;

  // Chat
  $('#chatSend').addEventListener('click',sendChat);
  $('#bgCam').addEventListener('click',()=>$('#bgFile').click());
  $('#bgFile').addEventListener('change', async(e)=>{
    if(!isAdmin()) return;
    const f=e.target.files[0]; if(!f) return;
    const url = await fileToUrl(f);
    await db.ref('settings/theme/cityBackgrounds/'+CURRENT_CITY).set(url);
    document.documentElement.style.setProperty('--wall', `url('${url}')`);
    toast('Фон оновлено');
  });

  // Rent
  $('#rentSend').addEventListener('click',sendRent);

  // Help
  $('#helpPost').addEventListener('click',postHelp);

  // Presence tick
  setInterval(()=>{ const u=auth.currentUser; if(u) db.ref('presence/'+u.uid).set({ts:Date.now()}); }, 20000);

  // Map
  initMap();

  // DM events wired in dm.js

  // Premium modal
  $('#btnPremium').addEventListener('click', ()=>$('#premiumModal').hidden=false);
  $('#premiumClose').addEventListener('click', ()=>$('#premiumModal').hidden=true);
});

auth.onAuthStateChanged(async u=>{
  if(u){
    await ensureMyPublic(u);
    ME = (await db.ref('usersPublic/'+u.uid).get()).val()||null;
    applyAdminVisibility();
    loadMe();
    applyCityBg();
    subChat(); subRent(); subHelp(); subPoi();
    subBotsList(); // in bots.js
    buildDmSidebar(); // names
    if(isAdmin()){ $$('.adm-only').forEach(n=>n.style.display='inline-block'); }
  }else{
    ME=null;
  }
});

function isAdmin(){ const u=auth.currentUser; return !!(u && u.email===window.ADMIN_EMAIL); }
function applyAdminVisibility(){
  const show=isAdmin();
  $$('.adm-only').forEach(n=>n.style.display=show?'inline-block':'none');
  $('#helpAdmin').style.display = show?'block':'none';
}

async function ensureMyPublic(u){
  const ref=db.ref('usersPublic/'+u.uid); const s=await ref.get();
  if(!s.exists()){
    const nick=(u.displayName&&u.displayName.trim())||(u.email?u.email.split('@')[0]:'user'+u.uid.slice(0,5));
    // name/role immutable; only avatar may change by user (rules)
    await ref.set({name:nick,avatar:defAvatar,role:'seeker',plan:'free',createdAt:Date.now()});
  }
}

async function loadMe(){
  const u=auth.currentUser; if(!u) return;
  const s=await db.ref('usersPublic/'+u.uid).get(); const me=s.val()||{};
  $('#myName').textContent=me.name||'Користувач'; $('#myRole').textContent=me.role||'seeker'; $('#myPlan').textContent=me.plan||'free'; $('#myAvatar').src=me.avatar||defAvatar;

  $('#avatarFile').onchange = async(e)=>{ const f=e.target.files[0]; if(!f) return; const url=await fileToUrl(f); await db.ref('usersPublic/'+u.uid+'/avatar').set(url); $('#myAvatar').src=url; toast('Аватар оновлено'); };
  $('#btnReset').onclick = async()=>{ try{ await auth.sendPasswordResetEmail(u.email); toast('Лист для скидання паролю відправлено. Перевірте СПАМ.'); }catch(e){ alert(e.message); } };
  $('#btnSignout').onclick = async()=>{ await auth.signOut(); location.reload(); };
}

async function applyCityBg(){
  try{
    const s=await db.ref('settings/theme/cityBackgrounds/'+CURRENT_CITY).get();
    const url = (s.exists() && s.val()) || defBg;
    document.documentElement.style.setProperty('--wall', `url('${url}')`);
  }catch{ document.documentElement.style.setProperty('--wall', `url('${defBg}')`); }
}

// CHAT
function renderMsg(id,v){
  const row=document.createElement('div'); row.className='msg';
  row.innerHTML=`<div class="ava"><img src="${v._avatar||defAvatar}"></div>
  <div class="bubble"><div class="name"><a href="#" data-open-prof="${v.by}">${v._name||v.by}</a> · <span class="muted">${new Date(v.ts||Date.now()).toLocaleString()}</span></div>
  <div class="text">${(v.text?escapeHtml(v.text):'')}${v.photo?`<div><img src="${v.photo}" style="max-width:240px;border-radius:8px;margin-top:6px"></div>`:''}</div>
  <div class="row"><button data-dm="${v.by}">✉️</button> <button data-like="${id}">👍</button> <button data-dis="${id}">👎</button> <button data-rep="${id}">⚠️</button> ${canDelete(v.by)?`<button data-del="${id}">🗑️</button>`:''}</div></div>`;
  row.addEventListener('click', e=>{
    if(e.target.dataset.dm){ openDmWith(e.target.dataset.dm); }
    if(e.target.dataset.openProf){ openProfileOf(e.target.dataset.openProf); }
    if(e.target.dataset.del){ deleteMessage(e.target.dataset.del); }
    if(e.target.dataset.rep){ fileReport('chat', id, v); }
  });
  $('#chatFeed').appendChild(row);
}
function canDelete(uid){ const me=auth.currentUser; return !!me && (me.uid===uid || isAdmin()); }
async function deleteMessage(msgId){
  if(!confirm('Видалити повідомлення?')) return;
  await db.ref('messages/'+CURRENT_CITY+'/'+msgId).remove();
  toast('Видалено');
  subChat();
}

function subChat(){
  $('#chatFeed').innerHTML='';
  const ref=db.ref('messages/'+CURRENT_CITY);
  ref.off();
  ref.limitToLast(100).on('child_added', async s=>{
    const v=s.val()||{};
    const up=(await db.ref('usersPublic/'+v.by).get()).val()||{};
    v._name=up.name||v.by; v._avatar=up.avatar||defAvatar;
    renderMsg(s.key,v);
    $('#chatFeed').scrollTop=$('#chatFeed').scrollHeight;
  });
}

async function sendChat(){
  const u=auth.currentUser; if(!u) return alert('Увійдіть');
  const raw=$('#chatInput').value.trim();
  let photo=null; const f=$('#chatFile').files[0]; if(f){ photo=await fileToUrl(f); toast('✔️ Фото додано'); $('#chatFile').value=''; }
  const isUrl=/^(https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?)$/i.test(raw); const txt=isUrl?null:(raw||null); if(isUrl) photo=raw;
  if(!txt && !photo) return;
  const last=parseInt(localStorage.getItem('last_msg_ts')||'0',10); if(Date.now()-last<2000){ toast('Занадто швидко'); return; }
  await db.ref('messages/'+CURRENT_CITY).push({by:u.uid,text:txt,photo:photo,ts:Date.now()});
  localStorage.setItem('last_msg_ts', Date.now().toString());
  $('#chatInput').value='';
}

// PARTICIPANTS
async function openParticipants(){
  const box=$('#participantsModal'); const list=$('#participantsList'); list.innerHTML='';
  const s=await db.ref('usersPublic').get(); const all=s.val()||{};
  Object.entries(all).forEach(([uid,up])=>{
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${up.avatar||defAvatar}"></div>
      <div class="bubble"><div class="name">${up.name||uid}</div>
        <div class="row"><button data-prof="${uid}">Профіль</button> <button data-dm="${uid}">✉️</button> <button data-friend="${uid}">+ Додати</button></div>
      </div>`;
    list.appendChild(row);
  });
  list.onclick = async e=>{
    const uid=e.target.dataset.dm||e.target.dataset.prof||e.target.dataset.friend;
    if(!uid) return;
    if(e.target.dataset.dm){ openDmWith(uid); box.hidden=true; }
    if(e.target.dataset.prof){ openProfileOf(uid); }
    if(e.target.dataset.friend){ await sendFriendRequest(uid); toast('Запит надіслано'); }
  };
  box.hidden=false;
}

// Rent (admin only)
async function sendRent(){
  if(!isAdmin()) return alert('Тільки адмін може публікувати');
  const title=$('#rentTitle').value.trim(); const price=$('#rentPrice').value.trim(); const text=$('#rentInput').value.trim();
  let photo=null; const f=$('#rentFile').files[0]; if(f){ photo=await fileToUrl(f); $('#rentFile').value=''; }
  await db.ref('rentMessages/'+CURRENT_CITY).push({by:auth.currentUser.uid, title:title||null, price:price||null, text:text||null, photo:photo||null, ts:Date.now()});
  $('#rentTitle').value=''; $('#rentPrice').value=''; $('#rentInput').value=''; toast('Опубліковано');
}
function subRent(){
  $('#rentFeed').innerHTML='';
  db.ref('rentMessages/'+CURRENT_CITY).off();
  db.ref('rentMessages/'+CURRENT_CITY).limitToLast(100).on('child_added', async s=>{
    const v=s.val()||{}; const up=(await db.ref('usersPublic/'+v.by).get()).val()||{};
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${up.avatar||defAvatar}"></div><div class="bubble"><div><b>${escapeHtml(v.title||'Оголошення')}</b> ${v.price?(' · '+escapeHtml(v.price)):''}</div><div>${escapeHtml(v.text||'')}</div>${v.photo?`<div><img src="${v.photo}" style="max-width:240px;border-radius:8px;margin-top:6px"></div>`:''}</div>`;
    $('#rentFeed').appendChild(row);
  });
}

// Help
function subHelp(){
  $('#helpGrid').innerHTML='';
  db.ref('help/'+CURRENT_CITY+'/cards').off();
  db.ref('help/'+CURRENT_CITY+'/cards').limitToLast(100).on('child_added', s=>{
    const v=s.val()||{};
    const card=document.createElement('div'); card.className='card';
    card.innerHTML = `${v.image?`<img src="${v.image}" style="width:100%;border-radius:10px;margin-bottom:8px">`:''}<b>${escapeHtml(v.title||'')}</b><div>${escapeHtml(v.text||'')}</div>${v.link?`<div><a target="_blank" href="${v.link}">Перейти →</a></div>`:''}`;
    $('#helpGrid').prepend(card);
  });
}
async function postHelp(){
  if(!isAdmin()) return;
  const title=$('#helpTitle').value.trim(); const text=$('#helpText').value.trim(); const link=$('#helpLink').value.trim(); const image=$('#helpImageUrl').value.trim()||null;
  if(!title && !text && !image) return;
  await db.ref('help/'+CURRENT_CITY+'/cards').push({title,text,link:link||null,image:image||null,ts:Date.now(),by:auth.currentUser.uid});
  $('#helpTitle').value=''; $('#helpText').value=''; $('#helpLink').value=''; $('#helpImageUrl').value=''; toast('Опубліковано у “Допомога”');
}

// Reports
async function fileReport(kind, id, payload){ const u=auth.currentUser; if(!u) return alert('Увійдіть'); await db.ref('reports').push({kind,id,by:u.uid,city:CURRENT_CITY,ts:Date.now(),payload:payload||null}); toast('Скаргу надіслано'); }

// Profile open from name/avatar
async function openProfileOf(uid){
  const s=await db.ref('usersPublic/'+uid).get(); const up=s.val()||{};
  $('#uAvatar').src=up.avatar||defAvatar; $('#uName').textContent=up.name||uid; $('#uRole').textContent=up.role||'—'; $('#uPlan').textContent=up.plan||'—';
  $('#userTitle').textContent='Профіль: '+(up.name||uid);
  $('#uDm').onclick=()=>{ openDmWith(uid); $('#userModal').hidden=true; };
  $('#uAddFriend').onclick=async()=>{ await sendFriendRequest(uid); toast('Запит надіслано'); };
  $('#uReport').onclick=()=>{ fileReport('user', uid, null); toast('Скаргу надіслано'); };
  $('#userModal').hidden=false;
}

// Friends
async function sendFriendRequest(toUid){ const me=auth.currentUser?.uid; if(!me) return; await db.ref('friendRequests/'+toUid+'/'+me).set({from:me,ts:Date.now(),status:'pending'}); }

// Map
let map, addMode=false, markers=[];
function initMap(){
  if(map) return;
  map=L.map('map').setView([50.0755,14.4378],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  $('#mapCenter')?.addEventListener('click',()=>map.setView([50.0755,14.4378],12));
  $('#poiAddBtn').addEventListener('click',()=>{ if(!isAdmin()) return; addMode=!addMode; toast(addMode?'Торкніться карти для додавання точки':'Режим додавання вимкнено'); });
  map.on('click', async e=>{
    if(!addMode || !isAdmin()) return;
    const title=prompt('Назва точки'); const type=prompt('Тип (vol/help/pharm/...)'); const img=prompt('URL аватарки/фото (опц.)');
    await db.ref('map/poi/'+CURRENT_CITY).push({title:title||'Точка',type:type||'',img:img||null,lat:e.latlng.lat,lng:e.latlng.lng,ts:Date.now(),by:auth.currentUser.uid});
    addMode=false; toast('Точку додано');
  });
}
function subPoi(){
  if(!map) return;
  markers.forEach(m=>m.remove()); markers=[];
  db.ref('map/poi/'+CURRENT_CITY).off();
  db.ref('map/poi/'+CURRENT_CITY).on('child_added', s=>{
    const v=s.val()||{};
    const m=L.marker([v.lat||50.08, v.lng||14.43]).addTo(map);
    m.bindPopup(`<div style="min-width:180px">${v.img?`<img src="${v.img}" style="width:100%;border-radius:10px;margin-bottom:6px">`:''}<b>${escapeHtml(v.title||'Точка')}</b><div>${escapeHtml(v.type||'')}</div><div>lat:${v.lat?.toFixed?.(4)||v.lat}, lng:${v.lng?.toFixed?.(4)||v.lng}</div></div>`);
    markers.push(m);
  });
}

// DM sidebar names
async function buildDmSidebar(){
  const me=auth.currentUser?.uid; if(!me) return;
  const box=$('#dmSidebar'); box.innerHTML='';
  const s=await db.ref('inboxMeta/'+me).get(); const peers=s.val()||{};
  for(const other in peers){
    const up=(await db.ref('usersPublic/'+other).get()).val()||{};
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${up.avatar||defAvatar}"></div><div class="bubble"><div class="name">${up.name||other}</div></div>`;
    row.onclick=()=>openDmWith(other);
    box.appendChild(row);
  }
}
