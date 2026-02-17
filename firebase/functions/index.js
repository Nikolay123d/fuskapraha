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
  free:       { friend: 10,  dm_init: 10,  autopost_posts: 0 },
  premium:    { friend: 30,  dm_init: 100, autopost_posts: 15 },
  premiumplus:{ friend: 60,  dm_init: 300, autopost_posts: 30 },
  vip:        { friend: 9999, dm_init: 9999, autopost_posts: 9999 }
};

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
  const allowed = new Set(['friend','dm_init','autopost_posts']);
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
    lastReadTs: ts
  };
  upd[`inboxMeta/${peerUid}/${room}`] = {
    with: me,
    lastTs: ts,
    lastBy: peerUid,
    lastText: preview,
    unread: 0,
    lastReadTs: ts
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
  await rtdb.ref(`dmRequests/${me}/${fromUid}`).remove();
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
  const toUid = String((data && data.toUid) || '').trim();
  if(!toUid || toUid === me){
    throw new functions.https.HttpsError('invalid-argument', 'toUid required');
  }

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
