/* App logic — Firebase compat */
(function(){
  const cfg = window.APP_CONFIG;
  firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const db   = firebase.database();
  const st   = firebase.storage();

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{
    return auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  });

  const state = {
    user: null,
    city: cfg.DEFAULT_CITY,
    isAdmin: false,
    chat: { oldestTs: null, loading:false },
    rent: { oldestTs: null, loading:false },
    dm:   { peer: null, dialogId: null, oldestTs: null, loading:false },
    pending: { chatPhoto:null, rentPhoto:null, dmPhoto:null, avatar:null },
    users: {} // cache usersPublic
  };

  // --- UI helpers ---
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  function toast(msg){
    const t = $('#toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(()=>t.style.display='none', 2200);
  }
  function setTab(name){
    $$('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    $$('.tabview').forEach(v=>v.classList.toggle('active', v.id==='tab-'+name));
  }
  function esc(s){ return (s||'').replace(/[<>&"]/g, m=>({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m])); }

  // --- Elements ---
  const citySelect = $('#citySelect');
  const wpCityName = $('#wpCityName');
  const tabs = $('#tabs');
  $('#btnToggleTabs').onclick = ()=> tabs.classList.toggle('hidden');

  $$('.tab').forEach(btn=>btn.onclick = ()=> setTab(btn.dataset.tab));

  // Auth dialog
  const dlg = $('#authDialog');
  $('#btnLogin').onclick = ()=> dlg.showModal();
  $('#btnCloseAuth').onclick = ()=> dlg.close();
  $('#btnLogout').onclick = ()=> auth.signOut();

  $('#btnGoogleLogin').onclick = async ()=>{
    const provider = new firebase.auth.GoogleAuthProvider();
    try{
      await auth.signInWithPopup(provider);
      dlg.close();
    }catch(e){
      try{
        await auth.signInWithRedirect(provider);
      }catch(e2){
        toast('Дозволь вспливаючі вікна для github.io');
      }
    }
  };

  $('#btnEmailLogin').onclick = async ()=>{
    const email = $('#authEmail').value.trim();
    const pass  = $('#authPass').value;
    if(!email || !pass) return toast('Email + пароль');
    try{
      await auth.signInWithEmailAndPassword(email, pass);
      dlg.close();
    }catch(e){ toast(e.message); }
  };
  $('#btnEmailRegister').onclick = async ()=>{
    const email = $('#authEmail').value.trim();
    const pass  = $('#authPass').value;
    const nick  = $('#authNick').value.trim() || email.split('@')[0];
    if(!email || !pass) return toast('Email + пароль');
    try{
      const {user} = await auth.createUserWithEmailAndPassword(email, pass);
      await db.ref('usersPublic/'+user.uid).set({
        displayName: nick, email, photoURL:'', lang: $('#profileLang').value || 'uk', ts: Date.now()
      });
      dlg.close();
    }catch(e){ toast(e.message); }
  };

  // Load cities
  const cities = ["Praha","Brno","Ostrava","Plzeň","Liberec","Olomouc","České Budějovice","Hradec Králové"];
  cities.forEach(c=>{
    const opt = document.createElement('option'); opt.value=c; opt.textContent=c;
    citySelect.appendChild(opt.cloneNode(true));
    wpCityName.appendChild(opt);
  });
  citySelect.value = state.city;
  wpCityName.value = state.city;
  citySelect.onchange = ()=>{
    state.city = citySelect.value;
    wpCityName.value = state.city;
    applyWallpaper();
    resetChat();
    resetRent();
  };

  // Sidebar profile actions
  $('#btnChangeAvatar').onclick = ()=> $('#avatarFile').click();
  $('#avatarFile').addEventListener('change', async (e)=>{
    const file = e.target.files?.[0];
    if(!file || !state.user) return;
    try{
      const path = `avatars/${state.user.uid}/${Date.now()}_${file.name}`;
      const snap = await st.ref(path).put(file);
      const url  = await snap.ref.getDownloadURL();
      await db.ref('usersPublic/'+state.user.uid).update({ photoURL:url });
      $('#profileAvatar').src = url;
      toast('✔ Фото профілю оновлено');
    }catch(err){ toast('Помилка фото: '+err.message); }
  });
  $('#btnSaveProfile').onclick = async ()=>{
    if(!state.user) return toast('Спочатку увійдіть');
    const displayName = $('#profileNick').value.trim();
    const email       = $('#profileEmail').value.trim() || state.user.email || '';
    const lang        = $('#profileLang').value;
    await db.ref('usersPublic/'+state.user.uid).update({displayName,email,lang});
    toast('✔ Профіль збережено');
  };

  // --- Auth state ---
  auth.onAuthStateChanged(async (user)=>{
    state.user = user;
    document.body.classList.toggle('admin', false);
    $('#btnLogin').classList.toggle('hidden', !!user);
    $('#btnLogout').classList.toggle('hidden', !user);
    if(!user){
      $('#profileUid').textContent = '—';
      $('#profileEmail').value = '';
      $('#profileNick').value = '';
      $('#profileAvatar').src = 'assets/img/avatar.png';
      return;
    }
    $('#profileUid').textContent = user.uid;
    $('#profileEmail').value = user.email || '';
    // ensure public profile exists
    const up = (await db.ref('usersPublic/'+user.uid).get()).val() || {};
    if(!up.displayName){
      await db.ref('usersPublic/'+user.uid).update({
        displayName: user.displayName || (user.email? user.email.split('@')[0] : 'Користувач'),
        email: user.email || '', photoURL: user.photoURL || ''
      });
    }
    const pub = (await db.ref('usersPublic/'+user.uid).get()).val();
    $('#profileNick').value = pub?.displayName || '';
    $('#profileAvatar').src = pub?.photoURL || 'assets/img/avatar.png';
    $('#profileLang').value = pub?.lang || 'uk';

    // admin?
    const adminEmail = (await db.ref('settings/adminEmail').get()).val();
    state.isAdmin = !!(adminEmail && user.email && adminEmail.toLowerCase()===user.email.toLowerCase());
    document.body.classList.toggle('admin', state.isAdmin);

    // auto-friend admin
    if(adminEmail){
      const q = (await firebase.auth().fetchSignInMethodsForEmail(adminEmail).catch(()=>[]));
      // not reliable to get admin uid; use serverless mapping via settings/adminUid if exists
    }

    // watch notifications
    db.ref('notifications/'+user.uid).on('value', snap=>{
      const val = snap.val(); const count = val ? Object.keys(val).length : 0;
      $('#notifCount').textContent = count;
    });

    // preload usersPublic cache
    db.ref('usersPublic').on('value', s=>{ state.users = s.val()||{}; renderParticipants(); renderFriends(); });

    // init lists
    applyWallpaper();
    resetChat(); resetRent(); loadInbox();
  });

  // --- Wallpaper ---
  async function applyWallpaper(){
    const city = state.city;
    const wpCity = (await db.ref('settings/wallpapers/city/'+city).get()).val();
    const wpGlobal = (await db.ref('settings/wallpapers/global').get()).val();
    const url = wpCity || wpGlobal || `assets/img/${city}.jpg`;
    document.body.style.backgroundImage = `url('${url}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
  }

  // --- Chat feed with infinite scroll ---
  const chatList = $('#chatList');
  chatList.addEventListener('scroll', ()=>{
    if(chatList.scrollTop < 48 && !state.chat.loading) loadChatMore();
  });
  async function resetChat(){
    chatList.innerHTML=''; state.chat.oldestTs=null;
    await loadChatMore(true);
  }
  async function loadChatMore(first=false){
    state.chat.loading = true;
    $('#chatLoader').style.display='block';
    const city = state.city;
    const page = window.APP_CONFIG.PAGE_SIZE || 25;
    let q = db.ref('messages/'+city).orderByChild('ts');
    if(state.chat.oldestTs) q = q.endAt(state.chat.oldestTs-1);
    q = q.limitToLast(page);
    const snap = await q.get();
    const items = []; snap.forEach(ch=>items.push({...ch.val(), id: ch.key}));
    items.forEach(it=> state.chat.oldestTs = state.chat.oldestTs ? Math.min(state.chat.oldestTs,it.ts||0) : (it.ts||0));
    items.forEach(it=> renderMessage(chatList, it));
    if(first) chatList.scrollTop = chatList.scrollHeight;
    $('#chatLoader').style.display='none';
    state.chat.loading=false;
  }
  function renderMessage(container, m){
    const me = state.user?.uid === m.uid;
    const u  = state.users[m.uid] || {};
    const el = document.createElement('div');
    el.className = 'message'+(me?' me':'');
    el.innerHTML = `
      <img class="avatar" src="${esc(u.photoURL||'assets/img/avatar.png')}" alt="a" style="width:32px;height:32px;border-radius:50%;border:1px solid #2d333b">
      <div class="bubble">
        <div class="meta"><b>${esc(u.displayName||'Гість')}</b> · ${new Date(m.ts||Date.now()).toLocaleString()}</div>
        ${m.text? `<div class="text">${esc(m.text)}</div>`:''}
        ${m.photoUrl? `<img class="photo" src="${esc(m.photoUrl)}" alt="photo">`:''}
      </div>`;
    container.prepend(el); // prepend because we load older first
  }
  async function sendChat(){
    if(!auth.currentUser){ $('#authDialog').showModal(); return; }
    const text = $('#chatInput').value.trim();
    const photoUrl = state.pending.chatPhoto || '';
    if(!text && !photoUrl) return;
    const id = db.ref().push().key;
    await db.ref('messages/'+state.city+'/'+id).set({
      uid: auth.currentUser.uid, text, photoUrl, ts: Date.now()
    });
    $('#chatInput').value=''; state.pending.chatPhoto=null; $('#chatPhoto').value='';
    toast('Надіслано');
  }
  $('#chatSend').onclick = sendChat;
  $('#chatPhoto').addEventListener('change', e=> handlePhoto(e,'chatPhoto','chat'));

  // --- Rent feed ---
  const rentList = $('#rentList');
  rentList.addEventListener('scroll', ()=>{
    if(rentList.scrollTop < 48 && !state.rent.loading) loadRentMore();
  });
  async function resetRent(){
    rentList.innerHTML=''; state.rent.oldestTs=null;
    await loadRentMore(true);
  }
  async function loadRentMore(first=false){
    state.rent.loading = true;
    $('#rentLoader').style.display='block';
    const page = window.APP_CONFIG.PAGE_SIZE || 25;
    let q = db.ref('rentMessages/'+state.city).orderByChild('ts');
    if(state.rent.oldestTs) q = q.endAt(state.rent.oldestTs-1);
    q = q.limitToLast(page);
    const snap = await q.get();
    const items=[]; snap.forEach(ch=>items.push({...ch.val(), id:ch.key}));
    items.forEach(it=> state.rent.oldestTs = state.rent.oldestTs ? Math.min(state.rent.oldestTs,it.ts||0) : (it.ts||0));
    items.forEach(it=> renderMessage(rentList,it));
    if(first) rentList.scrollTop = rentList.scrollHeight;
    $('#rentLoader').style.display='none';
    state.rent.loading=false;
  }
  $('#rentSend').onclick = async ()=>{
    if(!auth.currentUser){ $('#authDialog').showModal(); return; }
    const text = $('#rentInput').value.trim();
    const photoUrl = state.pending.rentPhoto || '';
    if(!text && !photoUrl) return;
    const id = db.ref().push().key;
    await db.ref('rentMessages/'+state.city+'/'+id).set({
      uid: auth.currentUser.uid, text, photoUrl, ts: Date.now()
    });
    $('#rentInput').value=''; state.pending.rentPhoto=null; $('#rentPhoto').value='';
    toast('Опубліковано');
  };
  $('#rentPhoto').addEventListener('change', e=> handlePhoto(e,'rentPhoto','rent'));

  // --- Photo upload handler ---
  async function handlePhoto(e, inputId, where){
    const file = e.target.files?.[0];
    if(!file){ return; }
    if(!auth.currentUser){ $('#authDialog').showModal(); return; }
    try{
      const path = `uploads/${auth.currentUser.uid}/${Date.now()}_${file.name}`;
      const snap = await st.ref(path).put(file);
      const url = await snap.ref.getDownloadURL();
      state.pending[where+'Photo'] = url;
      toast('✔ Фото успішно додано… Тепер натисніть Надіслати');
    }catch(err){ toast('Помилка фото: '+err.message); }
  }

  // --- Friends & friend requests ---
  async function renderFriends(){
    const box = $('#friendsList'); box.innerHTML='';
    if(!state.user){ box.innerHTML='<div class="muted">Увійдіть</div>'; return; }
    const fr = (await db.ref('friends/'+state.user.uid).get()).val() || {};
    const ids = Object.keys(fr);
    ids.forEach(uid=>{
      const u = state.users[uid] || {};
      const card = document.createElement('div');
      card.className='card';
      card.innerHTML = `
        <div class="row" style="align-items:center">
          <img src="${esc(u.photoURL||'assets/img/avatar.png')}" style="width:40px;height:40px;border-radius:50%;border:1px solid #2d333b">
          <div>
            <div><b>${esc(u.displayName||'Гість')}</b></div>
            <div class="small muted">${esc(u.email||'')}</div>
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <button data-uid="${uid}" class="secondary btnOpenDM">ЛС</button>
          <button data-uid="${uid}" class="btnRemoveFriend">Видалити</button>
        </div>
      `;
      box.appendChild(card);
    });
    box.querySelectorAll('.btnOpenDM').forEach(b=> b.onclick = ()=> openDM(b.dataset.uid));
    box.querySelectorAll('.btnRemoveFriend').forEach(b=> b.onclick = ()=> removeFriend(b.dataset.uid));
  }
  async function renderParticipants(){
    const box = $('#participantsList'); box.innerHTML='';
    const users = state.users || {};
    Object.entries(users).forEach(([uid,u])=>{
      const card = document.createElement('div');
      card.className='card';
      card.innerHTML = `
        <div class="row" style="align-items:center">
          <img src="${esc(u.photoURL||'assets/img/avatar.png')}" style="width:42px;height:42px;border-radius:50%;border:1px solid #2d333b">
          <div>
            <div><b>${esc(u.displayName||'Гість')}</b></div>
            <div class="small muted">${esc(u.email||'')}</div>
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <button data-uid="${uid}" class="secondary btnOpenDM">ЛС</button>
          <button data-uid="${uid}" class="btnAddFriend">+ Друг</button>
        </div>
      `;
      box.appendChild(card);
    });
    box.querySelectorAll('.btnOpenDM').forEach(b=> b.onclick = ()=> openDM(b.dataset.uid));
    box.querySelectorAll('.btnAddFriend').forEach(b=> b.onclick = ()=> addFriend(b.dataset.uid));
  }
  async function addFriend(uid){
    if(!auth.currentUser) return $('#authDialog').showModal();
    if(uid===auth.currentUser.uid) return;
    await db.ref(`friendRequests/${uid}/${auth.currentUser.uid}`).set({ ts: Date.now() });
    toast('Заявка відправлена');
  }
  async function removeFriend(uid){
    await db.ref(`friends/${auth.currentUser.uid}/${uid}`).remove();
    await db.ref(`friends/${uid}/${auth.currentUser.uid}`).remove();
    toast('Видалено з друзів');
    renderFriends();
  }

  // Friend requests box
  async function refreshRequests(){
    if(!state.user) { $('#friendRequestsList').innerHTML=''; return; }
    const reqs = (await db.ref('friendRequests/'+state.user.uid).get()).val()||{};
    const box = $('#friendRequestsList'); box.innerHTML='';
    Object.keys(reqs).forEach(fromUid=>{
      const u = state.users[fromUid]||{};
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `
        <img src="${esc(u.photoURL||'assets/img/avatar.png')}" style="width:28px;height:28px;border-radius:50%">
        <div style="flex:1"><b>${esc(u.displayName||'Гість')}</b></div>
        <button data-uid="${fromUid}" class="primary btnAccept">Підтвердити</button>
        <button data-uid="${fromUid}" class="btnDecline">Відхилити</button>`;
      box.appendChild(row);
    });
    box.querySelectorAll('.btnAccept').forEach(b=> b.onclick = ()=> acceptFriend(b.dataset.uid));
    box.querySelectorAll('.btnDecline').forEach(b=> b.onclick = ()=> declineFriend(b.dataset.uid));
  }
  async function acceptFriend(other){
    const me = auth.currentUser.uid;
    await db.ref(`friends/${me}/${other}`).set({ ts: Date.now() });
    await db.ref(`friends/${other}/${me}`).set({ ts: Date.now() });
    await db.ref(`friendRequests/${me}/${other}`).remove();
    toast('✔ Успішно додано в друзі');
    renderFriends(); refreshRequests();
  }
  async function declineFriend(other){
    await db.ref(`friendRequests/${auth.currentUser.uid}/${other}`).remove();
    toast('Відхилено');
    refreshRequests();
  }
  setInterval(refreshRequests, 4000);

  // --- DM ---
  function dialogId(a,b){ return [a,b].sort().join('_'); }
  async function openDM(peerUid){
    if(!auth.currentUser) return $('#authDialog').showModal();
    const me = auth.currentUser.uid;
    const dId = dialogId(me, peerUid);
    state.dm.peer = peerUid; state.dm.dialogId = dId; state.dm.oldestTs = null;
    $('#dmTitle').textContent = 'Діалог з: '+ (state.users[peerUid]?.displayName || peerUid);
    // ensure membership
    await db.ref(`dm/${dId}/members/${me}`).set(true);
    await db.ref(`dm/${dId}/members/${peerUid}`).set(true);
    // preload
    $('#dmThread').innerHTML='';
    await loadDmMore(true);
  }
  const dmThread = $('#dmThread');
  dmThread.addEventListener('scroll', ()=>{
    if(dmThread.scrollTop < 48 && !state.dm.loading) loadDmMore();
  });
  async function loadDmMore(first=false){
    if(!state.dm.dialogId) return;
    state.dm.loading=true; $('#dmLoader').style.display='block';
    const page = window.APP_CONFIG.PAGE_SIZE || 25;
    let q = db.ref('dm/'+state.dm.dialogId+'/msgs').orderByChild('ts');
    if(state.dm.oldestTs) q = q.endAt(state.dm.oldestTs-1);
    q = q.limitToLast(page);
    const snap = await q.get();
    const items=[]; snap.forEach(ch=>items.push({...ch.val(), id:ch.key}));
    items.forEach(it=> state.dm.oldestTs = state.dm.oldestTs ? Math.min(state.dm.oldestTs,it.ts||0) : (it.ts||0));
    items.forEach(it=> renderMessage(dmThread,it));
    if(first) dmThread.scrollTop = dmThread.scrollHeight;
    $('#dmLoader').style.display='none'; state.dm.loading=false;
  }
  $('#dmSend').onclick = async ()=>{
    if(!auth.currentUser) return $('#authDialog').showModal();
    if(!state.dm.dialogId) return toast('Виберіть співрозмовника');
    const text = $('#dmInput').value.trim();
    const photoUrl = state.pending.dmPhoto || '';
    if(!text && !photoUrl) return;
    const id = db.ref().push().key;
    const msg = { uid: auth.currentUser.uid, text, photoUrl, ts: Date.now() };
    await db.ref('dm/'+state.dm.dialogId+'/msgs/'+id).set(msg);
    // inbox
    await db.ref('inboxMeta/'+auth.currentUser.uid+'/'+state.dm.dialogId).update({ lastTs: msg.ts });
    const peer = state.dm.peer;
    await db.ref('inboxMeta/'+peer+'/'+state.dm.dialogId).update({ lastTs: msg.ts });
    // notification
    await db.ref('notifications/'+peer+'/'+id).set({ type:'dm', dialogId: state.dm.dialogId, ts: msg.ts });
    $('#dmInput').value=''; state.pending.dmPhoto=null; $('#dmPhoto').value='';
  };
  $('#dmPhoto').addEventListener('change', e=> handlePhoto(e,'dmPhoto','dm'));

  async function loadInbox(){
    if(!state.user) return;
    const list = $('#dmList'); list.innerHTML='';
    const meta = (await db.ref('inboxMeta/'+state.user.uid).orderByChild('lastTs').limitToLast(50).get()).val()||{};
    const ids = Object.entries(meta).sort((a,b)=> (b[1].lastTs||0)-(a[1].lastTs||0));
    ids.forEach(([dId,val])=>{
      const parts = dId.split('_'); const peer = parts[0]===state.user.uid ? parts[1] : parts[0];
      const u = state.users[peer]||{};
      const row = document.createElement('div'); row.className='card'; row.style.cursor='pointer';
      row.innerHTML = `
        <div class="row" style="align-items:center">
          <img src="${esc(u.photoURL||'assets/img/avatar.png')}" style="width:34px;height:34px;border-radius:50%">
          <div><b>${esc(u.displayName||peer)}</b><div class="small muted">${new Date(val.lastTs||0).toLocaleString()}</div></div>
        </div>`;
      row.onclick = ()=> openDM(peer);
      list.appendChild(row);
    });
  }

  // --- Help & Map ---
  $('#helpAdd').onclick = async ()=>{
    if(!state.isAdmin) return toast('Тільки адмін');
    const title = $('#helpTitle').value.trim(); if(!title) return;
    let photoUrl = '';
    const f = $('#helpPhoto').files?.[0];
    if(f){
      const snap = await st.ref(`help/${Date.now()}_${f.name}`).put(f);
      photoUrl = await snap.ref.getDownloadURL();
    }
    const id = db.ref().push().key;
    await db.ref('help/'+state.city+'/'+id).set({title,photoUrl,ts:Date.now()});
    $('#helpTitle').value=''; $('#helpUrl').value=''; $('#helpPhoto').value='';
    renderHelp();
  };
  async function renderHelp(){
    const box = $('#helpList'); box.innerHTML='';
    const items = (await db.ref('help/'+state.city).get()).val()||{};
    Object.entries(items).sort((a,b)=> (b[1].ts||0)-(a[1].ts||0)).forEach(([id,it])=>{
      const card = document.createElement('div'); card.className='card';
      card.innerHTML = `<b>${esc(it.title||'')}</b>${it.photoUrl? `<div><img src="${esc(it.photoUrl)}" style="max-width:100%;border-radius:10px;border:1px solid #2d333b"></div>`:''}`;
      box.appendChild(card);
    });
  }

  let leafletMap=null, marker=null;
  function ensureMap(){
    if(leafletMap) return;
    leafletMap = L.map('map').setView([50.08,14.44], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(leafletMap);
  }
  async function renderMap(){
    ensureMap();
    const list = $('#mapPoiList'); list.innerHTML='';
    const pois = (await db.ref('map/poi/'+state.city).get()).val()||{};
    Object.entries(pois).forEach(([id,p])=>{
      L.marker([p.lat,p.lng]).addTo(leafletMap).bindPopup(`<b>${esc(p.title||'POI')}</b>`);
      const li = document.createElement('li'); li.textContent = `${p.title||id} — ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
      list.appendChild(li);
    });
  }
  $('#mapAdd').onclick = async ()=>{
    if(!state.isAdmin) return toast('Тільки адмін');
    ensureMap();
    const center = leafletMap.getCenter();
    const id = db.ref().push().key;
    await db.ref('map/poi/'+state.city+'/'+id).set({title:'Точка',lat:center.lat,lng:center.lng,ts:Date.now()});
    renderMap();
  };

  // Admin wallpapers
  $('#saveWallpapers').onclick = async ()=>{
    if(!state.isAdmin) return toast('Тільки адмін');
    const g = $('#wpGlobal').value.trim();
    const c = $('#wpCity').value.trim();
    if(g) await db.ref('settings/wallpapers/global').set(g);
    if(c) await db.ref('settings/wallpapers/city/'+$('#wpCityName').value).set(c);
    applyWallpaper(); toast('✔ Збережено');
  };
  $('#seedChat').onclick = async ()=>{
    if(!state.isAdmin) return toast('Тільки адмін');
    const id = db.ref().push().key;
    await db.ref('messages/'+state.city+'/'+id).set({uid: auth.currentUser.uid, text:'Привіт 👋', ts: Date.now()});
    resetChat();
  };
  $('#seedRent').onclick = async ()=>{
    if(!state.isAdmin) return toast('Тільки адмін');
    const id = db.ref().push().key;
    await db.ref('rentMessages/'+state.city+'/'+id).set({uid: auth.currentUser.uid, text:'Оренда квартири', ts: Date.now()});
    resetRent();
  };
  $('#seedPOI').onclick = ()=> $('#mapAdd').click();

  // initial renders per tab change
  document.addEventListener('click', (e)=>{
    if(e.target.classList.contains('tab')){
      const tab = e.target.dataset.tab;
      if(tab==='help') renderHelp();
      if(tab==='map') renderMap();
      if(tab==='friends') renderFriends();
      if(tab==='participants') renderParticipants();
      if(tab==='dms') loadInbox();
    }
  });
})();