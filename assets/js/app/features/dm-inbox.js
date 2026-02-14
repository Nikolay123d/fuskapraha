// === DM Inbox / Threads list (optimized) ===
// Goals:
// - Fast load: last N threads only
// - No duplicates: stable DOM keyed by roomId
// - Live updates without full re-render (child_added/changed/removed)
// - Avoid heavy presence lookups in list (use getUserLite when available)

const DM_THREADS_LIMIT = 50;

let __dmInboxUid = null;
let __dmInboxQuery = null;
let __dmInboxHandlers = null;

let __dmThreadsStopSeq = null;

// roomId -> element
let __dmThreadEls = new Map();
// roomId -> meta
let __dmThreadMeta = new Map();

// uid -> public profile (lite)
let __dmUserLite = new Map();

function _dmThreadsBox(){ return document.getElementById('dmThreads'); }

function _dmThreadsLoaderOn(){
  setMiniLoad('dmThreadsMiniLoad','Načítáme konverzace…', true);
  try{
    __dmThreadsStopSeq && __dmThreadsStopSeq();
    __dmThreadsStopSeq = startMiniSequence('dmThreadsMiniLoad', [
      'Načítám poslední konverzace…',
      'Tip: konverzace se řadí podle poslední zprávy.',
      'Tip: VIP odemkne více možností.',
      'Tip: klikni na konverzaci pro otevření historie.'
    ], 850);
  }catch(e){}
}

function _dmThreadsLoaderOff(){
  setMiniLoad('dmThreadsMiniLoad','', false);
  try{ __dmThreadsStopSeq && __dmThreadsStopSeq(); }catch(e){}
  __dmThreadsStopSeq = null;
}

function _inferOtherUid(roomId, myUid, meta){
  try{
    const w = String(meta?.with||'').trim();
    if(w && w !== myUid) return w;
  }catch(e){}
  const parts = String(roomId||'').split('_');
  if(parts.length===2){
    return (parts[0]===myUid) ? parts[1] : parts[0];
  }
  return '';
}

async function _getUserLite(uid){
  if(!uid) return null;
  try{ if(__dmUserLite.has(uid)) return __dmUserLite.get(uid); }catch(e){}
  let u = null;
  try{
    if(typeof window.getUserLite === 'function') u = await window.getUserLite(uid);
    else if(typeof fetchUserPublic === 'function') u = await fetchUserPublic(uid);
    else if(typeof getUser === 'function') u = await getUser(uid);
  }catch(e){ u = null; }
  if(u){
    try{ __dmUserLite.set(uid, u); }catch(e){}
  }
  return u;
}

function _formatLastText(meta){
  const t = String(meta?.lastText||'').trim();
  if(t) return t.length>80 ? (t.slice(0,80)+'…') : t;
  return '—';
}

function _ensureThreadRow(roomId){
  if(__dmThreadEls.has(roomId)) return __dmThreadEls.get(roomId);
  const box = _dmThreadsBox();
  if(!box) return null;

  const row = document.createElement('div');
  row.className = 'thread';
  row.dataset.room = roomId;
  row.style.display='flex';
  row.style.gap='10px';
  row.style.alignItems='center';
  row.style.padding='8px 8px';
  row.style.border='1px solid rgba(255,255,255,.10)';
  row.style.borderRadius='12px';
  row.style.background='rgba(0,0,0,.18)';
  row.style.cursor='pointer';

  const avaWrap = document.createElement('div');
  avaWrap.className = 'ava';
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.src = safeImgSrc(window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg', window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg');
  avaWrap.appendChild(img);

  const metaWrap = document.createElement('div');
  metaWrap.className = 'meta';
  metaWrap.style.flex='1';
  metaWrap.style.minWidth='0';

  const top = document.createElement('div');
  top.className='row';
  top.style.display='flex';
  top.style.justifyContent='space-between';
  top.style.gap='10px';

  const name = document.createElement('div');
  name.className='name';
  name.style.fontWeight='800';
  name.style.whiteSpace='nowrap';
  name.style.overflow='hidden';
  name.style.textOverflow='ellipsis';

  const time = document.createElement('div');
  time.className='time';
  time.style.opacity='0.7';
  time.style.fontSize='12px';
  time.style.whiteSpace='nowrap';

  top.appendChild(name);
  top.appendChild(time);

  const last = document.createElement('div');
  last.className='last muted';
  last.style.whiteSpace='nowrap';
  last.style.overflow='hidden';
  last.style.textOverflow='ellipsis';
  last.style.opacity='0.85';

  metaWrap.appendChild(top);
  metaWrap.appendChild(last);

  const badge = document.createElement('span');
  badge.className='badge';
  badge.style.display='none';
  badge.style.marginLeft='6px';
  badge.style.whiteSpace='nowrap';

  row.appendChild(avaWrap);
  row.appendChild(metaWrap);
  row.appendChild(badge);

  box.appendChild(row);

  __dmThreadEls.set(roomId, row);
  return row;
}

function _updateThreadRow(roomId, meta, myUid){
  const row = _ensureThreadRow(roomId);
  if(!row) return;

  const nameEl = row.querySelector('.name');
  const timeEl = row.querySelector('.time');
  const lastEl = row.querySelector('.last');
  const img = row.querySelector('.ava img');
  const badge = row.querySelector('.badge');

  const lastTs = +meta?.lastTs || +meta?.ts || 0;
  const lastReadTs = +meta?.lastReadTs || 0;
  const unread = +meta?.unread || 0;
  const isUnread = (lastTs && lastReadTs && lastTs > lastReadTs) || unread > 0;

  // Title
  const title = String(meta?.title||'').trim();
  if(nameEl) nameEl.textContent = title || 'Uživatel';

  // Time
  if(timeEl) timeEl.textContent = lastTs ? fmtTime(lastTs) : '';

  // Preview
  if(lastEl) lastEl.textContent = _formatLastText(meta);

  // Unread badge
  if(badge){
    if(isUnread){
      badge.style.display='inline-block';
      badge.textContent = unread>0 ? String(unread) : 'NEW';
      badge.style.borderColor = 'rgba(255,66,111,.55)';
    }else{
      badge.style.display='none';
    }
  }

  // Click handler (bind only once)
  if(!row.__bound){
    row.__bound = true;
    row.addEventListener('click', ()=>{
      const me = auth.currentUser;
      if(!me) { try{ openModalAuth('login'); }catch(e){}; return; }
      const m = __dmThreadMeta.get(roomId) || meta || {};
      const other = _inferOtherUid(roomId, me.uid, m);
      if(other) openDMRoom(me.uid, other);
    });
  }

  // Update avatar/name async
  const otherUid = _inferOtherUid(roomId, myUid, meta);
  if(otherUid){
    _getUserLite(otherUid).then(u=>{
      if(!u) return;
      try{
        if(nameEl && (!title || title==='Uživatel')) nameEl.textContent = String(u.nick||'Uživatel');
        if(img) img.src = safeImgSrc(normalizeAvatarUrl(u.avatar), window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg');
      }catch(e){}
    });
  }
}

function _moveThreadToTop(roomId){
  const box = _dmThreadsBox();
  const row = __dmThreadEls.get(roomId);
  if(!box || !row) return;
  try{ box.insertBefore(row, box.firstChild); }catch(e){}
}

function _removeThread(roomId){
  const row = __dmThreadEls.get(roomId);
  if(row){ try{ row.remove(); }catch(e){} }
  __dmThreadEls.delete(roomId);
  __dmThreadMeta.delete(roomId);
}

function resetDmThreadsUI(){
  const box = _dmThreadsBox();
  if(box) box.innerHTML = '';
  __dmThreadEls = new Map();
  __dmThreadMeta = new Map();
  // keep __dmUserLite cache (speeds re-open)
}

// One-time load (fast)
async function loadDmThreads(force){
  const me = auth.currentUser;
  const box = _dmThreadsBox();
  if(!box) return;

  if(!me){
    box.innerHTML = '<div class="muted" style="padding:10px 12px">Přihlaste se pro soukromé zprávy.</div>';
    return;
  }

  if(!force && box.children.length>0) return;

  resetDmThreadsUI();
  _dmThreadsLoaderOn();

  let snap=null;
  try{
    snap = await db.ref('inboxMeta/'+me.uid).orderByChild('lastTs').limitToLast(DM_THREADS_LIMIT).get();
  }catch(e){
    try{ snap = await db.ref('inboxMeta/'+me.uid).orderByChild('lastTs').limitToLast(DM_THREADS_LIMIT).once('value'); }catch(_){ snap=null; }
  }

  const val = snap && (typeof snap.val==='function') ? (snap.val()||{}) : {};
  const items = Object.entries(val||{}).map(([roomId, meta])=>({roomId, meta:meta||{}}));

  // Sort newest first
  items.sort((a,b)=>((b.meta.lastTs||b.meta.ts||0) - (a.meta.lastTs||a.meta.ts||0)));

  if(items.length===0){
    _dmThreadsLoaderOff();
    const empty=document.createElement('div');
    empty.className='muted';
    empty.style.padding='10px 12px';
    empty.textContent='Zatím žádné konverzace.';
    box.appendChild(empty);
    return;
  }

  // Render rows quickly (no await in the loop)
  for(const it of items){
    __dmThreadMeta.set(it.roomId, it.meta);
    _updateThreadRow(it.roomId, it.meta, me.uid);
  }

  _dmThreadsLoaderOff();
}

// Live subscription (incremental)
function startDmInboxLive(uid){
  stopDmInboxLive();
  if(!uid) return ()=>{};
  __dmInboxUid = uid;

  _dmThreadsLoaderOn();

  const q = db.ref('inboxMeta/'+uid).orderByChild('lastTs').limitToLast(DM_THREADS_LIMIT);
  __dmInboxQuery = q;

  const onAdd = (snap)=>{
    const existed = __dmThreadEls.has(snap.key);
    const meta = snap.val()||{};
    __dmThreadMeta.set(snap.key, meta);
    _updateThreadRow(snap.key, meta, uid);
    // child_added comes oldest->newest. Only move to top for new rooms.
    if(!existed) _moveThreadToTop(snap.key);
  };
  const onChg = (snap)=>{
    const meta = snap.val()||{};
    __dmThreadMeta.set(snap.key, meta);
    _updateThreadRow(snap.key, meta, uid);
    _moveThreadToTop(snap.key);
  };
  const onRem = (snap)=>{ _removeThread(snap.key); };

  __dmInboxHandlers = { onAdd, onChg, onRem };
  q.on('child_added', onAdd);
  q.on('child_changed', onChg);
  q.on('child_removed', onRem);

  // register in tab-scope registry (double safety)
  try{ window.MK?.subs?.set && window.MK.subs.set('tab:dmInboxLive', stopDmInboxLive, 'tab'); }catch(e){}

  // Hide loader after initial sync even if empty
  try{
    q.once('value').then((s)=>{
      _dmThreadsLoaderOff();
      const box=_dmThreadsBox();
      if(box && !s.exists() && box.children.length===0){
        const empty=document.createElement('div');
        empty.className='muted';
        empty.style.padding='10px 12px';
        empty.textContent='Zatím žádné konverzace.';
        box.appendChild(empty);
      }
    }).catch(()=>{ _dmThreadsLoaderOff(); });
  }catch(e){ _dmThreadsLoaderOff(); }

  return stopDmInboxLive;
}

function stopDmInboxLive(){
  try{ _dmThreadsLoaderOff(); }catch(e){}
  try{ if(__dmInboxQuery && __dmInboxHandlers){
    __dmInboxQuery.off('child_added', __dmInboxHandlers.onAdd);
    __dmInboxQuery.off('child_changed', __dmInboxHandlers.onChg);
    __dmInboxQuery.off('child_removed', __dmInboxHandlers.onRem);
  }}catch(e){}
  __dmInboxQuery = null;
  __dmInboxHandlers = null;
  __dmInboxUid = null;
}

// Public API
window.loadDmThreads = loadDmThreads;
window.startDmInboxLive = startDmInboxLive;
window.stopDmInboxLive = stopDmInboxLive;
