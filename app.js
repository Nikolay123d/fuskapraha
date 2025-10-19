
/* PRÁCE CZ CHAT — v35 (fixed listeners, profiles, presence, chat, DM, map, payments) */
const DB={messages:'messages',rentMessages:'rentMessages',privateMessages:'privateMessages',inboxMeta:'inboxMeta',friends:'friends',friendRequests:'friendRequests',users:'users',usersPublic:'usersPublic',help:'help',map:'map',settings:'settings',payments:'payments',ann:'announcements',support:'support',presence:'presence',bots:'bots'};
try{ if(!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG); }catch(e){}
const auth=firebase.auth(); const db=firebase.database();
const $=(q,r=document)=>r.querySelector(q); const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const DEFAULT_AVA = "https://i.ibb.co/mVDpPtBq/is-this-a-good-pfp-v0-qm3p4sotkjgd1.webp";
let CURRENT_CITY=localStorage.getItem('city')||'praha'; let me=null; const usersCache={};
let pendingChatPhoto=null,pendingRentPhoto=null,pendingDmPhoto=null;
const now=()=>Date.now();
const threadId=(a,b)=>[a,b].sort().join('_');
function toData(f,cb){ if(!f)return; const r=new FileReader(); r.onload=()=>cb(r.result); r.readAsDataURL(f); }
function displayName(uid){ return (usersCache[uid]?.name)||'Користувач'; }
function displayAvatar(uid){ return (usersCache[uid]?.avatar)||DEFAULT_AVA; }
function esc(s){ return (s==null?'':(''+s)).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* Auth state + boot */
document.addEventListener('DOMContentLoaded',()=>{
  // city/tabs
  $('#citySelect').value=CURRENT_CITY;
  $('#citySelect').addEventListener('change',()=>{ CURRENT_CITY=$('#citySelect').value; localStorage.setItem('city',CURRENT_CITY); subAll(); updateWall(); });
  $('#toggleTabs').addEventListener('click',()=>$('#tabs').classList.toggle('collapsed'));
  $('#tabs').addEventListener('click',e=>{const b=e.target.closest('.tab'); if(!b)return; $$('.tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); $('#view-'+b.dataset.tab).classList.add('active');});

  // buttons
  $('#participantsBtn').addEventListener('click',()=>{ $('#participantsPanel').hidden=false; renderParticipants(); });
  $('#participantsClose').addEventListener('click',()=>$('#participantsPanel').hidden=true);
  $('#feedbackBtn').addEventListener('click',()=>$('#feedbackModal').hidden=false);
  $('#fbClose').addEventListener('click',()=>$('#feedbackModal').hidden=true);
  $('#fbSend').addEventListener('click',sendFeedback);
  $('#profileBtn').addEventListener('click',()=>$('#profileModal').hidden=false);
  $('#profileClose').addEventListener('click',()=>$('#profileModal').hidden=true);
  $('#profileSave').addEventListener('click',saveProfile);

  // chat/rent
  $('#chatSend').addEventListener('click',sendChat);
  $('#chatFile').addEventListener('change',e=>toData(e.target.files[0],u=>{ pendingChatPhoto=u; $('#chatToast').hidden=false; }));
  $('#rentSend').addEventListener('click',sendRent);
  $('#rentFile').addEventListener('change',e=>toData(e.target.files[0],u=>{ pendingRentPhoto=u; $('#rentToast').hidden=false; }));

  // DM
  $('#dmSend').addEventListener('click',sendDm);
  $('#dmFile').addEventListener('change',e=>toData(e.target.files[0],u=>{ pendingDmPhoto=u; }));

  // payments
  $('#btnPayments').addEventListener('click',()=>{ $('#paymentsModal').hidden=false; if(me && me.email===window.ADMIN_EMAIL) $('#payAdmin').hidden=false; });
  $('#paymentsClose').addEventListener('click',()=>$('#paymentsModal').hidden=true);
  $('#paySend').addEventListener('click',paySend);
  $('#payRefresh').addEventListener('click',loadPayInbox);

  // help/ann
  $('#helpPost').addEventListener('click',helpPost);
  $('#annPost').addEventListener('click',annPost);

  // admin tools
  $('#adminFillUsersPublic').addEventListener('click',adminFillUsersPublic);
  $('#adminAddMeFriends').addEventListener('click',adminAddMeFriends);
  $('#adminOpenPayInbox').addEventListener('click',()=>{ $('#paymentsModal').hidden=false; $('#payAdmin').hidden=false; loadPayInbox(); });

  // profile modal (other user)
  $('#upClose').addEventListener('click',()=>{ $('#userProfileModal').hidden=true; _profileUid=null; });
  $('#upMsg').addEventListener('click',()=>{ if(_profileUid) openDmWith(_profileUid); $('#userProfileModal').hidden=true; });
  $('#upAdd').addEventListener('click',()=>{ if(_profileUid) sendFriendRequest(_profileUid); });

  // map admin
  initMap();
  $('#poiAdd').addEventListener('click',addPoi);
  $('#saveCityWall').addEventListener('click',()=>setCityWall(false));
  $('#saveGlobalWall').addEventListener('click',()=>setCityWall(true));
});

auth.onAuthStateChanged(async u=>{
  me=u;
  if(u){
    await ensurePublicProfile(u);
    subUsersCache();
    setupPresence(u);
    await bootstrapProfileUI(u);
    subAll();
    updateWall();
  } else {
    // guest
    subUsersCache();
    subAll();
    db.ref('presence').on('value', s=>{ const all=s.val()||{}; let online=0; Object.values(all).forEach(v=>{ if(v&&v.on) online++; }); $('#onlineCounter').textContent='Онлайн (прибл.): '+(online*12); });
    setTimeout(()=>alert('Щоб писати повідомлення — увійдіть/зареєструйтесь.'), 30*60*1000);
  }
});

function subAll(){ subChat(); subRent(); subHelp(); subMap(); subAnn(); subDmSidebar(); subFriends(); }

/* usersPublic + presence */
async function ensurePublicProfile(u){
  if(!u) return;
  const upRef=db.ref('usersPublic/'+u.uid);
  const snap=await upRef.get();
  if(!snap.exists()){
    const users=(await db.ref('users/'+u.uid).get()).val()||{};
    const name = users.name || u.displayName || (u.email?u.email.split('@')[0]:'Користувач');
    const avatar = users.avatar || u.photoURL || DEFAULT_AVA;
    await upRef.set({name, avatar});
  } else {
    const v=snap.val()||{};
    const fix={};
    if(!v.name) fix.name = u.displayName || (u.email?u.email.split('@')[0]:'Користувач');
    if(!v.avatar) fix.avatar = u.photoURL || DEFAULT_AVA;
    if(Object.keys(fix).length) await upRef.update(fix);
  }
}
function subUsersCache(){
  db.ref('usersPublic').on('value', s=>{ const v=s.val()||{}; for(const k in v) usersCache[k]=v[k]; renderParticipants(false); });
}
function setupPresence(u){
  const ref=db.ref('presence/'+u.uid);
  ref.set({last: firebase.database.ServerValue.TIMESTAMP, on:true});
  ref.onDisconnect().set({last: firebase.database.ServerValue.TIMESTAMP, on:false});
  db.ref('presence').on('value', s=>{
    const all=s.val()||{}; let online=0; Object.values(all).forEach(v=>{ if(v&&v.on) online++; });
    const shown = (u.email===window.ADMIN_EMAIL)? online : online*12;
    $('#onlineCounter').textContent='Онлайн (прибл.): '+shown;
  });
}

/* profile UI (current user) */
async function bootstrapProfileUI(u){
  $('#myEmail').textContent=u.email||'';
  const up=(await db.ref('usersPublic/'+u.uid).get()).val()||{};
  const prof=(await db.ref('users/'+u.uid).get()).val()||{};
  $('#myName').textContent=up.name||'Користувач';
  $('#myAvatar').src=up.avatar||DEFAULT_AVA;
  $('#myRole').textContent=prof.role||'seeker';
  $('#myPlan').textContent=prof.plan||'free';
  const isAdmin=u.email===window.ADMIN_EMAIL;
  $('#adminTools').hidden=!isAdmin;
  $('#helpAdminBox').hidden=!isAdmin;
  $('#annAdminBox').hidden=!isAdmin;
  $('#mapAdmin').hidden=!isAdmin?true:false;
  if(isAdmin || (prof.plan&&prof.plan!=='free')) $('#premiumBots').hidden=false; else $('#premiumBots').hidden=true;
}
async function saveProfile(){
  if(!me) return alert('Увійдіть');
  const nick=($('#profileNick').value||'').trim();
  const avatar=($('#profileAvatarUrl').value||'').trim()||DEFAULT_AVA;
  if(nick) await db.ref('usersPublic/'+me.uid+'/name').set(nick);
  await db.ref('usersPublic/'+me.uid+'/avatar').set(avatar);
  alert('Збережено');
}

/* participants panel */
function renderParticipants(forceOpen=true){
  const panel=$('#participantsPanel'); const list=$('#participantsList'); if(forceOpen) panel.hidden=false; list.innerHTML='';
  const entries=Object.entries(usersCache);
  if(!entries.length){ list.innerHTML='<div class="msg"><div class="b"><div class="text">Користувачів поки немає</div></div></div>'; return; }
  entries.forEach(([uid,v])=>{
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML = `<div class="ava"><img src="${v.avatar||DEFAULT_AVA}"></div><div class="b"><div class="name" data-uid="${uid}">${esc(v.name||'Користувач')}</div><div class="text">${uid}</div></div>`;
    row.querySelector('.name').addEventListener('click',()=>openUserProfile(uid));
    list.appendChild(row);
  });
}

/* message rendering */
function renderMsg(cont,m){
  const w=document.createElement('div'); w.className='msg';
  const a=document.createElement('div'); a.className='ava';
  const im=document.createElement('img'); im.src=displayAvatar(m.by); a.appendChild(im); a.style.cursor='pointer'; a.addEventListener('click',()=>openUserProfile(m.by));
  const b=document.createElement('div'); b.className='b';
  const n=document.createElement('div'); n.className='name'; n.textContent=displayName(m.by); n.addEventListener('click',()=>openUserProfile(m.by));
  const t=document.createElement('div'); t.className='text';
  if(m.text){ const s=document.createElement('div'); s.textContent=m.text; t.appendChild(s); }
  if(m.photo){ const pi=new Image(); pi.src=m.photo; t.appendChild(pi); }
  b.appendChild(n); b.appendChild(t); w.appendChild(a); w.appendChild(b); cont.appendChild(w); cont.scrollTop=cont.scrollHeight;
}

/* chat/rent */
function subChat(){ const f=$('#chatFeed'); f.innerHTML=''; db.ref('messages/'+CURRENT_CITY).limitToLast(200).on('child_added',s=>renderMsg(f,s.val())); }
async function sendChat(){
  if(!(me&&me.uid)) return alert('Увійдіть');
  const text=($('#chatInput').value||'').trim(); if(!text && !pendingChatPhoto) return;
  const m={by:me.uid, ts:now()}; if(text) m.text=text; if(pendingChatPhoto) m.photo=pendingChatPhoto;
  await db.ref('messages/'+CURRENT_CITY).push(m);
  $('#chatInput').value=''; pendingChatPhoto=null; $('#chatToast').hidden=true;
}
function subRent(){ const f=$('#rentFeed'); f.innerHTML=''; db.ref('rentMessages/'+CURRENT_CITY).limitToLast(200).on('child_added',s=>renderMsg(f,s.val())); }
async function sendRent(){
  if(!(me&&me.uid)) return alert('Увійдіть');
  const text=($('#rentInput').value||'').trim(); if(!text && !pendingRentPhoto) return;
  const m={by:me.uid, ts:now()}; if(text) m.text=text; if(pendingRentPhoto) m.photo=pendingRentPhoto;
  await db.ref('rentMessages/'+CURRENT_CITY).push(m);
  $('#rentInput').value=''; pendingRentPhoto=null; $('#rentToast').hidden=true;
}

/* DM & friends */
let dmRef=null,currentDmUid=null;
function subDmSidebar(){
  if(!me) return; const sbar=$('#dmSidebar'); sbar.innerHTML='';
  db.ref('inboxMeta/'+me.uid).on('child_added',snap=>{ const uid=snap.key;
    const el=document.createElement('div'); el.className='msg';
    el.innerHTML=`<div class="ava"><img src="${displayAvatar(uid)}"></div><div class="b"><div class="name">${displayName(uid)}</div></div>`;
    el.onclick=()=>openDmWith(uid); sbar.appendChild(el);
  });
}
function openDmWith(uid){
  if(!me) return;
  currentDmUid=uid; $('#dmMessages').innerHTML=''; $('#dmHeader').textContent=displayName(uid);
  const tid=threadId(me.uid,uid); if(dmRef) db.ref('privateMessages/'+tid).off();
  dmRef=db.ref('privateMessages/'+tid).limitToLast(200); dmRef.on('child_added',s=>renderMsg($('#dmMessages'),s.val()));
}
async function sendDm(){
  if(!me||!currentDmUid) return; const text=($('#dmInput').value||'').trim(); if(!text && !pendingDmPhoto) return;
  const tid=threadId(me.uid,currentDmUid); const m={by:me.uid,ts:now()}; if(text)m.text=text; if(pendingDmPhoto)m.photo=pendingDmPhoto;
  await db.ref('privateMessages/'+tid).push(m);
  await db.ref('inboxMeta/'+me.uid+'/'+currentDmUid).set({ts:now()});
  await db.ref('inboxMeta/'+currentDmUid+'/'+me.uid).set({ts:now()});
  $('#dmInput').value=''; pendingDmPhoto=null;
}
function sendFriendRequest(toUid){
  if(!me) return; db.ref('friendRequests/'+toUid+'/'+me.uid).set({from:me.uid,ts:now(),status:'pending'});
  alert('Заявка відправлена');
}
function subFriends(){
  if(!me) return; $('#friendRequests').innerHTML='';
  db.ref('friendRequests/'+me.uid).on('child_added',s=>{ const from=s.key; const d=document.createElement('div'); d.className='msg';
    d.innerHTML=`<div class="ava"><img src="${displayAvatar(from)}"></div><div class="b"><div class="name">${displayName(from)}</div><div class="row"><button data-acc="${from}">Прийняти</button></div></div>`;
    d.querySelector('[data-acc]').onclick=()=>acceptFriend(from); $('#friendRequests').appendChild(d);
  });
  $('#friendsList').innerHTML=''; db.ref('friends/'+me.uid).on('child_added',s=>{ const uid=s.key; const el=document.createElement('div'); el.className='msg';
    el.innerHTML=`<div class="ava"><img src="${displayAvatar(uid)}"></div><div class="b"><div class="name">${displayName(uid)}</div></div>`; el.onclick=()=>openDmWith(uid); $('#friendsList').appendChild(el);
  });
}
async function acceptFriend(from){
  if(!me) return; const my=me.uid; await db.ref('friends/'+my+'/'+from).set({status:'accepted',ts:now()});
  await db.ref('friends/'+from+'/'+my).set({status:'accepted',ts:now()}); await db.ref('friendRequests/'+my+'/'+from).remove();
}

/* help & announcements */
function subHelp(){
  const g=$('#helpGrid'); g.innerHTML=''; db.ref('help/'+CURRENT_CITY+'/cards').limitToLast(200).on('child_added',s=>{ const v=s.val()||{};
    const card=document.createElement('div'); card.className='card'; if(v.image){const im=new Image(); im.src=v.image; card.appendChild(im);}
    const t=document.createElement('div'); t.innerHTML=`<b>${v.title||'Без назви'}</b>`; card.appendChild(t);
    if(v.text){const p=document.createElement('div'); p.textContent=v.text; card.appendChild(p);}
    if(v.link){const a=document.createElement('a'); a.href=v.link; a.target='_blank'; a.textContent='Відкрити →'; card.appendChild(a);}
    g.prepend(card);
  });
}
async function helpPost(){
  if(!me||me.email!==window.ADMIN_EMAIL) return; const title=$('#helpTitle').value.trim(); const text=$('#helpText').value.trim(); const link=$('#helpLink').value.trim(); const image=$('#helpImageUrl').value.trim();
  if(!title&&!text&&!image) return; await db.ref('help/'+CURRENT_CITY+'/cards').push({title,text,link:link||null,image:image||null,ts:now(),by:me.uid});
  $('#helpTitle').value=''; $('#helpText').value=''; $('#helpLink').value=''; $('#helpImageUrl').value='';
}
function subAnn(){
  const g=$('#annFeed'); g.innerHTML=''; db.ref('announcements/'+CURRENT_CITY).limitToLast(200).on('child_added',s=>{ const v=s.val()||{};
    const card=document.createElement('div'); card.className='card'; if(v.image){const im=new Image(); im.src=v.image; card.appendChild(im);}
    const t=document.createElement('div'); t.innerHTML=`<b>${v.title||'Без назви'}</b> ${v.price?(' · '+v.price):''}`; card.appendChild(t);
    if(v.kind){const k=document.createElement('div'); k.className='muted'; k.textContent=v.kind; card.appendChild(k);}
    if(v.text){const p=document.createElement('div'); p.textContent=v.text; card.appendChild(p);}
    g.prepend(card);
  });
}
async function annPost(){
  if(!me||me.email!==window.ADMIN_EMAIL) return; const title=$('#annTitle').value.trim(); const text=$('#annText').value.trim(); const price=$('#annPrice').value.trim(); const image=$('#annImageUrl').value.trim(); const kind=$('#annKind').value;
  await db.ref('announcements/'+CURRENT_CITY).push({title,text,price:price||null,image:image||null,kind,ts:now(),by:me.uid});
  $('#annTitle').value=''; $('#annText').value=''; $('#annPrice').value=''; $('#annImageUrl').value='';
}

/* payments */
async function paySend(){
  if(!me) return alert('Увійдіть');
  const plan=$('#payPlan').value; const amount=($('#payAmount').value||'').trim()||null; const file=$('#payFile').files[0];
  if(!file) return alert('Додайте фото/скрин оплати');
  const r=new FileReader(); r.onload=async()=>{ const receipt=r.result; const req={uid:me.uid,plan,amount,receipt,ts:now()}; await db.ref('payments/requests/'+me.uid).push(req); alert('Заявку на оплату надіслано'); }; r.readAsDataURL(file);
}
async function loadPayInbox(){
  if(!me||me.email!==window.ADMIN_EMAIL) return; const inbox=$('#payInbox'); inbox.innerHTML=''; const snap=await db.ref('payments/requests').get(); const all=snap.val()||{};
  for(const uid in all){ for(const key in all[uid]){ const r=all[uid][key];
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${displayAvatar(uid)}"></div><div class="b"><div class="name">${displayName(uid)}</div><div class="text">План: <b>${r.plan}</b> ${r.amount?(' · '+r.amount):''} ${r.receipt?'<a target="_blank" href="'+r.receipt+'">чек</a>':''}</div><div class="row"><button data-approve="${uid}" data-plan="${r.plan}">Підтвердити</button></div></div>`;
    row.querySelector('[data-approve]').onclick=async()=>{ const plan=row.querySelector('[data-approve]').dataset.plan; await db.ref('users/'+uid+'/plan').set(plan); alert('План '+plan+' активовано'); };
    inbox.appendChild(row);
  } }
}

/* map */
let map,markers=[],poiRef=null;
function initMap(){
  if(map) return; map=L.map('map').setView([50.0755,14.4378],7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  document.addEventListener('keydown',e=>{ if(!$('#view-map').classList.contains('active')) return; const key=e.key.toLowerCase(); const mp={'v':'vol','s':'shop','p':'pharm','h':'hosp'}; if(mp[key]) addPoiQuick(mp[key]); });
}
function subMap(){
  markers.forEach(m=>m.remove()); markers=[]; if(poiRef) poiRef.off();
  poiRef=db.ref('map/poi/'+CURRENT_CITY);
  poiRef.on('child_added',s=>{ const v=s.val()||{}; const m=L.marker([v.lat||50.08,v.lng||14.43]).addTo(map);
    m.bindPopup(`<div style="min-width:180px">${v.img?`<img src="${v.img}" style="width:100%;border-radius:8px;margin-bottom:6px">`:''}<b>${v.title||'Точка'}</b><div>${v.type||''}</div>${v.link?`<div><a target="_blank" href="${v.link}">Відкрити</a></div>`:''}</div>`); markers.push(m); });
}
async function addPoi(){
  if(!me||me.email!==window.ADMIN_EMAIL) return; const c=map.getCenter(); const title=$('#poiTitle').value.trim(); const type=$('#poiType').value; const img=$('#poiImageUrl').value.trim(); const link=$('#poiLink').value.trim();
  await db.ref('map/poi/'+CURRENT_CITY).push({title,type,img:img||null,link:link||null,lat:c.lat,lng:c.lng,ts:now(),by:me.uid});
  $('#poiTitle').value=''; $('#poiImageUrl').value=''; $('#poiLink').value='';
}
async function addPoiQuick(type){
  if(!me||me.email!==window.ADMIN_EMAIL) return; const c=map.getCenter();
  await db.ref('map/poi/'+CURRENT_CITY).push({title:type.toUpperCase(), type, lat:c.lat,lng:c.lng,ts:now(),by:me.uid});
}
async function setCityWall(global=false){
  if(!me||me.email!==window.ADMIN_EMAIL) return; const url=$('#cityWall').value.trim(); if(!url) return;
  if(global) await db.ref('settings/theme/wallUrl').set(url);
  else await db.ref('settings/theme/cityBackgrounds/'+CURRENT_CITY).set(url);
  updateWall();
}
async function updateWall(){
  try{ const cs=await db.ref('settings/theme/cityBackgrounds/'+CURRENT_CITY).get(); const gs=await db.ref('settings/theme/wallUrl').get();
    const url=(cs.exists()?cs.val():(gs.exists()?gs.val():null))||'https://i.ibb.co/pr18RzG3/charles-bridge-prague.jpg';
    document.documentElement.style.setProperty('--wall',`url('${url}')`);
  }catch(e){}
}

/* open user profile */
let _profileUid=null;
async function openUserProfile(uid){
  _profileUid=uid;
  const up=(await db.ref('usersPublic/'+uid).get()).val()||{name:'Користувач',avatar:DEFAULT_AVA};
  const u2=(await db.ref('users/'+uid).get()).val()||{role:'seeker',plan:'free'};
  $('#upName').textContent = up.name||'Профіль';
  $('#upNick').textContent = up.name||'Користувач';
  $('#upAvatar').src = up.avatar||DEFAULT_AVA;
  $('#upRole').textContent = u2.role||'seeker';
  $('#upPlan').textContent = u2.plan||'free';
  $('#userProfileModal').hidden=false;
}

/* admin helpers */
async function adminFillUsersPublic(){
  if(!me||me.email!==window.ADMIN_EMAIL) return; const us=(await db.ref('users').get()).val()||{};
  for(const uid in us){ const up=(await db.ref('usersPublic/'+uid).get()).val()||{};
    const name=up.name || us[uid].name || (us[uid].email?us[uid].email.split('@')[0]:'Користувач');
    const avatar=up.avatar || DEFAULT_AVA;
    await db.ref('usersPublic/'+uid).set({name,avatar});
  }
  alert('usersPublic заповнено');
}
async function adminAddMeFriends(){
  if(!me||me.email!==window.ADMIN_EMAIL) return; const us=(await db.ref('usersPublic').get()).val()||{};
  for(const uid in us){ if(uid===me.uid) continue; await db.ref('friends/'+me.uid+'/'+uid).set({status:'accepted',ts:now()}); await db.ref('friends/'+uid+'/'+me.uid).set({status:'accepted',ts:now()}); }
  alert('Додано у друзі всім');
}

/* feedback */
async function sendFeedback(){
  const sub=($('#fbSubject').value||'').trim(); const txt=($('#fbText').value||'').trim(); const f=$('#fbFile').files[0];
  if(!txt && !f) return alert('Опишіть проблему або додайте скрин');
  const base={subject:sub||'(без теми)', text:txt||null, ts:now(), from: (me?me.uid:'guest')};
  if(f){ const r=new FileReader(); r.onload=async()=>{ await db.ref('support/requests').push(Object.assign(base,{image:r.result})); alert('Надіслано в підтримку'); $('#feedbackModal').hidden=true; }; r.readAsDataURL(f); }
  else { await db.ref('support/requests').push(base); alert('Надіслано в підтримку'); $('#feedbackModal').hidden=true; }
}
