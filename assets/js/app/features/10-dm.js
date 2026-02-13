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

  // Ensure inbox thread exists for BOTH sides so the conversation shows immediately.
  // For the peer: we write `with = meUid` (required by rules for cross-user inboxMeta writes).
  try{
    const now=Date.now();
    const up={};
    up['inboxMeta/'+meUid+'/'+room+'/with']=peerUid;
    up['inboxMeta/'+peerUid+'/'+room+'/with']=meUid;
    up['inboxMeta/'+meUid+'/'+room+'/lastTs']=now;
    up['inboxMeta/'+peerUid+'/'+room+'/lastTs']=now;
    up['inboxMeta/'+meUid+'/'+room+'/ts']=now;
    up['inboxMeta/'+peerUid+'/'+room+'/ts']=now;
    // do NOT bump unread here (only on new messages)
    up['inboxMeta/'+meUid+'/'+room+'/unread']=0;
    await db.ref().update(up);
  }catch(e){}
  // render
  renderDM(room);
}

// Expose the DM opener globally (inbox click handlers call window.openDMRoom)
window.openDMRoom = openDMRoom;

async function renderDM(room){
  setMiniLoad('dmMiniLoad','Načítáme zprávy…', true);
  // Mark thread as read (owner-only). Do NOT let peer write lastReadTs.
  try{
    const me=auth.currentUser;
    if(me){
      await db.ref('inboxMeta/'+me.uid+'/'+room).update({
        unread: 0,
        lastReadTs: Date.now()
      });
    }
  }catch(e){}
  wireScrollDown('dmFeed','dmScrollDown');

  const box=$('#dmFeed'); if(!box) return;
  box.innerHTML='';
  const stopSeq = startMiniSequence('dmMiniLoad', [
    'Načítám konverzaci…',
    'Šifrujeme chat…',
    'Načítám fotky…',
    'Synchronizuji zprávy…'
  ], 650);
  showPremiumBotPanel(room);

  if(DM_REF){ try{ DM_REF.off(); }catch{} }
  __DM_OLDEST_TS = null;
  const ref=db.ref('privateMessages/'+room).limitToLast(40);
  DM_REF = ref;

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
      // Always land on the newest message when opening the room (login/F5/navigation)
      setTimeout(()=>{ try{ box.scrollTop = box.scrollHeight; }catch(e){} }, 80);
    }).catch(()=>{ setMiniLoad('dmMiniLoad','', false); try{ stopSeq && stopSeq(); }catch(e){} });
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
      for(const it of items){
        const m=it.v||{};
        if(!m || m.deleted) continue;
        if(typeof m.ts==='number') __DM_OLDEST_TS = Math.min(__DM_OLDEST_TS, m.ts);
        if(box.querySelector(`[data-mid="${it.k}"]`)) continue;
        const u = await resolveMsgUser(m);
        const el=document.createElement('div'); el.className='msg'; el.dataset.mid=it.k;
        try{ el.dataset.ts = String((it.v&&it.v.ts)||Date.now()); }catch(e){}
        el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
          `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
          (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
          (m.img?`<div class="text"><img src="${esc(m.img)}"></div>`:'')+
          `</div>`;
        box.insertBefore(el, box.firstChild);
      }
      const newH = box.scrollHeight;
      box.scrollTop = newH - prevH;
    }catch(e){ console.warn(e); }
    finally{ setMiniLoad('dmMiniLoad','', false); try{ stopOlder && stopOlder(); }catch(e){} __DM_LOADING_OLDER=false; }
  };
  ref.on('child_added', async snap=>{
    setMiniLoad('dmMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){}
    const wasAtBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 240;
    const m=snap.val()||{};
    if(typeof m.ts==='number') __DM_OLDEST_TS = (__DM_OLDEST_TS===null) ? m.ts : Math.min(__DM_OLDEST_TS, m.ts);
    const u = await resolveMsgUser(m);
    const el=document.createElement('div'); el.className='msg'; el.dataset.mid=snap.key;
    el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
      (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
      (m.img?`<div class="text"><img src="${esc(m.img)}"></div>`:'')+
      `</div>`;
    box.appendChild(el);
    if(wasAtBottom) { try{ box.scrollTop = box.scrollHeight; }catch(e){} }
    // If user is reading at the bottom, update lastReadTs (thread-level unread).
    try{
      const me=auth.currentUser;
      if(me && wasAtBottom){
        await db.ref('inboxMeta/'+me.uid+'/'+room).update({ unread:0, lastReadTs: Date.now() });
      }
    }catch(e){}

    // Do not ping on my own messages
    try{
      const me=auth.currentUser;
      if(me && m.by === me.uid) return;
    }catch(e){}

    playSound('dm');
    notify('Nová DM', (u.nick||'Uživatel')+': '+(m.text||''));
  });
}
// --- Premium bot helpers ---
function isPremiumBotRoom(room){
  const u=auth.currentUser; if(!u) return false;
  const botRoom = dmKey(u.uid, PREMIUM_BOT_UID);
  return room === botRoom;
}

function showPremiumBotPanel(room){
  const panel = document.getElementById('botPremiumPanel');
  if(!panel) return;
  const is = isPremiumBotRoom(room);
  panel.style.display = is ? 'block' : 'none';
  try{ panel.classList.toggle('bot-sticky', is); }catch(e){}
  if(!is) return;

  const stepEl = document.getElementById('botPremiumStep');
  const actions = document.getElementById('botPremiumActions');
  const hint = document.getElementById('botPremiumHint');

  if(stepEl) stepEl.textContent = 'Privilegia';
  if(hint) hint.textContent = 'Nákup privilegií byl přesunut do okna Privilegia. Vyber plán, zobrazí se QR a můžeš nahrát screenshot platby.';

  if(actions){
    actions.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn primary';
    b.textContent = 'Otevřít Privilegia';
    b.onclick = ()=>{
      try{
        if(window.openPremiumModal) window.openPremiumModal();
        else if(window.openPremiumBot) window.openPremiumBot();
      }catch(e){}
    };
    actions.appendChild(b);
  }
}

async function openPremiumBot(){
  const u=auth.currentUser;
  if(!u) return toast('Nejprve se přihlaste');
  // New flow (no DM dependency): open dedicated privileges modal if available
  try{
    if(window.openPremiumModal) return window.openPremiumModal();
  }catch(e){}

  // Legacy fallback: open DM with premium bot
  openDMRoom(u.uid, PREMIUM_BOT_UID);
  showView('view-dm');
  const room = dmKey(u.uid, PREMIUM_BOT_UID);
  showPremiumBotPanel(room);
}

$('#dmOpen')?.addEventListener('click', async ()=>{
  try{ await window.openDMInbox?.(true); }catch(e){
    const me=auth.currentUser;
    if(!me){ openModalAuth('login'); return; }
    showView('view-dm');
    try{ if(window.loadDmThreads) window.loadDmThreads(true); }catch(_){ }
  }
});
let pendingDmImg=null;
$('#dmPhoto')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  if(!f){ pendingDmImg=null; return; }
  pendingDmImg = await fileToDataURL(f);
  toast('Foto přidáno do DM. Stiskněte Odeslat.');
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
    if(!text && !img) return;

    const room=currentDmRoom;
    const ts=Date.now();

    // Critical: privateMembers is SELF-WRITE ONLY.
    // Ensure I am a member before writing messages/meta.
    await db.ref('privateMembers/'+room+'/'+me.uid).set(true);

    // 3) write message
    await db.ref('privateMessages/'+room).push({by:me.uid, ts, text: text||null, img: img||null});

    // 4) update inbox meta + unread (room-keyed)
    const preview = (text && text.length) ? text.slice(0,120) : (img ? '📷 Foto' : '');
    const updates={};
    updates[`inboxMeta/${me.uid}/${room}/with`] = currentDmPeerUid;
    updates[`inboxMeta/${me.uid}/${room}/ts`] = ts;
    updates[`inboxMeta/${me.uid}/${room}/lastTs`] = ts;
    updates[`inboxMeta/${me.uid}/${room}/lastText`] = preview;
    updates[`inboxMeta/${me.uid}/${room}/unread`] = 0;

    updates[`inboxMeta/${currentDmPeerUid}/${room}/with`] = me.uid;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/ts`] = ts;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/lastTs`] = ts;
    updates[`inboxMeta/${currentDmPeerUid}/${room}/lastText`] = preview;
    await db.ref().update(updates);

    // increment unread for peer (transaction)
    try{
      await db.ref(`inboxMeta/${currentDmPeerUid}/${room}/unread`).transaction(n=> (n||0)+1);
    }catch(e){}

    // Notifications: admin-only (MVP). DM unread is tracked in inboxMeta.

    // Increment daily counter (best-effort)
    if(!peerIsBot && typeof window.incLimit === 'function'){
      try{ window.incLimit('dm'); }catch(e){}
    }

    if($('#dmText')) $('#dmText').value='';
    if($('#dmPhoto')) $('#dmPhoto').value='';
    pendingDmImg=null;
    toast('Odesláno'); playSound('ok');
    // Do NOT re-render the whole room after sending (it caused "reload"/jump on mobile)
    try{ const feed=document.getElementById('dmFeed'); if(feed) feed.scrollTop = feed.scrollHeight; }catch(e){}
  }catch(e){ console.error(e); playSound('err'); }
});

// Tab lifecycle support: detach the currently opened DM room listener
// when leaving the DM tab (prevents duplicates + background streaming).
window.__dmUnsub = function(){
  try{ if(DM_REF){ DM_REF.off(); DM_REF=null; } }catch(e){}
  try{ window.__dmThreadsLoading = false; }catch(e){}
  try{ document.body.classList.remove('dm-room-open'); }catch(e){}
  try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){}
};


// ==== DM THREADS LIVE (view-dm lazy subscription) ====
// Moved from 06-notifications.js to keep that module slim.
let __dmThreadsRef = null;
let __dmThreadsCb = null;
let __dmThreadsTimer = null;

function startDmThreadsLive(uid){
  stopDmThreadsLive();
  if(!uid) return;
  __dmThreadsRef = db.ref('inboxMeta/'+uid);
  __dmThreadsCb = ()=>{
    if(__dmThreadsTimer) clearTimeout(__dmThreadsTimer);
    __dmThreadsTimer = setTimeout(()=>{
      try{
        if(window.MK?.state?.currentView !== 'view-dm') return;
        if(typeof window.loadDmThreads === 'function') window.loadDmThreads();
      }catch(e){}
    }, 80);
  };
  __dmThreadsRef.on('value', __dmThreadsCb);
}

function stopDmThreadsLive(){
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