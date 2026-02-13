// === Friends module (single source of truth) ===
// API:
//   sendFriendRequest(email|uid)
//   acceptFriend(uid)
//   declineFriend(uid)
//   removeFriend(uid)
//   loadFriends()
//   watchFriendRequestsBadge(uid)

// ---------------------------------------------------------------------------
// UID resolver by email (uses usersPublic.emailLower + index)
// ---------------------------------------------------------------------------
async function resolveUidByEmail(email){
  try{
    const e = String(email||'').trim().toLowerCase();
    if(!e || !e.includes('@')) return null;
    const snap = await db.ref('usersPublic')
      .orderByChild('emailLower')
      .equalTo(e)
      .limitToFirst(1)
      .get();
    const v = snap.val() || {};
    const uid = Object.keys(v)[0] || null;
    return uid;
  }catch(e){
    console.warn('[friends] resolveUidByEmail failed', e);
    return null;
  }
}
try{ window.resolveUidByEmail = resolveUidByEmail; }catch(e){}

// ---------------------------------------------------------------------------
// Badges (global watcher)
// ---------------------------------------------------------------------------
let _frBadgeRef = null;
let _frBadgeCb = null;

function _setFriendsBadges(n){
  const cnt = Number(n||0);
  const topBadge=document.getElementById('friendsBadgeTop');
  const tabBadge=document.getElementById('friendsBadgeTab');
  const inlineBadge=document.getElementById('friendsBadgeInline');
  if(topBadge){ topBadge.textContent = cnt ? String(cnt) : ''; topBadge.style.display = cnt ? 'inline-flex' : 'none'; }
  if(tabBadge){ tabBadge.textContent = cnt ? ('('+cnt+')') : ''; }
  if(inlineBadge){ inlineBadge.textContent = cnt ? ('('+cnt+')') : ''; }
}

function watchFriendRequestsBadge(uid){
  try{ if(_frBadgeRef && _frBadgeCb) _frBadgeRef.off('value', _frBadgeCb); }catch(e){}
  _frBadgeRef = null;
  _frBadgeCb = null;
  _setFriendsBadges(0);

  if(!uid) return;

  const ref = db.ref('friendRequests/'+uid);
  const cb = (snap)=>{
    const v = snap.val() || {};
    _setFriendsBadges(Object.keys(v).length);
  };
  ref.on('value', cb);
  _frBadgeRef = ref;
  _frBadgeCb = cb;

  // register in global subscription registry
  try{
    if(window.MK && window.MK.subs){
      window.MK.subs.add(()=>{ try{ ref.off('value', cb); }catch(e){} }, {scope:'global', key:'friendsBadge'});
    }
  }catch(e){}
}
try{ window.watchFriendRequestsBadge = watchFriendRequestsBadge; }catch(e){}

// ---------------------------------------------------------------------------
// Core ops
// ---------------------------------------------------------------------------

async function sendFriendRequest(emailOrUid){
  const me = auth.currentUser;
  if(!me){ openModalAuth('login'); return; }
  if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
  if(me.emailVerified===false){
    const until=getVerifyDeadline(me);
    if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
  }

  let toUid = String(emailOrUid||'').trim();
  if(!toUid) return;
  if(toUid.includes('@')){
    const resolved = await resolveUidByEmail(toUid);
    if(!resolved){ toast('Email neznám'); return; }
    toUid = resolved;
  }

  if(toUid === me.uid){ toast('Nemůžete přidat sami sebe'); return; }

  // Lock (anti double-click)
  try{
    if(window.MK && !window.MK.lockTake('friend:send:'+toUid, 1500)) return;
  }catch(e){}

  // Limits
  try{
    if(typeof checkLimit==='function'){
      const ok = await checkLimit('friend');
      if(!ok) return;
    }
  }catch(e){}

  // Prevent duplicates / invalid state
  try{
    const [fr, inReq, outReq] = await Promise.all([
      db.ref('friends/'+me.uid+'/'+toUid).get(),
      db.ref('friendRequests/'+me.uid+'/'+toUid).get(),
      db.ref('friendRequests/'+toUid+'/'+me.uid).get()
    ]);
    const st = fr.val();
    if(st === 'accepted'){
      toast('Už jste přátelé');
      return;
    }
    if(outReq.exists()){
      toast('Žádost už byla odeslána');
      return;
    }
    if(inReq.exists()){
      toast('Uživatel vám už poslal žádost — otevřete Přátele a potvrďte');
      showView('view-friends');
      return;
    }
  }catch(e){
    console.warn('[friends] precheck failed', e);
  }

  const ts = Date.now();
  try{
    await db.ref('friendRequests/'+toUid+'/'+me.uid).set({from: me.uid, ts});

    // SECURITY: notifications are admin-only (no user-to-user spam).
    // Friend badges are driven by /friendRequests watchers.

    // Increment counters AFTER success
    try{ if(typeof incLimit==='function') await incLimit('friend'); }catch(e){}

    toast('Žádost odeslána');
    playSound('ok');
  }catch(e){
    console.error('[friends] send failed', e);
    toast('Chyba při odeslání');
    playSound('err');
  }
}
try{ window.sendFriendRequest = sendFriendRequest; }catch(e){}

async function acceptFriend(uid){
  const me = auth.currentUser;
  if(!me){ openModalAuth('login'); return; }
  const fromUid = String(uid||'').trim();
  if(!fromUid) return;

  try{
    if(window.MK && !window.MK.lockTake('friend:accept:'+fromUid, 1200)) return;
  }catch(e){}

  try{
    const req = await db.ref('friendRequests/'+me.uid+'/'+fromUid).get();
    if(!req.exists()){
      toast('Žádost už neexistuje');
      return;
    }

    const updates = {};
    updates['friends/'+me.uid+'/'+fromUid] = 'accepted';
    updates['friends/'+fromUid+'/'+me.uid] = 'accepted';
    updates['friendRequests/'+me.uid+'/'+fromUid] = null;
    await db.ref().update(updates);

    // SECURITY: notifications are admin-only (no user-to-user spam).

    toast('Přidáno');
    playSound('ok');
    try{ await loadFriends(); }catch(e){}
  }catch(e){
    console.error('[friends] accept failed', e);
    toast('Chyba');
    playSound('err');
  }
}
try{ window.acceptFriend = acceptFriend; }catch(e){}

async function declineFriend(uid){
  const me = auth.currentUser;
  if(!me){ openModalAuth('login'); return; }
  const fromUid = String(uid||'').trim();
  if(!fromUid) return;

  try{
    if(window.MK && !window.MK.lockTake('friend:decline:'+fromUid, 900)) return;
  }catch(e){}

  try{
    await db.ref('friendRequests/'+me.uid+'/'+fromUid).remove();
    toast('Odmítnuto');
    playSound('ok');
    try{ await loadFriends(); }catch(e){}
  }catch(e){
    console.error('[friends] decline failed', e);
    toast('Chyba');
    playSound('err');
  }
}
try{ window.declineFriend = declineFriend; }catch(e){}

async function removeFriend(uid){
  const me = auth.currentUser;
  if(!me){ openModalAuth('login'); return; }
  const other = String(uid||'').trim();
  if(!other) return;

  try{
    if(window.MK && !window.MK.lockTake('friend:remove:'+other, 1200)) return;
  }catch(e){}

  try{
    const updates = {};
    updates['friends/'+me.uid+'/'+other] = null;
    updates['friends/'+other+'/'+me.uid] = null;
    await db.ref().update(updates);
    toast('Odebráno');
    playSound('ok');
    try{ await loadFriends(); }catch(e){}
  }catch(e){
    console.error('[friends] remove failed', e);
    toast('Chyba');
    playSound('err');
  }
}
try{ window.removeFriend = removeFriend; }catch(e){}

// ---------------------------------------------------------------------------
// UI rendering
// ---------------------------------------------------------------------------

async function _friendRow(uid, status){
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  const u = await getUser(uid);
  const nick = u?.nick || 'Uživatel';
  const avatar = u?.avatar || window.DEFAULT_AVATAR;
  const st = String(status||'').trim() || 'friend';

  let actions = '';
  if(st==='pending'){
    actions = `<button data-act="accept">Přijmout</button><button data-act="decline" class="danger">Odmítnout</button>`;
  }else{
    actions = `<button data-act="dm">Napsat</button><button data-act="remove" class="danger">Odebrat</button>`;
  }

  wrap.innerHTML = `
    <div class="ava" data-uid="${esc(uid)}"><img src="${esc(avatar)}" alt="" loading="lazy"></div>
    <div class="bubble" style="width:100%">
      <div class="name" data-uid="${esc(uid)}"><b>${esc(nick)}</b></div>
      <div class="muted">${esc(st)}</div>
      <div class="actions">${actions}</div>
    </div>
  `;

  wrap.addEventListener('click', async (e)=>{
    const btn = e.target?.closest('button');
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const act = btn.dataset.act;
    if(act==='accept') return acceptFriend(uid);
    if(act==='decline') return declineFriend(uid);
    if(act==='remove') return removeFriend(uid);
    if(act==='dm'){
      try{ await openDM(uid); }catch(e){}
      return;
    }
  });

  // Avatar fallback
  try{
    const img = wrap.querySelector('img');
    if(img) img.onerror = ()=>{ try{ img.src = window.DEFAULT_AVATAR; }catch(e){} };
  }catch(e){}

  return wrap;
}

async function loadFriends(){
  const stopSeq = startMiniSequence('friendsMiniLoad', [
    'Načítám přátele…',
    'Synchronizuji žádosti…',
    'Aktualizuji seznam…'
  ], 650);

  const me = auth.currentUser;
  if(!me){
    try{ stopSeq && stopSeq(); }catch(e){}
    setMiniLoad('friendsMiniLoad','', false);
    return;
  }

  const reqBox = document.getElementById('friendsRequests');
  const listBox = document.getElementById('friendsList');
  const reqSection = document.getElementById('friendsReqSection');
  const reqEmpty = document.getElementById('friendsReqEmpty');
  const listEmpty = document.getElementById('friendsListEmpty');

  if(reqBox) reqBox.innerHTML = '';
  if(listBox) listBox.innerHTML = '';
  if(reqEmpty) reqEmpty.style.display = 'none';
  if(listEmpty) listEmpty.style.display = 'none';

  try{
    const [rqSnap, frSnap] = await Promise.all([
      db.ref('friendRequests/'+me.uid).get(),
      db.ref('friends/'+me.uid).get()
    ]);

    const rq = rqSnap.val() || {};
    const pendingUids = Object.keys(rq);

    // section visibility
    if(reqSection) reqSection.style.display = pendingUids.length ? 'flex' : 'none';
    if(reqEmpty) reqEmpty.style.display = pendingUids.length ? 'none' : 'block';
    if(reqBox){
      for(const uid of pendingUids){
        reqBox.appendChild(await _friendRow(uid, 'pending'));
      }
    }

    const fr = frSnap.val() || {};
    const friendsUids = Object.keys(fr);
    if(listEmpty) listEmpty.style.display = friendsUids.length ? 'none' : 'block';
    if(listBox){
      for(const uid of friendsUids){
        const st = fr[uid] || 'accepted';
        listBox.appendChild(await _friendRow(uid, st));
      }
    }

  }catch(e){
    console.warn('[friends] loadFriends failed', e);
  }finally{
    setMiniLoad('friendsMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){}
  }
}
try{ window.loadFriends = loadFriends; }catch(e){}

// Wire UI controls
try{
  if(!window.__MK_FRIENDS_UI_WIRED){
    window.__MK_FRIENDS_UI_WIRED = true;

    document.getElementById('friendAddBtn')?.addEventListener('click', async ()=>{
      const email = (document.getElementById('friendEmail')?.value||'').trim();
      if(!email) return;
      await sendFriendRequest(email);
      try{ document.getElementById('friendEmail').value = ''; }catch(e){}
    });
  }
}catch(e){}
