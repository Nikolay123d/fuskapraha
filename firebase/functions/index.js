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


// Autopost features per plan (slots + min interval + photos)
const PLAN_FEATURES = {
  free:        { autopostSlots: 0,  autopostMinIntervalMin: 120, autopostPhotos: false },
  premium:     { autopostSlots: 1,  autopostMinIntervalMin: 60,  autopostPhotos: true  },
  premiumplus: { autopostSlots: 3,  autopostMinIntervalMin: 30,  autopostPhotos: true  },
  vip:         { autopostSlots: 10, autopostMinIntervalMin: 15,  autopostPhotos: true  }
};

function getFeatures(plan){
  plan = normPlan(plan);
  return PLAN_FEATURES[plan] || PLAN_FEATURES.free;
}

// Autopost validation
const AUTOPOST_CITY_WHITELIST = new Set([
  'praha','brno','ostrava','plzen','olomouc','liberec','hradec','pardubice',
  'ceske_budejovice','usti','zlin','karlovy_vary','jihlava','teplice'
]);
const AUTOPOST_TEXT_MAX = 1200;
const AUTOPOST_IMG_MAX = 400000;
const AUTOPOST_INTERVAL_MIN = 15;
const AUTOPOST_INTERVAL_MAX = 1440;

function sanitizeText(s, maxLen){
  s = String(s || '').replace(/\r/g,'').trim();
  if(maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
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
// Callable: dmConfirmAtomic
// -------------------------
exports.dmConfirmAtomic = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const me = context.auth.uid;
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

  // Seed inbox meta (so inbox is not empty)
  const preview = String(req.previewText || req.text || '').slice(0, 140);
  upd[`inboxMeta/${me}/${room}`] = {
    with: peerUid,
    lastTs: ts,
    lastBy: peerUid,
    lastText: preview,
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

  return { ok: true, room, plan, limit };
});

exports.dmRequestDecline = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
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
  upd[`inboxMeta/${fromUid}/${room}/unread`] = 0;
  upd[`inboxMeta/${fromUid}/${room}/pendingRequest`] = null;
  upd[`inboxMeta/${fromUid}/${room}/pendingText`] = null;
  upd[`inboxMeta/${fromUid}/${room}/pendingTs`] = null;
  await rtdb.ref().update(upd);
  return { ok: true };
});



// -------------------------
// Callable: dmSend (server-first for user↔user)
// -------------------------
// Notes:
// - Bot rooms keep using direct RTDB writes (rules allow).
// - User-to-user DMs must be confirmed (dmConfirmed/{room} exists).
// - Server updates both inboxMeta sides and increments unread for the receiver.
exports.dmSend = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const me = context.auth.uid;
  const room = String((data && data.room) || '').trim();
  const text = sanitizeText((data && data.text) || '', 1200);
  const img = (data && data.img) ? String(data.img).slice(0, 400000) : '';

  if(!room){
    throw new functions.https.HttpsError('invalid-argument', 'room required');
  }
  if(!text && !img){
    throw new functions.https.HttpsError('invalid-argument', 'text/img required');
  }

  const parts = room.split('_');
  if(parts.length !== 2){
    throw new functions.https.HttpsError('invalid-argument', 'bad room');
  }
  const a = String(parts[0]||'');
  const b = String(parts[1]||'');
  if(me !== a && me !== b){
    throw new functions.https.HttpsError('permission-denied', 'not a participant');
  }
  const peerUid = (me === a) ? b : a;

  // Bot rooms are excluded (client uses direct write rules there)
  if(peerUid.startsWith('bot_') || a.startsWith('bot_') || b.startsWith('bot_')){
    return { ok:false, reason:'bot_room' };
  }

  const ts = now();

  // Global ban gates (best-effort)
  try{
    const ban = (await rtdb.ref(`bans/${me}`).get()).val();
    if(ban && Number(ban.until||0) > ts){
      return { ok:false, reason:'banned', until: Number(ban.until||0) };
    }
  }catch(e){}
  try{
    const dmBan = (await rtdb.ref(`dmBans/${me}`).get()).val();
    if(dmBan && Number(dmBan.until||0) > ts){
      return { ok:false, reason:'dm_banned', until: Number(dmBan.until||0) };
    }
  }catch(e){}

  // Block gate (either direction)
  try{
    const [b1, b2] = await Promise.all([
      rtdb.ref(`blocks/${me}/${peerUid}`).get(),
      rtdb.ref(`blocks/${peerUid}/${me}`).get()
    ]);
    if(b1.exists() || b2.exists()){
      return { ok:false, reason:'blocked' };
    }
  }catch(e){ /* ignore */ }

  // Must be confirmed (request accepted)
  const conf = await rtdb.ref(`dmConfirmed/${room}`).get();
  if(!conf.exists()){
    return { ok:false, reason:'not_confirmed' };
  }

  // Ensure membership + room index exist (idempotent)
  const upd0 = {};
  upd0[`privateMembers/${room}/${me}`] = true;
  upd0[`privateMembers/${room}/${peerUid}`] = true;
  upd0[`privateRoomsByUser/${me}/${room}`] = true;
  upd0[`privateRoomsByUser/${peerUid}/${room}`] = true;
  await rtdb.ref().update(upd0);

  // Create message
  const mid = rtdb.ref(`privateMessages/${room}`).push().key;
  const msg = { by: me, ts };
  if(text) msg.text = text;
  if(img) msg.img = img;

  const preview = (text || (img ? '[img]' : '')).slice(0, 140);

  const upd = {};
  upd[`privateMessages/${room}/${mid}`] = msg;

  // Sender meta
  upd[`inboxMeta/${me}/${room}/with`] = peerUid;
  upd[`inboxMeta/${me}/${room}/ts`] = ts;
  upd[`inboxMeta/${me}/${room}/lastTs`] = ts;
  upd[`inboxMeta/${me}/${room}/lastBy`] = me;
  upd[`inboxMeta/${me}/${room}/lastText`] = preview;
  upd[`inboxMeta/${me}/${room}/unread`] = 0;
  upd[`inboxMeta/${me}/${room}/lastReadTs`] = ts;
  upd[`inboxMeta/${me}/${room}/pendingRequest`] = null;
  upd[`inboxMeta/${me}/${room}/pendingText`] = null;
  upd[`inboxMeta/${me}/${room}/pendingTs`] = null;

  // Receiver meta (unread increment handled with a transaction after update)
  upd[`inboxMeta/${peerUid}/${room}/with`] = me;
  upd[`inboxMeta/${peerUid}/${room}/ts`] = ts;
  upd[`inboxMeta/${peerUid}/${room}/lastTs`] = ts;
  upd[`inboxMeta/${peerUid}/${room}/lastBy`] = me;
  upd[`inboxMeta/${peerUid}/${room}/lastText`] = preview;
  // Do NOT set unread here (race with client); we'll increment after update.

  await rtdb.ref().update(upd);

  // Bump unread for the receiver (best-effort)
  try{
    await rtdb.ref(`inboxMeta/${peerUid}/${room}/unread`).transaction(cur=>{
      cur = Number(cur || 0);
      if(!Number.isFinite(cur) || cur < 0) cur = 0;
      return Math.min(999, cur + 1);
    });
  }catch(e){}

  // Minimal stats
  try{ await rtdb.ref(`usersStats/${me}/dmCount`).transaction(cur => (Number(cur||0)+1)); }catch(e){}

  return { ok:true, room, mid, ts };
});


// -------------------------
// Autoposting (server scheduler, no browser timers)
// -------------------------
async function getUserPlanAndFeatures(uid){
  const up = (await rtdb.ref(`usersPublic/${uid}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  const feat = getFeatures(plan);
  return { plan, feat, up };
}

function _nextDayTs(ts){
  const d = new Date(Number(ts||0) || Date.now());
  d.setUTCHours(0,0,0,0);
  d.setUTCDate(d.getUTCDate()+1);
  return d.getTime();
}

async function consumeDailyInternal(uid, plan, action, amount){
  amount = Number(amount||0);
  if(amount <= 0) return { ok:true, plan, action, limit: 999999, used: 0, remaining: 999999 };

  const limit = getLimit(plan, action);
  if(limit >= 9999){
    return { ok:true, plan, action, limit, used: 0, remaining: 999999 };
  }

  const dk = dayKey();
  const ref = rtdb.ref(`users/${uid}/limits/${dk}/${action}`);
  const res = await ref.transaction(cur=>{
    cur = Number(cur || 0);
    if(cur + amount > limit) return;
    return cur + amount;
  });
  const used = Number(res.snapshot.val() || 0);
  if(!res.committed){
    return { ok:false, plan, action, limit, used, remaining: Math.max(0, limit - used) };
  }
  return { ok:true, plan, action, limit, used, remaining: Math.max(0, limit - used) };
}

function _validateAutopostCity(city){
  const c = String(city||'').trim().toLowerCase();
  if(!c) return '';
  if(!AUTOPOST_CITY_WHITELIST.has(c)) return '';
  return c;
}

// createAutopostCampaign({city,text,intervalMin,imageUrl?})
exports.createAutopostCampaign = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;

  const city = _validateAutopostCity((data && data.city) || '');
  const text = sanitizeText((data && data.text) || '', AUTOPOST_TEXT_MAX);
  const intervalMin = Math.floor(Number((data && data.intervalMin) || 0));
  const imageUrl = (data && data.imageUrl) ? String(data.imageUrl).slice(0, AUTOPOST_IMG_MAX) : '';

  if(!city){
    return { ok:false, reason:'bad_city' };
  }
  if(!text){
    return { ok:false, reason:'bad_text' };
  }

  const { plan, feat } = await getUserPlanAndFeatures(uid);
  const slots = Number(feat.autopostSlots || 0);
  const minI = Math.max(AUTOPOST_INTERVAL_MIN, Number(feat.autopostMinIntervalMin || AUTOPOST_INTERVAL_MIN));

  if(!slots){
    return { ok:false, reason:'no_feature', plan };
  }
  if(!Number.isFinite(intervalMin) || intervalMin < minI || intervalMin > AUTOPOST_INTERVAL_MAX){
    return { ok:false, reason:'bad_interval', plan, minIntervalMin: minI };
  }
  if(imageUrl && !feat.autopostPhotos){
    return { ok:false, reason:'photos_not_allowed', plan };
  }

  // Slot limit = total campaigns (server truth)
  const camps = (await rtdb.ref(`autopostCampaigns/${uid}`).get()).val() || {};
  const used = Object.keys(camps).length;
  if(used >= slots){
    return { ok:false, reason:'slots', plan, slots, used };
  }

  const ts = now();
  const campaignId = rtdb.ref(`autopostCampaigns/${uid}`).push().key;
  const intervalMs = intervalMin * 60 * 1000;
  const nextPostTs = ts + intervalMs;

  const userCampaign = {
    city,
    text,
    intervalMin,
    isActive: true,
    createdTs: ts,
    lastPostTs: 0,
    nextPostTs
  };
  if(imageUrl) userCampaign.imageUrl = imageUrl;

  const activeCampaign = Object.assign({ uid }, userCampaign);

  const upd = {};
  upd[`autopostCampaigns/${uid}/${campaignId}`] = userCampaign;
  upd[`autopostActive/${campaignId}`] = activeCampaign;

  // Audit
  const auditKey = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${auditKey}`] = { ts, type: 'autopost_create', by: uid, campaignId, city, intervalMin };

  await rtdb.ref().update(upd);

  return { ok:true, campaignId, nextPostTs, plan };
});

// updateAutopostCampaign({campaignId, city?, text?, intervalMin?, imageUrl?})
exports.updateAutopostCampaign = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const campaignId = String((data && data.campaignId) || '').trim();
  if(!campaignId){
    throw new functions.https.HttpsError('invalid-argument', 'campaignId required');
  }

  const snap = await rtdb.ref(`autopostCampaigns/${uid}/${campaignId}`).get();
  if(!snap.exists()){
    return { ok:false, reason:'not_found' };
  }
  const cur = snap.val() || {};

  const { plan, feat } = await getUserPlanAndFeatures(uid);
  const minI = Math.max(AUTOPOST_INTERVAL_MIN, Number(feat.autopostMinIntervalMin || AUTOPOST_INTERVAL_MIN));

  const next = {};

  if(data && Object.prototype.hasOwnProperty.call(data,'city')){
    const c = _validateAutopostCity(data.city);
    if(!c) return { ok:false, reason:'bad_city' };
    next.city = c;
  }
  if(data && Object.prototype.hasOwnProperty.call(data,'text')){
    const t = sanitizeText(data.text, AUTOPOST_TEXT_MAX);
    if(!t) return { ok:false, reason:'bad_text' };
    next.text = t;
  }
  if(data && Object.prototype.hasOwnProperty.call(data,'intervalMin')){
    const i = Math.floor(Number(data.intervalMin||0));
    if(!Number.isFinite(i) || i < minI || i > AUTOPOST_INTERVAL_MAX){
      return { ok:false, reason:'bad_interval', minIntervalMin: minI };
    }
    next.intervalMin = i;
  }
  if(data && Object.prototype.hasOwnProperty.call(data,'imageUrl')){
    const img = data.imageUrl ? String(data.imageUrl).slice(0, AUTOPOST_IMG_MAX) : '';
    if(img && !feat.autopostPhotos){
      return { ok:false, reason:'photos_not_allowed', plan };
    }
    if(img) next.imageUrl = img;
    else next.imageUrl = null; // remove
  }

  // Recompute nextPostTs if interval changed OR if campaign is active and nextPostTs is in the past
  let nextPostTs = Number(cur.nextPostTs||0) || 0;
  const intervalMin = Number(next.intervalMin || cur.intervalMin || 0);
  if(next.intervalMin || (!nextPostTs) || nextPostTs < now()){
    if(intervalMin > 0){
      nextPostTs = now() + intervalMin * 60 * 1000;
      next.nextPostTs = nextPostTs;
    }
  }

  const upd = {};
  // Apply patch to user copy
  for(const [k,v] of Object.entries(next)){
    if(v === null){
      upd[`autopostCampaigns/${uid}/${campaignId}/${k}`] = null;
    }else{
      upd[`autopostCampaigns/${uid}/${campaignId}/${k}`] = v;
    }
  }

  const isActive = (typeof next.isActive === 'boolean') ? next.isActive : !!cur.isActive;
  // Update active index if the campaign is active
  if(isActive){
    upd[`autopostActive/${campaignId}/uid`] = uid;
    for(const [k,v] of Object.entries(next)){
      if(v === null){
        upd[`autopostActive/${campaignId}/${k}`] = null;
      }else{
        upd[`autopostActive/${campaignId}/${k}`] = v;
      }
    }
    // Ensure required fields are present
    if(nextPostTs){
      upd[`autopostActive/${campaignId}/nextPostTs`] = nextPostTs;
    }
  }

  // Audit
  const ts = now();
  const auditKey = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${auditKey}`] = { ts, type: 'autopost_update', by: uid, campaignId };

  await rtdb.ref().update(upd);
  return { ok:true, campaignId, nextPostTs, plan };
});

// toggleAutopostCampaign({campaignId, isActive})
exports.toggleAutopostCampaign = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const campaignId = String((data && data.campaignId) || '').trim();
  const isActive = !!(data && data.isActive);
  if(!campaignId){
    throw new functions.https.HttpsError('invalid-argument', 'campaignId required');
  }

  const snap = await rtdb.ref(`autopostCampaigns/${uid}/${campaignId}`).get();
  if(!snap.exists()){
    return { ok:false, reason:'not_found' };
  }
  const cur = snap.val() || {};

  const { plan, feat } = await getUserPlanAndFeatures(uid);
  const slots = Number(feat.autopostSlots || 0);
  const minI = Math.max(AUTOPOST_INTERVAL_MIN, Number(feat.autopostMinIntervalMin || AUTOPOST_INTERVAL_MIN));

  if(isActive){
    if(!slots) return { ok:false, reason:'no_feature', plan };
    // Validate interval still fits the plan
    const intervalMin = Number(cur.intervalMin||0);
    if(!Number.isFinite(intervalMin) || intervalMin < minI){
      return { ok:false, reason:'bad_interval', minIntervalMin: minI };
    }
  }

  const ts = now();
  const upd = {};
  upd[`autopostCampaigns/${uid}/${campaignId}/isActive`] = isActive;

  if(isActive){
    const intervalMin = Number(cur.intervalMin||0);
    const nextPostTs = ts + intervalMin * 60 * 1000;
    upd[`autopostCampaigns/${uid}/${campaignId}/nextPostTs`] = nextPostTs;

    // Ensure the active index exists
    upd[`autopostActive/${campaignId}/uid`] = uid;
    upd[`autopostActive/${campaignId}/city`] = String(cur.city||'').trim().toLowerCase();
    upd[`autopostActive/${campaignId}/text`] = String(cur.text||'').slice(0, AUTOPOST_TEXT_MAX);
    upd[`autopostActive/${campaignId}/intervalMin`] = intervalMin;
    upd[`autopostActive/${campaignId}/isActive`] = true;
    upd[`autopostActive/${campaignId}/createdTs`] = Number(cur.createdTs||ts) || ts;
    upd[`autopostActive/${campaignId}/lastPostTs`] = Number(cur.lastPostTs||0) || 0;
    upd[`autopostActive/${campaignId}/nextPostTs`] = nextPostTs;
    if(cur.imageUrl) upd[`autopostActive/${campaignId}/imageUrl`] = String(cur.imageUrl).slice(0, AUTOPOST_IMG_MAX);
    else upd[`autopostActive/${campaignId}/imageUrl`] = null;
  }else{
    // Remove from active index
    upd[`autopostActive/${campaignId}`] = null;
  }

  // Audit
  const auditKey = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${auditKey}`] = { ts, type: 'autopost_toggle', by: uid, campaignId, isActive };

  await rtdb.ref().update(upd);
  return { ok:true, campaignId, isActive };
});

// deleteAutopostCampaign({campaignId})
exports.deleteAutopostCampaign = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const campaignId = String((data && data.campaignId) || '').trim();
  if(!campaignId){
    throw new functions.https.HttpsError('invalid-argument', 'campaignId required');
  }

  const snap = await rtdb.ref(`autopostCampaigns/${uid}/${campaignId}`).get();
  if(!snap.exists()){
    return { ok:false, reason:'not_found' };
  }

  const ts = now();
  const upd = {};
  upd[`autopostCampaigns/${uid}/${campaignId}`] = null;
  upd[`autopostActive/${campaignId}`] = null;

  const auditKey = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${auditKey}`] = { ts, type: 'autopost_delete', by: uid, campaignId };

  await rtdb.ref().update(upd);
  return { ok:true, campaignId };
});



// autopostReindexMyCampaigns() — one-time migration helper
// Ensures active campaigns appear in autopostActive global index (needed for server tick).
exports.autopostReindexMyCampaigns = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const ts = now();

  const snap = await rtdb.ref(`autopostCampaigns/${uid}`).get();
  const camps = snap.val() || {};

  const upd = {};
  let reindexed = 0;
  let cleaned = 0;

  for(const [campaignId, cRaw] of Object.entries(camps)){
    const c = cRaw || {};
    const isActive = !!c.isActive;
    if(!isActive){
      // ensure it's not in active index
      upd[`autopostActive/${campaignId}`] = null;
      cleaned++;
      continue;
    }

    const city = _validateAutopostCity(c.city || '');
    const text = sanitizeText(c.text || '', AUTOPOST_TEXT_MAX);
    const intervalMin = Number(c.intervalMin || 0);
    if(!city || !text || !intervalMin){
      upd[`autopostActive/${campaignId}`] = null;
      cleaned++;
      continue;
    }

    const intervalMs = intervalMin * 60 * 1000;
    let nextPostTs = Number(c.nextPostTs || 0);
    if(!nextPostTs || nextPostTs < ts){
      nextPostTs = ts + intervalMs;
      upd[`autopostCampaigns/${uid}/${campaignId}/nextPostTs`] = nextPostTs;
    }

    const userCampaign = {
      city,
      text,
      intervalMin,
      isActive: true,
      createdTs: Number(c.createdTs||ts) || ts,
      lastPostTs: Number(c.lastPostTs||0) || 0,
      nextPostTs
    };
    if(c.imageUrl) userCampaign.imageUrl = String(c.imageUrl).slice(0, AUTOPOST_IMG_MAX);

    const activeCampaign = Object.assign({ uid }, userCampaign);
    upd[`autopostActive/${campaignId}`] = activeCampaign;
    reindexed++;
  }

  if(Object.keys(upd).length){
    await rtdb.ref().update(upd);
  }

  return { ok:true, reindexed, cleaned };
});

// Scheduler tick: checks due campaigns and posts to chat
exports.autopostTick = functions.region('europe-west1').pubsub.schedule('every 2 minutes').onRun(async () => {
  const ts = now();

  // Query due active campaigns (global index)
  let snap = null;
  try{
    snap = await rtdb.ref('autopostActive').orderByChild('nextPostTs').endAt(ts).limitToFirst(50).get();
  }catch(e){
    try{ snap = await rtdb.ref('autopostActive').orderByChild('nextPostTs').endAt(ts).limitToFirst(50).once('value'); }catch(_){ snap=null; }
  }

  const due = snap && typeof snap.val === 'function' ? (snap.val() || {}) : {};
  const ids = Object.keys(due || {});
  if(!ids.length) return null;

  for(const campaignId of ids){
    const c = due[campaignId] || {};
    const uid = String(c.uid || '').trim();
    const city = String(c.city || '').trim().toLowerCase();
    const text = sanitizeText(c.text || '', AUTOPOST_TEXT_MAX);
    const intervalMin = Number(c.intervalMin || 0);
    const nextPostTs = Number(c.nextPostTs || 0);
    const img = c.imageUrl ? String(c.imageUrl).slice(0, AUTOPOST_IMG_MAX) : '';

    if(!uid || !city || !text || !intervalMin || !nextPostTs){
      // Broken record: remove from active index
      try{ await rtdb.ref(`autopostActive/${campaignId}`).remove(); }catch(e){}
      continue;
    }

    // Idempotency job (campaignId + time bucket)
    const intervalMs = intervalMin * 60 * 1000;
    const bucket = intervalMs > 0 ? Math.floor(nextPostTs / intervalMs) : Math.floor(nextPostTs / (60*1000));
    const jobRef = rtdb.ref(`autopostJobs/${campaignId}/${bucket}`);
    const job = await jobRef.transaction(cur=>{
      if(cur) return;
      return { ts, bucket };
    });
    if(!job.committed){
      continue; // already processed
    }

    // Validate city still ok
    if(!_validateAutopostCity(city)){
      // Disable campaign
      const upd = {};
      upd[`autopostActive/${campaignId}`] = null;
      upd[`autopostCampaigns/${uid}/${campaignId}/isActive`] = false;
      await rtdb.ref().update(upd);
      continue;
    }

    // Ban / mute gates (best-effort)
    try{
      const ban = (await rtdb.ref(`bans/${uid}`).get()).val();
      if(ban && Number(ban.until||0) > ts){
        // postpone 1h
        const postpone = ts + 60*60*1000;
        const upd = {};
        upd[`autopostActive/${campaignId}/nextPostTs`] = postpone;
        upd[`autopostCampaigns/${uid}/${campaignId}/nextPostTs`] = postpone;
        await rtdb.ref().update(upd);
        continue;
      }
    }catch(e){}
    try{
      const mute = (await rtdb.ref(`mutes/${uid}`).get()).val();
      if(mute && Number(mute.until||0) > ts){
        const postpone = Number(mute.until||0) + 5*60*1000;
        const upd = {};
        upd[`autopostActive/${campaignId}/nextPostTs`] = postpone;
        upd[`autopostCampaigns/${uid}/${campaignId}/nextPostTs`] = postpone;
        await rtdb.ref().update(upd);
        continue;
      }
    }catch(e){}

    // Plan / feature gate
    const { plan, feat } = await getUserPlanAndFeatures(uid);
    if(!feat.autopostSlots || getLimit(plan, 'autopost_posts') <= 0){
      // Plan expired or no feature -> disable campaign
      const upd = {};
      upd[`autopostActive/${campaignId}`] = null;
      upd[`autopostCampaigns/${uid}/${campaignId}/isActive`] = false;
      await rtdb.ref().update(upd);
      continue;
    }

    // Consume daily limit
    const lim = await consumeDailyInternal(uid, plan, 'autopost_posts', 1);
    if(!lim.ok){
      const nextDay = _nextDayTs(ts) + 5*60*1000;
      const upd = {};
      upd[`autopostActive/${campaignId}/nextPostTs`] = nextDay;
      upd[`autopostCampaigns/${uid}/${campaignId}/nextPostTs`] = nextDay;
      await rtdb.ref().update(upd);
      continue;
    }

    // Post message (deterministic id)
    // IMPORTANT: message timestamp = actual post time (so it appears at the bottom of the chat).
    const postTs = ts;
    const msgId = `ap_${campaignId}_${bucket}`;
    const msg = { by: uid, ts: postTs, text };
    if(img) msg.img = img;

    const nextTs = postTs + intervalMs;

    const upd = {};
    upd[`messages/${city}/${msgId}`] = msg;
    upd[`autopostActive/${campaignId}/lastPostTs`] = postTs;
    upd[`autopostActive/${campaignId}/nextPostTs`] = nextTs;
    upd[`autopostCampaigns/${uid}/${campaignId}/lastPostTs`] = postTs;
    upd[`autopostCampaigns/${uid}/${campaignId}/nextPostTs`] = nextTs;

    // Stats (best-effort)
    const dk = dayKey(ts);
    upd[`autopostStats/${uid}/${dk}/autopostPostsLastTs`] = ts;
    // We increment separately via transaction (RTDB has no atomic increment in multi-update)

    await rtdb.ref().update(upd);

    try{
      await rtdb.ref(`autopostStats/${uid}/${dk}/autopostPosts`).transaction(cur => (Number(cur||0)+1));
    }catch(e){}

    // Minimal audit (optional; keep small)
    try{
      const ak = rtdb.ref('auditLogs').push().key;
      const a = { ts, type: 'autopost_post', by: uid, campaignId, city };
      await rtdb.ref(`auditLogs/${ak}`).set(a);
    }catch(e){}
  }

  return null;
});

// -------------------------
// Callable: friends (server-first)
// -------------------------
exports.friendSend = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const me = context.auth.uid;
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
