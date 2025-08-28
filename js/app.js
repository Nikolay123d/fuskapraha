// ===== Обои (глобальные из БД или локальные)
(function setWallpaper(){
  const fallback = "https://i.ibb.co/pr18RzG3/charles-bridge-prague.jpg";
  const local = localStorage.getItem('wallUrl');
  document.documentElement.style.setProperty('--wall-url', `url('${local||fallback}')`);
})();

// ===== Tabs
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
function setActiveTab(id){
  tabButtons.forEach(b=>b.classList.toggle('active', b.dataset.target===id));
  tabContents.forEach(c=>c.classList.toggle('active', c.id===id));
  if(id==='mapTab'){
    if(!window.__mapInitOnce){ try{ initLeaflet(); window.__mapInitOnce=true; }catch(e){ console.error(e); } }
    setTimeout(()=>{ try{ map.invalidateSize(false); }catch{} }, 100);
  }
}
tabButtons.forEach(btn=> btn.addEventListener('click', ()=> setActiveTab(btn.dataset.target)));

document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  if(e.target && ['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  const mapKey={'1':'chatTab','2':'rentTab','3':'mapTab','4':'friendsTab','5':'dmTab','h':'helpTab'};
  if(mapKey[e.key]){ setActiveTab(mapKey[e.key]); e.preventDefault(); }
});

// ===== Звук (после логина)
let audioCtx=null; function ensureAudio(){ if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); }
function tone(f=880,d=140,t='sine',v=.16){ if(!window.__soundEnabled) return; ensureAudio(); const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=t;o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(audioCtx.destination);o.start();setTimeout(()=>{g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+0.08);o.stop(audioCtx.currentTime+0.1)},d);}
const SND={notify(){tone(1100,160,'triangle',.2)},sent(){tone(720,110,'sine',.18)},dm(){tone(920,160,'sine',.2)},error(){tone(280,240,'square',.22)}};
window.__soundEnabled=false;

// ===== Firebase
firebase.initializeApp(window.PF_FIREBASE_CONFIG);
const auth=firebase.auth(), db=firebase.database(), storage=firebase.storage();

const DEFAULT_AVATAR="public/images/avatar.jpg";
const onlineNeon=document.getElementById('onlineNeon');

// Полчаса свободного чтения гостям
(function guestReadTimer(){
  const k='guest_start_ts';
  if(!localStorage.getItem(k)) localStorage.setItem(k, Date.now());
  setInterval(()=>{
    const diff=Date.now()-Number(localStorage.getItem(k));
    if(!auth.currentUser && diff > 30*60*1000){ showAuth(); }
  }, 5000);
})();

// ===== Presence + online counter
function updateOnlineCount(){ db.ref('presence').on('value', s=>{ const v=s.val()||{}; onlineNeon.textContent=`Онлайн (прибл.): ${Object.keys(v).length*10}`; }); }
updateOnlineCount();
window.addEventListener('beforeunload', async()=>{ try{ if(auth.currentUser) await db.ref('presence/'+auth.currentUser.uid).remove(); }catch{} });

// ===== Модалки звука
const soundModal=document.getElementById('soundModal');
document.getElementById('soundEnable').onclick=()=>{ window.__soundEnabled=true; ensureAudio(); SND.notify(); soundModal.classList.remove('show'); localStorage.setItem('sound_on','1'); };
document.getElementById('soundLater').onclick=()=> soundModal.classList.remove('show');
document.getElementById('soundClose').onclick=()=> soundModal.classList.remove('show');

// ===== Auth UI
const authModal=document.getElementById('authModal'), modalClose=document.getElementById('modalClose');
const registerForm=document.getElementById('registerForm'), loginForm=document.getElementById('loginForm');
const loginShow=document.getElementById('loginShow'), backToRegister=document.getElementById('backToRegister');
const registerSubmit=document.getElementById('registerSubmit'), loginSubmit=document.getElementById('loginSubmit');
const regError=document.getElementById('regError'), loginError=document.getElementById('loginError');

function showAuth(){ authModal.classList.add('show'); regError.textContent=''; loginError.textContent=''; }
function hideAuth(){ authModal.classList.remove('show'); }
modalClose.addEventListener('click', hideAuth);
loginShow.addEventListener('click', ()=>{ registerForm.style.display='none'; loginForm.style.display='block'; });
backToRegister.addEventListener('click', ()=>{ registerForm.style.display='block'; loginForm.style.display='none'; });

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
    hideAuth(); if(!localStorage.getItem('sound_on')) soundModal.classList.add('show');
  }catch(e){ regError.textContent=e.message||String(e); SND.error(); }
});

loginSubmit.addEventListener('click', async ()=>{
  loginError.textContent='';
  try{
    await auth.signInWithEmailAndPassword(
      document.getElementById('loginEmail').value.trim(),
      document.getElementById('loginPassword').value.trim()
    );
    hideAuth(); if(!localStorage.getItem('sound_on')) soundModal.classList.add('show');
  }catch(e){ loginError.textContent=e.message||String(e); SND.error(); }
});

// ===== Notifications
const bellBtn=document.getElementById('bellBtn'), bellBadge=document.getElementById('bellBadge');
const bellModal=document.getElementById('bellModal'), bellClose=document.getElementById('bellClose'), notifList=document.getElementById('notifList');
document.getElementById('notifClearAll').onclick=()=>{ notifList.innerHTML=''; bellBadge.textContent='0'; bellBadge.style.display='none'; };
bellBtn.addEventListener('click',()=> bellModal.classList.add('show'));
bellClose.addEventListener('click',()=> bellModal.classList.remove('show'));

function renderNotifItem(_id,v){
  const row=document.createElement('div'); row.className='bot-card'; row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px';
  const body=document.createElement('div'); body.style.flex='1';
  body.innerHTML=`<div style="font-weight:700">${(v.type||'info').toUpperCase()}</div><div style="font-size:13px">${escapeHtml(v.text||'')}</div>`;
  row.appendChild(body);
  if(v.type==='friend_req' && v.from){
    const accept=document.createElement('button'); accept.className='tab-button'; accept.textContent='✅ Прийняти';
    const decline=document.createElement('button'); decline.className='tab-button danger'; decline.textContent='✖';
    accept.onclick=()=>acceptFriend(v.from); decline.onclick=()=>declineFriend(v.from);
    row.appendChild(accept); row.appendChild(decline);
  }
  const x=document.createElement('button'); x.textContent='✖'; x.className='tab-button alt'; x.style.padding='4px 8px';
  x.onclick=()=>{ row.remove(); const n=Math.max(0, (+bellBadge.textContent||0)-1); bellBadge.textContent=String(n); if(n===0) bellBadge.style.display='none'; };
  row.appendChild(x);
  notifList.prepend(row);
}
function pushNotif(v){ renderNotifItem('local_'+Date.now(), v||{type:'info'}); const n=(+bellBadge.textContent||0)+1; bellBadge.textContent=String(n); bellBadge.style.display='inline-block'; SND.notify(); }
function subscribeNotifications(uid){
  if(!uid) return;
  db.ref('notifications/'+uid).on('child_added',snap=>{
    renderNotifItem(snap.key,snap.val()||{});
    const n=(+bellBadge.textContent||0)+1; bellBadge.textContent=String(n); bellBadge.style.display='inline-block'; SND.notify();
  });
}

// ===== Helpers
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));}
function timeStr(ts){return new Date(ts).toLocaleString();}

// ===== Профіль
const profileModal=document.getElementById('profileModal'), profileClose=document.getElementById('profileClose'), profileContent=document.getElementById('profileContent');
profileClose.addEventListener('click',()=> profileModal.classList.remove('show'));

async function openProfile(uid,isSelf=false){
  profileModal.classList.add('show'); profileContent.innerHTML='<p>Завантаження…</p>';
  try{
    const s=await db.ref('users/'+uid).get(); const user=s.exists()?s.val():{nick:'Анонім',avatar:DEFAULT_AVATAR}; const email=user.email||'';
    const flags=(await db.ref('settings/userFlags/'+uid).get()).val()||{}; const planKey=flags.premium||'none';
    const PLAN={none:{label:'—',bg:'#f1f5f9',col:'#111'}, trial:{label:'TRIAL',bg:'#c084fc',col:'#fff'}, premium:{label:'ПРЕМІУМ',bg:'#16a34a',col:'#fff'}, premiumPlus:{label:'ПРЕМІУМ+',bg:'#0ea5e9',col:'#fff'}}[planKey];
    const about=user.about||'', contacts=user.contacts||'';
    profileContent.innerHTML=`
      <div style="display:flex;gap:12px;align-items:center">
        <img id="profAvatar" src="${user.avatar||DEFAULT_AVATAR}" style="width:120px;height:120px;border-radius:16px;object-fit:cover">
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <h3 style="margin:0;color:#0b1220">${escapeHtml(user.nick||'Анонім')}</h3>
            <span class="user-badge" style="background:${PLAN.bg};color:${PLAN.col};font-weight:900">${PLAN.label}</span>
            ${uid===auth.currentUser?.uid?'<span class="user-badge">Мій профіль</span>':''}
          </div>
          <div style="color:${email?'#333':'#666'}">${escapeHtml(email)}</div>
        </div>
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><b>Про себе:</b><br>${about?escapeHtml(about):'<i>не вказано</i>'}</div>
        <div><b>Контакти:</b><br>${contacts?escapeHtml(contacts):'<i>не вказано</i>'}</div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        ${uid===auth.currentUser?.uid?`
          <label class="tab-button" style="cursor:pointer"><input type="file" id="avatarFile" accept="image/*" hidden>Змінити аватар</label>
          <button id="editAbout" class="tab-button">✏️ Редагувати профіль</button>
          <button id="signOutBtn" class="tab-button danger">Вийти</button>
        `:`
          <button id="pmBtn" class="tab-button">Написати ЛС</button>
          <button id="addFriendBtn" class="tab-button">Додати в друзі</button>
        `}
      </div>`;
    if(uid===auth.currentUser?.uid){
      document.getElementById('avatarFile').addEventListener('change', async (e)=>{
        const f=e.target.files[0]; if(!f) return;
        if(!window.PF_USE_STORAGE){ alert('Storage вимкнено'); return; }
        const ref=storage.ref().child(`avatars/${uid}/${Date.now()}_${f.name}`);
        await ref.put(f); const url=await ref.getDownloadURL();
        await db.ref('users/'+uid+'/avatar').set(url); await auth.currentUser.updateProfile({photoURL:url});
        document.getElementById('profAvatar').src=url; document.getElementById('profileBtn').style.background=`url(${url}) center/cover`; SND.notify();
      });
      document.getElementById('signOutBtn').onclick=async()=>{ try{ await db.ref('presence/'+uid).remove(); }catch{} await auth.signOut(); profileModal.classList.remove('show'); };
      document.getElementById('editAbout').onclick=async()=>{ const a=prompt('Про себе', about)||''; const c=prompt('Контакти', contacts)||''; await db.ref('users/'+uid).update({about:a,contacts:c}); openProfile(uid,true); };
    }else{
      document.getElementById('pmBtn').onclick=()=> openPrivateChat(uid);
      document.getElementById('addFriendBtn').onclick=()=> sendFriendRequest(uid);
    }
  }catch{ profileContent.innerHTML='<p>Помилка завантаження профілю</p>'; }
}

// ===== Auth state
auth.onAuthStateChanged(async u=>{
  document.getElementById('profileBtn').style.background=`url(${(u&&u.photoURL)||DEFAULT_AVATAR}) center/cover`;
  if(u){
    await db.ref('presence/'+u.uid).set({ts:Date.now(),nick:u.displayName||u.email});
    subscribeNotifications(u.uid);
    refreshFriendsBlocks();
    renderDMInbox();
    const themeSnap=await db.ref('settings/theme/wallUrl').get().catch(()=>null);
    const globalWall=themeSnap&&themeSnap.val(); const local=localStorage.getItem('wallUrl');
    if(local||globalWall){ document.documentElement.style.setProperty('--wall-url', `url('${local||globalWall}')`); }
    if(!localStorage.getItem('sound_on')) soundModal.classList.add('show');
  }
});

// ===== Friends / Requests / DMs
const friendsList=document.getElementById('friendsList'), friendRequestsEl=document.getElementById('friendRequests'), friendsOnlineCountEl=document.getElementById('friendsOnlineCount'), dmList=document.getElementById('dmList');

async function acceptFriend(fromUid){
  const u=auth.currentUser; if(!u) return;
  await db.ref('friends/'+u.uid+'/'+fromUid).set({status:'accepted',ts:Date.now()});
  await db.ref('friends/'+fromUid+'/'+u.uid).set({status:'accepted',ts:Date.now()});
  await db.ref('notifications/'+fromUid).push({ts:Date.now(),type:'friend_ok',text:`${u.displayName||'Користувач'} додав(ла) вас у друзі`,from:u.uid});
}
async function declineFriend(fromUid){
  const u=auth.currentUser; if(!u) return;
  await db.ref('friendRequests/'+u.uid+'/'+fromUid).remove();
  await db.ref('friends/'+fromUid+'/'+u.uid).remove();
}
async function sendFriendRequest(toUid){
  const u=auth.currentUser; if(!u){ showAuth(); return; }
  if(u.uid===toUid) return;
  await db.ref('friendRequests/'+toUid+'/'+u.uid).set({from:u.uid,ts:Date.now()});
  await db.ref('friends/'+u.uid+'/'+toUid).set({status:'requested',ts:Date.now(),fromUid:u.uid});
  await db.ref('notifications/'+toUid).push({ts:Date.now(),type:'friend_req',text:`Запит у друзі від ${u.displayName||'Користувач'}`,from:u.uid});
  pushNotif({type:'ok',text:'Заявка відправлена'});
}

async function refreshFriendsBlocks(){
  const u=auth.currentUser; if(!u){ friendsList.innerHTML=''; friendRequestsEl.innerHTML=''; friendsOnlineCountEl.textContent='0'; return; }
  // заявки
  const reqSnap=await db.ref('friendRequests/'+u.uid).get(); friendRequestsEl.innerHTML='';
  if(reqSnap.exists()){
    const reqs=reqSnap.val();
    for(const fromUid of Object.keys(reqs)){
      const uSnap=await db.ref('users/'+fromUid).get(); const ud=uSnap.exists()?uSnap.val():{nick:'Користувач',avatar:DEFAULT_AVATAR};
      const item=document.createElement('div'); item.className='bot-card'; item.innerHTML=`<div style="display:flex;gap:8px;align-items:center">
        <img src="${ud.avatar||DEFAULT_AVATAR}" style="width:42px;height:42px;border-radius:10px;object-fit:cover">
        <div style="flex:1"><div style="font-weight:800">${escapeHtml(ud.nick||'Користувач')}</div><div style="font-size:12px;color:#64748b">заявка у друзі</div></div>
        <button class="tab-button acc">✅</button><button class="tab-button danger dec">✖</button></div>`;
      item.querySelector('.acc').onclick=()=>acceptFriend(fromUid);
      item.querySelector('.dec').onclick=()=>declineFriend(fromUid);
      friendRequestsEl.appendChild(item);
    }
  } else { friendRequestsEl.innerHTML="<i>Немає заявок</i>"; }

  // друзі
  friendsList.innerHTML=''; const frSnap=await db.ref('friends/'+u.uid).get(); let onlineCount=0;
  if(frSnap.exists()){
    const fr=frSnap.val();
    for(const fid of Object.keys(fr)){ const rel=fr[fid]; if(rel.status!=='accepted') continue;
      const uSnap=await db.ref('users/'+fid).get(); const ud=uSnap.exists()?uSnap.val():{nick:'Користувач',avatar:DEFAULT_AVATAR};
      const pSnap=await db.ref('presence/'+fid).get(); const isOn=pSnap.exists(); if(isOn) onlineCount++;
      const d=document.createElement('div'); d.className='bot-card'; d.innerHTML=`<div style="display:flex;gap:8px;align-items:center">
        <img src="${ud.avatar||DEFAULT_AVATAR}" style="width:42px;height:42px;border-radius:10px;object-fit:cover">
        <div style="flex:1"><div style="font-weight:800">${escapeHtml(ud.nick||'Користувач')}</div><div style="font-size:12px;color:${isOn?'#10b981':'#64748b'}">${isOn?'онлайн':'офлайн'}</div></div>
        <button class='tab-button pm'>✉️</button><button class='tab-button open'>👀</button></div>`;
      d.querySelector('.open').onclick=()=>openProfile(fid);
      d.querySelector('.pm').onclick=()=>openPrivateChat(fid);
      friendsList.appendChild(d);
    }
  }
  friendsOnlineCountEl.textContent=String(onlineCount);
}

function convoIdFor(a,b){ return a<b? a+'_'+b : b+'_'+a; }

function openPrivateChat(otherUid){
  const u=auth.currentUser; if(!u){ showAuth(); return; }
  const cid=convoIdFor(u.uid,otherUid);
  const panel=document.createElement('div'); panel.className='modal show';
  panel.innerHTML=`<div class="panel"><button class="close">✖</button><h3>Діалог</h3>
    <div id="dmThread" style="max-height:55vh;overflow:auto;border:1px solid #eee;border-radius:8px;padding:8px;margin-bottom:8px;background:#fafafa"></div>
    <div style="display:flex;gap:6px"><label class="camera-btn"><input id="dmFile" type="file" accept="image/*" hidden>📷</label>
    <input id="dmText" placeholder="Напишіть повідомлення..." style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd">
    <button id="dmSend" class="tab-button">Відправити</button></div></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.close').onclick=()=>panel.remove();
  const thread=panel.querySelector('#dmThread');

  db.ref('inboxMeta/'+u.uid+'/'+otherUid).set({ with:otherUid, ts:Date.now() });
  db.ref('inboxMeta/'+otherUid+'/'+u.uid).set({ with:u.uid, ts:Date.now() });

  db.ref('privateMessages/'+cid).limitToLast(200).on('child_added',snap=>{
    const m=snap.val(); const row=document.createElement('div');
    row.style.margin='6px 0'; row.style.textAlign=m.from===u.uid?'right':'left';
    row.textContent=`${m.text||''} ${m.image?'[фото]':''} (${new Date(m.ts).toLocaleTimeString()})`;
    thread.appendChild(row); thread.scrollTop=thread.scrollHeight;
  });

  panel.querySelector('#dmSend').onclick=async()=>{
    const t=panel.querySelector('#dmText').value.trim(); const f=panel.querySelector('#dmFile').files[0]||null;
    if(!t && !f) return;
    let imageUrl=null;
    if(f && window.PF_USE_STORAGE){
      const ref=storage.ref().child(`pm/${u.uid}/${Date.now()}_${f.name}`); await ref.put(f); imageUrl=await ref.getDownloadURL();
    }
    const pm={from:u.uid,to:otherUid,text:t||null,image:imageUrl||null,ts:Date.now()};
    await db.ref('privateMessages/'+cid).push(pm);
    await db.ref('notifications/'+otherUid).push({ts:pm.ts,type:'dm',text:`Нове ЛС від ${u.displayName||'Користувач'}`,from:u.uid,convoId:cid});
    await db.ref('inboxMeta/'+u.uid+'/'+otherUid).update({ last:t||'[фото]', ts:pm.ts });
    await db.ref('inboxMeta/'+otherUid+'/'+u.uid).update({ last:t||'[фото]', ts:pm.ts });
    panel.querySelector('#dmText').value=''; SND.dm();
  };
}

function renderDMInbox(){
  const u=auth.currentUser; if(!u){ dmList.innerHTML='<i>Увійдіть, щоб бачити ЛС</i>'; return; }
  db.ref('inboxMeta/'+u.uid).off();
  dmList.innerHTML='';
  db.ref('inboxMeta/'+u.uid).orderByChild('ts').limitToLast(200).on('child_added', async snap=>{
    const other=snap.key; const meta=snap.val()||{};
    const name=(await db.ref('users/'+other+'/nick').get()).val()||('Користувач');
    const avatar=(await db.ref('users/'+other+'/avatar').get()).val()||DEFAULT_AVATAR;
    const card=document.createElement('div'); card.className='bot-card'; card.innerHTML=`<div style="display:flex;gap:8px;align-items:center">
      <img src="${avatar}" style="width:42px;height:42px;border-radius:10px;object-fit:cover">
      <div style="flex:1"><div style="font-weight:800">${escapeHtml(name)}</div><div style="font-size:12px;color:#64748b">${escapeHtml(meta.last||'Без тексту')}</div></div>
      <button class='tab-button open'>Відкрити</button></div>`;
    card.querySelector('.open').onclick=()=> openPrivateChat(other);
    dmList.prepend(card);
  });
}

// ===== ЧАТЫ
const messagesEl=document.getElementById('messages'), rentMessagesEl=document.getElementById('rentMessages');
const chatAreaMain=document.getElementById('chatArea'), chatAreaRent=document.getElementById('rentArea');
const messageInput=document.getElementById('messageInput'), sendButton=document.getElementById('sendButton');
const rentMessageInput=document.getElementById('rentMessageInput'), rentSendButton=document.getElementById('rentSendButton');
const fileInput=document.getElementById('fileInput'), rentFileInput=document.getElementById('rentFileInput');
const photoToast=document.getElementById('photoToast'), rentPhotoToast=document.getElementById('rentPhotoToast');
let pendingImageFile=null, pendingRentImageFile=null, MSG_LIMIT=300;

fileInput.addEventListener('change',()=>{ pendingImageFile=fileInput.files[0]||null; if(pendingImageFile){ photoToast.style.display='block'; setTimeout(()=> photoToast.style.display='none', 3200); SND.notify(); }});
rentFileInput.addEventListener('change',()=>{ pendingRentImageFile=rentFileInput.files[0]||null; if(pendingRentImageFile){ rentPhotoToast.style.display='block'; setTimeout(()=> rentPhotoToast.style.display='none', 3200); SND.notify(); }});

function renderMessage(m,container){
  const wrap=document.createElement('div'); wrap.className='message'+((auth.currentUser&&m.uid===auth.currentUser.uid)?' self':'');
  const avatar=document.createElement('img'); avatar.className='avatar'; avatar.src=m.avatar||DEFAULT_AVATAR; avatar.alt=m.nick||'avatar'; avatar.title=m.nick||'Профіль'; avatar.onclick=()=>openProfile(m.uid);
  const txt=document.createElement('div'); txt.className='message-content';
  const meta=document.createElement('div'); meta.className='message-meta'; meta.textContent=`${m.nick||'Анонім'} · ${timeStr(m.ts)}${m.recipientUid?' · особисте':''}`;
  txt.appendChild(meta);
  if(m.text){ const p=document.createElement('div'); p.className='text'; p.innerText=m.text; txt.appendChild(p); }
  if(m.image){ const im=document.createElement('img'); im.src=m.image; im.className='chat-image'; im.alt='Фото'; im.onclick=()=>openProfile(m.uid); txt.appendChild(im); }
  wrap.appendChild(avatar); wrap.appendChild(txt); container.appendChild(wrap);
  const area=container.closest('.chat-area'); if(area) area.scrollTop=area.scrollHeight;
}
db.ref('messages').limitToLast(MSG_LIMIT).on('child_added',s=>{ const m=s.val(); if(m) renderMessage(m, messagesEl); });
db.ref('rentMessages').limitToLast(MSG_LIMIT).on('child_added',s=>{ const m=s.val(); if(m) renderMessage(m, rentMessagesEl); });

function activeChatPath(){ return document.getElementById('rentTab').classList.contains('active') ? 'rentMessages' : 'messages'; }
async function isBanned(uid){ const s=await db.ref('settings/userFlags/'+uid+'/banned').get(); return s.val()===true; }
async function canSend(){ return !!auth.currentUser && !(await isBanned(auth.currentUser.uid)); }

async function uploadIfNeeded(file){
  if(!file) return null;
  if(!window.PF_USE_STORAGE) throw new Error('USE_STORAGE=false');
  const uid=auth.currentUser.uid; const ref=storage.ref().child(`chat_images/${uid}/${Date.now()}_${file.name}`);
  await ref.put(file); return await ref.getDownloadURL();
}

function setupSend(prefix){
  const txtEl=document.getElementById(`${prefix}MessageInput`);
  const btnEl=document.getElementById(`${prefix}SendButton`);
  btnEl.addEventListener('click', async ()=>{
    if(!auth.currentUser){ showAuth(); return; }
    if(!await canSend()){ pushNotif({type:'system',text:'Ваш акаунт обмежено (бан)'}); SND.error(); return; }
    const text=txtEl.value.trim(); let file=(prefix===''?pendingImageFile:pendingRentImageFile);
    if(!text && !file) return;
    let imageUrl=null;
    try{
      if(file) imageUrl=await uploadIfNeeded(file);
      const u=auth.currentUser;
      const msg={ uid:u.uid, nick:u.displayName||u.email||'Анонім', avatar:u.photoURL||DEFAULT_AVATAR, text:text||null, image:imageUrl||null, ts:Date.now() };
      await db.ref(activeChatPath()).push(msg);
      txtEl.value=''; SND.sent();
    }catch(e){ console.error(e); pushNotif({type:'error',text:'Не вдалося відправити'}); SND.error(); }
    finally{ if(prefix===''){ pendingImageFile=null; fileInput.value=''; } else { pendingRentImageFile=null; rentFileInput.value=''; } }
  });
}
setupSend(""); setupSend("rent");

// ===== Help
(function initHelp(){
  const data=[
    {img:"public/images/hospital.webp", title:"Nemocnice Motol", sub:"V Úvalu 84 · цілодобово"},
    {img:"public/images/lawyers.jpg",  title:"Юридична допомога", sub:"Безкоштовні консультації"},
    {img:"public/images/shops.jpg",    title:"Українські магазини", sub:"Адреси та графік"},
    {img:"public/images/shelter.jpg",  title:"Притулки", sub:"Термінове розміщення"},
    {img:"public/images/jobs.jpg",     title:"Робота",   sub:"Актуальні вакансії"}
  ];
  const hg=document.getElementById('helpGrid');
  hg.innerHTML=data.map(i=>`<div class="help-card"><img src="${i.img}"><h3>${i.title}</h3><p>${i.sub}</p></div>`).join('');
})();

// ===== Map
let map, markers=[], poi=[];
function initLeaflet(){
  map=L.map('map',{keyboard:true}).setView([50.0755,14.4378],12);
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
  document.querySelectorAll('#mapTab button[data-f]').forEach(b=> b.onclick=()=>{ const list=b.dataset.f==='all'?poi:poi.filter(o=>o.t===b.dataset.f); renderPoi(list); });
  document.getElementById('mapSearch').oninput=e=> searchPoi(e.target.value.trim());
}
function clearMarkers(){ markers.forEach(m=>m.remove()); markers=[]; }
function renderPoi(list){ clearMarkers(); list.forEach(o=>{ const m=L.marker(o.p).addTo(map).bindPopup(`<b>${o.name}</b><br>${o.t}`); markers.push(m); }); }
function searchPoi(q){ const l=q.toLowerCase(); renderPoi(poi.filter(o=>o.name.toLowerCase().includes(l)||o.t.includes(l))); }
