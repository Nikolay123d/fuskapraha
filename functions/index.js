/*
  Makame.cz Cloud Functions

  What you get here:
  1) Scheduler bot tick: posts bot messages to public chat and/or DM on interval
  2) HTTPS endpoint sendPush: admin-triggered push to a user (or broadcast)

  Deploy:
    firebase deploy --only functions

  Notes:
  - Admin SDK bypasses RTDB rules, so keep the Function code strict.
  - This assumes your RTDB structure is compatible with app.js:
      - Public chat: messages/{city}/{pushId}
      - DM: privateMembers/{roomId}/{uid}=true
            privateMessages/{roomId}/{pushId}
      - FCM tokens: fcmTokens/{uid}/{token} -> {ts, ua}
      - Admin bots: bots/{botId}
      - Premium user bots: userBots/{uid}/{botId}
*/

const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');

initializeApp();

const db = getDatabase();

// Keep in sync with RTDB admin emails
const ADMIN_EMAILS = new Set([
  'urciknikolaj642@gmail.com',
  'urciknikolaj62@gmail.com'
]);

function dmKey(a, b) {
  return [a, b].sort().join('_');
}

function nowTs() {
  return Date.now();
}

async async function isAdminRequest(req) {
  try {
    const h = req.headers.authorization || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return { ok: false, reason: 'Missing Authorization Bearer token' };

    const decoded = await getAuth().verifyIdToken(m[1]);
    const uid = decoded.uid;

    // Single Source of Truth: roles/<uid>/admin === true
    const roleSnap = await getDatabase().ref('roles/'+uid+'/admin').get();
    const isAdmin = roleSnap.exists() && roleSnap.val() === true;
    if (!isAdmin) return { ok: false, reason: 'Not an admin' };

    return { ok: true, uid, email: (decoded.email||'') };
  } catch (e) {
    return { ok: false, reason: 'Invalid token', error: String(e) };
  }
}


async function loadUserTokens(uid) {
  const snap = await db.ref(`fcmTokens/${uid}`).get();
  const val = snap.val() || {};
  return Object.keys(val).filter(Boolean);
}

async function sendPushToTokens(tokens, payload) {
  if (!tokens.length) return { successCount: 0, failureCount: 0 };
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: payload.notification,
    data: payload.data
  });
  return { successCount: res.successCount, failureCount: res.failureCount };
}

// =============
// HTTPS: send push
// POST JSON:
//  {
//    "to": "uid" | "ALL",
//    "title": "...",
//    "body": "...",
//    "url": "https://.../" ,
//    "data": {"k":"v"}
//  }
// =============
exports.sendPush = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const adm = await isAdminRequest(req);
  if (!adm.ok) return res.status(403).json({ ok: false, error: adm.reason });

  const { to, title, body, url, data } = req.body || {};
  const safeTitle = String(title || 'Makáme.cz').slice(0, 120);
  const safeBody = String(body || '').slice(0, 500);
  const safeUrl = String(url || '/');
  const extra = (data && typeof data === 'object') ? data : {};

  const payload = {
    notification: {
      title: safeTitle,
      body: safeBody
    },
    data: {
      url: safeUrl,
      title: safeTitle,
      body: safeBody,
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [String(k), String(v)]))
    }
  };

  if (!to) return res.status(400).json({ ok: false, error: 'Missing "to"' });

  // Broadcast (best-effort). For large userbase, switch to topic messaging.
  if (String(to).toUpperCase() === 'ALL') {
    const tokensSnap = await db.ref('fcmTokens').get();
    const all = tokensSnap.val() || {};
    const tokens = [];
    for (const uid of Object.keys(all)) {
      for (const t of Object.keys(all[uid] || {})) tokens.push(t);
    }
    // chunk to 500
    let total = { successCount: 0, failureCount: 0 };
    for (let i = 0; i < tokens.length; i += 500) {
      const part = tokens.slice(i, i + 500);
      const r = await sendPushToTokens(part, payload);
      total.successCount += r.successCount;
      total.failureCount += r.failureCount;
    }
    return res.json({ ok: true, to: 'ALL', ...total });
  }

  const uid = String(to);
  const tokens = await loadUserTokens(uid);
  const r = await sendPushToTokens(tokens, payload);
  return res.json({ ok: true, to: uid, tokens: tokens.length, ...r });
});

// =============
// Scheduler: bot tick
// - Every 5 minutes: check bots that are due and post messages
// - Supports:
//    bots/{botId} (admin bots)
//    userBots/{uid}/{botId} (premium bots)
// - Bot schema (minimal):
//    {
//      enabled: true,
//      city: "Praha",
//      intervalMin: 15,
//      texts: ["...", "..."],
//      img: "data:image/..." | "https://..." (optional),
//      targetUid: "..." (optional -> DM)
//      nick: "..." (optional)
//      avatar: "..." (optional)
//    }
// =============
exports.botTick = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Europe/Prague' },
  async () => {
    const ts = nowTs();
    logger.info('[botTick] start', { ts });

    // admin bots
    const botsSnap = await db.ref('bots').get();
    const bots = botsSnap.val() || {};

    // premium user bots
    const userBotsSnap = await db.ref('userBots').get();
    const userBots = userBotsSnap.val() || {};

    const jobs = [];

    for (const [botId, b] of Object.entries(bots)) {
      jobs.push({ scope: 'admin', ownerUid: null, botId, bot: b });
    }
    for (const [ownerUid, botsObj] of Object.entries(userBots)) {
      for (const [botId, b] of Object.entries(botsObj || {})) {
        jobs.push({ scope: 'user', ownerUid, botId, bot: b });
      }
    }

    let posted = 0;
    for (const job of jobs) {
      const bot = job.bot || {};
      if (!bot.enabled) continue;

      const intervalMin = Math.max(1, Number(bot.intervalMin || bot.interval || 15));
      const lastRun = Number(bot.lastRun || 0);
      if (ts - lastRun < intervalMin * 60 * 1000) continue;

      const texts = Array.isArray(bot.texts) ? bot.texts.filter(Boolean) : (bot.text ? [bot.text] : []);
      if (!texts.length && !bot.img) continue;

      // rotate message index
      const idx = Number(bot.idx || 0);
      const text = texts.length ? texts[idx % texts.length] : null;

      const message = {
        ts,
        // For admin bots we post as the premium-bot UID so clients can always open DM reliably.
        // For user bots we post as the owner UID, but render as bot via botNick/botAvatar.
        by: job.ownerUid ? String(job.ownerUid) : 'bot_premium',
        botUid: 'bot_premium',
        text: text || null,
        img: bot.img || null,
        bot: true,
        botId: String(job.botId),
        botOwnerUid: job.ownerUid || null,
        botNick: bot.nick || null,
        botAvatar: bot.avatar || null
      };

      try {
        const targetUid = bot.targetUid ? String(bot.targetUid) : '';
        if (targetUid) {
          // DM mode
          const dmFrom = job.ownerUid ? String(job.ownerUid) : 'bot_premium';
          const room = dmKey(dmFrom, targetUid);
          // ensure membership
          await db.ref(`privateMembers/${room}/${targetUid}`).set(true);
          await db.ref(`privateMembers/${room}/${dmFrom}`).set(true);
          await db.ref(`privateRoomsByUser/${targetUid}/${room}`).set(true);
          await db.ref(`privateRoomsByUser/${dmFrom}/${room}`).set(true);
          await db.ref(`privateMessages/${room}`).push({
            ts,
            by: dmFrom,
            botUid: 'bot_premium',
            text: message.text,
            img: message.img,
            bot: true,
            botId: message.botId,
            botNick: message.botNick,
            botAvatar: message.botAvatar
          });
        } else {
          // Public chat mode
          const city = String(bot.city || 'Praha');
          await db.ref(`messages/${city}`).push(message);
        }

        // update bot state
        const basePath = (job.scope === 'admin') ? `bots/${job.botId}` : `userBots/${job.ownerUid}/${job.botId}`;
        await db.ref(basePath).update({ lastRun: ts, idx: idx + 1 });
        posted++;
      } catch (e) {
        logger.warn('[botTick] post failed', { botId: job.botId, scope: job.scope, error: String(e) });
      }
    }

    // marker for debugging
    try {
      await db.ref('botTick').set({ ts, posted });
    } catch (_) {}

    logger.info('[botTick] done', { posted });
  }
);



// === Online stats (public counters) ===
// Writes: /onlineStats/public = { ts, total, employers, workers }
// Uses presence/{uid}/ts and usersPublic/{uid}/role or type
exports.updateOnlineStats = functions.pubsub
  .schedule('every 2 minutes')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    const db = getDatabase();
    const now = Date.now();
    const ACTIVE_MS = 5 * 60 * 1000; // 5 minutes
    const presSnap = await db.ref('presence').get().catch(() => null);
    const presence = presSnap && presSnap.exists() ? presSnap.val() : {};
    const activeUids = Object.keys(presence||{}).filter(uid => {
      const t = presence[uid] && presence[uid].ts;
      return typeof t === 'number' && (now - t) <= ACTIVE_MS;
    });
    let total = activeUids.length;
    let employers = 0;
    let workers = 0;

    // Batch read public profiles (best-effort)
    const reads = activeUids.slice(0, 500).map(uid =>
      db.ref('usersPublic/'+uid).get().then(s=>({uid, v: s.exists()?s.val():null})).catch(()=>({uid, v:null}))
    );
    const profs = await Promise.all(reads);

    for(const p of profs){
      const v = p.v || {};
      const r = (v.role || v.type || v.kind || '').toString().toLowerCase();
      if(r.includes('employ') || r.includes('zam') || r==='employer' || r==='zamestnavatel') employers++;
      else if(r.includes('work') || r.includes('prac') || r==='worker' || r==='pracovnik') workers++;
    }

    await db.ref('onlineStats/public').set({
      ts: now,
      total,
      employers,
      workers
    }).catch(()=>null);

    return null;
  });
