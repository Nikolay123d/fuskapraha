/*
  Friends domain module
  - send/accept/decline/remove
  - loadFriends() renders view-friends
  - watchFriendRequestsBadge() maintains badges (tab + bell extra)

  IMPORTANT:
  - No DB listeners are started automatically on script load.
  - Badge watcher is started by auth-state (global lightweight watcher).
  - View rendering uses one-off reads (get()), keeping view lazy.
*/

(function friendsModule(){
  const UI_LOCK_MS = 1200;
  const __locks = new Map();

  function _now(){ return Date.now(); }

  function withLock(key, fn){
    const now = _now();
    const until = __locks.get(key) || 0;
    if(until > now) return Promise.resolve(false);
    __locks.set(key, now + UI_LOCK_MS);
    return Promise.resolve().then(fn).catch((e)=>{
      console.warn('[friends]', key, e);
      return false;
    });
  }

  function _trimId(v){ return String(v||'').trim(); }

  async function sendFriendRequest(toUid){
    const me = auth?.currentUser;
    if(!me){ try{ openModalAuth?.('login'); }catch(e){} return false; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); try{ openModalAuth?.('login'); }catch(e){} return false; }

    toUid = _trimId(toUid);
    if(!toUid) return false;

    // MVP privacy: email-based friend search is disabled.
    if(toUid.includes('@')){
      toast('Přidávání přátel podle e-mailu je vypnuto. Použijte UID.');
      return false;
    }

    if(toUid === me.uid){ toast('Nelze přidat sebe'); return false; }

    return withLock('send:'+toUid, async ()=>{
      // Optional limits
      try{
        if(window.checkLimit){
          const res = await window.checkLimit('friend');
          if(res && res.ok === false){
            toast(res.msg || 'Limit vyčerpán');
            return false;
          }
        }
      }catch(e){}

      // One request rule
      const [frSnap, outReqSnap, inReqSnap] = await Promise.all([
        db.ref('friends/'+me.uid+'/'+toUid).get(),
        db.ref('friendRequests/'+toUid+'/'+me.uid).get(),
        db.ref('friendRequests/'+me.uid+'/'+toUid).get()
      ]);

      if(frSnap.val() === 'accepted'){
        toast('Už jste přátelé');
        return false;
      }
      if(outReqSnap.exists()){
        toast('Žádost už byla odeslána');
        return false;
      }
      if(inReqSnap.exists()){
        // Incoming request exists → suggest accept
        if(confirm('Máte od tohoto uživatele žádost. Přijmout?')){
          await acceptFriend(toUid);
        }
        return true;
      }

      await db.ref('friendRequests/'+toUid+'/'+me.uid).set({ from: me.uid, ts: _now() });
      toast('Žádost odeslána');
      try{ playSound?.('ok'); }catch(e){}
      try{ window.incLimit && window.incLimit('friend'); }catch(e){}

      // If friends view is open, refresh it
      try{
        const active = document.querySelector('.view.active')?.id || '';
        if(active === 'view-friends') await loadFriends();
      }catch(e){}
      return true;
    });
  }

  async function acceptFriend(fromUid){
    const me = auth?.currentUser;
    if(!me){ try{ openModalAuth?.('login'); }catch(e){} return false; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); try{ openModalAuth?.('login'); }catch(e){} return false; }

    fromUid = _trimId(fromUid);
    if(!fromUid) return false;
    if(fromUid === me.uid) return false;

    return withLock('accept:'+fromUid, async ()=>{
      const req = (await db.ref('friendRequests/'+me.uid+'/'+fromUid).get()).val();
      if(!req){ toast('Žádost už není aktuální'); return false; }

      const updates = {};
      updates['friends/'+me.uid+'/'+fromUid] = 'accepted';
      updates['friends/'+fromUid+'/'+me.uid] = 'accepted';
      updates['friendRequests/'+me.uid+'/'+fromUid] = null;
      await db.ref().update(updates);

      toast('Přátelství potvrzeno');
      try{ playSound?.('ok'); }catch(e){}
      try{ await loadFriends(); }catch(e){}
      return true;
    });
  }

  async function declineFriend(fromUid){
    const me = auth?.currentUser;
    if(!me){ try{ openModalAuth?.('login'); }catch(e){} return false; }

    fromUid = _trimId(fromUid);
    if(!fromUid) return false;
    if(fromUid === me.uid) return false;

    return withLock('decline:'+fromUid, async ()=>{
      await db.ref('friendRequests/'+me.uid+'/'+fromUid).remove();
      toast('Odmítnuto');
      try{ await loadFriends(); }catch(e){}
      return true;
    });
  }

  async function removeFriend(uid){
    const me = auth?.currentUser;
    if(!me){ try{ openModalAuth?.('login'); }catch(e){} return false; }

    uid = _trimId(uid);
    if(!uid) return false;
    if(uid === me.uid) return false;

    return withLock('remove:'+uid, async ()=>{
      const updates = {};
      updates['friends/'+me.uid+'/'+uid] = null;
      updates['friends/'+uid+'/'+me.uid] = null;
      await db.ref().update(updates);
      toast('Odebráno');
      try{ playSound?.('ok'); }catch(e){}
      try{ await loadFriends(); }catch(e){}
      return true;
    });
  }

  function _setText(id, text){
    try{
      const el = document.getElementById(id);
      if(!el) return;
      el.textContent = text;
    }catch(e){}
  }

  function _setMiniLoad(on){
    try{ setMiniLoad('friendsMiniLoad', on ? 'Načítáme přátele…' : '', !!on); }catch(e){}
  }

  async function friendRow(uid, mode){
    const me = auth?.currentUser;
    const u = await getUser(uid);

    const row = document.createElement('div');
    row.className = 'msg';
    row.dataset.friendUid = uid;

    const ava = document.createElement('div');
    ava.className = 'ava';
    ava.dataset.uid = uid;
    const img = document.createElement('img');
    img.alt = '';
    img.src = u?.avatar || window.DEFAULT_AVATAR;
    ava.appendChild(img);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.width = '100%';

    const name = document.createElement('div');
    name.className = 'name';
    const b = document.createElement('b');
    b.textContent = u?.nick || 'Uživatel';
    const st = document.createElement('span');
    st.className = 'muted';
    st.style.marginLeft = '8px';
    st.textContent = u?.online ? 'online' : 'offline';
    name.appendChild(b);
    name.appendChild(st);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const btnDm = document.createElement('button');
    btnDm.type = 'button';
    btnDm.textContent = 'Napsat';
    btnDm.addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!me) return toast('Přihlaste se');
      try{ await openDMRoom(me.uid, uid); }catch(err){ console.warn(err); }
      try{ showView('view-dm'); }catch(err){}
    });
    actions.appendChild(btnDm);

    if(mode === 'request'){
      const btnAcc = document.createElement('button');
      btnAcc.type = 'button';
      btnAcc.textContent = 'Přijmout';
      btnAcc.addEventListener('click', async (e)=>{ e.stopPropagation(); await acceptFriend(uid); });
      actions.appendChild(btnAcc);

      const btnDec = document.createElement('button');
      btnDec.type = 'button';
      btnDec.className = 'danger';
      btnDec.textContent = 'Odmítnout';
      btnDec.addEventListener('click', async (e)=>{ e.stopPropagation(); await declineFriend(uid); });
      actions.appendChild(btnDec);
    }else{
      const btnRm = document.createElement('button');
      btnRm.type = 'button';
      btnRm.className = 'danger';
      btnRm.textContent = 'Odebrat';
      btnRm.addEventListener('click', async (e)=>{ e.stopPropagation(); if(confirm('Odebrat z přátel?')) await removeFriend(uid); });
      actions.appendChild(btnRm);
    }

    bubble.appendChild(name);
    bubble.appendChild(actions);
    row.appendChild(ava);
    row.appendChild(bubble);

    // avatar click => user card
    ava.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      try{ window.showUserCard && window.showUserCard(uid); }catch(e){}
    });

    return row;
  }

  async function loadFriends(){
    const me = auth?.currentUser;
    if(!me){
      _setMiniLoad(false);
      return;
    }

    const reqBox = document.getElementById('friendsRequests');
    const listBox = document.getElementById('friendsList');
    const empty = document.getElementById('friendsListEmpty');
    const reqSection = document.getElementById('friendsReqSection');

    if(!reqBox || !listBox) return;

    _setMiniLoad(true);
    try{
      reqBox.innerHTML = '';
      listBox.innerHTML = '';
      if(empty) empty.style.display = 'none';
      if(reqSection) reqSection.style.display = 'none';
      reqBox.style.display = 'none';

      const [rqSnap, frSnap] = await Promise.all([
        db.ref('friendRequests/'+me.uid).get(),
        db.ref('friends/'+me.uid).get()
      ]);

      const rq = rqSnap.val() || {};
      const fr = frSnap.val() || {};

      const reqUids = Object.keys(rq);
      const friendUids = Object.entries(fr)
        .filter(([_,st])=> st === 'accepted')
        .map(([uid])=>uid);

      // Requests section
      if(reqUids.length){
        if(reqSection) reqSection.style.display = 'flex';
        reqBox.style.display = '';
        for(const uid of reqUids){
          reqBox.appendChild(await friendRow(uid, 'request'));
        }
      }

      // Friends list
      if(friendUids.length){
        for(const uid of friendUids){
          listBox.appendChild(await friendRow(uid, 'friend'));
        }
      }else{
        if(empty) empty.style.display = '';
      }

      // Summary + inline badge
      const nReq = reqUids.length;
      const nFr  = friendUids.length;
      _setText('friendsSummary', `(${nFr} přátel, ${nReq} žádostí)`);
      _setText('friendsBadgeInline', nReq ? `(${nReq})` : '');

      // Highlight (from notification routing)
      try{
        const hl = window.__HIGHLIGHT_FRIEND_UID__;
        if(hl){
          const el = document.querySelector('[data-friend-uid="'+CSS.escape(hl)+'"]');
          if(el){
            el.scrollIntoView({behavior:'smooth', block:'center'});
            el.style.outline = '2px solid rgba(255,255,255,0.7)';
            el.style.borderRadius = '10px';
            setTimeout(()=>{ try{ el.style.outline=''; }catch(e){} }, 2200);
          }
          window.__HIGHLIGHT_FRIEND_UID__ = null;
        }
      }catch(e){}
    }catch(e){
      console.warn('loadFriends failed', e);
    }finally{
      _setMiniLoad(false);
    }
  }

  // --- Global badge watcher (started by auth-state) ---
  let __badgeRef = null;
  let __badgeCb = null;

  function watchFriendRequestsBadge(uid){
    // Unified registry (global): prevent duplicates
    try{ window.MK?.subs?.off('global', 'friendReqBadge'); }catch(e){}
    // detach
    try{ if(__badgeRef && __badgeCb) __badgeRef.off('value', __badgeCb); }catch(e){}
    __badgeRef = null;
    __badgeCb = null;

    const applyCount = (n)=>{
      try{
        const tab = document.getElementById('friendsBadgeTab');
        if(tab) tab.textContent = n ? `(${n})` : '';
      }catch(e){}
      try{
        const inline = document.getElementById('friendsBadgeInline');
        if(inline) inline.textContent = n ? `(${n})` : '';
      }catch(e){}
      // let notifications badge module merge it into bell counter
      try{ window.__mkSetFriendReqUnread && window.__mkSetFriendReqUnread(n); }catch(e){}
    };

    if(!uid){
      applyCount(0);
      return;
    }

    __badgeRef = db.ref('friendRequests/'+uid);
    __badgeCb = (snap)=>{
      const v = snap.val() || {};
      const n = Object.keys(v).length;
      applyCount(n);
    };
    __badgeRef.on('value', __badgeCb);

    // Register unified global off
    try{
      window.MK?.subs?.set('global', 'friendReqBadge', ()=>{
        try{ if(__badgeRef && __badgeCb) __badgeRef.off('value', __badgeCb); }catch(e){}
        __badgeRef = null;
        __badgeCb = null;
      });
    }catch(e){}
  }

  // --- UI wiring (no DB listeners) ---
  function wireUI(){
    const btn = document.getElementById('friendAddOpen');
    if(btn && !btn.dataset.friendsWired){
      btn.dataset.friendsWired = '1';
      btn.addEventListener('click', async ()=>{
        const me = auth?.currentUser;
        if(!me){ try{ openModalAuth?.('login'); }catch(e){} return; }
        const raw = prompt('Zadejte UID uživatele (e-mail vyhledávání je vypnuto):');
        if(!raw) return;
        await sendFriendRequest(raw);
      });
    }
  }
  // Defer scripts run after DOM parse, but still guard.
  try{ wireUI(); }catch(e){}
  document.addEventListener('DOMContentLoaded', ()=>{ try{ wireUI(); }catch(e){} });

  // Expose API (requested contract)
  window.sendFriendRequest = sendFriendRequest;
  window.acceptFriend = acceptFriend;
  window.declineFriend = declineFriend;
  window.removeFriend = removeFriend;
  window.loadFriends = loadFriends;
  window.watchFriendRequestBadge = watchFriendRequestsBadge;
  window.watchFriendRequestsBadge = watchFriendRequestsBadge; // legacy name

  // Router lifecycle expects this hook.
  // IMPORTANT: do NOT stop the global badge watcher here.
  window.__friendsUnsub = ()=>{};
})();
