// Helpers
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(window.__t); window.__t=setTimeout(()=>t.classList.add('hidden'), 2200); };

// State
const state = {
  user: null,
  city: APP.DEFAULT_CITY,
  pending: { chatPhoto:null, rentPhoto:null, dmPhoto:null },
  dmPeer: null
};

// UI init
function initUI(){
  // tabs
  $$('#tabs .tab').forEach(btn=>btn.addEventListener('click', ()=>showTab(btn.dataset.tab)));
  $('#tabsToggle').addEventListener('click', ()=>$('#tabs').classList.toggle('hidden'));

  // cities
  [$('#citySel'), $('#bgCitySel'), $('#meCity')].forEach(sel=>{
    APP.CITIES.forEach(c=>{
      const o=document.createElement('option'); o.value=o.textContent=c; sel.appendChild(o);
    });
  });
  $('#citySel').value = state.city;
  $('#bgCitySel').value = state.city;
  $('#meCity').value = state.city;
  $('#citySel').addEventListener('change', e=>{
    state.city = e.target.value;
    loadChat();
    applyWallpaper();
  });

  // composers
  $('#chatPhoto').addEventListener('change', e=> pickPhoto('chat'));
  $('#rentPhoto').addEventListener('change', e=> pickPhoto('rent'));
  $('#dmPhoto').addEventListener('change', e=> pickPhoto('dm'));

  $('#chatSend').addEventListener('click', ()=> sendChat());
  $('#rentSend').addEventListener('click', ()=> sendRent());
  $('#dmSend').addEventListener('click', ()=> sendDM());

  // auth buttons
  $('#logoutBtn').addEventListener('click', ()=> auth.signOut());

  // admin wallpaper
  $('#bgSave').addEventListener('click', saveWallpapers);

  // profile
  $('#saveProfile').addEventListener('click', saveProfile);
  $('#meAvatarFile').addEventListener('change', uploadAvatar);

  // DM
  $('#dmClose').addEventListener('click', ()=> $('#dmDialog').classList.add('hidden'));

  // tests
  $('#addTestMsg').addEventListener('click', async ()=>{
    if(!state.user) return needLogin();
    const ref = db.ref(`messages/${state.city}`).push();
    await ref.set({uid:state.user.uid, text:'Тестове повідомлення', ts:Date.now()});
  });
  $('#addTestRent').addEventListener('click', async ()=>{
    if(!state.user) return needLogin();
    const ref = db.ref(`rentMessages/${state.city}`).push();
    await ref.set({uid:state.user.uid, text:'Оголошення: кімната', ts:Date.now()});
  });

  applyWallpaper();
}

// Tabs
function showTab(id){
  $$('#tabs .tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
  $$('.panel').forEach(p=>p.classList.toggle('show', p.id===id));
}

// Wallpaper
async function applyWallpaper(){
  const city = state.city;
  let url = APP.DEFAULT_WALLPAPER;
  try{
    const snapCity = await db.ref(`settings/wallpapers/city/${city}`).get();
    const snapGlobal = await db.ref('settings/wallpapers/global').get();
    if(snapCity.exists()) url = snapCity.val();
    else if(snapGlobal.exists()) url = snapGlobal.val();
  }catch(_){}
  document.body.style.setProperty('--wallpaper', `url("${url}")`);
}

// Auth
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
auth.onAuthStateChanged(async user=>{
  state.user = user;
  if(user){
    // create public profile if missing
    const up = db.ref(`usersPublic/${user.uid}`);
    const snap = await up.get();
    const data = snap.exists()? snap.val(): { nick: user.displayName || 'Гість', email: user.email || '', avatar: 'assets/img/avatar_default.svg', city: state.city, lang: 'uk' };
    await up.update(data);
    $('#meNick').value = data.nick||'';
    $('#meEmail').value = user.email||'';
    $('#meLang').value = data.lang||'uk';
    $('#meCity').value = data.city||state.city;
    $('#meAvatar').src = data.avatar || 'assets/img/avatar_default.svg';
    autoFriendAdmin(user.uid);
    loadPeople();
    loadDMList();
  }
  loadChat();
});

function needLogin(){
  alert('Увійдіть, щоб відправляти.');
}

// Auto-friend admin
async function autoFriendAdmin(uid){
  try{
    const adminEmailSnap = await db.ref('settings/adminEmail').get();
    const adminEmail = adminEmailSnap.val();
    if(!adminEmail) return;
    const mapSnap = await db.ref('usersPublic').get();
    let adminUid = null;
    mapSnap.forEach(ch=>{ if(ch.val() && ch.val().email===adminEmail) adminUid = ch.key; });
    if(!adminUid || adminUid===uid) return;
    await db.ref(`friends/${uid}/${adminUid}`).set({ts:Date.now()});
    await db.ref(`friends/${adminUid}/${uid}`).set({ts:Date.now()});
  }catch(e){ console.warn(e); }
}

// Load chat & rent
let chatOff = null;
async function loadChat(){
  if(chatOff) chatOff(); $('#chatList').innerHTML = ''; $('#rentList').innerHTML='';
  const city = state.city;
  // realtime stream
  const chatRef = db.ref(`messages/${city}`).limitToLast(50);
  chatRef.on('child_added', s=> renderMsg(s, $('#chatList')));
  const rentRef = db.ref(`rentMessages/${city}`).limitToLast(50);
  rentRef.on('child_added', s=> renderMsg(s, $('#rentList')));
  chatOff = ()=>{ chatRef.off(); rentRef.off(); };
}

async function renderMsg(snap, mount){
  const m = snap.val(); if(!m) return;
  const userSnap = await db.ref(`usersPublic/${m.uid}`).get();
  const u = userSnap.exists()? userSnap.val(): {nick:'Гість', avatar:'assets/img/avatar_default.svg'};
  const li = document.createElement('li'); li.className='msg';
  const ava = document.createElement('img'); ava.className='avatar'; ava.src = u.avatar || 'assets/img/avatar_default.svg';
  const body = document.createElement('div'); body.className='body';
  const name = document.createElement('div'); name.className='name'; name.textContent = u.nick || 'Гість';
  const txt = document.createElement('div'); txt.className='text'; txt.textContent = m.text || '';
  body.appendChild(name); body.appendChild(txt);
  if(m.photoURL){
    const img = document.createElement('img'); img.className='media'; img.src = m.photoURL; body.appendChild(img);
  }
  li.appendChild(ava); li.appendChild(body);
  mount.appendChild(li);
  // scroll to bottom only for active panel
  mount.scrollTop = mount.scrollHeight;
}

// Pick & upload photo (to Storage → getDownloadURL)
async function pickPhoto(kind){
  if(!state.user){ needLogin(); return; }
  const input = {chat:$('#chatPhoto'), rent:$('#rentPhoto'), dm:$('#dmPhoto')}[kind];
  const file = input.files[0]; if(!file) return;
  try{
    const path = `uploads/${state.user.uid}/${Date.now()}_${file.name}`;
    const task = await stg.ref().child(path).put(file);
    const url = await task.ref.getDownloadURL();
    state.pending[ kind + 'Photo' ] = url;
    toast('✔ Фото успішно додано. Напишіть повідомлення — і відправте.');
  }catch(e){
    console.error(e);
    alert('Помилка завантаження фото: ' + e.message);
  }finally{
    input.value = '';
  }
}

// Senders
async function sendChat(){
  if(!state.user) return needLogin();
  const txt = $('#chatInput').value.trim();
  if(!txt && !state.pending.chatPhoto) return;
  // anti-spam (free users: 1 per 30min; premium bypass if plan==='Premium'|'Premium+')
  const limRef = db.ref(`limits/${state.user.uid}`);
  const lim = (await limRef.get()).val() || {};
  const plan = lim.plan || 'Free';
  const last = lim.lastChatTs || 0;
  const allow = (plan!=='Free') || (Date.now()-last >= 30*60*1000);
  if(!allow){ toast('⏳ Обмеження: 1 повідомлення / 30 хв (Free)'); return; }
  const ref = db.ref(`messages/${state.city}`).push();
  await ref.set({uid:state.user.uid, text:txt||'', photoURL: state.pending.chatPhoto||null, ts:Date.now()});
  await limRef.update({ lastChatTs: Date.now(), plan });
  $('#chatInput').value=''; state.pending.chatPhoto=null;
}

async function sendRent(){
  if(!state.user) return needLogin();
  const txt = $('#rentInput').value.trim();
  if(!txt && !state.pending.rentPhoto) return;
  const ref = db.ref(`rentMessages/${state.city}`).push();
  await ref.set({uid:state.user.uid, text:txt||'', photoURL: state.pending.rentPhoto||null, ts:Date.now()});
  $('#rentInput').value=''; state.pending.rentPhoto=null;
}

function dialogId(a,b){ return [a,b].sort().join('_'); }

async function sendDM(){
  if(!state.user || !state.dmPeer) return;
  const txt = $('#dmInput').value.trim();
  if(!txt && !state.pending.dmPhoto) return;
  const dId = dialogId(state.user.uid, state.dmPeer);
  const mRef = db.ref(`dm/${dId}`);
  await mRef.child(`members/${state.user.uid}`).set(true);
  await mRef.child(`members/${state.dmPeer}`).set(true);
  const ref = mRef.push();
  await ref.set({uid:state.user.uid, text:txt||'', photoURL: state.pending.dmPhoto||null, ts:Date.now()});
  await db.ref(`inboxMeta/${state.user.uid}/${dId}`).set({peer:state.dmPeer, ts:Date.now()});
  await db.ref(`inboxMeta/${state.dmPeer}/${dId}`).set({peer:state.user.uid, ts:Date.now()});
  $('#dmInput').value=''; state.pending.dmPhoto=null;
}

// People & DM list
async function loadPeople(){
  const snap = await db.ref('usersPublic').get(); const list = $('#peopleList'); list.innerHTML='';
  snap.forEach(ch=>{
    const u = ch.val(); const uid = ch.key;
    const card = document.createElement('div'); card.className='card';
    const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='10px';
    const ava = document.createElement('img'); ava.className='avatar'; ava.src = (u && u.avatar) || 'assets/img/avatar_default.svg';
    const name = document.createElement('div'); name.style.flex='1'; name.innerHTML = `<div style="font-weight:700">${(u&&u.nick)||'Гість'}</div><div style="opacity:.7">${(u&&u.email)||''}</div>`;
    const dmBtn = document.createElement('button'); dmBtn.className='tab'; dmBtn.textContent='ЛС';
    dmBtn.onclick = ()=> openDM(uid, (u&&u.nick)||'Гість');
    const frBtn = document.createElement('button'); frBtn.className='ghost'; frBtn.textContent='+ Друг';
    frBtn.onclick = ()=> addFriend(uid);
    row.appendChild(ava); row.appendChild(name); row.appendChild(dmBtn); row.appendChild(frBtn);
    card.appendChild(row); list.appendChild(card);
  });
}

async function addFriend(peerUid){
  if(!state.user) return needLogin();
  await db.ref(`friends/${state.user.uid}/${peerUid}`).set({ts:Date.now()});
  await db.ref(`friends/${peerUid}/${state.user.uid}`).set({ts:Date.now()});
  toast('✔ Успішно додано в друзі');
}

async function loadDMList(){
  if(!state.user) return;
  const list = $('#dmList'); list.innerHTML='';
  const snap = await db.ref(`inboxMeta/${state.user.uid}`).get();
  snap.forEach(async ch=>{
    const meta = ch.val(); const peerUid = meta.peer;
    const u = (await db.ref(`usersPublic/${peerUid}`).get()).val() || {};
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `<div style="display:flex;gap:10px;align-items:center">
      <img class="avatar" src="${u.avatar||'assets/img/avatar_default.svg'}">
      <div style="flex:1">
        <div style="font-weight:700">${u.nick||'Гість'}</div>
        <div style="opacity:.7">${u.email||''}</div>
      </div>
      <button class="tab">Продовжити</button>
    </div>`;
    card.querySelector('button').onclick = ()=> openDM(peerUid, u.nick||'Гість');
    list.appendChild(card);
  });
}

function openDM(peerUid, nick){
  if(!state.user) return needLogin();
  state.dmPeer = peerUid;
  $('#dmPeerName').textContent = nick;
  $('#dmDialog').classList.remove('hidden');
  $('#dmFeed').innerHTML = '';
  const dId = dialogId(state.user.uid, peerUid);
  const ref = db.ref(`dm/${dId}`).limitToLast(50);
  ref.on('child_added', s=> renderMsg(s, $('#dmFeed')));
}

// ADMIN: wallpapers
async function saveWallpapers(){
  const g = $('#bgGlobal').value.trim(), c = $('#bgCity').value.trim(), city = $('#bgCitySel').value;
  const adminSnap = await db.ref('settings/adminEmail').get();
  const adminEmail = adminSnap.val();
  if(!auth.currentUser || !auth.currentUser.email || auth.currentUser.email !== adminEmail){
    alert('Тільки адміну можна змінювати обої'); return;
  }
  if(g) await db.ref('settings/wallpapers/global').set(g);
  if(c) await db.ref(`settings/wallpapers/city/${city}`).set(c);
  toast('✔ Обої збережені'); applyWallpaper();
}

// Profile save & avatar upload
async function saveProfile(){
  if(!state.user) return needLogin();
  const data = {
    nick: $('#meNick').value.trim() || 'Гість',
    email: $('#meEmail').value||'',
    lang: $('#meLang').value||'uk',
    city: $('#meCity').value||APP.DEFAULT_CITY
  };
  await db.ref(`usersPublic/${state.user.uid}`).update(data);
  toast('✔ Профіль оновлено');
}

async function uploadAvatar(){
  if(!state.user) return needLogin();
  const file = this.files[0]; if(!file) return;
  try{
    const path = `avatars/${state.user.uid}/${Date.now()}_${file.name}`;
    const task = await stg.ref().child(path).put(file);
    const url = await task.ref.getDownloadURL();
    await db.ref(`usersPublic/${state.user.uid}`).update({avatar:url});
    $('#meAvatar').src = url;
    toast('✔ Аватар оновлено');
  }catch(e){ alert('Помилка завантаження аватара: '+e.message); }
}

// Kickoff
initUI();
