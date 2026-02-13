// ==== NOTIFICATIONS (Badge + Feed) ====
// This module purposefully contains ONLY:
//   - top badges (DM + Bell)
//   - notifications feed rendering for the bell modal
// Any routing/click actions live in features/notifications.js

function setBadge(el, n){
  if(!el) return;
  const v = Number(n||0);
  el.textContent = v > 99 ? '99+' : String(v);
  el.hidden = !(v > 0);
}

let __dmUnread = 0;
let __notifUnread = 0;
let __friendReqUnread = 0;
let __inboxMetaRef = null;
let __inboxMetaCb = null;

function updateTopBadges(){
  setBadge(document.getElementById('dmBadge'), __dmUnread);
  // Bell badge = (admin notifications unread) + (friend requests unread)
  setBadge(document.getElementById('bellBadge') || document.getElementById('notifBadge'), (__notifUnread + __friendReqUnread));
}
window.updateTopBadges = updateTopBadges;

// Friends module updates this via setter (keeps this file independent from friends domain)
window.__mkSetFriendReqUnread = (n)=>{
  __friendReqUnread = Number(n||0);
  updateTopBadges();
};

// Bell badge = unread notifications where ts > users/{uid}/notifLastSeenTs
let __notifLastSeenTs = 0;
let __notifLastSeenRef = null;
let __notifLastSeenCb = null;
let __notifUnreadRef = null;
let __notifUnreadCb = null;

function watchNotificationsUnread(uid){
  try{ if(__notifLastSeenRef && __notifLastSeenCb) __notifLastSeenRef.off('value', __notifLastSeenCb); }catch(e){}
  try{ if(__notifUnreadRef && __notifUnreadCb) __notifUnreadRef.off('value', __notifUnreadCb); }catch(e){}
  __notifLastSeenRef = null;
  __notifLastSeenCb = null;
  __notifUnreadRef = null;
  __notifUnreadCb = null;
  __notifUnread = 0;
  __notifLastSeenTs = 0;
  updateTopBadges();
  if(!uid) return;

  __notifLastSeenRef = db.ref('users/'+uid+'/notifLastSeenTs');
  __notifLastSeenCb = (snap)=>{
    const v = snap.val();
    __notifLastSeenTs = (typeof v === 'number' && isFinite(v)) ? v : 0;

    // Re-bind unread query whenever lastSeen changes
    try{ if(__notifUnreadRef && __notifUnreadCb) __notifUnreadRef.off('value', __notifUnreadCb); }catch(e){}
    __notifUnreadRef = db.ref('notifications/'+uid)
      .orderByChild('ts')
      .startAt(__notifLastSeenTs + 1)
      .limitToLast(200);

    __notifUnreadCb = (ss)=>{
      const val = ss.val() || {};
      __notifUnread = Object.keys(val).length;
      updateTopBadges();
    };
    __notifUnreadRef.on('value', __notifUnreadCb);
  };
  __notifLastSeenRef.on('value', __notifLastSeenCb);
}
window.watchNotificationsUnread = watchNotificationsUnread;

async function markNotificationsRead(){
  const me = auth?.currentUser;
  if(!me) return;
  const nowTs = Date.now();
  try{ await db.ref('users/'+me.uid+'/notifLastSeenTs').set(nowTs); }catch(e){ console.warn('markNotificationsRead failed', e); }
}
window.markNotificationsRead = markNotificationsRead;

function __formatNotifTitle(n){
  const t = String(n?.type||'').toLowerCase();
  if(t==='dm') return 'DM';
  if(t==='friend') return 'Přátelé';
  if(t==='vacancy') return 'Nabídka práce';
  if(t.startsWith('premium')) return 'Premium';
  if(t==='payment') return 'Platba';
  if(t==='support') return 'Podpora';
  return 'Upozornění';
}

async function loadNotificationsFeed(limit=100){
  const me = auth?.currentUser;
  const feed = document.getElementById('notifFeed');
  if(!feed) return;
  if(!me){
    feed.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'mini-hint';
    d.textContent = 'Pro zobrazení upozornění se přihlaste.';
    feed.appendChild(d);
    return;
  }

  const lim = Math.max(10, Math.min(200, Number(limit)||100));
  feed.innerHTML = '<div class="mini-hint">Načítám…</div>';
  try{
    // MVP model:
    // - notifications/* are written by admin only
    // - friend requests + DM unread are derived locally (no server-stored notifications)

    const [frSnap, dmSnap, notifSnap] = await Promise.all([
      db.ref('friendRequests/'+me.uid).orderByChild('ts').limitToLast(50).get(),
      db.ref('inboxMeta/'+me.uid).orderByChild('lastTs').limitToLast(50).get(),
      db.ref('notifications/'+me.uid).orderByChild('ts').limitToLast(lim).get()
    ]);

    const items = [];

    // Friend requests (incoming)
    const frVal = frSnap.val() || {};
    for(const [fromUid, req] of Object.entries(frVal)){
      const ts = Number(req?.ts || 0);
      items.push({ kind:'friend', type:'friend', ts, fromUid });
    }

    // DM unread (from inboxMeta)
    const dmVal = dmSnap.val() || {};
    for(const [room, meta] of Object.entries(dmVal)){
      const unread = Number(meta?.unread || 0);
      if(!(unread > 0)) continue;
      const peer = meta?.with || meta?.peer || null;
      const ts = Number(meta?.lastTs || meta?.ts || 0);
      items.push({ kind:'dm', type:'dm', ts, room, fromUid: peer, unread, lastText: String(meta?.lastText || '') });
    }

    // Admin notifications (stored)
    const notifVal = notifSnap.val() || {};
    for(const [id, n] of Object.entries(notifVal)){
      items.push({ id, ...(n||{}), kind:'admin' });
    }

    items.sort((a,b)=> Number(b.ts||0) - Number(a.ts||0));
    const rows = items.slice(0, lim);
    if(!rows.length){
      feed.innerHTML = '<div class="mini-hint">Žádná upozornění.</div>';
      return;
    }

    // Preload user public profiles for friend requests + DM
    const needUids = new Set();
    for(const it of rows){
      if(it.kind==='friend' && it.fromUid) needUids.add(it.fromUid);
      if(it.kind==='dm' && it.fromUid) needUids.add(it.fromUid);
    }
    const users = {};
    await Promise.all(Array.from(needUids).map(async (uid)=>{
      try{
        if(typeof window.getUser === 'function') users[uid] = await window.getUser(uid);
      }catch(e){}
    }));

    feed.innerHTML = '';
    rows.forEach(n=>{
      const row = document.createElement('div');
      row.className = 'msg';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';

      const ts = Number(n.ts||0);
      const timeStr = ts ? new Date(ts).toLocaleString() : '';

      const header = document.createElement('div');
      header.style.fontSize = '12px';
      header.style.opacity = '.7';
      header.style.marginBottom = '4px';

      let title = '';
      let bodyText = '';

      if(n.kind==='friend'){
        const u = users[n.fromUid] || {};
        const nick = u.nick || n.fromUid || 'Uživatel';
        title = 'Přátelé';
        bodyText = 'Žádost o přátelství od: '+nick;
      }else if(n.kind==='dm'){
        const u = users[n.fromUid] || {};
        const nick = u.nick || n.fromUid || 'Uživatel';
        title = 'DM';
        const preview = (n.lastText||'').trim();
        bodyText = nick + (preview ? (': ' + preview) : '') + (n.unread ? ('\n(' + n.unread + ' nové)') : '');
      }else{
        title = __formatNotifTitle(n);
        bodyText = String(n.text || '(bez textu)');
      }

      header.textContent = title + (timeStr ? (' · '+timeStr) : '');
      bubble.appendChild(header);

      const body = document.createElement('div');
      body.style.whiteSpace = 'pre-wrap';
      body.textContent = bodyText;
      bubble.appendChild(body);

      row.appendChild(bubble);
      row.addEventListener('click', ()=>{
        try{ window.handleNotificationClick && window.handleNotificationClick(n); }catch(e){}
      });
      feed.appendChild(row);
    });
  }catch(e){
    console.error(e);
    feed.innerHTML = '<div class="mini-hint">Chyba při načítání upozornění.</div>';
  }
}
window.loadNotificationsFeed = loadNotificationsFeed;

async function clearNotifications(){
  const me = auth?.currentUser;
  if(!me) return;
  try{ await db.ref('notifications/'+me.uid).remove(); }catch(e){ console.error(e); }
  try{ await markNotificationsRead(); }catch(e){}
  try{ await loadNotificationsFeed(100); }catch(e){}
}
window.clearNotifications = clearNotifications;

// DM badge = sum of inboxMeta/{uid}.*.unread
function watchDmUnread(uid){
  try{ if(__inboxMetaRef && __inboxMetaCb) __inboxMetaRef.off('value', __inboxMetaCb); }catch(e){}
  __inboxMetaRef = null;
  __inboxMetaCb = null;
  __dmUnread = 0;
  updateTopBadges();
  if(!uid) return;

  __inboxMetaRef = db.ref('inboxMeta/'+uid);
  __inboxMetaCb = (snap)=>{
    // Unread DM badge should be light-weight: use inboxMeta thread-level timestamps.
    // Count rooms where lastTs > lastReadTs (fallback to unread>0 for legacy).
    let total = 0;
    const v = snap.val();
    if(v){
      for(const k of Object.keys(v)){
        const row = v[k] || {};
        const unreadN = Number(row.unread || 0);
        const lastTs = Number(row.lastTs || row.ts || 0);
        const lastReadTs = Number(row.lastReadTs || 0);
        const isUnread = (unreadN > 0) || (lastTs && lastTs > lastReadTs);
        if(isUnread) total += 1;
      }
    }
    __dmUnread = total;
    updateTopBadges();
  };
  __inboxMetaRef.on('value', __inboxMetaCb);
}
window.watchDmUnread = watchDmUnread;
