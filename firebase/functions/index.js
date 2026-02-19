const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const rtdb = admin.database();

// -------------------------
// Health check
// -------------------------
// Handy for: verifying that the web-client can reach Functions (and later App Check enforcement).
exports.pingServer = functions.region('europe-west1').https.onCall(async (_data, _context) => {
  return { ok: true, ts: Date.now() };
});

// -------------------------
// Callable: profileInit
// -------------------------
// Create/repair usersPublic/{uid} after registration/login.
// This allows you to close client-writes in RTDB rules later
// without breaking registration.
//
// Frontend should call:
//   httpsCallable('profileInit')({ nick, role, avatar })
exports.profileInit = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;

  const normalizeNick = (n)=>{
    n = String(n || '').trim().replace(/\s+/g,' ');
    if(n.length > 32) n = n.slice(0,32);
    return n;
  };

  const inNick = (data && typeof data.nick === 'string') ? data.nick : '';
  const inRole = (data && typeof data.role === 'string') ? data.role : '';
  const inAvatar = (data && typeof data.avatar === 'string') ? data.avatar : '';

  let nick = normalizeNick(inNick);
  if(!nick) nick = `Uživatel #${String(uid).slice(-4)}`;
  const role = (inRole === 'employer' || inRole === 'seeker') ? inRole : 'seeker';
  const avatar = (inAvatar && inAvatar.length <= 2048) ? inAvatar : null;

  const pubRef = rtdb.ref(`usersPublic/${uid}`);
  const snap = await pubRef.get();
  const cur = snap.exists() ? (snap.val() || {}) : {};

  // Fill missing only (do not overwrite user edits if profile already exists)
  const merged = {
    nick: cur.nick || nick,
    role: cur.role || role,
    avatar: cur.avatar || avatar || '/assets/img/default-avatar.svg',
    plan: cur.plan || 'free',
    createdAt: cur.createdAt || now(),
    updatedAt: now(),
  };

  // Never store e-mail in public profile.
  try{ await pubRef.child('email').remove(); }catch(e){}

  await pubRef.update(merged);
  return { ok: true, uid, created: !snap.exists(), profile: merged };
});

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

// Feature gating (not daily counters)
// Keep roughly aligned with assets/js/app/features/premium-limits.js
const PLAN_FEATURES = {
  free:        { autopost: { slots: 0,  minIntervalMin: 120, photos: false } },
  premium:     { autopost: { slots: 1,  minIntervalMin: 60,  photos: true  } },
  premiumplus: { autopost: { slots: 3,  minIntervalMin: 30,  photos: true  } },
  vip:         { autopost: { slots: 10, minIntervalMin: 15,  photos: true  } },
  bot:         { autopost: { slots: 999, minIntervalMin: 1,  photos: true  } }
};

function getFeatures(plan){
  const p = normPlan(plan);
  return PLAN_FEATURES[p] || PLAN_FEATURES.free;
}

const CITY_WHITELIST = new Set([
  'praha','brno','olomouc','ostrava','plzen','liberec','hradec','pardubice',
  'ceske_budejovice','usti','zlin','karlovy_vary','jihlava','teplice'
]);

function normCity(c){
  return String(c||'').trim().toLowerCase();
}

function nextMidnightTs(ts){
  const d = new Date(Number(ts || now()));
  d.setHours(24,0,0,0);
  return +d;
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
// Autoposting (server-first)
// -------------------------

function clampInt(n, min, max){
  n = Math.floor(Number(n));
  if(!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

async function countActiveCampaigns(uid){
  const snap = await rtdb.ref(`autopostCampaigns/${uid}`).get();
  const obj = snap.val() || {};
  let n = 0;
  for(const k of Object.keys(obj)){
    if(obj[k] && obj[k].isActive === true) n++;
  }
  return n;
}

async function isBannedOrMuted(uid){
  try{
    const [b, m] = await Promise.all([
      rtdb.ref(`bans/${uid}`).get(),
      rtdb.ref(`mutes/${uid}`).get()
    ]);
    const bt = Number((b.val()||{}).until || 0);
    const mt = Number((m.val()||{}).until || 0);
    const ts = now();
    if(bt && bt > ts) return { blocked:true, kind:'ban', until: bt };
    if(mt && mt > ts) return { blocked:true, kind:'mute', until: mt };
  }catch(e){
    // ignore
  }
  return { blocked:false };
}

// Callable: create campaign
exports.autopostCampaignCreate = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;

  // Debug helper: inspect payload in Cloud Functions logs.
  // Avoid logging huge dataURLs.
  try{
    const safe = Object.assign({}, data||{});
    if(typeof safe.imageUrl === 'string' && safe.imageUrl.length > 120) safe.imageUrl = safe.imageUrl.slice(0,120)+'…';
    console.log('[autopostCampaignCreate] data', safe);
  }catch(e){}

  const city = normCity((data && data.city) || '');
  const text = String((data && data.text) || '').trim();
  const intervalMin = clampInt((data && data.intervalMin), 15, 1440);
  const isActive = (data && typeof data.isActive === 'boolean') ? !!data.isActive : true;
  const imageUrl = String((data && data.imageUrl) || '').trim();

  if(!CITY_WHITELIST.has(city)){
    return { ok:false, reason:'city' };
  }
  if(!text || text.length > 1200){
    return { ok:false, reason:'text' };
  }

  const up = (await rtdb.ref(`usersPublic/${uid}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  const feats = (getFeatures(plan).autopost) || { slots:0, minIntervalMin:120, photos:false };

  if(!feats.slots || feats.slots <= 0){
    return { ok:false, reason:'plan', plan };
  }

  if(intervalMin < Number(feats.minIntervalMin || 120)){
    return { ok:false, reason:'min_interval', minIntervalMin: Number(feats.minIntervalMin || 120) };
  }

  if(imageUrl){
    if(!feats.photos){
      return { ok:false, reason:'no_photos' };
    }
    if(!imageUrl.startsWith('data:image/') || imageUrl.length > 400000){
      return { ok:false, reason:'image' };
    }
  }

  if(isActive){
    const active = await countActiveCampaigns(uid);
    if(active >= Number(feats.slots||0)){
      return { ok:false, reason:'slots', active, slots: Number(feats.slots||0) };
    }
  }

  const ts = now();
  const cid = rtdb.ref(`autopostCampaigns/${uid}`).push().key;
  const nextPostTs = isActive ? ts : 0;

  const campaign = {
    city,
    text: text.slice(0,1200),
    intervalMin,
    isActive,
    createdTs: ts,
    lastPostTs: 0,
    nextPostTs: nextPostTs
  };
  if(imageUrl) campaign.imageUrl = imageUrl;

  const upd = {};
  upd[`autopostCampaigns/${uid}/${cid}`] = campaign;

  const auditKey = rtdb.ref('auditLogs').push().key;
  upd[`auditLogs/${auditKey}`] = { ts, type:'autopostCampaignCreate', by: uid, campaignId: cid, city, intervalMin, isActive };

  await rtdb.ref().update(upd);

  return { ok:true, id: cid, nextPostTs, plan, features: feats };
});

// Callable: update campaign
exports.autopostCampaignUpdate = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const campaignId = String((data && data.campaignId) || '').trim();
  if(!campaignId){
    throw new functions.https.HttpsError('invalid-argument', 'campaignId required');
  }

  const ref = rtdb.ref(`autopostCampaigns/${uid}/${campaignId}`);
  const snap = await ref.get();
  const cur = snap.val();
  if(!cur){
    return { ok:false, reason:'not_found' };
  }

  const up = (await rtdb.ref(`usersPublic/${uid}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  const feats = (getFeatures(plan).autopost) || { slots:0, minIntervalMin:120, photos:false };
  if(!feats.slots || feats.slots <= 0){
    return { ok:false, reason:'plan', plan };
  }

  const patch = {};

  if(data && data.city != null){
    const city = normCity(data.city);
    if(!CITY_WHITELIST.has(city)) return { ok:false, reason:'city' };
    patch.city = city;
  }

  if(data && data.text != null){
    const text = String(data.text || '').trim();
    if(!text || text.length > 1200) return { ok:false, reason:'text' };
    patch.text = text.slice(0,1200);
  }

  if(data && data.intervalMin != null){
    const intervalMin = clampInt(data.intervalMin, 15, 1440);
    if(intervalMin < Number(feats.minIntervalMin || 120)){
      return { ok:false, reason:'min_interval', minIntervalMin: Number(feats.minIntervalMin || 120) };
    }
    patch.intervalMin = intervalMin;
  }

  if(data && data.imageUrl != null){
    const imageUrl = String(data.imageUrl || '').trim();
    if(!imageUrl){
      patch.imageUrl = null;
    }else{
      if(!feats.photos) return { ok:false, reason:'no_photos' };
      if(!imageUrl.startsWith('data:image/') || imageUrl.length > 400000) return { ok:false, reason:'image' };
      patch.imageUrl = imageUrl;
    }
  }

  if(!Object.keys(patch).length){
    return { ok:false, reason:'empty' };
  }

  // Recompute nextPostTs if interval changed (keeps schedule stable)
  const nextPatch = Object.assign({}, patch);
  const ts = now();
  const effIntervalMin = Number(nextPatch.intervalMin || cur.intervalMin || feats.minIntervalMin || 120);
  const intervalMs = Math.max(15, effIntervalMin) * 60000;
  const lastPostTs = Number(cur.lastPostTs || 0);
  const isActive = (cur.isActive === true);
  if(isActive && nextPatch.intervalMin != null){
    const next = Math.max(ts, lastPostTs ? (lastPostTs + intervalMs) : ts);
    nextPatch.nextPostTs = next;
  }

  // Apply update (null removes fields)
  await ref.update(nextPatch);

  // Clean up nulls (RTDB keeps null as delete only when using update)
  if(nextPatch.imageUrl === null){
    try{ await ref.child('imageUrl').remove(); }catch(e){}
  }

  // Audit (best-effort)
  try{
    const auditKey = rtdb.ref('auditLogs').push().key;
    await rtdb.ref(`auditLogs/${auditKey}`).set({ ts, type:'autopostCampaignUpdate', by: uid, campaignId });
  }catch(e){}

  return { ok:true, plan, features: feats };
});

// Callable: toggle campaign
exports.autopostCampaignToggle = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const campaignId = String((data && data.campaignId) || '').trim();
  if(!campaignId){
    throw new functions.https.HttpsError('invalid-argument', 'campaignId required');
  }
  const wantActive = !!(data && data.isActive);

  const ref = rtdb.ref(`autopostCampaigns/${uid}/${campaignId}`);
  const snap = await ref.get();
  const cur = snap.val();
  if(!cur){
    return { ok:false, reason:'not_found' };
  }

  const up = (await rtdb.ref(`usersPublic/${uid}`).get()).val() || {};
  const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
  const feats = (getFeatures(plan).autopost) || { slots:0, minIntervalMin:120, photos:false };
  if(!feats.slots || feats.slots <= 0){
    return { ok:false, reason:'plan', plan };
  }

  const ts = now();
  const patch = {};

  if(wantActive){
    // Slot gating
    const active = await countActiveCampaigns(uid);
    const alreadyActive = (cur.isActive === true);
    if(!alreadyActive && active >= Number(feats.slots||0)){
      return { ok:false, reason:'slots', active, slots: Number(feats.slots||0) };
    }

    // Normalize interval
    const intervalMin = clampInt(cur.intervalMin, 15, 1440);
    const minI = Number(feats.minIntervalMin || 120);
    const effIntervalMin = Math.max(intervalMin, minI);
    if(effIntervalMin !== Number(cur.intervalMin||0)) patch.intervalMin = effIntervalMin;

    const intervalMs = effIntervalMin * 60000;
    const lastPostTs = Number(cur.lastPostTs || 0);
    const next = Math.max(ts, lastPostTs ? (lastPostTs + intervalMs) : ts);
    patch.isActive = true;
    patch.nextPostTs = next;
  }else{
    patch.isActive = false;
    patch.nextPostTs = 0;
  }

  await ref.update(patch);

  try{
    const auditKey = rtdb.ref('auditLogs').push().key;
    await rtdb.ref(`auditLogs/${auditKey}`).set({ ts, type:'autopostCampaignToggle', by: uid, campaignId, isActive: wantActive });
  }catch(e){}

  return { ok:true, isActive: wantActive, plan, features: feats };
});

// Callable: remove campaign
exports.autopostCampaignRemove = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const campaignId = String((data && data.campaignId) || '').trim();
  if(!campaignId){
    throw new functions.https.HttpsError('invalid-argument', 'campaignId required');
  }
  const ts = now();
  await rtdb.ref(`autopostCampaigns/${uid}/${campaignId}`).remove();
  try{
    const auditKey = rtdb.ref('auditLogs').push().key;
    await rtdb.ref(`auditLogs/${auditKey}`).set({ ts, type:'autopostCampaignRemove', by: uid, campaignId });
  }catch(e){}
  return { ok:true };
});

// Scheduled tick: posts due campaigns server-side (works when site is closed)

// -------------------------
// Callable: autopostCampaignList
// -------------------------
// Return user's autopost campaigns (read-only) via server.
// This allows the frontend to avoid direct RTDB reads if desired.
exports.autopostCampaignList = functions.region('europe-west1').https.onCall(async (_data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;

  const snap = await rtdb.ref(`autopostCampaigns/${uid}`).get();
  const campaigns = snap.val() || {};
  return { ok:true, campaigns };
});


exports.autopostTick = functions.region('europe-west1').pubsub.schedule('every 2 minutes').onRun(async () => {
  const ts = now();

  // Cheap global lock to avoid overlapping executions
  try{
    const lockRef = rtdb.ref('serverLocks/autopostTick');
    const lockRes = await lockRef.transaction(cur => {
      cur = Number(cur || 0);
      if(cur && (ts - cur) < 90*1000) return; // another tick is running
      return ts;
    });
    if(!lockRes.committed) return null;
  }catch(e){
    // If lock fails, still try (better to post than to freeze)
  }

  const root = (await rtdb.ref('autopostCampaigns').get()).val() || {};
  const dk = dayKey(ts);

  // Debug: how many users have campaigns
  try{ console.log('[autopostTick] usersWithCampaigns=', Object.keys(root||{}).length); }catch(e){}

  const upd = {};
  let processed = 0;

  for(const uid of Object.keys(root)){
    const camps = root[uid] || {};
    const campIds = Object.keys(camps);
    if(!campIds.length) continue;

    // Quick pre-check: is there at least one active due campaign?
    let hasCandidate = false;
    for(const cid of campIds){
      const c = camps[cid];
      if(c && c.isActive === true && Number(c.nextPostTs||0) <= ts) { hasCandidate = true; break; }
      // if nextPostTs not present (legacy), we still may need to compute
      if(c && c.isActive === true && !c.nextPostTs) { hasCandidate = true; break; }
    }
    if(!hasCandidate) continue;

    // Ban/mute gating (best-effort)
    const bm = await isBannedOrMuted(uid);
    if(bm.blocked) continue;

    const up = (await rtdb.ref(`usersPublic/${uid}`).get()).val() || {};
    const plan = effectivePlan(up.plan || 'free', up.premiumUntil || up.planUntil || 0);
    const feats = (getFeatures(plan).autopost) || { slots:0, minIntervalMin:120, photos:false };
    if(!feats.slots || feats.slots <= 0) continue;

    const limit = getLimit(plan, 'autopost_posts');
    const minI = Number(feats.minIntervalMin || 120);

    for(const cid of campIds){
      const c = camps[cid];
      if(!c || c.isActive !== true) continue;

      let city = normCity(c.city);
      if(!CITY_WHITELIST.has(city)) continue;

      const text = String(c.text || '').trim();
      if(!text) continue;

      let intervalMin = clampInt(c.intervalMin, 15, 1440);
      intervalMin = Math.max(intervalMin, minI);
      const intervalMs = intervalMin * 60000;

      const lastPostTs = Number(c.lastPostTs || 0);
      let nextPostTs = Number(c.nextPostTs || 0);
      if(!nextPostTs){
        nextPostTs = lastPostTs ? (lastPostTs + intervalMs) : ts;
      }
      if(nextPostTs > ts) continue;

      // Enforce daily limit (server-owned)
      if(limit <= 0){
        upd[`autopostCampaigns/${uid}/${cid}/nextPostTs`] = nextMidnightTs(ts) + 1000;
        continue;
      }

      if(limit < 9999){
        const limRef = rtdb.ref(`users/${uid}/limits/${dk}/autopost_posts`);
        const limRes = await limRef.transaction(cur => {
          cur = Number(cur || 0);
          if(cur + 1 > limit) return;
          return cur + 1;
        });
        if(!limRes.committed){
          // Try again tomorrow
          upd[`autopostCampaigns/${uid}/${cid}/nextPostTs`] = nextMidnightTs(ts) + 1000;
          continue;
        }
      }

      // Idempotency: deterministic key per interval bucket
      const bucket = Math.floor(ts / intervalMs);
      const bucketTs = bucket * intervalMs;
      const msgKey = `ap_${uid}_${cid}_${bucket}`;

      const msgObj = {
        ts: bucketTs,
        by: uid,
        text: text.slice(0, 1200),
        meta: { kind: 'autopost', campaignId: cid, intervalMin }
      };

      const img = String(c.imageUrl || '').trim();
      if(img && feats.photos && img.startsWith('data:image/') && img.length <= 400000){
        msgObj.img = img;
      }

      const msgRef = rtdb.ref(`messages/${city}/${msgKey}`);
      await msgRef.transaction(cur => {
        if(cur) return; // already posted
        return msgObj;
      });

      // Update schedule
      upd[`autopostCampaigns/${uid}/${cid}/intervalMin`] = intervalMin;
      upd[`autopostCampaigns/${uid}/${cid}/lastPostTs`] = bucketTs;
      upd[`autopostCampaigns/${uid}/${cid}/nextPostTs`] = bucketTs + intervalMs;
      upd[`autopostCampaigns/${uid}/${cid}/lastError`] = null;

      processed++;
      if(processed >= 200) break;
    }

    if(processed >= 200) break;
  }

  if(Object.keys(upd).length){
    await rtdb.ref().update(upd);
  }

  try{ console.log('[autopostTick] processed=', processed, 'updates=', Object.keys(upd).length); }catch(e){}

  // release lock (best-effort)
  try{ await rtdb.ref('serverLocks/autopostTick').remove(); }catch(e){}

  return null;
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
  if(!peerIsBot) upd[`privateMembers/${room}/${peerUid}`] = true;
  upd[`privateRoomsByUser/${me}/${room}`] = true;
  upd[`privateRoomsByUser/${peerUid}/${room}`] = true;
  upd[`dmRequests/${me}/${peerUid}`] = null;

  // Seed inbox meta (so inbox is not empty)
  const preview = String(req.previewText || req.text || '').slice(0, 140);

  // IMPORTANT: persist the very first DM request message as the first message in the room.
  // Otherwise users experience it as "message disappeared" after accept.
  // We use a deterministic key so multiple accept calls won't duplicate it.
  try{
    const firstTs = Number(req.ts || 0) || ts;
    const firstText = String(req.text || req.previewText || '').trim().slice(0, 1200);
    if(firstText){
      const safePeer = String(peerUid).replace(/[.#$\[\]\/]/g, '_');
      const safeKey = String(`req_${safePeer}_${firstTs}`).replace(/[.#$\[\]\/]/g, '_').slice(0, 120);
      upd[`privateMessages/${room}/${safeKey}`] = { by: peerUid, ts: firstTs, text: firstText };
    }
  }catch(e){ /* best-effort */ }

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
  // Full first message (stored in dmRequests; moved to privateMessages on accept).
  // Keep previewText for backwards-compat.
  const text = String((data && (data.text || data.previewText)) || '').trim();
  const previewText = text.slice(0, 240);

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
  if(!text){
    throw new functions.https.HttpsError('invalid-argument', 'text required');
  }
  if(text.length > 1200){
    throw new functions.https.HttpsError('invalid-argument', 'text too long');
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
    text: text,
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
// Callable: dmSend (server-authoritative)
// -------------------------
// - Client should NOT write to privateMessages directly.
// - Server validates membership/confirmation and updates inboxMeta atomically.
exports.dmSend = functions.region('europe-west1').https.onCall(async (data, context) => {
  if(!context.auth || !context.auth.uid){
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const me = context.auth.uid;
  const peerUid = String((data && (data.peerUid || data.toUid)) || '').trim();
  const room = String((data && data.room) || '').trim();
  const text = String((data && data.text) || '').trim();
  const img = (data && typeof data.img === 'string') ? String(data.img).trim() : '';
  const wantBot = !!(data && data.bot);
  const botUid = String((data && data.botUid) || '').trim();

  if(!peerUid || peerUid === me){
    throw new functions.https.HttpsError('invalid-argument', 'peerUid required');
  }
  if(!room){
    throw new functions.https.HttpsError('invalid-argument', 'room required');
  }
  if(room !== dmKey(me, peerUid)){
    throw new functions.https.HttpsError('invalid-argument', 'room mismatch');
  }
  if(!text && !img){
    throw new functions.https.HttpsError('invalid-argument', 'text or img required');
  }
  if(text && text.length > 1200){
    throw new functions.https.HttpsError('invalid-argument', 'text too long');
  }
  if(img && img.length > 420000){
    throw new functions.https.HttpsError('invalid-argument', 'img too large');
  }

  // DM ban gate
  try{
    const b = await rtdb.ref(`dmBans/${me}`).get();
    if(b.exists()) return { ok:false, reason:'dm_banned' };
  }catch(e){ /* ignore */ }

  // Block-gate (either direction)
  try{
    const [b1, b2] = await Promise.all([
      rtdb.ref(`blocks/${me}/${peerUid}`).get(),
      rtdb.ref(`blocks/${peerUid}/${me}`).get()
    ]);
    if(b1.exists() || b2.exists()) return { ok:false, reason:'blocked' };
  }catch(e){ /* ignore */ }

  const peerIsBot = peerUid.startsWith('bot_');
  const isBot = peerIsBot || room.includes('_bot_');

  // Confirmation gate for human↔human rooms (legacy rooms with history are allowed)
  if(!peerIsBot){
    let confirmed = false;
    try{ confirmed = (await rtdb.ref(`dmConfirmed/${room}`).get()).exists(); }catch(e){ confirmed = false; }
    if(!confirmed){
      try{
        const any = await rtdb.ref(`privateMessages/${room}`).limitToFirst(1).get();
        confirmed = any.exists();
      }catch(e){ confirmed = false; }
    }
    if(!confirmed){
      return { ok:false, reason:'not_confirmed' };
    }
  }

  const ts = now();
  const msgRef = rtdb.ref(`privateMessages/${room}`).push();
  const mid = msgRef.key;

  const msg = { by: me, ts };
  if(text) msg.text = text;
  if(img) msg.img = img;

  // Allow bot-style system messages ONLY inside bot rooms.
  if(wantBot){
    if(!isBot){
      return { ok:false, reason:'bot_flag_not_allowed' };
    }
    msg.bot = true;
    msg.botUid = (botUid && botUid.startsWith('bot_')) ? botUid : peerUid;
  }

  // 1) write message
  await msgRef.set(msg);

  // 2) update meta + indexes
  const preview = (text ? text : '[img]').slice(0, 140);
  const upd = {};
  // membership (best-effort, helps rules-based reads)
  upd[`privateMembers/${room}/${me}`] = true;
  if(!peerIsBot) upd[`privateMembers/${room}/${peerUid}`] = true;
  upd[`privateRoomsByUser/${me}/${room}`] = true;
  if(!isBot) upd[`privateRoomsByUser/${peerUid}/${room}`] = true;

  // sender meta
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

  // receiver meta (unread increment)
  if(!peerIsBot){
    upd[`inboxMeta/${peerUid}/${room}/with`] = me;
    upd[`inboxMeta/${peerUid}/${room}/ts`] = ts;
    upd[`inboxMeta/${peerUid}/${room}/lastTs`] = ts;
    upd[`inboxMeta/${peerUid}/${room}/lastBy`] = me;
    upd[`inboxMeta/${peerUid}/${room}/lastText`] = preview;
    upd[`inboxMeta/${peerUid}/${room}/unread`] = admin.database.ServerValue.increment(1);
    upd[`inboxMeta/${peerUid}/${room}/pendingRequest`] = null;
    upd[`inboxMeta/${peerUid}/${room}/pendingText`] = null;
    upd[`inboxMeta/${peerUid}/${room}/pendingTs`] = null;
  }

  await rtdb.ref().update(upd);

  // Optional: lightweight notification
  try{
    if(!peerIsBot){
      await pushNotif(peerUid, { type:'dm', from: me, room, text: preview });
    }
  }catch(e){ /* ignore */ }

  return { ok:true, room, mid, ts };
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

  // Ignore server-side autopost messages (do not count towards chat streak/promo)
  try{
    const mk = (m && m.meta && typeof m.meta === 'object') ? String(m.meta.kind || '') : '';
    if(mk === 'autopost') return null;
  }catch(e){ /* ignore */ }

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
