// Feature: DM inbox (threads) + startDM + mobile DM overlay UX
// Extracted from former Stage5 monolith to reduce duplication and hidden listeners.

(function mkDmInboxModule(){
  if(window.__MK_DM_INBOX__) return;
  window.__MK_DM_INBOX__ = true;

  // Ensure flags exist (used by router/restore)
  if(typeof window.__DM_NEEDS_LOAD__ === 'undefined') window.__DM_NEEDS_LOAD__ = false;
  if(typeof window.__DM_RESTORE_PEER__ === 'undefined') window.__DM_RESTORE_PEER__ = '';
  if(typeof window.__DM_ROOM_RESTORED__ === 'undefined') window.__DM_ROOM_RESTORED__ = false;

  // DM mobile back/close
  function _dmBackToList(){
    try{ setDmState('list', null); }catch(e){}
    try{ window.__DM_RESTORE_PEER__=''; window.__DM_ROOM_RESTORED__=false; }catch(e){}
    try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){}
    try{ document.getElementById('dmBackMobile') && (document.getElementById('dmBackMobile').style.display='none'); }catch(e){}
    try{ document.body.classList.remove('dm-room-open'); }catch(e){}
  }
  document.getElementById('dmBackMobile')?.addEventListener('click', _dmBackToList);
  document.getElementById('dmMobileClose')?.addEventListener('click', ()=>{ try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){} });

  // "New DM" button – UID only (email search removed for privacy)
  document.getElementById('dmNewBtn')?.addEventListener('click', async ()=>{
    const me=auth.currentUser;
    if(!me){ try{ openModalAuth('login'); }catch(e){} return; }
    const raw = prompt('Zadejte UID uživatele:');
    if(!raw) return;
    let to = raw.trim();
    if(!to) return;
    if(to.includes('@')){
      toast('Vyhledávání podle e-mailu je vypnuté');
      return;
    }
    const room = await startDM(to);
    if(room){
      try{ currentDmRoom = room; }catch(e){}
      try{ currentDmPeerUid = to; }catch(e){}
      try{ showView('view-dm'); }catch(e){}
    }
  });

  // --- startDM() (stable entrypoint for profiles / buttons) ---
  // Creates/opens DM room, ensures membership + inbox meta for both sides.
  // NOTE: roomId format is dmKey(a,b) => "uidA_uidB" (sorted/consistent).
  async function startDM(toUid, opts={}){
    const me = auth.currentUser;
    if(!me){ openModalAuth('login'); return null; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return null; }
    if(!toUid || typeof toUid!=='string') return null;
    toUid = toUid.trim();
    if(!toUid || toUid===me.uid) return null;

    const room = dmKey(me.uid, toUid);
    const ts = Date.now();

    // membership (RTDB rules: SELF-WRITE ONLY)
    try{
      // 1) set myself first
      await db.ref('privateMembers/'+room+'/'+me.uid).set(true);

      // If DM is with a bot, register a botRoom so the admin bot-host can join and reply.
      try{
        if(String(toUid).startsWith('bot_')){
          await db.ref('botRooms/'+room).update({botUid:toUid, userUid:me.uid, ts, lastHandledTs: (opts && opts.noBacklog) ? Date.now() : 0});
        }
      }catch(e){ console.warn('bot DM register failed', e?.code||e); }

    }catch(e){
      console.warn('DM membership write blocked:', e?.code || e);
    }

    // inbox meta for quick thread list (write for both sides)
    try{
      const myPub = await getUser(me.uid);
      const toPub = await getUser(toUid);
      await Promise.all([
        db.ref('inboxMeta/'+me.uid+'/'+room).update({ ts, lastTs: ts, with: toUid, title: toPub.nick||'Uživatel', lastText:'', unread:0 }),
        db.ref('inboxMeta/'+toUid+'/'+room).update({ ts, lastTs: ts, with: me.uid, title: myPub.nick||'Uživatel', lastText:'', unread:0 })
      ]);
  }catch(e){}

    await openDMRoom(me.uid, toUid);
    showView('view-dm');
    // Ensure the right pane is immediately usable on mobile/desktop
    try{
      document.body.classList.add('dm-room-open');
      const back = document.getElementById('dmBackMobile');
      if(back) back.style.display = '';
    }catch(e){}
    if(opts && opts.closeModalId){ try{ closeModal(opts.closeModalId); }catch(e){} }
    return room;
  }
  window.startDM = startDM;

  // --- DM threads / inbox ---
    // NOTE: currentDmRoom/currentDmPeerUid are global (see DM globals above).
    function otherUidFromRoom(room, meUid){
      const parts = String(room).split('_');
      if(parts.length!==2) return null;
      return (parts[0]===meUid) ? parts[1] : parts[0];
    }

    async function loadDmThreads(){
      // Always show loader (even if DOM is not yet mounted on some mobile layouts)
      try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
      const box=document.getElementById('dmThreads');
      if(!box){
        // If DM DOM isn't ready yet, mark for reload after bootstrap/auth.
        window.__DM_NEEDS_LOAD__ = true;
        return;
      }

      const me = auth.currentUser;
      if(!me){
        // Auth not ready yet: keep the loader and let the main auth handler reload DM when ready.
        window.__DM_NEEDS_LOAD__ = true;
        setMiniLoad('dmMiniLoad','Přihlašujeme…', true);
        return;
      }

      // Instant paint from cache.
      try{
        const ck = __cacheKey('dmthreads');
        const cached = __cacheGet(ck, 12*60*60*1000);
        if(cached && cached.val && typeof cached.val.html==='string'){
          box.innerHTML = cached.val.html;
        }
      }catch(e){}

      try{
        const metaSnap = await db.ref('inboxMeta/'+me.uid).orderByChild('lastTs').limitToLast(50).get();
        const v = metaSnap.val()||{};
        const rooms = Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));

        // Avoid duplicates on re-open.
        box.innerHTML = '';

        for(const room of rooms){
          const other = otherUidFromRoom(room, me.uid);
          if(!other) continue;
          const u = await getUser(other);
          const row=document.createElement('div');
          row.className='msg';
          // NOTE: In DM list, tapping anywhere should open the conversation.
          // Profile opening is only via avatar tap (to avoid "opens profile instead of chat" on mobile).
          const avaSrc = esc(u.avatar || window.DEFAULT_AVATAR);
          row.innerHTML = `
          <div class="ava" data-uid="${esc(other)}"><img src="${avaSrc}" alt="" loading="lazy"></div>
          <div class="bubble" style="width:100%;cursor:pointer">
            <div class="name"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${u.online?'online':'offline'}</span></div>
            <div class="muted" style="font-size:12px">${new Date(v[room].ts||0).toLocaleString()}</div>
          </div>`;
          row.addEventListener('click', ()=>{
            openDMRoom(me.uid, other);
            // Mobile UX: open room as overlay
            try{
              document.body.classList.add('dm-room-open');
              const back = document.getElementById('dmBackMobile');
              if(back) back.style.display = '';
            }catch(e){}
          });
          const avaEl = row.querySelector('.ava');
          const imgEl = avaEl?.querySelector('img');
          if(imgEl){
            imgEl.onerror = ()=>{ try{ imgEl.src = window.DEFAULT_AVATAR; }catch(e){} };
          }
          avaEl?.addEventListener('click',(ev)=>{ ev.stopPropagation(); showUserCard(other); });
          box.appendChild(row);
        }
        const label=document.getElementById('dmWithName');
        if(label && !currentDmRoom) label.textContent='Osobní zprávy';

        // Save cache after successful render.
        try{
          const ck = __cacheKey('dmthreads');
          __cacheSet(ck, { html: box.innerHTML });
        }catch(e){}
      }catch(e){
        console.warn('loadDmThreads failed', e);
      }finally{
        setMiniLoad('dmMiniLoad','', false);
      }
    }

    // Expose DM thread loader globally (used by topbar envelope + reload restore)
    try{ window.loadDmThreads = loadDmThreads; }catch(e){}

    // Override openDMRoom to set current room and update header
    const _origOpenDMRoom = window.openDMRoom;
    window.openDMRoom = async function(a,b){
      // Ensure DM becomes the active view (and persists across reload).
      try{ if(!document.getElementById('view-dm')?.classList.contains('active')) showView('view-dm'); }catch(e){}
      try{
        if(window.MK && window.MK.persist && window.MK.persist.view) window.MK.persist.view('view-dm');
        else { localStorage.setItem('lastView','view-dm'); localStorage.setItem('mk_last_view','view-dm'); }
      }catch(e){}
      currentDmRoom = dmKey(a,b);
      const other = (a===auth.currentUser?.uid) ? b : a;
      // Persist the last opened DM peer/room so after F5 we can restore the exact conversation.
      try{
        // Single Source of Truth: DM state is controlled via setDmState() + MK.persist.*
        try{ setDmState('thread', String(other)); }catch(e){}
        try{
          if(window.MK && window.MK.persist && window.MK.persist.dmLastRoom) window.MK.persist.dmLastRoom(String(currentDmRoom));
          else localStorage.setItem('mk_last_dm_room', String(currentDmRoom));
        }catch(e){}
      }catch(e){}

      // Mobile UX: if DM room is opened (including restore after reload), ensure the conversation
      // card is visible even when DM list is shown as the default column.
      try{
        if(window.matchMedia && window.matchMedia('(max-width: 720px)').matches){
          // open overlay modal that contains the conversation card
          window.openDmMobile && window.openDmMobile();
        }
      }catch(e){}
      const u = await getUser(other);
      document.getElementById('dmWithName').textContent = u.nick||'Uživatel';
      document.getElementById('dmWithStatus').textContent = u.online?'(online)':'(offline)';
      return _origOpenDMRoom(a,b);
    };

    document.getElementById('dmClearBtn')?.addEventListener('click', ()=>{
      const box=document.getElementById('dmFeed'); if(box) box.innerHTML='';
    });

    // Mobile back from DM room overlay
  
    // When DM tab open, auto-load threads
    document.addEventListener('click', (e)=>{
      const t=e.target.closest('[data-view="view-dm"]');
      if(t){ setTimeout(()=>{ if(auth.currentUser) loadDmThreads(); }, 80); }
    });

})();
