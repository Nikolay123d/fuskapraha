// Chat & Quota bots (admin only) with dedup
let botTimer=null, quotaTimer=null;

async function safePostOnce(path, payload, mins){
  const lastRef = db.ref('settings/bots/chatLast');
  const now = Date.now();
  await lastRef.transaction(last => {
    if (!last || (now - last) > mins*60*1000) return now;
    return last;
  }, async (err, committed) => {
    if (committed) await db.ref(path).push(payload);
  });
}

async function pollChatBot(){
  const s = await db.ref('settings/bots/chat').get();
  if (!s.exists()) return;
  const b = s.val(); if (!b.enabled) return;
  const mins = Math.max(1, parseInt(b.interval||30,10));
  const city = b.city || 'praha';
  await safePostOnce(`messages/${city}`, {text:b.text||null, photo:b.image||null, by:'__bot__', ts:firebase.database.ServerValue.TIMESTAMP}, mins);
}

async function tickQuotaBot(){
  try{
    const now = Date.now();
    const lims = (await db.ref('limits').get()).val() || {};
    // OWNER lookup (optional)
    let ownerUid = null;
    if (window.OWNER_UID) ownerUid = window.OWNER_UID;
    else {
      const qs = await db.ref('users').orderByChild('email').equalTo(window.ADMIN_EMAIL).get();
      if (qs.exists()) ownerUid = Object.keys(qs.val())[0];
      window.OWNER_UID = ownerUid;
    }
    if (!ownerUid) return;

    for (const uid in lims){
      const q = lims[uid] || {};
      const low = (q.text||0)<=20 || (q.photo||0)<=10;
      if (!low) continue;
      const metaRef = db.ref(`limitsMeta/${uid}`);
      const meta = (await metaRef.get()).val() || {};
      if (meta.lastNotified && (now - meta.lastNotified) < 24*60*60*1000) continue;

      const tid = [ownerUid, uid].sort().join('_');
      await db.ref(`privateMessages/${tid}`).push({text:'У вас мало лімітів. Оформіть підписку у профілі → Оплати.', by:'__bot__', ts:firebase.database.ServerValue.TIMESTAMP});
      await db.ref(`inboxMeta/${uid}/${ownerUid}`).set({ts:firebase.database.ServerValue.TIMESTAMP});
      await db.ref(`inboxMeta/${ownerUid}/${uid}`).set({ts:firebase.database.ServerValue.TIMESTAMP});
      await metaRef.set({lastNotified: now});
    }
  }catch(e){}
}

// Public API for app.js auth handler
window.startOrStopBots = function(isAdmin){
  if (isAdmin){
    if (!botTimer){ botTimer=setInterval(pollChatBot, 15000); pollChatBot(); }
    if (!quotaTimer){ quotaTimer=setInterval(tickQuotaBot, 5*60*1000); tickQuotaBot(); }
  } else {
    if (botTimer){ clearInterval(botTimer); botTimer=null; }
    if (quotaTimer){ clearInterval(quotaTimer); quotaTimer=null; }
  }
};