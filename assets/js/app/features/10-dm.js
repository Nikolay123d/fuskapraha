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
let DM_REF=null;
let __DM_OLDEST_TS = null;
let __DM_LOADING_OLDER = false;
let __DM_SEEN_IDS = new Set();
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

async function renderDM(room){
  setMiniLoad('dmMiniLoad','Načítáme zprávy…', true);
  try{ const me=auth.currentUser; if(me){
    db.ref('inboxMeta/'+me.uid+'/'+room+'/unread').set(0);
    db.ref('inboxMeta/'+me.uid+'/'+room+'/lastReadTs').set(Date.now());
  }}catch(e){}
  wireScrollDown('dmFeed','dmScrollDown');

  const box=$('#dmFeed'); if(!box) return;
  box.innerHTML='';
  try{ __DM_SEEN_IDS = new Set(); }catch(e){}
  const stopSeq = startMiniSequence('dmMiniLoad', [
    'Načítám konverzaci…',
    'Šifrujeme chat…',
    'Načítám fotky…',
    'Synchronizuji zprávy…'
  ], 650);
  setupPremiumComposer(room);

  if(DM_REF){ try{ DM_REF.off(); }catch{} }
  __DM_OLDEST_TS = null;
  const ref=db.ref('privateMessages/'+room).orderByChild('ts').limitToLast(40);
  DM_REF = ref;

  // Do not play sounds / notifications for the initial batch.
  let __DM_INITIAL_BATCH_DONE = false;

  // Ensure loader is hidden even on empty rooms
  try{
    ref.once('value').then((s)=>{
      setMiniLoad('dmMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
      if(!s.exists()){
        const empty=document.createElement('div');
        empty.className='muted';
        empty.style.padding='10px 12px';
        empty.textContent='Zatím žádné zprávy v této konverzaci.';
        box.appendChild(empty);
      }
      // Scroll to newest on open
      try{ setTimeout(()=>{ try{ box.scrollTop = box.scrollHeight; }catch(e){} }, 60); }catch(e){}
      __DM_INITIAL_BATCH_DONE = true;
    }).catch(()=>{ setMiniLoad('dmMiniLoad','', false); try{ stopSeq && stopSeq(); }catch(e){} __DM_INITIAL_BATCH_DONE = true; });
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
  ref.on('child_added', (snap)=>{
    setMiniLoad('dmMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){}

    const m=snap.val()||{};
    const key=String(snap.key||'');
    if(!key) return;

    // Dedup (prevents rare double listeners / race conditions)
    try{ if(__DM_SEEN_IDS && __DM_SEEN_IDS.has(key)) return; }catch(e){ if(box.querySelector(`[data-mid="${CSS.escape(key)}"]`)) return; }
    try{ __DM_SEEN_IDS && __DM_SEEN_IDS.add(key); }catch(e){}

    const wasNearBottom = (()=>{
      try{ return (box.scrollHeight - box.scrollTop - box.clientHeight) < 220; }catch(e){ return true; }
    })();

    if(typeof m.ts==='number') __DM_OLDEST_TS = (__DM_OLDEST_TS===null) ? m.ts : Math.min(__DM_OLDEST_TS, m.ts);
    if(m.deleted){
      try{ const ex=box.querySelector(`[data-mid="${CSS.escape(key)}"]`); if(ex) ex.remove(); }catch(e){}
      try{ __DM_SEEN_IDS && __DM_SEEN_IDS.delete(key); }catch(e){}
      return;
    }

    const isMine = !!(auth.currentUser && m.by===auth.currentUser.uid);
    const myPub = (isMine && window.__myPublic) ? window.__myPublic : null;
    const u0 = myPub || {};
    const nick0 = u0.nick || u0.name || '…';
    const avatar0 = safeImgSrc(normalizeAvatarUrl(u0.avatar||''), window.DEFAULT_AVATAR);

    const msgImg = safeImgSrc(m.img,'');
    const isBigDataImg = !!msgImg && msgImg.startsWith('data:image') && msgImg.length > 15000;

    const el=document.createElement('div');
    el.className='msg';
    el.dataset.mid=key;
    try{ el.dataset.ts = String((m&&m.ts)||Date.now()); }catch(e){}

    el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img class="avaImg" src="${esc(avatar0)}" loading="lazy" decoding="async"></div>`+
      `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(m.by)}"><span class="nick">${esc(nick0)}</span></div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
      (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
      (msgImg ? (isBigDataImg ? `<div class="text"><button class="btn tiny showImgBtn">Zobrazit foto</button></div>` : `<div class="text"><img src="${esc(msgImg)}" loading="lazy" decoding="async"></div>`) : '')+
      `</div>`;

    box.appendChild(el);

    if(isBigDataImg){
      try{
        const btn = el.querySelector('.showImgBtn');
        if(btn){
          btn.addEventListener('click', ()=>{
            const wrap = btn.parentElement;
            try{ btn.remove(); }catch(e){}
            if(!wrap) return;
            const im = document.createElement('img');
            im.loading = 'lazy';
            im.decoding = 'async';
            im.src = msgImg;
            wrap.appendChild(im);
          }, {once:true});
        }
      }catch(e){}
    }

    try{ if(wasNearBottom) box.scrollTop = box.scrollHeight; }catch(e){}

    // Resolve profile async (do not block rendering)
    let userPromise = null;
    if(!myPub || !isMine){
      userPromise = resolveMsgUser(m).then(u=>{
        if(!u) return null;
        if(!el.isConnected) return u;
        try{ const imgEl = el.querySelector('.avaImg') || el.querySelector('.ava img'); if(imgEl) imgEl.src = safeImgSrc(normalizeAvatarUrl(u.avatar||''), window.DEFAULT_AVATAR); }catch(e){}
        try{ const nEl = el.querySelector('.name .nick') || el.querySelector('.nick'); if(nEl) nEl.textContent = u.nick || u.name || nEl.textContent; }catch(e){}
        return u;
      }).catch(()=>null);
    }

    // Alerts only for live incoming messages
    if(__DM_INITIAL_BATCH_DONE && !isMine){
      try{ if(document.visibilityState==='visible') playSound('dm'); }catch(e){}
      const fallbackNick = nick0 || 'Uživatel';
      const body0 = (fallbackNick+': '+(m.text||'')).slice(0, 140);
      if(userPromise){
        userPromise.then(u=>{
          const nn = (u && (u.nick||u.name)) ? (u.nick||u.name) : fallbackNick;
          notify('Nová DM', (nn+': '+(m.text||'')).slice(0, 140), 'dm');
        }).catch(()=>{
          notify('Nová DM', body0, 'dm');
        });
      }else{
        notify('Nová DM', body0, 'dm');
      }
    }
  });
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

  // Daily limits (centralized). Do not count bot/system DMs.
  const peerIsBot = String(currentDmPeerUid||'').startsWith('bot_');
  if(!peerIsBot && typeof window.checkLimit === 'function'){
    try{
      const lim = await window.checkLimit('dm');
      if(lim && lim.ok === false){
        toast(lim.msg || 'Limit vyčerpán');
        playSound('err');
        return;
      }
    }catch(e){ console.warn('checkLimit(dm) failed', e); }
  }

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

    // Critical: privateMembers is SELF-WRITE ONLY.
    // Ensure I am a member before writing messages/meta.
    await db.ref('privateMembers/'+room+'/'+me.uid).set(true);

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

    // 4) update inbox meta + unread (room-keyed)
    const preview = (text && text.length) ? text.slice(0,120) : (img ? '📷 Foto' : '');
    const updates={};
    updates[`inboxMeta/${me.uid}/${room}/with`] = currentDmPeerUid;
    updates[`inboxMeta/${me.uid}/${room}/ts`] = ts;
    updates[`inboxMeta/${me.uid}/${room}/lastTs`] = ts;
    updates[`inboxMeta/${me.uid}/${room}/lastText`] = preview;
    updates[`inboxMeta/${me.uid}/${room}/unread`] = 0;
    updates[`inboxMeta/${me.uid}/${room}/lastReadTs`] = ts;

    updates[`inboxMeta/${currentDmPeerUid}/${room}/with`] = me.uid;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/ts`] = ts;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/lastTs`] = ts;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/lastText`] = preview;
    // Mark as unread for the peer (idempotent: 0/1, no cross-user reads needed)
    updates[`inboxMeta/${currentDmPeerUid}/${room}/unread`] = 1;
    await db.ref().update(updates);

    // Notifications: admin-only (MVP). DM unread is tracked in inboxMeta.

    // Increment daily counter (best-effort)
    if(!peerIsBot && typeof window.incLimit === 'function'){
      try{ window.incLimit('dm'); }catch(e){}
    }

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

