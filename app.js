/* PRÁCE CZ chat — app.js */
(function(){
  const cfg = window.APP_CONFIG;
  firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const db = firebase.database();
  const storage = firebase.storage();

  // state
  const S = {
    user: null, adminEmail: null, city: cfg.DEFAULT_CITY,
    dmPeer: null, chatPhoto: null, rentPhoto: null, dmPhoto: null,
    isAdmin() { return S.user && S.user.email && S.adminEmail && S.user.email === S.adminEmail; }
  };

  // elements
  const el = (id)=>document.getElementById(id);
  const chatList = el('chatList'), rentList=el('rentList');
  const dmList=el('dmList'), dmFeed=el('dmFeed');
  const peopleList=el('peopleList'), helpList=el('helpList');
  const bgGlobal=el('bgGlobal'), bgCity=el('bgCity'), bgCityName=el('bgCityName');
  const bellCount=el('bellCount');

  // helpers
  const toastBox = el('toast');
  function toast(msg){ toastBox.textContent = msg; toastBox.style.display='block'; setTimeout(()=>toastBox.style.display='none', 1800); }
  function dialogId(a,b){ return [a,b].sort().join('_'); }
  function ts(){ return Date.now(); }
  function hEscape(s){ return (s||'').replace(/[<>&]/g, c=>({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c])); }

  // Tabs
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab').forEach(t=>t.classList.add('hidden'));
      el('tab-'+btn.dataset.tab).classList.remove('hidden');
    });
  });

  // Auth buttons
  el('btnLogin').onclick = openProfile;
  el('btnLogout').onclick = async()=>{ await auth.signOut(); };

  // Bell
  el('btnBell').onclick = async()=>{
    if(!S.user) return openProfile();
    await db.ref('notifications/'+S.user.uid).remove();
    bellCount.textContent = '0';
  };

  // City select
  const citySelect = el('citySelect');
  citySelect.value = S.city;
  citySelect.onchange = ()=>{ S.city = citySelect.value; applyWallpaper(); loadChat(); loadRent(); loadHelp(); loadPOI(); };

  // Profile modal
  const profileModal = el('profileModal');
  function openProfile(){ profileModal.classList.remove('hidden'); }
  el('profileClose').onclick = ()=>profileModal.classList.add('hidden');

  // Profile fields
  const pf = {
    avatar: el('profileAvatar'),
    avatarFile: el('profileAvatarFile'),
    name: el('profileName'),
    email: el('profileEmail'),
    lang: el('profileLang'),
    city: el('profileCity'),
    save: el('profileSave')
  };
  pf.avatarFile.onchange = async (e)=>{
    if(!S.user) return;
    const f = e.target.files[0]; if(!f) return;
    const path = 'avatars/'+S.user.uid+'_'+f.name.replace(/\s+/g,'_');
    const snap = await storage.ref(path).put(f);
    const url = await snap.ref.getDownloadURL();
    await db.ref('usersPublic/'+S.user.uid).update({ photoURL:url });
    pf.avatar.src = url; toast('✔ Фото збережено');
  };
  pf.save.onclick = async ()=>{
    if(!S.user) return;
    const data = { displayName: pf.name.value || 'Користувач', email: S.user.email, photoURL: pf.avatar.src, lang: pf.lang.value, city: pf.city.value, updatedAt: ts() };
    await db.ref('usersPublic/'+S.user.uid).update(data);
    await db.ref('limits/'+S.user.uid).update({ plan: 'free' });
    toast('✔ Профіль збережено');
  };

  // Google sign & email/pass simple flow
  async function ensureAuth(){
    try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch(e){}
    if(S.user) return S.user;
    // open profile modal to encourage login
    openProfile();
    // one-click Google
    const provider = new firebase.auth.GoogleAuthProvider();
    try{
      await auth.signInWithPopup(provider);
    }catch(err){
      // fallback redirect (popup blocked)
      await auth.signInWithRedirect(provider);
    }
  }

  // onAuth
  auth.onAuthStateChanged(async (user)=>{
    S.user = user || null;
    el('btnLogin').classList.toggle('hidden', !!user);
    el('btnLogout').classList.toggle('hidden', !user);

    // load admin email
    const adminSnap = await db.ref('settings/adminEmail').get();
    if(adminSnap.exists()) S.adminEmail = adminSnap.val();
    else if(user && cfg.ADMIN_EMAIL_DEFAULT){
      // first run convenience: set default if none
      await db.ref('settings/adminEmail').set(cfg.ADMIN_EMAIL_DEFAULT);
      S.adminEmail = cfg.ADMIN_EMAIL_DEFAULT;
    }

    // UI for admin
    el('adminTab').classList.toggle('hidden', !(S.user && S.user.email === S.adminEmail));
    el('helpAdminBox').classList.toggle('hidden', !(S.user && S.user.email === S.adminEmail));
    el('mapAdd').classList.toggle('hidden', !(S.user && S.user.email === S.adminEmail));

    // write usersPublic
    if(user){
      const pub = {
        displayName: user.displayName || 'Користувач',
        email: user.email || '',
        photoURL: user.photoURL || 'assets/img/avatar.png',
        lang: 'uk', city: S.city, createdAt: ts()
      };
      await db.ref('usersPublic/'+user.uid).update(pub);
      // auto friend with admin
      if(S.adminEmail){
        const q = await db.ref('usersPublic').orderByChild('email').equalTo(S.adminEmail).get();
        q.forEach(async (snap)=>{
          const adminUid = snap.key;
          await db.ref('friends/'+user.uid+'/'+adminUid).set({ ts: ts() });
          await db.ref('friends/'+adminUid+'/'+user.uid).set({ ts: ts() });
        });
      }
      // notifications count
      db.ref('notifications/'+user.uid).on('value', s=>{
        bellCount.textContent = s.exists()? Object.keys(s.val()).length : 0;
      });
    }

    // Prefill profile UI
    if(user){
      pf.email.value = user.email || '';
      const s2 = await db.ref('usersPublic/'+user.uid).get();
      if(s2.exists()){
        const d = s2.val();
        pf.name.value = d.displayName || '';
        pf.avatar.src = d.photoURL || 'assets/img/avatar.png';
        pf.lang.value = d.lang || 'uk';
        pf.city.value = d.city || S.city;
      }
    }
    applyWallpaper();
    loadChat(); loadRent(); loadDMs(); loadPeople(); loadHelp(); loadPOI();
  });

  // Wallpapers
  async function applyWallpaper(){
    // city specific → global → Unsplash Prague fallback
    document.body.style.backgroundImage = "none";
    const city = S.city;
    const cityUrl = (await db.ref('settings/wallpapers/city/'+city).get()).val();
    const globalUrl = (await db.ref('settings/wallpapers/global').get()).val();
    const url = cityUrl || globalUrl || "url('https://images.unsplash.com/photo-1544989164-31dc3c645987?q=80&w=1600&auto=format&fit=crop')";
    document.body.style.backgroundImage = url.startsWith('url(') ? url : `url('${url}')`;
  }
  el('bgSave').onclick = async ()=>{
    if(!(S.user && S.user.email === S.adminEmail)) return;
    if(bgGlobal.value) await db.ref('settings/wallpapers/global').set(bgGlobal.value);
    if(bgCity.value) await db.ref('settings/wallpapers/city/'+bgCityName.value).set(bgCity.value);
    toast('✔ Обої збережено');
    applyWallpaper();
  };

  // Chat load & send (rate limit for Free plan: 30min per message)
  let chatUnsub = null, chatCursor = null;
  function loadChat(){
    if(chatUnsub) chatUnsub();
    chatList.innerHTML = '';
    chatCursor = null;
    const ref = db.ref('messages/'+S.city).limitToLast(50);
    const fn = ref.on('child_added', snap=>renderMsg(snap, chatList));
    chatUnsub = ()=>ref.off('child_added', fn);
  }
  function renderMsg(snap, container){
    const m = snap.val(); if(!m) return;
    const li = document.createElement('li'); li.className = 'message'+(S.user && m.uid===S.user.uid?' me':'');
    const av = document.createElement('img'); av.src = m.photoURL || 'assets/img/avatar.png'; av.className='avatarxl'; av.style.width='34px'; av.style.height='34px';
    const bu = document.createElement('div'); bu.className='bubble';
    bu.innerHTML = `<b>${hEscape(m.name||'')}</b><div>${hEscape(m.text||'')}</div>` + (m.imageURL? `<img class="msgImg" src="${m.imageURL}">` : '') + `<div class="msgMeta">${new Date(m.ts||0).toLocaleString()}</div>`;
    li.appendChild(av); li.appendChild(bu);
    container.appendChild(li);
    container.scrollTop = container.scrollHeight;
  }
  async function canPostToChat(){
    if(!S.user) return false;
    const plan = (await db.ref('limits/'+S.user.uid+'/plan').get()).val() || 'free';
    if(plan !== 'free') return true;
    const last = (await db.ref('limits/'+S.user.uid+'/lastChatTs').get()).val() || 0;
    const diff = ts() - last;
    return diff > 30*60*1000; // 30 minutes
  }
  async function sendChat(text, imageURL){
    if(!S.user){ await ensureAuth(); if(!S.user) return; }
    const ok = await canPostToChat();
    if(!ok){ toast('⌛ Ліміт: 1 повідомлення / 30 хв (купіть Premium)'); return; }
    const up = await db.ref('usersPublic/'+S.user.uid).get();
    const pub = up.val()||{};
    await db.ref('messages/'+S.city).push({ uid:S.user.uid, name:pub.displayName||'Користувач', photoURL:pub.photoURL||'', text:text||'', imageURL:imageURL||'', ts:ts() });
    await db.ref('limits/'+S.user.uid).update({ lastChatTs: ts() });
  }
  el('chatSend').onclick = async ()=>{
    const text = el('chatInput').value.trim(); const f = el('chatPhoto').files[0];
    let url=''; if(f){ const p='chat/'+S.city+'/'+S.user.uid+'_'+f.name.replace(/\s+/g,'_'); const up=await storage.ref(p).put(f); url=await up.ref.getDownloadURL(); toast('✔ Фото успішно додано…'); }
    if(!text && !url) return toast('Напишіть щось…');
    await sendChat(text, url); el('chatInput').value=''; el('chatPhoto').value='';
  };

  // Rent
  function loadRent(){
    rentList.innerHTML='';
    db.ref('rentMessages/'+S.city).limitToLast(50).on('child_added', snap=>renderMsg(snap, rentList));
  }
  el('rentSend').onclick = async ()=>{
    if(!S.user){ await ensureAuth(); if(!S.user) return; }
    const text = el('rentInput').value.trim(); const f = el('rentPhoto').files[0];
    let url=''; if(f){ const p='rent/'+S.city+'/'+S.user.uid+'_'+f.name.replace(/\s+/g,'_'); const up=await storage.ref(p).put(f); url=await up.ref.getDownloadURL(); toast('✔ Фото успішно додано…'); }
    if(!text && !url) return;
    const pub = (await db.ref('usersPublic/'+S.user.uid).get()).val()||{};
    await db.ref('rentMessages/'+S.city).push({ uid:S.user.uid, name:pub.displayName||'Користувач', photoURL:pub.photoURL||'', text:text||'', imageURL:url||'', ts:ts() });
    el('rentInput').value=''; el('rentPhoto').value='';
  };

  // DMs
  let dmUnsub = null;
  function openDM(peerUid){
    if(!S.user) return;
    S.dmPeer = peerUid;
    dmFeed.innerHTML = '';
    const dId = dialogId(S.user.uid, peerUid);
    // ensure membership for rules
    db.ref('dm/'+dId+'/members/'+S.user.uid).set(true);
    db.ref('dm/'+dId+'/members/'+peerUid).set(true);
    if(dmUnsub) dmUnsub();
    const ref = db.ref('dm/'+dId).limitToLast(60);
    const fn = ref.on('child_added', s=>{
      if(s.key==='members') return;
      renderMsg(s, dmFeed);
    });
    dmUnsub = ()=>ref.off('child_added', fn);
  }
  async function loadDMs(){
    if(!S.user){ dmList.innerHTML=''; return; }
    db.ref('inboxMeta/'+S.user.uid).on('value', async (snap)=>{
      dmList.innerHTML = '';
      const meta = snap.val()||{};
      for(const dId in meta){
        const [a,b] = dId.split('_');
        const peer = (a===S.user.uid)? b : a;
        const userSnap = await db.ref('usersPublic/'+peer).get();
        const u = userSnap.val()||{displayName:'Користувач'};
        const li = document.createElement('li'); li.className='card';
        li.innerHTML = `<b>${hEscape(u.displayName)}</b><div class="row"><button class="primary" data-peer="${peer}">ЛС</button></div>`;
        dmList.appendChild(li);
      }
      dmList.querySelectorAll('[data-peer]').forEach(b=>b.onclick = ()=> openDM(b.dataset.peer));
    });
  }
  el('dmSend').onclick = async ()=>{
    if(!S.user) return;
    if(!S.dmPeer) return toast('Виберіть співрозмовника');
    const text = el('dmInput').value.trim(); const f = el('dmPhoto').files[0];
    let url=''; if(f){ const p='dm/'+S.user.uid+'_'+S.dmPeer+'/'+S.user.uid+'_'+f.name.replace(/\s+/g,'_'); const up=await storage.ref(p).put(f); url=await up.ref.getDownloadURL(); toast('✔ Фото додано…'); }
    if(!text && !url) return;
    const dId = dialogId(S.user.uid, S.dmPeer);
    const pub = (await db.ref('usersPublic/'+S.user.uid).get()).val()||{};
    const m = { uid:S.user.uid, name:pub.displayName||'Користувач', photoURL:pub.photoURL||'', text:text||'', imageURL:url||'', ts:ts() };
    const ref = db.ref('dm/'+dId).push(); await ref.set(m);
    await db.ref('inboxMeta/'+S.user.uid+'/'+dId).set({ ts: m.ts });
    await db.ref('inboxMeta/'+S.dmPeer+'/'+dId).set({ ts: m.ts });
    await db.ref('notifications/'+S.dmPeer).push({ from:S.user.uid, ts:m.ts, dId });
    el('dmInput').value=''; el('dmPhoto').value='';
  };

  // People
  async function loadPeople(){
    db.ref('usersPublic').on('value', (snap)=>{
      peopleList.innerHTML='';
      const all = snap.val()||{};
      Object.entries(all)
        .filter(([uid,u]) => (u && (u.email || u.displayName))) // hide pure guests
        .forEach(([uid,u])=>{
          const li = document.createElement('li'); li.className='card';
          const photo = u.photoURL || 'assets/img/avatar.png';
          li.innerHTML = `<div class="row"><img src="${photo}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:1px solid #2b3240" />
            <div><b>${hEscape(u.displayName||'Користувач')}</b><div class="muted">${hEscape(u.email||'')}</div></div></div>
            <div class="row" style="margin-top:8px">
              <button class="primary" data-dm="${uid}">ЛС</button>
              <button data-friend="${uid}">+ Друг</button>
              <button data-open="${uid}">Профіль</button>
            </div>`;
          peopleList.appendChild(li);
        });
      peopleList.querySelectorAll('[data-dm]').forEach(b=>b.onclick=()=>{ openDM(b.dataset.dm); document.querySelector('[data-tab="dm"]').click(); });
      peopleList.querySelectorAll('[data-friend]').forEach(b=>b.onclick=async()=>{
        if(!S.user) return openProfile();
        const peer = b.dataset.friend;
        await db.ref('friends/'+S.user.uid+'/'+peer).set({ ts: ts() });
        await db.ref('friends/'+peer+'/'+S.user.uid).set({ ts: ts() });
        toast('✔ Успішно додано в друзі');
      });
      peopleList.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{
        const uid=b.dataset.open;
        const u=(await db.ref('usersPublic/'+uid).get()).val()||{};
        pf.avatar.src = u.photoURL || 'assets/img/avatar.png';
        pf.name.value = u.displayName || '';
        pf.email.value = u.email || '';
        openProfile();
      });
    });
  }

  // Help
  function loadHelp(){
    helpList.innerHTML='';
    db.ref('help/'+S.city).limitToLast(100).on('child_added', s=>{
      const c = s.val(); const li=document.createElement('li'); li.className='card';
      li.innerHTML = `<b>${hEscape(c.title||'Без назви')}</b>${c.imageURL? `<img class="msgImg" src="${c.imageURL}">`:''}${c.link? `<div><a href="${c.link}" target="_blank">перейти →</a></div>`:''}`;
      helpList.appendChild(li);
    });
  }
  el('helpAdd').onclick = async ()=>{
    if(!(S.user && S.user.email === S.adminEmail)) return;
    const t = el('helpTitle').value.trim(); const L = el('helpLink').value.trim(); const f = el('helpPhoto').files[0];
    let url=''; if(f){ const p='help/'+S.city+'/'+f.name.replace(/\s+/g,'_'); const up=await storage.ref(p).put(f); url=await up.ref.getDownloadURL(); }
    await db.ref('help/'+S.city).push({ title:t, link:L, imageURL:url, ts:ts(), by:S.user.uid });
    el('helpTitle').value=''; el('helpLink').value=''; el('helpPhoto').value=''; toast('✔ Додано');
  };

  // Map (Leaflet via CDN)
  (function addLeaflet(){
    const link = document.createElement('link');
    link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const s = document.createElement('script');
    s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = initMap;
    document.head.appendChild(s);
  })();
  let map, markers=[];
  function initMap(){
    map = L.map('map').setView([50.0755, 14.4378], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    loadPOI();
    el('mapAdd').onclick = async ()=>{
      if(!(S.user && S.user.email === S.adminEmail)) return;
      const center = map.getCenter();
      await db.ref('map/poi/'+S.city).push({ lat:center.lat, lng:center.lng, title:'Нова точка', ts:ts(), by:S.user.uid });
    };
  }
  function loadPOI(){
    if(!map) return;
    markers.forEach(m=>m.remove()); markers=[];
    db.ref('map/poi/'+S.city).on('value', s=>{
      markers.forEach(m=>m.remove()); markers=[];
      const all=s.val()||{};
      Object.values(all).forEach(p=>{
        const m = L.marker([p.lat,p.lng]).addTo(map).bindPopup(hEscape(p.title||''));
        markers.push(m);
      });
    });
  }

  // Admin bots
  el('botMsg').onclick = async ()=>{
    if(!(S.user && S.user.email===S.adminEmail)) return;
    const pub=(await db.ref('usersPublic/'+S.user.uid).get()).val()||{};
    await db.ref('messages/'+S.city).push({ uid:S.user.uid, name:pub.displayName||'Адмін', text:'Тестове повідомлення ✅', ts:ts(), photoURL:pub.photoURL||'' });
  };
  el('botRent').onclick = async ()=>{
    if(!(S.user && S.user.email===S.adminEmail)) return;
    const pub=(await db.ref('usersPublic/'+S.user.uid).get()).val()||{};
    await db.ref('rentMessages/'+S.city).push({ uid:S.user.uid, name:pub.displayName||'Адмін', text:'Квартира 1+kk — 12 000 Kč', ts:ts(), photoURL:pub.photoURL||'' });
  };
  el('botPOI').onclick = async ()=>{
    if(!(S.user && S.user.email===S.adminEmail)) return;
    await db.ref('map/poi/'+S.city).push({ lat:50.08, lng:14.42, title:'Допомога волонтерів', ts:ts(), by:S.user.uid });
  };

  // Admin: plans
  async function setPlan(plan){
    if(!S.user) return;
    await db.ref('limits/'+S.user.uid+'/plan').set(plan);
    toast('✔ План: '+plan);
  }
  el('planFree').onclick=()=>setPlan('free');
  el('planPremium').onclick=()=>setPlan('premium');
  el('planPremiumPlus').onclick=()=>setPlan('premium+');

  // Payments inbox render (admin only)
  function renderInbox(){
    if(!(S.user && S.user.email===S.adminEmail)) return;
    db.ref('payments/inbox').on('value', s=>{
      const box = el('payInbox'); box.innerHTML='';
      const all=s.val()||{};
      Object.entries(all).forEach(([pid, p])=>{
        const li=document.createElement('li'); li.className='card';
        li.innerHTML = `<b>${hEscape(p.email||p.uid||'')}</b> — план: ${hEscape(p.plan||'premium')}
                        ${p.imageURL?`<img class="msgImg" src="${p.imageURL}">`:''}
                        <div class="row"><button data-approve="${pid}">Підтвердити</button><button data-reject="${pid}">Видалити</button></div>`;
        box.appendChild(li);
      });
      box.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{
        const id=b.dataset.approve; const p=(await db.ref('payments/inbox/'+id).get()).val()||{};
        if(p.uid){ await db.ref('limits/'+p.uid).update({ plan: p.plan||'premium' }); await db.ref('notifications/'+p.uid).push({ msg:'Підписку активовано', ts:ts() }); }
        await db.ref('payments/inbox/'+id).remove();
      });
      box.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{
        await db.ref('payments/inbox/'+b.dataset.reject).remove();
      });
    });
  }
  renderInbox();

  // Upload payment proof (user facing via profile modal? keep simple via file input on demand)
  // You can add a UI later; endpoint: payments/inbox/{autoId} with {uid,email,plan,imageURL,ts}

  // Initial
  applyWallpaper();
})();
