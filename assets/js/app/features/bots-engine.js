// Feature: Bot DM engine (pseudo-server, admin-only)
// Watches botRooms and can auto-reply in DMs + forward messages to botsInbox.
// This replaces the hidden logic previously buried in Stage5.

(function mkBotsEngine(){
  if(window.__MK_BOTS_ENGINE__) return;
  window.__MK_BOTS_ENGINE__ = true;

  const ROOM_LISTENERS = new Map(); // room -> {ref, cb}
  let _adminUid = '';
  let _roomsRef = null;
  let _roomsCb = null;
  let _started = false;

  function _isAdmin(){
    try{ return isAdminUser(auth.currentUser); }catch(e){ return false; }
  }

  async function _getBotConfigByUid(botUid){
    if(!botUid) return null;

    // Single source of truth: bots/{id} with uid format: bot_<id>
    const uid = String(botUid);
    if(!uid.startsWith('bot_')) return null;

    const id = uid.slice(4);
    if(!id) return null;

    const snap = await db.ref('bots/'+id).get();
    if(!snap.exists()) return null;
    const b = snap.val() || {};

    return {
      uid,
      id,
      nick: b.nick || 'Bot',
      avatar: b.avatar || './img/default-avatar.svg',
      mode: b.mode || 'chat',
      text: b.text || '',
      img: b.img || '',
      scenarios: Array.isArray(b.scenarios) ? b.scenarios : []
    };
  }


  async function _ensureBotPublic(bot){
    if(!bot || !bot.uid) return;
    const botUid = String(bot.uid);
    const now = Date.now();
    const ref = db.ref('usersPublic/'+botUid);
    const snap = await ref.get();
    const patch = {
      nick: bot.nick || 'Bot',
      avatar: bot.avatar || './img/default-avatar.svg',
      role: 'bot',
      updatedAt: now
    };
    if(!snap.exists()){
      patch.createdAt = now;
      await ref.set(patch);
    }else{
      await ref.update(patch);
    }
  }

  async function _incUnread(uid, room){
    try{
      await db.ref('inboxMeta/'+uid+'/'+room+'/unread').transaction(cur=>{
        cur = Number(cur||0);
        if(!isFinite(cur) || cur<0) cur=0;
        return Math.min(999, cur+1);
      });
    }catch(e){}
  }

  async function _handleBotRoomMessage(room, meta, m){
    if(!_adminUid) return;
    if(!meta || !meta.userUid || !meta.botUid) return;
    const userUid = String(meta.userUid);
    const botUid = String(meta.botUid);

    // Ignore bot messages (we only react to user input)
    const by = String(m.by||'');
    if(by === botUid) return;
    if(by.startsWith('bot_')) return;

    const ts = Number(m.ts||0);
    if(!ts) return;

    // Cross-tab dedupe: advance lastHandledTs atomically, handle only if committed
    const lhRef = db.ref('botRooms/'+room+'/lastHandledTs');
    const tr = await lhRef.transaction(cur=>{
      cur = Number(cur||0);
      if(!isFinite(cur)) cur=0;
      if(cur >= ts) return;
      return ts;
    });
    if(!tr.committed) return;

    // Forward to admin inbox (botsInbox/<adminUid>/<botUid>/...)
    const type = (botUid === PREMIUM_BOT_UID) ? 'payment' : 'bot';

    const p = {
      ts,
      botUid,
      room,
      from: userUid,
      fromUid: userUid,
      fromNick: (meta.userNick || ''),
      city: (meta.city || ''),
      type
    };
    if(m.text) p.text = String(m.text).slice(0, 1200);
    if(m.img) p.img = String(m.img).slice(0, 400000);

    try{
      await db.ref('botsInbox/'+_adminUid+'/'+botUid).push(p);
    }catch(e){ /* ignore */ }

    // Auto-reply only for bots that have DM enabled
    let bot = null;
    try{ bot = await _getBotConfigByUid(botUid); }catch(e){ bot = null; }
    if(!bot) return;

    const mode = String(bot.mode||'dm');
    if(mode !== 'dm' && mode !== 'both') return;

    try{ await _ensureBotPublic(bot); }catch(e){}

    // Choose scenario
    let replyText = String(bot.text||'').trim();
    let replyImg = String(bot.img||'').trim();
    const sc = Array.isArray(bot.scenarios) ? bot.scenarios.filter(x=>x && (x.text||x.img)) : [];
    if(sc.length){
      const pick = sc[Math.floor(Math.random()*sc.length)] || {};
      if(pick.text) replyText = String(pick.text).trim();
      if(pick.img) replyImg = String(pick.img).trim();
    }
    if(!replyText && !replyImg) return;

    const now = Date.now();
    const r = { by: botUid, ts: now };
    if(replyText) r.text = replyText.slice(0, 800);
    if(replyImg) r.img = replyImg.slice(0, 400000);

    // Ensure admin is a room member so writes are allowed
    try{
      await db.ref('privateMembers/'+room+'/'+_adminUid).set(true);
    }catch(e){}

    try{
      await db.ref('privateMessages/'+room).push(r);

      // Update inbox meta (user + admin)
      const upd={};
      upd['inboxMeta/'+userUid+'/'+room+'/with'] = botUid;
      upd['inboxMeta/'+userUid+'/'+room+'/ts'] = now;
      upd['inboxMeta/'+userUid+'/'+room+'/lastTs'] = now;
      upd['inboxMeta/'+userUid+'/'+room+'/lastText'] = (replyText||'[img]').slice(0,120);

      upd['inboxMeta/'+_adminUid+'/'+room+'/with'] = userUid;
      upd['inboxMeta/'+_adminUid+'/'+room+'/ts'] = now;
      upd['inboxMeta/'+_adminUid+'/'+room+'/lastTs'] = now;
      upd['inboxMeta/'+_adminUid+'/'+room+'/lastText'] = (replyText||'[img]').slice(0,120);

      await db.ref().update(upd);

      await _incUnread(userUid, room);
      await _incUnread(_adminUid, room);
    }catch(e){
      // ignore DM reply failures (rules / membership)
    }
  }

  function _detachRoom(room){
    const it = ROOM_LISTENERS.get(room);
    if(!it) return;
    try{ it.ref.off('child_added', it.cb); }catch(e){}
    ROOM_LISTENERS.delete(room);
  }

  function _attachRoom(room, meta){
    if(ROOM_LISTENERS.has(room)) return;

    // Join the room (admin membership), otherwise privateMessages read/write is blocked
    if(_adminUid){
      db.ref('privateMembers/'+room+'/'+_adminUid).set(true).catch(()=>{});
    }

    const ref = db.ref('privateMessages/'+room).limitToLast(1);
    const cb = async (snap)=>{
      const m = snap.val();
      if(!m) return;
      try{ await _handleBotRoomMessage(room, meta, m); }catch(e){ console.warn(e); }
    };
    ref.on('child_added', cb);
    ROOM_LISTENERS.set(room, {ref, cb});
  }

  function _refreshRooms(rooms){
    const active = new Set(Object.keys(rooms||{}));
    // detach removed
    for(const room of Array.from(ROOM_LISTENERS.keys())){
      if(!active.has(room)) _detachRoom(room);
    }
    // attach new
    for(const room of active){
      const meta = rooms[room] || {};
      _attachRoom(room, meta);
    }
  }

  function startBotsEngine(){
    if(_started) return;
    if(!_isAdmin()) return;
    _adminUid = auth.currentUser.uid;
    _started = true;

    _roomsRef = db.ref('botRooms');
    _roomsCb = (snap)=>{
      const rooms = snap.val() || {};
      _refreshRooms(rooms);
    };
    _roomsRef.on('value', _roomsCb);
  }

  function stopBotsEngine(){
    _started = false;
    try{ if(_roomsRef && _roomsCb) _roomsRef.off('value', _roomsCb); }catch(e){}
    _roomsRef=null; _roomsCb=null;
    for(const room of Array.from(ROOM_LISTENERS.keys())) _detachRoom(room);
    _adminUid='';
  }

  // Auto-start for admins
  auth.onAuthStateChanged((u)=>{
    if(u && isAdminUser(u)){
      setTimeout(()=>{ try{ startBotsEngine(); }catch(e){} }, 400);
    }else{
      stopBotsEngine();
    }
  });

  // Export minimal controls (optional)
  window.startBotsEngine = startBotsEngine;
  window.stopBotsEngine = stopBotsEngine;

})();
