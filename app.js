
(function(){
  const headerAvatar = document.getElementById('headerAvatar');
  headerAvatar.onclick = ()=>{
    const u = auth.currentUser;
    if(!u || u.isAnonymous){ document.getElementById('regDlg').showModal(); return; }
    openProfile(u.uid);
  };

  const app = firebase.initializeApp(window.FB_CONFIG);
  const auth = firebase.auth(), db=firebase.database(), st=firebase.storage();
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const toast=(t)=>{const el=$("#toast"); el.textContent=t; el.classList.add('show'); clearTimeout(window.__t); window.__t=setTimeout(()=>el.classList.remove('show'),2300);};

  // City
  let currentCity = localStorage.getItem('pf_city') || (window.CITIES?.[0] || 'Praha');
  $("#citySel").innerHTML=(window.CITIES||["Praha"]).map(c=>`<option ${c===currentCity?'selected':''}>${c}</option>`).join('');
  $("#citySel").onchange=()=>{ currentCity=$("#citySel").value; localStorage.setItem('pf_city', currentCity); applyWallpaper(); };

  // Auth persistence
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});

  // Grace period
  function blockedByVerification(u){
    if(!u) return true;
    if(u.isAnonymous) return false;
    if(u.emailVerified) return false;
    const created = new Date(u.metadata.creationTime||Date.now()).getTime();
    return (Date.now()-created) > (window.GRACE_MINUTES||360)*60000;
  }
  async function ensureAnon(){ if(!auth.currentUser){ try{ await auth.signInAnonymously(); }catch(_){} } }
  const gate=()=>{ const u=auth.currentUser; if(!u) return false; if(blockedByVerification(u)){ $("#verifyDlg").showModal(); return true; } return false; };

  // Header buttons
  $("#btnJobsOpen").onclick=()=>{ $("#jobsCity").textContent=currentCity; $("#jobsDlg").showModal(); };
  $("#btnRegister").onclick=()=>$("#regDlg").showModal();
  $("#btnLoginGoogle").onclick=async()=>{const p=new firebase.auth.GoogleAuthProvider(); try{await auth.signInWithPopup(p);}catch(e){await auth.signInWithRedirect(p);} };
  $("#btnLoginEmail").onclick=async()=>{const e=prompt('Email:'), p=prompt('Пароль:'); if(!e||!p) return; try{await auth.signInWithEmailAndPassword(e,p);}catch(err){ if(confirm('Створити акаунт?')) await auth.createUserWithEmailAndPassword(e,p); else alert(err.message);} };
  $("#btnLogout").onclick=()=>auth.signOut();

  // Registration save + resend
  $("#regForm").addEventListener('close', async ()=>{
    if($("#regForm").returnValue!=='ok') return;
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
  $("#btnResend").onclick=async(ev)=>{ev.preventDefault(); const u=auth.currentUser; if(!u) return; try{ await u.sendEmailVerification(); toast('Лист відправлено ще раз'); }catch(e){ alert(e.message);} };

  // Role flags
  let isAdmin=false, my = {locale:'uk', nick:'Користувач', role:'seeker', photoURL:null};
  function updateRoleUI(){ $$('.adminOnly').forEach(el=> el.style.display = isAdmin? '' : 'none'); $$('.employerOnly').forEach(el=> el.style.display = (my.role==='employer' || isAdmin)? '' : 'none'); }

  // Presence
  function setupPresence(u){
    if(!u || u.isAnonymous) return;
    const ref = db.ref('status/'+u.uid);
    ref.onDisconnect().set({state:'offline', ts:firebase.database.ServerValue.TIMESTAMP});
    ref.set({state:'online', ts:firebase.database.ServerValue.TIMESTAMP});
  }

  // Auth state
  auth.onAuthStateChanged(async u=>{
    $("#btnLogout").style.display = u ? '' : 'none';
    $("#btnLoginGoogle").style.display = u && !u.isAnonymous ? 'none' : '';
    $("#btnLoginEmail").style.display = u && !u.isAnonymous ? 'none' : '';
    $("#btnRegister").style.display = u && !u.isAnonymous ? 'none' : '';
    isAdmin = !!(u && u.email && u.email.toLowerCase()===(window.ADMIN_EMAIL||'').toLowerCase());
    if(u){
      const up = await db.ref('usersPublic/'+u.uid).get();
      if(up.exists()){ const v=up.val(); my.locale=v.locale||'uk'; my.nick=v.nick||my.nick; my.role=v.role||'seeker'; my.photoURL=v.photoURL||null; }
      else { my.locale='uk'; my.nick=u.displayName||('Користувач '+(u.uid||'').slice(0,6)); my.role='seeker';
        await db.ref('usersPublic/'+u.uid).set({nick:my.nick,email:u.email||null,photoURL:u.photoURL||null,locale:my.locale,role:my.role,isBot:false, ts:firebase.database.ServerValue.TIMESTAMP});
      }
      setupPresence(u);
      if(blockedByVerification(u)) $("#verifyDlg").showModal();
    }
    updateRoleUI(); applyWallpaper();
  });

  // Wallpaper
  async function applyWallpaper(){
    const s=await db.ref('settings/wallpapers/city/'+currentCity).get();
    const url=s.val(); if(url) document.body.style.backgroundImage=`url('${url}')`;
    else { const t=await db.ref('settings/wallpapers/global').get(); const u=t.val(); document.body.style.backgroundImage = u?`url('${u}')`:`url('assets/bg.jpg')`; }
  }

  // Upload helper
  async function upFile(inputEl){
    const f = inputEl.files[0]; if(!f) return null;
    const id='p_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const ref = st.ref('uploads/'+(auth.currentUser?.uid||'anon')+'/'+id);
    await ref.put(f); const url = await ref.getDownloadURL(); return url;
  }

  // Rendering helper
  function esc(s){return (s||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}
  function msgElement(v){
    const uid=v.uid; const fallbackAvatar = ' 'assets/avatar-default.png' ;
    const avatar = (v.photoAvatar || v.avatarUrl || v.photoURL);
    const el=document.createElement('div'); el.className='msg';
    const nick = v.nick || v.email || (uid?('user-'+uid.slice(0,6)):'Гість');
    const txt = (my.locale && v.translations && v.translations[my.locale]) ? v.translations[my.locale] : (v.text||'');
    el.innerHTML = `<img class="avatar" src="${avatar||fallbackAvatar}"><div style="flex:1"><div class="meta"><a href="#" data-uid="${uid||''}" class="nick">${esc(nick)}</a> · ${new Date(v.ts||Date.now()).toLocaleString()}</div><div>${esc(txt)}</div>${v.photoUrl?`<div><img class="content" src="${v.photoUrl}" loading="lazy"></div>`:''}</div>`;
    const a = el.querySelector('.nick'); if(uid && a){ a.onclick=(ev)=>{ev.preventDefault(); openProfile(uid);} }
    return el;
  }

  // -------- Modals control & live listeners isolation --------
  let live = { chat:null, rent:null, dm:null };
  function clearLive(name){ try{ if(live[name]) live[name].off(); }catch(_){} live[name]=null; }

  // Openers
  $("#openChat").onclick=()=>{ $("#chatCity").textContent=currentCity; $("#dlgChat").showModal(); loadChat(); };
  $("#openRent").onclick=()=>{ $("#rentCity").textContent=currentCity; $("#dlgRent").showModal(); loadRent(); };
  $("#openMembers").onclick=()=>{ $("#dlgMembers").showModal(); loadMembers(); };
  $("#openMap").onclick=()=>{ $("#mapCity").textContent=currentCity; $("#dlgMap").showModal(); openMapDlg(); };
  $("#openHelp").onclick=()=>{ $("#dlgHelp").showModal(); loadHelp(); };
  $("#openAdmin").onclick=()=>{ if(!isAdmin) return alert('Лише адмін'); $("#dlgAdmin").showModal(); };

  // Close handlers -> detach listeners
  $("#dlgChat").addEventListener('close', ()=> clearLive('chat'));
  $("#dlgRent").addEventListener('close', ()=> clearLive('rent'));
  $("#profileDlg").addEventListener('close', ()=> clearLive('dm'));

  // Chat
  function loadChat(){
    clearLive('chat');
    const box=$("#chatList"); box.innerHTML='';
    live.chat = db.ref('messages/'+currentCity).orderByChild('ts').limitToLast(25);
    live.chat.on('child_added', ch=>{ box.appendChild(msgElement(ch.val())); box.scrollTop=box.scrollHeight; });
  }
  $("#chatPhoto").onchange=()=>$("#btnChatPhoto").classList.add('ok');
  $("#chatSend").onclick=async()=>{ if(gate()) return; const url=await upFile($("#chatPhoto")); const input=$("#chatInput"); const u=auth.currentUser||{};
    if(!input.value.trim() && !url) return; await db.ref('messages/'+currentCity).push({uid:u.uid||null,email:u.email||null,nick:my.nick,avatarUrl:my.photoURL,text:input.value||null,photoUrl:url||null, ts:firebase.database.ServerValue.TIMESTAMP}); input.value=''; $("#chatPhoto").value=''; $("#btnChatPhoto").classList.remove('ok'); $("#sndSend").play(); };

  // Rent
  function loadRent(){
    clearLive('rent');
    const box=$("#rentList"); box.innerHTML='';
    live.rent = db.ref('rentMessages/'+currentCity).orderByChild('ts').limitToLast(25);
    live.rent.on('child_added', ch=>{ box.appendChild(msgElement(ch.val())); box.scrollTop=box.scrollHeight; });
  }
  $("#rentPhoto").onchange=()=>$("#btnRentPhoto").classList.add('ok');
  $("#rentSend").onclick=async()=>{ if(gate()) return; const url=await upFile($("#rentPhoto")); const input=$("#rentInput"); const u=auth.currentUser||{};
    if(!input.value.trim() && !url) return; await db.ref('rentMessages/'+currentCity).push({uid:u.uid||null,email:u.email||null,nick:my.nick,avatarUrl:my.photoURL,text:input.value||null,photoUrl:url||null, ts:firebase.database.ServerValue.TIMESTAMP}); input.value=''; $("#rentPhoto").value=''; $("#btnRentPhoto").classList.remove('ok'); $("#sndSend").play(); };

  // Jobs
  function loadJobs(){
    db.ref('jobs/'+currentCity).on('value', s=>{
      const box=$("#jobsList"); if(!box) return; box.innerHTML=''; s.forEach(ch=>{
        const v=ch.val(); const el=document.createElement('div'); el.className='card';
        el.innerHTML=`<h4>${esc(v.title||'Вакансія')}</h4><div class="muted">${esc(v.salary||'')}</div><p>${esc(v.desc||'')}</p>${v.photoUrl?`<img src="${v.photoUrl}" style="max-width:100%;border-radius:10px">`:''}<div class="muted">${esc(v.contact||'')}</div>`;
        box.appendChild(el);
      });
    });
  }
  loadJobs();
  $("#jobAddBtn").onclick=()=>{ if(gate()) return; if(!(isAdmin || my.role==='employer')) return alert('Лише адмін або роботодавець'); $("#jobNewDlg").showModal(); };
  $("#jobAddBtn2").onclick=()=>{ if(gate()) return; $("#jobNewDlg").showModal(); };
  $("#jobNewForm").addEventListener('close', async ()=>{
    if($("#jobNewForm").returnValue!=='ok') return;
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
      <img class="avatar" src="${v.photoURL||'assets/avatar-default.png}">
      <div style="flex:1">
        <strong><a href="#" data-uid="${uid}" class="openprof">${esc(v.nick||('user-'+uid.slice(0,6)))}</a></strong> ${badge}<br>
        <span class="muted">${esc(v.locale||'')}${v.role?(' · '+esc(v.role)):""}</span> · ${online}
      </div>
      ${isAdmin?'<label><input type="checkbox" data-act="pick"></label>':''}
    </div>`;
    el.querySelector('.openprof').onclick=(ev)=>{ev.preventDefault(); openProfile(uid);};
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
  $("#mSearch").oninput=loadMembers; $("#mFilterLocale").onchange=loadMembers; $("#mFilterPlan").onchange=loadMembers;
  $("#seedBtn").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); const r=await fetch('seed/participants.json'); const arr=await r.json(); for(const u of arr){ await db.ref('usersPublic/'+u.uid).set({nick:u.nick, locale:u.locale, role:'seeker', isBot:u.isBot, ts:firebase.database.ServerValue.TIMESTAMP}); await db.ref('plans/'+u.uid).set({name:u.plan, ts:firebase.database.ServerValue.TIMESTAMP}); await db.ref('status/'+u.uid).set({state:u.status, ts:firebase.database.ServerValue.TIMESTAMP}); } toast('Додано профілі'); loadMembers(); };

  // Profile + DM
  function dialogId(a,b){ return [a,b].sort().join('_'); }
  async function openProfile(uid){
    const snap = await db.ref('usersPublic/'+uid).get(); const v=snap.val()||{};
    $("#profNick").textContent = v.nick || ('user-'+uid.slice(0,6));
    $("#profMeta").textContent = (v.email||'') + (v.locale?(' · '+v.locale):'') + (v.role?(' · '+v.role):'');
    $("#profAvatar").src = v.photoURL || ('assets/avatar-default.png);
    $("#profAboutText").textContent = v.about || '—';
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
      toast('Заявка відправлена');
    };
  }

  // Help
  function loadHelp(){
    db.ref('help/'+currentCity).on('value', s=>{
      const box=$("#helpList"); if(!box) return; box.innerHTML='';
      s.forEach(ch=>{ const v=ch.val(); const el=document.createElement('div'); el.className='card'; el.innerHTML=`<strong>${esc(v.title||'')}</strong><p>${esc(v.text||'')}</p>${v.link?`<a href="${v.link}" target="_blank">Посилання</a>`:''}${v.photoUrl?`<img src="${v.photoUrl}" style="max-width:100%;border-radius:10px">`:''}`; box.appendChild(el); });
    });
  }
  $("#helpAddBtn").onclick=()=>{
    if(!isAdmin) return alert('Лише адмін');
    const dlg=document.createElement('dialog'); dlg.innerHTML=`<form method="dialog" class="card"><h3>Нова картка</h3><input id="helpTitle" placeholder="Заголовок"><input id="helpLink" placeholder="Посилання"><textarea id="helpText" placeholder="Текст…"></textarea><label class="icon-btn">📷<input type="file" id="helpPhoto" accept="image/*" hidden></label><menu><button class="btn" value="cancel">Скасувати</button><button class="btn primary" value="ok">Зберегти</button></menu></form>`; document.body.appendChild(dlg); dlg.showModal(); dlg.addEventListener('close', async ()=>{ if(dlg.returnValue!=='ok') return; const photoUrl = $("#helpPhoto").files[0]? await upFile($("#helpPhoto")):null; await db.ref('help/'+currentCity).push({title:$("#helpTitle").value,text:$("#helpText").value,link:$("#helpLink").value,photoUrl, ts:firebase.database.ServerValue.TIMESTAMP}); toast('Збережено'); dlg.remove(); });
  };

  // Map
  let map=null; let markers={};
  function openMapDlg(){
    setTimeout(()=>{ // ensure dialog painted
      if(!map){
        map = L.map('map').setView([50.0755,14.4378], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
      }
      map.invalidateSize();
      loadPois();
    },100);
  }
  async function loadPois(){
    Object.values(markers).forEach(m=> map && map.removeLayer && map.removeLayer(m));
    markers={};
    const s=await db.ref('map/poi/'+currentCity).get();
    s.forEach(ch=>{ const v=ch.val(); const m=L.marker(v.latlng||[50.0755,14.4378]).addTo(map).bindPopup(`<strong>${esc(v.title||'')}</strong><br>${v.link?`<a href="${v.link}" target="_blank">${esc(v.link)}</a>`:''}${v.photoUrl?`<br><img src="${v.photoUrl}" style="width:140px">`:''}`); markers[ch.key]=m; });
  }
  $("#poiAdd").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); const c=map.getCenter(); const url=await upFile($("#poiPhoto")); await db.ref('map/poi/'+currentCity).push({title:$("#poiTitle").value,link:$("#poiLink").value,latlng:[c.lat,c.lng],photoUrl:url||null,ts:firebase.database.ServerValue.TIMESTAMP}); $("#poiTitle").value=$("#poiLink").value=''; $("#poiPhoto").value=''; loadPois(); toast('Точку додано'); };

  // Admin saves
  $("#saveWallGlobal").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/wallpapers/global').set($("#wallGlobal").value); applyWallpaper(); toast('Готово'); };
  $("#saveWallCity").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/wallpapers/city/'+currentCity).set($("#wallCity").value); applyWallpaper(); toast('Готово'); };
  $("#wallFile").onchange=async()=>{ if(!isAdmin) return alert('Лише адмін'); const url=await upFile($("#wallFile")); await db.ref('settings/wallpapers/city/'+currentCity).set(url); applyWallpaper(); toast('Фон оновлено'); };
  $("#saveMapsKey").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); await db.ref('settings/googleMapsKey').set($("#mapsKey").value); toast('Ключ збережено'); };
  $("#createBot").onclick=async()=>{ if(!isAdmin) return alert('Лише адмін'); const uid='bot_'+Math.random().toString(36).slice(2,8); await db.ref('usersPublic/'+uid).set({nick:$("#botNick").value||('Bot '+uid.slice(-4)), locale:$("#botLocale").value||'cs', role:'seeker', isBot:true, ts:firebase.database.ServerValue.TIMESTAMP}); toast('Бот створений'); };

  // Profile open from brand
  $("#openProfile").onclick=async()=>{
    const u = auth.currentUser;
    if(!u || u.isAnonymous){ $("#regDlg").showModal(); return; }
    openProfile(u.uid);
  };

  // Init
  (async function(){ await ensureAnon(); applyWallpaper(); })();
})();