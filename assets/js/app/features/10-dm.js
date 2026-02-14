// === DM (strict members) ===
// This module is intentionally structured into 3 layers:
//   1) Subscriptions (DM.subs.*)
//   2) Render (DM.render.*)
//   3) Actions (DM.actions.*)
// This prevents the DM feature from turning into a silent monolith.

function dmKey(a,b){ return [a,b].sort().join('_'); }

async function resolveUidByEmail(email){
  // Email lookup intentionally disabled (privacy).
  return null;
}

// ---------------------------------------------------------------------------
// DM state persistence (single source of truth: MK.state + restore-only storage)
// ---------------------------------------------------------------------------
// mk_dm_mode: 'list' | 'thread'
// mk_dm_peer: peer uid when mode === 'thread'
function setDmState(mode, peer){
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
  try{
    if(window.MK && window.MK.state && window.MK.state.dm){
      const dm = window.MK.state.dm;
      const mode = (dm.mode==='thread') ? 'thread' : 'list';
      const peer = String(dm.peer||'').trim();
      return { mode, peer };
    }
  }catch(e){}
  try{
    const mode = (localStorage.getItem('mk_dm_mode')||'list').trim() || 'list';
    const peer = (localStorage.getItem('mk_dm_peer')||'').trim();
    return { mode: (mode==='thread'?'thread':'list'), peer };
  }catch(e){
    return { mode:'list', peer:'' };
  }
}

// ---------------------------------------------------------------------------
// DM globals (kept for backward compatibility: stage5 + other legacy modules)
// ---------------------------------------------------------------------------
// NOTE: These globals are read in features/17-stage5.js (DM threads UI).
// Do NOT remove without migrating that code.
let currentDmRoom = null;
let currentDmPeerUid = null;

// ---------------------------------------------------------------------------
// Namespace
// ---------------------------------------------------------------------------
(function initDmNamespace(){
  const MK = (window.MK = window.MK || {});
  const DM = (MK.dm = MK.dm || {});
  DM.state = DM.state || {};
  DM.subs = DM.subs || {};
  DM.render = DM.render || {};
  DM.actions = DM.actions || {};
})();

(function dmModule(){
  const DM = window.MK.dm;

  // ---------------------------
  // DM.state
  // ---------------------------
  DM.state.roomRef = null;
  DM.state.room = null;
  DM.state.peerUid = null;
  DM.state.oldestTs = null;
  DM.state.loadingOlder = false;
  DM.state.pendingImg = null;

  DM.state.threadsRef = null;
  DM.state.threadsCb = null;
  DM.state.threadsTimer = null;

  function _syncGlobals(){
    try{ currentDmRoom = DM.state.room || null; }catch(e){}
    try{ currentDmPeerUid = DM.state.peerUid || null; }catch(e){}
  }

  // ---------------------------
  // Helpers (XSS-safe)
  // ---------------------------
  function safeImgSrc(url, fallback){
    try{
      url = String(url||'').trim();
      fallback = String(fallback||'').trim();
      if(!url) return fallback;
      // Allow:
      // - https/http (Firebase Storage download URLs)
      // - data:image/* (client previews)
      // - blob: (local previews)
      // - relative paths (bundled assets)
      if(url.startsWith('https://') || url.startsWith('http://') || url.startsWith('blob:')) return url;
      if(url.startsWith('data:image/')) return url;
      if(url.startsWith('/') || url.startsWith('./') || url.startsWith('assets/')) return url;
      return fallback;
    }catch(e){
      return fallback || '';
    }
  }

  // ===========================================================================
  // DM.render
  // ===========================================================================
  DM.render.messageEl = function(mid, m, u){
    const el = document.createElement('div');
    el.className = 'msg';
    if(mid) el.dataset.mid = String(mid);
    try{ el.dataset.ts = String((m&&m.ts)||Date.now()); }catch(e){}

    const ava = document.createElement('div');
    ava.className = 'ava';
    try{ ava.dataset.uid = String(m.by||''); }catch(e){}

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = safeImgSrc(u?.avatar || window.DEFAULT_AVATAR, window.DEFAULT_AVATAR);
    img.onerror = ()=>{ try{ img.src = window.DEFAULT_AVATAR; }catch(e){} };
    ava.appendChild(img);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const meta = document.createElement('div');
    meta.className = 'meta';

    const name = document.createElement('div');
    name.className = 'name';
    try{ name.dataset.uid = String(m.by||''); }catch(e){}
    name.textContent = (u && (u.nick||u.name)) ? String(u.nick||u.name) : 'Uživatel';

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = fmtTime((m && m.ts) ? m.ts : 0);

    meta.appendChild(name);
    meta.appendChild(time);
    bubble.appendChild(meta);

    if(m && typeof m.text === 'string' && m.text.trim().length){
      const t = document.createElement('div');
      t.className = 'text';
      t.textContent = m.text;
      bubble.appendChild(t);
    }

    if(m && typeof m.img === 'string' && m.img.trim().length){
      const wrap = document.createElement('div');
      wrap.className = 'text';
      const im = document.createElement('img');
      im.loading = 'lazy';
      im.alt = '';
      im.src = safeImgSrc(m.img, '');
      wrap.appendChild(im);
      bubble.appendChild(wrap);
    }

    el.appendChild(ava);
    el.appendChild(bubble);
    return el;
  };

  DM.render.emptyRoom = function(box){
    if(!box) return;
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.style.padding = '10px 12px';
    empty.textContent = 'Zatím žádné zprávy v této konverzaci.';
    box.appendChild(empty);
  };

  // ===========================================================================
  // DM.subs
  // ===========================================================================

  DM.subs.detachRoom = function(){
    try{ if(DM.state.roomRef){ DM.state.roomRef.off(); } }catch(e){}
    DM.state.roomRef = null;
    DM.state.oldestTs = null;
    DM.state.loadingOlder = false;
  };

  DM.subs.attachRoom = function(room){
    const box = document.getElementById('dmFeed');
    if(!box) return;

    DM.subs.detachRoom();
    DM.state.oldestTs = null;
    DM.state.loadingOlder = false;

    const ref = db.ref('privateMessages/'+room).limitToLast(40);
    DM.state.roomRef = ref;

    // Unified registry (tab-scoped): DM room stream
    try{ window.MK?.subs?.set('tab:view-dm', 'dmRoom', ()=>{ try{ ref.off(); }catch(e){} }); }catch(e){}

    // Ensure loader hides even on empty rooms
    try{
      ref.once('value').then((s)=>{
        setMiniLoad('dmMiniLoad','', false);
        if(!s.exists()) DM.render.emptyRoom(box);
        setTimeout(()=>{ try{ box.scrollTop = box.scrollHeight; }catch(e){} }, 80);
      }).catch(()=>{ setMiniLoad('dmMiniLoad','', false); });
    }catch(e){}

    // Load older by 20 on scroll top
    box.onscroll = async ()=>{
      if(DM.state.loadingOlder) return;
      if(box.scrollTop > 10) return;
      if(!DM.state.oldestTs) return;
      DM.state.loadingOlder = true;
      const stopOlder = startMiniSequence('dmMiniLoad', ['Načítám starší DM…','Dešifruji…','Synchronizace…'], 650);
      try{
        const olderSnap = await db.ref('privateMessages/'+room)
          .orderByChild('ts')
          .endBefore(DM.state.oldestTs)
          .limitToLast(20)
          .get();
        const older = olderSnap.val()||{};
        const items = Object.entries(older)
          .map(([k,v])=>({k,v}))
          .sort((a,b)=>(a.v.ts||0)-(b.v.ts||0));
        const prevH = box.scrollHeight;
        for(const it of items){
          const m=it.v||{};
          if(!m || m.deleted) continue;
          if(typeof m.ts==='number') DM.state.oldestTs = Math.min(DM.state.oldestTs, m.ts);
          if(box.querySelector(`[data-mid="${it.k}"]`)) continue;
          const u = await resolveMsgUser(m);
          const el = DM.render.messageEl(it.k, m, u);
          box.insertBefore(el, box.firstChild);
        }
        const newH = box.scrollHeight;
        box.scrollTop = newH - prevH;
      }catch(e){ console.warn(e); }
      finally{
        setMiniLoad('dmMiniLoad','', false);
        try{ stopOlder && stopOlder(); }catch(e){}
        DM.state.loadingOlder = false;
      }
    };

    ref.on('child_added', async (snap)=>{
      setMiniLoad('dmMiniLoad','', false);
      const m = snap.val()||{};
      const wasAtBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 240;
      if(typeof m.ts==='number'){
        DM.state.oldestTs = (DM.state.oldestTs===null) ? m.ts : Math.min(DM.state.oldestTs, m.ts);
      }
      const u = await resolveMsgUser(m);
      const el = DM.render.messageEl(snap.key, m, u);
      box.appendChild(el);
      if(wasAtBottom){ try{ box.scrollTop = box.scrollHeight; }catch(e){} }

      // If user is reading at the bottom, update lastReadTs (thread-level unread).
      try{
        const me = auth.currentUser;
        if(me && wasAtBottom){
          await db.ref('inboxMeta/'+me.uid+'/'+room).update({ unread:0, lastReadTs: Date.now() });
        }
      }catch(e){}

      // Do not ping on my own messages
      try{ const me=auth.currentUser; if(me && m.by === me.uid) return; }catch(e){}

      playSound('dm');
      notify('Nová DM', (u.nick||'Uživatel')+': '+(m.text||''));
    });
  };

  // Threads live refresher (while DM tab is open)
  function _stopThreadsLive(){
    try{ if(DM.state.threadsRef && DM.state.threadsCb) DM.state.threadsRef.off('value', DM.state.threadsCb); }catch(e){}
    DM.state.threadsRef = null;
    DM.state.threadsCb = null;
    if(DM.state.threadsTimer) clearTimeout(DM.state.threadsTimer);
    DM.state.threadsTimer = null;
  }

  function _startThreadsLive(uid){
    _stopThreadsLive();
    if(!uid) return;
    DM.state.threadsRef = db.ref('inboxMeta/'+uid);
    DM.state.threadsCb = ()=>{
      if(DM.state.threadsTimer) clearTimeout(DM.state.threadsTimer);
      DM.state.threadsTimer = setTimeout(()=>{
        try{ if(window.MK?.state?.currentView !== 'view-dm') return; }catch(e){}
        try{ if(typeof window.loadDmThreads === 'function') window.loadDmThreads(); }catch(e){}
      }, 80);
    };
    DM.state.threadsRef.on('value', DM.state.threadsCb);
    try{ window.MK?.subs?.set('tab:view-dm', 'dmThreadsLive', _stopThreadsLive); }catch(e){}
  }

  DM.subs.startThreadsLive = _startThreadsLive;
  DM.subs.stopThreadsLive = _stopThreadsLive;

  // Called by router when entering the DM tab (lazy)
  DM.subs.onEnterView = function(opts){
    opts = opts || {};
    // If user navigates to DM without selecting a thread, we are in LIST mode.
    // During restore-after-reload we keep the previously saved dmMode.
    try{ if(!opts.keepDmState && !window.__RESTORING_VIEW__) setDmState('list', null); }catch(e){}
    try{ if(!opts.keepDmState && !window.__RESTORING_VIEW__) DM.actions.resetThreadState(); }catch(e){}
    try{ if(!opts.keepDmState && !window.__RESTORING_VIEW__) document.body.classList.remove('dm-room-open'); }catch(e){}

    try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}

    const me = auth?.currentUser;
    if(!me){
      // keep DM painted with a loader, do NOT force auth modal here
      try{ window.__DM_NEEDS_LOAD__ = true; }catch(e){}
      return;
    }

    try{ DM.actions.ensureInboxLoaded('tab-enter'); }catch(e){}
    try{ DM.subs.startThreadsLive(me.uid); }catch(e){}
  };

  // ===========================================================================
  // DM.actions
  // ===========================================================================

  DM.actions.resetThreadState = function(){
    try{ setDmState('list', null); }catch(e){}
    try{ window.__DM_ROOM_RESTORED__ = false; window.__DM_RESTORE_PEER__=''; }catch(e){}
    DM.state.room = null;
    DM.state.peerUid = null;
    _syncGlobals();
  };

  // open a DM thread (room)
  DM.actions.openRoom = async function(a,b,opts){
    const me = auth?.currentUser;
    if(!me){
      window.__PENDING_VIEW__ = 'view-dm';
      try{ openModalAuth('login'); }catch(e){ try{ document.getElementById('modalAuth').hidden=false; }catch(_){} }
      return;
    }
    if(!a || !b) return;
    if(a===b) return;

    // Remember last DM peer/room for reload restore
    try{
      const peer = (a===me.uid) ? b : (b===me.uid ? a : b);
      try{ setDmState('thread', peer); }catch(e){}
      try{
        const roomId = dmKey(me.uid, peer);
        if(roomId){
          if(window.MK && window.MK.persist && window.MK.persist.dmLastRoom) window.MK.persist.dmLastRoom(roomId);
          else localStorage.setItem('mk_last_dm_room', roomId);
        }
      }catch(e){}
    }catch(e){}

    try{ closeAllOverlays({keep:null}); }catch(e){}
    try{ showView('view-dm'); }catch(e){}
    try{ if(isMobileViewport()) document.body.classList.add('dm-room-open'); }catch(e){}

    const meUid = auth.currentUser ? auth.currentUser.uid : null;
    const peerUid = (meUid && meUid===a) ? b : (meUid && meUid===b ? a : b);
    if(!meUid || !peerUid || peerUid===meUid) return;

    const room = dmKey(meUid, peerUid);
    DM.state.room = room;
    DM.state.peerUid = peerUid;
    _syncGlobals();

    // Critical: privateMembers is SELF-WRITE ONLY. Never add the other participant.
    try{ await db.ref('privateMembers/'+room+'/'+meUid).set(true); }catch(e){}

    // index rooms per user (for admin cleanup tools) — self only
    try{ await db.ref('privateRoomsByUser/'+meUid+'/'+room).set(true); }catch(e){}

    // Ensure inbox thread exists for ME only.
    // IMPORTANT: do NOT overwrite peer's inboxMeta here.
    const now = Date.now();
    const up = {};
    up[`inboxMeta/${meUid}/${room}`] = { with: peerUid, lastTs: now, lastText: '(open)', lastBy: meUid, unread: 0 };
    await db.ref().update(up);

    DM.render.room(room);
  };

  // Keep global alias
  window.openDMRoom = DM.actions.openRoom;

  // Render room (attach listeners)
  DM.render.room = async function(room){
    setMiniLoad('dmMiniLoad','Načítáme zprávy…', true);

    // Mark thread as read (owner-only). Do NOT let peer write lastReadTs.
    try{
      const me = auth.currentUser;
      if(me){
        await db.ref('inboxMeta/'+me.uid+'/'+room).update({ unread: 0, lastReadTs: Date.now() });
      }
    }catch(e){}

    wireScrollDown('dmFeed','dmScrollDown');

    const box = document.getElementById('dmFeed');
    if(!box) return;
    box.innerHTML = '';

    const stopSeq = startMiniSequence('dmMiniLoad', [
      'Načítám konverzaci…',
      'Šifrujeme chat…',
      'Načítám fotky…',
      'Synchronizuji zprávy…'
    ], 650);

    showPremiumBotPanel(room);

    // detach old listeners
    DM.subs.detachRoom();

    // Attach new stream
    DM.subs.attachRoom(room);

    // Loader is cleared by room stream, but keep a failsafe
    setTimeout(()=>{ try{ stopSeq && stopSeq(); }catch(e){} try{ setMiniLoad('dmMiniLoad','', false); }catch(e){} }, 2500);
  };

  // --- Premium bot helpers ---
  function isPremiumBotRoom(room){
    const u = auth.currentUser; if(!u) return false;
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

  window.showPremiumBotPanel = showPremiumBotPanel;

  async function openPremiumBot(){
    const u = auth.currentUser;
    if(!u) return toast('Nejprve se přihlaste');
    // New flow (no DM dependency): open dedicated privileges modal if available
    try{ if(window.openPremiumModal) return window.openPremiumModal(); }catch(e){}
    // Legacy fallback: open DM with premium bot
    DM.actions.openRoom(u.uid, PREMIUM_BOT_UID);
    showView('view-dm');
    const room = dmKey(u.uid, PREMIUM_BOT_UID);
    showPremiumBotPanel(room);
  }

  window.openPremiumBot = openPremiumBot;

  // ---------------------------------------------------------------------------
  // Inbox entry-points (moved from routing.js to keep router slim)
  // ---------------------------------------------------------------------------

  DM.actions.openInbox = async function(forceReload=true){
    const me = auth?.currentUser;
    if(!me){
      // If auth is still initializing, do NOT force-auth modal.
      if(!window.__AUTH_READY__){
        window.__PENDING_VIEW__ = 'view-dm';
        try{ window.__DM_NEEDS_LOAD__ = true; }catch(e){}
        try{ setHashSafe('dm'); }catch(e){}
        try{ showView('view-dm'); }catch(e){}
        try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
        return;
      }
      window.__PENDING_VIEW__ = 'view-dm';
      try{ openModalAuth('login'); }catch(e){}
      return;
    }

    try{ setHashSafe('dm'); }catch(e){}
    // Force-enter ensures the router calls onEnterView and starts tab subscriptions.
    try{ showView('view-dm', { forceEnter:true, keepDmState: !forceReload }); }catch(e){ try{ showView('view-dm'); }catch(_){} }

    // Optional hard reset to LIST mode
    if(forceReload){
      try{ DM.actions.resetThreadState(); }catch(e){}
      try{ document.body.classList.remove('dm-room-open'); }catch(e){}
    }

    // Kick the loader and ensure inbox
    try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
    setTimeout(()=>{ try{ DM.actions.ensureInboxLoaded('openInbox'); }catch(e){} }, 0);
  };

  DM.actions.openByUid = async function(toUid){
    const peer = String(toUid||'').trim();
    if(!peer) return;

    const me = auth?.currentUser;
    if(!me){
      // If auth still booting, queue intent instead of forcing auth modal
      if(!window.__AUTH_READY__){
        window.__PENDING_VIEW__ = 'view-dm';
        window.__PENDING_DM_PEER__ = peer;
        try{ showView('view-dm'); }catch(e){}
        try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
        return;
      }
      window.__PENDING_VIEW__ = 'view-dm';
      window.__PENDING_DM_PEER__ = peer;
      try{ openModalAuth('login'); }catch(e){}
      return;
    }

    try{ showView('view-dm', { forceEnter:true, keepDmState:true }); }catch(e){}

    try{
      if(typeof window.startDM === 'function'){
        await window.startDM(peer);
      }
      DM.actions.openRoom(me.uid, peer);
    }catch(e){ console.error(e); }
  };

  // Ensure DM inbox loads after reload without requiring tab switching.
  DM.actions.ensureInboxLoaded = function(reason){
    try{
      const dmView = document.getElementById('view-dm');
      if(!dmView || !dmView.classList.contains('active')) return;

      const me = auth?.currentUser;
      if(!me){
        try{ window.__DM_NEEDS_LOAD__ = true; }catch(e){}
        return;
      }

      // If threads already rendered, just ensure loader is hidden
      try{
        const box = document.getElementById('dmThreads');
        if(box && box.children && box.children.length>0){
          setMiniLoad('dmMiniLoad','', false);
          return;
        }
      }catch(e){}

      if(window.__dmThreadsLoading) return;
      window.__dmThreadsLoading = true;

      setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true);

      Promise.resolve().then(()=>{
        try{ return (window.loadDmThreads ? window.loadDmThreads(true) : null); }catch(e){ return null; }
      }).catch(()=>{}).finally(()=>{
        window.__dmThreadsLoading = false;
        setTimeout(()=>{ try{ setMiniLoad('dmMiniLoad','', false); }catch(e){} }, 50);
      });

      // Extra hard-timeout
      setTimeout(()=>{
        try{
          if(window.__dmThreadsLoading){
            window.__dmThreadsLoading = false;
            setMiniLoad('dmMiniLoad','', false);
          }
        }catch(e){}
      }, 3500);

    }catch(e){}
  };

  // ---------------------------------------------------------------------------
  // Send (actions)
  // ---------------------------------------------------------------------------

  DM.actions.sendCurrent = async function(){
    const me = auth.currentUser;
    if(!me){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(me.emailVerified===false){
      const until = getVerifyDeadline(me);
      if(until && Date.now()>until){
        window.__EMAIL_VERIFY_REQUIRED__=true;
        toast('Potvrzení e-mailu vypršelo.');
        openModalAuth('login');
        return;
      }
    }

    const peerIsBot = String(DM.state.peerUid||currentDmPeerUid||'').startsWith('bot_');

    // Daily limits (centralized). Do not count bot/system DMs.
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

    if(!DM.state.room || !DM.state.peerUid){
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
      const text = (document.getElementById('dmText')?.value || '').trim();
      const img = DM.state.pendingImg;
      if(!text && !img) return;

      const room = DM.state.room;
      const peerUid = DM.state.peerUid;
      const ts = Date.now();

      // Ensure I am a member before writing
      await db.ref('privateMembers/'+room+'/'+me.uid).set(true);

      // If peer hasn't joined the room yet, first message becomes a DM request.
      if(!peerIsBot){
        let peerMember = false;
        try{
          const pm = await db.ref('privateMembers/'+room+'/'+peerUid).get();
          peerMember = pm.val() === true;
        }catch(e){}

        if(!peerMember){
          // Auto-accept if there's an incoming request from this peer
          try{
            const inc = await db.ref('dmRequests/'+me.uid+'/'+peerUid).get();
            if(inc.exists()){
              const up = {};
              up['dmRequests/'+me.uid+'/'+peerUid] = null;
              up['privateMembers/'+room+'/'+me.uid] = true;

              up[`inboxMeta/${me.uid}/${room}/with`] = peerUid;
              up[`inboxMeta/${me.uid}/${room}/lastReadTs`] = ts;

              up[`inboxMeta/${peerUid}/${room}/with`] = me.uid;
              await db.ref().update(up);
              toast('Žádost přijata');
            }else{
              const previewReq = (text && text.length) ? text.slice(0,180) : (img ? '📷 Foto' : '');
              const up = {};
              up[`dmRequests/${peerUid}/${me.uid}`] = { from: me.uid, ts, textPreview: previewReq };

              up[`inboxMeta/${me.uid}/${room}/with`] = peerUid;
              up[`inboxMeta/${me.uid}/${room}/ts`] = ts;
              up[`inboxMeta/${me.uid}/${room}/lastTs`] = ts;
              up[`inboxMeta/${me.uid}/${room}/lastText`] = previewReq;
              up[`inboxMeta/${me.uid}/${room}/unread`] = 0;
              up[`inboxMeta/${me.uid}/${room}/lastReadTs`] = ts;

              await db.ref().update(up);

              // Reset composer
              DM.state.pendingImg = null;
              try{ document.getElementById('dmText').value = ''; }catch(e){}
              toast('Žádost o zprávu odeslána');
              try{ const stEl = document.getElementById('dmWithStatus'); if(stEl) stEl.textContent = 'Čeká na přijetí…'; }catch(e){}
              return;
            }
          }catch(e){ console.warn('dmRequest send/accept failed', e); }
        }
      }

      // write message
      await db.ref('privateMessages/'+room).push({ by: me.uid, ts, text: (text||null), img: (img||null) });

      // update inbox meta + unread
      const preview = (text && text.length) ? text.slice(0,120) : (img ? '📷 Foto' : '');
      const updates = {};
      updates[`inboxMeta/${me.uid}/${room}/with`] = peerUid;
      updates[`inboxMeta/${me.uid}/${room}/ts`] = ts;
      updates[`inboxMeta/${me.uid}/${room}/lastTs`] = ts;
      updates[`inboxMeta/${me.uid}/${room}/lastText`] = preview;
      updates[`inboxMeta/${me.uid}/${room}/unread`] = 0;

      updates[`inboxMeta/${peerUid}/${room}/with`] = me.uid;
      updates[`inboxMeta/${peerUid}/${room}/ts`] = ts;
      updates[`inboxMeta/${peerUid}/${room}/lastTs`] = ts;
      updates[`inboxMeta/${peerUid}/${room}/lastText`] = preview;
      await db.ref().update(updates);

      // increment unread for peer
      try{ await db.ref(`inboxMeta/${peerUid}/${room}/unread`).transaction(n=> (n||0)+1); }catch(e){}

      // Increment daily counter (best-effort)
      if(!peerIsBot && typeof window.incLimit === 'function'){
        try{ window.incLimit('dm'); }catch(e){}
      }

      try{ document.getElementById('dmText').value=''; }catch(e){}
      try{ document.getElementById('dmPhoto').value=''; }catch(e){}
      DM.state.pendingImg = null;
      toast('Odesláno');
      playSound('ok');
      try{ const feed=document.getElementById('dmFeed'); if(feed) feed.scrollTop = feed.scrollHeight; }catch(e){}

    }catch(e){ console.error(e); playSound('err'); }
  };

  // ---------------------------------------------------------------------------
  // Wire UI events
  // ---------------------------------------------------------------------------
  document.getElementById('dmOpen')?.addEventListener('click', async ()=>{
    try{ await DM.actions.openInbox(true); }catch(e){
      const me = auth.currentUser;
      if(!me){ openModalAuth('login'); return; }
      showView('view-dm');
      try{ if(window.loadDmThreads) window.loadDmThreads(true); }catch(_){ }
    }
  });

  document.getElementById('dmPhoto')?.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f){ DM.state.pendingImg = null; return; }
    DM.state.pendingImg = await fileToDataURL(f);
    toast('Foto přidáno do DM. Stiskněte Odeslat.');
    playSound('ok');
  });

  document.getElementById('dmSend')?.addEventListener('click', ()=>{ DM.actions.sendCurrent(); });

  // ---------------------------------------------------------------------------
  // Tab lifecycle support: detach listeners when leaving DM tab
  // ---------------------------------------------------------------------------
  window.__dmUnsub = function(){
    try{ window.MK?.subs?.clear('tab:view-dm'); }catch(e){}
    try{ DM.subs.detachRoom(); }catch(e){}
    try{ DM.subs.stopThreadsLive(); }catch(e){}
    try{ window.__dmThreadsLoading = false; }catch(e){}
    try{ document.body.classList.remove('dm-room-open'); }catch(e){}
    try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){}
  };

  // Keep legacy globals available
  window.startDmThreadsLive = DM.subs.startThreadsLive;
  window.stopDmThreadsLive = DM.subs.stopThreadsLive;
  window.watchDmThreadsLive = DM.subs.startThreadsLive;

  // Keep global aliases used across the app
  window.openDMInbox = async (forceReload=true)=> DM.actions.openInbox(forceReload);
  window.openDM = async (uid)=> DM.actions.openByUid(uid);
  window.ensureDMInboxLoaded = (reason)=> DM.actions.ensureInboxLoaded(reason);
})();
