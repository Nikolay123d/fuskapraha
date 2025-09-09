// INIT
const app = firebase.initializeApp(window.firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>auth.setPersistence(firebase.auth.Auth.Persistence.SESSION));

// helpers
const $ = (q)=>document.querySelector(q);
const $$ = (q)=>Array.from(document.querySelectorAll(q));
const byId = (id)=>document.getElementById(id);
const toast = (m)=>{const d=document.createElement('div');d.textContent=m;Object.assign(d.style,{position:'fixed',left:'50%',bottom:'24px',transform:'translateX(-50%)',background:'#2a3340',color:'#fff',padding:'10px 14px',borderRadius:'10px',border:'1px solid #3a4555',zIndex:9999});document.body.appendChild(d);setTimeout(()=>d.remove(),1800)};
const play=(id)=>{const el=byId(id); if(!el) return; if(localStorage.getItem('soundAllowed')==='1'){ el.play().catch(()=>{}); }};
const pairId=(a,b)=>[a,b].sort().join('_');
const safeKey = (s)=> (s||'').replace(/[.#$\[\]@]/g,'_');

// state
let currentCity='Praha'; let currentUser=null; let isAdmin=false; let adminUid=null;
let chatRef=null, helpRef=null, dmRef=null, frInRef=null, frOutRef=null, frListRef=null;
let autoBotTimer=null;

// tabs
const tabs=$$('.tab'); tabs.forEach(b=>b.addEventListener('click',()=>{tabs.forEach(t=>t.classList.remove('active')); b.classList.add('active'); const tab=b.getAttribute('data-tab'); $$('.view').forEach(v=>v.classList.remove('active')); byId('view-'+tab).classList.add('active'); if(tab==='map') resizeMap(); }));
byId('citySelect').addEventListener('change',(e)=>{currentCity=e.target.value; loadWallpaper(); loadChat();});
byId('btnLogin').addEventListener('click',()=>openAuth());
byId('btnProfile').addEventListener('click',()=>openProfile());
byId('btnBell').addEventListener('click',()=>byId('bellDot').classList.add('hidden'));
byId('btnParticipants').addEventListener('click',()=>openParticipants());

// AUTH modal
const authModal=byId('authModal'); function openAuth(){authModal.classList.remove('hidden');}
byId('closeAuth').addEventListener('click',()=>authModal.classList.add('hidden'));
const authTabs=$$('#authModal .tab.small'); authTabs.forEach(b=>b.addEventListener('click',()=>{authTabs.forEach(t=>t.classList.remove('active')); b.classList.add('active'); const mode=b.getAttribute('data-auth'); byId('formLogin').classList.toggle('hidden',mode!=='login'); byId('formSignup').classList.toggle('hidden',mode!=='signup'); }));
byId('doLogin').addEventListener('click',async()=>{const email=byId('loginEmail').value.trim(), pass=byId('loginPass').value; try{await auth.signInWithEmailAndPassword(email,pass); authModal.classList.add('hidden');}catch(e){alert(e.message)}});
byId('doGoogle').addEventListener('click',async()=>{try{const p=new firebase.auth.GoogleAuthProvider(); try{await auth.signInWithPopup(p);}catch(e){await auth.signInWithRedirect(p);} authModal.classList.add('hidden');}catch(e){alert(e.message)}});
byId('doSignup').addEventListener('click',async()=>{
  const email=byId('suEmail').value.trim(), pass=byId('suPass').value, nick=(byId('suNick').value.trim()||email.split('@')[0]);
  const lang=byId('suLang').value||'uk', role=byId('suRole').value||'seeker';
  try{
    const {user}=await auth.createUserWithEmailAndPassword(email,pass);
    try{await user.sendEmailVerification();}catch{}
    const uid=user.uid;
    await db.ref('usersPublic/'+uid).set({uid,email,nickname:nick,avatar:'',city:currentCity,lang,role,ts:Date.now(), premium:'none', limits:{textLeft:50, photoLeft:10}});
    await db.ref('emailToUid/'+safeKey(email)).set(uid);
    // auto-friend with admin if known
    const adminEmail=(await db.ref('settings/adminEmail').once('value')).val();
    if(adminEmail){
      const all=(await db.ref('usersPublic').once('value')).val()||{};
      adminUid = Object.values(all).find(u=>(u.email||'').toLowerCase()===adminEmail.toLowerCase())?.uid || null;
      if(adminUid){
        await db.ref('friends/'+uid+'/'+adminUid).set(true);
        await db.ref('friends/'+adminUid+'/'+uid).set(true);
      }
    }
    toast('Реєстрація успішна. Вас додано у друзі з власником сайту.');
    authModal.classList.add('hidden');
  }catch(e){alert(e.message)}
});

// auth state
auth.onAuthStateChanged(async (user)=>{
  currentUser=user;
  if(!user){byId('btnLogin').classList.remove('hidden'); byId('btnProfile').classList.add('hidden'); isAdmin=false;}
  else{
    byId('btnLogin').classList.add('hidden'); byId('btnProfile').classList.remove('hidden');
    const p=(await db.ref('usersPublic/'+user.uid).once('value')).val()||{};
    if(p.avatar) byId('avatarImg').src=p.avatar;
    currentCity=p.city||currentCity; byId('citySelect').value=currentCity;
    const adminEmail=(await db.ref('settings/adminEmail').once('value')).val()||'';
    isAdmin = adminEmail.toLowerCase() === (user.email||'').toLowerCase();
    // show admin-only composers
    $$('.admin-only').forEach(el=> el.style.display = isAdmin ? 'flex' : 'none');
    // find admin uid
    const all=(await db.ref('usersPublic').once('value')).val()||{};
    adminUid = Object.values(all).find(u=>(u.email||'').toLowerCase()===adminEmail.toLowerCase())?.uid || null;
    loadWallpaper(); loadChat(); loadFriends(); loadHelp(); setupDM(); setupMap();
  }
});

// WALLPAPER: city → global → fallback to user's provided Prague link
async function loadWallpaper(){
  const prague = "https://i.ibb.co/pr18RzG3/charles-bridge-prague.jpg";
  const cityUrl = (await db.ref('settings/wallpapers/city/'+currentCity).once('value')).val();
  const globalUrl = (await db.ref('settings/wallpapers/global').once('value')).val();
  const url = cityUrl || globalUrl || prague;
  const w = byId('wallpaper'); w.style.opacity='1'; w.style.backgroundImage = `url("${url}")`;
}

// PARTICIPANTS
function openParticipants(){
  const m=document.getElementById('participantsModal'); m.classList.remove('hidden');
  const list=byId('usersList'); const search=byId('userSearch'); list.innerHTML='Завантаження…';
  db.ref('usersPublic').once('value').then(snap=>{
    const all=Object.values(snap.val()||{});
    function render(){
      const q=search.value.trim().toLowerCase();
      list.innerHTML='';
      all.filter(u=>!q || (u.nickname||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)).forEach(u=>{
        const premium = u.premium || 'none';
        const d=document.createElement('div'); d.className='item';
        d.innerHTML=`<div class="row" style="align-items:center;gap:.5rem;">
          <img src="${u.avatar||'assets/ava.png'}" style="width:32px;height:32px;border-radius:50%;border:1px solid #2a3340;">
          <div style="flex:1">
            <b>${u.nickname||'Без ніку'}</b><br><small>${u.email||''} · ${u.city||''} · ${u.role||''} · ${premium}</small>
          </div>
          <button class="btn small" data-act="dm">ЛС</button>
          ${isAdmin?'<button class="btn small outline" data-act="ban">Бан/Розбан</button>':''}
        </div>`;
        d.querySelector('[data-act="dm"]').onclick=()=>{ m.classList.add('hidden'); tabs.forEach(t=>t.classList.remove('active')); $("[data-tab='dm']").classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); byId('view-dm').classList.add('active'); openDM(u.uid); };
        if(isAdmin){ d.querySelector('[data-act="ban"]').onclick=async()=>{ const banned=(await db.ref('bans/'+u.uid).once('value')).val()||false; await db.ref('bans/'+u.uid).set(!banned); toast(!banned?'Забанено':'Розбанено'); };}
        list.appendChild(d);
      });
    }
    render(); search.oninput=render;
  });
  byId('closeParticipants').onclick=()=>m.classList.add('hidden');
}

// PROFILE / ADMIN HUB
// Quick public profile modal for a given uid
async function openProfileView(uid){
  const p = (await db.ref('usersPublic/'+uid).once('value')).val() || {};
  const m = document.createElement('div'); m.className='modal';
  m.innerHTML = `<div class="modal-content">
    <h3>Профіль користувача</h3>
    <div class="row" style="align-items:center;">
      <img src="${p.avatar||'assets/ava.png'}" style="width:48px;height:48px;border-radius:50%;border:1px solid #2a3340;">
      <div style="flex:1;margin-left:.5rem">
        <b>${p.nickname||'Без ніку'}</b><br>
        <small>${p.email||''} · ${p.city||''} · ${p.role||''} · ${p.premium||'none'}</small>
      </div>
      <button class="btn small" id="pvDM">ЛС</button>
    </div>
    <div class="row">
      <button class="btn small outline" id="pvClose">Закрити</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.querySelector('#pvClose').onclick = ()=> m.remove();
  m.querySelector('#pvDM').onclick = ()=> { m.remove(); tabs.forEach(t=>t.classList.remove('active')); $("[data-tab='dm']").classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); byId('view-dm').classList.add('active'); openDM(uid); };
}

const profileModal=byId('profileModal');
function openProfile(){
  const uid=currentUser?.uid; if(!uid) return openAuth();
  profileModal.classList.remove('hidden');
  db.ref('usersPublic/'+uid).once('value').then(s=>{const p=s.val()||{}; byId('pfNick').value=p.nickname||''; byId('pfAvatar').value=p.avatar||''; byId('pfCity').value=p.city||currentCity; byId('pfLang').value=p.lang||'uk'; byId('pfRole').value=p.role||'seeker';});
  byId('pfClose').onclick=()=>profileModal.classList.add('hidden');
  byId('pfLogout').onclick=async()=>{await auth.signOut(); profileModal.classList.add('hidden');};
  byId('pfSave').onclick=async()=>{const nickname=byId('pfNick').value.trim()||currentUser.email; const avatar=byId('pfAvatar').value.trim(); const city=byId('pfCity').value; const lang=byId('pfLang').value; const role=byId('pfRole').value; await db.ref('usersPublic/'+uid).update({nickname,avatar,city,lang,role,ts:Date.now()}); if(avatar) byId('avatarImg').src=avatar; byId('citySelect').value=city; currentCity=city; loadWallpaper(); loadChat(); toast('Збережено');};
  // admin buttons
  const adminEmailEl = (async ()=> (await db.ref('settings/adminEmail').once('value')).val() || '')();
  adminEmailEl.then(v=>{ if((currentUser.email||'').toLowerCase()===(v||'').toLowerCase()) byId('adminButtons').classList.remove('hidden'); });
  // panel router
  $('#adminButtons')?.addEventListener('click',(e)=>{
    const t=e.target.closest('button'); if(!t) return;
    const which=t.dataset.admin; const host=byId('adminPanels'); host.innerHTML='';
    if(which==='wallpapers') adminPanelWallpapers(host);
    if(which==='bot-chat') adminPanelBotChat(host);
    if(which==='bot-help') adminPanelBotHelp(host);
    if(which==='map') adminPanelMap(host);
    if(which==='payments') adminPanelPayments(host);
    if(which==='moderation') adminPanelModeration(host);
  });
}

// Admin panels
function adminPanelWallpapers(host){
  host.innerHTML=`<div class="card">
    <h3>Фони</h3>
    <div class="row">
      <input id="bgGlobalUrl" class="input" placeholder="URL глобального фону">
      <button id="setBgGlobal" class="btn">Для всіх</button>
    </div>
    <div class="row">
      <input id="bgCityUrl" class="input" placeholder="URL фону для ${currentCity}">
      <button id="setBgCity" class="btn">Для міста</button>
    </div>
    <div class="row">
      <input type="file" id="bgUpload" accept="image/*">
      <button id="uploadBgCity" class="btn">Завантажити в Storage</button>
    </div>
  </div>`;
  byId('setBgGlobal').onclick=async()=>{const url=byId('bgGlobalUrl').value.trim(); if(!url) return; await db.ref('settings/wallpapers/global').set(url); loadWallpaper(); toast('Оновлено');};
  byId('setBgCity').onclick=async()=>{const url=byId('bgCityUrl').value.trim(); if(!url) return; await db.ref('settings/wallpapers/city/'+currentCity).set(url); loadWallpaper(); toast('Оновлено');};
  byId('uploadBgCity').onclick=async()=>{const f=byId('bgUpload').files?.[0]; if(!f) return; const ref=storage.ref().child(`wallpapers/${currentCity}/${Date.now()}_${f.name}`); await ref.put(f); const url=await ref.getDownloadURL(); await db.ref('settings/wallpapers/city/'+currentCity).set(url); byId('bgCityUrl').value=url; loadWallpaper(); toast('Завантажено');};
}

function adminPanelBotChat(host){
  host.innerHTML=`<div class="card">
    <h3>Бот для чату (${currentCity})</h3>
    <div class="row"><input id="botName" class="input" placeholder="Ім'я бота"><input id="botAvatar" class="input" placeholder="URL аватарки"></div>
    <div class="row"><textarea id="botText" class="input" placeholder="Текст"></textarea></div>
    <div class="row"><input id="botPhoto" class="input" placeholder="URL фото (опц.)"><button id="btnBotPost" class="btn">Надіслати</button></div>
    <div class="row"><input id="botEveryMin" class="input" placeholder="кожні X хв (30)"><button id="btnBotToggle" class="btn outline">Увімкнути авто</button></div>
  </div>`;
  db.ref('botConfig/'+currentCity).once('value').then(s=>{const c=s.val()||{}; byId('botName').value=c.name||''; byId('botAvatar').value=c.avatar||''; byId('botEveryMin').value=c.everyMin||'';});
  byId('btnBotPost').onclick=async()=>{
    const name=byId('botName').value.trim()||'CityBot', avatar=byId('botAvatar').value.trim()||'', text=byId('botText').value.trim(), photoUrl=byId('botPhoto').value.trim()||'';
    if(!text) return; const msg={uid:'bot:'+currentCity,nickname:name,avatar,city:currentCity,text,photoUrl,ts:Date.now(),from:'bot'};
    await db.ref('messages/'+currentCity).push(msg); toast('Надіслано як бот'); await db.ref('botConfig/'+currentCity).update({name,avatar});
  };
  byId('btnBotToggle').onclick=()=>{
    if(window._autoBot){ clearInterval(window._autoBot); window._autoBot=null; byId('btnBotToggle').textContent='Увімкнути авто'; toast('Auto OFF'); return; }
    const every=parseInt(byId('botEveryMin').value)||30; window._autoBot=setInterval(async()=>{
      const name=byId('botName').value.trim()||'CityBot'; const avatar=byId('botAvatar').value.trim()||''; const text=byId('botText').value.trim(); const photoUrl=byId('botPhoto').value.trim()||''; if(!text) return;
      const msg={uid:'bot:'+currentCity,nickname:name,avatar,city:currentCity,text,photoUrl,ts:Date.now(),from:'bot'}; await db.ref('messages/'+currentCity).push(msg);
    }, every*60*1000); byId('btnBotToggle').textContent='Вимкнути авто'; toast('Auto ON');
  };
}

function adminPanelBotHelp(host){
  host.innerHTML=`<div class="card">
    <h3>Бот «Допомога»</h3>
    <div class="row"><input id="helpName" class="input" placeholder="Ім'я бота"><input id="helpAvatar" class="input" placeholder="URL аватарки"></div>
    <div class="row"><textarea id="helpText" class="input" placeholder="Текст (можна з посиланнями)"></textarea></div>
    <div class="row"><input id="helpPhoto" class="input" placeholder="URL фото (опц.)"><button id="helpPost" class="btn">Опублікувати</button></div>
  </div>`;
  byId('helpPost').onclick=async()=>{
    const botName=byId('helpName').value.trim()||'PrahaHelp', botAvatar=byId('helpAvatar').value.trim()||'', text=byId('helpText').value.trim(), photoUrl=byId('helpPhoto').value.trim()||'';
    if(!text) return; await db.ref('helpFeed').push({botName,botAvatar,text,photoUrl,ts:Date.now()}); toast('Опубліковано');
  };
}

function adminPanelMap(host){
  host.innerHTML=`<div class="card">
    <h3>Редактор карти</h3>
    <div class="row"><input id="pTitle" class="input" placeholder="Назва"><input id="pLat" class="input" placeholder="lat"><input id="pLng" class="input" placeholder="lng"></div>
    <div class="row"><input id="pDesc" class="input" placeholder="Опис"><input id="pPhoto" class="input" placeholder="URL фото (іконка)"><button id="pAdd" class="btn">Додати</button></div>
    <div id="pList"></div>
  </div>`;
  const render=()=> db.ref('map/points').once('value').then(s=>{
    const val=s.val()||{}; const list=byId('pList'); list.innerHTML='';
    Object.entries(val).forEach(([id,p])=>{
      const d=document.createElement('div'); d.className='item'; d.innerHTML=`<div class="row" style="align-items:center;"><img src="${p.photoUrl||'assets/ava.png'}" style="width:28px;height:28px;border-radius:6px;border:1px solid #2a3340;"> <div style="flex:1">${p.title||''}</div> <button data-id="${id}" class="btn small outline">Видалити</button></div>`;
      d.querySelector('button').onclick=async()=>{await db.ref('map/points/'+id).remove(); render();};
      list.appendChild(d);
    });
  });
  render();
  byId('pAdd').onclick=async()=>{const t=byId('pTitle').value.trim(), lat=parseFloat(byId('pLat').value), lng=parseFloat(byId('pLng').value), desc=byId('pDesc').value.trim(), photo=byId('pPhoto').value.trim(); if(!t||isNaN(lat)||isNaN(lng)) return; await db.ref('map/points').push({city:currentCity,title:t,lat,lng,desc,photoUrl:photo,ts:Date.now(),by:currentUser.uid}); toast('Додано'); render();};
}

function adminPanelPayments(host){
  host.innerHTML=`<div class="card">
    <h3>Оплати (інбокс)</h3>
    <div id="payList">Завантаження…</div>
  </div>`;
  db.ref('paymentsInbox').on('value',(s)=>{
    const val=s.val()||{}; const list=byId('payList'); list.innerHTML='';
    Object.entries(val).forEach(([id,p])=>{
      const d=document.createElement('div'); d.className='item';
      d.innerHTML=`<div class="row"><div style="flex:1"><b>${p.email}</b> → ${p.plan} (${p.amount||''})</div><a class="btn small outline" href="${p.proofUrl}" target="_blank">Чек</a><button class="btn small" data-id="${id}" data-uid="${p.uid}">Підтвердити</button></div>`;
      d.querySelector('button').onclick=async(e)=>{const uid=e.target.dataset.uid; await db.ref('usersPublic/'+uid+'/premium').set(p.plan); await db.ref('usersPublic/'+uid+'/limits').set({textLeft:1000, photoLeft:200}); await db.ref('paymentsInbox/'+id).remove(); toast('Підтверджено');};
      list.appendChild(d);
    });
  });
}

function adminPanelModeration(host){
  host.innerHTML=`<div class="card"><h3>Модерація</h3><p>Тут базові дії: бан/розбан у «Учасники», перегляд профілів, авто-дружба з адміном.</p></div>`;
}

// SOUNDS permission prompt (one-time)
if(localStorage.getItem('soundAsked')!=='1'){
  setTimeout(()=>{
    if(confirm('Включити звуки повідомлень?')){ localStorage.setItem('soundAllowed','1'); } else { localStorage.setItem('soundAllowed','0'); }
    localStorage.setItem('soundAsked','1');
  }, 1200);
}

// CHAT
let chatPhotoUrl=null;
byId('chatPick').addEventListener('click',()=>byId('chatPhoto').click());
byId('chatPhoto').addEventListener('change',async(e)=>{
  const f=e.target.files?.[0]; if(!f||!currentUser) return;
  const ref=storage.ref().child(`uploads/${currentUser.uid}/${Date.now()}_${f.name}`);
  await ref.put(f); chatPhotoUrl=await ref.getDownloadURL(); toast('✔️ Фото додано… Напишіть текст і відправте.');
});
byId('chatSend').addEventListener('click',async()=>{
  if(!currentUser) return openAuth();
  const text=byId('chatInput').value.trim(); if(!text && !chatPhotoUrl) return;
  const uid=currentUser.uid; const pub=(await db.ref('usersPublic/'+uid).once('value')).val()||{};
  const msg={uid,nickname:pub.nickname||currentUser.email,avatar:pub.avatar||'',city:currentCity,text,photoUrl:chatPhotoUrl||'',ts:Date.now(),from:'user'};
  await db.ref(`messages/${currentCity}`).push(msg);
  byId('chatInput').value=''; chatPhotoUrl=null; byId('chatPhoto').value=''; play('sndChat');
});
function loadChat(){
  if(chatRef) chatRef.off();
  const list=byId('chatList'); list.innerHTML='';
  chatRef = db.ref(`messages/${currentCity}`).limitToLast(200);
  chatRef.on('child_added',(snap)=>{ const m=snap.val(); addMessage(list,m,m.uid===(currentUser?.uid||'')); if(m.uid!==(currentUser?.uid||'')){byId('bellDot').classList.remove('hidden'); play('sndNotify');} });
}

// add message
function addMessage(container,m,mine=false){
  const d=document.createElement('div'); d.className='item';
  const who=`<img src="${m.avatar||'assets/ava.png'}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:6px;border:1px solid #2a3340;"> ${m.nickname||'Anon'} · ${new Date(m.ts).toLocaleString()}`;
  d.innerHTML=`<div class="meta">${who}${m.from==='bot'?' · 🤖':''}</div>${m.text?`<div>${m.text}</div>`:''}${m.photoUrl?`<img class="msg-photo" src="${m.photoUrl}">`:''}`;
  container.appendChild(d); container.scrollTop=container.scrollHeight;
}

// FRIENDS
async function emailToUid(email){ if(!email) return null; const s=await db.ref('emailToUid/'+safeKey(email)).once('value'); return s.val(); }
byId('btnAddFriend').addEventListener('click', async()=>{
  if(!currentUser) return openAuth();
  const email=byId('addFriendEmail').value.trim().toLowerCase(); if(!email) return;
  const uid=await emailToUid(email); if(!uid) return toast('Користувача не знайдено'); if(uid===currentUser.uid) return toast('Це ти :)');
  await db.ref(`friendRequests/${uid}/${currentUser.uid}`).set({from:currentUser.uid,ts:Date.now()}); toast('Заявка успішно відправлена');
  play('sndFriend');
});
function renderRequest(container,uid,data,incoming){
  const w=document.createElement('div'); w.className='item'; w.innerHTML=`<div class="row" style="align-items:center;gap:.5rem;"><div style="flex:1;">Запит від: ${uid.slice(0,6)}…</div></div>`;
  if(incoming){
    const a=document.createElement('button'); a.className='btn small'; a.textContent='Прийняти';
    const d=document.createElement('button'); d.className='btn small outline'; d.textContent='Відхилити';
    a.onclick=async()=>{await db.ref(`friends/${currentUser.uid}/${uid}`).set(true); await db.ref(`friends/${uid}/${currentUser.uid}`).set(true); await db.ref(`friendRequests/${currentUser.uid}/${uid}`).remove(); toast('Тепер ви друзі');};
    d.onclick=async()=>{await db.ref(`friendRequests/${currentUser.uid}/${uid}`).remove();};
    const row=document.createElement('div'); row.className='row'; row.append(a,d); w.append(row);
  } else {
    const c=document.createElement('button'); c.className='btn small outline'; c.textContent='Скасувати'; c.onclick=async()=>{await db.ref(`friendRequests/${uid}/${currentUser.uid}`).remove();}; const row=document.createElement('div'); row.className='row'; row.append(c); w.append(row);
  }
  container.append(w);
}
function loadFriends(){
  const incoming=byId('incomingReqs'); incoming.innerHTML=''; if(frInRef) frInRef.off(); frInRef=db.ref(`friendRequests/${currentUser.uid}`);
  frInRef.on('value',(s)=>{incoming.innerHTML=''; s.forEach(ch=>renderRequest(incoming,ch.key,ch.val(),true));});
  const outgoing=byId('outgoingReqs'); outgoing.innerHTML=''; if(frOutRef) frOutRef.off(); frOutRef=db.ref('friendRequests');
  frOutRef.on('value',(snap)=>{outgoing.innerHTML=''; snap.forEach(n=>{n.forEach(ch=>{if(ch.key===currentUser.uid) renderRequest(outgoing,n.key,ch.val(),false);});});});
  const fl=byId('friendsList'); fl.innerHTML=''; if(frListRef) frListRef.off(); frListRef=db.ref(`friends/${currentUser.uid}`);
  frListRef.on('value',async(snap)=>{fl.innerHTML=''; const val=snap.val()||{}; for (const uid of Object.keys(val)){ const pub=(await db.ref('usersPublic/'+uid).once('value')).val()||{}; const it=document.createElement('div'); it.className='item'; it.innerHTML=`<div class="row" style="align-items:center;gap:.5rem;"><img src="${pub.avatar||'assets/ava.png'}" style="width:28px;height:28px;border-radius:50%;border:1px solid #2a3340;"> <button class="btn small outline" data-prof="1">Профіль</button><div style="flex:1;">${pub.nickname||pub.email||uid}</div><button class="btn small" data-dm="1">Написати</button></div>`; it.querySelector('[data-dm]').onclick=()=>openDM(uid); it.querySelector('[data-prof]').onclick=()=>openProfileView(uid); fl.appendChild(it);} });
}

// DMs
async function setupDM(){
  const sidebar=byId('dmSidebar'); sidebar.innerHTML='';
  const fr=(await db.ref(`friends/${currentUser.uid}`).once('value')).val()||{};
  for(const uid of Object.keys(fr)){ const pub=(await db.ref('usersPublic/'+uid).once('value')).val()||{}; const btn=document.createElement('button'); btn.className='tab'; btn.innerHTML=`<img src="${pub.avatar||'assets/ava.png'}" style="width:16px;height:16px;border-radius:50%;border:1px solid #2a3340;margin-right:6px;vertical-align:middle;"> ${pub.nickname||pub.email||uid}`; btn.onclick=()=>openDM(uid); sidebar.appendChild(btn); }
}

let currentDMUid=null, dmPhotoUrl=null;
async function openDM(uid){ currentDMUid=uid; byId('dmList').innerHTML=''; const pub=(await db.ref('usersPublic/'+uid).once('value')).val()||{}; byId('dmHeader').innerHTML='<img src="'+(pub.avatar||'assets/ava.png')+'" style="width:22px;height:22px;border-radius:50%;border:1px solid #2a3340;margin-right:6px;vertical-align:middle;"> ЛС з: '+(pub.nickname||pub.email||uid); if(dmRef) dmRef.off(); dmRef=db.ref('dms/'+pairId(currentUser.uid,uid)).limitToLast(200); dmRef.on('child_added',(snap)=>{const m=snap.val(); addMessage(byId('dmList'),m,m.uid===currentUser.uid); if(m.uid!==currentUser.uid){byId('bellDot').classList.remove('hidden'); play('sndAlt');}}); }
byId('dmPick').addEventListener('click',()=>byId('dmPhoto').click());
byId('dmPhoto').addEventListener('change',async(e)=>{const f=e.target.files?.[0]; if(!f||!currentUser) return; const ref=storage.ref().child(`uploads/${currentUser.uid}/${Date.now()}_${f.name}`); await ref.put(f); dmPhotoUrl=await ref.getDownloadURL(); toast('✔️ Фото додано…');});
byId('dmSend').addEventListener('click',async()=>{ if(!currentUser) return openAuth(); if(!currentDMUid) return toast('Обери друга'); const text=byId('dmInput').value.trim(); if(!text && !dmPhotoUrl) return; const pub=(await db.ref('usersPublic/'+currentUser.uid).once('value')).val()||{}; const msg={uid:currentUser.uid,nickname:pub.nickname||currentUser.email,avatar:pub.avatar||'',text,photoUrl:dmPhotoUrl||'',ts:Date.now()}; await db.ref('dms/'+pairId(currentUser.uid,currentDMUid)).push(msg); byId('dmInput').value=''; dmPhotoUrl=null; byId('dmPhoto').value=''; toast('Повідомлення відправлено'); play('sndChat'); });

// HELP feed
function loadHelp(){ if(helpRef) helpRef.off(); const c=byId('helpFeed'); c.innerHTML=''; helpRef=db.ref('helpFeed').limitToLast(200); helpRef.on('child_added',(snap)=>{const p=snap.val(); const d=document.createElement('div'); d.className='item'; const who=`${p.botName||'Helper'} · ${new Date(p.ts).toLocaleString()}`; const text=(p.text||'').replace(/(https?:\/\/\S+)/g,'<a href="$1" target="_blank">$1</a>'); d.innerHTML=`<div class="meta">${who}</div>${text?`<div>${text}</div>`:''}${p.photoUrl?`<img class="msg-photo" src="${p.photoUrl}">`:''}`; c.appendChild(d); c.scrollTop=c.scrollHeight; }); }

// MAP (keyboard disabled, cached view in localStorage)
let leafletMap=null, markersLayer=null;
function setupMap(){
  if(leafletMap) return;
  const saved = JSON.parse(localStorage.getItem('mapView')||'null');
  leafletMap=L.map('map',{keyboard:false}).setView(saved?.center||[50.0755,14.4378], saved?.zoom||12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(leafletMap);
  markersLayer=L.layerGroup().addTo(leafletMap);
  leafletMap.on('moveend',()=>{
    const c = leafletMap.getCenter(); localStorage.setItem('mapView', JSON.stringify({center:[c.lat,c.lng], zoom:leafletMap.getZoom()}));
  });
  db.ref('map/points').on('value',(snap)=>{
    markersLayer.clearLayers();
    const val=snap.val()||{};
    Object.values(val).forEach(p=>{
      const icon = p.photoUrl ? L.icon({iconUrl:p.photoUrl, iconSize:[32,32], className:'thumb-icon'}) : undefined;
      const m = icon ? L.marker([p.lat,p.lng],{icon}) : L.marker([p.lat,p.lng]);
      m.addTo(markersLayer);
      const img=p.photoUrl?`<br><img src="${p.photoUrl}" style="width:120px;border-radius:8px;margin-top:6px;">`:'';
      m.bindPopup(`<b>${p.title||'Точка'}</b><br>${p.desc||''}${img}`);
    });
  });
}
function resizeMap(){ setTimeout(()=>leafletMap && leafletMap.invalidateSize(),50); }

// --- End ---


// v3.1: HELP BOT composer (admin-only)
const helpBotSend = document.getElementById('helpBotSend');
if (helpBotSend) {
  helpBotSend.addEventListener('click', async ()=>{
    if(!isAdmin) return toast('Тільки адмін');
    const botName = byId('helpBotName').value.trim() || 'PrahaHelp';
    const botAvatar = byId('helpBotAvatar').value.trim() || '';
    const text = byId('helpBotText').value.trim();
    const photoUrl = byId('helpBotPhoto').value.trim() || '';
    if(!text) return;
    await db.ref('helpFeed').push({ botName, botAvatar, text, photoUrl, ts: Date.now() });
    toast('Опубліковано');
    byId('helpBotText').value=''; byId('helpBotPhoto').value='';
  });
}

// v3.1: MAP quick bot add (admin-only bottom composer)
const mapBotAdd = document.getElementById('mapBotAdd');
if (mapBotAdd) {
  mapBotAdd.addEventListener('click', async ()=>{
    if(!isAdmin) return toast('Тільки адмін');
    const title = byId('mapBotTitle').value.trim();
    const lat = parseFloat(byId('mapBotLat').value);
    const lng = parseFloat(byId('mapBotLng').value);
    const photo = byId('mapBotPhoto').value.trim();
    if(!title || isNaN(lat) || isNaN(lng)) return toast('Вкажи назву/координати');
    await db.ref('map/points').push({city: currentCity, title, lat, lng, desc:'', photoUrl: photo, ts: Date.now(), by: currentUser.uid});
    toast('Точка додана');
    byId('mapBotTitle').value=''; byId('mapBotLat').value=''; byId('mapBotLng').value=''; byId('mapBotPhoto').value='';
  });
}
