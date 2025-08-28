// Helpers
const $ = s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));

// Tabs
const tabButtons = $$('.tab-button'); const tabContents = $$('.tab-content');
function setActiveTab(id){ tabButtons.forEach(b=>b.classList.toggle('active', b.dataset.target===id)); tabContents.forEach(c=> c.style.display = (c.id===id)?'block':'none'); }
tabButtons.forEach(b=> b.addEventListener('click', ()=> setActiveTab(b.dataset.target)));

// Firebase init (expects firebase/config.js to define firebaseConfig)
if(!firebase.apps.length){ firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth();
const db   = firebase.database();

// Wallpaper
const DEFAULT_WALL = "https://i.ibb.co/pr18RzG3/charles-bridge-prague.jpg";
const wallEl = document.getElementById('wallpaper');
function applyWallpaper(url){
  const u = url && /^https?:\/\/.+/.test(url) ? url : DEFAULT_WALL;
  document.documentElement.style.setProperty('--wall-url', `url("${u}")`);
  if (wallEl) wallEl.style.backgroundImage = `url("${u}")`;
}
db.ref('settings/theme/wallUrl').on('value', s=> applyWallpaper(s.val()));
applyWallpaper(DEFAULT_WALL);

// Presence (online ×10)
db.ref('presence').on('value', s=>{
  const count = s.exists() ? Object.keys(s.val()).length : 0;
  $('#onlineNeon').textContent = 'Онлайн (прибл.): ' + (count*10);
});

// Auth UI
function showAuth(){ $('#authModal').classList.add('show'); }
function hideAuth(){ $('#authModal').classList.remove('show'); }
$('#modalClose').onclick = hideAuth;
$('#loginShow').onclick = ()=>{ $('#registerForm').style.display='none'; $('#loginForm').style.display='block'; };
$('#backToRegister').onclick = ()=>{ $('#registerForm').style.display='block'; $('#loginForm').style.display='none'; };
$('#registerSubmit').onclick = async ()=>{
  const nick=$('#nickInput').value.trim(), email=$('#emailInput').value.trim(), pass=$('#passwordInput').value.trim();
  if(!nick||!email||pass.length<6){ $('#regError').textContent='Заповніть поля (пароль ≥ 6)'; return; }
  try{
    const cred=await auth.createUserWithEmailAndPassword(email,pass);
    await cred.user.updateProfile({ displayName:nick });
    await db.ref('users/'+cred.user.uid).set({ nick,email,avatar:'',createdAt:Date.now(), role:'seeker' });
    hideAuth();
  }catch(e){ $('#regError').textContent=e.message||String(e); }
};
$('#loginSubmit').onclick = async ()=>{
  try{ await auth.signInWithEmailAndPassword($('#loginEmail').value.trim(), $('#loginPassword').value.trim()); hideAuth(); }
  catch(e){ $('#loginError').textContent=e.message||String(e); }
};

auth.onAuthStateChanged(async u=>{
  $('#profileBtn').style.background = `url(${(u&&u.photoURL)||'https://i.ibb.co/Fqq6sH5q/istockphoto-1495088043-612x612.jpg'}) center/cover`;
  if(u){
    await db.ref('presence/'+u.uid).set({ ts:Date.now(), nick:u.displayName||u.email });
    renderFriends(); renderDMInbox(); loadPeopleAdmin(); loadMyPays(); checkAdminPayBox();
  }
});

// Notifications (bell)
const bellModal=$('#bellModal'); const bellBadge=$('#bellBadge');
$('#bellClose').onclick=()=> bellModal.classList.remove('show');
$('#bellBtn').onclick=()=>{ bellModal.classList.add('show'); bellBadge.textContent='0'; bellBadge.style.display='none'; };
$('#notifClearAll').onclick=async()=>{
  if(!auth.currentUser) return;
  const uid=auth.currentUser.uid;
  const ls = await db.ref('notifications/'+uid).get();
  const obj = ls.val()||{}; const updates={};
  Object.keys(obj).forEach(k=> updates['notifications/'+uid+'/'+k]=null);
  await db.ref().update(updates); $('#notifList').innerHTML='';
};
function renderNotifItem(id,v){
  const row=document.createElement('div');
  row.style.cssText='padding:8px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center';
  row.innerHTML = `<div style="flex:1"><div style="font-weight:800">${(v.type||'info').toUpperCase()}</div><div style="font-size:13px">${v.text||''}</div></div>
                   <button class="tab-button alt" data-act="ok">✖</button>`;
  row.querySelector('[data-act=ok]').onclick=()=> db.ref('notifications/'+auth.currentUser.uid+'/'+id).remove();
  $('#notifList').prepend(row);
}
function subscribeNotifications(uid){
  db.ref('notifications/'+uid).off();
  db.ref('notifications/'+uid).on('child_added', snap=>{
    renderNotifItem(snap.key, snap.val()||{});
    bellBadge.style.display='inline-block';
    bellBadge.textContent=String(Number(bellBadge.textContent||'0')+1);
  });
}
function notify(toUid,type,text,extra){
  const obj = { ts:Date.now(), type, text, ...(extra||{}), from: auth.currentUser?.uid||'system' };
  return db.ref('notifications/'+toUid).push(obj);
}
auth.onAuthStateChanged(u=>{ if(u) subscribeNotifications(u.uid); });

// Messages (basic)
function timeStr(ts){ return new Date(ts).toLocaleString(); }
function renderMessage(m,container){
  const wr=document.createElement('div'); wr.className='message'+((auth.currentUser&&m.uid===auth.currentUser.uid)?' self':'');
  const av=document.createElement('img'); av.className='avatar'; av.src=m.avatar||'https://i.ibb.co/Fqq6sH5q/istockphoto-1495088043-612x612.jpg';
  const box=document.createElement('div'); box.className='message-content';
  const meta=document.createElement('div'); meta.className='message-meta'; meta.textContent=`${m.nick||'Анонім'} · ${timeStr(m.ts)}`;
  box.appendChild(meta);
  if(m.text){ const p=document.createElement('div'); p.className='text'; p.innerText=m.text; box.appendChild(p); }
  if(m.image){ const im=document.createElement('img'); im.src=m.image; im.className='chat-image'; im.alt='Фото'; box.appendChild(im); }
  wr.appendChild(av); wr.appendChild(box); container.appendChild(wr);
}
db.ref('messages').limitToLast(200).on('child_added', s=> renderMessage(s.val(), $('#messages')));
db.ref('rentMessages').limitToLast(200).on('child_added', s=> renderMessage(s.val(), $('#rentMessages')));

$('#sendButton').onclick = async ()=>{
  if(!auth.currentUser){ showAuth(); return; }
  const t=$('#messageInput').value.trim(); if(!t) return;
  const u=auth.currentUser;
  const msg={ uid:u.uid, nick:u.displayName||u.email||'Анонім', avatar:u.photoURL||'', text:t, ts:Date.now() };
  await db.ref('messages').push(msg);
  $('#messageInput').value='';
};
$('#rentSendButton').onclick = async ()=>{
  if(!auth.currentUser){ showAuth(); return; }
  const t=$('#rentMessageInput').value.trim(); if(!t) return;
  const u=auth.currentUser;
  const msg={ uid:u.uid, nick:u.displayName||u.email||'Анонім', avatar:u.photoURL||'', text:t, ts:Date.now() };
  await db.ref('rentMessages').push(msg);
  $('#rentMessageInput').value='';
};

// Friends + Requests
async function renderFriends(){
  const u=auth.currentUser; if(!u){ $('#friendsList').innerHTML=''; $('#friendRequests').innerHTML=''; return; }
  // Requests in
  const reqSnap=await db.ref('friendRequests/'+u.uid).get();
  const reqEl=$('#friendRequests'); reqEl.innerHTML='';
  if(reqSnap.exists()){
    const reqs=reqSnap.val();
    for(const fromUid of Object.keys(reqs)){
      const ud=(await db.ref('users/'+fromUid).get()).val()||{nick:'Користувач'};
      const item=document.createElement('div'); item.className='help-card';
      item.innerHTML=`<div style="display:flex;align-items:center">
        <img src="${ud.avatar||'https://i.ibb.co/Fqq6sH5q/istockphoto-1495088043-612x612.jpg'}" alt="" />
        <div style="flex:1;padding-left:8px"><b>${ud.nick||'Користувач'}</b><div style="font-size:12px;color:#64748b">${ud.email||''}</div></div>
        <div style="display:flex;gap:6px">
          <button class="tab-button" data-a="ok"  data-u="${fromUid}">✅ Прийняти</button>
          <button class="tab-button danger" data-a="no" data-u="${fromUid}">✖</button>
        </div></div>`;
      reqEl.appendChild(item);
    }
  } else {
    reqEl.innerHTML='<i>Немає заявок</i>';
  }

  reqEl.querySelectorAll('button[data-a=ok]').forEach(b=> b.onclick=async()=>{
    const from=b.dataset.u, me=auth.currentUser.uid;
    await db.ref('friends/'+me+'/'+from).set({ status:'accepted', ts:Date.now() });
    await db.ref('friends/'+from+'/'+me).set({ status:'accepted', ts:Date.now() });
    await db.ref('friendRequests/'+me+'/'+from).remove();
    await notify(from,'friend_ok','Вашу заявку прийнято',{});
    renderFriends();
  });
  reqEl.querySelectorAll('button[data-a=no]').forEach(b=> b.onclick=async()=>{
    const from=b.dataset.u, me=auth.currentUser.uid;
    await db.ref('friendRequests/'+me+'/'+from).remove();
    await db.ref('friends/'+from+'/'+me).remove();
    renderFriends();
  });

  // Friends list
  const list=$('#friendsList'); list.innerHTML='';
  const frSnap=await db.ref('friends/'+u.uid).get();
  if(frSnap.exists()){
    const fr=frSnap.val();
    for(const fid of Object.keys(fr)){
      const rel=fr[fid]; if(rel.status!=='accepted') continue;
      const ud=(await db.ref('users/'+fid).get()).val()||{nick:'Користувач'};
      const card=document.createElement('div'); card.className='help-card';
      card.innerHTML=`<div style="display:flex;align-items:center">
        <img src="${ud.avatar||'https://i.ibb.co/Fqq6sH5q/istockphoto-1495088043-612x612.jpg'}" alt=""/>
        <div style="flex:1;padding-left:8px"><b>${ud.nick||'Користувач'}</b><div style="font-size:12px;color:#64748b">${ud.email||''}</div></div>
        <div><button class="tab-button" data-a="pm" data-u="${fid}">✉️</button></div>
      </div>`;
      list.appendChild(card);
    }
  } else list.innerHTML='<i>Додайте друзів через профілі</i>';
}

// Open profile (with Add Friend)
async function openProfile(uid){
  $('#profileContent').innerHTML='<p>Завантаження…</p>'; $('#profileModal').classList.add('show');
  const user=(await db.ref('users/'+uid).get()).val()||{nick:'Анонім'};
  const self = auth.currentUser && auth.currentUser.uid===uid;
  $('#profileContent').innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      <img src="${user.avatar||'https://i.ibb.co/Fqq6sH5q/istockphoto-1495088043-612x612.jpg'}" style="width:84px;height:84px;border-radius:12px;object-fit:cover">
      <div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <h3 style="margin:0">${user.nick||'Анонім'}</h3>
          <span class="user-badge">${user.email||''}</span>
        </div>
      </div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      ${ self ? `<button id="signOutBtn" class="tab-button danger">Вийти</button>` :
        `<button id="pmBtn" class="tab-button">Написати ЛС</button>
         <button id="addFriendBtn" class="tab-button">Додати в друзі</button>
         <span id="reqStatus" style="margin-left:6px;color:#059669;font-weight:700"></span>`}
    </div>
  `;
  $('#profileClose').onclick=()=> $('#profileModal').classList.remove('show');
  if(self){
    $('#signOutBtn').onclick=async()=>{ await db.ref('presence/'+auth.currentUser.uid).remove().catch(()=>{}); await auth.signOut(); $('#profileModal').classList.remove('show'); };
  } else {
    $('#pmBtn').onclick=()=> {/* open DM modal here if needed */};
    $('#addFriendBtn').onclick=async()=>{
      const toUid=uid, from=auth.currentUser?.uid;
      if(!from){ showAuth(); return; }
      await db.ref('friendRequests/'+toUid+'/'+from).set({ from, ts:Date.now() });
      await db.ref('friends/'+from+'/'+toUid).set({ status:'requested', ts:Date.now(), fromUid:from });
      await notify(toUid,'friend_req',`Запит у друзі від ${auth.currentUser.displayName||'Користувач'}`,{});
      const s=$('#reqStatus'); if(s){ s.textContent='Заявку надіслано'; }
      renderFriends();
    };
  }
}

// Hook profile button
$('#profileBtn').onclick = ()=>{
  if(!auth.currentUser) showAuth();
  else openProfile(auth.currentUser.uid);
};

// Payments
$('#paySend').onclick = async ()=>{
  if(!auth.currentUser){ showAuth(); return; }
  const url = $('#payImgUrl').value.trim(); if(!url){ $('#paySendMsg').style.display='block'; $('#paySendMsg').textContent='Вкажіть URL скріншоту'; return; }
  await db.ref('payments/inbox/'+auth.currentUser.uid).push({ ts:Date.now(), image:url, status:'new' });
  $('#payImgUrl').value=''; loadMyPays();
};

async function loadMyPays(){
  if(!auth.currentUser) return;
  const snap=await db.ref('payments/inbox/'+auth.currentUser.uid).get();
  const v=snap.val()||{}; const el=$('#myPays'); el.innerHTML='';
  Object.keys(v).reverse().forEach(k=>{
    const it=v[k];
    const row=document.createElement('div'); row.className='help-card';
    row.innerHTML=`<div style="display:flex;gap:8px;align-items:center">
      <img src="${it.image}" style="width:64px;height:64px;border-radius:8px;object-fit:cover">
      <div style="flex:1"><b>${new Date(it.ts).toLocaleString()}</b><div style="font-size:12px;color:#64748b">Статус: ${it.status||'new'}</div></div>
    </div>`;
    el.appendChild(row);
  });
}
auth.onAuthStateChanged(()=> loadMyPays());

async function checkAdminPayBox(){
  const u=auth.currentUser; if(!u) return;
  const isAdmin = (await db.ref('settings/admins/'+u.uid).get()).val()===true || (u.email==='urciknikolaj642@gmail.com');
  $('#payAdminBox').style.display = isAdmin?'block':'none';
  if(isAdmin) loadPayInboxAdmin();
}
async function loadPayInboxAdmin(){
  const box = $('#payInboxAll'); box.innerHTML='';
  const all = (await db.ref('payments/inbox').get()).val()||{};
  for(const uid of Object.keys(all)){
    for(const pid of Object.keys(all[uid])){
      const it=all[uid][pid]; const user=(await db.ref('users/'+uid).get()).val()||{};
      const row=document.createElement('div'); row.className='help-card';
      row.innerHTML=`<div style="display:flex;gap:8px;align-items:center">
        <img src="${it.image}" style="width:64px;height:64px;border-radius:8px;object-fit:cover">
        <div style="flex:1"><b>${user.nick||'Користувач'}</b> <span class="user-badge">${user.email||''}</span><div style="font-size:12px;color:#64748b">${new Date(it.ts).toLocaleString()}</div></div>
        <div style="display:flex;gap:6px">
          <button class="tab-button" data-a="access" data-u="${uid}" data-p="${pid}">Доступ 50</button>
          <button class="tab-button" data-a="prem" data-u="${uid}" data-p="${pid}">Преміум 100</button>
          <button class="tab-button" data-a="premplus" data-u="${uid}" data-p="${pid}">Преміум+ 199</button>
          <button class="tab-button alt" data-a="ok" data-u="${uid}" data-p="${pid}">Ок</button>
        </div>
      </div>`;
      box.appendChild(row);
    }
  }
  box.querySelectorAll('button[data-a]').forEach(btn=> btn.onclick=async()=>{
    const a=btn.dataset.a, uid=btn.dataset.u, pid=btn.dataset.p;
    if(a==='access'){ await db.ref('settings/userFlags/'+uid).update({ employerAccess:true, textRemaining:200, photoRemaining:100 }); }
    else if(a==='prem'){ await db.ref('settings/userFlags/'+uid).update({ premium:'premium', premiumUntil: Date.now()+30*24*3600*1000 }); }
    else if(a==='premplus'){ await db.ref('settings/userFlags/'+uid).update({ premium:'premiumPlus', premiumUntil: Date.now()+30*24*3600*1000 }); }
    await db.ref('payments/inbox/'+uid+'/'+pid+'/status').set('checked');
    await notify(uid,'system','Оплату підтверджено. Доступ оновлено.',{});
    loadPayInboxAdmin();
  });
}

// People (Admin)
async function loadPeopleAdmin(){
  const u=auth.currentUser; if(!u) return;
  const isAdmin = (await db.ref('settings/admins/'+u.uid).get()).val()===true || (u.email==='urciknikolaj642@gmail.com');
  const box=$('#peopleGrid'); box.innerHTML='';
  if(!isAdmin){ box.innerHTML='<i>Тільки для адміна</i>'; return; }
  const users=(await db.ref('users').get()).val()||{};
  const flags=(await db.ref('settings/userFlags').get()).val()||{};
  for(const uid of Object.keys(users)){
    const us=users[uid]; const fl=flags[uid]||{};
    const card=document.createElement('div'); card.className='help-card';
    card.innerHTML=`<div style="display:flex;gap:10px;align-items:center">
      <img src="${us.avatar||'https://i.ibb.co/Fqq6sH5q/istockphoto-1495088043-612x612.jpg'}" style="width:48px;height:48px;border-radius:8px;object-fit:cover">
      <div style="flex:1">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <b>${us.nick||'Користувач'}</b>
          <span class="user-badge">${us.email||''}</span>
          <span class="user-badge">Роль: ${us.role||'seeker'}</span>
          <span class="user-badge">Текст: ${fl.textRemaining??'—'}</span>
          <span class="user-badge">Фото: ${fl.photoRemaining??'—'}</span>
          <span class="user-badge">${fl.premium||'none'}</span>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="tab-button" data-a="ban" data-u="${uid}">${fl.blocked?'Розбанити':'Забанити'}</button>
      <button class="tab-button" data-a="prem" data-u="${uid}">Преміум</button>
      <button class="tab-button" data-a="premplus" data-u="${uid}">Преміум+</button>
      <button class="tab-button alt" data-a="text+" data-u="${uid}">+50 текст</button>
      <button class="tab-button alt" data-a="photo+" data-u="${uid}">+20 фото</button>
      <button class="tab-button alt" data-a="role" data-u="${uid}">Змінити роль</button>
    </div>`;
    box.appendChild(card);
  }
  box.querySelectorAll('button[data-a]').forEach(btn=> btn.onclick=async()=>{
    const a=btn.dataset.a, uid=btn.dataset.u;
    if(a==='ban'){ const cur=(await db.ref('settings/userFlags/'+uid+'/blocked').get()).val()===true; await db.ref('settings/userFlags/'+uid+'/blocked').set(!cur); }
    else if(a==='prem'){ await db.ref('settings/userFlags/'+uid).update({ premium:'premium', premiumUntil:Date.now()+30*24*3600*1000 }); }
    else if(a==='premplus'){ await db.ref('settings/userFlags/'+uid).update({ premium:'premiumPlus', premiumUntil:Date.now()+30*24*3600*1000 }); }
    else if(a==='text+'){ const v=Number((await db.ref('settings/userFlags/'+uid+'/textRemaining').get()).val()||0); await db.ref('settings/userFlags/'+uid+'/textRemaining').set(v+50); }
    else if(a==='photo+'){ const v=Number((await db.ref('settings/userFlags/'+uid+'/photoRemaining').get()).val()||0); await db.ref('settings/userFlags/'+uid+'/photoRemaining').set(v+20); }
    else if(a==='role'){ const cur=(await db.ref('users/'+uid+'/role').get()).val()||'seeker'; const next= (cur==='seeker'?'employer':'seeker'); await db.ref('users/'+uid+'/role').set(next); }
    loadPeopleAdmin();
  });
}

// Expose profile opener for avatar clicks in messages in future
window.openProfile = openProfile;
