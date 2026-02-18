// === DM Inbox / Threads list (optimized) ===
// Goals:
// - Fast load: last N threads only
// - No duplicates: stable DOM keyed by roomId
// - Live updates without full re-render (child_added/changed/removed)
// - Avoid heavy presence lookups in list (use getUserLite when available)

const DM_THREADS_LIMIT = 50;
const DM_REQ_LIMIT = 50;

let __dmInboxUid = null;
let __dmInboxQuery = null;
let __dmInboxHandlers = null;

// DM Requests (incoming): dmRequests/{me}/{from}
let __dmReqUid = null;
let __dmReqQuery = null;
let __dmReqHandlers = null;
let __dmReqEls = new Map();

let __dmThreadsStopSeq = null;

// roomId -> element
let __dmThreadEls = new Map();
// roomId -> meta
let __dmThreadMeta = new Map();

// uid -> public profile (lite)
let __dmUserLite = new Map();

function _dmThreadsBox(){ return document.getElementById('dmThreads'); }
function _dmReqBox(){ return document.getElementById('dmRequests'); }

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

function resetDmRequestsUI(){
  const box = _dmReqBox();
  if(box){ box.innerHTML=''; box.style.display='none'; try{ delete box.dataset.hasHeader; }catch(e){} }
  __dmReqEls = new Map();
}

function _removeDmRequest(fromUid){
  const row = __dmReqEls.get(fromUid);
  if(row){ try{ row.remove(); }catch(e){} }
  __dmReqEls.delete(fromUid);
  const box = _dmReqBox();
  if(box && __dmReqEls.size===0){ box.innerHTML=''; box.style.display='none'; }
}

function _ensureReqHeader(){
  const box = _dmReqBox();
  if(!box) return;
  if(box.dataset.hasHeader === '1') return;
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.gap = '8px';
  const head = document.createElement('div');
  head.className = 'muted';
  head.textContent = 'Запросы на переписку';
  head.style.margin = '4px 0 2px';
  box.appendChild(head);
  box.dataset.hasHeader = '1';
}

function _ensureReqRow(fromUid){
  _ensureReqHeader();
  const box = _dmReqBox();
  if(!box) return null;
  let row = __dmReqEls.get(fromUid);
  if(row) return row;

  row = document.createElement('div');
  row.className = 'thread request';
  row.style.border = '1px dashed rgba(255,255,255,.25)';
  row.style.cursor = 'pointer';

  const left = document.createElement('div');
  left.className = 'row';
  left.style.alignItems = 'center';
  left.style.gap = '10px';

  const img = document.createElement('img');
  img.className = 'ava';
  img.alt = '';
  left.appendChild(img);

  const mid = document.createElement('div');
  mid.style.flex = '1';

  const title = document.createElement('div');
  title.className = 'row';
  title.style.justifyContent = 'space-between';
  title.style.alignItems = 'center';
  const name = document.createElement('b');
  const pill = document.createElement('span');
  pill.className = 'pill pill-danger';
  pill.textContent = 'Запрос на переписку';
  title.appendChild(name);
  title.appendChild(pill);
  const preview = document.createElement('div');
  preview.className = 'muted';
  mid.appendChild(title);
  mid.appendChild(preview);
  left.appendChild(mid);

  const actions = document.createElement('div');
  actions.className = 'row';
  actions.style.gap = '6px';

  const btnOpen = document.createElement('button');
  btnOpen.className = 'ghost';
  btnOpen.type = 'button';
  btnOpen.textContent = 'Открыть';

  const btnDecline = document.createElement('button');
  btnDecline.className = 'ghost';
  btnDecline.type = 'button';
  btnDecline.textContent = 'Отклонить';

  actions.appendChild(btnOpen);
  actions.appendChild(btnDecline);

  row.appendChild(left);
  row.appendChild(actions);

  __dmReqEls.set(fromUid, row);
  box.appendChild(row);

  return row;
}

function _updateReqRow(fromUid, r, myUid){
  const row = _ensureReqRow(fromUid);
  if(!row) return;
  const rr = r || {};
  try{
    const img = row.querySelector('img');
    if(img) img.src = rr.fromAvatar || 'assets/img/default-avatar.svg';
    const b = row.querySelector('b');
    if(b) b.textContent = rr.fromNick || ('UID: '+String(fromUid).slice(0,6));
    const p = row.querySelector('.muted');
    if(p) p.textContent = rr.previewText || '';
  }catch(e){}

  try{
    const btns = row.querySelectorAll('button');
    const btnOpen = btns && btns[0];
    const btnDecline = btns && btns[1];
    if(btnOpen){
      btnOpen.onclick = (ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        try{ startDM && startDM(fromUid); }catch(e){ try{ openDMRoom(myUid, fromUid); showView('view-dm'); }catch(_){ } }
      };
    }
    if(btnDecline){
      btnDecline.onclick = async (ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        if(!confirm('Отклонить запрос?')) return;
        try{
          if(typeof window.callFn === 'function'){
            const r = await window.callFn('dmRequestDecline', { fromUid });
            if(!r || r.ok !== true) throw new Error('decline_failed');
          }else{
            toast('Server není dostupný (Functions)');
            throw new Error('functions_unavailable');
          }
          toast('Odmítnuto');
        }catch(e){ console.warn(e); toast('Chyba'); }
      };
    }
    row.onclick = ()=>{
      try{ startDM && startDM(fromUid); }catch(e){ try{ openDMRoom(myUid, fromUid); showView('view-dm'); }catch(_){ } }
    };
  }catch(e){}
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

// DM Requests (incoming)
async function loadDmRequests(force){
  const me = auth.currentUser;
  if(!me){ resetDmRequestsUI(); return; }
  if(!force && __dmReqUid === me.uid && _dmReqBox()?.children?.length) return;

  resetDmRequestsUI();
  __dmReqUid = me.uid;

  let snap = null;
  try{
    snap = await db.ref('dmRequests/'+me.uid).orderByChild('ts').limitToLast(DM_REQ_LIMIT).get();
  }catch(e){
    try{ snap = await db.ref('dmRequests/'+me.uid).orderByChild('ts').limitToLast(DM_REQ_LIMIT).once('value'); }
    catch(_){ snap=null; }
  }

  const v = snap && (typeof snap.val==='function') ? (snap.val()||{}) : {};
  const arr = Object.entries(v||{}).map(([fromUid, r])=>({fromUid, r:r||{}}));
  arr.sort((a,b)=>((b.r.ts||0)-(a.r.ts||0)));
  if(arr.length===0) return;

  for(const it of arr){
    _updateReqRow(it.fromUid, it.r, me.uid);
  }
}

function startDmRequestsLive(uid){
  stopDmRequestsLive();
  if(!uid) return ()=>{};
  __dmReqUid = uid;
  resetDmRequestsUI();

  const q = db.ref('dmRequests/'+uid).orderByChild('ts').limitToLast(DM_REQ_LIMIT);
  __dmReqQuery = q;

  const onAdd = (snap)=>{ _updateReqRow(snap.key, snap.val()||{}, uid); };
  const onChg = (snap)=>{ _updateReqRow(snap.key, snap.val()||{}, uid); };
  const onRem = (snap)=>{ _removeDmRequest(snap.key); };

  __dmReqHandlers = { onAdd, onChg, onRem };
  q.on('child_added', onAdd);
  q.on('child_changed', onChg);
  q.on('child_removed', onRem);

  try{ window.MK?.subs?.set && window.MK.subs.set('tab:dmReqLive', stopDmRequestsLive, 'tab'); }catch(e){}

  // Hide if empty after initial sync
  try{ q.once('value').then((s)=>{ if(!s.exists()) resetDmRequestsUI(); }).catch(()=>{}); }catch(e){}

  return stopDmRequestsLive;
}

function stopDmRequestsLive(){
  try{ if(__dmReqQuery && __dmReqHandlers){
    __dmReqQuery.off('child_added', __dmReqHandlers.onAdd);
    __dmReqQuery.off('child_changed', __dmReqHandlers.onChg);
    __dmReqQuery.off('child_removed', __dmReqHandlers.onRem);
  }}catch(e){}
  __dmReqQuery = null;
  __dmReqHandlers = null;
  __dmReqUid = null;
}

// Public API
window.loadDmThreads = loadDmThreads;
window.startDmInboxLive = startDmInboxLive;
window.stopDmInboxLive = stopDmInboxLive;
window.loadDmRequests = loadDmRequests;
window.startDmRequestsLive = startDmRequestsLive;
window.stopDmRequestsLive = stopDmRequestsLive;
