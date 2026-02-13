// === DM (strict members) ===
function dmKey(a,b){ return [a,b].sort().join('_'); }
async function resolveUidByEmail(email){
  try{
    const e = String(email||'').trim().toLowerCase();
    if(!e || !e.includes('@')) return null;
    // Requires rules indexOn: usersPublic.emailLower
    const snap = await db.ref('usersPublic')
      .orderByChild('emailLower')
      .equalTo(e)
      .limitToFirst(1)
      .get();
    const v = snap.val() || {};
    return Object.keys(v)[0] || null;
  }catch(e){
    console.warn('[dm] resolveUidByEmail failed', e);
    return null;
  }
}
try{ window.resolveUidByEmail = window.resolveUidByEmail || resolveUidByEmail; }catch(e){}

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
  const room = dmKey(a,b);
  // set global DM state for sending
  currentDmRoom = room;
  // determine peer uid (other participant)
  const meUid = auth.currentUser ? auth.currentUser.uid : null;
  currentDmPeerUid = (meUid && meUid===a) ? b : (meUid && meUid===b ? a : b);
  // Ensure membership is written BEFORE we attach listeners / try to send.
  // SECURITY (strict rules): each user may only add THEMSELF to privateMembers.
  // The peer joins when they open the conversation from their inbox.
  try{
    if(meUid){
      await db.ref('privateMembers/'+room+'/'+meUid).set(true);
      // index rooms per user (for admin cleanup tools)
      await db.ref('privateRoomsByUser/'+meUid+'/'+room).set(true);
    }
  }catch(e){}
  // render
  renderDM(room);
}

// Expose the DM opener globally (inbox click handlers call window.openDMRoom)
window.openDMRoom = openDMRoom;

// Unified helper used by bell/friends/chat/etc.
async function openDM(peerUidOrEmail){
  const me = auth.currentUser;
  if(!me){
    window.__PENDING_VIEW__ = 'view-dm';
    try{ openModalAuth('login'); }catch(e){}
    return;
  }
  let uid = String(peerUidOrEmail||'').trim();
  if(!uid) return;
  if(uid.includes('@')){
    uid = await resolveUidByEmail(uid);
  }
  if(!uid){ toast('Uživatel nenalezen'); return; }
  return openDMRoom(me.uid, uid);
}
window.openDM = openDM;

async function renderDM(room){
  setMiniLoad('dmMiniLoad','Načítáme zprávy…', true);
  try{
    const me=auth.currentUser;
    if(me) db.ref('inboxMeta/'+me.uid+'/'+room+'/unread').set(0);
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

  // Premium bot panel belongs to composer (sticky). Only show in the bot room.
  try{ showPremiumBotPanel(room); }catch(e){}

  // Stop previous listeners (tab-scoped)
  try{ if(DM_REF){ DM_REF.off(); } }catch(e){}
  __DM_OLDEST_TS = null;

  let lastTs = 0;

  // --- Initial load (render once, no notify spam) ---
  try{
    // Load only the last N messages (fast restore after F5).
    const snap = await db.ref('privateMessages/'+room).orderByChild('ts').limitToLast(50).get();
    const v = snap.val()||{};
    const items = Object.entries(v)
      .map(([k,m])=>({k, m:m||{}}))
      .filter(it=>it.m && !it.m.deleted)
      .sort((a,b)=>(a.m.ts||0)-(b.m.ts||0));

    if(items.length===0){
      const empty=document.createElement('div');
      empty.className='muted';
      empty.style.padding='10px 12px';
      empty.textContent='Zatím žádné zprávy v této konverzaci.';
      box.appendChild(empty);
    }else{
      for(const it of items){
        const m = it.m || {};
        if(typeof m.ts==='number'){
          __DM_OLDEST_TS = (__DM_OLDEST_TS===null) ? m.ts : Math.min(__DM_OLDEST_TS, m.ts);
          lastTs = Math.max(lastTs, m.ts);
        }
        const u = await resolveMsgUser(m);
        const el=document.createElement('div'); el.className='msg'; el.dataset.mid=it.k;
        try{ el.dataset.ts = String((m&&m.ts)||Date.now()); }catch(e){}
        el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
          `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
          (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
          (m.img?`<div class="text"><img src="${esc(m.img)}"></div>`:'')+
          `</div>`;
        box.appendChild(el);
      }

      // Always land on the newest message
      requestAnimationFrame(()=>{ try{ box.scrollTop = box.scrollHeight; }catch(e){} });
    }
  }catch(e){
    console.warn('[dm] initial load failed', e);
  }finally{
    setMiniLoad('dmMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){}
  }

  // --- Load older by 20 when user scrolls to top ---
  box.onscroll = async ()=>{
    if(__DM_LOADING_OLDER) return;
    if(box.scrollTop > 10) return;
    if(!__DM_OLDEST_TS) return;
    __DM_LOADING_OLDER = true;
    const stopOlder = startMiniSequence('dmMiniLoad', ['Načítám starší DM…','Dešifruji…','Synchronizace…'], 650);
    try{
      const olderSnap = await db.ref('privateMessages/'+room).orderByChild('ts').endBefore(__DM_OLDEST_TS).limitToLast(30).get();
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
        try{ el.dataset.ts = String((m&&m.ts)||Date.now()); }catch(e){}
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
    finally{
      setMiniLoad('dmMiniLoad','', false);
      try{ stopOlder && stopOlder(); }catch(e){}
      __DM_LOADING_OLDER=false;
    }
  };

  // --- Live listener (only new messages, no full re-render) ---
  const liveRef = db.ref('privateMessages/'+room).orderByChild('ts').startAt(lastTs||0);
  DM_REF = liveRef;
  const meUid = auth.currentUser ? auth.currentUser.uid : null;

  const onAdd = async (snap)=>{
    const m=snap.val()||{};
    if(!m || m.deleted) return;
    if(box.querySelector(`[data-mid="${snap.key}"]`)) return;

    // Track oldest ts for pagination
    if(typeof m.ts==='number'){
      __DM_OLDEST_TS = (__DM_OLDEST_TS===null) ? m.ts : Math.min(__DM_OLDEST_TS, m.ts);
    }

    const wasNearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 140;

    const u = await resolveMsgUser(m);
    const el=document.createElement('div'); el.className='msg'; el.dataset.mid=snap.key;
    try{ el.dataset.ts = String((m&&m.ts)||Date.now()); }catch(e){}
    el.innerHTML = `<div class="ava" data-uid="${esc(m.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(m.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(m.ts||0)}</div></div>`+
      (m.text?`<div class="text">${esc(m.text)}</div>`:'')+
      (m.img?`<div class="text"><img src="${esc(m.img)}"></div>`:'')+
      `</div>`;
    box.appendChild(el);

    // Auto-scroll if user is at bottom OR this is my message
    if(wasNearBottom || (meUid && m.by===meUid)){
      requestAnimationFrame(()=>{ try{ box.scrollTop = box.scrollHeight; }catch(e){} });
    }

    // No sound/notify for own messages
    if(meUid && m.by===meUid) return;

    try{ playSound('dm'); }catch(e){}
    try{ notify('Nová DM', (u.nick||'Uživatel')+': '+(m.text||'')); }catch(e){}
  };
  liveRef.on('child_added', onAdd);

  // Register DM room listener as tab-scoped subscription (killed on tab switch).
  try{
    if(window.MK && window.MK.subs){
      window.MK.subs.add(()=>{ try{ liveRef.off('child_added', onAdd); }catch(e){} }, {scope:'tab', key:'dmRoom'});
    }
  }catch(e){}
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
  panel.style.display = isPremiumBotRoom(room) ? 'block' : 'none';
  if(!isPremiumBotRoom(room)) return;

  const stepEl = document.getElementById('botPremiumStep');
  const actions = document.getElementById('botPremiumActions');
  const hint = document.getElementById('botPremiumHint');

  const stateKey = 'premium_bot_state_'+auth.currentUser.uid;
  const st = JSON.parse(localStorage.getItem(stateKey) || '{"step":"choose","plan":null,"proof":null}');
  actions.innerHTML = '';

  function setState(next){
    localStorage.setItem(stateKey, JSON.stringify(next));
    showPremiumBotPanel(room);
  }

  if(st.step==='choose'){
    stepEl.textContent = '1/3 — vyberte balíček';
    hint.textContent = 'Bot vysvětlí rozdíly. Vyberte si jednu variantu.';
    const intro = `Ahoj! Jsem bot pro nákup privilegií.

Vyber si balíček a já ti vysvětlím výhody.

VIP (100 Kč / navždy): zvýraznění profilu, badge VIP, vyšší důvěra.
Premium (150 Kč / měsíc): badge Premium, možnost reklamy 1× za hodinu (přes bot) + přednostní pozice.
Premium+ (200 Kč / měsíc): vše z Premium + výrazné zvýraznění a reklama 1× za 30 minut.

Po výběru ti pošlu QR kód. Zaplať a pošli sem fotku/printscreen platby, pak stiskni "Podat žádost".`;
    ensureBotIntro(room, intro);
    addPlanBtn('VIP 100 Kč', 'vip');
    addPlanBtn('Premium 150 Kč', 'premium');
    addPlanBtn('Premium+ 200 Kč', 'premiumPlus');
    return;
  }

  if(st.step==='pay'){
    stepEl.textContent = '2/3 — platba';
    hint.innerHTML = `Zvolený balíček: <b>${PREMIUM_PLANS[st.plan].title}</b> (${PREMIUM_PLANS[st.plan].price} Kč / ${PREMIUM_PLANS[st.plan].period}).<br>Naskenujte QR, zaplaťte a pošlete sem fotku/printscreen.`;
    addBtn('Změnit balíček', ()=>setState({step:'choose',plan:null,proof:null}), 'ghost');
    addBtn('Zobrazit QR', ()=>botSendQR(room), 'primary');
    addBtn('Už jsem poslal(a) fotku', ()=>setState({...st, step:'submit'}), 'primary');
    // send QR once
    ensureBotQR(room);
    return;
  }

  if(st.step==='submit'){
    stepEl.textContent = '3/3 — odeslat žádost';
    hint.textContent = 'Pošlete prosím fotku/printscreen platby do chatu s botem a pak stiskněte "Podat žádost".';
    addBtn('Zpět', ()=>setState({...st, step:'pay'}), 'ghost');
    addBtn('Podat žádost', async ()=>{
      const proof = await findLastProof(room);
      if(!proof) return toast('Nevidím žádnou fotku platby. Pošlete ji do tohoto chatu.');
      const req = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || '',
        plan: st.plan,
        price: PREMIUM_PLANS[st.plan].price,
        period: PREMIUM_PLANS[st.plan].period,
        proofImg: proof,
        ts: Date.now(),
        status: 'pending'
      };
      const id = db.ref('payments/requests/'+auth.currentUser.uid).push().key;
      await db.ref('payments/requests/'+auth.currentUser.uid+'/'+id).set(req);
      botSay(room, '✅ Žádost byla odeslána adminovi. Děkujeme! (Stav: pending)');
      toast('Žádost odeslána do admin sekce');
      setState({step:'choose',plan:null,proof:null});
    }, 'primary');
    return;
  }

  function addBtn(text, fn, cls){
    const b=document.createElement('button');
    b.type='button';
    b.textContent=text;
    b.className = cls==='ghost'?'ghost':'';
    b.onclick=fn;
    actions.appendChild(b);
  }
  function addPlanBtn(label, plan){
    addBtn(label, async ()=>{
      // write user selection
      await db.ref('privateMessages/'+room).push({by: auth.currentUser.uid, text: `Chci koupit: ${PREMIUM_PLANS[plan].title}`, ts: Date.now()});
      botSay(room, `Vybral(a) jste ${PREMIUM_PLANS[plan].title}. Cena: ${PREMIUM_PLANS[plan].price} Kč (${PREMIUM_PLANS[plan].period}).`);
      botSendQR(room);
      setState({step:'pay',plan,proof:null});
    }, 'primary');
  }
}

async function botSay(room, text){
  return db.ref('privateMessages/'+room).push({by: auth.currentUser.uid, botUid: PREMIUM_BOT_UID, text, ts: Date.now(), bot:true});
}

async function botSendQR(room){
  await botSay(room, 'Prosím zaplaťte pomocí QR a pošlete sem fotku/printscreen platby.');
  await db.ref('privateMessages/'+room).push({by: auth.currentUser.uid, botUid: PREMIUM_BOT_UID, img: await getPremiumQrImg(), text:'QR platba', ts: Date.now(), bot:true});
}

async function ensureBotIntro(room, introText){
  // if no bot message exists, send intro
  const snap = await db.ref('privateMessages/'+room).limitToLast(5).get();
  const v=snap.val()||{};
  const anyBot = Object.values(v).some(m=>m && m.bot===true && m.botUid===PREMIUM_BOT_UID);
  if(!anyBot){
    await botSay(room, introText);
  }
  // ensure membership meta (inbox)
  const u=auth.currentUser; if(!u) return;
  await db.ref('inboxMeta/'+u.uid+'/'+room).set({with: PREMIUM_BOT_UID, ts: Date.now(), lastTs: Date.now(), title:'Bot — Nákup privilegia'});
}

async function ensureBotQR(room){
  // send QR if not sent yet in last 10 msgs
  const snap = await db.ref('privateMessages/'+room).limitToLast(10).get();
  const v=snap.val()||{};
  const qr=await getPremiumQrImg();
  const hasQr = Object.values(v).some(m=>m && m.bot===true && m.botUid===PREMIUM_BOT_UID && (m.img===qr || m.img===PREMIUM_QR_IMG_DEFAULT));
  if(!hasQr){
    await botSendQR(room);
  }
}

async function findLastProof(room){
  const snap = await db.ref('privateMessages/'+room).limitToLast(30).get();
  const v=snap.val()||{};
  const msgs = Object.values(v).filter(Boolean).sort((a,b)=>(a.ts||0)-(b.ts||0));
  // last image sent by current user
  for(let i=msgs.length-1;i>=0;i--){
    const m=msgs[i];
    if(m.by===auth.currentUser.uid && m.img) return m.img;
  }
  return null;
}

async function openPremiumBot(){
  const u=auth.currentUser;
  if(!u) return toast('Nejprve se přihlaste');
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

  // Client-side anti-spam (double click)
  try{ if(window.MK && !window.MK.lockTake('dm:send', 900)) return; }catch(e){}

  // Plan limits
  try{ if(typeof checkLimit==='function'){ const ok = await checkLimit('dm'); if(!ok) return; } }catch(e){}

  try{
    const text=$('#dmText')?.value?.trim() || '';
    const img=pendingDmImg;
    if(!text && !img) return;

    const room=currentDmRoom;
    const ts=Date.now();

    // Ensure membership (self-only). Peer joins when they open the thread.
    await db.ref('privateMembers/'+room+'/'+me.uid).set(true);

    // 3) write message
    await db.ref('privateMessages/'+room).push({by:me.uid, ts, text: text||null, img: img||null});

    // 4) update inbox meta + unread (room-keyed)
    const preview = (text && text.length) ? text.slice(0,120) : (img ? '📷 Foto' : '');
    const peer = String(currentDmPeerUid||'').trim();
    const isBotPeer = !!peer && (peer === 'bot_premium' || peer.startsWith('bot_'));
    const updates={};
    updates[`inboxMeta/${me.uid}/${room}/with`] = peer;
    updates[`inboxMeta/${me.uid}/${room}/ts`] = ts;
    updates[`inboxMeta/${me.uid}/${room}/lastTs`] = ts;
    updates[`inboxMeta/${me.uid}/${room}/lastText`] = preview;
    updates[`inboxMeta/${me.uid}/${room}/unread`] = 0;

    // For real users, also update the peer inbox. For local bots we keep everything in the user's inbox only.
    if(peer && !isBotPeer){
      updates[`inboxMeta/${peer}/${room}/with`] = me.uid;
      updates[`inboxMeta/${peer}/${room}/ts`] = ts;
      updates[`inboxMeta/${peer}/${room}/lastTs`] = ts;
      updates[`inboxMeta/${peer}/${room}/lastText`] = preview;
    }
    await db.ref().update(updates);

    // increment unread for peer (transaction)
    try{
      if(peer && !isBotPeer){
        await db.ref(`inboxMeta/${peer}/${room}/unread`).transaction(n=> (n||0)+1);
      }
    }catch(e){}

    // SECURITY: do NOT write notifications from regular users (rules are admin-only).

    // Counters after success
    try{ if(typeof incLimit==='function') await incLimit('dm'); }catch(e){}

    if($('#dmText')) $('#dmText').value='';
    if($('#dmPhoto')) $('#dmPhoto').value='';
    pendingDmImg=null;
    toast('Odesláno'); playSound('ok');
    // Do NOT re-render the whole thread after send.
    // Live listener appends the new message and keeps scroll stable.
  }catch(e){ console.error(e); playSound('err'); }
});


