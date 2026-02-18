// === DM (strict members) ===
function dmKey(a,b){ return [a,b].sort().join('_'); }
async function resolveUidByEmail(email){
  return null;
}

// --- DM globals (must be top-level, used by multiple handlers) ---
// --- DM state (single source of truth for reload restore) ---
// mk_dm_mode: 'list' | 'thread'
// mk_dm_peer: peer uid when mode === 'thread'
function setDmState(mode, peer){
  // Single Source of Truth: MK.state (with localStorage fallback)
  try{
    if(window.MK && window.MK.persist && window.MK.persist.dmState){
      window.MK.persist.dmState(mode, peer);
      return;
    }
  }catch(e){}

  // Fallback (legacy)
  try{ localStorage.setItem('mk_dm_mode', String(mode||'list')); }catch(e){}
  try{
    if(peer){ localStorage.setItem('mk_dm_peer', String(peer)); }
    else { localStorage.removeItem('mk_dm_peer'); }
  }catch(e){}


  // Leaving thread should never keep old text/photo/selected plan (mobile keyboards hate this)
  try{
    const m = String(mode||'list');
    if(m !== 'thread'){
      try{ const t = document.getElementById('dmText'); if(t) t.value=''; }catch(e){}
      try{ clearPendingDmImg(); }catch(e){}
      try{ clearPremiumSelection(); }catch(e){}
    }
  }catch(e){}

}
function getDmState(){
  // Prefer MK.state (Single Source of Truth)
  try{
    if(window.MK && window.MK.state && window.MK.state.dm){
      const dm = window.MK.state.dm;
      const mode = (dm.mode==='thread') ? 'thread' : 'list';
      const peer = String(dm.peer||'').trim();
      return { mode, peer };
    }
  }catch(e){}

  // Fallback (legacy)
  try{
    const mode = (localStorage.getItem('mk_dm_mode')||'list').trim() || 'list';
    const peer = (localStorage.getItem('mk_dm_peer')||'').trim();
    return { mode: (mode==='thread'?'thread':'list'), peer };
  }catch(e){
    return { mode:'list', peer:'' };
  }
}

// Previously these were accidentally scoped inside loadDmThreads(), which broke
// DM opening from chat and sending (buttons saw undefined room/peer).
let currentDmRoom = null;
let currentDmPeerUid = null;

// === Read receipts (dmRead/{room}/{uid}) ===
let __dmReadPeerRef = null;
let __dmReadPeerCb = null;
let __dmPeerReadTs = 0;
let __dmLastOutTs = 0;

function __dmReadHintEl(){ return document.getElementById('dmReadHint'); }

function __stopDmReadWatch(){
  try{ if(__dmReadPeerRef && __dmReadPeerCb) __dmReadPeerRef.off('value', __dmReadPeerCb); }catch(e){}
  __dmReadPeerRef = null;
  __dmReadPeerCb = null;
  __dmPeerReadTs = 0;
  __dmLastOutTs = 0;
  try{ const el = __dmReadHintEl(); if(el){ el.style.display='none'; el.textContent=''; } }catch(e){}
}

function __updateDmReadHint(){
  const el = __dmReadHintEl();
  if(!el) return;
  const room = currentDmRoom;
  const peer = currentDmPeerUid;
  const me = auth?.currentUser;
  if(!room || !peer || !me){ el.style.display='none'; el.textContent=''; return; }
  if(isPremiumBotRoom && isPremiumBotRoom(room)){ el.style.display='none'; el.textContent=''; return; }
  if(!__dmLastOutTs){ el.style.display='none'; el.textContent=''; return; }
  const read = (__dmPeerReadTs && __dmPeerReadTs >= __dmLastOutTs);
  el.textContent = read ? '✅ Прочитано' : '⌛ Не прочитано';
  el.style.display = 'block';
}

function __startDmReadWatch(room, peerUid){
  __stopDmReadWatch();
  if(!room || !peerUid) return;
  try{
    __dmReadPeerRef = db.ref('dmRead/'+room+'/'+peerUid+'/ts');
    __dmReadPeerCb = (snap)=>{ __dmPeerReadTs = Number(snap.val()||0); __updateDmReadHint(); };
    __dmReadPeerRef.on('value', __dmReadPeerCb);
  }catch(e){}
}

function __markDmRead(room){
  try{
    const me = auth?.currentUser;
    if(!me || !room) return;
    if(isPremiumBotRoom && isPremiumBotRoom(room)) return;
    db.ref('dmRead/'+room+'/'+me.uid).set({ts: Date.now()});
  }catch(e){}
}


// === DM composer lock (used for DM-Requests: only 1 outgoing message until reply) ===
function __setDmComposerLocked(locked, reason){
  try{
    const t = document.getElementById('dmText');
    const send = document.getElementById('dmSend');
    const photo = document.getElementById('dmPhoto');

    if(t){
      t.disabled = !!locked;
      if(locked){
        const r = String(reason||'').trim();
        t.placeholder = r || 'Ждите ответа…';
      }else{
        t.placeholder = 'Zpráva…';
      }
    }

    if(send) send.disabled = !!locked;
    if(photo) photo.disabled = !!locked;
  }catch(e){}
}

let DM_REF=null;
// Tracks whether the currently opened DM room already has any messages.
// Used for DM-Requests gating (first message must be accepted).
let __DM_ROOM_HAS_ANY = false;
// True when we render a pseudo-message/banners for pending DM requests
// (so we don't show the "empty conversation" placeholder under it).
let __DM_HAS_PSEUDO = false;
let __DM_OLDEST_TS = null;
let __DM_LOADING_OLDER = false;
let __DM_SEEN_IDS = new Set();

// If there is an incoming DM request from the current peer, show a small banner
// explaining that a reply will confirm the dialog.
async function renderDmRequestBanner(room){
  try{
    const me = auth?.currentUser;
    const feed = document.getElementById('dmFeed');
    const peerUid = currentDmPeerUid;
    if(!me || !feed || !peerUid) return;
    if(String(peerUid).startsWith('bot_')) return;

    // Don't show if room already has messages or confirmed.
    try{ if(__DM_ROOM_HAS_ANY) return; }catch(e){}
    try{ const cs = await db.ref('dmConfirmed/'+room).get(); if(cs.exists()) return; }catch(e){}

    const rs = await db.ref('dmRequests/'+me.uid+'/'+peerUid).get();
    if(!rs.exists()) return;
    if(currentDmRoom !== room) return;

    const r = rs.val() || {};

    const banner = document.createElement('div');
    banner.id = 'dmReqBanner';
    banner.style.border = '1px dashed rgba(255,255,255,.25)';
    banner.style.borderRadius = '12px';
    banner.style.padding = '10px';
    banner.style.margin = '6px 0 10px';
    banner.style.background = 'rgba(0,0,0,.12)';

    const title = document.createElement('div');
    title.className = 'row';
    title.style.justifyContent = 'space-between';
    title.style.alignItems = 'center';

    const t = document.createElement('b');
    t.textContent = 'Запрос на переписку';

    const btnDecline = document.createElement('button');
    btnDecline.className = 'ghost';
    btnDecline.type = 'button';
    btnDecline.textContent = 'Отклонить';
    btnDecline.onclick = async ()=>{
      if(!confirm('Отклонить запрос?')) return;
      // Server-first: declining a DM request is a server action (prevents bypass when dmRequests is locked).
      try{
        if(typeof window.callFn === 'function'){
          const r = await window.callFn('dmRequestDecline', { fromUid: peerUid });
          if(!r || r.ok !== true) throw new Error('decline_failed');
        }else{
          toast('Server není dostupný (Functions)');
          throw new Error('functions_unavailable');
        }
        toast('Отклонено');
      }catch(e){ console.warn(e); toast('Ошибка'); }
      try{ banner.remove(); }catch(e){}
    };

    title.appendChild(t);
    title.appendChild(btnDecline);

    const body = document.createElement('div');
    body.className = 'muted';
    const prev = String(r.previewText||'').trim();
    body.textContent = prev ? `"${prev}"` : 'Новое сообщение от пользователя.';

    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.style.marginTop = '6px';
    hint.textContent = 'Если вы ответите — диалог подтвердится автоматически.';

    banner.appendChild(title);
    banner.appendChild(body);
    banner.appendChild(hint);

    try{ feed.prepend(banner); }catch(e){}
    try{ __DM_HAS_PSEUDO = true; }catch(e){}
  }catch(e){ /* silent */ }
}

// Pseudo-message bubble for incoming DM request (shows preview in the chat feed)
async function renderDmRequestPreviewMessage(room){
  try{
    const me = auth?.currentUser;
    const feed = document.getElementById('dmFeed');
    const peerUid = currentDmPeerUid;
    if(!me || !feed || !peerUid) return;
    if(String(peerUid).startsWith('bot_')) return;

    // Only before confirm / when room has no messages
    try{ if(__DM_ROOM_HAS_ANY) return; }catch(e){}
    try{ const cs = await db.ref('dmConfirmed/'+room).get(); if(cs.exists()) return; }catch(e){}

    const rs = await db.ref('dmRequests/'+me.uid+'/'+peerUid).get();
    if(!rs.exists()) return;
    if(currentDmRoom !== room) return;

    const r = rs.val() || {};
    const prev = String(r.previewText||'').trim();
    if(!prev) return;

    const m = { by: peerUid, ts: Number(r.ts||Date.now()), text: prev };
    const u = await resolveMsgUser(m);

    const el=document.createElement('div');
    el.className='msg';
    el.dataset.request='1';
    el.innerHTML =
      `<div class="ava" data-uid="${esc(peerUid)}"><img src="${esc(safeImgSrc(normalizeAvatarUrl(u.avatar), window.DEFAULT_AVATAR))}"></div>`+
      `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(peerUid)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
      `<div class="pill pill-danger" style="display:inline-block;margin:6px 0 8px 0">Запрос на переписку</div>`+
      `<div class="text">${esc(prev)}</div>`+
      `</div>`;

    // Insert after banner (if any), otherwise at top of feed.
    try{
      const bn = document.getElementById('dmReqBanner');
      if(bn && bn.parentNode === feed){
        bn.insertAdjacentElement('afterend', el);
      }else{
        feed.prepend(el);
      }
    }catch(e){
      try{ feed.prepend(el); }catch(_e){}
    }
    try{ __DM_HAS_PSEUDO = true; }catch(e){}
  }catch(e){ /* silent */ }
}

// Banner for outgoing request (sender waiting for acceptance)
async function renderDmOutgoingRequestBanner(room){
  try{
    const me = auth?.currentUser;
    const feed = document.getElementById('dmFeed');
    const peerUid = currentDmPeerUid;
    if(!me || !feed || !peerUid) return;
    if(String(peerUid).startsWith('bot_')) return;

    // Only before confirm / when room has no messages
    try{ if(__DM_ROOM_HAS_ANY) return; }catch(e){}
    try{ const cs = await db.ref('dmConfirmed/'+room).get(); if(cs.exists()) return; }catch(e){}

    // If there is an incoming request, incoming banner will handle it.
    try{ const rsIn = await db.ref('dmRequests/'+me.uid+'/'+peerUid).get(); if(rsIn.exists()) return; }catch(e){}

    const ms = await db.ref('inboxMeta/'+me.uid+'/'+room).get();
    const meta = ms.val() || {};
    if(meta.pendingRequest !== true) return;

    const ts = Number(meta.pendingTs || meta.lastTs || meta.ts || Date.now());
    const prev = String(meta.pendingPreview||'').trim()
      || String(meta.pendingText||'').trim()
      || String(meta.lastText||'').replace(/^\[[^\]]+\]\s*/, '').trim();

    // Lock composer: only 1 first message until reply/confirm
    try{ __setDmComposerLocked(true, 'Ждите ответа…'); }catch(e){}

    // Treat the request preview as my last outgoing message for read receipts
    if(ts){
      try{ __dmLastOutTs = ts; __updateDmReadHint(); }catch(e){}
    }

    const banner = document.createElement('div');
    banner.id = 'dmOutReqBanner';
    banner.style.border = '1px dashed rgba(255,255,255,.18)';
    banner.style.borderRadius = '12px';
    banner.style.padding = '10px';
    banner.style.margin = '6px 0 10px';
    banner.style.background = 'rgba(120,0,255,.10)';

    const t = document.createElement('b');
    t.textContent = 'Запрос отправлен';
    banner.appendChild(t);

    const hint=document.createElement('div');
    hint.className='muted';
    hint.style.marginTop='6px';
    hint.textContent='Ожидаем ответ. Пока диалог не подтверждён — можно отправить только одно первое сообщение.';
    banner.appendChild(hint);

    // Pseudo-message bubble (so you see your sent text in the feed)
    if(prev){
      const u = await resolveMsgUser({by: me.uid});
      const el = document.createElement('div');
      el.className = 'msg me';
      el.dataset.request = '1';
      el.innerHTML =
        `<div class="ava" data-uid="${esc(me.uid)}"><img src="${esc(safeImgSrc(normalizeAvatarUrl(u.avatar), window.DEFAULT_AVATAR))}"></div>`+
        `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(me.uid)}">${esc(u.nick||'Вы')}</div><div class="time">${fmtTime(ts||0)}</div></div>`+
        `<div class="pill pill-purple" style="display:inline-block;margin:6px 0 8px 0">Ожидает ответа</div>`+
        `<div class="text">${esc(prev)}</div>`+
        `</div>`;
      try{ feed.prepend(el); }catch(e){}
    }

    try{ feed.prepend(banner); }catch(e){}
    try{ __DM_HAS_PSEUDO = true; }catch(e){}
  }catch(e){ /* silent */ }
}

async function openDMRoom(a,b){
  // Hard guard: never crash on undefined helpers/params.
  const me = auth?.currentUser;
  if(!me){
    window.__PENDING_VIEW__ = 'view-dm';
    try{ openModalAuth('login'); }catch(e){ try{ document.getElementById('modalAuth').hidden=false; }catch(_){} }
    return;
  }
  if(!a || !b) return;
  if(a===b) return; // no self-DM

// Remember last DM peer/room for reload restore (Single Source of Truth)
try{
  const peer = (a===me.uid) ? b : (b===me.uid ? a : b);

  // We are inside a THREAD now
  try{ setDmState('thread', peer); }catch(e){}

  // Persist last opened room id (same algorithm everywhere)
  try{
    const room = dmKey(me.uid, peer);
    if(room){
      if(window.MK && window.MK.persist && window.MK.persist.dmLastRoom) window.MK.persist.dmLastRoom(room);
      else localStorage.setItem('mk_last_dm_room', room);
    }
  }catch(e){}
}catch(e){}

  try{ closeAllOverlays({keep:null}); }catch(e){}
  // Make sure the DM view is visible and (on mobile) the DM panel is actually opened.
  try{ showView('view-dm'); }catch(e){}
  try{ if(isMobileViewport()) document.body.classList.add('dm-room-open'); }catch(e){}
  const meUid = auth.currentUser ? auth.currentUser.uid : null;
  const peerUid = (meUid && meUid===a) ? b : (meUid && meUid===b ? a : b);
  if(!meUid || !peerUid || peerUid===meUid) return;

  const room = dmKey(meUid, peerUid);
  // set global DM state for sending
  currentDmRoom = room;
  currentDmPeerUid = peerUid;

  // Critical: privateMembers is SELF-WRITE ONLY. Never add the other participant.
  try{
    await db.ref('privateMembers/'+room+'/'+meUid).set(true);
  }catch(e){}

  // index rooms per user (for admin cleanup tools) — self only
  try{ await db.ref('privateRoomsByUser/'+meUid+'/'+room).set(true); }catch(e){}

  // Read receipts (only after we became a private member, otherwise rules can deny)
  try{ __startDmReadWatch(room, peerUid); }catch(e){}
  try{ __markDmRead(room); }catch(e){}

  // Ensure *my* inbox thread exists (without clobbering existing meta).
  // We intentionally avoid writing peer inboxMeta here; it is created on first message.
  try{
    const now=Date.now();
    const baseMeta={with:peerUid, ts:now, lastTs:now, lastText:'', unread:0, lastReadTs:now};
    await db.ref('inboxMeta/'+meUid+'/'+room).transaction((cur)=>{
      if(cur) return cur;
      return baseMeta;
    });
    await db.ref('inboxMeta/'+meUid+'/'+room).update({with:peerUid, ts:now, unread:0, lastReadTs:now});
  }catch(e){}

  // render
  renderDM(room);
}

// Expose the DM opener globally (inbox click handlers call window.openDMRoom)
window.openDMRoom = openDMRoom;

// Public API used across the app (user-card, friends, greeting, admin FAB).
// It is a safe wrapper that always routes through openDMRoom and never crashes
// when called before auth is ready.
async function startDM(peerUid, opts){
  opts = opts || {};
  const peer = String(peerUid||'').trim();
  if(!peer) return;
  const me = auth?.currentUser || null;
  if(!me){
    // Queue intent for auth-state restore.
    try{ window.__PENDING_VIEW__ = 'view-dm'; }catch(e){}
    try{ window.__PENDING_DM_PEER__ = peer; }catch(e){}
    try{ openModalAuth && openModalAuth('login'); }catch(e){}
    return;
  }
  try{ await openDMRoom(me.uid, peer); }catch(e){
    console.warn('startDM/openDMRoom failed', e);
    try{ openDMRoom(me.uid, peer); }catch(_e){}
  }
  // Some callers want to close their own modal explicitly.
  try{ if(opts.closeModalId) closeModal(opts.closeModalId); }catch(e){}
  try{ setTimeout(()=>{ document.getElementById('dmText')?.focus?.(); }, 120); }catch(e){}
}
window.startDM = startDM;

async function renderDM(room){
  setMiniLoad('dmMiniLoad','Načítáme zprávy…', true);
  try{ const me=auth.currentUser; if(me){
    db.ref('inboxMeta/'+me.uid+'/'+room+'/unread').set(0);
    db.ref('inboxMeta/'+me.uid+'/'+room+'/lastReadTs').set(Date.now());
    try{ __markDmRead(room); }catch(e){}
  }}catch(e){}
  wireScrollDown('dmFeed','dmScrollDown');

  const box=$('#dmFeed'); if(!box) return;
  box.innerHTML='';
  try{ __setDmComposerLocked(false); }catch(e){}
  try{ __DM_HAS_PSEUDO = false; }catch(e){}
	  // DM Requests UX (server-first):
	  // - incoming: banner + preview bubble
	  // - outgoing: banner (waiting)
	  try{ await renderDmRequestBanner(room); }catch(e){}
	  try{ await renderDmRequestPreviewMessage(room); }catch(e){}
	  try{ await renderDmOutgoingRequestBanner(room); }catch(e){}
  try{ __DM_SEEN_IDS = new Set(); }catch(e){}
  const stopSeq = startMiniSequence('dmMiniLoad', [
    'Načítám konverzaci…',
    'Šifrujeme chat…',
    'Načítám fotky…',
    'Synchronizuji zprávy…'
  ], 650);
  const stopSlow = (typeof startSlowHint==='function')
    ? startSlowHint('dmMiniLoad', 'Načítání trvá déle… Klepni pro obnovu', 2000, ()=>{ try{ renderDM(room); }catch(e){ try{ location.reload(); }catch(_){} } })
    : null;

  setupPremiumComposer(room);

  if(DM_REF){ try{ DM_REF.off(); }catch{} }
  __DM_OLDEST_TS = null;
  __DM_ROOM_HAS_ANY = false;
  const ref=db.ref('privateMessages/'+room).orderByChild('ts').limitToLast(40);
  DM_REF = ref;

  // Ensure loader is hidden even on empty rooms
  try{
    ref.once('value').then((s)=>{
      try{ if(typeof stopSlow==='function') stopSlow(); }catch(e){}
      setMiniLoad('dmMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
      try{ __DM_ROOM_HAS_ANY = !!s.exists(); }catch(e){}
      if(!s.exists()){
        // If we have a DM request banner/preview – don't show the empty placeholder.
        try{ if(__DM_HAS_PSEUDO) return; }catch(e){}
        const empty=document.createElement('div');
        empty.className='muted';
        empty.style.padding='10px 12px';
        empty.textContent='Zatím žádné zprávy v této konverzaci.';
        box.appendChild(empty);
      }
      // Scroll to newest on open
      try{ setTimeout(()=>{ try{ box.scrollTop = box.scrollHeight; }catch(e){} }, 60); }catch(e){}
    }).catch((err)=>{ try{ console.warn('dm once error', err); }catch(e){} try{ if(typeof stopSlow==='function') stopSlow(); }catch(e){} setMiniLoad('dmMiniLoad','', false); try{ stopSeq && stopSeq(); }catch(e){} });
  }catch(e){}

  // Load older by 20 on scroll top
  box.onscroll = async ()=>{
    if(__DM_LOADING_OLDER) return;
    if(box.scrollTop > 10) return;
    if(!__DM_OLDEST_TS) return;
    __DM_LOADING_OLDER = true;
    const stopOlder = startMiniSequence('dmMiniLoad', ['Načítám starší DM…','Dešifruji…','Synchronizace…'], 650);
    try{
      const olderSnap = await db.ref('privateMessages/'+room).orderByChild('ts').endBefore(__DM_OLDEST_TS).limitToLast(20).get();
      const older = olderSnap.val()||{};
      const items = Object.entries(older).map(([k,v])=>({k,v})).sort((a,b)=>(a.v.ts||0)-(b.v.ts||0));
      const prevH = box.scrollHeight;
      // Prepend in reverse order so DOM stays chronological
      for(let i=items.length-1;i>=0;i--){
        const it = items[i];
        const m=it.v||{};
        if(!m || m.deleted) continue;
        if(typeof m.ts==='number') __DM_OLDEST_TS = Math.min(__DM_OLDEST_TS, m.ts);
        try{ if(__DM_SEEN_IDS && __DM_SEEN_IDS.has(String(it.k))) continue; }catch(e){ if(box.querySelector(`[data-mid="${it.k}"]`)) continue; }
        const u = await resolveMsgUser(m);
        const el=document.createElement('div'); el.className='msg'; el.dataset.mid=it.k;
        try{ el.dataset.ts = String((it.v&&it.v.ts)||Date.now()); }catch(e){}
        el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(safeImgSrc(normalizeAvatarUrl(u.avatar), window.DEFAULT_AVATAR))}"></div>`+
          `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
          (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
          (safeImgSrc(m.img,'')?`<div class="text"><img src="${esc(safeImgSrc(m.img,''))}"></div>`:'')+
          `</div>`;
        box.insertBefore(el, box.firstChild);
        try{ __DM_SEEN_IDS && __DM_SEEN_IDS.add(String(it.k)); }catch(e){}
      }
      const newH = box.scrollHeight;
      box.scrollTop = newH - prevH;
    }catch(e){ console.warn(e); }
    finally{ setMiniLoad('dmMiniLoad','', false); try{ stopOlder && stopOlder(); }catch(e){} __DM_LOADING_OLDER=false; }
  };
  const __onDmCancel = (err)=>{
    try{ console.warn('dm listener cancelled', err); }catch(e){}
    try{ if(typeof stopSeq==='function') stopSeq(); }catch(e){}
    try{ if(typeof stopSlow==='function') stopSlow(); }catch(e){}
    try{ setMiniLoad('dmMiniLoad','', false); }catch(e){}
    try{ const empty=document.createElement('div'); empty.className='mini-hint'; empty.style.padding='10px 12px'; empty.textContent='DM nelze načíst ('+(err && err.code ? err.code : 'error')+').'; box.appendChild(empty); }catch(e){}
  };
  ref.on('child_added', async snap=>{
    try{ if(typeof stopSlow==='function') stopSlow(); }catch(e){}
    setMiniLoad('dmMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){}
    const m=snap.val()||{};
    try{
      const meUid = auth?.currentUser?.uid || null;
      if(meUid && m && m.by===meUid && typeof m.ts==='number') { __dmLastOutTs = Math.max(__dmLastOutTs||0, m.ts); }
    }catch(e){}
    try{ __DM_ROOM_HAS_ANY = true; }catch(e){}
    // Dedup (prevents rare double listeners / race conditions)
    try{ if(__DM_SEEN_IDS && __DM_SEEN_IDS.has(String(snap.key))) return; }catch(e){ if(box.querySelector(`[data-mid="${snap.key}"]`)) return; }
    try{ __DM_SEEN_IDS && __DM_SEEN_IDS.add(String(snap.key)); }catch(e){}
    const wasNearBottom = (()=>{
      try{ return (box.scrollHeight - box.scrollTop - box.clientHeight) < 220; }catch(e){ return true; }
    })();
    if(typeof m.ts==='number') __DM_OLDEST_TS = (__DM_OLDEST_TS===null) ? m.ts : Math.min(__DM_OLDEST_TS, m.ts);
    if(m.deleted){
      try{ const ex=box.querySelector(`[data-mid="${snap.key}"]`); if(ex) ex.remove(); }catch(e){}
      try{ __DM_SEEN_IDS && __DM_SEEN_IDS.delete(String(snap.key)); }catch(e){}
      return;
    }
    const u = await resolveMsgUser(m);
    const el=document.createElement('div'); el.className='msg'; el.dataset.mid=snap.key;
    el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(safeImgSrc(normalizeAvatarUrl(u.avatar), window.DEFAULT_AVATAR))}"></div>`+
      `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
      (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
      (safeImgSrc(m.img,'')?`<div class="text"><img src="${esc(safeImgSrc(m.img,''))}"></div>`:'')+
      `</div>`;
    box.appendChild(el);
    try{ if(wasNearBottom) box.scrollTop = box.scrollHeight; }catch(e){}
    try{ __updateDmReadHint(); }catch(e){}
    try{ if(wasNearBottom) __markDmRead(room); }catch(e){}
    playSound('dm');
    notify('Nová DM', (u.nick||'Uživatel')+': '+(m.text||''));
  }, __onDmCancel);
}
// --- Premium bot helpers (MVP)
// Goal:
// - 3 plan buttons stay attached to the DM composer (mobile-friendly)
// - Sending a plan request writes to payments/requests (+ requestsIndex) and DOES NOT depend on a bot reply
// - QR is shown directly in UI (botPremiumPanel)

let __premiumSelectedPlan = null;
let __premiumReqLock = false;


function isPremiumBotRoom(room){
  const u=auth.currentUser; if(!u) return false;
  const botRoom = dmKey(u.uid, PREMIUM_BOT_UID);
  return room === botRoom;
}

function clearPremiumSelection(){
  __premiumSelectedPlan = null;
  try{
    const bar = document.getElementById('botPlanBar');
    if(bar) bar.querySelectorAll('button[data-plan]').forEach(b=>b.classList.remove('selected'));
  }catch(e){}
}

// --- Premium panel watchers (start only while premium bot room is open) ---
let __premiumPanelUnsubs = [];
let __premiumPanelStarted = false;

function stopPremiumPanelWatchers(){
  try{ __premiumPanelUnsubs.forEach(fn=>{ try{ fn&&fn(); }catch(e){} }); }catch(e){}
  __premiumPanelUnsubs = [];
  __premiumPanelStarted = false;
}

function _setPremiumText(id, txt){
  try{ const el=document.getElementById(id); if(el) el.textContent = String(txt||''); }catch(e){}
}

function _renderPremiumActions(qrSrc){
  const box = document.getElementById('botPremiumActions');
  if(!box) return;
  box.innerHTML='';

  // Attach proof
  const attach=document.createElement('button');
  attach.type='button';
  attach.className='ghost';
  attach.textContent='📎 Přiložit screenshot';
  attach.addEventListener('click', ()=>{
    try{ document.getElementById('dmPhoto')?.click(); }catch(e){}
  });
  box.appendChild(attach);

  // Send request (uses existing DM send handler)
  const send=document.createElement('button');
  send.type='button';
  send.className='ghost';
  send.textContent='Odeslat žádost';
  send.addEventListener('click', ()=>{
    if(!__premiumSelectedPlan){ toast('Vyber balíček dole (VIP/Premium)'); return; }
    try{ document.getElementById('dmSend')?.click(); }catch(e){}
  });
  box.appendChild(send);

  // Open QR full-size
  if(qrSrc){
    const b=document.createElement('button');
    b.type='button';
    b.className='ghost';
    b.textContent='Zvětšit QR';
    b.addEventListener('click', ()=>{
      try{ window.open(qrSrc, '_blank'); }catch(e){}
    });
    box.appendChild(b);
  }
}

function _renderPremiumReqs(map){
  const box = document.getElementById('botPremiumReqs');
  if(!box) return;
  box.innerHTML='';

  const ids = Object.keys(map||{}).sort((a,b)=>((map[b]?.ts||0)-(map[a]?.ts||0)));
  if(ids.length===0){
    const empty=document.createElement('div');
    empty.className='muted';
    empty.textContent='Zatím žádné žádosti.';
    box.appendChild(empty);
    return;
  }

  for(const id of ids.slice(0,8)){
    const r = map[id] || {};
    const row=document.createElement('div');
    row.className='bot-premium-req';

    const thumb=document.createElement('img');
    thumb.alt='';
    if(r.proofUrl){
      thumb.src = r.proofUrl;
      thumb.loading='lazy';
    }else{
      thumb.src = 'assets/img/default-avatar.svg';
      thumb.style.opacity = '0.25';
    }

    const body=document.createElement('div');
    body.style.flex='1';

    const st=document.createElement('div');
    st.className='status';
    st.textContent = String(r.status||'pending');

    const meta=document.createElement('div');
    meta.className='meta';

    const plan = String(r.plan||'');
    let title = plan;
    try{
      if(typeof PREMIUM_PLANS!=='undefined' && PREMIUM_PLANS && PREMIUM_PLANS[plan]) title = PREMIUM_PLANS[plan].title || plan;
    }catch(e){}

    const ts = +r.ts || 0;
    const dt = ts ? (new Date(ts)).toLocaleString() : '';

    const line1=document.createElement('div');
    line1.textContent = title + (dt ? (' · '+dt) : '');

    const line2=document.createElement('div');
    line2.className='muted';
    line2.textContent = (r.text ? String(r.text).slice(0,160) : (r.proofUrl ? 'Screenshot přiložen' : 'Bez poznámky'));

    meta.appendChild(line1);
    meta.appendChild(line2);

    body.appendChild(st);
    body.appendChild(meta);

    row.appendChild(thumb);
    row.appendChild(body);
    box.appendChild(row);
  }
}

function startPremiumPanelWatchers(){
  if(__premiumPanelStarted) return;
  const me = auth.currentUser;
  if(!me) return;
  __premiumPanelStarted = true;

  // Defaults
  _setPremiumText('botPremiumStep', 'Vyber plán dole a odešli žádost.');
  _setPremiumText('botPremiumHint', 'Tip: Přilož screenshot platby přes 📎 a můžeš přidat poznámku do pole.' );

  // QR (admin-set)
  try{
    const qrEl = document.getElementById('botPremiumQr');
    const qrRef = db.ref('settings/payments/qrImg');
    const qrCb = (snap)=>{
      const v = snap.val();
      const src = (typeof v === 'string') ? v : '';
      if(qrEl){
        qrEl.src = src || '';
        qrEl.style.display = src ? '' : 'none';
      }
      _renderPremiumActions(src||'');
    };
    qrRef.on('value', qrCb);
    __premiumPanelUnsubs.push(()=>qrRef.off('value', qrCb));
  }catch(e){}

  // Payment instructions text
  try{
    const txtRef = db.ref('settings/premium/text');
    const txtCb = (snap)=>{
      const v = snap.val();
      const txt = (typeof v === 'string') ? v : '';
      _setPremiumText('botPremiumText', txt || 'Po zaplacení pošli screenshot a napiš poznámku.');
    };
    txtRef.on('value', txtCb);
    __premiumPanelUnsubs.push(()=>txtRef.off('value', txtCb));
  }catch(e){}

  // My requests live list
  try{
    const reqRef = db.ref('payments/requests/'+me.uid).orderByChild('ts').limitToLast(20);
    const reqCb = (snap)=>{ _renderPremiumReqs(snap.val() || {}); };
    reqRef.on('value', reqCb);
    __premiumPanelUnsubs.push(()=>reqRef.off('value', reqCb));
  }catch(e){}
}

function setupPremiumComposer(room){
  const bar = document.getElementById('botPlanBar');
  const panel = document.getElementById('botPremiumPanel');
  const prem = isPremiumBotRoom(room);

  if(panel) panel.style.display = prem ? '' : 'none';

  if(!bar) return;

  if(!prem){
    bar.style.display='none';
    bar.innerHTML='';
    clearPremiumSelection();
    stopPremiumPanelWatchers();
    return;
  }

  // Premium room: show bar + panel + watchers
  bar.style.display='flex';
  bar.innerHTML='';

  const plans=[
    {code:'premium', label:'Premium'},
    {code:'premiumPlus', label:'Premium+'},
    {code:'vip', label:'VIP'}
  ];

  plans.forEach(p=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.textContent=p.label;
    btn.dataset.plan=p.code;
    if(__premiumSelectedPlan===p.code) btn.classList.add('selected');
    btn.addEventListener('click', ()=>{
      __premiumSelectedPlan=p.code;
      try{ bar.querySelectorAll('button[data-plan]').forEach(b=>b.classList.toggle('selected', b.dataset.plan===p.code)); }catch(e){}

      const pl = (typeof PREMIUM_PLANS!=='undefined' && PREMIUM_PLANS && PREMIUM_PLANS[p.code]) ? PREMIUM_PLANS[p.code] : null;
      const title = pl?.title || p.label;
      const period = pl?.period || '';
      const input = document.getElementById('dmText');
      if(input){
        input.value = period ? (`Žádost: ${title} (${period}).`) : (`Žádost: ${title}.`);
        try{ input.focus(); }catch(e){}
      }
    });
    bar.appendChild(btn);
  });

  startPremiumPanelWatchers();
  ensureBotIntroSimple(room);
}

async function ensureBotIntroSimple(room){
  try{
    const snap = await db.ref('privateMessages/'+room).limitToLast(10).get();
    const v=snap.val()||{};
    const anyBot = Object.values(v).some(m=>m && m.bot===true && m.botUid===PREMIUM_BOT_UID);
    if(anyBot) return;
    await db.ref('privateMessages/'+room).push({
      by: auth.currentUser.uid,
      ts: Date.now(),
      bot:true,
      botUid: PREMIUM_BOT_UID,
      text: 'Privilegia: dole vyber balíček (Premium / Premium+ / VIP). QR a instrukce vidíš v panelu. Přilož screenshot platby (📎) a pak stiskni Odeslat.'
    });
  }catch(e){}
}

async function uploadPremiumProof(uid, requestId, fileOrNull, dataUrlOrNull){
  try{
    if(!uid || !requestId) return null;
    if(typeof stg === 'undefined' || !stg) return null;
    const path = `uploads/${uid}/payments/${requestId}.jpg`;
    const ref = stg.ref(path);
    if(fileOrNull){
      await ref.put(fileOrNull);
    }else if(dataUrlOrNull && typeof dataUrlOrNull === 'string' && dataUrlOrNull.startsWith('data:image')){
      await ref.putString(dataUrlOrNull, 'data_url');
    }else{
      return null;
    }
    return await ref.getDownloadURL();
  }catch(e){
    console.warn('[premium] proof upload failed', e);
    return null;
  }
}

async function submitPlanRequest(plan, text, proofImg, proofFile){
  const me=auth.currentUser;
  if(!me) throw new Error('auth required');
  const pl = (typeof PREMIUM_PLANS!=='undefined' && PREMIUM_PLANS && PREMIUM_PLANS[plan]) ? PREMIUM_PLANS[plan] : null;
  const ts = Date.now();
  const city = (window.MK && MK.state && MK.state.city) ? MK.state.city : (localStorage.getItem('city')||'');

  // Anti-duplicate (бетон): allow only ONE pending request per user.
  // Prevents triple-requests from mobile multi-tap / lag.
  try{
    const pendSnap = await db.ref('payments/requests/'+me.uid).orderByChild('ts').limitToLast(25).get();
    const pend = pendSnap.val() || {};
    const hasPending = Object.values(pend).some(r => r && r.status === 'pending');
    if(hasPending){
      try{ toast('Už máte čekající žádost.'); }catch(e){}
      try{ playSound?.('ok'); }catch(e){}
      return;
    }
  }catch(e){ /* best-effort */ }

  // global request id (index)
  const id = db.ref('payments/requestsIndex').push().key;

  let proofUrl = null;
  if(proofFile || proofImg){
    proofUrl = await uploadPremiumProof(me.uid, id, proofFile||null, proofImg||null);
  }

  const req={
    type:'plan_request',
    plan: plan,
    title: pl?.title || plan,
    price: pl?.price || null,
    period: pl?.period || null,
    by: me.uid,
    fromUid: me.uid,
    fromNick: (window.__myPublic && window.__myPublic.nick) ? window.__myPublic.nick : null,
    city: city || null,
    text: text || null,
    proofUrl: proofUrl || null,
    ts: ts,
    status: 'pending'
  };

  const idx={
    uid: me.uid,
    by: me.uid,
    ts: ts,
    plan: plan,
    status: 'pending',
    city: city || null,
    fromNick: (window.__myPublic && window.__myPublic.nick) ? window.__myPublic.nick : null,
    proofUrl: proofUrl || null
  };

  const updates={};
  updates['payments/requests/'+me.uid+'/'+id] = req;
  updates['payments/requestsIndex/'+id] = idx;
  await db.ref().update(updates);
  return id;
}

async function botAck(room, text){
  try{
    await db.ref('privateMessages/'+room).push({
      by: auth.currentUser.uid,
      bot:true,
      botUid: PREMIUM_BOT_UID,
      ts: Date.now(),
      text: text
    });
  }catch(e){}
}

async function openPremiumBot(){
  // Backwards-compatible name. New flow lives in dedicated view-premium.
  try{ showView('view-premium', {forceEnter:true}); }catch(e){ try{ showView('view-premium'); }catch(_e){} }
}
window.openPremiumBot = openPremiumBot;

$('#dmOpen')?.addEventListener('click', async ()=>{
  try{ await window.openDMInbox?.(true); }catch(e){
    const me=auth.currentUser;
    if(!me){ openModalAuth('login'); return; }
    showView('view-dm');
    try{ if(window.loadDmThreads) window.loadDmThreads(true); }catch(_){ }
  }
});

// Floating DM button (user quick access). Opens DM inbox (or asks login).
document.getElementById('fabDm')?.addEventListener('click', async (e)=>{
  try{ e.preventDefault(); e.stopPropagation(); }catch(err){}
  const me = auth.currentUser;
  if(!me){ try{ openModalAuth('login'); }catch(err){} return; }
  try{
    if(typeof window.openDMInbox === 'function'){ await window.openDMInbox(true); return; }
  }catch(err){}
  try{ showView('view-dm'); }catch(err){}
  try{ if(typeof window.loadDmThreads === 'function') window.loadDmThreads(true); }catch(err){}
});


let pendingDmImg=null;
let pendingDmFile=null;
$('#dmPhoto')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  if(!f){ pendingDmImg=null; pendingDmFile=null; return; }
  pendingDmFile = f;
  try{ pendingDmImg = await fileToDataURL(f); }catch(err){ pendingDmImg=null; }
  const premRoom = isPremiumBotRoom(currentDmRoom);
  toast(premRoom ? 'Screenshot připraven. Vyber plán a stiskni Odeslat.' : 'Foto přidáno do DM. Stiskněte Odeslat.');
  playSound('ok');
});
$('#dmSend')?.addEventListener('click', async ()=>{
  const me=auth.currentUser; 
  if(!me){ openModalAuth('login'); return; }
  if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
  if(me.emailVerified===false){
    const until=getVerifyDeadline(me);
    if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
  }

  // NOTE (limits): we limit DM *initiations* (dm_init) only.
  // Normal DM messages inside an already confirmed room are not counted.

  if(!currentDmRoom || !currentDmPeerUid){
    toast('Nejprve otevřete konverzaci');
    playSound('err');
    return;
  }

  // moderation gates
  try{
    const ban = await db.ref('bans/'+me.uid).get();
    if(ban.exists() && ban.val().until > Date.now()){
      const r = ban.val().reason ? ('\nDůvod: '+ban.val().reason) : '';
      alert('Máte dočasný ban na odesílání.'+r);
      return;
    }
    const dmb = await db.ref('dmBans/'+me.uid).get();
    if(dmb.exists() && dmb.val().until > Date.now()){
      const r = dmb.val().reason ? ('\nDůvod: '+dmb.val().reason) : '';
      alert('Máte dočasný zákaz psaní do L.S..'+r);
      return;
    }
  }catch(e){}

  try{
    const text=$('#dmText')?.value?.trim() || '';
    const img=pendingDmImg;

    const room=currentDmRoom;
    const isPremiumReq = (isPremiumBotRoom(room) && !!__premiumSelectedPlan);
    if(!text && !img && !isPremiumReq) return;

    const ts=Date.now();

    // DM Requests (anti-spam): if the room has no messages and is not yet confirmed,
    // the first message becomes a request (dmRequests/{to}/{from}).
    // When the receiver replies, we auto-confirm (dmConfirmed/{room}) and only then allow privateMessages.
    try{
      const peerUid = currentDmPeerUid;
      const peerIsBot = String(peerUid||'').startsWith('bot_');
      const isPremiumRoom = isPremiumBotRoom(room);

      if(peerUid && !peerIsBot && !isPremiumRoom){
        // Block gates (local UX check; server/rules also enforce).
        try{
          const b1 = await db.ref('blocks/'+me.uid+'/'+peerUid).get();
          if(b1.exists()){
            toast('Вы заблокировали пользователя');
            playSound('err');
            return;
          }
          const b2 = await db.ref('blocks/'+peerUid+'/'+me.uid).get();
          if(b2.exists()){
            toast('Пользователь ограничил переписку');
            playSound('err');
            return;
          }
        }catch(e){}

        let confirmed = false;
        try{ if(__DM_ROOM_HAS_ANY) confirmed = true; }catch(e){}
        if(!confirmed){
          try{ const cs = await db.ref('dmConfirmed/'+room).get(); confirmed = cs.exists(); }catch(e){}
        }

        if(!confirmed){
          // Incoming request? Replying confirms the DM.
          let hasIncoming = false;
          try{ const rs = await db.ref('dmRequests/'+me.uid+'/'+peerUid).get(); hasIncoming = rs.exists(); }catch(e){}

          if(hasIncoming){
            // Atomic confirm: dmRequest -> dmConfirmed -> privateMembers (server-first)
            let confirmedOk = false;
            try{
              if(window.callFn){
                const r = await callFn('dmConfirmAtomic', { peerUid });
                if(r && r.ok === true) confirmedOk = true;
              }
            }catch(e){}

            if(!confirmedOk){
              // No fallback: in hardened mode dmConfirmed/dmRequests are server-owned.
              toast('Nelze potvrdit DM (server)');
              playSound('err');
              return;
            }
            // Continue to normal send below
          }else{
            // Outgoing request (no privateMessages write)
            if(img){ toast('Nejdřív počkejte na potvrzení. Obrázek lze poslat až po přijetí.'); playSound('err'); return; }
            if(!text){ toast('Napište zprávu'); playSound('err'); return; }

            // Server-first: send DM request through Cloud Functions.
            try{
              if(typeof window.callFn !== 'function'){
                toast('Server není dostupný (Functions)');
                playSound('err');
                return;
              }
              const r = await window.callFn('dmRequestSend', { toUid: peerUid, previewText: String(text).slice(0,240) });
              if(!r || r.ok !== true){
                const reason = String(r?.reason||'');
                if(reason==='limit') toast('Limit DM vyčerpán');
                else if(reason==='already_requested') toast('Запрос уже отправлен');
                else if(reason==='already_confirmed') toast('Диалог уже подтверждён');
                else if(reason==='blocked') toast('Нельзя написать пользователю (блокировка)');
                else toast('Нельзя отправить запрос');
                playSound('err');
                return;
              }
            }catch(e){
              console.warn('dmRequestSend failed', e);
              toast('Nelze odeslat žádost (server)');
              playSound('err');
              return;
            }

	            // Update my own thread preview so I can see the pending request in the inbox.
	            try{
	              await db.ref('inboxMeta/'+me.uid+'/'+room).update({
	                lastTs: ts,
	                lastText: '[Запрос] '+String(text).slice(0,120),
	                lastBy: me.uid,
	                with: peerUid,
	                unread: 0,
	                pendingRequest: true,
	                pendingPreview: String(text).slice(0,240),
	                pendingText: String(text).slice(0,240),
	                pendingTs: ts
	              });
	            }catch(e){}

            toast('Запрос отправлен. Ждите ответа.');
            playSound('ok');

            try{ const t=document.getElementById('dmText'); if(t) t.value=''; }catch(e){}
            try{ const p=document.getElementById('dmPhoto'); if(p) p.value=''; }catch(e){}
            pendingDmImg=null;
            pendingDmFile=null;
            try{ document.activeElement && document.activeElement.blur && document.activeElement.blur(); }catch(e){}
            // Refresh UI so the sender sees their first message + read-status immediately
            try{ renderDM(room); }catch(e){}
            return;
          }
        }
      }
    }catch(e){ console.warn(e); }

    // Critical: privateMembers is SELF-WRITE ONLY.
    // Required by rules for:
    // - writing privateMessages
    // - updating peer's inboxMeta (unread/preview)
    try{ await db.ref('privateMembers/'+room+'/'+me.uid).set(true); }catch(e){}

    // Premium bot: plan request goes to payments/requests (+ index). No bot response required.
    if(isPremiumBotRoom(room) && __premiumSelectedPlan){
      if(__premiumReqLock) return;
      __premiumReqLock = true;
      try{
        await submitPlanRequest(__premiumSelectedPlan, text, img, pendingDmFile);
        // Optional local ack for UX
        await botAck(room, '✅ Žádost odeslána. QR a instrukce vidíš v panelu nahoře.');
        toast('Žádost odeslána');
      }catch(e){
        console.warn(e);
        toast('Žádost se nepodařila odeslat');
        playSound('err');
        return;
      }finally{
        __premiumReqLock = false;
      }

      // Reset UI state
      clearPremiumSelection();
      if($('#dmText')) $('#dmText').value='';
      if($('#dmPhoto')) $('#dmPhoto').value='';
      pendingDmImg=null;
      pendingDmFile=null;
      try{ document.activeElement && document.activeElement.blur && document.activeElement.blur(); }catch(e){}

      // Close mobile overlay after submitting (prevents "input popping" on navigation)
      try{ if(isMobileViewport && isMobileViewport()){ window.closeDmMobile && window.closeDmMobile(); document.body.classList.remove('dm-room-open'); } }catch(e){}
      playSound('ok');
      return;
    }

    // 3) write normal message
    await db.ref('privateMessages/'+room).push({by:me.uid, ts, text: text||null, img: img||null});
    // lightweight analytics (admin-only visible)

    // 4) update inbox meta + unread (room-keyed)
    const preview = (text && text.length) ? text.slice(0,120) : (img ? '📷 Foto' : '');
    const updates={};
    updates[`inboxMeta/${me.uid}/${room}/with`] = currentDmPeerUid;
    updates[`inboxMeta/${me.uid}/${room}/ts`] = ts;
    updates[`inboxMeta/${me.uid}/${room}/lastTs`] = ts;
    updates[`inboxMeta/${me.uid}/${room}/lastText`] = preview;
    updates[`inboxMeta/${me.uid}/${room}/unread`] = 0;
    updates[`inboxMeta/${me.uid}/${room}/lastReadTs`] = ts;
    // Clear any pending "request" state once a real message is sent.
    updates[`inboxMeta/${me.uid}/${room}/pendingRequest`] = null;
    updates[`inboxMeta/${me.uid}/${room}/pendingText`] = null;
    updates[`inboxMeta/${me.uid}/${room}/pendingTs`] = null;

    updates[`inboxMeta/${currentDmPeerUid}/${room}/with`] = me.uid;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/ts`] = ts;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/lastTs`] = ts;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/lastText`] = preview;
    // Mark as unread for the peer (idempotent: 0/1, no cross-user reads needed)
    updates[`inboxMeta/${currentDmPeerUid}/${room}/unread`] = 1;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/pendingRequest`] = null;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/pendingText`] = null;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/pendingTs`] = null;
    await db.ref().update(updates);

    // Notifications: admin-only (MVP). DM unread is tracked in inboxMeta.

    // No daily counter increment here.
    // dm_init is consumed only when creating a dmRequest (new conversation).

    if($('#dmText')) $('#dmText').value='';
    if($('#dmPhoto')) $('#dmPhoto').value='';
    pendingDmImg=null;
    toast('Odesláno'); playSound('ok');
    try{ const box=document.getElementById('dmFeed'); if(box) box.scrollTop = box.scrollHeight; }catch(e){}
    // Do NOT re-render DM on send; child_added listener will append.
  }catch(e){ console.error(e); playSound('err'); }
});

// Tab lifecycle support: detach the currently opened DM room listener
// when leaving the DM tab (prevents duplicates + background streaming).
window.__dmUnsub = function(){
  try{ __stopDmReadWatch(); }catch(e){}
  try{ if(DM_REF){ DM_REF.off(); DM_REF=null; } }catch(e){}
  // Stop inbox live watcher as well (lazy init policy)
  try{ stopDmThreadsLive && stopDmThreadsLive(); }catch(e){}
  try{ window.__dmThreadsLoading = false; }catch(e){}
  // Reset composer state to avoid "stuck" input after tab switches / F5
  try{ if($('#dmText')) $('#dmText').value=''; }catch(e){}
  try{ if($('#dmPhoto')) $('#dmPhoto').value=''; }catch(e){}
  pendingDmImg=null;
  pendingDmFile=null;
  try{ clearPremiumSelection(); }catch(e){}
  try{ setupPremiumComposer(null); }catch(e){}

  try{ document.body.classList.remove('dm-room-open'); }catch(e){}
  try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){}
};


// ==== DM THREADS LIVE (view-dm lazy subscription) ====
// Moved from 06-notifications.js to keep that module slim.
let __dmThreadsRef = null;
let __dmThreadsCb = null;
let __dmThreadsTimer = null;
let __dmThreadsUnsub = null;

function startDmThreadsLive(uid){
  stopDmThreadsLive();
  if(!uid) return;

  // Preferred modern implementation lives in dm-inbox.js
  try{
    if(typeof window.startDmInboxLive === 'function'){
      __dmThreadsUnsub = window.startDmInboxLive(uid);
      return;
    }
  }catch(e){}

  // Fallback legacy (value) – should be avoided on large inboxes
  __dmThreadsRef = db.ref('inboxMeta/'+uid).limitToLast(80);
  __dmThreadsCb = ()=>{
    if(__dmThreadsTimer) clearTimeout(__dmThreadsTimer);
    __dmThreadsTimer = setTimeout(()=>{
      try{
        if(window.MK?.state?.view !== 'view-dm') return;
        if(typeof window.loadDmThreads === 'function') window.loadDmThreads();
      }catch(e){}
    }, 120);
  };
  __dmThreadsRef.on('value', __dmThreadsCb);
}

function stopDmThreadsLive(){
  try{ if(__dmThreadsUnsub){ __dmThreadsUnsub(); } }catch(e){}
  __dmThreadsUnsub = null;
  try{ if(__dmThreadsRef && __dmThreadsCb) __dmThreadsRef.off('value', __dmThreadsCb); }catch(e){}
  __dmThreadsRef = null;
  __dmThreadsCb = null;
  if(__dmThreadsTimer) clearTimeout(__dmThreadsTimer);
  __dmThreadsTimer = null;
}

function watchDmThreadsLive(uid){
  startDmThreadsLive(uid);
}

window.startDmThreadsLive = startDmThreadsLive;
window.stopDmThreadsLive = stopDmThreadsLive;
window.watchDmThreadsLive = watchDmThreadsLive;

