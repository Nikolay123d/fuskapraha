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
  try{ if(offChat){ offChat(); offChat=null; } }catch(e){}

  const city = (function(){
    const cs = $('#citySelect');
    const v = cs && cs.value ? String(cs.value) : String(window.__activeCity||'praha');
    return v.toLowerCase();
  })();
  window.__activeCity = city;

  const feed = $('chatFeed');
  const scrollBtn = $('chatScrollBottom');
  const olderBtn = $('chatLoadOlder');
  if(scrollBtn) scrollBtn.style.display='none';
  if(feed) feed.innerHTML='';

  __CHAT_SEEN_IDS = new Set();
  __CHAT_OLDEST_TS = null;
  __CHAT_LOADING_OLDER = false;

  // Mini-loader (keeps UI calm until we have the first full batch)
  const stopSeq = setMiniLoad('chatMiniLoad', true, 'Načítám chat…');
  const stopSlow = setMiniLoad('chatMiniLoad', [
    'Načítám zprávy…',
    'Připravuji chat…',
    'Téměř hotovo…'
  ], 650);

  const cacheKey = 'mk_chat_cache_'+city;
  let hadCache = false;
  let lastTs = 0;

  // Helpers
  const smoothScrollToBottom = (el, ms=650)=> new Promise((resolve)=>{
    try{
      const start = el.scrollTop;
      const target = Math.max(0, el.scrollHeight - el.clientHeight);
      const diff = target - start;
      if(Math.abs(diff) < 2){ el.scrollTop = target; return resolve(); }
      const t0 = performance.now();
      const ease = (p)=> p<0.5 ? 2*p*p : 1 - Math.pow(-2*p+2,2)/2;
      const step = (t)=>{
        const p = Math.min(1, (t - t0)/ms);
        el.scrollTop = start + diff * ease(p);
        if(p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    }catch(e){ resolve(); }
  });

  // Render function (re-uses resolveMsgUser for avatar/nick)
  const renderOne = async (id, m)=>{
    if(!m || m.deleted) return null;
    const d = document.createElement('div');
    d.className='msg';
    d.dataset.mid = id;
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
      (isAdminUser(auth.currentUser) && m.by ? `<div class="adminActions">
        <button data-act="del" title="Smazat">🗑</button>
        <button data-act="ban" title="Ban 12h (chat+DM)">⛔</button>
        <button data-act="mute" title="Mute 12h (chat)">🔇</button>
        <button data-act="dmban" title="Zakázat DM 12h">✉️🚫</button>
      </div>` : '')+
      `</div>`;

    // Admin moderation actions
    if(isAdminUser(auth.currentUser)){
      d.querySelectorAll('.adminActions button').forEach(btn=>{
        btn.addEventListener('click', async (ev)=>{
          ev.stopPropagation();
          const act = btn.dataset.act;
          try{
            if(act==='del'){
              await db.ref('messages/'+city+'/'+id).update({ deleted:true, deletedBy: auth.currentUser.uid, deletedTs: Date.now() });
              try{ auditLog && auditLog('chat_soft_delete', String(id), { city, msgBy: m.by }); }catch(e){}
              toast('Smazáno');
            }
            if(act==='ban'){
              const reason = prompt('Důvod banu (vidí uživatel):','') || '';
              const until = Date.now()+12*60*60*1000;
              await db.ref('bans/'+m.by).set({until, by: auth.currentUser.uid, ts: Date.now(), reason});
              try{ await db.ref('bansHistory/'+m.by).push({until, by: auth.currentUser.uid, ts: Date.now(), reason, scope:'all'}); }catch(e){}
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

    return d;
  };

  // 1) Try cache first (instant paint)
  try{
    const cached = JSON.parse(localStorage.getItem(cacheKey)||'null');
    if(cached && Array.isArray(cached.items) && cached.items.length){
      const frag = document.createDocumentFragment();
      for(const it of cached.items){
        const m = it.v||it;
        const id = it.k||it.id||it.mid;
        if(!id || !m) continue;
        if(m.deleted) continue;
        const el = await renderOne(String(id), m);
        if(!el) continue;
        frag.appendChild(el);
        __CHAT_SEEN_IDS.add(String(id));
        if(typeof m.ts==='number'){
          __CHAT_OLDEST_TS = (__CHAT_OLDEST_TS===null) ? m.ts : Math.min(__CHAT_OLDEST_TS, m.ts);
          lastTs = Math.max(lastTs, m.ts);
        }
      }
      feed.appendChild(frag);
      hadCache = true;
      setMiniLoad('chatMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
      try{ stopSlow && stopSlow(); }catch(e){}
      __markChatReady();
      try{ feed.scrollTop = feed.scrollHeight; }catch(e){}
    }
  }catch(e){}

  // 2) If no cache, fetch ONE batch (15) and render in one go, then smooth-scroll.
  if(!hadCache){
    try{
      const q = db.ref('messages/'+city).orderByChild('ts').limitToLast(CHAT_PAGE_SIZE);
      const snap = await q.get();
      const items = [];
      snap.forEach(ch=>{
        const m = ch.val()||{};
        items.push({ id: ch.key, m });
      });
      items.sort((a,b)=> (Number(a.m.ts||0) - Number(b.m.ts||0)) || String(a.id).localeCompare(String(b.id)) );

      // Prefetch userLite for avatars/nicks (speed)
      try{
        const uids = Array.from(new Set(items.map(x=>x.m && x.m.by).filter(Boolean)));
        uids.slice(0, 18).forEach(uid=>{ try{ getUserLite(uid); }catch(e){} });
      }catch(e){}

      const frag = document.createDocumentFragment();
      for(const it of items){
        if(!it || !it.id) continue;
        const m = it.m||{};
        if(m.deleted) continue;
        const el = await renderOne(String(it.id), m);
        if(!el) continue;
        frag.appendChild(el);
        __CHAT_SEEN_IDS.add(String(it.id));
        if(typeof m.ts==='number'){
          __CHAT_OLDEST_TS = (__CHAT_OLDEST_TS===null) ? m.ts : Math.min(__CHAT_OLDEST_TS, m.ts);
          lastTs = Math.max(lastTs, m.ts);
        }
      }

      // Paint
      feed.appendChild(frag);

      // Cache
      try{
        const store = items.slice(-CHAT_PAGE_SIZE).map(x=>({k:x.id,v:x.m}));
        localStorage.setItem(cacheKey, JSON.stringify({ts:Date.now(), items: store}));
      }catch(e){}

      // Hide loader only after the batch is ready
      setMiniLoad('chatMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
      try{ stopSlow && stopSlow(); }catch(e){}

      // Smooth scroll to bottom (medium speed, no jitter)
      try{ feed.scrollTop = 0; }catch(e){}
      await smoothScrollToBottom(feed, 700);

      if(items.length===0){
        const empty = document.createElement('div');
        empty.className='muted';
        empty.style.padding='10px 12px';
        empty.textContent='Zatím žádné zprávy.';
        feed.appendChild(empty);
      }

      __markChatReady();
    }catch(e){
      console.warn('chat initial batch failed', e);
      setMiniLoad('chatMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
      try{ stopSlow && stopSlow(); }catch(e){}
      __markChatReady();
      try{ feed.innerHTML = '<div class="mini-hint">Chat nelze načíst ('+(e && e.code ? e.code : 'error')+').</div>'; }catch(_e){}
    }
  }

  // older button visibility
  try{ if(olderBtn) olderBtn.style.display = (__CHAT_OLDEST_TS ? '' : 'none'); }catch(e){}

  // Live listeners (after initial batch)
  const baseRef = db.ref('messages/'+city).orderByChild('ts');
  const liveAddRef = (lastTs && Number.isFinite(lastTs)) ? baseRef.startAt(lastTs + 1) : baseRef.limitToLast(CHAT_PAGE_SIZE);
  const liveChgRef = (__CHAT_OLDEST_TS && Number.isFinite(__CHAT_OLDEST_TS)) ? baseRef.startAt(__CHAT_OLDEST_TS) : baseRef;

  const upsert = async (snap)=>{
    const m = snap.val()||{};
    if(!m) return;
    if(m.deleted){
      const ex = feed.querySelector(`[data-mid="${snap.key}"]`);
      if(ex) ex.remove();
      try{ __CHAT_SEEN_IDS && __CHAT_SEEN_IDS.delete(String(snap.key)); }catch(e){}
      return;
    }

    if(typeof m.ts==='number'){
      __CHAT_OLDEST_TS = (__CHAT_OLDEST_TS===null) ? m.ts : Math.min(__CHAT_OLDEST_TS, m.ts);
      lastTs = Math.max(lastTs, m.ts);
    }

    // If already rendered: update content only
    let d = feed.querySelector(`[data-mid="${snap.key}"]`);
    const isNew = !d;

    // do not re-render duplicates from the live query
    if(isNew){
      try{ if(__CHAT_SEEN_IDS && __CHAT_SEEN_IDS.has(String(snap.key))) return; }catch(e){}
    }

    const wasNearBottom = (()=>{
      try{ return (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 30; }catch(e){ return true; }
    })();

    const el = await renderOne(String(snap.key), m);
    if(!el) return;

    if(!d){
      d = el;
      // Insert chronologically by ts
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
      try{ __CHAT_SEEN_IDS && __CHAT_SEEN_IDS.add(String(snap.key)); }catch(e){}

      // Autoscroll policy
      try{
        if(wasNearBottom){
          feed.scrollTop = feed.scrollHeight;
          if(scrollBtn) scrollBtn.style.display='none';
        }else{
          if(scrollBtn) scrollBtn.style.display='';
        }
      }catch(e){}

      playSound('chat');
      try{ notify('Nová zpráva', (m.text||'').slice(0,120)); }catch(e){}
    }else{
      // Update
      d.replaceWith(el);
    }

    try{ if(olderBtn) olderBtn.style.display = (__CHAT_OLDEST_TS ? '' : 'none'); }catch(e){}
  };

  const __onChatCancel = (err)=>{
    try{ console.warn('chat listener cancelled', err); }catch(e){}
    try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
    try{ stopSeq && stopSeq(); }catch(e){}
    try{ stopSlow && stopSlow(); }catch(e){}
    try{ feed.innerHTML = '<div class="mini-hint">Chat nelze načíst ('+(err && err.code ? err.code : 'error')+').</div>'; }catch(e){}
  };

  liveAddRef.on('child_added', upsert, __onChatCancel);
  liveChgRef.on('child_changed', upsert, __onChatCancel);

  offChat = ()=>{
    try{ liveAddRef.off('child_added', upsert); }catch(e){}
    try{ liveChgRef.off('child_changed', upsert); }catch(e){}
  };

  // Older +15 loader
  if(olderBtn){
    olderBtn.onclick = async ()=>{
      if(__CHAT_LOADING_OLDER) return;
      if(!__CHAT_OLDEST_TS){ toast('Starší zprávy nejsou'); olderBtn.style.display='none'; return; }
      __CHAT_LOADING_OLDER = true;
      const stopOlder = setMiniLoad('chatMiniLoad', true, 'Načítám starší…');
      try{
        const olderSnap = await db.ref('messages/'+city)
          .orderByChild('ts')
          .endAt(__CHAT_OLDEST_TS - 1)
          .limitToLast(CHAT_OLDER_CHUNK)
          .get();
        const older = olderSnap.val()||{};
        const items = Object.entries(older).map(([k,v])=>({k,v})).sort((a,b)=>(a.v.ts||0)-(b.v.ts||0));
        if(items.length===0){ toast('Starší zprávy nejsou'); olderBtn.style.display='none'; return; }

        const prevH = feed.scrollHeight;
        for(let i=items.length-1;i>=0;i--){
          const it = items[i];
          const m = it.v||{};
          if(!m || m.deleted) continue;
          if(__CHAT_SEEN_IDS && __CHAT_SEEN_IDS.has(String(it.k))) continue;
          const el = await renderOne(String(it.k), m);
          if(!el) continue;
          feed.insertBefore(el, feed.firstChild);
          __CHAT_SEEN_IDS.add(String(it.k));
          if(typeof m.ts==='number') __CHAT_OLDEST_TS = Math.min(__CHAT_OLDEST_TS, m.ts);
        }
        const newH = feed.scrollHeight;
        feed.scrollTop = Math.max(0, newH - prevH);
      }catch(e){ console.warn(e); }
      finally{
        setMiniLoad('chatMiniLoad','', false);
        try{ stopOlder && stopOlder(); }catch(e){}
        __CHAT_LOADING_OLDER = false;
        try{ if(olderBtn) olderBtn.style.display = (__CHAT_OLDEST_TS ? '' : 'none'); }catch(e){}
      }
    };
  }
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
    // Mark that user has participated in chat (used for UI hints like "people strip")
    try{ window.__CHAT_USER_SENT_ONCE = true; localStorage.setItem('mk_chat_sent_once','1'); }catch(e){}
    try{ window.maybeShowChatPeopleStrip && window.maybeShowChatPeopleStrip(); }catch(e){}
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


// Emoji picker (chat)
(function initChatEmojiPicker(){
  try{
    const btn = $('chatEmojiBtn');
    const panel = $('chatEmojiPanel');
    const input = $('msgText');
    if(!btn || !panel || !input) return;

    const EMOJIS = [
      '😀','😁','😂','🤣','😊','😍','😘','😎','🤗','😇','😉','😅',
      '👍','👎','🙏','🤝','💪','🔥','❤️','💙','💚','💛','💜','🖤',
      '🎉','✨','⚡','✅','❌','📍','📌','💼','📢','💬','👀','🕒'
    ];

    panel.innerHTML = EMOJIS.map(e=>`<button type="button" class="emoji" data-e="${e}">${e}</button>`).join('');

    function insertAtCursor(el, txt){
      try{
        const v = String(el.value||'');
        const s = (typeof el.selectionStart==='number') ? el.selectionStart : v.length;
        const e = (typeof el.selectionEnd==='number') ? el.selectionEnd : v.length;
        el.value = v.slice(0,s) + txt + v.slice(e);
        const p = s + txt.length;
        try{ el.selectionStart = el.selectionEnd = p; }catch(_e){}
        el.dispatchEvent(new Event('input', {bubbles:true}));
      }catch(_e){}
    }

    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      panel.classList.toggle('open');
    });

    panel.addEventListener('click', (ev)=>{
      const b = ev.target && ev.target.closest ? ev.target.closest('button[data-e]') : null;
      if(!b) return;
      insertAtCursor(input, b.dataset.e || '');
      panel.classList.remove('open');
      try{ input.focus(); }catch(e){}
    });

    document.addEventListener('click', (ev)=>{
      if(panel.classList.contains('open')){
        if(ev.target !== btn && !panel.contains(ev.target)) panel.classList.remove('open');
      }
    });

  }catch(e){}
})();

// Chat: show small "people strip" above composer after user sends at least one message
window.maybeShowChatPeopleStrip = async function maybeShowChatPeopleStrip(){
  try{
    const me = auth && auth.currentUser;
    if(!me) return;

    // Only after user has sent at least one message (per device)
    let sentOnce = false;
    try{ sentOnce = !!window.__CHAT_USER_SENT_ONCE || localStorage.getItem('mk_chat_sent_once')==='1'; }catch(e){}
    if(!sentOnce) return;

    // Respect manual close
    try{ if(localStorage.getItem('mk_people_strip_closed')==='1') return; }catch(e){}
    if(window.__CHAT_PEOPLE_STRIP_SHOWN) return;

    const strip = $('chatPeopleStrip');
    const inner = $('chatPeopleInner');
    const close = $('chatPeopleClose');
    const feed  = $('chatFeed');
    if(!strip || !inner || !feed) return;

    window.__CHAT_PEOPLE_STRIP_SHOWN = true;

    if(close){
      close.onclick = ()=>{
        try{ strip.style.display='none'; }catch(e){}
        try{ localStorage.setItem('mk_people_strip_closed','1'); }catch(e){}
      };
    }

    // Collect up to 8 recent unique users from visible messages (excluding me)
    const uids = [];
    try{
      const nodes = Array.from(feed.querySelectorAll('.msg .nick[data-uid]'));
      for(let i=nodes.length-1;i>=0;i--){
        const uid = nodes[i] && nodes[i].dataset ? nodes[i].dataset.uid : null;
        if(!uid || uid===me.uid) continue;
        if(!uids.includes(uid)) uids.push(uid);
        if(uids.length>=8) break;
      }
    }catch(e){}

    if(uids.length===0) return;

    strip.style.display='flex';
    inner.innerHTML = '';

    for(const uid of uids){
      try{
        const u = await getUserLite(uid);
        let online = false;
        try{ const p = await db.ref('presence/'+uid).get(); online = !!(p.val() && p.val().online); }catch(e){}

        const chip = document.createElement('div');
        chip.className = 'people-chip';
        chip.innerHTML = `<img src="${esc(safeImgSrc(normalizeAvatarUrl(u.avatar), window.DEFAULT_AVATAR))}">`+
          `<span>${esc(u.nick||u.name||'Uživatel')}</span>` + (online?'<span class="online"></span>':'');
        inner.appendChild(chip);
      }catch(e){}
    }

    // Auto-hide after 60s
    setTimeout(()=>{
      try{ strip.style.display='none'; }catch(e){}
    }, 60000);

  }catch(e){}
};
