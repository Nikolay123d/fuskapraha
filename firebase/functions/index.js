const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize once
try {
  admin.initializeApp();
} catch (e) {
  // ignore if already initialized
}

const db = admin.database();

// ===== Helpers =====

function requireAuth(context){
  if(!context || !context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated','Auth required');
  }
  return context.auth.uid;
}

function roomId(a,b){
  const A = String(a||'');
  const B = String(b||'');
  return (A < B) ? (A+'_'+B) : (B+'_'+A);
}

function normPlan(p){
  p = String(p||'free').trim().toLowerCase();
  if(!p) p='free';
  if(p==='premium+') p='premiumplus';
  if(p==='premium_plus') p='premiumplus';
  return p;
}

function effectivePlan(plan, until){
  const p = normPlan(plan);
  const u = Number(until||0) || 0;
  if(u && u > 0 && u < Date.now()) return 'free';
  return p;
}

function utcDayKey(ts = Date.now()){
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const dd = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

const PLAN_LIMITS = {
  free:        { friend: 30,  dm_init: 2,   autopost_posts: 0 },
  premium:     { friend: 100, dm_init: 30,  autopost_posts: 8 },
  premiumplus: { friend: 200, dm_init: 100, autopost_posts: 24 },
  vip:         { friend: 1000, dm_init: 300, autopost_posts: 96 },
  bot:         { friend: 1e12, dm_init: 1e12, autopost_posts: 1e12 }
};

function limitFor(plan, action){
  const p = normPlan(plan);
  const a = String(action||'').trim().toLowerCase();
  const byPlan = PLAN_LIMITS[p] || PLAN_LIMITS.free;
  const v = byPlan[a];
  return (typeof v === 'number') ? v : 1e12;
}

async function getMyPlan(uid){
  const snap = await db.ref(`usersPublic/${uid}`).once('value');
  const v = snap.val() || {};
  const plan = v.plan || 'free';
  const until = v.planUntil || v.premiumUntil || 0;
  return { plan: normPlan(plan), until: Number(until||0) || 0, eff: effectivePlan(plan, until) };
}

async function consumeLimitInternal(uid, action, delta=1){
  action = String(action||'').trim().toLowerCase();
  delta = Number(delta||1);
  if(!Number.isFinite(delta) || delta<=0) delta = 1;
  delta = Math.floor(delta);
  if(delta<=0) delta = 1;

  const planInfo = await getMyPlan(uid);
  const planEff = planInfo.eff;
  const limit = limitFor(planEff, action);
  if(limit >= 1e11){
    return { ok:true, plan: planEff, limit, count:0, remaining: 1e12 };
  }

  const dk = utcDayKey();
  const ref = db.ref(`users/${uid}/limits/${dk}/${action}`);
  const tr = await ref.transaction((cur)=>{
    cur = Number(cur||0);
    if(!Number.isFinite(cur) || cur<0) cur=0;
    if(cur + delta > limit) return; // abort
    return cur + delta;
  });
  const count = Number(tr.snapshot.val()||0) || 0;
  return {
    ok: !!tr.committed,
    plan: planEff,
    limit,
    count,
    remaining: Math.max(0, limit - count)
  };
}

// ===== Public callable functions =====

exports.consumeLimit = functions.https.onCall(async (data, context)=>{
  const uid = requireAuth(context);
  const action = String(data?.action || '').trim().toLowerCase();
  const delta = Number(data?.delta || 1);
  if(!action){
    throw new functions.https.HttpsError('invalid-argument','action required');
  }
  const res = await consumeLimitInternal(uid, action, delta);
  if(!res.ok){
    throw new functions.https.HttpsError('resource-exhausted', `Limit reached for ${action}`);
  }
  return res;
});

exports.dmConfirmAtomic = functions.https.onCall(async (data, context)=>{
  const uid = requireAuth(context);
  const peerUid = String(data?.peerUid || data?.fromUid || '').trim();
  if(!peerUid){
    throw new functions.https.HttpsError('invalid-argument','peerUid required');
  }
  if(peerUid === uid){
    throw new functions.https.HttpsError('invalid-argument','Cannot DM yourself');
  }

  const room = roomId(uid, peerUid);
  const reqRef = db.ref(`dmRequests/${uid}/${peerUid}`);
  const reqSnap = await reqRef.once('value');
  if(!reqSnap.exists()){
    throw new functions.https.HttpsError('failed-precondition','No incoming DM request');
  }
  const req = reqSnap.val() || {};

  const now = Date.now();

  const updates = {};
  updates[`dmConfirmed/${room}`] = { a: uid, b: peerUid, ts: now, by: uid };
  updates[`privateMembers/${room}/${uid}`] = true;
  updates[`privateMembers/${room}/${peerUid}`] = true;
  updates[`privateRoomsByUser/${uid}/${room}`] = true;
  updates[`privateRoomsByUser/${peerUid}/${room}`] = true;

  // Clear the incoming request
  updates[`dmRequests/${uid}/${peerUid}`] = null;

  // Ensure inbox meta exists for both sides (so the thread is visible)
  const preview = String(req.previewText || '').slice(0, 120);
  const metaText = preview ? ('[Žádost] ' + preview) : 'DM potvrzeno';
  updates[`inboxMeta/${uid}/${room}/with`] = peerUid;
  updates[`inboxMeta/${uid}/${room}/ts`] = now;
  updates[`inboxMeta/${uid}/${room}/lastTs`] = now;
  updates[`inboxMeta/${uid}/${room}/lastText`] = metaText;

  updates[`inboxMeta/${peerUid}/${room}/with`] = uid;
  updates[`inboxMeta/${peerUid}/${room}/ts`] = now;
  updates[`inboxMeta/${peerUid}/${room}/lastTs`] = now;
  updates[`inboxMeta/${peerUid}/${room}/lastText`] = metaText;

  await db.ref().update(updates);

  return { ok:true, room, ts: now };
});

exports.dmSendAtomic = functions.https.onCall(async (data, context)=>{
  const uid = requireAuth(context);
  const peerUid = String(data?.peerUid || '').trim();
  if(!peerUid){
    throw new functions.https.HttpsError('invalid-argument','peerUid required');
  }
  if(peerUid === uid){
    throw new functions.https.HttpsError('invalid-argument','Cannot DM yourself');
  }

  const textRaw = (data?.text == null) ? '' : String(data.text);
  const text = String(textRaw).trim();
  const img = (data?.img == null) ? '' : String(data.img);

  if(!text && !img){
    throw new functions.https.HttpsError('invalid-argument','Empty message');
  }
  if(text && text.length > 1200){
    throw new functions.https.HttpsError('invalid-argument','Text too long');
  }
  if(img && img.length > 400000){
    throw new functions.https.HttpsError('invalid-argument','Image payload too large');
  }

  const room = roomId(uid, peerUid);
  const now = Date.now();

  // Bot rooms are allowed to be client-written; for server we still support them
  const isBotRoom = (room.startsWith('bot_') || room.includes('_bot_'));

  // Read minimal state
  const [confSnap, incomingReqSnap, outgoingReqSnap, lastMsgSnap, myPubSnap] = await Promise.all([
    db.ref(`dmConfirmed/${room}`).once('value'),
    db.ref(`dmRequests/${uid}/${peerUid}`).once('value'),
    db.ref(`dmRequests/${peerUid}/${uid}`).once('value'),
    db.ref(`privateMessages/${room}`).orderByChild('ts').limitToLast(1).once('value'),
    db.ref(`usersPublic/${uid}`).once('value')
  ]);

  const confirmed = confSnap.exists();
  const hasAnyMsg = lastMsgSnap.exists();
  let lastBy = '';
  if(hasAnyMsg){
    const v = lastMsgSnap.val() || {};
    try{
      const last = Object.values(v)[0] || {};
      lastBy = String(last.by || '');
    }catch(e){ lastBy = ''; }
  }

  const myPub = myPubSnap.val() || {};
  const fromNick = String(myPub.nick || '').slice(0,60);
  const fromAvatar = String(myPub.avatar || '').slice(0,400000);

  // ===== Case 1: not confirmed and no messages yet => DM request flow =====
  if(!confirmed && !hasAnyMsg && !isBotRoom){
    // If there is an incoming request, auto-confirm + send the first reply
    if(incomingReqSnap.exists()){
      // confirm
      const updates = {};
      updates[`dmConfirmed/${room}`] = { a: uid, b: peerUid, ts: now, by: uid };
      updates[`privateMembers/${room}/${uid}`] = true;
      updates[`privateMembers/${room}/${peerUid}`] = true;
      updates[`privateRoomsByUser/${uid}/${room}`] = true;
      updates[`privateRoomsByUser/${peerUid}/${room}`] = true;
      updates[`dmRequests/${uid}/${peerUid}`] = null;

      // send message
      const msgKey = db.ref(`privateMessages/${room}`).push().key;
      const msg = { by: uid, ts: now };
      if(text) msg.text = text;
      if(img) msg.img = img;
      updates[`privateMessages/${room}/${msgKey}`] = msg;

      // inbox meta
      const preview = (text ? text : (img ? '[img]' : '')).slice(0,120);
      updates[`inboxMeta/${uid}/${room}/with`] = peerUid;
      updates[`inboxMeta/${uid}/${room}/ts`] = now;
      updates[`inboxMeta/${uid}/${room}/lastTs`] = now;
      updates[`inboxMeta/${uid}/${room}/lastText`] = preview;
      updates[`inboxMeta/${uid}/${room}/lastReadTs`] = now;
      updates[`inboxMeta/${uid}/${room}/unread`] = 0;

      updates[`inboxMeta/${peerUid}/${room}/with`] = uid;
      updates[`inboxMeta/${peerUid}/${room}/ts`] = now;
      updates[`inboxMeta/${peerUid}/${room}/lastTs`] = now;
      updates[`inboxMeta/${peerUid}/${room}/lastText`] = preview;
      // bump unread for receiver
      updates[`inboxMeta/${peerUid}/${room}/unread`] = admin.database.ServerValue.increment(1);

      // read receipts (sender read now)
      updates[`dmReads/${room}/${uid}`] = now;

      await db.ref().update(updates);
      return { status:'sent', room, ts: now, confirmed:true };
    }

    // Outgoing request (first message)
    if(outgoingReqSnap.exists()){
      throw new functions.https.HttpsError('failed-precondition','DM request already sent');
    }
    if(img){
      throw new functions.https.HttpsError('failed-precondition','Images are not allowed before DM is accepted');
    }

    // Consume dm_init limit (server-side)
    const lim = await consumeLimitInternal(uid, 'dm_init', 1);
    if(!lim.ok){
      throw new functions.https.HttpsError('resource-exhausted','DM init limit reached');
    }

    const req = {
      ts: now,
      fromUid: uid,
      previewText: String(text).slice(0,240)
    };
    if(fromNick) req.fromNick = fromNick;
    if(fromAvatar) req.fromAvatar = fromAvatar;

    const updates = {};
    updates[`dmRequests/${peerUid}/${uid}`] = req;

    // Ensure sender sees the thread (as pending)
    updates[`inboxMeta/${uid}/${room}/with`] = peerUid;
    updates[`inboxMeta/${uid}/${room}/ts`] = now;
    updates[`inboxMeta/${uid}/${room}/lastTs`] = now;
    updates[`inboxMeta/${uid}/${room}/lastText`] = ('[Žádost] ' + String(text)).slice(0,120);
    updates[`inboxMeta/${uid}/${room}/lastReadTs`] = now;
    updates[`inboxMeta/${uid}/${room}/unread`] = 0;

    // Membership for sender (so they can open the room + see banner)
    updates[`privateMembers/${room}/${uid}`] = true;
    updates[`privateRoomsByUser/${uid}/${room}`] = true;

    await db.ref().update(updates);

    return { status:'request_sent', room, ts: now, limit: lim };
  }

  // ===== Case 2: confirmed or existing history (or bot room) => send message =====

  // Turn-taking rule: cannot send two messages in a row in user<->user rooms
  // (Bots are excluded; admins are excluded.)
  const isAdminSnap = await db.ref(`roles/${uid}/admin`).once('value');
  const isAdmin = isAdminSnap.val() === true;
  if(!isAdmin && !isBotRoom && lastBy && lastBy === uid){
    throw new functions.https.HttpsError('failed-precondition','WAIT_REPLY');
  }

  const msgKey = db.ref(`privateMessages/${room}`).push().key;
  const msg = { by: uid, ts: now };
  if(text) msg.text = text;
  if(img) msg.img = img;

  const preview = (text ? text : (img ? '[img]' : '')).slice(0,120);

  const updates = {};
  updates[`privateMessages/${room}/${msgKey}`] = msg;

  // Ensure membership for both sides
  updates[`privateMembers/${room}/${uid}`] = true;
  updates[`privateMembers/${room}/${peerUid}`] = true;
  updates[`privateRoomsByUser/${uid}/${room}`] = true;
  updates[`privateRoomsByUser/${peerUid}/${room}`] = true;

  // Ensure confirmed record exists (helps migrate legacy rooms)
  if(!confirmed && !isBotRoom){
    updates[`dmConfirmed/${room}`] = { a: uid, b: peerUid, ts: now, by: uid };
    // Also remove any stale requests in both directions
    updates[`dmRequests/${uid}/${peerUid}`] = null;
    updates[`dmRequests/${peerUid}/${uid}`] = null;
  }

  // Inbox meta updates
  updates[`inboxMeta/${uid}/${room}/with`] = peerUid;
  updates[`inboxMeta/${uid}/${room}/ts`] = now;
  updates[`inboxMeta/${uid}/${room}/lastTs`] = now;
  updates[`inboxMeta/${uid}/${room}/lastText`] = preview;
  updates[`inboxMeta/${uid}/${room}/lastReadTs`] = now;
  updates[`inboxMeta/${uid}/${room}/unread`] = 0;

  updates[`inboxMeta/${peerUid}/${room}/with`] = uid;
  updates[`inboxMeta/${peerUid}/${room}/ts`] = now;
  updates[`inboxMeta/${peerUid}/${room}/lastTs`] = now;
  updates[`inboxMeta/${peerUid}/${room}/lastText`] = preview;
  updates[`inboxMeta/${peerUid}/${room}/unread`] = admin.database.ServerValue.increment(1);

  // Read receipts
  updates[`dmReads/${room}/${uid}`] = now;

  await db.ref().update(updates);

  return { status:'sent', room, ts: now, confirmed: confirmed || !isBotRoom };
});

exports.dmMarkRead = functions.https.onCall(async (data, context)=>{
  const uid = requireAuth(context);
  const room = String(data?.room || '').trim();
  if(!room){
    throw new functions.https.HttpsError('invalid-argument','room required');
  }

  const memSnap = await db.ref(`privateMembers/${room}/${uid}`).once('value');
  if(memSnap.val() !== true){
    throw new functions.https.HttpsError('permission-denied','Not a member of this room');
  }

  const now = Date.now();
  const updates = {};
  updates[`dmReads/${room}/${uid}`] = now;
  // Also clear unread for this room (best-effort)
  updates[`inboxMeta/${uid}/${room}/unread`] = 0;
  updates[`inboxMeta/${uid}/${room}/lastReadTs`] = now;
  await db.ref().update(updates);
  return { ok:true, ts: now };
});
