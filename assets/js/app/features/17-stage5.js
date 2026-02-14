// ===== Stage 5 UI enhancements (friends inbox, DM threads, profile locks, bots/admin) =====
(function(){
  // Prevent accidental double-boot (e.g., duplicated script tags or SPA hot reload).
  if(window.__MK_STAGE5_INSTALLED__) return;
  window.__MK_STAGE5_INSTALLED__ = true;
  const db = firebase.database(); const auth = firebase.auth();

  // --- modal helpers ---
  // --- Modal helpers (stack + backdrop + ESC) ---
  const __openModals = new Set();
  function openModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    // close any other modal of the same "layer" to prevent invisible overlays blocking clicks
    document.querySelectorAll('.modal').forEach(m=>{
      if(!m.hidden && m.id !== id) m.hidden = true;
    });
    el.hidden = false;
    __openModals.add(id);
    document.body.classList.add('modal-open');
    // NOTE: we intentionally do NOT pushState here.
    // On some setups it caused "stuck" UI after closing (especially with hash routing).
    // Mobile back button support can be added later via a dedicated modal route.
  }
  function closeModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.hidden = true;
    __openModals.delete(id);
    if(__openModals.size===0) document.body.classList.remove('modal-open');
  }

  // Expose modal helpers for inline onclick handlers
  try{ if(!window.openModal) window.openModal = openModal; }catch(e){}
  try{ if(!window.closeModal) window.closeModal = closeModal; }catch(e){}

  // Backdrop click closes
  document.addEventListener('click', (e)=>{
    const m = e.target && e.target.classList && e.target.classList.contains('modal') ? e.target : null;
    if(m && !m.hidden){
      closeModal(m.id);
    }
  }, true);
  // ESC closes topmost
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && __openModals.size){
      const last = Array.from(__openModals).slice(-1)[0];
      closeModal(last);
    }
  });
  // Browser back closes modal if open
  window.addEventListener('popstate', ()=>{
    if(__openModals.size){
      const last = Array.from(__openModals).slice(-1)[0];
      closeModal(last);
    }
  });


  // --- Auth modal wiring ---
  document.getElementById('authClose')?.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();
    closeModalAuth();
  });
  document.getElementById('authSwitchToRegister')?.addEventListener('click', ()=>openModalAuth('register'));
  document.getElementById('authSwitchToLogin')?.addEventListener('click', ()=>openModalAuth('login'));
  document.getElementById('authLoginBtn')?.addEventListener('click', async ()=>{
    try{ await handleLogin(); }catch(e){ toast(e.message||'Chyba'); }
  });
  document.getElementById('authRegisterBtn')?.addEventListener('click', async ()=>{
    try{ await handleRegister(); }catch(e){ toast(e.message||'Chyba'); }
  });
  document.getElementById('authGoogleBtn')?.addEventListener('click', async ()=>{
    try{ await googleSignIn(); closeModalAuth(); }catch(e){ toast(e.message||'Chyba'); }
  });
  document.getElementById('authResendVerify')?.addEventListener('click', resendVerification);

  // DM mobile back/close
  document.getElementById('dmBackMobile')?.addEventListener('click', ()=>{
    // User intentionally returned to DM LIST
    try{ setDmState('list', null); }catch(e){}
    try{ window.__DM_RESTORE_PEER__=''; window.__DM_ROOM_RESTORED__=false; }catch(e){} try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){} });
  document.getElementById('dmMobileClose')?.addEventListener('click', ()=>{ try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){} });

  // Friends UI moved to features/friends.js
  document.getElementById('dmNewBtn')?.addEventListener('click', async ()=>{
  const me=auth.currentUser;
  if(!me){ openModalAuth('login'); return; }
  const raw = prompt('Zadejte UID uživatele:');
  if(!raw) return;
  let to = raw.trim();
  if(!to) return;
  if(to.includes('@')){
    const uid = await resolveUidByEmail(to);
    if(!uid){ alert('Email neznám'); return; }
    to = uid;
  }
  const room = await startDM(to);
  if(room){
    currentDmRoom = room;
    currentDmPeerUid = to;
    showView('view-dm');
  }
});
  document.getElementById('modalDmClose')?.addEventListener('click', ()=>closeModal('modalDmNew'));
  document.getElementById('userCardClose')?.addEventListener('click', ()=>closeModal('modalUserCard'));

  // Friends UI (list / requests / add) moved to features/friends.js

  // --- User profile modal (public) ---
  async function getFriendState(meUid, otherUid){
    if(!meUid || !otherUid) return 'none';
    const fr = (await db.ref('friends/'+meUid+'/'+otherUid).get()).val();
    if(fr==='accepted') return 'friends';
    const reqIn = (await db.ref('friendRequests/'+meUid+'/'+otherUid).get()).val();
    if(reqIn) return 'incoming';
    const reqOut = (await db.ref('friendRequests/'+otherUid+'/'+meUid).get()).val();
    if(reqOut) return 'outgoing';
    return 'none';
  }

  async function loadVacanciesInto(container, uid){
    const feed = document.getElementById(container);
    const empty = document.getElementById('userCardVacEmpty');
    if(!feed) return;
    feed.innerHTML = '';
    if(empty) empty.style.display='none';
    const snap = await db.ref('vacancies/'+uid).orderByChild('ts').limitToLast(20).get();
    const v = snap.val()||{};
    const ids = Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));
    if(ids.length===0){
      if(empty) empty.style.display='';
      return;
    }
    for(const id of ids){
      const it=v[id]||{};
      const div=document.createElement('div');
      div.className='vac-item';
      div.innerHTML = `<div class="t">${esc(it.title||'Inzerát')}</div>
        <div class="m">${esc(it.city||'')} · ${new Date(it.ts||0).toLocaleString()}</div>
        <div class="d">${esc(it.text||'')}</div>`;
      feed.appendChild(div);
    }
  }

  async function loadRating(uid){
    const snap = await db.ref('ratings/'+uid).get();
    const v = snap.val()||{};
    const arr = Object.values(v).filter(x=>typeof x==='number');
    const avg = arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    return {avg, count: arr.length};
  }

  function renderStars(containerId, value, onPick){
    const el=document.getElementById(containerId);
    if(!el) return;
    el.innerHTML='';
    for(let i=1;i<=5;i++){
      const b=document.createElement('button');
      b.type='button';
      b.textContent='★';
      b.className = i<=value ? 'on' : 'off';
      b.addEventListener('click', ()=> onPick(i));
      el.appendChild(b);
    }
  }

  async function showUserCard(uid){
    const me = auth.currentUser;
    const u = await getUser(uid);

    const ava=document.getElementById('userCardAva');
    const nick=document.getElementById('userCardNick');
    const role=document.getElementById('userCardRole');
    const online=document.getElementById('userCardOnline');

    if(ava) ava.src = u.avatar||window.DEFAULT_AVATAR;
    if(nick) nick.textContent = u.nick||'Uživatel';
    if(role) role.textContent = u.role==='employer' ? 'Zaměstnavatel' : 'Hledám práci';
    if(online) online.textContent = u.online ? 'online' : 'offline';

    const plan=document.getElementById('userCardPlan');
    const admin=document.getElementById('userCardAdmin');
    const planVal = String(u.plan||'').toLowerCase();
    const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
    if(plan){
      plan.style.display = isPrem ? '' : 'none';
      plan.textContent = isPrem ? String(planVal).toUpperCase() : 'PREMIUM';
    }
    const isAdm = (uid === window.ADMIN_UID);
    if(admin){ admin.style.display = isAdm ? '' : 'none'; }

    const aboutEl=document.getElementById('userCardAbout');
    if(aboutEl) aboutEl.textContent = u.about||'';

    const cW=document.getElementById('userCardCompanyWrap');
    const pW=document.getElementById('userCardPhoneWrap');
    const sW=document.getElementById('userCardSkillsWrap');
    if(cW){ cW.style.display = u.company ? '' : 'none'; document.getElementById('userCardCompany').textContent=u.company||''; }
    if(pW){ pW.style.display = u.phone ? '' : 'none'; document.getElementById('userCardPhone').textContent=u.phone||''; }
    if(sW){ sW.style.display = u.skills ? '' : 'none'; document.getElementById('userCardSkills').textContent=u.skills||''; }

    // rating
    const rate = await loadRating(uid);
    const rText=document.getElementById('userCardRatingText');
    if(rText) rText.textContent = rate.count ? `⭐ ${rate.avg.toFixed(1)} / 5 (${rate.count})` : 'Bez hodnocení';
    let myRating = 0;
    if(me){
      const my = (await db.ref('ratings/'+uid+'/'+me.uid).get()).val();
      myRating = (typeof my==='number') ? my : 0;
    }
    renderStars('userCardStars', myRating||Math.round(rate.avg||0), async (n)=>{
      if(!me) return toast('Přihlaste se');
      await db.ref('ratings/'+uid+'/'+me.uid).set(n);
      toast('Hodnocení uloženo'); playSound('ok');
      const r2=await loadRating(uid);
      if(rText) rText.textContent = r2.count ? `⭐ ${r2.avg.toFixed(1)} / 5 (${r2.count})` : 'Bez hodnocení';
      renderStars('userCardStars', n, ()=>{});
    });

    // friend buttons state
    const dmBtn=document.getElementById('userCardDm');
    const addBtn=document.getElementById('userCardAddFriend');
    const rmBtn=document.getElementById('userCardRemoveFriend');

    const state = await getFriendState(me?.uid, uid);
    if(addBtn) addBtn.style.display = (state==='friends') ? 'none' : '';
    if(rmBtn) rmBtn.style.display = (state==='friends') ? '' : 'none';
    if(addBtn){
      addBtn.textContent = state==='incoming' ? '✅ Přijmout' : (state==='outgoing' ? '⏳ Odesláno' : '👥 Přidat');
      addBtn.disabled = (state==='outgoing');
    }

    dmBtn && (dmBtn.onclick = ()=>{
      if(!me) return toast('Přihlaste se');
      startDM(uid, {closeModalId:'modalUserCard'});
    });

    addBtn && (addBtn.onclick = async ()=>{
      if(!me) return toast('Přihlaste se');
      try{
        if(state==='incoming'){
          await (window.acceptFriend ? window.acceptFriend(uid) : Promise.resolve());
        }else if(state==='none'){
          await (window.sendFriendRequest ? window.sendFriendRequest(uid) : Promise.resolve());
        }
      }catch(e){ console.error(e); toast('Chyba'); }
      try{ closeModal('modalUserCard'); }catch(e){}
      try{ window.loadFriends && window.loadFriends(); }catch(e){}
    });

    rmBtn && (rmBtn.onclick = async ()=>{
      if(!me) return toast('Přihlaste se');
      if(!confirm('Odebrat z přátel?')) return;
      try{ await (window.removeFriend ? window.removeFriend(uid) : Promise.resolve()); }
      catch(e){ console.error(e); toast('Chyba'); }
      try{ closeModal('modalUserCard'); }catch(e){}
      try{ window.loadFriends && window.loadFriends(); }catch(e){}
    });

    document.getElementById('userCardReport')?.addEventListener('click', async ()=>{
      if(!me) return toast('Přihlaste se');
      const txt = prompt('Napište důvod (krátce):','spam');
      if(!txt) return;
      await db.ref('reportsUsers/'+uid).push({from:me.uid, ts:Date.now(), text:txt});
      toast('Nahlášeno'); playSound('ok');
    }, {once:true});

    openModal('modalUserCard');
    await loadVacanciesInto('userCardVacancies', uid);
  }
  window.showUserCard = showUserCard;

  
  // --- Vacancies (employers) ---
  async function loadMyVacancies(){
    const me = auth.currentUser; if(!me) return;
    const feed=document.getElementById('myVacancies'); if(!feed) return;
    feed.innerHTML='';
    // NOTE: do NOT use chatMiniLoad here (it caused stuck chat loader when opening profile)
    try{
    const snap = await db.ref('vacancies/'+me.uid).orderByChild('ts').limitToLast(20).get();
    const v=snap.val()||{};
    const ids=Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));
    for(const id of ids){
      const it=v[id]||{};
      const div=document.createElement('div');
      div.className='vac-item';
      div.innerHTML = `<div class="t">${esc(it.title||'Inzerát')}</div>
        <div class="m">${esc(it.city||'')} · ${new Date(it.ts||0).toLocaleString()}</div>
        <div class="d">${esc(it.text||'')}</div>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="ghost" data-del-vac="${id}" type="button">Smazat</button>
        </div>`;
      div.querySelector('[data-del-vac]')?.addEventListener('click', async ()=>{
        if(!confirm('Smazat inzerát?')) return;
        await db.ref('vacancies/'+me.uid+'/'+id).remove();
        toast('Smazáno'); playSound('ok');
        loadMyVacancies();
      });
      feed.appendChild(div);
    }
    }finally{
      try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
    }
  }
  window.loadMyVacancies = loadMyVacancies;

  async function notifyFriendsAboutVacancy(meUid, vac){
    // Notifications are admin-only (MVP). Client fan-out would be a spam vector.
    // TODO: implement via Cloud Functions later, or show local badge/feed.
    return;
  }

  document.getElementById('vacPublish')?.addEventListener('click', async ()=>{
    const me = auth.currentUser; if(!me) return toast('Přihlaste se');
    const pub = await fetchUserPublic(me.uid);
    if(pub.role!=='employer') return toast('Tato funkce je jen pro zaměstnavatele');
    const title=(document.getElementById('vacTitle')?.value||'').trim();
    const text=(document.getElementById('vacText')?.value||'').trim();
    const city=(document.getElementById('vacCity')?.value||getCity());
    if(!title || !text) return toast('Vyplňte název a popis');
    const vac = {title, text, city, ts:Date.now(), by:me.uid};
    const id = db.ref('vacancies/'+me.uid).push().key;
    const updates={};
    updates['vacancies/'+me.uid+'/'+id]=vac;
    // also store to user public lastVacancy (optional)
    updates['usersPublic/'+me.uid+'/lastVacTs']=vac.ts;
    await db.ref().update(updates);
    toast('Inzerát zveřejněn'); playSound('ok');
    // notify friends looking for job
    try{ await notifyFriendsAboutVacancy(me.uid, vac); }catch(e){ console.warn(e); }
    // clear form
    if(document.getElementById('vacTitle')) document.getElementById('vacTitle').value='';
    if(document.getElementById('vacText')) document.getElementById('vacText').value='';
    loadMyVacancies();
  });

  // Notifications moved to:
  //   - features/06-notifications.js (badge + feed)
  //   - features/notifications.js (routing)
  // Premium/plan watcher is in features/premium-limits.js

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

    try{ watchDmRequestsUI(); }catch(e){}

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
        const meta = v[room] || {};
        const lastTs = Number(meta.lastTs || meta.ts || 0);
        const lastReadTs = Number(meta.lastReadTs || 0);
        const unread = (Number(meta.unread||0) > 0) || (lastTs && lastTs > lastReadTs);
        const when = lastTs ? new Date(lastTs).toLocaleString() : '';
        const preview = meta.lastText ? String(meta.lastText) : '';
        const unreadPill = unread ? '<span class="pill" style="margin-left:6px">new</span>' : '';
        const row=document.createElement('div');
        row.className='msg';
        // NOTE: In DM list, tapping anywhere should open the conversation.
        // Profile opening is only via avatar tap (to avoid "opens profile instead of chat" on mobile).
        const avaSrc = esc(u.avatar || window.DEFAULT_AVATAR);
        row.innerHTML = `
        <div class="ava" data-uid="${esc(other)}"><img src="${avaSrc}" alt="" loading="lazy"></div>
        <div class="bubble" style="width:100%;cursor:pointer">
          <div class="name"><b>${esc(u.nick||'Uživatel')}</b> ${unreadPill} <span class="muted">${u.online?'online':'offline'}</span></div>
          <div class="muted" style="font-size:12px">${esc(preview||'')}</div>
          <div class="muted" style="font-size:11px">${esc(when)}</div>
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

  // --- DM Requests (first message = request; conversation only after accept) ---
  async function acceptDmRequest(fromUid){
    const me = auth.currentUser;
    if(!me) return;
    const toUid = me.uid;
    const room = dmKey(toUid, fromUid);
    const now = Date.now();

    const updates = {};
    // Remove request (recipient can delete)
    updates['dmRequests/'+toUid+'/'+fromUid] = null;

    // Join room (recipient membership)
    updates['privateMembers/'+room+'/'+toUid] = true;

    // Create/refresh inbox meta for BOTH sides (so it appears in DM list after accept)
    updates['inboxMeta/'+toUid+'/'+room+'/with'] = fromUid;
    updates['inboxMeta/'+toUid+'/'+room+'/lastTs'] = now;
    updates['inboxMeta/'+toUid+'/'+room+'/lastText'] = '(přijato)';
    updates['inboxMeta/'+toUid+'/'+room+'/lastBy'] = fromUid;
    updates['inboxMeta/'+toUid+'/'+room+'/lastReadTs'] = now;

    // Sender side (cross-write allowed by rules if chatId is correct + with==auth.uid)
    updates['inboxMeta/'+fromUid+'/'+room+'/with'] = toUid;
    updates['inboxMeta/'+fromUid+'/'+room+'/lastTs'] = now;
    updates['inboxMeta/'+fromUid+'/'+room+'/lastText'] = '(přijato)';
    updates['inboxMeta/'+fromUid+'/'+room+'/lastBy'] = toUid;

    await db.ref().update(updates);

    // Open the DM room
    await openDMRoom(toUid, fromUid);
  }

  async function declineDmRequest(fromUid){
    const me = auth.currentUser;
    if(!me) return;
    await db.ref('dmRequests/'+me.uid+'/'+fromUid).remove();
    toast('Zamítnuto');
  }

  async function renderDmRequests(reqs){
    const wrap = document.getElementById('dmRequestsWrap');
    const list = document.getElementById('dmRequests');
    const countEl = document.getElementById('dmRequestsCount');
    const sep = document.getElementById('dmReqSep');
    if(!wrap || !list) return;

    const data = reqs || {};
    const keys = Object.keys(data);
    if(countEl) countEl.textContent = keys.length ? String(keys.length) : '';

    const show = keys.length > 0;
    wrap.style.display = show ? '' : 'none';
    if(sep) sep.style.display = show ? '' : 'none';

    list.innerHTML = '';
    if(!show) return;

    keys.sort((a,b)=>{
      const ta = Number(data[a]?.ts||0);
      const tb = Number(data[b]?.ts||0);
      return tb - ta;
    });

    for(const fromUid of keys.slice(0,30)){
      const r = data[fromUid] || {};
      const u = await getUser(fromUid);
      const row = document.createElement('div');
      row.className = 'msg';
      row.innerHTML = `
        <div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name"><b>${esc(u.nick||'Uživatel')}</b></div>
          <div class="muted">${esc(String(r.textPreview||''))}</div>
          <div class="actions">
            <button data-act="accept">Přijmout</button>
            <button data-act="decline">Zamítnout</button>
          </div>
        </div>`;
      row.addEventListener('click', (e)=>{
        const act = e.target?.dataset?.act;
        if(act==='accept') return acceptDmRequest(fromUid);
        if(act==='decline') return declineDmRequest(fromUid);
      });
      list.appendChild(row);
    }
  }

  function watchDmRequestsUI(){
    const me = auth.currentUser;
    if(!me) return;
    const scope = 'tab:view-dm';

    try{ MK.subs.off(scope, 'dmRequestsUI'); }catch(e){}

    const ref = db.ref('dmRequests/'+me.uid);
    const cb = (snap)=>{ renderDmRequests(snap.val()||{}); };
    ref.on('value', cb);

    MK.subs.set(scope, 'dmRequestsUI', ()=>{ try{ ref.off('value', cb); }catch(e){} });
  }

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
    const res = await _origOpenDMRoom(a,b);

    // If peer is not yet in privateMembers, this is an unconfirmed DM => show request state.
    try{
      if(!/^bot_/.test(String(other||''))){
        const room = dmKey(a,b);
        const pm = await db.ref('privateMembers/'+room+'/'+other).get();
        if(pm.val() !== true){
          const meUid = auth.currentUser?.uid;
          const out = meUid ? await db.ref('dmRequests/'+other+'/'+meUid).get() : null;
          const inc = meUid ? await db.ref('dmRequests/'+meUid+'/'+other).get() : null;
          if(inc && inc.exists()) document.getElementById('dmWithStatus').textContent = 'Žádost o zprávu';
          else if(out && out.exists()) document.getElementById('dmWithStatus').textContent = 'Čeká na přijetí…';
          else document.getElementById('dmWithStatus').textContent = 'Pošli žádost o zprávu';
        }
      }
    }catch(e){}

    return res;
  };

  document.getElementById('dmClearBtn')?.addEventListener('click', ()=>{
    const box=document.getElementById('dmFeed'); if(box) box.innerHTML='';
  });

  // Mobile back from DM room overlay
  document.getElementById('dmBackMobile')?.addEventListener('click', ()=>{
    // User intentionally returned to DM LIST
    try{ setDmState('list', null); }catch(e){}
    try{ window.__DM_RESTORE_PEER__=''; window.__DM_ROOM_RESTORED__=false; }catch(e){}
    try{ document.body.classList.remove('dm-room-open'); }catch(e){}
    const back = document.getElementById('dmBackMobile');
    if(back) back.style.display = 'none';
  });

  // When DM tab open, auto-load threads
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('[data-view="view-dm"]');
    if(t){ setTimeout(()=>{ if(auth.currentUser){ try{ watchDmRequestsUI(); }catch(e){} loadDmThreads(); } }, 80); }
  });

  // --- Profile locking & requests ---
  async function loadMyProfileUI(u){
    const up = (await db.ref('usersPublic/'+u.uid).get()).val()||{};
    const nickLocked = up.nickLocked===true;
    const roleLocked = up.roleLocked===true;

    // Fill UI
    document.getElementById('myName').textContent = up.nick || u.displayName || 'Uživatel';
    document.getElementById('profileEmail').textContent = 'E-mail: '+(u.email||'—');
    document.getElementById('profileRoleLine').textContent = 'Role: '+(up.role==='employer'?'Zaměstnavatel':'Hledám práci');
    document.getElementById('myAvatar').src = up.avatar || window.DEFAULT_AVATAR;
    const plan = (up.plan||'free');
    const badge=document.getElementById('myPlan');
    const planVal = String(plan||'').toLowerCase();
    const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
    if(badge){ badge.style.display = isPrem ? 'inline-block':'none'; }
    const myAdmin=document.getElementById('myAdmin');
    const isAdm = (u.uid === window.ADMIN_UID);
    if(myAdmin){ myAdmin.style.display = isAdm ? 'inline-block':'none'; }

    const setNick=document.getElementById('setNick');
    const setRole=document.getElementById('setRole');
    const setAbout=document.getElementById('setAbout');
    if(setNick){
      setNick.value = up.nick || '';
      setNick.disabled = nickLocked; // only initial set if not locked
      setNick.placeholder = nickLocked ? 'Nick je uzamčen' : 'Nick (nastavíte jen jednou)';
    }
    if(setRole){
      setRole.value = up.role || 'seeker';
      setRole.disabled = roleLocked;
    }
    if(setAbout){
      setAbout.value = up.about || '';
    }

    // buttons
    const btnNick=document.getElementById('reqNickChange');
    if(btnNick) btnNick.disabled = !nickLocked; // request only after initial set
    const btnRole=document.getElementById('reqRoleChange');
    if(btnRole) btnRole.disabled = !roleLocked;

    document.getElementById('saveProfile').onclick = async ()=>{
      const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
      const patch = {};
      // allow avatar/about always
      const avatarUrl=(document.getElementById('setAvatarUrl').value||'').trim();
      if(avatarUrl) patch.avatar = avatarUrl;
      const about=(document.getElementById('setAbout').value||'').trim();
      patch.about = about;
      // allow initial nick/role once
      if(!nickLocked){
        const nick=(document.getElementById('setNick').value||'').trim();
        if(nick){ patch.nick = nick; patch.nickLocked = true; }
      }
      if(!roleLocked){
        const role=document.getElementById('setRole').value;
        if(role){ patch.role = role; patch.roleLocked = true; }
      }
      await db.ref('usersPublic/'+u.uid).update(patch);
      toast('Uloženo'); playSound('ok');
      loadMyProfileUI(u);
    };

    document.getElementById('reqNickChange').onclick = async ()=>{
      const u=auth.currentUser; if(!u) return;
      const cur = (await db.ref('usersPublic/'+u.uid+'/nick').get()).val()||'';
      const wanted = prompt('Nový nick (čeká na schválení adminem):', cur);
      if(!wanted || wanted.trim()===cur) return;
      await db.ref('profileChangeRequests').push({uid:u.uid, type:'nick', from:cur, to:wanted.trim(), ts:Date.now(), status:'pending'});
      toast('Žádost odeslána adminovi');
    };

    document.getElementById('reqRoleChange').onclick = async ()=>{
      const u=auth.currentUser; if(!u) return;
      const curRole = (await db.ref('usersPublic/'+u.uid+'/role').get()).val()||'seeker';
      const wanted = prompt('Nová role: seeker / employer', curRole);
      if(!wanted) return;
      const v=wanted.trim().toLowerCase();
      if(v!=='seeker' && v!=='employer') return toast('Použijte seeker nebo employer');
      if(v===curRole) return;
      await db.ref('profileChangeRequests').push({uid:u.uid, type:'role', from:curRole, to:v, ts:Date.now(), status:'pending'});
      toast('Žádost odeslána adminovi');
    };

    document.getElementById('reqPremium').onclick = async ()=>{
      openPremiumBot();
    };
  }

  // --- Admin: approve requests ---

  async function loadProfileChangeRequests(){
    const me=auth.currentUser;
    if(!isAdminUser(me)) return;

    const box=document.getElementById('adminProfileRequests');
    if(box) box.innerHTML='';

    try{
      const snap=await db.ref('profileChangeRequests').orderByChild('ts').limitToLast(80).get();
      const v=snap.val()||{};
      const ids=Object.keys(v).sort((a,b)=> (Number(v[b]?.lastTs||v[b]?.ts||0) - Number(v[a]?.lastTs||v[a]?.ts||0)));

      for(const id of ids){
        const r=v[id]; if(!r) continue;
        if(r.status!=='pending') continue;

        const u=await getUser(r.uid);
        const el=document.createElement('div'); el.className='msg';
        el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="name"><b>${esc(u.nick||'Uživatel')}</b> · profile change</div>
            <div class="muted">UID: ${esc(r.uid||'')}</div>
            <div class="muted">Nick: ${esc(String(r.newNick||''))}</div>
            <div class="muted">Role: ${esc(String(r.newRole||''))}</div>
            <div class="actions">
              <button data-act="approve">Schválit</button>
              <button data-act="reject">Zamítnout</button>
            </div>
          </div>`;

        el.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act; if(!act) return;
          const now=Date.now();

          if(act==='approve'){
            await db.ref('usersPublic/'+r.uid).update({
              nick: r.newNick || u.nick || 'User'
            });
            await db.ref('roles/'+r.uid).update({
              moderator: (r.newRole==='moderator')
            });
            await db.ref('profileChangeRequests/'+id).update({
              status:'approved',
              decidedAt: now,
              decidedBy: me.uid
            });

            try{
              await db.ref('notifications/'+r.uid).push({
                ts: now,
                type:'profile',
                title:'Profil schválen',
                text:'Změny profilu byly schváleny.'
              });
            }catch(_e){}
            try{ if(typeof auditLog==='function') auditLog('profile_change_approve', r.uid, {requestId:id, newNick:r.newNick, newRole:r.newRole}); }catch(_e){}
            toast('Schváleno');
            loadProfileChangeRequests();
          }

          if(act==='reject'){
            const reason=(prompt('Důvod zamítnutí (volitelné):','')||'').trim().slice(0,240);
            await db.ref('profileChangeRequests/'+id).update({
              status:'rejected',
              decidedAt: now,
              decidedBy: me.uid,
              reason: reason || null
            });

            try{
              await db.ref('notifications/'+r.uid).push({
                ts: now,
                type:'profile',
                title:'Profil zamítnut',
                text: reason ? ('Zamítnuto. '+reason) : 'Zamítnuto.'
              });
            }catch(_e){}
            try{ if(typeof auditLog==='function') auditLog('profile_change_reject', r.uid, {requestId:id, reason: reason||null}); }catch(_e){}
            toast('Zamítnuto');
            loadProfileChangeRequests();
          }
        });

        box && box.appendChild(el);
      }

      if(box && !ids.length) box.innerHTML = '<div class="muted">Žádné žádosti.</div>';
    }catch(e){
      console.warn('loadProfileChangeRequests failed', e);
      if(box) box.innerHTML = '<div class="muted">Chyba při načítání.</div>';
    }
  }
  try{ window.loadProfileChangeRequests = loadProfileChangeRequests; }catch(e){}

  async function loadPremiumRequestsAdmin(){
    const me=auth.currentUser;
    if(!isAdminUser(me)) return;

    const boxP=document.getElementById('adminPremiumRequests');
    if(boxP) boxP.innerHTML='';

    try{
      // New flow:
      //   - Source of truth: payments/requests/{uid}/{requestId}
      //   - Admin convenience: payments/requestsIndex/{requestId}
      //
      // Without Cloud Functions: index is written by the user (rules enforce uid/status).
      const idxSnap = await db.ref('payments/requestsIndex').orderByChild('ts').limitToLast(250).get();
      const idxVal = idxSnap.val() || {};
      const all = [];
      for(const [rid, r0] of Object.entries(idxVal)){
        const r = r0 || {};
        const st = String(r.status||'');
        if(st!=='pending' && st!=='pending_proof') continue;
        const uid = String(r.uid||'').trim();
        if(!uid) continue;
        all.push({ uid, id: rid, r });
      }

      // pending (with screenshot) first, then pending_proof
      all.sort((a,b)=>{
        const sa = String(a.r.status||'');
        const sb = String(b.r.status||'');
        const pa = (sa==='pending') ? 0 : 1;
        const pb = (sb==='pending') ? 0 : 1;
        if(pa!==pb) return pa-pb;
        return (Number(b.r.ts||0) - Number(a.r.ts||0));
      });

      for(const item of all.slice(0,120)){
        const r=item.r || {};
        const uid = item.uid || '';
        if(!uid) continue;
        const u=await getUser(uid);

        const planKey = String(r.plan||'vip');
        const planTitle = (PREMIUM_PLANS[planKey]?.title) || planKey;
        const proofUrl = r.proofUrl || r.proof || r.proofImg || '';
        const priceLine = (typeof r.price!=='undefined' || typeof r.period!=='undefined')
          ? `<div class="muted">Cena: ${esc(String(r.price||''))} Kč · ${esc(String(r.period||''))}</div>`
          : '';

        const proof = proofUrl
          ? `<div style="margin-top:6px"><a href="${esc(proofUrl)}" target="_blank" rel="noopener" class="muted">📎 Screenshot (otevřít)</a></div>`
          : `<div class="muted" style="margin-top:6px">Chybí screenshot</div>`;

        const statusPill = `<span class="pill">${esc(String(r.status||''))}</span>`;

        const el=document.createElement('div'); el.className='msg';
        el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="name" data-uid="${esc(uid)}"><b>${esc(u.nick||'Uživatel')}</b> · ${esc(planTitle)} ${statusPill}</div>
            <div class="muted">UID: ${esc(uid)} · Request: ${esc(item.id)}</div>
            ${priceLine}
            ${proof}
            <div class="actions">
              <button data-act="grant">Udělit</button>
              <button data-act="reject">Zamítnout</button>
            </div>
          </div>`;

        el.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act; if(!act) return;
          const now=Date.now();
          const plan = String(r.plan||'vip');

          // Derive planUntil from period (defaults to 30 days)
          const days = (()=>{ 
            const m = String(r.period||'').match(/(\d{1,3})/);
            const d = m ? parseInt(m[1],10) : 30;
            return (isFinite(d) && d>0 && d<3660) ? d : 30;
          })();
          const planUntil = now + days*24*60*60*1000;

          if(act==='grant'){
            if(!proofUrl && !confirm('Žádost nemá screenshot. Udělit i tak?')) return;

            // Grant on user profile
            await db.ref('usersPublic/'+uid).update({
              plan,
              planUntil,
              premiumSince: now
            });

            // Update request + index (do NOT overwrite whole objects)
            const updates = {};
            const reqBase = 'payments/requests/'+uid+'/'+item.id;
            updates[reqBase+'/status'] = 'granted';
            updates[reqBase+'/decidedAt'] = now;
            updates[reqBase+'/decidedBy'] = me.uid;
            updates[reqBase+'/planUntil'] = planUntil;

            const idxBase = 'payments/requestsIndex/'+item.id;
            updates[idxBase+'/status'] = 'granted';
            updates[idxBase+'/decidedAt'] = now;
            updates[idxBase+'/decidedBy'] = me.uid;
            updates[idxBase+'/planUntil'] = planUntil;

            await db.ref().update(updates);

            // Notify user (admin-only write)
            try{
              await db.ref('notifications/'+uid).push({
                ts: now,
                type: 'premium',
                title: 'Privilegia aktivována',
                text: `Aktivováno: ${planTitle}`
              });
            }catch(_e){}

            try{ if(typeof auditLog==='function') auditLog('premium_grant', uid, {plan, planUntil, requestId: item.id}); }catch(_e){}
            toast('Privilegium uděleno');
            loadPremiumRequestsAdmin();
          }

          if(act==='reject'){
            const reason = (prompt('Důvod zamítnutí (volitelné):','') || '').trim().slice(0,240);
            const updates = {};
            const reqBase = 'payments/requests/'+uid+'/'+item.id;
            updates[reqBase+'/status'] = 'rejected';
            updates[reqBase+'/decidedAt'] = now;
            updates[reqBase+'/decidedBy'] = me.uid;
            updates[reqBase+'/reason'] = reason ? reason : null;

            const idxBase = 'payments/requestsIndex/'+item.id;
            updates[idxBase+'/status'] = 'rejected';
            updates[idxBase+'/decidedAt'] = now;
            updates[idxBase+'/decidedBy'] = me.uid;
            updates[idxBase+'/reason'] = reason ? reason : null;

            await db.ref().update(updates);

            try{
              await db.ref('notifications/'+uid).push({
                ts: now,
                type: 'premium',
                title: 'Žádost zamítnuta',
                text: reason ? (`Zamítnuto: ${planTitle}. ${reason}`) : `Zamítnuto: ${planTitle}`
              });
            }catch(_e){}
            try{ if(typeof auditLog==='function') auditLog('premium_reject', uid, {plan, requestId: item.id, reason: reason||null}); }catch(_e){}
            toast('Zamítnuto');
            loadPremiumRequestsAdmin();
          }
        });

        boxP && boxP.appendChild(el);
      }

      if(boxP && !all.length) boxP.innerHTML = '<div class="muted">Žádné žádosti.</div>';
    }catch(e){
      console.warn('loadPremiumRequestsAdmin failed', e);
      if(boxP) boxP.innerHTML = '<div class="muted">Chyba při načítání.</div>';
    }
  }
  try{ window.loadPremiumRequestsAdmin = loadPremiumRequestsAdmin; }catch(e){}

  async function loadAdminRequests(){
    // Legacy: load both blocks (for older code paths)
    await loadProfileChangeRequests();
    await loadPremiumRequestsAdmin();
  }
  try{ window.loadAdminRequests = loadAdminRequests; }catch(e){}

  // --- Bots (MVP client scheduler for admin) ---
  let botTimer=null;
  async function loadBotsUI(){
    const box=document.getElementById('botList'); if(!box) return;
    box.innerHTML='';
    const s=await db.ref('bots').get(); const v=s.val()||{};
    for(const [id,b] of Object.entries(v)){
      const el=document.createElement('div'); el.className='msg';
      el.innerHTML = `<div class="ava"><img src="${esc(b.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name"><b>${esc(b.nick||'Bot')}</b> <span class="muted">${esc(b.city||'praha')}</span></div>
          <div class="muted">Interval: ${Math.max(1, (+b.intervalMin||15))} min · aktivní: ${b.enabled?'ano':'ne'}</div>
          <div class="actions">
            <button data-act="toggle">${b.enabled?'Vypnout':'Zapnout'}</button>
            <button data-act="edit">Upravit</button>
            <button data-act="del">Smazat</button>
          </div>
        </div>`;
      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='toggle'){
          const next = !b.enabled;
          await db.ref('bots/'+id).update({enabled:next, updatedAt:Date.now()});
          try{ await auditLog('bot_toggle', 'bot_'+id, {id, enabled:next}); }catch(e){}
          loadBotsUI();
        }
        if(act==='del'){
          if(!confirm('Smazat bota?')) return;
          try{ await auditLog('bot_delete', 'bot_'+id, {id}); }catch(e){}
          await db.ref('bots/'+id).remove();
          loadBotsUI();
        }
        if(act==='edit'){
          const nick=prompt('Nick bota:', b.nick||'Bot'); if(!nick) return;
          const city=prompt('Město (praha/brno/olomouc):', b.city||'praha')||'praha';
          const interval=prompt('Interval (min):', String(b.intervalMin||15))||'15';
          const text=prompt('Text zprávy:', b.text||'')||'';
          const intervalMin = Math.max(5, parseInt(interval,10) || 15);
          await db.ref('bots/'+id).update({nick:nick.trim(), nickLower:nick.trim().toLowerCase(), city:city.trim(), intervalMin, text, updatedAt:Date.now()});
          try{ await auditLog('bot_update', 'bot_'+id, {id, nick:nick.trim(), city:city.trim(), intervalMin}); }catch(e){}
          loadBotsUI();
        }
      });
      box.appendChild(el);
    }
  }

  
  // --- Bot DM auto-replies (runs only when admin has the site open) ---
  const __BOT_ROOM_LISTENERS = new Map(); // room -> ref
  async function _getBotConfigByUid(botUid){
    const id = String(botUid||'').startsWith('bot_') ? String(botUid).slice(4) : null;
    if(!id) return null;
    const s = await db.ref('bots/'+id).get();
    return s.val()||null;
  }

  async function _ensureBotPublic(botUid, b){
    try{
      await db.ref('usersPublic/'+botUid).update({
        nick: b?.nick || 'Bot',
        avatar: b?.avatar || window.DEFAULT_AVATAR,
        role: 'bot',
        plan: 'bot'
      });
    }catch(e){}
  }

  let __BOT_DM_STARTED = false;
  async function startBotDmEngine(){
    if(__BOT_DM_STARTED) return;
    __BOT_DM_STARTED = true;
    const me = auth.currentUser;
    if(!isAdminUser(me)) return;
    const adminUid = me.uid;

    // Watch bot rooms (created automatically when user opens DM with bot_*)
    db.ref('botRooms').orderByChild('ts').limitToLast(200).on('child_added', async (snap)=>{
      const room = snap.key;
      const r = snap.val()||{};
      if(!room || !r.botUid || !r.userUid) return;

      // Ensure admin is a member (user startDM tries to add, but we enforce too)
      try{ await db.ref('privateMembers/'+room+'/'+adminUid).set(true); }catch{}

      // Avoid double listeners
      if(__BOT_ROOM_LISTENERS.has(room)) return;

      const lastHandled = +r.lastHandledTs || 0;
      const ref = db.ref('privateMessages/'+room).orderByChild('ts').startAt(lastHandled+1);
      __BOT_ROOM_LISTENERS.set(room, ref);

      ref.on('child_added', async (ms)=>{
        const m = ms.val()||{};
        if(!m.ts || !m.by) return;
        const botUid = r.botUid;
        if(m.by === botUid) return; // ignore bot's own messages

        // Update last handled ASAP to prevent duplicate replies
        try{ await db.ref('botRooms/'+room).update({lastHandledTs: m.ts}); }catch{}

        // Forward to admin inbox (per bot) — normalized (MVP)
        try{
          let fromNick = '';
          let fromCity = '';
          try{
            const up = await getUser(m.by);
            fromNick = (up && up.nick) ? String(up.nick) : '';
            fromCity = (up && (up.city || up.lastCity)) ? String(up.city || up.lastCity) : '';
          }catch(_){}

          const type = (typeof PREMIUM_BOT_UID!=='undefined' && botUid === PREMIUM_BOT_UID) ? 'payment' : 'other';

          const payload = {
            ts: m.ts,
            botUid,
            room,
            // legacy + normalized fields
            from: m.by,
            fromUid: m.by,
            fromNick: fromNick || '',
            city: fromCity || '',
            type,
            text: m.text||'',
            img: m.img||''
          };
          await db.ref('botsInbox/'+adminUid+'/'+botUid).push(payload);
        }catch(e){}

        // Auto-reply (if bot has scenarios)
        try{
          const b = await _getBotConfigByUid(botUid);
          if(!b) return;
          await _ensureBotPublic(botUid, b);

          const sc = Array.isArray(b.scenarios) ? b.scenarios.filter(x=>x && (x.text || x.img)) : [];
          let pick = null;
          if(sc.length){
            pick = sc[Math.floor(Math.random()*sc.length)];
          }
          const replyText = (pick?.text || b.text || '').toString();
          const replyImg  = (pick?.img  || '').toString();
          if(!replyText && !replyImg) return;

          const ts2 = Date.now();
          await db.ref('privateMessages/'+room).push({by: botUid, ts: ts2, text: replyText, img: replyImg});

          // Update inbox meta so the thread stays "alive" for the user
          const userPub = await getUser(r.userUid);
          await Promise.all([
            db.ref('inboxMeta/'+r.userUid+'/'+room).update({with: botUid, ts: ts2, lastTs: ts2, title: b.nick||'Bot'}),
            db.ref('inboxMeta/'+botUid+'/'+room).update({with: r.userUid, ts: ts2, lastTs: ts2, title: userPub.nick||'Uživatel'}),
            db.ref('inboxMeta/'+adminUid+'/'+room).update({with: botUid, ts: ts2, lastTs: ts2, title: (b.nick||'Bot')+' (DM)'})
          ]);
        }catch(e){ console.warn('bot auto-reply failed', e?.code||e); }
      });
    });
  }

  // --- Bots modal (Admin) ---
  let __BOT_EDIT_ID = null;
  let __BOT_EDIT_AVA = null;
  let __BOT_EDIT_IMG = null;

  function _scRow(text='', img=''){
    const row = document.createElement('div');
    row.className = 'scRow';
    row.innerHTML = `
      <textarea rows="2" placeholder="Text odpovědi…"></textarea>
      <label class="filebtn mini">Obrázek <input type="file" accept="image/*"></label>
      <button class="ghost xbtn" type="button">✕</button>
    `;
    const ta = row.querySelector('textarea');
    ta.value = text||'';
    row.dataset.img = img||'';
    row.querySelector('input')?.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      row.dataset.img = await fileToDataURL(f);
      toast('Obrázek uložen (scénář)');
    });
    row.querySelector('button')?.addEventListener('click', ()=> row.remove());
    return row;
  }

  async function loadBotsModal(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const list = document.getElementById('botsModalList');
    if(!list) return;

    list.innerHTML = '<div class="muted">Načítám…</div>';
    const s = await db.ref('bots').get();
    const v = s.val()||{};
    const entries = Object.entries(v);

    list.innerHTML = '';
    if(entries.length===0){
      list.innerHTML = '<div class="muted">Zatím žádní boti.</div>';
    }
    for(const [id,b] of entries){
      const botUid = 'bot_'+id;
      const el = document.createElement('div');
      el.className='msg';
      el.innerHTML = `
        <div class="ava"><img src="${esc(b.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%;cursor:pointer">
          <div class="name"><b>${esc(b.nick||'Bot')}</b> <span class="muted">${esc(b.city||'praha')}</span></div>
          <div class="muted">UID: ${esc(botUid)} · Interval: ${Math.max(1,(+b.intervalMin||15))} min · aktivní: ${b.enabled?'ano':'ne'}</div>
        </div>
      `;
      el.addEventListener('click', ()=> selectBotForEdit(id, b));
      list.appendChild(el);
    }
  }

  function selectBotForEdit(id, b){
    __BOT_EDIT_ID = id;
    __BOT_EDIT_AVA = null;
    __BOT_EDIT_IMG = null;

    const hint = document.getElementById('botEditHint'); if(hint) hint.textContent = 'Upravuješ: bot_'+id;
    const elId = document.getElementById('botEditId'); if(elId) elId.value = id;
    const elNick = document.getElementById('botEditNick'); if(elNick) elNick.value = b?.nick||'';
    const elCity = document.getElementById('botEditCity'); if(elCity) elCity.value = b?.city||'praha';
    const elMode = document.getElementById('botEditMode'); if(elMode) elMode.value = b?.mode||'dm';
    const elFrom = document.getElementById('botEditFrom'); if(elFrom) elFrom.value = b?.activeFrom||'';
    const elTo = document.getElementById('botEditTo'); if(elTo) elTo.value = b?.activeTo||'';
    const elInt = document.getElementById('botEditInterval'); if(elInt) elInt.value = String(b?.intervalMin||15);
    const elEn = document.getElementById('botEditEnabled'); if(elEn) elEn.checked = !!b?.enabled;
    const elText = document.getElementById('botEditText'); if(elText) elText.value = b?.text||'';

    const delBtn = document.getElementById('botEditDelete'); if(delBtn) delBtn.style.display='';
    const sc = document.getElementById('botScenarioList'); if(sc) sc.innerHTML='';
    const arr = Array.isArray(b?.scenarios) ? b.scenarios : [];
    if(sc){
      if(arr.length===0){
        sc.appendChild(_scRow('Ahoj! Jak ti můžu pomoct?',''));
      }else{
        for(const it of arr){
          sc.appendChild(_scRow(it?.text||'', it?.img||''));
        }
      }
    }
  }

  async function saveBotFromEditor(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(!__BOT_EDIT_ID) return toast('Vyber bota');
    const id = __BOT_EDIT_ID;
    const botUid = 'bot_'+id;

    const nick = (document.getElementById('botEditNick')?.value||'').trim() || 'Bot';
    const city = (document.getElementById('botEditCity')?.value||'praha').trim() || 'praha'; // also supports 'all'
    const mode = (document.getElementById('botEditMode')?.value||'dm').trim() || 'dm'; // dm | chat | both
    const activeFrom = (document.getElementById('botEditFrom')?.value||'').trim(); // optional HH:MM
    const activeTo   = (document.getElementById('botEditTo')?.value||'').trim(); // 'all' allowed
    // Anti-spam: enforce minimum interval for bot posting
    const intervalMin = Math.max(5, parseInt(document.getElementById('botEditInterval')?.value||'15',10) || 15);
    const enabled = !!document.getElementById('botEditEnabled')?.checked;
    const text = (document.getElementById('botEditText')?.value||'').trim();

    const scBox = document.getElementById('botScenarioList');
    const scenarios = [];
    if(scBox){
      for(const row of Array.from(scBox.children)){
        const t = (row.querySelector('textarea')?.value||'').trim();
        const img = (row.dataset.img||'').toString();
        if(t || img) scenarios.push({text:t, img});
      }
    }

    // Dedupe (best effort): ownerUid + nick + city
    try{
      const existing = (await db.ref('bots').get()).val()||{};
      const nickL = nick.trim().toLowerCase();
      const cityL = city.trim().toLowerCase();
      for(const k of Object.keys(existing)){
        if(k === id) continue;
        const b = existing[k]||{};
        if((b.ownerUid||null) !== me.uid) continue;
        const bNickL = String(b.nick||'').trim().toLowerCase();
        const bCityL = String(b.city||'').trim().toLowerCase();
        if(bNickL === nickL && bCityL === cityL){
          toast('Duplicitní bot (nick + město). Změň nick nebo město.');
          return;
        }
      }
    }catch(e){}

    const patch = {nick, nickLower: nick.trim().toLowerCase(), city, intervalMin, enabled, text, scenarios, updatedAt:Date.now()};
    if(__BOT_EDIT_AVA) patch.avatar = __BOT_EDIT_AVA;
    if(__BOT_EDIT_IMG) patch.img = __BOT_EDIT_IMG;

    await db.ref('bots/'+id).update(patch);
    try{ await auditLog('bot_update', botUid, {id, nick, city, enabled, intervalMin}); }catch(e){}
    await db.ref('usersPublic/'+botUid).update({nick, avatar: patch.avatar || (await getUser(botUid)).avatar || window.DEFAULT_AVATAR, role:'bot', plan:'bot'});
    toast('Bot uložen'); playSound('ok');
    loadBotsModal();
  }

  async function deleteBotFromEditor(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(!__BOT_EDIT_ID) return;
    if(!confirm('Smazat bota?')) return;
    const id = __BOT_EDIT_ID;
    const botUid = 'bot_'+id;
    try{ await auditLog('bot_delete', botUid, {id}); }catch(e){}
    await db.ref('bots/'+id).remove();
    toast('Smazáno');
    __BOT_EDIT_ID=null;
    loadBotsModal();
  }


  
  
// --- Bot Chat Engine (Client-side host lock; runs when ANY client is online) ---
let __BOT_CHAT_TIMER = null;
let __BOT_HOST_TIMER = null;
let __IS_BOT_HOST = false;

function _botHostRef(){ return db.ref('runtime/botHost'); }

async function _tryAcquireBotHost(){
  const me = auth.currentUser;
  if(!me) return false;
  const ref = _botHostRef();
  const now = Date.now();
  try{
    const res = await ref.transaction((cur)=>{
      const stale = !cur || !cur.ts || (now - (+cur.ts||0) > 90000);
      if(!cur || stale) return {uid: me.uid, ts: now};
      if(cur.uid === me.uid) return {uid: me.uid, ts: now};
      return; // abort
    }, undefined, false);
    const v = res && res.snapshot ? res.snapshot.val() : null;
    return !!v && v.uid === me.uid;
  }catch(e){
    return false;
  }
}

async function _ensureBotHostOnce(){
  const me = auth.currentUser;
  if(!me) return;
  const ok = await _tryAcquireBotHost();
  __IS_BOT_HOST = ok;

  if(ok){
    try{ _botHostRef().onDisconnect().remove(); }catch(e){}
    try{ await _botHostRef().update({uid: me.uid, ts: Date.now()}); }catch(e){}
    _startBotTicks();
  }else{
    _stopBotTicks();
  }
}

function _startBotTicks(){
  if(__BOT_CHAT_TIMER) return;
  const run = async()=>{ try{ await _botChatTick(); }catch(e){} };
  __BOT_CHAT_TIMER = setInterval(run, 25000);
  run();
}
function _stopBotTicks(){
  if(__BOT_CHAT_TIMER){ try{ clearInterval(__BOT_CHAT_TIMER); }catch(e){} __BOT_CHAT_TIMER=null; }
}

function startBotHostEngine(){
  if(__BOT_HOST_TIMER) return;
  const loop = async()=>{ try{ await _ensureBotHostOnce(); }catch(e){} };
  __BOT_HOST_TIMER = setInterval(loop, 30000);
  loop();
}
function stopBotHostEngine(){
  if(__BOT_HOST_TIMER){ try{ clearInterval(__BOT_HOST_TIMER); }catch(e){} __BOT_HOST_TIMER=null; }
  _stopBotTicks();
  __IS_BOT_HOST=false;
}

// Bot tick: posts at most 1 due message per bot; supports "catch-up" via nextChatAt
const _botChatTick = async ()=>{
    try{
      const snap = await db.ref('bots').get();
      const bots = snap.val()||{};
      const now = Date.now();

      for(const [id,b] of Object.entries(bots)){
        if(!b || !b.enabled) continue;
        const mode = (b.mode||'dm').toString();
        if(mode!=='chat' && mode!=='both') continue;
        if(!shouldRunNow(b)) continue;

        const nextAt = +b.nextChatAt||0;
        const intervalMs = Math.max(60_000, (+b.intervalMin||15)*60_000);
        if(nextAt && now < nextAt) continue;

        const botUid = 'bot_'+id;
        let pick = null;
        const sc = Array.isArray(b.scenarios) ? b.scenarios : [];
        if(sc.length){ pick = sc[Math.floor(Math.random()*sc.length)]; }
        const text = (pick?.text || b.text || '').toString().trim();
        const img  = (pick?.img  || b.img  || '').toString().trim();
        if(!text && !img) continue;

        const targets = (b.city==='all') ? (window.CITIES || ['praha']) : [ (b.city||'praha') ];
        for(const city of targets){
          const msg = { by: botUid, ts: now, text: text||null, img: img||null, bot:true, botUid };
          await db.ref('messages/'+city).push(msg);
        }

        // schedule next chat post
        const nextChatAt = now + (Number(b.intervalMs) || intervalMs);
        await db.ref('bots/'+id).update({ lastChatTs: now, nextChatAt });
        try{
          await db.ref('usersPublic/'+botUid).update({ nick: b.nick||'Bot', avatar: b.avatar||window.DEFAULT_AVATAR, role:'bot', plan:'bot' });
        }catch(e){}
      }
    }catch(e){
      console.warn('botChat tick', e);
    }
  };

// --- Bot Inbox modal (Admin) ---
  let __BOT_INBOX_MODAL_WIRED = false;
  let __BOT_INBOX_MODAL_STATE = { botUid:'', limit:50, items:[] };

  async function _botInboxFetch(adminUid, botUid, limit){
    const snap = await db.ref('botsInbox/'+adminUid+'/'+botUid).orderByChild('ts').limitToLast(limit).get();
    const vv = snap.val()||{};
    const items = Object.keys(vv).map(k=>({ id:k, ...(vv[k]||{}) }))
      .sort((a,b)=> ((b.ts||0) - (a.ts||0)));
    return items;
  }

  function _normBotInboxItem(it){
    const x = it || {};
    const fromUid = x.fromUid || x.from || '';
    const fromNick = x.fromNick || '';
    const ts = +x.ts || 0;
    const type = x.type || ((typeof PREMIUM_BOT_UID!=='undefined' && __BOT_INBOX_MODAL_STATE.botUid===PREMIUM_BOT_UID) ? 'payment' : 'other');
    return { ...x, fromUid, fromNick, ts, type };
  }

  function _renderBotInboxModal(){
    const box=document.getElementById('botInboxFeedModal');
    const info=document.getElementById('botInboxInfo');
    if(!box) return;

    const term = (document.getElementById('botInboxSearch')?.value||'').toString().trim().toLowerCase();
    const all = (__BOT_INBOX_MODAL_STATE.items||[]).map(_normBotInboxItem);

    let list = all;
    if(term){
      list = all.filter(it=>{
        const n = (it.fromNick||'').toString().toLowerCase();
        const u = (it.fromUid||'').toString().toLowerCase();
        const t = (it.text||'').toString().toLowerCase();
        return n.includes(term) || u.includes(term) || t.includes(term);
      });
    }

    try{
      if(info){
        const shown=list.length, total=all.length;
        info.textContent = total ? (shown + '/' + total) : '';
      }
    }catch(e){}

    box.innerHTML='';
    if(!list.length){
      box.innerHTML='<div class="muted">Zatím žádné zprávy.</div>';
      return;
    }

    const adminUid = auth.currentUser?.uid || '';
    const botUid = __BOT_INBOX_MODAL_STATE.botUid;

    for(const it0 of list){
      const it = _normBotInboxItem(it0);
      const el=document.createElement('div'); el.className='msg';

      const nick = it.fromNick || it.fromUid || 'Uživatel';
      const tsStr = it.ts ? new Date(it.ts).toLocaleString() : '';
      const typeStr = it.type ? String(it.type) : '';

      el.innerHTML = `
        <div class="ava" data-uid="${esc(it.fromUid||'')}"><img src="${esc(window.DEFAULT_AVATAR)}" alt="" loading="lazy"></div>
        <div class="bubble" style="width:100%">
          <div class="name"><b>${esc(nick)}</b> <span class="muted">${esc(tsStr)}</span>
            ${typeStr?`<span class="pill" style="margin-left:6px">${esc(typeStr)}</span>`:''}
          </div>
          ${it.text?`<div class="text">${esc(it.text)}</div>`:''}
          ${it.img?`<div class="text"><img src="${esc(it.img)}"></div>`:''}
          <div class="actions">
            <button data-act="open">Otevřít DM</button>
            <button data-act="del">Smazat</button>
          </div>
        </div>
      `;

      // Lazy-fill avatar (optional)
      try{
        const imgEl = el.querySelector('.ava img');
        if(imgEl && it.fromUid){
          getUser(it.fromUid).then(u=>{ if(u && u.avatar) imgEl.src = u.avatar; }).catch(()=>{});
        }
      }catch(e){}

      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='open' && it.fromUid){
          try{ closeModal('modalBotInbox'); }catch(e){}
          try{ openDMRoom(adminUid, it.fromUid); }catch(e){}
          try{ showView('view-dm'); }catch(e){}
        }
        if(act==='del'){
          if(!botUid || !it.id) return;
          try{ await db.ref('botsInbox/'+adminUid+'/'+botUid+'/'+it.id).remove(); }catch(e){}
          __BOT_INBOX_MODAL_STATE.items = (__BOT_INBOX_MODAL_STATE.items||[]).filter(x=>String(x.id||'')!==String(it.id));
          _renderBotInboxModal();
        }
      });

      box.appendChild(el);
    }
  }

  async function loadBotInboxModal(opts={}){
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const adminUid=me.uid;

    const sel=document.getElementById('botInboxSelect');
    const box=document.getElementById('botInboxFeedModal');
    const moreBtn=document.getElementById('botInboxMore');
    const clearBtn=document.getElementById('botInboxClear');
    const search=document.getElementById('botInboxSearch');

    if(!sel || !box) return;

    // build bot list (plus system/premium bot)
    const s=await db.ref('bots').get(); const v=s.val()||{};
    const ids=Object.keys(v);

    sel.innerHTML='';

    // System bot: Premium
    try{
      if(typeof PREMIUM_BOT_UID!=='undefined'){
        const o=document.createElement('option');
        o.value = PREMIUM_BOT_UID;
        o.textContent = 'Bot — Privilegia ('+PREMIUM_BOT_UID+')';
        sel.appendChild(o);
      }
    }catch(e){}

    for(const id of ids){
      const botUid='bot_'+id;
      const opt=document.createElement('option');
      opt.value=botUid;
      opt.textContent = (v[id]?.nick||'Bot')+' ('+botUid+')';
      sel.appendChild(opt);
    }

    if(!sel.options.length){
      sel.innerHTML='<option value="">—</option>';
      box.innerHTML='<div class="muted">Zatím žádní boti.</div>';
      __BOT_INBOX_MODAL_STATE = { botUid:'', limit:50, items:[] };
      _renderBotInboxModal();
      return;
    }

    const setBot = async (botUid, reset=true)=>{
      const b = String(botUid||'').trim();
      if(!b) return;
      if(reset){
        __BOT_INBOX_MODAL_STATE.botUid = b;
        __BOT_INBOX_MODAL_STATE.limit = 50;
      }else{
        __BOT_INBOX_MODAL_STATE.limit = Math.min(1000, (__BOT_INBOX_MODAL_STATE.limit||50) + 50);
      }

      try{
        box.innerHTML='<div class="muted">Načítám…</div>';
        const items = await _botInboxFetch(adminUid, b, __BOT_INBOX_MODAL_STATE.limit);
        __BOT_INBOX_MODAL_STATE.items = items;
      }catch(e){
        console.warn(e);
        __BOT_INBOX_MODAL_STATE.items = [];
      }
      _renderBotInboxModal();
    };

    // Wire once
    if(!__BOT_INBOX_MODAL_WIRED){
      __BOT_INBOX_MODAL_WIRED = true;

      sel.addEventListener('change', ()=>{ setBot(sel.value, true); });
      search?.addEventListener('input', ()=>{ _renderBotInboxModal(); });

      moreBtn?.addEventListener('click', ()=>{ if(!sel.value) return; setBot(sel.value, false); });

      clearBtn?.addEventListener('click', async ()=>{
        const me2=auth.currentUser; if(!isAdminUser(me2)) return;
        const botUid = sel.value;
        if(!botUid) return;
        if(!confirm('Vyčistit inbox pro '+botUid+'?')) return;
        await db.ref('botsInbox/'+me2.uid+'/'+botUid).remove();
        toast('Vyčištěno');
        setBot(botUid, true);
      });
    }

    // restore selection (if requested)
    try{
      const wanted = (opts && opts.botUid) ? String(opts.botUid) : '';
      if(wanted) sel.value = wanted;
    }catch(e){}

    // initial load
    await setBot(sel.value, true);
  }

  // Expose for FAB menu / other modules
  try{ window.loadBotInboxModal = loadBotInboxModal; }catch(e){}

async function botTick(){
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    const s=await db.ref('bots').get(); const v=s.val()||{};
    const now=Date.now();
    for(const [id,b] of Object.entries(v)){
      if(!b || !b.enabled) continue;
      const last = +b.lastTs || 0;
      const intervalMs = Math.max(1,(+b.intervalMin||15))*60*1000;
      if(now-last < intervalMs) continue;
      const city = (b.city||'praha');
      // create /usersPublic for botId (virtual)
      const botUid = 'bot_'+id;
      await db.ref('usersPublic/'+botUid).update({nick:b.nick||'Bot', avatar:b.avatar||window.DEFAULT_AVATAR, role:'bot', plan:'bot'});
      await db.ref('messages/'+city).push({by:botUid, ts:now, text:b.text||'', img:b.img||''});
      await db.ref('bots/'+id).update({lastTs:now});
    }
  }

  
  // --- Bot inbox (messages forwarded to owner) ---
  let BOTINBOX_REF=null;
  async function loadBotInboxUI(){
    const me=auth.currentUser; if(!me) return;
    const box=document.getElementById('botInboxFeed'); if(!box) return;
    box.innerHTML = '<div class="muted">Načítám…</div>';
    if(BOTINBOX_REF){ try{ BOTINBOX_REF.off(); }catch(e){} }
    BOTINBOX_REF = db.ref('botsInbox/'+me.uid).orderByChild('ts').limitToLast(80);
    BOTINBOX_REF.on('value', async snap=>{
      const v=snap.val()||{};
      const ids=Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));
      box.innerHTML='';
      if(ids.length===0){
        box.innerHTML = '<div class="muted">Zatím žádné zprávy.</div>';
        return;
      }
      for(const id of ids){
        const it=v[id]||{};
        const fromU = it.from ? await getUser(it.from) : null;
        const botU = it.botUid ? await getUser(it.botUid) : null;
        const el=document.createElement('div'); el.className='msg';
        const who = fromU?.nick || 'Uživatel';
        const botName = botU?.nick || 'Bot';
        el.innerHTML = `<div class="ava" data-uid="${esc(it.from||'')}"><img src="${esc(fromU?.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="name"><b>${esc(who)}</b> → <span class="muted">${esc(botName)}</span> <span class="badge premium">REKLAMA</span></div>
            ${it.text ? `<div class="text">[REKLAMA] ${esc(it.text)}</div>` : ''}
            ${it.img ? `<div class="text"><img src="${esc(it.img)}"></div>` : ''}
            <div class="actions">
              <button data-act="open">Otevřít DM</button>
              <button data-act="del">Smazat</button>
            </div>
          </div>`;
        el.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act; if(!act) return;
          if(act==='open' && it.from){
            try{ if(typeof startDM==='function') startDM(it.from); else { openDMRoom(me.uid, it.from); showView('view-dm'); } }catch(e){}
          }
          if(act==='del'){
            await db.ref('botsInbox/'+me.uid+'/'+id).remove();
          }
        });
        box.appendChild(el);
      }
    });

    // Unified registry (tab-scoped)
    try{
      window.MK?.subs?.set('tab:view-admin', 'botInbox', ()=>{
        try{ if(BOTINBOX_REF) BOTINBOX_REF.off(); }catch(e){}
        BOTINBOX_REF = null;
      });
    }catch(e){}
  }

document.getElementById('botAdd')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const btn = document.getElementById('botAdd');
    if(btn && btn.dataset.busy==='1') return;
    if(btn){ btn.dataset.busy='1'; btn.disabled = true; }
    try{
    const nick=prompt('Nick bota:', 'Bot'); if(!nick) return;
    const city=prompt('Město (praha/brno/olomouc):', getCity())||getCity();
    const interval=prompt('Interval (min):','15')||'15';
    const text=prompt('Text zprávy:', 'Ahoj!')||'';
    const id = db.ref('bots').push().key;
    // Dedupe best effort
    try{
      const existing = (await db.ref('bots').get()).val()||{};
      const nickL = nick.trim().toLowerCase();
      const cityL = city.trim().toLowerCase();
      for(const k of Object.keys(existing)){
        const b = existing[k]||{};
        if((b.ownerUid||null) !== me.uid) continue;
        if(String(b.nick||'').trim().toLowerCase()===nickL && String(b.city||'').trim().toLowerCase()===cityL){
          toast('Duplicitní bot (nick + město).');
          return;
        }
      }
    }catch(e){}

    const intervalMin2 = Math.max(5, parseInt(interval,10) || 15);
    await db.ref('bots/'+id).set({ownerUid:me.uid, nick:nick.trim(), nickLower:nick.trim().toLowerCase(), city:city.trim(), intervalMin:intervalMin2, text, enabled:true, createdAt:Date.now()});
    try{ await auditLog('bot_create', 'bot_'+id, {id, nick:nick.trim(), city:city.trim(), intervalMin:intervalMin2}); }catch(e){}
    toast('Bot přidán');
    loadBotsUI();
    }finally{
      if(btn){ btn.dataset.busy='0'; btn.disabled = false; }
    }
  });
  document.getElementById('botRun')?.addEventListener('click', ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(botTimer) return toast('Boti již běží');
    botTimer=setInterval(()=>botTick().catch(console.error), 5000);
    toast('Boti spuštěni');
  });
  document.getElementById('botStop')?.addEventListener('click', ()=>{
    if(botTimer){ clearInterval(botTimer); botTimer=null; toast('Boti zastaveni'); }
  });


  // --- Bot profiles by UID (for fixed bot accounts) ---
  const BOT_UIDS = ['VrP5IzhgxmT0uKWc9UWlXSCe6nM2','rN93vIzh0AUhX1YsSWb6Th6W9w82'];
  async function loadBotProfiles(){
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    try{
      const u1=(await db.ref('usersPublic/'+BOT_UIDS[0]).get()).val()||{};
      const u2=(await db.ref('usersPublic/'+BOT_UIDS[1]).get()).val()||{};
      const n1=document.getElementById('botNick1'); if(n1) n1.value = u1.nick||u1.name||'';
      const n2=document.getElementById('botNick2'); if(n2) n2.value = u2.nick||u2.name||'';
    }catch(e){ console.warn(e); }
  }
  async function saveBotProfile(which){
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const uid = BOT_UIDS[which-1];
    const nickEl=document.getElementById(which===1?'botNick1':'botNick2');
    const fileEl=document.getElementById(which===1?'botAva1':'botAva2');
    const nick=(nickEl?.value||'').trim();
    let avatar=null;
    const f=fileEl?.files && fileEl.files[0];
    if(f){ avatar = await fileToDataURL(f); }
    const upd={};
    if(nick) upd.nick=nick;
    if(avatar) upd.avatar=avatar;
    upd.updatedAt=Date.now();
    await db.ref('usersPublic/'+uid).update(upd);
    toast('Uloženo'); playSound('ok');
    if(fileEl) fileEl.value='';
  }
  document.getElementById('botSave1')?.addEventListener('click', ()=>saveBotProfile(1).catch(console.error));
  document.getElementById('botSave2')?.addEventListener('click', ()=>saveBotProfile(2).catch(console.error));
  // (removed) duplicate onAuthStateChanged in Stage5 – handled by main auth handler

  // Router calls this on entering view-admin.
  // (Legacy click-hooks were removed to avoid duplicated loads/subscriptions.)
  try{
    
  // --- Admin Panel UX: dashboard + lazy sections ---
  let __adminSection = 'dashboard';

  function __closestCardByInnerId(innerId){
    const el = document.getElementById(innerId);
    return el ? el.closest('.card') : null;
  }

  function __adminModerationRow(){
    const el = document.getElementById('adminRoleUid');
    return el ? el.closest('.row') : null;
  }

  function __ensureAdminLogsCard(){
    const view = document.getElementById('view-admin');
    if(!view) return null;
    let card = document.getElementById('adminLogsCard');
    if(card) return card;

    card = document.createElement('div');
    card.className = 'card';
    card.id = 'adminLogsCard';
    card.style.display = 'none';
    card.innerHTML = `
      <h3>Logy (auditLogs)</h3>
      <div class="muted" style="margin-top:-6px">Posledních 200 akcí (admin-only)</div>
      <div id="adminAuditLogs" style="margin-top:10px;display:flex;flex-direction:column;gap:8px"></div>
      <div class="row" style="justify-content:flex-end;margin-top:10px">
        <button id="adminLogsMore">Načíst znovu</button>
      </div>
    `;
    view.appendChild(card);
    const btn = card.querySelector('#adminLogsMore');
    btn && btn.addEventListener('click', ()=>{ try{ loadAuditLogs(); }catch(e){} });
    return card;
  }

  async function loadAuditLogs(){
    const box = document.getElementById('adminAuditLogs');
    if(!box) return;
    box.innerHTML = '<div class="muted">Načítám…</div>';
    try{
      const snap = await db.ref('auditLogs').orderByChild('ts').limitToLast(200).get();
      const v = snap.val() || {};
      const items = Object.entries(v).map(([id, a])=>({id, a:a||{}}));
      items.sort((x,y)=>Number(y.a.ts||0)-Number(x.a.ts||0));
      box.innerHTML = '';
      for(const it of items){
        const a = it.a || {};
        const row = document.createElement('div');
        row.className = 'msg';
        row.innerHTML = `
          <div class="ava"><div class="badge-dot"></div></div>
          <div class="bubble" style="width:100%">
            <div class="name"><b>${esc(String(a.action||'action'))}</b> · <span class="muted">${new Date(Number(a.ts||0)).toLocaleString()}</span></div>
            <div class="muted">actor: ${esc(String(a.actorUid||''))} · target: ${esc(String(a.target||''))}</div>
            <div class="muted" style="white-space:pre-wrap">${esc(JSON.stringify(a.meta||{}, null, 0))}</div>
          </div>`;
        box.appendChild(row);
      }
      if(!items.length) box.innerHTML = '<div class="muted">Zatím žádné logy.</div>';
    }catch(e){
      console.warn('loadAuditLogs failed', e);
      box.innerHTML = '<div class="muted">Chyba při načítání logů.</div>';
    }
  }
  try{ window.loadAuditLogs = loadAuditLogs; }catch(e){}

  function initAdminDashboard(){
    const view = document.getElementById('view-admin');
    if(!view) return;

    // Hide legacy chip nav (we replace it with dashboard cards)
    const legacyNav = document.getElementById('adminNav');
    if(legacyNav) legacyNav.style.display = 'none';

    // Ensure header + dashboard exist once
    if(!document.getElementById('adminDashboard')){
      const header = document.createElement('div');
      header.id = 'adminSectionHeader';
      header.className = 'row';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.margin = '10px 0';
      header.style.display = 'none';
      header.innerHTML = `
        <button id="adminBackBtn">← Zpět</button>
        <div style="flex:1;text-align:center"><b id="adminSectionTitle"></b></div>
        <div style="width:72px"></div>
      `;
      const h2 = view.querySelector('h2');
      if(h2 && h2.nextSibling){
        view.insertBefore(header, h2.nextSibling);
      }else{
        view.insertBefore(header, view.firstChild);
      }

      header.querySelector('#adminBackBtn')?.addEventListener('click', ()=>showAdminSection('dashboard'));
    }

    if(!document.getElementById('adminDashboard')){
      const dash = document.createElement('div');
      dash.id = 'adminDashboard';
      dash.style.display = '';
      dash.style.marginTop = '10px';
      dash.style.display = 'grid';
      dash.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
      dash.style.gap = '12px';

      const cards = [
        { key:'profile', title:'Změny profilu', desc:'Nick / role requests' },
        { key:'premium', title:'Premium žádosti', desc:'Payments requests (pending nahoře)' },
        { key:'users', title:'Uživatelé', desc:'Vyhledat / ban / mute / role' },
        { key:'bots', title:'Boti', desc:'Boti + inbox' },
        { key:'moderation', title:'Moderace', desc:'Mazání / akce na uživatele' },
        { key:'logs', title:'Logy', desc:'auditLogs' }
      ];

      for(const c of cards){
        const el = document.createElement('div');
        el.className = 'card';
        el.style.cursor = 'pointer';
        el.innerHTML = `<h3 style="margin:0 0 6px 0">${c.title}</h3><div class="muted">${c.desc}</div>`;
        el.addEventListener('click', ()=>showAdminSection(c.key));
        dash.appendChild(el);
      }

      // Insert dashboard just after section header (or h2)
      const header = document.getElementById('adminSectionHeader');
      if(header && header.nextSibling){
        view.insertBefore(dash, header.nextSibling);
      }else{
        view.insertBefore(dash, view.firstChild);
      }
    }

    // Ensure logs card exists (hidden by default)
    __ensureAdminLogsCard();

    // Default
    showAdminSection('dashboard');
  }

  function showAdminSection(section){
    __adminSection = section || 'dashboard';

    // Section-scoped subscribe/unsubscribe (lazy)
    try{ MK.subs.off('tab:view-admin','profileReq'); }catch(e){}
    try{ MK.subs.off('tab:view-admin','payReq'); }catch(e){}
    try{ MK.subs.off('tab:view-admin','bots'); }catch(e){}
    try{ MK.subs.off('tab:view-admin','botInbox'); }catch(e){}
    try{ MK.subs.off('tab:view-admin','botProfiles'); }catch(e){}

    const dash = document.getElementById('adminDashboard');
    const header = document.getElementById('adminSectionHeader');
    const titleEl = document.getElementById('adminSectionTitle');

    const cardProfile = __closestCardByInnerId('adminProfileRequests');
    const cardPremium = __closestCardByInnerId('adminPremiumRequests');
    const cardUsers = __closestCardByInnerId('adminUsersBtn');
    const cardBots = __closestCardByInnerId('adminBotsBtn');
    const modRow = __adminModerationRow();
    const cardLogs = document.getElementById('adminLogsCard');

    // Hide everything first
    [cardProfile, cardPremium, cardUsers, cardBots, modRow, cardLogs].forEach(el=>{
      if(el) el.style.display = 'none';
    });

    // Also hide other admin cards that aren't part of sections (optional)
    // (keep them hidden to avoid "svalka")
    const allCards = Array.from(document.querySelectorAll('#view-admin .card'));
    allCards.forEach(c=>{
      if(c.id==='adminLogsCard') return;
      if(c.closest('#adminDashboard')) return;
      // keep hidden unless explicitly shown below
      c.style.display = 'none';
    });

    if(section==='dashboard'){
      if(dash) dash.style.display = '';
      if(header) header.style.display = 'none';
      return;
    }

    if(dash) dash.style.display = 'none';
    if(header) header.style.display = 'flex';
    if(titleEl) titleEl.textContent = section;

    // Show the chosen section blocks + lazy load only here
    if(section==='profile'){
      if(titleEl) titleEl.textContent = 'Změny profilu';
      if(cardProfile) cardProfile.style.display = '';
      try{ loadProfileChangeRequests && loadProfileChangeRequests(); }catch(e){}
      return;
    }

    if(section==='premium'){
      if(titleEl) titleEl.textContent = 'Premium žádosti';
      if(cardPremium) cardPremium.style.display = '';
      try{ loadPremiumRequestsAdmin && loadPremiumRequestsAdmin(); }catch(e){}
      return;
    }

    if(section==='users'){
      if(titleEl) titleEl.textContent = 'Uživatelé';
      if(cardUsers) cardUsers.style.display = '';
      return;
    }

    if(section==='bots'){
      if(titleEl) titleEl.textContent = 'Boti';
      if(cardBots) cardBots.style.display = '';
      try{ loadBotsUI && loadBotsUI(); }catch(e){}
      // Inbox is expensive => lazy within section only
      try{ loadBotInboxUI && loadBotInboxUI(); }catch(e){}
      try{ loadBotProfiles && loadBotProfiles(); }catch(e){}
      return;
    }

    if(section==='moderation'){
      if(titleEl) titleEl.textContent = 'Moderace';
      if(modRow) modRow.style.display = '';
      return;
    }

    if(section==='logs'){
      if(titleEl) titleEl.textContent = 'Logy';
      if(cardLogs) cardLogs.style.display = '';
      try{ loadAuditLogs(); }catch(e){}
      return;
    }
  }

  try{ window.initAdminDashboard = initAdminDashboard; }catch(e){}
  try{ window.showAdminSection = showAdminSection; }catch(e){}

window.__enterAdminStage5 = function(){
      try{
        if(isAdminUser(auth.currentUser)){
          // New admin UX: dashboard + lazy section loads
          initAdminDashboard && initAdminDashboard();
        }
      }catch(e){}
    };
  }catch(e){}

})();



// Global delegation: click on any element with data-uid opens profile
if(!window.__MK_UID_CLICK_DELEGATE__){
  window.__MK_UID_CLICK_DELEGATE__ = true;
  document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-uid]');
  if(!el) return;
  const uid = el.getAttribute('data-uid');
  if(!uid) return;

  // ignore if clicking inside input/textarea
  if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;

  // In LS/DM the row click must open the conversation, not the profile.
  // Allow opening profile only by clicking the avatar inside DM lists.
  const inDmThreads = !!e.target.closest('#dmThreads');
  const inDmHistory = !!e.target.closest('#dmHistory');
  if((inDmThreads || inDmHistory) && !e.target.closest('.ava')) return;

  if(window.showUserCard){
    e.preventDefault();
    e.stopPropagation();
    window.showUserCard(uid).catch(err=>{ console.error(err); });
  }
  });
}

// Chat avatar -> user card
document.getElementById('chatFeed')?.addEventListener('click', (e)=>{
  const a = e.target.closest('.ava');
  if(!a) return;
  const uid = a.getAttribute('data-uid');
  if(uid) { e.stopPropagation(); window.showUserCard && window.showUserCard(uid); }
});


