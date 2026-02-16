// === CHAT ===
let offChat=null;

// === Typing indicator (city chat) ===
let __typingRef=null;
let __typingCb=null;
let __typingMap=null;
let __typingTimer=null;
let __typingCity=null;
let __typingLastSend=0;
let __typingSendTimer=null;
let __typingClearTimer=null;

const TYPING_SHOW_MS = 5000;     // show typers for 5s after their last ping
const TYPING_CLEAR_AFTER_MS = 6500; // remove self typing after inactivity
const TYPING_THROTTLE_MS = 2500; // write at most once per 2.5s

function __typingEl(){ return document.getElementById('chatTyping'); }

async function __renderTyping(){
  const el = __typingEl();
  if(!el) return;
  const map = __typingMap || {};
  const me = (window.auth && auth.currentUser) ? auth.currentUser.uid : null;
  const now = Date.now();

  const active = [];
  for(const uid in map){
    if(!uid || uid === me) continue;
    const v = map[uid];
    const ts = Number((v && (v.ts || v)) || 0);
    if(ts && (now - ts) <= TYPING_SHOW_MS) active.push({uid, ts});
  }
  active.sort((a,b)=>b.ts-a.ts);

  if(!active.length){
    el.style.display = 'none';
    el.textContent = '';
    return;
  }

  const top = active.slice(0, 2);
  const names = [];
  for(const it of top){
    try{
      const u = await getUserLite(it.uid);
      const nick = (u && u.nick ? String(u.nick) : '').trim();
      names.push(nick || 'Кто-то');
    }catch(e){
      names.push('Кто-то');
    }
  }

  let text = '';
  if(active.length === 1){
    text = `${names[0]} пишет…`;
  }else if(active.length === 2){
    text = `${names[0]} и ${names[1]} пишут…`;
  }else{
    text = `${names[0]} и ещё ${active.length-1} пишут…`;
  }

  el.textContent = text;
  el.style.display = 'flex';
}

function __stopTypingWatch(){
  try{ if(__typingRef && __typingCb) __typingRef.off('value', __typingCb); }catch(e){}
  __typingRef=null; __typingCb=null;
  __typingMap=null;
  if(__typingTimer){ try{ clearInterval(__typingTimer); }catch(e){} }
  __typingTimer=null;
  if(__typingSendTimer){ try{ clearTimeout(__typingSendTimer); }catch(e){} }
  __typingSendTimer=null;
  if(__typingClearTimer){ try{ clearTimeout(__typingClearTimer); }catch(e){} }
  __typingClearTimer=null;
  const el = __typingEl();
  if(el){ el.style.display='none'; el.textContent=''; }
}

function __startTypingWatch(city){
  if(!window.db || !city) return;
  __stopTypingWatch();
  __typingCity = city;
  try{
    __typingRef = db.ref('typing/' + city);
    __typingCb = (snap)=>{ __typingMap = snap.val() || {}; __renderTyping(); };
    __typingRef.on('value', __typingCb, ()=>{});
    // periodic cleanup for stale entries
    __typingTimer = setInterval(__renderTyping, 1000);
  }catch(e){}
}

function __clearTypingSelf(){
  const u = (window.auth && auth.currentUser) ? auth.currentUser : null;
  if(!u) return;
  const city = __typingCity || getCity();
  try{ db.ref('typing/' + city + '/' + u.uid).remove(); }catch(e){}
}

function __pingTypingSelf(){
  const u = (window.auth && auth.currentUser) ? auth.currentUser : null;
  if(!u) return;
  const input = document.getElementById('msgText');
  if(!input) return;
  const txt = String(input.value||'');
  if(!txt.trim()){
    // If input is empty – stop typing.
    __clearTypingSelf();
    return;
  }

  const city = getCity();
  const now = Date.now();
  const doSend = ()=>{
    __typingLastSend = now;
    try{ db.ref('typing/' + city + '/' + u.uid).set({ts: now}); }catch(e){}
  };

  if(now - __typingLastSend < TYPING_THROTTLE_MS){
    // throttle
    if(__typingSendTimer){ try{ clearTimeout(__typingSendTimer); }catch(e){} }
    __typingSendTimer = setTimeout(doSend, TYPING_THROTTLE_MS);
  }else{
    doSend();
  }

  // auto clear after inactivity
  if(__typingClearTimer){ try{ clearTimeout(__typingClearTimer); }catch(e){} }
  __typingClearTimer = setTimeout(__clearTypingSelf, TYPING_CLEAR_AFTER_MS);
}
let __CHAT_OLDEST_TS = null;
let __CHAT_LOADING_OLDER = false;
// Faster first paint on mobile, more context on desktop.
// Fast first impression: always load only last 15 messages.
// Older history loads by 15 via "Starší +15".
const CHAT_PAGE_SIZE = 15;
// Keep the "старší +15" UX stable across devices.
const CHAT_OLDER_CHUNK = 15;
let __CHAT_SEEN_IDS = new Set();
async function loadChat(){
  const feed=$('#chatFeed'); if(!feed) return;
  const scrollBtn = $('#chatScrollDown');
  if(scrollBtn && !scrollBtn.dataset.wired){
    scrollBtn.dataset.wired = '1';
    scrollBtn.addEventListener('click', ()=>{
      try{ feed.scrollTop = feed.scrollHeight; }catch(e){}
      try{ scrollBtn.style.display='none'; }catch(e){}
    });
    // Hide the scroll button when the user is back at the bottom
    feed.addEventListener('scroll', ()=>{
      try{
        const nearBottom = (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 30;
        if(nearBottom) scrollBtn.style.display='none';
      }catch(e){}
    }, {passive:true});
  }

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
      // Seed dedupe map from cached DOM (prevents duplicates when child_added fires)
      try{
        __CHAT_SEEN_IDS = new Set();
        feed.querySelectorAll('[data-mid]').forEach(el=>{ try{ if(el?.dataset?.mid) __CHAT_SEEN_IDS.add(String(el.dataset.mid)); }catch(e){} });
      }catch(e){}
      // Keep the UI responsive: scroll to bottom after paint.
      try{ feed.scrollTop = feed.scrollHeight; }catch(e){}
    } else {
      feed.innerHTML='';
      try{ __CHAT_SEEN_IDS = new Set(); }catch(e){}
    }
  }catch(e){
    feed.innerHTML='';
    try{ __CHAT_SEEN_IDS = new Set(); }catch(e){}
  }

  // If there was no cache, we start without an oldest pointer.
  if(!__CHAT_OLDEST_TS) __CHAT_OLDEST_TS = null;
  const stopSeq = __hadCache ? null : startMiniSequence('chatMiniLoad', [
    'Načítáme lintu…',
    'Šifrujeme lintu…',
    'Synchronizuji chat…'
  ], 650);
  const stopSlow = (typeof startSlowHint==='function')
    ? startSlowHint('chatMiniLoad', 'Načítání trvá déle… Klepni pro obnovu', 2000, ()=>{ try{ loadChat(); }catch(e){ try{ location.reload(); }catch(_){} } })
    : null;

  if(offChat){ offChat(); offChat=null; }
  const city=getCity();
  // Typing indicator lives per-city.
  try{ __startTypingWatch(city); }catch(e){}
  const ref=db.ref('messages/'+city).orderByChild('ts').limitToLast(CHAT_PAGE_SIZE);
  // Failsafe: never let chat mini-loader spin forever (even if chat is empty)
  // Do not hide the loader too early: on mobile the first snapshot can take longer.
  // Keep loader visible; just update the text after a few seconds.
  setTimeout(()=>{
    try{
      if(!__chatReadyOnce){
        setMiniLoad('chatMiniLoad','Načítání trvá déle…', true);
      }
    }catch(e){}
  }, 3000);

  // One-time "chat ready" marker: cache rendered HTML and start staged prefetch.
  let __chatReadyOnce = false;
  const __markChatReady = ()=>{
    if(__chatReadyOnce) return;
    __chatReadyOnce = true;
    try{ if(typeof stopSlow==='function'){ stopSlow(); } }catch(e){}
    // Stop chat mini loader once we have any real data
    try{ if(typeof stopSeq==='function'){ stopSeq(); } }catch(e){}
    try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
    try{ hidePreloader(); }catch(e){}
    // Scroll to newest on first open (no cache scenario)
    try{ setTimeout(()=>{ try{ feed.scrollTop = feed.scrollHeight; }catch(e){} }, 160); }catch(e){}
    // Cache current view shortly after paint.
    setTimeout(()=>{
      try{
        // Cache ONLY the newest N messages (so reload is fast and never paints the whole history).
        const msgs = Array.from(feed.querySelectorAll('.msg'));
        const last = msgs.slice(-CHAT_PAGE_SIZE);
        const tmp = document.createElement('div');
        last.forEach(n=>{ try{ tmp.appendChild(n.cloneNode(true)); }catch(e){} });
        const ck = __cacheKey('chat', city);
        // Oldest TS must correspond to what we show on reload (newest N)
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

  // Load older messages ONLY when the user taps the button (15 at a time).
  // This avoids heavy scroll handlers + prevents accidental loads on mobile.
  const olderBtn = $('#chatLoadOlder');
  if(olderBtn){
    olderBtn.style.display = (__CHAT_OLDEST_TS ? '' : 'none');
    olderBtn.onclick = async ()=>{
      if(__CHAT_LOADING_OLDER) return;
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
          .limitToLast(CHAT_OLDER_CHUNK)
          .get();
        const older = olderSnap.val()||{};
        const items = Object.entries(older).map(([k,v])=>({k,v})).sort((a,b)=>(a.v.ts||0)-(b.v.ts||0));
        if(items.length===0){
          toast('Starší zprávy nejsou');
          // no more history → hide the button
          try{ olderBtn.style.display='none'; }catch(e){}
          return;
        }

	        // remember current scroll height to preserve position
	        const prevH = feed.scrollHeight;
	        // IMPORTANT: prepend in reverse order so DOM stays chronological
	        for(let i=items.length-1;i>=0;i--){
	          const it = items[i];
	          const m = it.v||{};
          if(!m || m.deleted) continue;
          if(typeof m.ts==='number') __CHAT_OLDEST_TS = Math.min(__CHAT_OLDEST_TS, m.ts);
          try{ if(__CHAT_SEEN_IDS && __CHAT_SEEN_IDS.has(String(it.k))) continue; }catch(e){ if(feed.querySelector(`[data-mid="${it.k}"]`)) continue; }

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
          d.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(safeImgSrc(normalizeAvatarUrl(u.avatar), window.DEFAULT_AVATAR))}"></div>`+
            `<div class="bubble"><div class="meta"><div class="name">${name}</div><div class="time">${fmtTime(m.ts||m.createdAt||Date.now())}</div></div>`+
            (m.text? `<div class="text">${esc(m.text)}</div>`:'' )+
            (safeImgSrc(m.img||m.photo,'')? `<div class="text"><img src="${esc(safeImgSrc(m.img||m.photo,''))}"></div>`:'')+
            `</div>`;

	          feed.insertBefore(d, feed.firstChild);
          try{ __CHAT_SEEN_IDS && __CHAT_SEEN_IDS.add(String(it.k)); }catch(e){}
        }
        const newH = feed.scrollHeight;
        feed.scrollTop = Math.max(0, newH - prevH);
      }catch(e){
        console.warn(e);
      }finally{
        setMiniLoad('chatMiniLoad','', false);
        try{ stopOlder && stopOlder(); }catch(e){}
        __CHAT_LOADING_OLDER = false;
      }
    };
  }

  // If there are no messages (or permission issues), ensure we hide the mini loader.
  // This avoids a "stuck" loader on empty chats.
  try{
    ref.once('value').then((s)=>{
      setMiniLoad('chatMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
      // Even if the chat is empty, continue boot pipeline (prefetch stages).
      // Establish oldestTs quickly (so the "older +15" button can appear)
      try{
        const v = s.val()||{};
        const tsList = Object.values(v).map(x=>Number(x && x.ts)).filter(Number.isFinite);
        if(tsList.length){
          __CHAT_OLDEST_TS = (__CHAT_OLDEST_TS===null) ? Math.min(...tsList) : Math.min(__CHAT_OLDEST_TS, Math.min(...tsList));
        }
      }catch(e){}
      try{ if(olderBtn) olderBtn.style.display = (__CHAT_OLDEST_TS ? '' : 'none'); }catch(e){}
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
    const wasNearBottom = (()=>{
      try{ return (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 30; }catch(e){ return true; }
    })();
    if(m.deleted){
      // We use "soft delete" now (deleted:true) to avoid query child_removed churn.
      const ex = feed.querySelector(`[data-mid="${snap.key}"]`);
      if(ex) ex.remove();
      try{ __CHAT_SEEN_IDS && __CHAT_SEEN_IDS.delete(String(snap.key)); }catch(e){}
      return;
    }
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
    d.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(safeImgSrc(normalizeAvatarUrl(u.avatar), window.DEFAULT_AVATAR))}"></div>`+
                  `<div class="bubble"><div class="meta"><div class="name">${name}</div><div class="time">${fmtTime(m.ts||m.createdAt||Date.now())}</div></div>`+
                  (m.text? `<div class="text">${esc(m.text)}</div>`:'' )+
                  (safeImgSrc(m.img||m.photo,'')? `<div class="text"><img src="${esc(safeImgSrc(m.img||m.photo,''))}"></div>`:'')+
                  (isAdminUser(auth.currentUser) && m.by ? `<div class="adminActions">
                    <button data-act="del" title="Smazat">🗑</button>
                    <button data-act="ban" title="Ban 12h (chat+DM)">⛔</button>
                    <button data-act="mute" title="Mute 12h (chat)">🔇</button>
                    <button data-act="dmban" title="Zakázat DM 12h">✉️🚫</button>
                  </div>` : '')+
                  `</div>`;
    if(isNew){
      // Insert chronologically by ts (stable after F5; prevents "mixing")
      const newTs = Number(d.dataset.ts || m.ts || m.createdAt || 0);
      let inserted = false;
      try{
        const nodes = Array.from(feed.querySelectorAll('.msg'));
        for(const node of nodes){
          if(!node || node === d) continue;
          const t = Number(node.dataset.ts || 0);
          if(!Number.isFinite(t)) continue;
          if(t > newTs || (t === newTs && String(node.dataset.mid||'') > String(snap.key||''))){
            feed.insertBefore(d, node);
            inserted = true;
            break;
          }
        }
      }catch(e){}
      if(!inserted) feed.appendChild(d);
    }
    try{ __CHAT_SEEN_IDS && __CHAT_SEEN_IDS.add(String(snap.key)); }catch(e){}
    // Admin moderation actions
    if(isAdminUser(auth.currentUser)){
      d.querySelectorAll('.adminActions button').forEach(btn=>{
        btn.addEventListener('click', async (ev)=>{
          ev.stopPropagation();
          const act = btn.dataset.act;
          const id = snap.key;
          try{
            if(act==='del'){
              // Soft delete (deleted:true) – prevents query child_removed churn when we use limitToLast.
              // You can later purge deleted messages with an admin cleanup job.
              await db.ref('messages/'+city+'/'+id).update({ deleted:true, deletedBy: auth.currentUser.uid, deletedTs: Date.now() });
              try{ auditLog && auditLog('chat_soft_delete', String(id), { city, msgBy: m.by }); }catch(e){}
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
              try{ auditLog && auditLog('ban_12h', String(m.by), { city, reason, until }); }catch(e){}
              toast('Ban 12h');
            }
            if(act==='mute'){
              const reason = prompt('Důvod mutu (chat):','') || '';
              const until = Date.now()+12*60*60*1000;
              await db.ref('mutes/'+m.by).set({until, by: auth.currentUser.uid, ts: Date.now(), reason});
              try{ await db.ref('mutesHistory/'+m.by).push({until, by: auth.currentUser.uid, ts: Date.now(), reason, scope:'chat'}); }catch(e){}
              try{ await db.ref('notifications/'+m.by).push({ts: Date.now(), type:'moderation', title:'Mute chat 12h', text: reason, from: auth.currentUser.uid}); }catch(e){}
              try{ auditLog && auditLog('mute_chat_12h', String(m.by), { city, reason, until }); }catch(e){}
              toast('Mute chat 12h');
            }
            if(act==='dmban'){
              const reason = prompt('Důvod zákazu L.S.:','') || '';
              const until = Date.now()+12*60*60*1000;
              await db.ref('dmBans/'+m.by).set({until, by: auth.currentUser.uid, ts: Date.now(), reason});
              try{ await db.ref('dmBansHistory/'+m.by).push({until, by: auth.currentUser.uid, ts: Date.now(), reason, scope:'dm'}); }catch(e){}
              try{ await db.ref('notifications/'+m.by).push({ts: Date.now(), type:'moderation', title:'Zákaz L.S. 12h', text: reason, from: auth.currentUser.uid}); }catch(e){}
              try{ auditLog && auditLog('dm_ban_12h', String(m.by), { reason, until }); }catch(e){}
              toast('Zákaz L.S. 12h');
            }
          }catch(e){ console.error(e); toast('Chyba'); playSound('err'); }
        });
      });
    }
    // Autoscroll policy:
    // - only keep the user pinned to the bottom if they were already at the bottom
    // - otherwise show the ⬇ button (no forced jump)
    if(isNew){
      try{
        if(wasNearBottom){
          feed.scrollTop = feed.scrollHeight;
          if(scrollBtn) scrollBtn.style.display='none';
        }else{
          if(scrollBtn) scrollBtn.style.display='';
        }
      }catch(e){}

      playSound('chat');
      notify('Nová zpráva', (u?.nick||'Uživatel')+': '+(m.text||''));
    }
  };

  const __onChatCancel = (err)=>{
    try{ console.warn('chat listener cancelled', err); }catch(e){}
    try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
    try{ if(typeof stopSeq==='function') stopSeq(); }catch(e){}
    try{ if(typeof stopSlow==='function') stopSlow(); }catch(e){}
    try{ feed.innerHTML = '<div class="mini-hint">Chat nelze načíst ('+(err && err.code ? err.code : 'error')+').</div>'; }catch(e){}
    try{ __markChatReady(); }catch(e){}
  };

  ref.on('child_added', upsert, __onChatCancel);
  ref.on('child_changed', upsert, __onChatCancel);
  // IMPORTANT: do not use query child_removed. When limitToLast(...) slides, it emits removals.
  // We handle moderation deletes via a soft delete (deleted:true), which comes via child_changed.
  offChat=()=>{ ref.off('child_added', upsert); ref.off('child_changed', upsert); };

  }
// (lazy) loadChat is triggered by showView('view-chat')
$('#citySelect')?.addEventListener('change', loadChat);

// Typing indicator: throttle writes to typing/{city}/{uid}
$('#msgText')?.addEventListener('input', ()=>{ try{ __pingTypingSelf(); }catch(e){} });
$('#msgText')?.addEventListener('blur', ()=>{ try{ __clearTypingSelf(); }catch(e){} });

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
    const ban=await db.ref('bans/'+u.uid).get();
    if(ban.exists() && ban.val().until > Date.now()) return alert('Dočasný zákaz odesílání (ban)');
    const mute=await db.ref('mutes/'+u.uid).get();
    if(mute.exists() && mute.val().until > Date.now()) return alert('Dočasný zákaz psaní do chatu (mute)');
    const text=$('#msgText').value.trim();
    const img=pendingChatImg;
    if(!text && !img) return;
    const m={by:u.uid, ts:Date.now(), text: text||null, img: img||null};
    await db.ref('messages/'+getCity()).push(m);
    try{ __clearTypingSelf(); }catch(e){}
    // lightweight analytics (admin-only visible)
    try{ window.MK_stats_inc && MK_stats_inc('chatCount', 1); }catch(e){}
    // cleanup
    try{ __clearTypingSelf(); }catch(e){}
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

// Tab lifecycle support: detach heavy listeners when leaving Chat view
window.__chatUnsub = function(){
  try{ if(offChat){ offChat(); offChat=null; } }catch(e){}
  try{ __clearTypingSelf(); }catch(e){}
  try{ __stopTypingWatch(); }catch(e){}
};

