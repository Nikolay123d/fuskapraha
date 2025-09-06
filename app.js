(function(){
  const app = firebase.initializeApp(window.FB_CONFIG);
  const auth = firebase.auth(), db=firebase.database(), st=firebase.storage();
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const toast=(t)=>{const el=$("#toast"); el.textContent=t; el.classList.add('show'); clearTimeout(window.__t); window.__t=setTimeout(()=>el.classList.remove('show'),2400);};

  // Header avatar
  const headerAvatar = document.getElementById('headerAvatar');
  if(headerAvatar){ headerAvatar.addEventListener('click', ()=>{
    const u=auth.currentUser; if(!u || u.isAnonymous){ $("#regDlg").showModal(); return; }
    openProfile(u.uid);
  }); }

  // Cities
  let currentCity = localStorage.getItem('pf_city') || (window.CITIES?.[0] || 'Praha');
  $("#citySel").innerHTML=(window.CITIES||["Praha"]).map(c=>`<option ${c===currentCity?'selected':''}>${c}</option>`).join('');
  $("#citySel").addEventListener('change', ()=>{ currentCity=$("#citySel").value; localStorage.setItem('pf_city', currentCity); applyWallpaper(); });

  // Auth
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
  function blockedByVerification(u){
    if(!u) return true;
    if(u.isAnonymous) return false;
    if(u.emailVerified) return false;
    const created = new Date(u.metadata.creationTime||Date.now()).getTime();
    return (Date.now()-created) > (window.GRACE_MINUTES||360)*60000;
  }
  async function ensureAnon(){ if(!auth.currentUser){ try{ await auth.signInAnonymously(); }catch(_){} } }
  const gate=()=>{ const u=auth.currentUser; if(!u) return false; if(blockedByVerification(u)){ $("#verifyDlg").showModal(); return true; } return false; };

  // Top buttons
  $("#btnJobsOpen").addEventListener('click', ()=>{ $("#jobsCity").textContent=currentCity; $("#jobsDlg").showModal(); });
  $("#btnRegister").addEventListener('click', ()=>$("#regDlg").showModal());
  $("#btnLoginGoogle").addEventListener('click', async()=>{const p=new firebase.auth.GoogleAuthProvider(); try{await auth.signInWithPopup(p);}catch(e){await auth.signInWithRedirect(p);} });
  $("#btnLoginEmail").addEventListener('click', async()=>{const e=prompt('Email:'), p=prompt('Пароль:'); if(!e||!p) return; try{await auth.signInWithEmailAndPassword(e,p);}catch(err){ if(confirm('Створити акаунт?')) await auth.createUserWithEmailAndPassword(e,p); else alert(err.message);} });
  $("#btnLogout").addEventListener('click', ()=>auth.signOut());

  // Registration
  $("#regSaveBtn").addEventListener('click', async ()=>{
    const role=$("#regRole").value, locale=$("#regLocale").value, nick=$("#regNick").value.trim(), email=$("#regEmail").value.trim(), pass=$("#regPass").value;
    if(!role||!locale||!nick||!email||!pass) return;
    try{
      const cr=await auth.createUserWithEmailAndPassword(email,pass);
      await cr.user.updateProfile({displayName:nick});
      await db.ref('usersPublic/'+cr.user.uid).set({nick, email, photoURL:null, locale, role, isBot:false, ts:firebase.database.ServerValue.TIMESTAMP});
      try{ await cr.user.sendEmailVerification(); }catch(_){}
      toast('Акаунт створено. Перевір СПАМ.');
    }catch(e){ alert(e.message); }
  });

  // Role flags + presence
  let isAdmin=false, my = {locale:'uk', nick:'Користувач', role:'seeker', photoURL:null};
  function updateRoleUI(){ $$('.adminOnly').forEach(el=> el.style.display = isAdmin? '' : 'none'); $$('.employerOnly').forEach(el=> el.style.display = (my.role==='employer' || isAdmin)? '' : 'none'); }
  function setupPresence(u){
    if(!u || u.isAnonymous) return;
    const ref = db.ref('status/'+u.uid);
    ref.onDisconnect().set({state:'offline', ts:firebase.database.ServerValue.TIMESTAMP});
    ref.set({state:'online', ts:firebase.database.ServerValue.TIMESTAMP});
  }

  auth.onAuthStateChanged(async u=>{
    $("#btnLogout").style.display = u ? '' : 'none';
    $("#btnLoginGoogle").style.display = u && !u.isAnonymous ? 'none' : '';
    $("#btnLoginEmail").style.display = u && !u.isAnonymous ? 'none' : '';
    $("#btnRegister").style.display = u && !u.isAnonymous ? 'none' : '';
    if(headerAvatar){ headerAvatar.src = (u && u.photoURL) ? u.photoURL : 'assets/avatar-default.png'; }
    isAdmin = !!(u && u.email && u.email.toLowerCase()===(window.ADMIN_EMAIL||'').toLowerCase());
    if(u){
      const up = await db.ref('usersPublic/'+u.uid).get();
      if(up.exists()){ const v=up.val(); my.locale=v.locale||'uk'; my.nick=v.nick||my.nick; my.role=v.role||'seeker'; my.photoURL=v.photoURL||u.photoURL||null; }
      else { my.locale='uk'; my.nick=u.displayName||('Користувач '+(u.uid||'').slice(0,6)); my.role='seeker';
        await db.ref('usersPublic/'+u.uid).set({nick:my.nick,email:u.email||null,photoURL:u.photoURL||null,locale:my.locale,role:my.role,isBot:false, ts:firebase.database.ServerValue.TIMESTAMP});
      }
      setupPresence(u);
      if(blockedByVerification(u)) $("#verifyDlg").showModal();
    }
    updateRoleUI(); applyWallpaper();
  });

  async function applyWallpaper(){
    try{
      const s=await db.ref('settings/wallpapers/city/'+currentCity).get();
      const url=s.val();
      if(url){ document.body.style.backgroundImage=`url('${url}')`; return; }
      const t=await db.ref('settings/wallpapers/global').get(); const u=t.val();
      document.body.style.backgroundImage = u?`url('${u}')`:`url('${window.DEFAULT_WALLPAPER || "assets/bg.jpg"}')`;
    }catch(_){
      document.body.style.backgroundImage = `url('${window.DEFAULT_WALLPAPER || "assets/bg.jpg"}')`;
    }
  }

  async function upFile(inputEl){
    const f = inputEl.files[0]; if(!f) return null;
    const id='p_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const ref = st.ref('uploads/'+(auth.currentUser?.uid||'anon')+'/'+id);
    await ref.put(f); const url = await ref.getDownloadURL(); return url;
  }
  const esc=(s='')=>s.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
  function msgElement(v){
    const uid=v.uid; const avatar = v.photoAvatar || v.avatarUrl || v.photoURL || 'assets/avatar-default.png';
    const el=document.createElement('div'); el.className='msg';
    const nick = v.nick || v.email || (uid?('user-'+uid.slice(0,6)):'Гість');
    const txt = (my.locale && v.translations && v.translations[my.locale]) ? v.translations[my.locale] : (v.text||'');
    el.innerHTML = `<img class="avatar" src="${avatar}"><div style="flex:1"><div class="meta"><a href="#" data-uid="${uid||''}" class="nick">${esc(nick)}</a> · ${new Date(v.ts||Date.now()).toLocaleString()}</div><div>${esc(txt)}</div>${v.photoUrl?`<div><img class="content" src="${v.photoUrl}" loading="lazy"></div>`:''}</div>`;
    const a = el.querySelector('.nick'); if(uid && a){ a.addEventListener('click', (ev)=>{ev.preventDefault(); openProfile(uid);} ); }
    return el;
  }

  // Listeners life-cycle
  let live = { chat:null, rent:null, dm:null };
  function clearLive(name){ try{ if(live[name]) live[name].off(); }catch(_){} live[name]=null; }

  // Openers
  $("#openChat").addEventListener('click', ()=>{ $("#chatCity").textContent=currentCity; $("#dlgChat").showModal(); loadChat(); });
  $("#openRent").addEventListener('click', ()=>{ $("#rentCity").textContent=currentCity; $("#dlgRent").showModal(); loadRent(); });
  $("#openMembers").addEventListener('click', ()=>{ $("#dlgMembers").showModal(); loadMembers(); });
  $("#openMap").addEventListener('click', ()=>{ $("#mapCity").textContent=currentCity; $("#dlgMap").showModal(); openMapDlg(); });
  $("#openHelp").addEventListener('click', ()=>{ $("#dlgHelp").showModal(); loadHelp(); });
  $("#openAdmin").addEventListener('click', ()=>{ if(!isAdmin) return alert('Лише адмін'); $("#dlgAdmin").showModal(); });

  $("#dlgChat").addEventListener('close', ()=> clearLive('chat'));
  $("#dlgRent").addEventListener('close', ()=> clearLive('rent'));
  $("#profileDlg").addEventListener('close', ()=> clearLive('dm'));

  // Chat
  let firstChatTs = null; const chatBox=$("#chatList");
  function loadChat(){
    clearLive('chat'); firstChatTs=null; chatBox.innerHTML='';
    live.chat = db.ref('messages/'+currentCity).orderByChild('ts').limitToLast(25);
    live.chat.on('child_added', ch=>{ const v=ch.val(); chatBox.appendChild(msgElement(v)); if(firstChatTs===null || v.ts<firstChatTs) firstChatTs=v.ts; chatBox.scrollTop=chatBox.scrollHeight; });
  }
  $("#chatPhoto").addEventListener('change', ()=>{ $("#btnChatPhoto").classList.add('ok'); toast('✔️ Зображення збережено'); setTimeout(()=>$("#btnChatPhoto").classList.remove('ok'),1800); });
  $("#chatSend").addEventListener('click', async()=>{ if(gate()) return; const url=await upFile($("#chatPhoto")); const input=$("#chatInput"); const u=auth.currentUser||{};
    if(!input.value.trim() && !url) return; await db.ref('messages/'+currentCity).push({uid:u.uid||null,email:u.email||null,nick:my.nick,avatarUrl:my.photoURL,text:input.value||null,photoUrl:url||null, ts:firebase.database.ServerValue.TIMESTAMP}); input.value=''; $("#chatPhoto").value=''; $("#sndSend").play(); });

  chatBox && chatBox.addEventListener('scroll', async()=>{ if(chatBox.scrollTop<60 && firstChatTs){ const snap=await db.ref('messages/'+currentCity).orderByChild('ts').endAt(firstChatTs-1).limitToLast(25).get(); const items=[]; snap.forEach(ch=>items.push(ch.val())); const prevH=chatBox.scrollHeight; items.forEach(v=>{ chatBox.insertBefore(msgElement(v), chatBox.firstChild); firstChatTs=Math.min(firstChatTs||v.ts, v.ts||firstChatTs); }); chatBox.scrollTop = chatBox.scrollHeight - prevH; } });

  // Rent
  let firstRentTs=null; const rentBox=$("#rentList");
  function loadRent(){
    clearLive('rent'); firstRentTs=null; rentBox.innerHTML='';
    live.rent = db.ref('rentMessages/'+currentCity).orderByChild('ts').limitToLast(25);
    live.rent.on('child_added', ch=>{ const v=ch.val(); rentBox.appendChild(msgElement(v)); if(firstRentTs===null || v.ts<firstRentTs) firstRentTs=v.ts; rentBox.scrollTop=rentBox.scrollHeight; });
  }
  $("#rentPhoto").addEventListener('change', ()=>{ $("#btnRentPhoto").classList.add('ok'); toast('✔️ Зображення збережено'); setTimeout(()=>$("#btnRentPhoto").classList.remove('ok'),1800); });
  $("#rentSend").addEventListener('click', async()=>{ if(gate()) return; const url=await upFile($("#rentPhoto")); const input=$("#rentInput"); const u=auth.currentUser||{};
    if(!input.value.trim() && !url) return; await db.ref('rentMessages/'+currentCity).push({uid:u.uid||null,email:u.email||null,nick:my.nick,avatarUrl:my.photoURL,text:input.value||null,photoUrl:url||null, ts:firebase.database.ServerValue.TIMESTAMP}); input.value=''; $("#rentPhoto").value=''; $("#sndSend").play(); });
  rentBox && rentBox.addEventListener('scroll', async()=>{ if(rentBox.scrollTop<60 && firstRentTs){ const snap=await db.ref('rentMessages/'+currentCity).orderByChild('ts').endAt(firstRentTs-1).limitToLast(25).get(); const items=[]; snap.forEach(ch=>items.push(ch.val())); const prevH=rentBox.scrollHeight; items.forEach(v=>{ rentBox.insertBefore(msgElement(v), rentBox.firstChild); firstRentTs=Math.min(firstRentTs||v.ts, v.ts||firstRentTs); }); rentBox.scrollTop = rentBox.scrollHeight - prevH; } });

  // Jobs
  function loadJobs(){
    db.ref('jobs/'+currentCity).on('value', s=>{
      const box=$("#jobsList"); if(!box) return; box.innerHTML=''; s.forEach(ch=>{ const v=ch.val(); const el=document.createElement('div'); el.className='card'; el.innerHTML=`<h4>${esc(v.title||'Вакансія')}</h4><div class="muted">${esc(v.salary||'')}</div><p>${esc(v.desc||'')}</p>${v.photoUrl?`<img src="${v.photoUrl}" style="max-width:100%;border-radius:10px">`:''}<div class="muted">${esc(v.contact||'')}</div>`; box.appendChild(el); }); });
  } loadJobs();
  $("#jobAddBtn").addEventListener('click', ()=>{ if(gate()) return; if(!(isAdmin || my.role==='employer')) return alert('Лише адмін або роботодавець'); $("#jobNewDlg").showModal(); });
  $("#jobAddBtn2").addEventListener('click', ()=>{ if(gate()) return; $("#jobNewDlg").showModal(); });
  $("#jobSaveBtn").addEventListener('click', async ()=>{
    const u=auth.currentUser; if(!u) return;
    if(!(isAdmin || my.role==='employer')) return alert('Лише адмін або роботодавець');
    const photoUrl = await upFile($("#jobPhoto"));
    const doc = {title:$("#jobTitle").value, salary:$("#jobSalary").value, contact:$("#jobContact").value, desc:$("#jobDesc").value, photoUrl:photoUrl||null, ts:firebase.database.ServerValue.TIMESTAMP};
    await db.ref('jobs/'+currentCity).push(doc); toast('Вакансія збережена');
    $("#jobTitle").value=$("#jobSalary").value=$("#jobContact").value=$("#jobDesc").value=''; $("#jobPhoto").value='';
  });

  // Members
  function renderMember(v, uid){
    const el=document.createElement('div'); el.className='card';
    const badge = v.plan && v.plan!=='Free' ? `<span class="meta" style="color:#ffd166">${v.plan}</span>`:'';
    const online = v.status==='online' ? `<span class="meta" style="color:#49d17a">● онлайн</span>`:`<span class="meta">offline</span>`;
    el.innerHTML = `<div style="display:flex;gap:8px;align-items:center">
      <img class="avatar" src="${v.photoURL||'assets/avatar-default.png'}">
      <div style="flex:1">
        <strong><a href="#" data-uid="${uid}" class="openprof">${esc(v.nick||('user-'+uid.slice(0,6)))}</a></strong> ${badge}<br>
        <span class="muted">${esc(v.locale||'')}${v.role?(' · '+esc(v.role)):""}</span> · ${online}
      </div>
      ${isAdmin?'<label><input type="checkbox" data-act="pick"></label>':''}
    </div>`;
    el.querySelector('.openprof').addEventListener('click', (ev)=>{ev.preventDefault(); openProfile(uid);});
    return el;
  }
  async function loadMembers(){
    const list=$("#membersList"); if(!list) return; list.innerHTML='';
    const [ups, plans, status] = await Promise.all([db.ref('usersPublic').get(), db.ref('plans').get(), db.ref('status').get()]);
    const arr=[]; ups.forEach(ch=>arr.push({uid:ch.key, ...ch.val()}));
    arr.forEach(u=>{ u.plan=(plans.val()?.[u.uid]?.name)||'Free'; u.status=(status.val()?.[u.uid]?.state)||'offline'; });
    const q=$("#mSearch").value.toLowerCase(), loc=$("#mFilterLocale").value, pl=$("#mFilterPlan").value;
    const filtered = arr.filter(u => (!q || (u.nick||'').toLowerCase().includes(q)) && (!loc || u.locale===loc) && (!pl || u.plan===pl));
    filtered.sort((a,b)=> (b.status==='online') - (a.status==='online') || (b.plan!=='Free') - (a.plan!=='Free') || (a.nick||'').localeCompare(b.nick||''));
    filtered.forEach(u=> list.appendChild(renderMember(u, u.uid)));
  }
  $("#mSearch").addEventListener('input', loadMembers); $("#mFilterLocale").addEventListener('change', loadMembers); $("#mFilterPlan").addEventListener('change', loadMembers);
  $("#seedBtn") && $("#seedBtn").addEventListener('click', async ()=>{ if(!isAdmin) return alert('Лише адмін'); const r=await fetch('seed/participants.json'); const arr=await r.json(); for(const u of arr){ await db.ref('usersPublic/'+u.uid).set({nick:u.nick, locale:u.locale, role:'seeker', isBot:u.isBot, ts:firebase.database.ServerValue.TIMESTAMP}); await db.ref('plans/'+u.uid).set({name:u.plan, ts:firebase.database.ServerValue.TIMESTAMP}); await db.ref('status/'+u.uid).set({state:u.status, ts:firebase.database.ServerValue.TIMESTAMP}); } toast('Профілі додані'); });

  // Profile + DM
  function dialogId(a,b){ return [a,b].sort().join('_'); }
  async function openProfile(uid){
    const snap = await db.ref('usersPublic/'+uid).get(); const v=snap.val()||{};
    $("#profNick").textContent = v.nick || ('user-'+uid.slice(0,6));
    $("#profMeta").textContent = (v.email||'') + (v.locale?(' · '+v.locale):'') + (v.role?(' · '+v.role):'');
    $("#profAvatar").src = v.photoURL || 'assets/avatar-default.png';
    $("#profileDlg").showModal();
    // DM setup
    const me=auth.currentUser?.uid;
    if(me && me!==uid){
      clearLive('dm');
      const did=dialogId(me, uid);
      $("#dmThread").innerHTML='';
      db.ref('dm/'+did+'/members/'+me).set(true);
      db.ref('dm/'+did+'/members/'+uid).set(true);
      live.dm = db.ref('dm/'+did+'/items').limitToLast(50);
      live.dm.on('child_added', ch=>{ $("#dmThread").appendChild(msgElement(ch.val())); $("#dmThread").scrollTop = $("#dmThread").scrollHeight; });
      $("#dmSend").onclick = async ()=>{
        if(gate()) return;
        const f=$("#dmPhoto").files[0]? await upFile($("#dmPhoto")) : null;
        const data={uid:me, text:$("#dmInput").value||null, photoUrl:f, ts:firebase.database.ServerValue.TIMESTAMP, avatarUrl: my.photoURL, nick: my.nick};
        await db.ref('dm/'+did+'/items').push(data);
        $("#dmInput").value=''; $("#dmPhoto").value=''; $("#sndSend").play();
      };
    } else {
      $("#dmSend").onclick = ()=> toast('Потрібен вхід для ЛС');
    }
    $("#btnProfAdd").onclick = async()=>{
      const me=auth.currentUser?.uid; if(!me){ $("#regDlg").showModal(); return; }
      await db.ref('friendRequests/'+uid+'/'+me).set({ts:firebase.database.ServerValue.TIMESTAMP});
      toast('Заявка у друзі надіслана');
    };
  }

  // Help
  function loadHelp(){
    db.ref('help/'+currentCity).on('value', s=>{
      const box=$("#helpList"); if(!box) return; box.innerHTML='';
      s.forEach(ch=>{ const v=ch.val(); const el=document.createElement('div'); el.className='card'; el.innerHTML=`<strong>${esc(v.title||'')}</strong><p>${esc(v.text||'')}</p>${v.link?`<a href="${v.link}" target="_blank">Посилання</a>`:''}${v.photoUrl?`<img src="${v.photoUrl}" style="max-width:100%;border-radius:10px">`:''}`; box.appendChild(el); });
    });
  }
  $("#helpAddBtn") && $("#helpAddBtn").addEventListener('click', ()=>{
    if(!isAdmin) return alert('Лише адмін');
    const dlg=document.createElement('dialog'); dlg.innerHTML=`<form method="dialog" class="card"><h3>Нова картка</h3><input id="helpTitle" placeholder="Заголовок"><input id="helpLink" placeholder="Посилання"><textarea id="helpText" placeholder="Текст…"></textarea><label class="icon-btn">📷<input type="file" id="helpPhoto" accept="image/*" hidden></label><menu><button class="btn" value="cancel">Скасувати</button><button class="btn primary" value="ok">Зберегти</button></menu></form>`; document.body.appendChild(dlg); dlg.showModal();
    dlg.addEventListener('close', async ()=>{ if(dlg.returnValue!=='ok') return; const photo = dlg.querySelector('#helpPhoto'); const url = photo.files[0]? await upFile(photo):null; await db.ref('help/'+currentCity).push({title:dlg.querySelector('#helpTitle').value,text:dlg.querySelector('#helpText').value,link:dlg.querySelector('#helpLink').value||null,photoUrl:url||null, ts:firebase.database.ServerValue.TIMESTAMP}); toast('Картку збережено'); dlg.remove(); });
  });

  // Map
  let map=null; let markers={};
  function openMapDlg(){
    setTimeout(()=>{ if(!map){ map = L.map('map').setView([50.0755,14.4378], 11); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map); } map.invalidateSize(); loadPois(); },100);
  }
  async function loadPois(){
    Object.values(markers).forEach(m=> map && map.removeLayer && map.removeLayer(m)); markers={};
    const s=await db.ref('map/poi/'+currentCity).get();
    s.forEach(ch=>{ const v=ch.val(); const m=L.marker(v.latlng||[50.0755,14.4378]).addTo(map).bindPopup(`<strong>${esc(v.title||'')}</strong><br>${v.link?`<a href="${v.link}" target="_blank">${esc(v.link)}</a>`:''}${v.photoUrl?`<br><img src="${v.photoUrl}" style="width:140px">`:''}`); markers[ch.key]=m; });
  }
  $("#poiAdd").addEventListener('click', async()=>{ if(!isAdmin) return alert('Лише адмін'); const c=map.getCenter(); const url=await upFile($("#poiPhoto")); await db.ref('map/poi/'+currentCity).push({title:$("#poiTitle").value,link:$("#poiLink").value,latlng:[c.lat,c.lng],photoUrl:url||null,ts:firebase.database.ServerValue.TIMESTAMP}); $("#poiTitle").value=$("#poiLink").value=''; $("#poiPhoto").value=''; loadPois(); toast('Точку додано'); });

  // Admin
  $("#saveWallGlobal").addEventListener('click', async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/wallpapers/global').set($("#wallGlobal").value); applyWallpaper(); toast('Готово'); });
  $("#saveWallCity").addEventListener('click', async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/wallpapers/city/'+currentCity).set($("#wallCity").value); applyWallpaper(); toast('Готово'); });
  $("#wallFile").addEventListener('change', async()=>{ if(!isAdmin) return alert('Лише адмін'); const url=await upFile($("#wallFile")); await db.ref('settings/wallpapers/city/'+currentCity).set(url); applyWallpaper(); toast('Фон оновлено'); });
  $("#saveMapsKey").addEventListener('click', async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/googleMapsKey').set($("#mapsKey").value); toast('Ключ збережено'); });
  $("#createBot").addEventListener('click', async()=>{ if(!isAdmin) return alert('Лише адмін'); const uid='bot_'+Math.random().toString(36).slice(2,8); await db.ref('usersPublic/'+uid).set({nick:$("#botNick").value||('Bot '+uid.slice(-4)), locale:$("#botLocale").value||'cs', role:'seeker', isBot:true, ts:firebase.database.ServerValue.TIMESTAMP}); toast('Бот створений'); });

  // Profile open from brand
  $("#openProfile").addEventListener('click', ()=>{
    const u = auth.currentUser;
    if(!u || u.isAnonymous){ $("#regDlg").showModal(); return; }
    openProfile(u.uid);
  });

  (async function(){ await ensureAnon(); applyWallpaper(); })();
})();