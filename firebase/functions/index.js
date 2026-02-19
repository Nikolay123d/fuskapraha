const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const rtdb = admin.database();

// -------------------------
// Helpers
// -------------------------
function now(){ return Date.now(); }
function dayKey(ts){ return new Date(ts || Date.now()).toISOString().slice(0,10); }

function normPlan(p){
  p = String(p || 'free').trim().toLowerCase();
  if(p === 'premium+' || p === 'premium_plus') return 'premiumplus';
  if(p === 'prem') return 'premium';
  return p;
}

function effectivePlan(plan, until){
  const p = normPlan(plan);
  const u = Number(until || 0);
  // If an expiry timestamp exists and is in the past → treat as free.
  if(u && u > 0 && u < now()) return 'free';
  return p;
}

const PLAN_LIMITS = {
  free:       { friend: 10,  dm_init: 10,  autopost_posts: 0,  report: 10, support_ticket: 10 },
  premium:    { friend: 30,  dm_init: 100, autopost_posts: 15, report: 30, support_ticket: 30 },
  premiumplus:{ friend: 60,  dm_init: 300, autopost_posts: 30, report: 60, support_ticket: 60 },
  vip:        { friend: 9999, dm_init: 9999, autopost_posts: 9999, report: 9999, support_ticket: 9999 }
};

// Feature-gates (non-daily): used for server-only validations.
const PLAN_FEATURES = {
  free:        { autopost: { slots: 0,  minIntervalMin: 120, photos: false } },
  premium:     { autopost: { slots: 1,  minIntervalMin: 60,  photos: true  } },
  premiumplus: { autopost: { slots: 3,  minIntervalMin: 30,  photos: true  } },
  vip:         { autopost: { slots: 10, minIntervalMin: 15,  photos: true  } }
};

function getFeatures(plan){
  plan = normPlan(plan);
  return PLAN_FEATURES[plan] || PLAN_FEATURES.free;
}

async function assertNotBanned(uid, mode){
  // mode: 'chat' | 'dm' | 'autopost' (controls which ban list is checked)
  const ts = now();
  const checks = [rtdb.ref(`bans/${uid}`).get()];
  if(mode === 'dm') checks.push(rtdb.ref(`dmBans/${uid}`).get());
  // For autopost we treat mutes as a sending restriction.
  if(mode === 'autopost') checks.push(rtdb.ref(`mutes/${uid}`).get());
  const snaps = await Promise.all(checks);
  for(const s of snaps){
    const v = s.val();
    if(v && typeof v.until === 'number' && v.until > ts){
      throw new functions.https.HttpsError('failed-precondition', 'banned', { until: v.until, reason: v.reason || null });
    }
  }
}

async function simpleRateLimit(uid, key, maxPerWindow, windowMs){
  // Store counters in server-only subtree. Admin SDK bypasses rules.
  const bucket = Math.floor(now() / windowMs);
  const ref = rtdb.ref(`rateLimits/${uid}/${key}/${bucket}`);
  const res = await ref.transaction(cur => {
    cur = Number(cur || 0);
    if(cur + 1 > maxPerWindow) return;
    return cur + 1;
  }, { applyLocally: false });
  if(!res.committed){
    throw new functions.https.HttpsError('resource-exhausted', 'rate_limited');
  }
  return true;
}

function getLimit(plan, action){
  plan = normPlan(plan);
  const row = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const v = row[action];
  if(v === undefined || v === null) return 999999;
  return v;
}

function dmKey(a,b){
  const x = String(a||'');
  const y = String(b||'');
  return x < y ? `${x}_${y}` : `${y}_${x}`;
}

async function pushNotif(uid, payload){
  if(!uid) return;
  const ref = rtdb.ref(`notifications/${uid}`).push();
  const data = Object.assign({ ts: now() }, payload || {});
  await ref.set(data);
}

// -------------------------
// Callable: consumeLimit
// -------------------------
exports.consumeLimit = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const uid = context.auth.uid;
  // Called frequently (UI checks). Keep generous but protect from hot loops.
  await simpleRateLimit(uid, 'consumeLimit', 240, 60 * 1000);
  const action = String((data && data.action) || '').trim();
  const amount = Number((data && data.amount) ?? 1);
  const dryRun = !!(data && data.dryRun);

  if(!action){
    throw new functions.https.HttpsError('invalid-argument', 'action required');
  }

  // Only known actions (avoid abuse)
  const allowed = new Set(['friend','dm_init','autopost_posts','report','support_ticket']);
  if(!allowed.has(action)){
    // Unknown actions are treated as allowed but not tracked
    return { ok: true, action, limit: 999999, used: 0, remaining: 999999, skipped: true };
  }

  if(!Number.isFinite(amount) || amount < 0 || amount > 100){
    throw new functions.https.HttpsError('invalid-argument', 'invalid amount');
  }

  const up = (await rtdb.ref(`usersPublic/${uid}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  const limit = getLimit(plan, action);

  // VIP (infinite)
  if(limit >= 9999){
    return { ok: true, action, plan, limit, used: 0, remaining: 999999 };
  }

  const dk = dayKey();
  const ref = rtdb.ref(`users/${uid}/limits/${dk}/${action}`);

  const snap = await ref.get();
  const used = Number(snap.val() || 0);

  if(dryRun || amount === 0){
    const ok = used < limit;
    return { ok, action, plan, limit, used, remaining: Math.max(0, limit - used) };
  }

  const res = await ref.transaction(cur => {
    cur = Number(cur || 0);
    if(cur + amount > limit) return;
    return cur + amount;
  });

  if(!res.committed){
    return { ok: false, action, plan, limit, used, remaining: Math.max(0, limit - used) };
  }

  const newUsed = Number(res.snapshot.val() || 0);
  return { ok: true, action, plan, limit, used: newUsed, remaining: Math.max(0, limit - newUsed) };
});


// -------------------------
// Callable: profileInit (server-authoritative usersPublic bootstrap)
// -------------------------
exports.profileInit = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;

  // Avoid function spam on every page load
  await simpleRateLimit(uid, 'profileInit', 30, 60 * 60 * 1000);

  const nickIn = String((data && data.nick) || '').trim();
  const roleIn = String((data && data.role) || '').trim().toLowerCase();
  const avatarIn = String((data && data.avatar) || '').trim();

  const fallback = (() => {
    try{
      const suf = String(uid||'').slice(-4);
      return suf ? `Uživatel #${suf}` : 'Uživatel';
    }catch(e){
      return 'Uživatel';
    }
  })();

  const DEFAULT_AVATAR = './assets/img/default-avatar.svg';
  const allowedRoles = new Set(['seeker','employer']);

  let nick = nickIn;
  if(!nick || nick.length > 60){
    const tokenName = String((context.auth.token && context.auth.token.name) || '').trim();
    nick = (tokenName && tokenName.length <= 60) ? tokenName : fallback;
  }

  const role = allowedRoles.has(roleIn) ? roleIn : 'seeker';

  let avatar = avatarIn || '';
  if(avatar){
    // Allow dataURL or http(s) URL or local path
    if(avatar.length > 400000) avatar = '';
    else if(!(avatar.startsWith('data:image/') || avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('./') || avatar.startsWith('/'))){
      avatar = '';
    }
  }

  const ts = now();
  const ref = rtdb.ref(`usersPublic/${uid}`);
  const snap = await ref.get();
  const cur = snap.val() || null;
  const existed = !!cur;

  const upd = {};
  if(!existed){
    upd.nick = nick;
    upd.role = role;
    upd.avatar = avatar || DEFAULT_AVATAR;
    upd.plan = 'free';
    upd.createdAt = ts;
    upd.updatedAt = ts;
  }else{
    // Fill missing only; never override existing user/admin edits.
    if(!cur.nick) upd.nick = nick;
    if(!cur.role) upd.role = role;
    if(!cur.avatar) upd.avatar = avatar || DEFAULT_AVATAR;
    if(!cur.plan) upd.plan = 'free';
    if(!cur.createdAt) upd.createdAt = ts;
    upd.updatedAt = ts;
    if(cur.email) upd.email = null;
  }

  if(Object.keys(upd).length){
    await ref.update(upd);
  }

  const ak = rtdb.ref('auditLogs').push().key;
  await rtdb.ref(`auditLogs/${ak}`).set({ ts, type: 'profileInit', by: uid, existed });

  return { ok:true, existed, nick: existed ? (cur && cur.nick) || upd.nick : upd.nick, role: existed ? (cur && cur.role) || upd.role : upd.role };
});

// -------------------------
// Callable: profileUpdatePublic (nick/avatar/role) server-authoritative
// -------------------------
exports.profileUpdatePublic = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  await simpleRateLimit(uid, 'profileUpdatePublic', 60, 60 * 60 * 1000);

  const patch = (data && data.patch) || null;
  if(!patch || typeof patch !== 'object'){
    throw new functions.https.HttpsError('invalid-argument', 'patch required');
  }

  const allowed = ['nick','avatar','role'];
  // Reject unknown keys
  for(const k of Object.keys(patch)){
    if(!allowed.includes(k)){
      throw new functions.https.HttpsError('invalid-argument', `disallowed field: ${k}`);
    }
  }

  const clean = {};
  if(patch.nick !== undefined){
    const nick = String(patch.nick || '').trim();
    if(!nick || nick.length > 60) throw new functions.https.HttpsError('invalid-argument', 'invalid nick');
    clean.nick = nick;
  }
  if(patch.role !== undefined){
    const role = String(patch.role || '').trim().toLowerCase();
    const allowedRoles = new Set(['seeker','employer']);
    if(!allowedRoles.has(role)) throw new functions.https.HttpsError('invalid-argument', 'invalid role');
    clean.role = role;
  }
  if(patch.avatar !== undefined){
    const avatar = String(patch.avatar || '').trim();
    if(avatar && avatar.length > 400000) throw new functions.https.HttpsError('invalid-argument', 'avatar too large');
    clean.avatar = avatar || null;
  }

  if(!Object.keys(clean).length){
    return { ok:true, noop:true };
  }

  const ts = now();
  clean.updatedAt = ts;

  await rtdb.ref(`usersPublic/${uid}`).update(clean);

  const ak = rtdb.ref('auditLogs').push().key;
  await rtdb.ref(`auditLogs/${ak}`).set({ ts, type: 'profileUpdatePublic', by: uid, keys: Object.keys(clean) });

  return { ok:true };
});



// -------------------------
// Callable: dmConfirmAtomic
// -------------------------
exports.dmConfirmAtomic = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const me = context.auth.uid;
  // Anti-abuse: confirmation spam protection
  await simpleRateLimit(me, 'dmConfirmAtomic', 20, 60 * 1000);
  const peerUid = String((data && (data.peerUid || data.fromUid)) || '').trim();
  if(!peerUid || peerUid === me){
    throw new functions.https.HttpsError('invalid-argument', 'peerUid required');
  }

  const room = dmKey(me, peerUid);

  // Block-gate (either direction)
  try{
    const [b1, b2] = await Promise.all([
      rtdb.ref(`blocks/${me}/${peerUid}`).get(),
      rtdb.ref(`blocks/${peerUid}/${me}`).get()
    ]);
    if(b1.exists() || b2.exists()){
      return { ok:false, reason: 'blocked', room };
    }
  }catch(e){ /* ignore */ }

  const reqRef = rtdb.ref(`dmRequests/${me}/${peerUid}`);
  const reqSnap = await reqRef.get();
  const req = reqSnap.val();
  if(!req){
    return { ok: false, reason: 'no_request', room };
  }

  const ts = now();

  const upd = {};
  upd[`dmConfirmed/${room}`] = { a: me < peerUid ? me : peerUid, b: me < peerUid ? peerUid : me, ts, by: me };
  upd[`privateMembers/${room}/${me}`] = true;
  upd[`privateMembers/${room}/${peerUid}`] = true;
  upd[`privateRoomsByUser/${me}/${room}`] = true;
  upd[`privateRoomsByUser/${peerUid}/${room}`] = true;
  upd[`dmRequests/${me}/${peerUid}`] = null;

  // Move the first request message into the real privateMessages thread (server-owned).
  // This makes DM "по-взрослому": the first message exists only after accept.
  const firstText = String(req.previewText || req.text || '').trim().slice(0, 1200);
  if(firstText){
    const mid = rtdb.ref(`privateMessages/${room}`).push().key;
    upd[`privateMessages/${room}/${mid}`] = { by: peerUid, ts: Number(req.ts || ts), text: firstText };
  }

  // Seed inbox meta (so inbox is not empty)
  const preview = String(req.previewText || req.text || '').slice(0, 140);
  upd[`inboxMeta/${me}/${room}`] = {
    with: peerUid,
    lastTs: ts,
    lastBy: peerUid,
    lastText: preview,
    confirmed: true,
    unread: 0,
    lastReadTs: ts,
    pendingRequest: null,
    pendingText: null,
    pendingTs: null
  };
  upd[`inboxMeta/${peerUid}/${room}`] = {
    with: me,
    lastTs: ts,
    lastBy: peerUid,
    lastText: preview,
    confirmed: true,
    unread: 0,
    lastReadTs: ts,
    pendingRequest: null,
    pendingText: null,
    pendingTs: null
  };

  // Audit
  const auditKey = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${auditKey}`] = { ts, type: 'dmConfirmAtomic', by: me, room, peer: peerUid };

  await rtdb.ref().update(upd);

  return { ok: true, room };
});

// -------------------------
// Callable: dmSend (server-owned messages + inboxMeta)
// -------------------------
exports.dmSend = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
  const room = String((data && data.room) || '').trim();
  const text = String((data && data.text) || '').trim();
  const img = String((data && data.img) || '').trim();

  if(!room){
    throw new functions.https.HttpsError('invalid-argument', 'room required');
  }
  if(!text && !img){
    throw new functions.https.HttpsError('invalid-argument', 'text or img required');
  }
  if(text && text.length > 1200){
    throw new functions.https.HttpsError('invalid-argument', 'text too long');
  }
  if(img && (!img.startsWith('data:image/') || img.length > 400000)){
    throw new functions.https.HttpsError('invalid-argument', 'invalid img');
  }

  // Cheap anti-abuse.
  await simpleRateLimit(me, 'dmSend', 30, 60 * 1000);
  await assertNotBanned(me, 'dm');

  // Confirmed rooms are the default. Bot rooms are allowed ("bot_" prefix).
  const isBotRoom = room.startsWith('bot_') || room.includes('_bot_');
  if(!isBotRoom){
    const cs = await rtdb.ref(`dmConfirmed/${room}`).get();
    if(!cs.exists()){
      throw new functions.https.HttpsError('failed-precondition', 'not_confirmed');
    }
    // Must be a member.
    const ms = await rtdb.ref(`privateMembers/${room}/${me}`).get();
    if(!ms.exists() || ms.val() !== true){
      throw new functions.https.HttpsError('permission-denied', 'not_member');
    }
  }

  // Resolve peer uid.
  let peerUid = '';
  if(isBotRoom){
    const parts = room.split('_');
    peerUid = parts.find(p => p && p !== me) || '';
  }else{
    const c = (await rtdb.ref(`dmConfirmed/${room}`).get()).val() || {};
    peerUid = (c.a === me) ? c.b : c.a;
  }
  if(!peerUid){
    throw new functions.https.HttpsError('invalid-argument', 'peer resolution failed');
  }

  // Block-gate (either direction)
  if(!isBotRoom){
    const [b1, b2] = await Promise.all([
      rtdb.ref(`blocks/${me}/${peerUid}`).get(),
      rtdb.ref(`blocks/${peerUid}/${me}`).get()
    ]);
    if(b1.exists() || b2.exists()){
      throw new functions.https.HttpsError('failed-precondition', 'blocked');
    }
  }

  const ts = now();
  const mid = rtdb.ref(`privateMessages/${room}`).push().key;
  const msg = { by: me, ts, text: text || null, img: img || null };

  const preview = text ? text.slice(0,120) : (img ? '📷 Foto' : '');

  // Update inbox meta for both parties (server-owned).
  const peerIsBot = String(peerUid||'').startsWith('bot_');
  const peerMetaSnap = peerIsBot ? null : await rtdb.ref(`inboxMeta/${peerUid}/${room}/lastReadTs`).get().catch(()=>null);
  const peerLastReadTs = peerIsBot ? 0 : Number(peerMetaSnap && peerMetaSnap.val ? peerMetaSnap.val() : 0);
  const peerUnread = peerIsBot ? 0 : ((peerLastReadTs && ts <= peerLastReadTs) ? 0 : 1);

  const upd = {};
  upd[`privateMessages/${room}/${mid}`] = msg;

  // Heal/make explicit membership index (used by the client to detect confirmation without reading dmConfirmed).
  if(!isBotRoom){
    upd[`privateRoomsByUser/${me}/${room}`] = true;
    upd[`privateRoomsByUser/${peerUid}/${room}`] = true;
  }

  upd[`inboxMeta/${me}/${room}/with`] = peerUid;
  upd[`inboxMeta/${me}/${room}/lastTs`] = ts;
  upd[`inboxMeta/${me}/${room}/ts`] = ts;
  upd[`inboxMeta/${me}/${room}/lastBy`] = me;
  upd[`inboxMeta/${me}/${room}/lastText`] = preview;
  upd[`inboxMeta/${me}/${room}/confirmed`] = true;
  upd[`inboxMeta/${me}/${room}/unread`] = 0;
  upd[`inboxMeta/${me}/${room}/lastReadTs`] = ts;
  upd[`inboxMeta/${me}/${room}/pendingRequest`] = null;
  upd[`inboxMeta/${me}/${room}/pendingText`] = null;
  upd[`inboxMeta/${me}/${room}/pendingTs`] = null;

  if(!peerIsBot){
    upd[`inboxMeta/${peerUid}/${room}/with`] = me;
    upd[`inboxMeta/${peerUid}/${room}/lastTs`] = ts;
    upd[`inboxMeta/${peerUid}/${room}/ts`] = ts;
    upd[`inboxMeta/${peerUid}/${room}/lastBy`] = me;
    upd[`inboxMeta/${peerUid}/${room}/lastText`] = preview;
    upd[`inboxMeta/${peerUid}/${room}/confirmed`] = true;
    upd[`inboxMeta/${peerUid}/${room}/unread`] = peerUnread;
    upd[`inboxMeta/${peerUid}/${room}/pendingRequest`] = null;
    upd[`inboxMeta/${peerUid}/${room}/pendingText`] = null;
    upd[`inboxMeta/${peerUid}/${room}/pendingTs`] = null;
  }

  await rtdb.ref().update(upd);

  return { ok:true, room, mid, ts };
});

// Mark thread as read (server-owned inboxMeta, client-owned dmRead remains optional).
exports.dmMarkRead = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  // Called on thread open; keep generous but block abusive loops.
  await simpleRateLimit(uid, 'dmMarkRead', 180, 60 * 1000);
  const room = String((data && data.room) || '').trim();
  if(!room) throw new functions.https.HttpsError('invalid-argument', 'room required');
  const ts = now();

  // For human rooms, require membership.
  const isBotRoom = room.startsWith('bot_') || room.includes('_bot_');
  if(!isBotRoom){
    const ms = await rtdb.ref(`privateMembers/${room}/${uid}`).get();
    if(!ms.exists() || ms.val() !== true){
      throw new functions.https.HttpsError('permission-denied', 'not_member');
    }
  }

  const upd = {};
  upd[`inboxMeta/${uid}/${room}/lastReadTs`] = ts;
  upd[`inboxMeta/${uid}/${room}/unread`] = 0;
  await rtdb.ref().update(upd);
  return { ok:true, ts };
});

// -------------------------
// Callable: dmRequestSend / dmRequestDecline (server-first)
// -------------------------
// Security goal:
// - Client must NOT write to dmRequests directly (rules can lock it).
// - Server enforces dm_init daily limit and anti-spam invariants.
exports.dmRequestSend = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const me = context.auth.uid;
  // Anti-abuse: DM initiation spam protection
  await simpleRateLimit(me, 'dmRequestSend', 12, 60 * 1000);
  const toUid = String((data && data.toUid) || '').trim();
  const previewText = String((data && data.previewText) || '').trim().slice(0, 240);

  if(!toUid || toUid === me){
    throw new functions.https.HttpsError('invalid-argument', 'toUid required');
  }

  // Block-gate (either direction)
  try{
    const [b1, b2] = await Promise.all([
      rtdb.ref(`blocks/${me}/${toUid}`).get(),
      rtdb.ref(`blocks/${toUid}/${me}`).get()
    ]);
    if(b1.exists() || b2.exists()){
      return { ok: false, reason: 'blocked' };
    }
  }catch(e){ /* ignore */ }
  if(!previewText){
    throw new functions.https.HttpsError('invalid-argument', 'previewText required');
  }

  // Bots do not use DM-requests gating.
  if(toUid.startsWith('bot_')){
    return { ok: false, reason: 'bot' };
  }

  const room = dmKey(me, toUid);

  // If already confirmed, no request needed.
  try{
    const cs = await rtdb.ref(`dmConfirmed/${room}`).get();
    if(cs.exists()) return { ok: false, reason: 'already_confirmed', room };
  }catch(e){}

  // Prevent duplicates (either direction)
  const [outReq, inReq] = await Promise.all([
    rtdb.ref(`dmRequests/${toUid}/${me}`).get(),
    rtdb.ref(`dmRequests/${me}/${toUid}`).get(),
  ]);
  if(outReq.exists()) return { ok: false, reason: 'already_requested', room };
  if(inReq.exists()) return { ok: false, reason: 'has_incoming', room };

  // Plan + profile hints (single read)
  const mePub = (await rtdb.ref(`usersPublic/${me}`).get()).val() || {};
  const plan = effectivePlan(mePub.plan || 'free', mePub.premiumUntil || mePub.planUntil || 0);
  const limit = getLimit(plan, 'dm_init');

  if(limit < 9999){
    const dk = dayKey();
    const limRef = rtdb.ref(`users/${me}/limits/${dk}/dm_init`);
    const res = await limRef.transaction(cur => {
      cur = Number(cur || 0);
      if(cur + 1 > limit) return;
      return cur + 1;
    });
    if(!res.committed){
      return { ok: false, reason: 'limit', plan, limit, used: Number(res.snapshot.val() || 0) };
    }
  }

  const payload = {
    ts: now(),
    fromUid: me,
    previewText: previewText,
    fromNick: String(mePub.nick || '').slice(0, 60),
    fromAvatar: String(mePub.avatar || '').slice(0, 400000)
  };

  // Idempotent create
  const reqRef = rtdb.ref(`dmRequests/${toUid}/${me}`);
  const cre = await reqRef.transaction(cur => {
    if(cur) return;
    return payload;
  });
  if(!cre.committed){
    // Note: limit might have already been consumed in a rare race.
    return { ok: false, reason: 'already_requested', room };
  }

  // Server-owned inbox preview for the sender (so they can see their 1st message).
  // Receiver sees the request in dmRequests/{to}/{from}.
  const ts = now();
  const upd = {};
  upd[`inboxMeta/${me}/${room}/with`] = toUid;
  upd[`inboxMeta/${me}/${room}/ts`] = ts;
  upd[`inboxMeta/${me}/${room}/lastTs`] = ts;
  upd[`inboxMeta/${me}/${room}/lastBy`] = me;
  upd[`inboxMeta/${me}/${room}/lastText`] = '[Запрос] ' + previewText.slice(0, 120);
  upd[`inboxMeta/${me}/${room}/confirmed`] = false;
  upd[`inboxMeta/${me}/${room}/unread`] = 0;
  upd[`inboxMeta/${me}/${room}/lastReadTs`] = ts;
  upd[`inboxMeta/${me}/${room}/pendingRequest`] = true;
  upd[`inboxMeta/${me}/${room}/pendingText`] = previewText;
  upd[`inboxMeta/${me}/${room}/pendingTs`] = ts;
  await rtdb.ref().update(upd);

  await pushNotif(toUid, {
    type: 'dm_request',
    title: '✉️ Nová zpráva (žádost)',
    text: payload.fromNick ? `${payload.fromNick}: ${previewText.slice(0, 80)}` : previewText.slice(0, 80)
  });

  return { ok: true, room, plan, limit };
});

exports.dmRequestDecline = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
  await simpleRateLimit(me, 'dmRequestDecline', 30, 60 * 1000);
  const fromUid = String((data && data.fromUid) || '').trim();
  if(!fromUid){
    throw new functions.https.HttpsError('invalid-argument', 'fromUid required');
  }
  const room = dmKey(me, fromUid);
  const ts = now();

  const upd = {};
  upd[`dmRequests/${me}/${fromUid}`] = null;
  // Clear sender's pending state in inbox (so they see it was declined)
  upd[`inboxMeta/${fromUid}/${room}/with`] = me;
  upd[`inboxMeta/${fromUid}/${room}/lastTs`] = ts;
  upd[`inboxMeta/${fromUid}/${room}/lastBy`] = me;
  upd[`inboxMeta/${fromUid}/${room}/lastText`] = '[Отклонено] Запрос на переписку';
  upd[`inboxMeta/${fromUid}/${room}/confirmed`] = false;
  upd[`inboxMeta/${fromUid}/${room}/unread`] = 0;
  upd[`inboxMeta/${fromUid}/${room}/pendingRequest`] = null;
  upd[`inboxMeta/${fromUid}/${room}/pendingText`] = null;
  upd[`inboxMeta/${fromUid}/${room}/pendingTs`] = null;
  await rtdb.ref().update(upd);
  return { ok: true };
});

// -------------------------
// Callable: friends (server-first)
// -------------------------
exports.friendSend = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
  await simpleRateLimit(me, 'friendSend', 40, 60 * 1000);
  const toUid = String((data && data.toUid) || '').trim();
  if(!toUid || toUid === me){
    throw new functions.https.HttpsError('invalid-argument', 'toUid required');
  }

  // Block-gate (either direction)
  try{
    const [b1, b2] = await Promise.all([
      rtdb.ref(`blocks/${me}/${toUid}`).get(),
      rtdb.ref(`blocks/${toUid}/${me}`).get()
    ]);
    if(b1.exists() || b2.exists()){
      return { ok: false, reason: 'blocked' };
    }
  }catch(e){ /* ignore */ }

  // Duplicates/edge-cases first (do not waste limits)
  const [frSnap, outReqSnap, inReqSnap] = await Promise.all([
    rtdb.ref(`friends/${me}/${toUid}`).get(),
    rtdb.ref(`friendRequests/${toUid}/${me}`).get(),
    rtdb.ref(`friendRequests/${me}/${toUid}`).get()
  ]);
  if(String(frSnap.val()||'') === 'accepted') return { ok: false, reason: 'already_friends' };
  if(outReqSnap.exists()) return { ok: false, reason: 'already_requested' };
  if(inReqSnap.exists()) return { ok: false, reason: 'has_incoming' };

  // Plan + payload hints (single read)
  const mePub = (await rtdb.ref(`usersPublic/${me}`).get()).val() || {};
  const plan = effectivePlan(mePub.plan || 'free', mePub.premiumUntil || mePub.planUntil || 0);
  const limit = getLimit(plan, 'friend');

  // Consume limit atomically (friend)
  if(limit < 9999){
    const dk = dayKey();
    const limRef = rtdb.ref(`users/${me}/limits/${dk}/friend`);
    const res = await limRef.transaction(cur => {
      cur = Number(cur || 0);
      if(cur + 1 > limit) return;
      return cur + 1;
    });
    if(!res.committed){
      return { ok: false, reason: 'limit', plan, limit, used: Number(res.snapshot.val() || 0) };
    }
  }

  const payload = {
    ts: now(),
    from: me,
    // optional UI extras
    fromNick: String(mePub.nick || '').slice(0, 40),
    fromAvatar: String(mePub.avatar || '').slice(0, 400000)
  };

  // Idempotent create
  const reqRef = rtdb.ref(`friendRequests/${toUid}/${me}`);
  const cre = await reqRef.transaction(cur => {
    if(cur) return;
    return payload;
  });
  if(!cre.committed){
    return { ok: false, reason: 'already_requested' };
  }

  // Optional notif
  await pushNotif(toUid, {
    type: 'friend_request',
    title: '🤝 Nová žádost o přátelství',
    text: payload.fromNick ? `${payload.fromNick} ti poslal(a) žádost.` : 'Někdo ti poslal žádost.'
  });

  return { ok: true };
});

exports.friendAccept = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
  await simpleRateLimit(me, 'friendAccept', 60, 60 * 1000);
  const fromUid = String((data && data.fromUid) || '').trim();
  if(!fromUid || fromUid === me){
    throw new functions.https.HttpsError('invalid-argument', 'fromUid required');
  }

  // Block-gate (either direction)
  try{
    const [b1, b2] = await Promise.all([
      rtdb.ref(`blocks/${me}/${fromUid}`).get(),
      rtdb.ref(`blocks/${fromUid}/${me}`).get()
    ]);
    if(b1.exists() || b2.exists()){ return { ok:false, reason:'blocked' }; }
  }catch(e){ /* ignore */ }

  const reqSnap = await rtdb.ref(`friendRequests/${me}/${fromUid}`).get();
  if(!reqSnap.val()) return { ok: false, reason: 'no_request' };

  const upd = {};
  upd[`friendRequests/${me}/${fromUid}`] = null;
  upd[`friends/${me}/${fromUid}`] = 'accepted';
  upd[`friends/${fromUid}/${me}`] = 'accepted';

  await rtdb.ref().update(upd);

  await pushNotif(fromUid, {
    type: 'friend_accepted',
    title: '✅ Přátelství potvrzeno',
    text: 'Tvoje žádost byla přijata.'
  });

  return { ok: true };
});

exports.friendDecline = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
  await simpleRateLimit(me, 'friendDecline', 60, 60 * 1000);
  const fromUid = String((data && data.fromUid) || '').trim();
  if(!fromUid || fromUid === me){
    throw new functions.https.HttpsError('invalid-argument', 'fromUid required');
  }

  await rtdb.ref(`friendRequests/${me}/${fromUid}`).remove();
  return { ok: true };
});

exports.friendRemove = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
  await simpleRateLimit(me, 'friendRemove', 40, 60 * 1000);
  const uid = String((data && data.uid) || '').trim();
  if(!uid || uid === me){
    throw new functions.https.HttpsError('invalid-argument', 'uid required');
  }

  const upd = {};
  upd[`friends/${me}/${uid}`] = 'removed';
  upd[`friends/${uid}/${me}`] = 'removed';
  await rtdb.ref().update(upd);
  return { ok: true };
});

// -------------------------
// Callable: blocking (server-first)
// -------------------------
exports.blockUser = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
  await simpleRateLimit(me, 'blockUser', 40, 60 * 1000);
  const uid = String((data && data.uid) || '').trim();
  const reason = String((data && data.reason) || '').trim().slice(0, 120);
  if(!uid || uid === me){
    throw new functions.https.HttpsError('invalid-argument', 'uid required');
  }

  const ts = now();
  const room = dmKey(me, uid);

  const upd = {};
  upd[`blocks/${me}/${uid}`] = { ts, reason: reason || null };
  // Drop any pending requests between users
  upd[`friendRequests/${me}/${uid}`] = null;
  upd[`friendRequests/${uid}/${me}`] = null;
  upd[`friends/${me}/${uid}`] = 'blocked';
  upd[`friends/${uid}/${me}`] = 'blocked';
  upd[`dmRequests/${me}/${uid}`] = null;
  upd[`dmRequests/${uid}/${me}`] = null;

  // Clear my outgoing DM-request marker (if any) and mark the thread
  upd[`inboxMeta/${me}/${room}/with`] = uid;
  upd[`inboxMeta/${me}/${room}/lastTs`] = ts;
  upd[`inboxMeta/${me}/${room}/lastBy`] = me;
  upd[`inboxMeta/${me}/${room}/lastText`] = '[Блокировка]';
  upd[`inboxMeta/${me}/${room}/unread`] = 0;
  upd[`inboxMeta/${me}/${room}/pendingRequest`] = null;
  upd[`inboxMeta/${me}/${room}/pendingText`] = null;
  upd[`inboxMeta/${me}/${room}/pendingTs`] = null;
  upd[`inboxMeta/${me}/${room}/blocked`] = true;

  await rtdb.ref().update(upd);
  return { ok: true, room };
});

exports.unblockUser = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
  await simpleRateLimit(me, 'unblockUser', 60, 60 * 1000);
  const uid = String((data && data.uid) || '').trim();
  if(!uid || uid === me){
    throw new functions.https.HttpsError('invalid-argument', 'uid required');
  }

  const room = dmKey(me, uid);
  const upd = {};
  upd[`blocks/${me}/${uid}`] = null;
  // Keep friendship removed (do not auto-restore)
  upd[`friends/${me}/${uid}`] = 'removed';
  upd[`friends/${uid}/${me}`] = 'removed';
  upd[`inboxMeta/${me}/${room}/blocked`] = null;
  await rtdb.ref().update(upd);
  return { ok: true, room };
});

// -------------------------
// Callable: support / reports (server-first)
// -------------------------
exports.supportTicketCreate = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  await simpleRateLimit(uid, 'supportTicketCreate', 20, 60 * 1000);

  const text = String((data && data.text) || '').trim().slice(0, 2000);
  const img = String((data && data.img) || '').trim();
  const ua = String((data && data.ua) || '').trim().slice(0, 240);

  if(img && (!img.startsWith('data:image/') || img.length > 400000)){
    throw new functions.https.HttpsError('invalid-argument', 'invalid img');
  }
  if(!text && !img){
    throw new functions.https.HttpsError('invalid-argument', 'text or img required');
  }

  // Consume limit
  const up = (await rtdb.ref(`usersPublic/${uid}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  const limit = getLimit(plan, 'support_ticket');
  if(limit < 9999){
    const dk = dayKey();
    const limRef = rtdb.ref(`users/${uid}/limits/${dk}/support_ticket`);
    const res = await limRef.transaction(cur => {
      cur = Number(cur || 0);
      if(cur + 1 > limit) return;
      return cur + 1;
    });
    if(!res.committed){
      return { ok:false, reason:'limit', plan, limit, used: Number(res.snapshot.val() || 0) };
    }
  }

  const ts = now();
  const id = rtdb.ref('support/tickets').push().key;
  const ticket = {
    ts,
    by: uid,
    type: 'support',
    text: text || null,
    img: img || null,
    ua: ua || null
  };
  await rtdb.ref(`support/tickets/${id}`).set(ticket);
  return { ok:true, id };
});

exports.reportUser = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const by = context.auth.uid;
  await simpleRateLimit(by, 'reportUser', 20, 60 * 1000);
  const targetUid = String((data && data.targetUid) || '').trim();
  const reason = String((data && data.reason) || '').trim().slice(0, 120);
  const text = String((data && data.text) || '').trim().slice(0, 2000);
  const img1 = String((data && data.img1) || '').trim();
  const img2 = String((data && data.img2) || '').trim();

  if(!targetUid || targetUid === by){
    throw new functions.https.HttpsError('invalid-argument', 'targetUid required');
  }

  const okImg = (s)=> !s || (s.startsWith('data:image/') && s.length <= 400000);
  if(!okImg(img1) || !okImg(img2)){
    throw new functions.https.HttpsError('invalid-argument', 'invalid img');
  }
  if(!reason && !text && !img1 && !img2){
    throw new functions.https.HttpsError('invalid-argument', 'empty report');
  }

  // Consume limit
  const up = (await rtdb.ref(`usersPublic/${by}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  const limit = getLimit(plan, 'report');
  if(limit < 9999){
    const dk = dayKey();
    const limRef = rtdb.ref(`users/${by}/limits/${dk}/report`);
    const res = await limRef.transaction(cur => {
      cur = Number(cur || 0);
      if(cur + 1 > limit) return;
      return cur + 1;
    });
    if(!res.committed){
      return { ok:false, reason:'limit', plan, limit, used: Number(res.snapshot.val() || 0) };
    }
  }

  const [targetPub, byPub] = await Promise.all([
    rtdb.ref(`usersPublic/${targetUid}`).get(),
    rtdb.ref(`usersPublic/${by}`).get()
  ]);
  const tPub = targetPub.val() || {};
  const bPub = byPub.val() || {};

  const ts = now();
  const id = rtdb.ref('support/tickets').push().key;
  const ticket = {
    ts,
    by,
    type: 'user_report',
    targetUid,
    targetNick: String(tPub.nick || '').slice(0, 60) || null,
    reporterNick: String(bPub.nick || '').slice(0, 60) || null,
    reason: reason || null,
    text: text || null,
    img1: img1 || null,
    img2: img2 || null,
    status: 'open'
  };
  await rtdb.ref(`support/tickets/${id}`).set(ticket);
  return { ok:true, id };
});

// -------------------------
// Callable: payments (server-owned)
// -------------------------
exports.createPaymentRequest = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const plan = String((data && data.plan) || '').trim();
  const text = String((data && data.text) || '').trim().slice(0, 1200);
  const city = String((data && data.city) || '').trim().slice(0, 40);
  const fromNick = String((data && data.fromNick) || '').trim().slice(0, 60);
  const proofUrl = String((data && data.proofUrl) || '').trim().slice(0, 2048);
  const promo = (data && data.promo && typeof data.promo === 'object') ? data.promo : null;

  if(!plan || !['premium','premiumPlus','premiumplus','vip'].includes(plan)){
    throw new functions.https.HttpsError('invalid-argument', 'invalid plan');
  }

  await simpleRateLimit(uid, 'payments', 3, 60 * 60 * 1000);

  // Allow only one pending request per user.
  const pend = await rtdb.ref(`payments/requests/${uid}`).orderByChild('ts').limitToLast(25).get();
  const pv = pend.val() || {};
  if(Object.values(pv).some(r => r && r.status === 'pending')){
    return { ok:false, reason:'pending_exists' };
  }

  const ts = now();
  const id = rtdb.ref('payments/requestsIndex').push().key;

  const req = {
    type: 'plan_request',
    plan,
    by: uid,
    fromUid: uid,
    fromNick: fromNick || null,
    city: city || null,
    text: text || null,
    proofUrl: proofUrl || null,
    promo: promo ? {
      kind: String(promo.kind||'').slice(0,40),
      discountPct: Number(promo.discountPct||0)||null,
      offerCreatedAt: Number(promo.offerCreatedAt||0)||null,
      offerExpiresAt: Number(promo.offerExpiresAt||0)||null
    } : null,
    ts,
    status: 'pending'
  };
  const idx = {
    uid,
    by: uid,
    ts,
    plan,
    status: 'pending',
    city: city || null,
    fromNick: fromNick || null,
    proofUrl: proofUrl || null,
    promo: promo ? {
      kind: String(promo.kind||'').slice(0,40),
      discountPct: Number(promo.discountPct||0)||null,
      offerCreatedAt: Number(promo.offerCreatedAt||0)||null,
      offerExpiresAt: Number(promo.offerExpiresAt||0)||null
    } : null
  };

  const upd = {};
  upd[`payments/requests/${uid}/${id}`] = req;
  upd[`payments/requestsIndex/${id}`] = idx;
  await rtdb.ref().update(upd);
  return { ok:true, id };
});

exports.approvePayment = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const adminUid = context.auth.uid;
  await simpleRateLimit(adminUid, 'approvePayment', 120, 60 * 1000);
  const isAdmin = (await rtdb.ref(`roles/${adminUid}/admin`).get()).val() === true;
  if(!isAdmin){
    throw new functions.https.HttpsError('permission-denied', 'admin required');
  }

  const requestId = String((data && data.requestId) || '').trim();
  const decision = String((data && data.decision) || 'approved').trim();
  if(!requestId) throw new functions.https.HttpsError('invalid-argument', 'requestId required');
  if(!['approved','rejected'].includes(decision)) throw new functions.https.HttpsError('invalid-argument', 'invalid decision');

  const idxSnap = await rtdb.ref(`payments/requestsIndex/${requestId}`).get();
  const idx = idxSnap.val();
  if(!idx) throw new functions.https.HttpsError('not-found', 'request not found');
  const uid = String(idx.uid || '').trim();
  if(!uid) throw new functions.https.HttpsError('invalid-argument', 'bad request');

  const plan = String(idx.plan || '').trim();
  const ts = now();

  const upd = {};
  upd[`payments/requestsIndex/${requestId}/status`] = decision;
  upd[`payments/requestsIndex/${requestId}/decidedAt`] = ts;
  upd[`payments/requestsIndex/${requestId}/decidedBy`] = adminUid;
  upd[`payments/requests/${uid}/${requestId}/status`] = decision;
  upd[`payments/requests/${uid}/${requestId}/decidedAt`] = ts;
  upd[`payments/requests/${uid}/${requestId}/decidedBy`] = adminUid;

  if(decision === 'approved'){
    // Default: 30 days (you can change to real billing later).
    const days = (plan === 'vip') ? 30 : 30;
    const until = ts + days * 24 * 60 * 60 * 1000;
    upd[`usersPublic/${uid}/plan`] = plan;
    upd[`usersPublic/${uid}/premiumUntil`] = until;
    upd[`usersPublic/${uid}/premiumSince`] = ts;
    const nk = rtdb.ref(`notifications/${uid}`).push().key;
    upd[`notifications/${uid}/${nk}`] = { ts, type:'plan_approved', title:'✅ Premium aktivováno', text:`Balíček: ${plan}` };
  }else{
    const nk = rtdb.ref(`notifications/${uid}`).push().key;
    upd[`notifications/${uid}/${nk}`] = { ts, type:'plan_rejected', title:'❌ Platba zamítnuta', text:'Zkontroluj prosím údaje a zkus to znovu.' };
  }

  const ak = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${ak}`] = { ts, type:'approvePayment', by: adminUid, requestId, uid, decision };

  await rtdb.ref().update(upd);
  return { ok:true };
});

// -------------------------
// Callable: promo codes (server-owned)
// -------------------------
exports.redeemPromo = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const code = String((data && data.code) || '').trim().toLowerCase();
  if(!code || code.length > 40){
    throw new functions.https.HttpsError('invalid-argument', 'invalid code');
  }

  await simpleRateLimit(uid, 'redeemPromo', 5, 10 * 60 * 1000);

  // One-time per user per code.
  const usedRef = rtdb.ref(`promoRedemptions/${uid}/${code}`);
  const usedTx = await usedRef.transaction(cur => {
    if(cur) return;
    return { ts: now() };
  }, { applyLocally: false });
  if(!usedTx.committed){
    return { ok:false, reason:'already_redeemed' };
  }

  const ref = rtdb.ref(`promoCodes/${code}`);
  const tx = await ref.transaction(cur => {
    if(!cur) return;
    if(cur.isActive !== true) return;
    const exp = Number(cur.expiresAt || 0);
    if(exp && exp < now()) return;
    const maxUses = Number(cur.maxUses || 0);
    const usedCount = Number(cur.usedCount || 0);
    if(maxUses && usedCount >= maxUses) return;
    cur.usedCount = usedCount + 1;
    return cur;
  }, { applyLocally: false });

  if(!tx.committed){
    // rollback redemption marker best-effort
    try{ await usedRef.remove(); }catch(e){}
    return { ok:false, reason:'invalid_or_expired' };
  }

  const promo = tx.snapshot.val() || {};
  const plan = normPlan(promo.plan || 'premium');
  const days = Math.max(1, Math.min(365, Number(promo.days || 30)));
  const ts = now();
  const until = ts + days * 24 * 60 * 60 * 1000;

  const upd = {};
  upd[`usersPublic/${uid}/plan`] = plan;
  upd[`usersPublic/${uid}/premiumSince`] = ts;
  upd[`usersPublic/${uid}/premiumUntil`] = until;
  const nk = rtdb.ref(`notifications/${uid}`).push().key;
  upd[`notifications/${uid}/${nk}`] = { ts, type:'promo_redeem', title:'🎁 Promo aktivováno', text:`Plan: ${plan} · ${days} dní` };
  const ak = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${ak}`] = { ts, type:'redeemPromo', by: uid, code, plan, days };
  await rtdb.ref().update(upd);

  return { ok:true, plan, until, days };
});

// -------------------------
// Autoposting (server scheduler)
// -------------------------
const AUTOPOST_CITY_WHITELIST = new Set(['praha','brno','ostrava','plzen','liberec','olomouc','hradec','pardubice']);

function clamp(n, a, b){ n = Number(n||0); if(!Number.isFinite(n)) n = a; return Math.max(a, Math.min(b, n)); }

async function getUserPlan(uid){
  const up = (await rtdb.ref(`usersPublic/${uid}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  return { plan, up };
}

exports.createAutopostCampaign = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  await assertNotBanned(uid, 'autopost');
  await simpleRateLimit(uid, 'autopostCreate', 10, 60 * 60 * 1000);

  const city = String((data && data.city) || '').trim().toLowerCase();
  const text = String((data && data.text) || '').trim();
  const intervalMin = clamp((data && data.intervalMin), 15, 1440);
  const imageUrl = String((data && data.imageUrl) || '').trim();

  if(!AUTOPOST_CITY_WHITELIST.has(city)) throw new functions.https.HttpsError('invalid-argument', 'invalid city');
  if(!text || text.length > 1200) throw new functions.https.HttpsError('invalid-argument', 'invalid text');
  if(imageUrl && (!imageUrl.startsWith('data:image/') || imageUrl.length > 400000)) throw new functions.https.HttpsError('invalid-argument', 'invalid image');

  const { plan } = await getUserPlan(uid);
  const feats = getFeatures(plan);
  const slots = Number(feats.autopost?.slots || 0);
  const minInterval = Number(feats.autopost?.minIntervalMin || 120);
  const allowPhotos = !!feats.autopost?.photos;

  if(!slots || slots <= 0){
    return { ok:false, reason:'no_feature', plan };
  }
  if(intervalMin < minInterval){
    throw new functions.https.HttpsError('invalid-argument', 'interval too small');
  }
  if(imageUrl && !allowPhotos){
    throw new functions.https.HttpsError('failed-precondition', 'photos_not_allowed');
  }

  const campsSnap = await rtdb.ref(`autopostCampaigns/${uid}`).get();
  const camps = campsSnap.val() || {};
  const activeCount = Object.values(camps).filter(c => c && c.isActive).length;
  const totalCount = Object.keys(camps).length;
  if(totalCount >= slots){
    return { ok:false, reason:'slots', slots, total: totalCount };
  }

  const ts = now();
  const id = rtdb.ref(`autopostCampaigns/${uid}`).push().key;
  const nextPostTs = ts + intervalMin * 60 * 1000;
  const camp = {
    city, text, intervalMin,
    isActive: true,
    createdTs: ts,
    lastPostTs: 0,
    nextPostTs,
    imageUrl: imageUrl || null
  };

  const upd = {};
  upd[`autopostCampaigns/${uid}/${id}`] = camp;
  upd[`autopostActive/${uid}_${id}`] = { uid, campaignId: id, nextPostTs, intervalMin };
  const ak = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${ak}`] = { ts, type:'createAutopostCampaign', by: uid, id };
  await rtdb.ref().update(upd);
  return { ok:true, id, nextPostTs, activeCount: activeCount + 1, slots };
});

exports.updateAutopostCampaign = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  await assertNotBanned(uid, 'autopost');
  await simpleRateLimit(uid, 'autopostUpdate', 60, 60 * 60 * 1000);
  const campaignId = String((data && data.campaignId) || '').trim();
  if(!campaignId) throw new functions.https.HttpsError('invalid-argument', 'campaignId required');
  const patch = (data && data.patch) || {};

  const snap = await rtdb.ref(`autopostCampaigns/${uid}/${campaignId}`).get();
  const cur = snap.val();
  if(!cur) throw new functions.https.HttpsError('not-found', 'not found');

  const { plan } = await getUserPlan(uid);
  const feats = getFeatures(plan);
  const minInterval = Number(feats.autopost?.minIntervalMin || 120);
  const allowPhotos = !!feats.autopost?.photos;

  const city = (patch.city !== undefined) ? String(patch.city || '').trim().toLowerCase() : String(cur.city||'');
  const text = (patch.text !== undefined) ? String(patch.text || '').trim() : String(cur.text||'');
  const intervalMin = (patch.intervalMin !== undefined) ? clamp(patch.intervalMin, 15, 1440) : clamp(cur.intervalMin, 15, 1440);
  const imageUrl = (patch.imageUrl !== undefined) ? String(patch.imageUrl || '').trim() : String(cur.imageUrl||'');

  if(!AUTOPOST_CITY_WHITELIST.has(city)) throw new functions.https.HttpsError('invalid-argument', 'invalid city');
  if(!text || text.length > 1200) throw new functions.https.HttpsError('invalid-argument', 'invalid text');
  if(intervalMin < minInterval) throw new functions.https.HttpsError('invalid-argument', 'interval too small');
  if(imageUrl && (!imageUrl.startsWith('data:image/') || imageUrl.length > 400000)) throw new functions.https.HttpsError('invalid-argument', 'invalid image');
  if(imageUrl && !allowPhotos) throw new functions.https.HttpsError('failed-precondition', 'photos_not_allowed');

  const ts = now();
  const nextPostTs = cur.isActive ? (ts + intervalMin * 60 * 1000) : Number(cur.nextPostTs||0);

  const upd = {};
  upd[`autopostCampaigns/${uid}/${campaignId}/city`] = city;
  upd[`autopostCampaigns/${uid}/${campaignId}/text`] = text;
  upd[`autopostCampaigns/${uid}/${campaignId}/intervalMin`] = intervalMin;
  upd[`autopostCampaigns/${uid}/${campaignId}/imageUrl`] = imageUrl || null;
  upd[`autopostCampaigns/${uid}/${campaignId}/nextPostTs`] = nextPostTs;
  upd[`autopostActive/${uid}_${campaignId}`] = { uid, campaignId, nextPostTs, intervalMin };
  const ak = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${ak}`] = { ts, type:'updateAutopostCampaign', by: uid, id: campaignId };
  await rtdb.ref().update(upd);
  return { ok:true, nextPostTs };
});

exports.toggleAutopostCampaign = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  await assertNotBanned(uid, 'autopost');
  await simpleRateLimit(uid, 'autopostToggle', 120, 60 * 60 * 1000);
  const campaignId = String((data && data.campaignId) || '').trim();
  const isActive = !!(data && data.isActive);
  if(!campaignId) throw new functions.https.HttpsError('invalid-argument', 'campaignId required');

  const snap = await rtdb.ref(`autopostCampaigns/${uid}/${campaignId}`).get();
  const cur = snap.val();
  if(!cur) throw new functions.https.HttpsError('not-found', 'not found');

  const { plan } = await getUserPlan(uid);
  const feats = getFeatures(plan);
  const slots = Number(feats.autopost?.slots || 0);
  if(isActive && (!slots || slots<=0)) return { ok:false, reason:'no_feature', plan };

  if(isActive){
    const campsSnap = await rtdb.ref(`autopostCampaigns/${uid}`).get();
    const camps = campsSnap.val() || {};
    const total = Object.keys(camps).length;
    if(total > slots){
      return { ok:false, reason:'slots', slots, total };
    }
  }

  const ts = now();
  const intervalMin = clamp(cur.intervalMin, 15, 1440);
  const nextPostTs = isActive ? (ts + intervalMin * 60 * 1000) : 0;

  const upd = {};
  upd[`autopostCampaigns/${uid}/${campaignId}/isActive`] = isActive;
  upd[`autopostCampaigns/${uid}/${campaignId}/nextPostTs`] = nextPostTs;
  upd[`autopostActive/${uid}_${campaignId}`] = isActive ? { uid, campaignId, nextPostTs, intervalMin } : null;
  const ak = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${ak}`] = { ts, type:'toggleAutopostCampaign', by: uid, id: campaignId, isActive };
  await rtdb.ref().update(upd);
  return { ok:true, nextPostTs };
});

exports.deleteAutopostCampaign = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  await assertNotBanned(uid, 'autopost');
  await simpleRateLimit(uid, 'autopostDelete', 60, 60 * 60 * 1000);
  const campaignId = String((data && data.campaignId) || '').trim();
  if(!campaignId) throw new functions.https.HttpsError('invalid-argument', 'campaignId required');
  const ts = now();
  const upd = {};
  upd[`autopostCampaigns/${uid}/${campaignId}`] = null;
  upd[`autopostActive/${uid}_${campaignId}`] = null;
  const ak = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${ak}`] = { ts, type:'deleteAutopostCampaign', by: uid, id: campaignId };
  await rtdb.ref().update(upd);
  return { ok:true };
});


// -------------------------
// Aliases (front-end expects these names)
// -------------------------
exports.autopostCampaignCreate = exports.createAutopostCampaign;
exports.autopostCampaignUpdate = exports.updateAutopostCampaign;
exports.autopostCampaignToggle = exports.toggleAutopostCampaign;
exports.autopostCampaignRemove = exports.deleteAutopostCampaign;


// Runs on server even if users are offline.
// IMPORTANT: this requires Blaze plan + Cloud Scheduler enabled.
exports.autopostTick = functions.region('europe-west1').pubsub.schedule('every 5 minutes').onRun(async () => {
  const ts = now();
  // Query next jobs.
  const q = await rtdb.ref('autopostActive').orderByChild('nextPostTs').endAt(ts).limitToFirst(40).get();
  const jobs = q.val() || {};
  const updates = {};

  for(const key of Object.keys(jobs)){
    const j = jobs[key] || {};
    const uid = String(j.uid || '').trim();
    const id = String(j.campaignId || '').trim();
    if(!uid || !id) continue;

    let camp;
    try{ camp = (await rtdb.ref(`autopostCampaigns/${uid}/${id}`).get()).val(); }catch(e){ camp = null; }
    if(!camp || !camp.isActive){
      updates[`autopostActive/${key}`] = null;
      continue;
    }

    // Ban/mute gate
    try{ await assertNotBanned(uid, 'autopost'); }catch(e){
      // push nextPostTs forward to avoid hot loop
      const intervalMin = clamp(camp.intervalMin, 15, 1440);
      const nextPostTs = ts + intervalMin * 60 * 1000;
      updates[`autopostCampaigns/${uid}/${id}/nextPostTs`] = nextPostTs;
      updates[`autopostActive/${key}/nextPostTs`] = nextPostTs;
      continue;
    }

    const { plan } = await getUserPlan(uid);
    const limit = getLimit(plan, 'autopost_posts');
    if(limit <= 0){
      // feature removed; disable campaign
      updates[`autopostCampaigns/${uid}/${id}/isActive`] = false;
      updates[`autopostActive/${key}`] = null;
      continue;
    }

    // Consume daily autopost post limit.
    const dk = dayKey();
    const limRef = rtdb.ref(`users/${uid}/limits/${dk}/autopost_posts`);
    const limTx = await limRef.transaction(cur => {
      cur = Number(cur || 0);
      if(cur + 1 > limit) return;
      return cur + 1;
    }, { applyLocally: false });
    if(!limTx.committed){
      // stop for the day
      const nextPostTs = ts + 60 * 60 * 1000; // push ~1h
      updates[`autopostCampaigns/${uid}/${id}/nextPostTs`] = nextPostTs;
      updates[`autopostActive/${key}/nextPostTs`] = nextPostTs;
      continue;
    }

    const city = String(camp.city || '').toLowerCase();
    if(!AUTOPOST_CITY_WHITELIST.has(city)){
      updates[`autopostCampaigns/${uid}/${id}/isActive`] = false;
      updates[`autopostActive/${key}`] = null;
      continue;
    }

    const intervalMin = clamp(camp.intervalMin, 15, 1440);
    const intervalMs = intervalMin * 60 * 1000;
    const bucket = Math.floor(ts / intervalMs);
    const bucketTs = bucket * intervalMs;
    const msgKey = `ap_${uid}_${id}_${bucket}`;

    const msgRef = rtdb.ref(`messages/${city}/${msgKey}`);
    const msgObj = {
      ts: bucketTs,
      by: uid,
      text: String(camp.text || '').slice(0, 1200),
      meta: { kind:'autopost', campaignId: id, uid }
    };
    if(camp.imageUrl){ msgObj.img = String(camp.imageUrl || '').slice(0, 400000); }

    const postTx = await msgRef.transaction(cur => {
      if(cur) return;
      return msgObj;
    }, { applyLocally: false });
    if(!postTx.committed){
      // Already posted.
    }

    const nextPostTs = ts + intervalMs;
    updates[`autopostCampaigns/${uid}/${id}/lastPostTs`] = bucketTs;
    updates[`autopostCampaigns/${uid}/${id}/nextPostTs`] = nextPostTs;
    updates[`autopostActive/${key}/nextPostTs`] = nextPostTs;

    // Stats
    const st = rtdb.ref(`autopostStats/${uid}/${dk}`);
    await st.transaction(cur => {
      cur = cur || { count: 0 };
      const c = Number(cur.count || 0);
      cur.count = c + 1;
      cur.ts = ts;
      return cur;
    }, { applyLocally: false });
  }

  if(Object.keys(updates).length){
    await rtdb.ref().update(updates);
  }
  return null;
});

// -------------------------
// Triggers: chatCount + promo offer
// -------------------------
exports.onChatMessageCreate = functions.region('europe-west1').database.ref('/messages/{city}/{mid}').onCreate(async (snap, ctx) => {
  const m = snap.val() || {};
  const by = String(m.by || '').trim();
  if(!by) return null;

  // Ignore bots/system
  if(by.startsWith('bot_') || by === 'bot' || by === 'bot_premium') return null;

  // Increment chatCount (server owned)
  const cRef = rtdb.ref(`usersStats/${by}/chatCount`);
  const res = await cRef.transaction(cur => (Number(cur || 0) + 1));
  const newCount = Number(res.snapshot.val() || 0);

  // Create offer exactly at 25
  if(newCount !== 25) return null;

  const up = (await rtdb.ref(`usersPublic/${by}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  if(plan !== 'free') return null;

  const offerRef = rtdb.ref(`promoOffers/chat25/${by}`);
  const offerSnap = await offerRef.get();
  if(offerSnap.exists()) return null;

  const ts = now();
  const offer = {
    status: 'active',
    createdAt: ts,
    expiresAt: ts + 12 * 60 * 60 * 1000,
    discountPct: 50,
    notified6h: false,
    notified1h: false
  };

  await offerRef.set(offer);

  await pushNotif(by, {
    type: 'promo_chat25_start',
    title: '🔥 Sleva −50% po 25 zprávách',
    text: 'Odemkl(a) jsi speciální slevu na Premium/VIP. Platí 12 hodin.'
  });

  return null;
});

// Scheduled reminders (requires Blaze + Cloud Scheduler)
exports.promoChat25Tick = functions.region('europe-west1').pubsub.schedule('every 10 minutes').onRun(async () => {
  const root = (await rtdb.ref('promoOffers/chat25').get()).val() || {};
  const ts = now();

  const upd = {};

  for(const uid of Object.keys(root)){
    const o = root[uid] || {};
    if(String(o.status) !== 'active') continue;
    const exp = Number(o.expiresAt || 0);
    if(!exp) continue;

    const left = exp - ts;
    if(left <= 0){
      upd[`promoOffers/chat25/${uid}/status`] = 'expired';
      continue;
    }

    if(left <= 6*60*60*1000 && !o.notified6h){
      upd[`promoOffers/chat25/${uid}/notified6h`] = true;
      const k = rtdb.ref(`notifications/${uid}`).push().key;
      upd[`notifications/${uid}/${k}`] = {
        ts,
        type: 'promo_chat25_6h',
        title: '⏳ Осталось 6 часов',
        text: 'Скидка −50% на Premium/VIP скоро закончится.'
      };
    }

    if(left <= 60*60*1000 && !o.notified1h){
      upd[`promoOffers/chat25/${uid}/notified1h`] = true;
      const k = rtdb.ref(`notifications/${uid}`).push().key;
      upd[`notifications/${uid}/${k}`] = {
        ts,
        type: 'promo_chat25_1h',
        title: '⏳ Остался 1 час',
        text: 'Последний час: скидка −50% на Premium/VIP.'
      };
    }
  }

  if(Object.keys(upd).length){
    await rtdb.ref().update(upd);
  }

  return null;
});
