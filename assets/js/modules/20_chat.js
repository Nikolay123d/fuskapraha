// === CHAT ===
let offChat=null;
let __CHAT_OLDEST_TS = null;
let __CHAT_LOADING_OLDER = false;
async function loadChat(){
  const feed=$('#chatFeed'); if(!feed) return;

  let __hadCache = false;

  // Instant paint from cache (so user never sees an empty chat).
  const __cityForCache = getCity();
  try{
    const ck = __cacheKey('chat', __cityForCache);
    const cached = __cacheGet(ck, 12*60*60*1000); // 12 hours
    if(cached && cached.val && typeof cached.val.html === 'string' && cached.val.html.trim().length){
      feed.innerHTML = cached.val.html;
      __hadCache = true;
      __CHAT_OLDEST_TS = cached.val.oldestTs || null;
      // Keep the UI responsive: scroll to bottom after paint.
      try{ feed.scrollTop = feed.scrollHeight; }catch(e){}
    } else {
      feed.innerHTML='';
    }
  }catch(e){
    feed.innerHTML='';
  }

  // If there was no cache, we start without an oldest pointer.
  if(!__CHAT_OLDEST_TS) __CHAT_OLDEST_TS = null;
  const stopSeq = __hadCache ? null : startMiniSequence('chatMiniLoad', [
    'Načítáme lintu…',
    'Šifrujeme lintu…',
    'Synchronizuji chat…'
  ], 650);
  if(offChat){ offChat(); offChat=null; }
  const city=getCity();
  const ref=db.ref('messages/'+city).limitToLast(20);
  // Failsafe: never let chat mini-loader spin forever (even if chat is empty)
  setTimeout(()=>{ try{ if(typeof stopSeq==='function'){ stopSeq(); } }catch(e){} try{ setMiniLoad('chatMiniLoad','', false); }catch(e){} }, 2500);

  // One-time "chat ready" marker: cache rendered HTML and start staged prefetch.
  let __chatReadyOnce = false;
  const __markChatReady = ()=>{
    if(__chatReadyOnce) return;
    __chatReadyOnce = true;
    // Stop chat mini loader once we have any real data
    try{ if(typeof stopSeq==='function'){ stopSeq(); } }catch(e){}
    try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
    try{ hidePreloader(); }catch(e){}
    // Cache current view shortly after paint.
    setTimeout(()=>{
      try{
        // Cache ONLY the newest 20 messages (so reload is fast and never paints the whole history).
        const msgs = Array.from(feed.querySelectorAll('.msg'));
        const last = msgs.slice(-20);
        const tmp = document.createElement('div');
        last.forEach(n=>{ try{ tmp.appendChild(n.cloneNode(true)); }catch(e){} });
        const ck = __cacheKey('chat', city);
        // Oldest TS must correspond to what we show on reload (newest 20)
        let oldestTs = null;
        try{
          const tsEls = last.map(n=>Number(n.getAttribute('data-ts')||n.dataset.ts||n.dataset.time||'')).filter(Number.isFinite);
          if(tsEls.length) oldestTs = Math.min(...tsEls);
        }catch(e){}
        __cacheSet(ck, { html: tmp.innerHTML||'', oldestTs: (oldestTs || __CHAT_OLDEST_TS || null) });
      }catch(e){}
    }, 800);
    // Background staged prefetch (DM -> friends -> members -> map)
    try{ __startPrefetchStages(); }catch(e){}
  };

  // Load older messages by 20 when user scrolls to the very top.
  // This keeps initial render fast (only last 20) and allows history on demand.
  feed.onscroll = async ()=>{
    if(__CHAT_LOADING_OLDER) return;
    if(feed.scrollTop > 10) return;
    if(!__CHAT_OLDEST_TS) return;
    __CHAT_LOADING_OLDER = true;
    const stopOlder = startMiniSequence('chatMiniLoad', [
      'Načítám starší zprávy…',
      'Dešifruji historii…',
      'Synchronizace…'
    ], 650);
    try{
      const olderSnap = await db.ref('messages/'+city)
        .orderByChild('ts')
        .endBefore(__CHAT_OLDEST_TS)
        .limitToLast(20)
        .get();
      const older = olderSnap.val()||{};
      const items = Object.entries(older).map(([k,v])=>({k,v})).sort((a,b)=>(a.v.ts||0)-(b.v.ts||0));
      if(items.length===0){
        toast('Starší zprávy nejsou');
      }
      // remember current scroll height to preserve position
      const prevH = feed.scrollHeight;
      for(const it of items){
        // render via a small helper that mimics upsert for older items
        const m = it.v||{};
        if(!m || m.deleted) continue;
        if(typeof m.ts==='number') __CHAT_OLDEST_TS = Math.min(__CHAT_OLDEST_TS, m.ts);
        if(feed.querySelector(`[data-mid="${it.k}"]`)) continue;
        const d=document.createElement('div');
        d.className='msg';
        d.dataset.mid = it.k;
        try{ d.dataset.ts = String(m.ts||m.createdAt||Date.now()); }catch(e){}
        const u = await resolveMsgUser(m);
        const planVal = String(u.plan||'').toLowerCase();
        const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
        const isAdm = (isAdminUser(auth.currentUser) && auth.currentUser && m.by === auth.currentUser.uid);
        const badges = (isAdm?'<span class="badge admin">ADMIN</span>':'') + (isPrem?'<span class="badge premium">PREMIUM</span>':'');
        const name = `<span class="nick" data-uid="${esc(m.by)}">${esc(u?.nick||u?.name||'Uživatel')}</span>`+badges+(u?.online?'<span class="online"></span>':'');
        d.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
          `<div class="bubble"><div class="meta"><div class="name">${name}</div><div class="time">${fmtTime(m.ts||m.createdAt||Date.now())}</div></div>`+
          (m.text? `<div class="text">${esc(m.text)}</div>`:'' )+
          (m.img||m.photo? `<div class="text"><img src="${esc(m.img||m.photo)}"></div>`:'')+
          `</div>`;
        feed.insertBefore(d, feed.firstChild);
      }
      const newH = feed.scrollHeight;
      feed.scrollTop = newH - prevH;
    }catch(e){
      console.warn(e);
    }finally{
      setMiniLoad('chatMiniLoad','', false);
      try{ stopOlder && stopOlder(); }catch(e){}
      __CHAT_LOADING_OLDER = false;
    }
  };

  // If there are no messages (or permission issues), ensure we hide the mini loader.
  // This avoids a "stuck" loader on empty chats.
  try{
    ref.once('value').then((s)=>{
      setMiniLoad('chatMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
      // Even if the chat is empty, continue boot pipeline (prefetch stages).
      __markChatReady();
      if(!s.exists()){
        const empty = document.createElement('div');
        empty.className='muted';
        empty.style.padding='10px 12px';
        empty.textContent='Zatím žádné zprávy.';
        feed.appendChild(empty);
      }
      __markChatReady();
    }).catch(()=>{
      setMiniLoad('chatMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
      __markChatReady();
    });
  }catch(e){}
  const upsert=async (snap)=>{
    setMiniLoad('chatMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){}
    __markChatReady();
    const m=snap.val()||{};
    if(m.deleted) return;
    if(typeof m.ts==='number'){
      __CHAT_OLDEST_TS = (__CHAT_OLDEST_TS===null) ? m.ts : Math.min(__CHAT_OLDEST_TS, m.ts);
    }
    // If message already rendered (child_changed), replace content
    let d = feed.querySelector(`[data-mid="${snap.key}"]`);
    const isNew = !d;
    if(!d){ d=document.createElement('div'); d.className='msg'; d.dataset.mid = snap.key;
    try{ d.dataset.ts = String(m.ts||m.createdAt||Date.now()); }catch(e){} }
    const u = await resolveMsgUser(m);
    const planVal = String(u.plan||'').toLowerCase();
    const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
    const isAdm = (isAdminUser(auth.currentUser) && auth.currentUser && m.by === auth.currentUser.uid);
    const badges = (isAdm?'<span class="badge admin">ADMIN</span>':'') + (isPrem?'<span class="badge premium">PREMIUM</span>':'');
    const name = `<span class="nick" data-uid="${esc(m.by)}">${esc(u?.nick||u?.name||'Uživatel')}</span>`+
                 badges +
                 (u?.online?'<span class="online"></span>':'');
    d.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
                  `<div class="bubble"><div class="meta"><div class="name">${name}</div><div class="time">${fmtTime(m.ts||m.createdAt||Date.now())}</div></div>`+
                  (m.text? `<div class="text">${esc(m.text)}</div>`:'' )+
                  (m.img||m.photo? `<div class="text"><img src="${esc(m.img||m.photo)}"></div>`:'')+
                  (isAdminUser(auth.currentUser) && m.by ? `<div class="adminActions">
                    <button data-act="del" title="Smazat">🗑</button>
                    <button data-act="ban" title="Ban 12h (chat+DM)">⛔</button>
                    <button data-act="mute" title="Mute 12h (chat)">🔇</button>
                    <button data-act="dmban" title="Zakázat DM 12h">✉️🚫</button>
                  </div>` : '')+
                  `</div>`;
    if(isNew) feed.appendChild(d);
    // Admin moderation actions
    if(isAdminUser(auth.currentUser)){
      d.querySelectorAll('.adminActions button').forEach(btn=>{
        btn.addEventListener('click', async (ev)=>{
          ev.stopPropagation();
          const act = btn.dataset.act;
          const id = snap.key;
          try{
            if(act==='del'){
              await db.ref('messages/'+city+'/'+id).remove();
              toast('Smazáno');
            }
            if(act==='ban'){
              const reason = prompt('Důvod banu (vidí uživatel):','') || '';
              const until = Date.now()+12*60*60*1000;
              await db.ref('bans/'+m.by).set({until, by: auth.currentUser.uid, ts: Date.now(), reason});
              // history
              try{ await db.ref('bansHistory/'+m.by).push({until, by: auth.currentUser.uid, ts: Date.now(), reason, scope:'all'}); }catch(e){}
              // notify user
              try{ await db.ref('notifications/'+m.by).push({ts: Date.now(), type:'moderation', title:'Ban 12h', text: reason, from: auth.currentUser.uid}); }catch(e){}
              toast('Ban 12h');
            }
            if(act==='mute'){
              const reason = prompt('Důvod mutu (chat):','') || '';
              const until = Date.now()+12*60*60*1000;
              await db.ref('mutes/'+m.by).set({until, by: auth.currentUser.uid, ts: Date.now(), reason});
              try{ await db.ref('mutesHistory/'+m.by).push({until, by: auth.currentUser.uid, ts: Date.now(), reason, scope:'chat'}); }catch(e){}
              try{ await db.ref('notifications/'+m.by).push({ts: Date.now(), type:'moderation', title:'Mute chat 12h', text: reason, from: auth.currentUser.uid}); }catch(e){}
              toast('Mute chat 12h');
            }
            if(act==='dmban'){
              const reason = prompt('Důvod zákazu L.S.:','') || '';
              const until = Date.now()+12*60*60*1000;
              await db.ref('dmBans/'+m.by).set({until, by: auth.currentUser.uid, ts: Date.now(), reason});
              try{ await db.ref('dmBansHistory/'+m.by).push({until, by: auth.currentUser.uid, ts: Date.now(), reason, scope:'dm'}); }catch(e){}
              try{ await db.ref('notifications/'+m.by).push({ts: Date.now(), type:'moderation', title:'Zákaz L.S. 12h', text: reason, from: auth.currentUser.uid}); }catch(e){}
              toast('Zákaz L.S. 12h');
            }
          }catch(e){ console.error(e); toast('Chyba'); playSound('err'); }
        });
      });
    }
    if(isNew){
      playSound('chat');
      notify('Nová zpráva', (u?.nick||'Uživatel')+': '+(m.text||''));
    }
  };

  const onRemove = (snap)=>{
    const el = feed.querySelector(`[data-mid="${snap.key}"]`);
    if(el) el.remove();
  };

  ref.on('child_added', upsert);
  ref.on('child_changed', upsert);
  ref.on('child_removed', onRemove);
  offChat=()=>{ ref.off('child_added', upsert); ref.off('child_changed', upsert); ref.off('child_removed', onRemove); };

  }
// (lazy) loadChat is triggered by showView('view-chat')
$('#citySelect')?.addEventListener('change', loadChat);

let pendingChatImg=null;
$('#msgPhoto')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  if(!f){ pendingChatImg=null; return; }
  pendingChatImg = await fileToDataURL(f);
  toast('Foto přidáno. Stiskněte Odeslat.');
  playSound('ok');
});
$('#sendBtn')?.addEventListener('click', async ()=>{
  try{
    const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
    // moderation gates (SSoT via MK_ACCESS watchers)
    try{
      const g = window.MK_ACCESS?.canChat?.();
      if(g && g.ok===false){ alert(window.MK_ACCESS.explainBlock(g)); return; }
    }catch(e){}
    const text=$('#msgText').value.trim();
    const img=pendingChatImg;
    if(!text && !img) return;
    const m={by:u.uid, ts:Date.now(), text: text||null, img: img||null};
    await db.ref('messages/'+getCity()).push(m);
    // cleanup
    $('#msgText').value='';
    $('#msgPhoto').value='';
    pendingChatImg=null;
    playSound('ok');
    toast('Odesláno');
  }catch(e){
    console.error(e);
    playSound('err');
  }
});

