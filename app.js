async function logActivity(type, meta={}){ const u=auth && auth.currentUser; if(!u) return; try{ await db.ref('activity/'+u.uid).push({type,meta,ts:Date.now(),by:u.uid}); }catch(e){} }\n\n
// ===== Utils & i18n
const $ = (q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const escapeHtml = (s='')=>s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const i18n = {
  uk: { city:'Місто:', chat:'Чат', rent:'Оренда', map:'Карта', friends:'Друзі', dm:'Особисті', help:'Допомога', ph_chat:'Напишіть повідомлення...' },
  cs: { city:'Město:', chat:'Chat', rent:'Pronájem', map:'Mapa', friends:'Přátelé', dm:'Soukromé', help:'Pomoc', ph_chat:'Napište zprávu...' }
};
function applyLang(lang='uk'){
  const t=i18n[lang]||i18n.uk;
  $$('[data-i18n="city"]').forEach(n=>n.textContent=t.city);
  $$('[data-i18n="chat"]').forEach(n=>n.textContent=t.chat);
  $$('[data-i18n="rent"]').forEach(n=>n.textContent=t.rent);
  $$('[data-i18n="map"]').forEach(n=>n.textContent=t.map);
  $$('[data-i18n="friends"]').forEach(n=>n.textContent=t.friends);
  $$('[data-i18n="dm"]').forEach(n=>n.textContent=t.dm);
  $$('[data-i18n="help"]').forEach(n=>n.textContent=t.help);
  $('#chatInput')?.setAttribute('placeholder', t.ph_chat);
}
const emailOk = e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e||'');

// ===== Global
if(!localStorage.getItem('city')) localStorage.setItem('city','praha');
window.CURRENT_CITY = localStorage.getItem('city') || 'praha';
window.MINI_AUTH_TIMER = null;
window.PENDING_POST = null;
window.AUTO_AUTH_ON_LOAD = false; // Не показывать авторизацию при заходе

// ===== Sounds
const audioNodes = {};
function ensureAudio(){
  ['chat','chat2','friend','dm','notif'].forEach(k=>{
    if(!audioNodes[k]){
      const el=document.createElement('audio');
      el.preload='none'; el.src = (window.SOUND_URLS && window.SOUND_URLS[k]) || '';
      audioNodes[k]=el; document.body.appendChild(el);
    }
  });
}
function playSound(name){ try{ ensureAudio(); const el=audioNodes[name]; if(el && el.src){ el.currentTime=0; el.play().catch(()=>beep()); } else beep(); }catch(e){ beep(); } }
function beep(){ try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(), g=ctx.createGain(); o.type='sine'; o.connect(g); g.connect(ctx.destination); o.start(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.18); o.stop(ctx.currentTime+0.2);}catch{} }

// ===== Modal helpers
function showModal(id, show=true){ const m=$(id); if(!m) return; m.hidden=!show; if(show){ m.style.removeProperty('display'); } else { m.style.display='none'; } }
function showAuth(show=true, mini=false){
  const m=$('#authModal'); if(!m) return;
  showModal('#authModal', show);
  m.querySelector('.card').style.maxWidth = mini ? '420px' : '680px';
  $('#authTitle').textContent = mini ? 'Швидка авторизація' : 'Реєстрація / Вхід';
  $('#modeLogin')?.classList.add('active'); $('#modeSignup')?.classList.remove('active');
}

// ===== Page wiring after DOM ready
  // Tabs show one view at a time
  const tabbar = document.getElementById('tabs');
  if (tabbar) {
    tabbar.addEventListener('click', (e)=>{
      const btn = e.target.closest('.tab');
      if(!btn) return;
      const tab = btn.getAttribute('data-tab');
      if(!tab) return;
      document.querySelectorAll('.tabs .tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      document.getElementById('view-'+tab).classList.add('active');
    });
  }

document.addEventListener('DOMContentLoaded', ()=>{

  // Close buttons & ESC
  $('#authClose')?.addEventListener('click', ()=> showAuth(false));
  $('#profileClose')?.addEventListener('click', ()=> showModal('#profileModal', false));
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){ showAuth(false); showModal('#profileModal',false); $('#notifPanel').hidden=true; }
  });

  $('#profileBtn')?.addEventListener('click', ()=>{ if(!auth.currentUser) showAuth(true,false); else showModal('#profileModal', true); });
  $('#btnSignout')?.addEventListener('click', async()=>{ try{ await auth.signOut(); showModal('#profileModal',false); }catch(e){ alert(e.message); } });

  // Toggle login/signup
  $('#modeLogin')?.addEventListener('click', ()=>{ $('#modeLogin').classList.add('active'); $('#modeSignup').classList.remove('active'); });
  $('#modeSignup')?.addEventListener('click', ()=>{ $('#modeSignup').classList.add('active'); $('#modeLogin').classList.remove('active'); });

  // Email flows
  $('#authSignin')?.addEventListener('click', async()=>{
    try{
      const email=$('#authEmail').value.trim(); const pass=$('#authPass').value;
      if(!emailOk(email)) return $('#authMsg').textContent='Невалідна адреса email';
      await auth.signInWithEmailAndPassword(email, pass);
      $('#authMsg').textContent='Успішний вхід'; showAuth(false);
      if(window.PENDING_POST){ await window.PENDING_POST(); window.PENDING_POST=null; }
    }catch(e){ $('#authMsg').textContent=e.message; }
  });
  $('#authSignup')?.addEventListener('click', async()=>{
    try{
      const email=$('#authEmail').value.trim(); const pass=$('#authPass').value; const nick=$('#authNick').value.trim()||'Користувач';
      const lang=$('#authLang').value||'uk'; const role=$('#authRole').value||'seeker';
      if(!emailOk(email)) return $('#authMsg').textContent='Невалідна адреса email';
      if((pass||'').length<6) return $('#authMsg').textContent='Пароль занадто короткий (мін. 6)';
      const cred=await auth.createUserWithEmailAndPassword(email, pass);
      const prof={name:nick,email,avatar:"https://i.pravatar.cc/64",plan:"none",createdAt:Date.now(),lang,role};
      await db.ref('users/'+cred.user.uid).set(prof);
      await db.ref('usersPublic/'+cred.user.uid).set({name:nick, avatar:prof.avatar});
      applyLang(lang);
      $('#authMsg').textContent='Готово'; showAuth(false);
      if(window.PENDING_POST){ await window.PENDING_POST(); window.PENDING_POST=null; }
    }catch(e){ $('#authMsg').textContent=e.message; }
  });
  $('#authReset')?.addEventListener('click', async()=>{
    const email=$('#authEmail').value.trim(); if(!emailOk(email)) return $('#authMsg').textContent='Вкажіть коректний email для відновлення';
    try{ await auth.sendPasswordResetEmail(email); $('#authMsg').textContent='Лист для скидання паролю відправлено'; }catch(e){ $('#authMsg').textContent=e.message; }
  });
  // Google sign-in
  $('#authGoogle')?.addEventListener('click', async()=>{
    try{
      const provider = new firebase.auth.GoogleAuthProvider();
      const res = await auth.signInWithPopup(provider);
      const u = res.user;
      const s = await db.ref('users/'+u.uid).get();
      if(!s.exists()){
        await db.ref('users/'+u.uid).set({
          name: u.displayName || 'Користувач',
          email: u.email || '',
          avatar: u.photoURL || 'https://i.pravatar.cc/64',
          plan: 'none',
          createdAt: Date.now(),
          lang: 'uk',
          role: 'seeker'
        });
        await db.ref('usersPublic/'+u.uid).set({name: u.displayName || 'Користувач', avatar: u.photoURL || 'https://i.pravatar.cc/64'});
      }
      $('#authMsg').textContent='Google-вхід успішний'; showAuth(false);
      if(window.PENDING_POST){ await window.PENDING_POST(); window.PENDING_POST=null; }
    }catch(e){ $('#authMsg').textContent=e.message; }
  });

  // Notifications
  $('#bellBtn')?.addEventListener('click', ()=> $('#notifPanel').hidden=!$('#notifPanel').hidden);
  $('#notifClose')?.addEventListener('click', ()=> $('#notifPanel').hidden=true);
  $('#notifClear')?.addEventListener('click', ()=> $('#notifList').innerHTML='');

  // Participants shortcut => Friends tab
  $('#participantsBtn')?.addEventListener('click', ()=>{ 
    $$('.tabs .tab').forEach(t=>t.classList.remove('active')); $$('[data-tab="friends"]')[0].classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active')); $('#view-friends').classList.add('active');
  });

  // City change
  $('#citySelect')?.addEventListener('change', ()=>{
    window.CURRENT_CITY=$('#citySelect').value; localStorage.setItem('city',window.CURRENT_CITY);
    resubscribeChats(); connectHelp(); applyWallpaper(); subPoi();
  });

  // Wire composers
  wireChatComposer(); wireRentComposer();

});

// ===== Online indicator
setInterval(()=>{ $('#onlineCounter').textContent='Онлайн (прибл.): '+Math.floor(Math.random()*5+1)}, 4000);

// ===== Users cache
const usersCache={};
function subUsers(){ db.ref('usersPublic').on('value', s=>{ Object.assign(usersCache, s.val()||{}); }); }

// ===== Render helpers
function renderMessage(container, m){
  const wrap=document.createElement('div'); wrap.className='msg';
  const ava=document.createElement('div'); ava.className='ava';
  const img=document.createElement('img'); img.src=(usersCache[m.by]?.avatar)||'https://i.pravatar.cc/32'; ava.appendChild(img);
  const b=document.createElement('div'); b.className='b';
  const name=document.createElement('div'); name.className='name'; name.textContent=(usersCache[m.by]?.name)|| (m.by==='__bot__'?'InfoBot':'Користувач');
  const text=document.createElement('div'); text.className='text';
  text.innerHTML = escapeHtml(m.text||'') + (m.photo?`<div><img loading="lazy" src="${m.photo}" alt=""></div>`:'');
  b.appendChild(name); b.appendChild(text); wrap.appendChild(ava); wrap.appendChild(b);
  container.appendChild(wrap); container.scrollTop=container.scrollHeight;
}

// ===== Subscriptions (all cities work; Praha default)
let chatRef=null, rentRef=null;
function resubscribeChats(){
  const city=window.CURRENT_CITY;
  if(chatRef){ try{ chatRef.off(); }catch{} }
  if(rentRef){ try{ rentRef.off(); }catch{} }
  $('#chatFeed').innerHTML=''; $('#rentFeed').innerHTML='';
  chatRef=db.ref('messages/'+city).limitToLast(200);
  rentRef=db.ref('rentMessages/'+city).limitToLast(200);
  chatRef.on('child_added', s=> renderMessage($('#chatFeed'), s.val()));
  rentRef.on('child_added', s=> renderMessage($('#rentFeed'), s.val()));
}

// ===== Upload helper
async function uploadFile(file, folder){
  const uid = (auth.currentUser && auth.currentUser.uid) || 'anon';
  const ref = storage.ref().child(`${folder}/${uid}/${Date.now()}_${file.name}`);
  await ref.put(file);
  return await ref.getDownloadURL();
}

// ===== Quotas
async function getQuota(uid){ const node=await db.ref('limits/'+uid).get(); const def={text:200,photo:100}; if(!node.exists()){ await db.ref('limits/'+uid).set(def); return def;} return node.val(); }
async function decQuota(uid, kind){ const q=await getQuota(uid); q[kind]=Math.max(0,(q[kind]||0)-1); await db.ref('limits/'+uid).set(q); if(q.text<=20 || q.photo<=10){ playSound('notif'); } return q; }
async function updateQuotaUi(){ const u=auth.currentUser; if(!u) return; const q=await getQuota(u.uid); $('#quotaText').textContent=q.text||0; $('#quotaPhoto').textContent=q.photo||0; }

// ===== Composers (queue pending if not authed)
function requireAuthThen(fn){
  if(auth.currentUser) return fn();
  window.PENDING_POST = fn;
  // Показать мини-авторизацию только при попытке отправки
  showAuth(true, true);
}
function wireChatComposer(){
  let photo=null;
  document.addEventListener('change', (e)=>{
    if(e.target && e.target.id==='chatFile'){
      const f=e.target.files[0]; if(!f) return;
      requireAuthThen(async()=>{ photo=await uploadFile(f,'chat_images'); $('#chatToast').hidden=false; });
    }
  });
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='chatSend'){
      const action = async ()=>{
        const txt=$('#chatInput').value.trim(); if(!txt && !photo) return;
        const city=window.CURRENT_CITY; if(photo) await decQuota(auth.currentUser.uid,'photo'); else await decQuota(auth.currentUser.uid,'text');
        await db.ref('messages/'+city).push({text:txt||null,photo:photo||null,by:auth.currentUser.uid,ts:Date.now()}); await logActivity('message_sent',{city});
        $('#chatInput').value=''; $('#chatToast').hidden=true; photo=null; playSound('chat'); updateQuotaUi();
      };
      requireAuthThen(action);
    }
  });
}
function wireRentComposer(){
  let photo=null;
  document.addEventListener('change', (e)=>{
    if(e.target && e.target.id==='rentFile'){
      const f=e.target.files[0]; if(!f) return;
      requireAuthThen(async()=>{ photo=await uploadFile(f,'rent_images'); $('#rentToast').hidden=false; });
    }
  });
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='rentSend'){
      const action = async ()=>{
        const txt=$('#rentInput').value.trim(); if(!txt && !photo) return;
        const city=window.CURRENT_CITY; if(photo) await decQuota(auth.currentUser.uid,'photo'); else await decQuota(auth.currentUser.uid,'text');
        await db.ref('rentMessages/'+city).push({text:txt||null,photo:photo||null,by:auth.currentUser.uid,ts:Date.now()}); await logActivity('rent_posted',{city});
        $('#rentInput').value=''; $('#rentToast').hidden=true; photo=null; playSound('chat2'); updateQuotaUi();
      };
      requireAuthThen(action);
    }
  });
}

// ===== DMs
function threadId(a,b){ return [a,b].sort().join('_'); }
let dmRef=null;
async function openDmWith(uid){
  const me=auth.currentUser.uid; const tid=threadId(me,uid);
  if(dmRef){ try{ dmRef.off(); }catch{} } $('#dmMessages').innerHTML='';
  dmRef=db.ref('privateMessages/'+tid).limitToLast(200);
  dmRef.on('child_added', s=> renderMessage($('#dmMessages'), s.val()));
  $('#dmHeader').textContent=(usersCache[uid]?.name)||'Діалог';
  $('#dmSend').onclick = ()=>{
    const action = async()=>{
      const txt=$('#dmInput').value.trim(); let photo=null; const f=$('#dmFile').files[0]; if(f){ photo=await uploadFile(f,'dm_images'); $('#dmFile').value=''; }
      if(!txt && !photo) return; await db.ref('privateMessages/'+tid).push({text:txt||null,photo:photo||null,by:me,ts:Date.now()});
      await db.ref('inboxMeta/'+me+'/'+uid).set({ts:Date.now()}); await db.ref('inboxMeta/'+uid+'/'+me).set({ts:Date.now()});
      $('#dmInput').value=''; playSound('dm');
    };
    requireAuthThen(action);
  };
}
function loadDmSidebar(){
  const me = auth.currentUser && auth.currentUser.uid; if(!me) return;
  const sbar=$('#dmSidebar'); sbar.innerHTML='';
  db.ref('inboxMeta/'+me).on('child_added', snap=>{
    const uid=snap.key; const el=document.createElement('div'); el.className='msg';
    el.innerHTML=`<div class="ava"><img src="${(usersCache[uid]?.avatar)||'https://i.pravatar.cc/32'}"></div><div class="b"><div class="name">${(usersCache[uid]?.name)||'Користувач'}</div></div>`;
    el.onclick=()=> openDmWith(uid); sbar.appendChild(el);
  });
}

// ===== Friends
function sendFriendRequest(toUid){ const me=auth.currentUser.uid; const req={from:me,ts:Date.now(),status:'pending'}; db.ref('friendRequests/'+toUid+'/'+me).set(req); playSound('notif'); logActivity('friend_request_sent',{to:toUid}); }
function acceptFriend(fromUid){
  const me=auth.currentUser.uid;
  db.ref('friends/'+me+'/'+fromUid).set({status:'accepted',ts:Date.now()});
  db.ref('friends/'+fromUid+'/'+me).set({status:'accepted',ts:Date.now()});
  db.ref('friendRequests/'+me+'/'+fromUid).remove();
  logActivity('friend_accepted',{from:fromUid});
}
function subFriends(){
  const me=auth.currentUser && auth.currentUser.uid; if(!me) return;
  $('#friendRequests').innerHTML=''; db.ref('friendRequests/'+me).on('child_added', s=>{
    const uid=s.key; const el=document.createElement('div'); el.className='msg';
    el.innerHTML=`<div class="ava"><img src="${(usersCache[uid]?.avatar)||'https://i.pravatar.cc/32'}"></div><div class="b"><div class="name">${(usersCache[uid]?.name)||'Користувач'}</div><div class="text"><button data-accept="${uid}">Прийняти</button></div></div>`;
    el.querySelector('button').onclick=()=> acceptFriend(uid); $('#friendRequests').appendChild(el);
  });
  $('#friendsList').innerHTML=''; db.ref('friends/'+me).on('child_added', s=>{
    const uid=s.key; const el=document.createElement('div'); el.className='msg';
    el.innerHTML=`<div class="ava"><img src="${(usersCache[uid]?.avatar)||'https://i.pravatar.cc/32'}"></div><div class="b"><div class="name">${(usersCache[uid]?.name)||'Користувач'}</div></div>`; el.onclick=()=>openDmWith(uid); $('#friendsList').appendChild(el);
  });
}

// ===== Notifications
function pushNotif(n){ const li=document.createElement('div'); li.className='item'; li.textContent=n.text||'Подія'; $('#notifList').prepend(li); playSound('notif'); }

// ===== Help per-city
let helpRef=null, helpFile=null;
function connectHelp(){
  const city=window.CURRENT_CITY;
  if(helpRef){ try{ helpRef.off(); }catch{} } $('#helpGrid').innerHTML='';
  helpRef = db.ref('help/'+city+'/cards').limitToLast(200);
  helpRef.on('child_added', s=>{
    const v=s.val(); const card=document.createElement('div'); card.className='card';
    if(v.image){ const im=new Image(); im.src=v.image; card.appendChild(im); }
    const t=document.createElement('div'); t.innerHTML=`<b>${escapeHtml(v.title||'Без назви')}</b>`; card.appendChild(t);
    if(v.text){ const p=document.createElement('div'); p.textContent=v.text; card.appendChild(p); }
    if(v.link){ const a=document.createElement('a'); a.href=v.link; a.target='_blank'; a.rel='noopener'; a.textContent='Перейти →'; card.appendChild(a); }
    $('#helpGrid').prepend(card);
  });
  const showAdmin = auth.currentUser && auth.currentUser.email===window.ADMIN_EMAIL;
  $('#helpAdminBox').style.display = showAdmin?'block':'none';
}
document.addEventListener('change', (e)=>{ if(e.target && e.target.id==='helpImageFile'){ helpFile=e.target.files[0]||null; } });
document.addEventListener('click', async(e)=>{
  if(e.target && e.target.id==='helpPost'){
    if(!auth.currentUser) return showAuth(true,true);
    if(auth.currentUser.email!==window.ADMIN_EMAIL) return pushNotif({text:'Тільки для адміна'});
    const title=$('#helpTitle').value.trim(); const text=$('#helpText').value.trim(); const link=$('#helpLink').value.trim(); let image=$('#helpImageUrl').value.trim()||null;
    if(helpFile){ const ref=storage.ref().child(`help_images/${window.CURRENT_CITY}/${Date.now()}_${helpFile.name}`); await ref.put(helpFile); image=await ref.getDownloadURL(); helpFile=null; $('#helpImageFile').value=''; }
    if(!title && !text && !image) return;
    await db.ref('help/'+window.CURRENT_CITY+'/cards').push({title,text,link:link||null,image:image||null,ts:Date.now(),by:auth.currentUser.uid});
    $('#helpTitle').value=''; $('#helpText').value=''; $('#helpLink').value=''; $('#helpImageUrl').value=''; pushNotif({text:'Опубліковано в «Допомога»'});
  }
});

// ===== Map
let map, markers=[], poiRef=null;
function initMap(){
  if(map) return;
  map = L.map('map').setView([50.0755, 14.4378], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
  $('#mapCenter')?.addEventListener('click', ()=> map.setView([50.0755, 14.4378], 12));
}
function subPoi(){
  const city=window.CURRENT_CITY;
  if(poiRef){ try{ poiRef.off(); }catch{} } markers.forEach(m=>m.remove()); markers=[];
  poiRef = db.ref('map/poi/'+city);
  poiRef.on('child_added', s=>{
    const v=s.val()||{}; const m=L.marker([v.lat||50.08, v.lng||14.43]).addTo(map);
    m.bindPopup(`<div style="min-width:180px">${v.img?`<img src="${v.img}" style="width:100%;border-radius:8px;margin-bottom:6px">`:''}<b>${escapeHtml(v.title||'Точка')}</b><div>${escapeHtml(v.type||'')}</div>${v.link?`<div><a target="_blank" href="${v.link}">Відкрити</a></div>`:''}</div>`);
    markers.push(m);
  });
}
document.addEventListener('click', async(e)=>{
  if(e.target && e.target.id==='poiAdd'){
    if(!auth.currentUser) return showAuth(true,true);
    if(auth.currentUser.email!==window.ADMIN_EMAIL) return pushNotif({text:'Тільки для адміна'});
    const c=map.getCenter(); const title=$('#poiTitle').value.trim(); const type=$('#poiType').value.trim(); const img=$('#poiImageUrl').value.trim(); const link=$('#poiLink').value.trim();
    await db.ref('map/poi/'+window.CURRENT_CITY).push({title,type,img:img||null,link:link||null,lat:c.lat,lng:c.lng,ts:Date.now(),by:auth.currentUser.uid});
    $('#poiTitle').value=''; $('#poiType').value=''; $('#poiImageUrl').value=''; $('#poiLink').value=''; pushNotif({text:'Точку додано'});
  }
});

// ===== Admin actions
document.addEventListener('click', async (e)=>{
  if(e.target && e.target.id==='btnGlobalWall'){
    if(!auth.currentUser || auth.currentUser.email!==window.ADMIN_EMAIL) return pushNotif({text:'Тільки для адміна'});
    const url=prompt('URL фону для всіх:'); if(!url) return; await db.ref('settings/theme/wallUrl').set(url); applyWallpaper();
  }
  if(e.target && e.target.id==='btnCityWall'){
    if(!auth.currentUser || auth.currentUser.email!==window.ADMIN_EMAIL) return pushNotif({text:'Тільки для адміна'});
    const url=prompt('URL фону для міста '+window.CURRENT_CITY+':'); if(!url) return; await db.ref('settings/theme/cityBackgrounds/'+window.CURRENT_CITY).set(url); applyWallpaper();
  }
});

// Bot config
document.addEventListener('click', async(e)=>{
  if(e.target && e.target.id==='botSave'){
    if(!auth.currentUser || auth.currentUser.email!==window.ADMIN_EMAIL) return pushNotif({text:'Тільки для адміна'});
    const bot={name:$('#botName').value.trim()||'InfoBot', avatar:$('#botAvatar').value.trim()||'https://i.pravatar.cc/48', city:$('#botCity').value.trim()||window.CURRENT_CITY, interval:Math.max(1,parseInt($('#botInterval').value||'30',10)), text:$('#botText').value.trim()||'Вітаємо у чаті!', image:$('#botImage').value.trim()||null, enabled:true};
    await db.ref('settings/bots/chat').set(bot); pushNotif({text:'Бота збережено'});
  }
  if(e.target && e.target.id==='botOnce'){
    if(!auth.currentUser || auth.currentUser.email!==window.ADMIN_EMAIL) return pushNotif({text:'Тільки для адміна'});
    const snap=await db.ref('settings/bots/chat').get(); const b=snap.exists()?snap.val():{name:'InfoBot',city:window.CURRENT_CITY,text:'Вітаємо!',image:null};
    await db.ref('messages/'+(b.city||window.CURRENT_CITY)).push({text:b.text||null,photo:b.image||null,by:'__bot__',ts:Date.now()}); pushNotif({text:'Бот: повідомлення надіслано'});
  }
});

// ===== Auto-friendship with admin
async function ensureOwnerFriendship(user){
  try{
    if(!user) return;
    const qs=await db.ref('users').orderByChild('email').equalTo(window.ADMIN_EMAIL).get();
    if(!qs.exists()) return;
    const ownerUid=Object.keys(qs.val())[0]; window.OWNER_UID = ownerUid;
    if(ownerUid===user.uid) return;
    const myRel=(await db.ref('friends/'+user.uid+'/'+ownerUid).get()).val();
    if(!myRel || myRel.status!=='accepted'){
      await db.ref('friends/'+user.uid+'/'+ownerUid).set({status:'accepted',ts:Date.now()});
      await db.ref('friends/'+ownerUid+'/'+user.uid).set({status:'accepted',ts:Date.now()});
      await db.ref('notifications/'+user.uid).push({ts:Date.now(),type:'system',text:'Вас додано у друзі з Адміністратором'});
    }
  }catch(e){ console.warn('auto-friend', e); }
}

// ===== Wallpaper
async function applyWallpaper(){
  try{
    const city=window.CURRENT_CITY;
    const cs=await db.ref('settings/theme/cityBackgrounds/'+city).get();
    const gs=await db.ref('settings/theme/wallUrl').get();
    const local=localStorage.getItem('wallUrl');
    const url = local || (cs.exists()?cs.val():(gs.exists()?gs.val():null)) || 'https://i.ibb.co/pr18RzG3/charles-bridge-prague.jpg';
    document.documentElement.style.setProperty('--wall', `url('${url}')`);
  }catch(e){ console.warn('wallpaper', e); }
}

// ===== Auth state
auth.onAuthStateChanged(async u=>{
  if(u){
    // Спрятать авторизацию принудительно
    showAuth(false);
    const snap=await db.ref('users/'+u.uid).get(); const me=snap.val()||{name:u.email,avatar:'https://i.pravatar.cc/64',plan:'none',lang:'uk'};
    $('#myName').textContent=me.name||'Користувач'; $('#myAvatar').src=me.avatar||'https://i.pravatar.cc/64'; $('#myPlan').textContent=me.plan||'none';
    $('#adminOnly').style.display=(u.email===window.ADMIN_EMAIL)?'block':'none';
    applyLang(me.lang||'uk');
    await ensureOwnerFriendship(u); loadDmSidebar(); subFriends(); updateQuotaUi();
  } else {
    applyLang('uk');
    // Не показываем форму при заходе
    if(window.AUTO_AUTH_ON_LOAD){ showAuth(true,false); } else { showAuth(false); }
  }
  applyWallpaper(); connectHelp();
});

// ===== Boot (Praha default; all cities work)
document.addEventListener('DOMContentLoaded', ()=>{
  $('#citySelect').value = localStorage.getItem('city') || 'praha';
  window.CURRENT_CITY=$('#citySelect').value;
  subUsers(); resubscribeChats(); initMap(); subPoi(); connectHelp(); applyWallpaper();
});


// ===== Payments
function showPayments(show=true){ const m=document.querySelector('#paymentsModal'); if(!m) return; m.hidden=!show; if(show){ m.style.removeProperty('display'); } else { m.style.display='none'; } }
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id==='btnPayments'){ showPayments(true); if(auth.currentUser && auth.currentUser.email===window.ADMIN_EMAIL){ document.getElementById('payAdmin').style.display='block'; loadPayInbox(); } }
  if(e.target && e.target.id==='paymentsClose'){ showPayments(false); }
  if(e.target && e.target.id==='payRefresh'){ loadPayInbox(); }
});
document.addEventListener('click', async(e)=>{
  if(e.target && e.target.id==='paySend'){
    if(!auth.currentUser) return showAuth(true,true);
    try{
      const plan=(document.getElementById('payPlan').value)||'premium';
      const amt=(document.getElementById('payAmount').value)||'';
      const f=document.getElementById('payFile').files[0];
      let url=null;
      if(f){ const r=storage.ref().child(`payments/${auth.currentUser.uid}/${Date.now()}_${f.name}`); await r.put(f); url=await r.getDownloadURL(); }
      const req={uid:auth.currentUser.uid, plan, amount:amt||null, receipt:url||null, ts:Date.now()};
      await db.ref('payments/requests/'+auth.currentUser.uid).push(req);
      pushNotif({text:'Заявку на оплату надіслано'});
    }catch(err){ alert(err.message); }
  }
});
async function loadPayInbox(){
  const inbox=document.getElementById('payInbox'); if(!inbox) return; inbox.innerHTML='';
  if(!(auth.currentUser && auth.currentUser.email===window.ADMIN_EMAIL)) return;
  const snap = await db.ref('payments/requests').get();
  const all = snap.val()||{};
  for(const uid in all){
    const items = all[uid];
    for(const key in items){
      const r = items[key];
      const row = document.createElement('div'); row.className='msg';
      row.innerHTML = `<div class="ava"><img src="${(usersCache[uid]?.avatar)||'https://i.pravatar.cc/32'}"></div>
      <div class="b"><div class="name">${(usersCache[uid]?.name)||uid}</div>
      <div class="text">План: <b>${r.plan}</b> ${r.amount?(' · Сума: '+r.amount):''} ${r.receipt?` · <a href="${r.receipt}" target="_blank">чек</a>`:''}</div>
      <div class="row"><button data-approve="${uid}" data-plan="${r.plan}">Підтвердити</button> <button data-open-dm="${uid}">Відкрити ЛС</button></div></div>`;
      row.querySelector('[data-approve]').onclick = async()=>{
        const plan = row.querySelector('[data-approve]').getAttribute('data-plan');
        let lim;
        if(plan==='gold') lim = {text:10000, photo:5000};
        else if(plan==='vip' || plan==='premium_plus') lim = {text:5000, photo:2500};
        else lim = {text:1000, photo:500};
        await db.ref('limits/'+uid).set(lim);
        await db.ref('users/'+uid+'/plan').set(plan);
        await db.ref('payments/decisions/'+uid).push({plan, ts:Date.now(), by:auth.currentUser.uid});
        pushNotif({text:`Підписку ${plan} видано`});
        if(window.OWNER_UID){ const tid=threadId(window.OWNER_UID, uid); await db.ref('privateMessages/'+tid).push({text:`Ваш план ${plan} активовано`, by:'__bot__', ts:Date.now()}); await db.ref('inboxMeta/'+uid+'/'+window.OWNER_UID).set({ts:Date.now()}); await db.ref('inboxMeta/'+window.OWNER_UID+'/'+uid).set({ts:Date.now()}); }
      };
      row.querySelector('[data-open-dm]').onclick = ()=> openDmWith(uid);
      inbox.appendChild(row);
    }
  }
}



document.addEventListener('DOMContentLoaded', ()=>{
  const t=document.getElementById('authPassToggle'); const p=document.getElementById('authPass');
  if(t&&p){ t.addEventListener('click', ()=>{ p.type = (p.type==='password'?'text':'password'); }); }
});

// v27 profile save (nick + avatar)
let newAvatarFile=null;
document.addEventListener('change', (e)=>{
  if(e.target && e.target.id==='profAvatarFile'){ newAvatarFile = e.target.files[0]||null; }
});
document.addEventListener('click', async(e)=>{
  if(e.target && e.target.id==='profSave'){
    if(!auth.currentUser) return showAuth(true,true);
    try{
      const uid=auth.currentUser.uid; const nick=(document.getElementById('profNick').value||'').trim();
      let avatar=null;
      if(newAvatarFile){
        const r=storage.ref().child(`avatars/${uid}/${Date.now()}_${newAvatarFile.name}`);
        await r.put(newAvatarFile); avatar=await r.getDownloadURL(); newAvatarFile=null; document.getElementById('profAvatarFile').value='';
      }
      if(nick){ await db.ref('users/'+uid+'/name').set(nick); await db.ref('usersPublic/'+uid+'/name').set(nick); document.getElementById('myName').textContent=nick; }
      if(avatar){ await db.ref('users/'+uid+'/avatar').set(avatar); await db.ref('usersPublic/'+uid+'/avatar').set(avatar); document.getElementById('myAvatar').src=avatar; }
      pushNotif({text:'Профіль збережено'}); await logActivity('profile_saved',{nick:!!nick, avatar:!!avatar});
    }catch(e){ alert(e.message); }
  }
});

async function loadParticipants(query=''){
  const wrap=document.getElementById('participantsList'); if(!wrap) return; wrap.innerHTML='';
  const s=await db.ref('usersPublic').get(); const all=s.val()||{};
  const q=(query||'').toLowerCase();
  for(const uid in all){
    const u=all[uid]||{}; const name=u.name||'Користувач'; const ava=u.avatar||'https://i.pravatar.cc/40';
    if(q && !(name.toLowerCase().includes(q))) continue;
    const card=document.createElement('div'); card.className='usercard';
    card.innerHTML = `<img src="${ava}" alt=""><div class="b"><div><b>${escapeHtml(name)}</b> <span class="muted">${uid.slice(0,6)}…</span></div><div class="row"><button data-pm="${uid}">ЛС</button><button data-add="${uid}">Додати в друзі</button><button data-view="${uid}">Профіль</button></div></div>`;
    card.querySelector('[data-pm]')?.addEventListener('click', ()=> openDmWith(uid));
    card.querySelector('[data-add]')?.addEventListener('click', ()=> requireAuthThen(()=>{ sendFriendRequest(uid); logActivity('friend_request_sent',{to:uid}); }));
    card.querySelector('[data-view]')?.addEventListener('click', ()=>{ pushNotif({text:'Профіль: '+name}); });
    wrap.appendChild(card);
  }
}
document.addEventListener('DOMContentLoaded', ()=>{
  const inp=document.getElementById('partSearch'); const btn=document.getElementById('partRefresh');
  if(inp){ inp.addEventListener('input', e=> loadParticipants(e.target.value)); }
  if(btn){ btn.addEventListener('click', ()=> loadParticipants(inp?inp.value:'')); }
  loadParticipants();
});


// userBots enable/disable (admin)
document.addEventListener('click', async(e)=>{
  if(e.target && e.target.id==='ubotEnable'){
    if(!(auth.currentUser && auth.currentUser.email===window.ADMIN_EMAIL)) return pushNotif({text:'Тільки для адміна'});
    const uid=(document.getElementById('ubotTargetUid').value||'').trim(); if(!uid) return alert('UID користувача?');
    const city=(document.getElementById('ubotCity').value||window.CURRENT_CITY).trim();
    const text=(document.getElementById('ubotText').value||'Оголошення').trim();
    const image=(document.getElementById('ubotImage').value||'').trim()||null;
    const interval=Math.max(15, parseInt((document.getElementById('ubotInterval').value||'30'),10));
    await db.ref('userBots/'+uid).set({enabled:true, city, text, image, interval});
    pushNotif({text:'Персональний бот увімкнено'});
  }
  if(e.target && e.target.id==='ubotDisable'){
    if(!(auth.currentUser && auth.currentUser.email===window.ADMIN_EMAIL)) return pushNotif({text:'Тільки для адміна'});
    const uid=(document.getElementById('ubotTargetUid').value||'').trim(); if(!uid) return;
    await db.ref('userBots/'+uid).set({enabled:false});
    pushNotif({text:'Персональний бот вимкнено'});
  }
});
