
(function(){
  const app = firebase.initializeApp(window.FB_CONFIG);
  const auth = firebase.auth(); const db = firebase.database(); const st = firebase.storage();
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const toast=(t)=>{const el=$("#toast"); el.textContent=t; el.classList.add('show'); clearTimeout(window.__t); window.__t=setTimeout(()=>el.classList.remove('show'),2000);};

  // Tabs
  $$('.tab').forEach(b=>b.onclick=()=>{ $$('.tab').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    $$('.page').forEach(p=>p.classList.remove('visible')); $("#tab-"+b.dataset.tab).classList.add('visible'); });

  // Cities
  let currentCity = localStorage.getItem('pf_city') || (window.CITIES?.[0] || 'Praha');
  $("#citySel").innerHTML=(window.CITIES||["Praha"]).map(c=>`<option ${c===currentCity?'selected':''}>${c}</option>`).join('');
  $("#citySel").onchange=()=>{ currentCity=$("#citySel").value; localStorage.setItem('pf_city', currentCity); loadFeeds(); applyWallpaper(); };

  // Auth: grace mode
  const MODE=window.AUTH_GRACE_MODE||'30min'; const GRACE_MS=(window.GRACE_MINUTES||30)*60*1000;
  let graceStart=+localStorage.getItem('pf_grace_ts')||0, sentAsGuest=false;
  async function ensureAnon(){ if(!auth.currentUser){ try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(_){} await auth.signInAnonymously(); graceStart=Date.now(); localStorage.setItem('pf_grace_ts', String(graceStart)); } }
  function mustUpgrade(){ const u=auth.currentUser; if(!u) return true; if(!u.isAnonymous) return false; if(MODE==='afterFirstMessage') return sentAsGuest; return (Date.now()-graceStart)>GRACE_MS; }

  // Login buttons
  $("#btnLoginGoogle").onclick=async()=>{ const prov=new firebase.auth.GoogleAuthProvider(); try{await auth.signInWithPopup(prov);}catch(e){await auth.signInWithRedirect(prov);} };
  $("#btnLoginEmail").onclick=async()=>{ const email=prompt('Email:'), pass=prompt('Пароль:'); if(!email||!pass) return; try{await auth.signInWithEmailAndPassword(email,pass);}catch(e){ if(confirm('Створити акаунт?')) await auth.createUserWithEmailAndPassword(email,pass); else alert(e.message);} };
  $("#btnLogout").onclick=()=>auth.signOut();

  // Presence
  let statusRef = null;
  function setupPresence(u){
    if(!u || u.isAnonymous) return;
    const myStatusRef = db.ref('status/'+u.uid);
    statusRef = myStatusRef;
    myStatusRef.onDisconnect().set({state:'offline', ts:firebase.database.ServerValue.TIMESTAMP});
    myStatusRef.set({state:'online', ts:firebase.database.ServerValue.TIMESTAMP});
  }

  // Admin visibility
  let isAdmin=false, myLocale='uk', myPlan='Free', myNick='Користувач';
  auth.onAuthStateChanged(async u=>{
    $("#btnLogout").style.display = u ? '' : 'none';
    $("#btnLoginGoogle").style.display = u && !u.isAnonymous ? 'none' : '';
    $("#btnLoginEmail").style.display = u && !u.isAnonymous ? 'none' : '';
    isAdmin = !!(u && u.email && u.email.toLowerCase()===(window.ADMIN_EMAIL||'').toLowerCase());
    $$('.adminOnly').forEach(el=> el.style.display= isAdmin? '' : 'none');
    if(u){
      await db.ref('usersPublic/'+u.uid).update({nick:u.displayName||('Користувач '+u.uid.slice(0,6)), email:u.email||null, photoURL:u.photoURL||null, locale: myLocale, ts: firebase.database.ServerValue.TIMESTAMP, isBot:false});
      const planSnap = await db.ref('plans/'+u.uid).get(); myPlan = planSnap.val()?.name || 'Free';
      const up = await db.ref('usersPublic/'+u.uid).get(); myLocale = up.val()?.locale || myLocale; myNick = up.val()?.nick || myNick;
      setupPresence(u);
    }
    loadFeeds(); applyWallpaper(); startTicker();
  });

  // Wallpaper
  async function applyWallpaper(){
    const s=await db.ref('settings/wallpapers/city/'+currentCity).get();
    const url=s.val(); if(url) document.body.style.backgroundImage=`url('${url}')`;
    else { const t=await db.ref('settings/wallpapers/global').get(); const u=t.val(); document.body.style.backgroundImage = u?`url('${u}')`:"url('assets/bg.jpg')"; }
  }

  // Upload helper
  async function upFile(inputEl){
    const f = inputEl.files[0]; if(!f) return null;
    const id='p_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const ref = st.ref('uploads/'+(auth.currentUser?.uid||'anon')+'/'+id);
    await ref.put(f); const url = await ref.getDownloadURL(); return url;
  }

  // Chat send + infinite load
  let chatOldest = null, rentOldest = null, chatLive = null, rentLive = null;
  function renderMsg(container, k, v){
    const who = v.nick || v.email || (v.uid ? ('user-'+v.uid.slice(0,6)):'Гість');
    const langBadge = v.lang ? ` <span class="meta">[${v.lang}]</span>` : '';
    const txt = (myLocale && v.translations && v.translations[myLocale]) ? v.translations[myLocale] : (v.text||'');
    const img = v.photoUrl ? `<div><img src="${v.photoUrl}" loading="lazy"/></div>` : '';
    const el = document.createElement('div'); el.className='msg'; el.innerHTML=`<div><div class="meta">${who}${langBadge} · ${new Date(v.ts||Date.now()).toLocaleString()}</div><div>${txt?txt.replace(/[<>&]/g,s=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[s])):''}</div>${img}</div>`;
    container.appendChild(el);
  }
  async function paginate(container, path, oldestTsRef){
    const oldest = oldestTsRef.value;
    const q = db.ref(path).orderByChild('ts').endAt(oldest? oldest-1 : Date.now()).limitToLast(25);
    const snap = await q.get(); const arr=[]; snap.forEach(ch=>arr.push({k:ch.key,v:ch.val()}));
    if(arr.length===0) return;
    oldestTsRef.value = arr[0].v.ts || oldestTsRef.value;
    const atTop = container.scrollTop<=10;
    container.innerHTML='';
    arr.forEach(({k,v})=>renderMsg(container,k,v));
    if(atTop) container.scrollTop = 0;
  }
  function onScrollTop(el, cb){
    el.addEventListener('scroll', ()=>{ if(el.scrollTop<20) cb(); });
  }

  async function loadFeeds(){
    // Live listeners
    if(chatLive) chatLive.off(); if(rentLive) rentLive.off();
    const chatList=$("#chatList"), rentList=$("#rentList");
    chatList.innerHTML=''; rentList.innerHTML='';
    // Live tail for newest messages
    chatLive = db.ref('messages/'+currentCity).orderByChild('ts').limitToLast(25);
    chatLive.on('child_added', (ch)=>{ renderMsg(chatList, ch.key, ch.val()); chatList.scrollTop = chatList.scrollHeight; });
    rentLive = db.ref('rentMessages/'+currentCity).orderByChild('ts').limitToLast(25);
    rentLive.on('child_added', (ch)=>{ renderMsg(rentList, ch.key, ch.val()); rentList.scrollTop = rentList.scrollHeight; });
    // Setup infinite upwards
    chatOldest = {value: null}; rentOldest = {value:null};
    onScrollTop(chatList, ()=>paginate(chatList, 'messages/'+currentCity, chatOldest));
    onScrollTop(rentList, ()=>paginate(rentList, 'rentMessages/'+currentCity, rentOldest));
  }

  async function send(kind){
    if(mustUpgrade()) return alert('Увійдіть, щоб продовжити.');
    const input = $("#"+(kind==='chat'?'chatInput':'rentInput'));
    const file  = $("#"+(kind==='chat'?'chatPhoto':'rentPhoto'));
    if(!input.value.trim() && !file.files[0]) return;
    const url = await upFile(file) || null;
    const u=auth.currentUser||{};
    const data = {uid:u.uid||null,email:u.email||null,nick:myNick||null,text:input.value||null,photoUrl:url,ts:firebase.database.ServerValue.TIMESTAMP};
    await db.ref((kind==='chat'?'messages/':'rentMessages/')+currentCity).push(data);
    input.value=''; file.value = ''; toast('Надіслано'); $("#sndSend").play(); sentAsGuest = sentAsGuest || (u && u.isAnonymous);
  }
  $("#chatPhoto").onchange=()=>toast('✔️ Фото успішно додано…');
  $("#rentPhoto").onchange=()=>toast('✔️ Фото успішно додано…');
  $("#chatSend").onclick=()=>send('chat');
  $("#rentSend").onclick=()=>send('rent');

  // Jobs (admin add, all read)
  $("#jobAddBtn").onclick=()=>$("#jobDlg").showModal();
  $("#jobForm").onsubmit=()=>false;
  $("#jobForm").addEventListener('close', async ()=>{
    if($("#jobForm").returnValue!=='ok') return;
    if(!isAdmin) return alert('Лише адмін');
    const photoUrl = await upFile($("#jobPhoto"));
    const doc = {title:$("#jobTitle").value, salary:$("#jobSalary").value, contact:$("#jobContact").value, desc:$("#jobDesc").value, photoUrl: photoUrl||null, ts:firebase.database.ServerValue.TIMESTAMP};
    await db.ref('jobs/'+currentCity).push(doc); toast('Збережено');
    $("#jobTitle").value=$("#jobSalary").value=$("#jobContact").value=$("#jobDesc").value=''; $("#jobPhoto").value='';
  });
  db.ref('jobs/'+currentCity).on('value', (s)=>{
    const box=$("#jobsList"); box.innerHTML=''; s.forEach(ch=>{
      const v=ch.val(); const el=document.createElement('div'); el.className='card';
      el.innerHTML=`<h4>${v.title||'Вакансія'}</h4><div class="muted">${v.salary||''}</div><p>${(v.desc||'').replace(/[<>&]/g,s=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</p>${v.photoUrl?`<img src="${v.photoUrl}" style="max-width:100%;border-radius:10px">`:''}<div class="muted">${v.contact||''}</div>`;
      box.appendChild(el);
    });
  });

  // Members
  function renderMember(v, uid){
    const el=document.createElement('div'); el.className='card';
    const badge = v.plan && v.plan!=='Free' ? `<span class="meta" style="color:#ffd166">${v.plan}</span>`:'';
    const online = v.status==='online' ? `<span class="meta" style="color:var(--good)">● онлайн</span>`:`<span class="meta">offline</span>`;
    el.innerHTML = `<strong>${v.nick||('user-'+uid.slice(0,6))}</strong> ${badge}<br><span class="muted">${v.locale||''}</span> · ${online}<div class="mt8"></div><button class="btn small" data-act="profile">Профіль</button> <button class="btn small" data-act="dm">ЛС</button> <button class="btn small" data-act="add">Додати</button> ${isAdmin?'<label><input type="checkbox" data-act="pick"></label>':''}`;
    el.querySelector('[data-act="dm"]').onclick=()=>openDm(uid, v);
    return el;
  }
  async function loadMembers(){
    const snap = await db.ref('usersPublic').limitToFirst(1000).get();
    const list=$("#membersList"); list.innerHTML='';
    let users=[]; snap.forEach(ch=>{
      users.push({uid:ch.key, ...ch.val(), plan:null});
    });
    const plans = await db.ref('plans').get();
    const status = await db.ref('status').get();
    users = users.map(u=>({...u, plan:plans.val()?.[u.uid]?.name||'Free', status: status.val()?.[u.uid]?.state || 'offline'}));
    const q = $("#mSearch").value.toLowerCase(), loc=$("#mFilterLocale").value, pl=$("#mFilterPlan").value;
    users = users.filter(u => (!q || (u.nick||'').toLowerCase().includes(q)) && (!loc || u.locale===loc) && (!pl || u.plan===pl));
    users.sort((a,b)=> (b.status==='online') - (a.status==='online') || (b.plan>'Free') - (a.plan>'Free') || (a.nick||'').localeCompare(b.nick||''));
    users.forEach(u=> list.appendChild(renderMember(u, u.uid)));
  }
  $("#mSearch").oninput=loadMembers; $("#mFilterLocale").onchange=loadMembers; $("#mFilterPlan").onchange=loadMembers;

  // Mass actions
  $("#massPremiumBtn").onclick=()=>alert('Використай дії в Адмін → Масові дії');
  $("#massBanBtn").onclick=()=>alert('Використай дії в Адмін → Масові дії');
  $("#actionPremiumSelected").onclick=async()=>{
    if(!isAdmin) return alert('Лише адмін');
    const cards = $$("#membersList .card"); for(const c of cards){
      const chk=c.querySelector('input[type=checkbox]'); if(chk && chk.checked){
        const name='Premium'; const uid = (await (await db.ref('usersPublic').orderByChild('nick').equalTo(c.querySelector('strong').textContent).get())).forEach(()=>{});
      }
    }
    loadMembers();
  };
  $("#actionBanSelected").onclick=async()=>{
    if(!isAdmin) return alert('Лише адмін');
    const cards = $$("#membersList .card");
    for(const c of cards){ const chk=c.querySelector('input[type=checkbox]'); if(chk && chk.checked){ const nick=c.querySelector('strong').textContent;
      const q=await db.ref('usersPublic').orderByChild('nick').equalTo(nick).get(); q.forEach(node=> db.ref('bans/'+node.key).set(true)); }
    }
    toast('Бан застосовано'); loadMembers();
  };

  // DM
  function dialogId(a,b){ return [a,b].sort().join('_'); }
  async function openDm(uid, v){
    $$('.tab').forEach(x=>x.classList.remove('active')); $$('.page').forEach(p=>p.classList.remove('visible'));
    document.querySelector('.tab[data-tab="dm"]').classList.add('active'); $("#tab-dm").classList.add('visible');
    const me=auth.currentUser?.uid; const did=dialogId(me, uid);
    $("#dmHeader").textContent = (v?.nick||('user-'+uid.slice(0,6)));
    $("#dmThread").innerHTML='';
    await db.ref('dm/'+did+'/members/'+me).set(true);
    await db.ref('dm/'+did+'/members/'+uid).set(true);
    db.ref('dm/'+did+'/items').limitToLast(50).on('child_added', ch=>{ renderMsg($("#dmThread"), ch.key, ch.val()); $("#dmThread").scrollTop = $("#dmThread").scrollHeight; });
    $("#dmSend").onclick = async ()=>{
      if(mustUpgrade()) return alert('Увійдіть, щоб продовжити.');
      const f=$("#dmPhoto").files[0]? await upFile($("#dmPhoto")) : null;
      const data={uid:me, text:$("#dmInput").value||null, photoUrl:f, ts:firebase.database.ServerValue.TIMESTAMP};
      await db.ref('dm/'+did+'/items').push(data);
      $("#dmInput").value=''; $("#dmPhoto").value=''; $("#sndSend").play();
      // if target is bot => copy to bots/inbox
      if(v?.isBot) await db.ref('bots/inbox').push({to:uid, from:me, data, ts:firebase.database.ServerValue.TIMESTAMP});
    };
  }

  // Help cards
  $("#helpAddBtn").onclick=()=>$("#helpDlg").showModal();
  $("#helpForm").addEventListener('close', async ()=>{
    if($("#helpForm").returnValue!=='ok') return; if(!isAdmin) return alert('Лише адмін');
    const photoUrl = await upFile($("#helpPhoto"));
    const data={title:$("#helpTitle").value, text:$("#helpText").value, link:$("#helpLink").value, photoUrl:photoUrl||null, ts:firebase.database.ServerValue.TIMESTAMP};
    await db.ref('help/'+currentCity).push(data); toast('Збережено');
    $("#helpTitle").value=$("#helpText").value=$("#helpLink").value=''; $("#helpPhoto").value='';
  });
  db.ref('help/'+currentCity).on('value', (s)=>{
    const box=$("#helpList"); box.innerHTML=''; s.forEach(ch=>{
      const v=ch.val(); const el=document.createElement('div'); el.className='card';
      el.innerHTML=`<strong>${v.title||''}</strong><p>${(v.text||'').replace(/[<>&]/g,s=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</p>${v.link?`<a href="${v.link}" target="_blank">Посилання</a>`:''}${v.photoUrl?`<img src="${v.photoUrl}" style="max-width:100%;border-radius:10px">`:''}`;
      box.appendChild(el);
    });
  });

  // Reviews
  $("#reviewAddBtn").onclick=()=>$("#reviewDlg").showModal();
  $("#reviewForm").addEventListener('close', async ()=>{
    if($("#reviewForm").returnValue!=='ok') return; if(!isAdmin) return alert('Лише адмін');
    const photoUrl = await upFile($("#reviewPhoto"));
    await db.ref('reviews').push({nick:$("#reviewNick").value,text:$("#reviewText").value,photoUrl:photoUrl||null,ts:firebase.database.ServerValue.TIMESTAMP});
    toast('Відгук додано'); $("#reviewNick").value=$("#reviewText").value=''; $("#reviewPhoto").value='';
  });
  db.ref('reviews').on('value',(s)=>{
    const box=$("#reviewsList"); box.innerHTML=''; s.forEach(ch=>{
      const v=ch.val(); const el=document.createElement('div'); el.className='card';
      el.innerHTML=`<div><strong>${v.nick||'Користувач'}</strong></div><p>${(v.text||'').replace(/[<>&]/g,s=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</p>${v.photoUrl?`<img src="${v.photoUrl}" style="max-width:100%;border-radius:10px">`:''}`;
      box.appendChild(el);
    });
  });

  // Map (Leaflet)
  let map = L.map('map').setView([50.0755,14.4378], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  const markers = {};
  async function loadPois(){
    Object.values(markers).forEach(m=>map.removeLayer(m));
    const s=await db.ref('map/poi/'+currentCity).get(); s.forEach(ch=>{
      const v=ch.val(); const m=L.marker(v.latlng||[50.0755,14.4378]).addTo(map).bindPopup(`<strong>${v.title||''}</strong><br>${v.link?`<a href="${v.link}" target="_blank">${v.link}</a>`:''}${v.photoUrl?`<br><img src="${v.photoUrl}" style="width:140px">`:''}`); markers[ch.key]=m;
    });
  }
  loadPois(); map.on('moveend', ()=>{});
  $("#poiAdd").onclick=async()=>{
    if(!isAdmin) return alert('Лише адмін');
    const c = map.getCenter(); const url = await upFile($("#poiPhoto"));
    await db.ref('map/poi/'+currentCity).push({title:$("#poiTitle").value, link:$("#poiLink").value, latlng:[c.lat,c.lng], photoUrl:url||null, ts:firebase.database.ServerValue.TIMESTAMP});
    $("#poiTitle").value=$("#poiLink").value=''; $("#poiPhoto").value=''; loadPois(); toast('Точка додана');
  };

  // Admin: wallpapers + key
  $("#saveWallGlobal").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/wallpapers/global').set($("#wallGlobal").value); applyWallpaper(); toast('Збережено'); };
  $("#saveWallCity").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/wallpapers/city/'+currentCity).set($("#wallCity").value); applyWallpaper(); toast('Збережено'); };
  $("#wallFile").onchange=async()=>{ if(!isAdmin) return alert('Лише адмін'); const url=await upFile($("#wallFile")); await db.ref('settings/wallpapers/city/'+currentCity).set(url); applyWallpaper(); toast('Фон оновлено'); };
  $("#saveMapsKey").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/googleMapsKey').set($("#mapsKey").value); toast('Ключ збережено (секретно)'); };

  // Admin: bots + seeding
  $("#createBot").onclick=async()=>{
    if(!isAdmin) return alert('Лише адмін');
    const uid='bot_'+Math.random().toString(36).slice(2,8);
    await db.ref('usersPublic/'+uid).set({nick:$("#botNick").value||('Bot '+uid.slice(-4)), locale:$("#botLocale").value||'cs', isBot:true, ts:firebase.database.ServerValue.TIMESTAMP});
    toast('Бот створений');
    loadMembers();
  };
  $("#seedBtn").onclick=async()=>{
    if(!isAdmin) return alert('Лише адмін');
    const res = await fetch('seed/participants.json'); const arr = await res.json();
    for(const u of arr){ await db.ref('usersPublic/'+u.uid).set({nick:u.nick,email:u.email,photoURL:u.photoURL,locale:u.locale,isBot:u.isBot, ts:firebase.database.ServerValue.TIMESTAMP}); await db.ref('plans/'+u.uid).set({name:u.plan, ts:firebase.database.ServerValue.TIMESTAMP}); await db.ref('status/'+u.uid).set({state:u.status, ts:firebase.database.ServerValue.TIMESTAMP}); }
    toast('120 профілів додано'); loadMembers();
  };

  // VIP ticker
  function startTicker(){
    db.ref('plans').on('value', s=>{
      const vip = []; s.forEach(ch=>{ const v=ch.val(); if(v && v.name && v.name!=='Free') vip.push(ch.key.slice(0,6)+'… '+v.name); });
      $("#vipTicker").textContent = vip.length? ('Преміум оновлення: '+vip.slice(-10).join(' • ')) : '';
    });
  }

  // Init
  (async function(){ await ensureAnon(); applyWallpaper(); loadFeeds(); loadMembers(); })();
})();
