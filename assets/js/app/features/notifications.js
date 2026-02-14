// ==== NOTIFICATIONS (Badge + Feed + Click Routing) ====
// Unified module (previously split between 06-notifications.js and notifications.js)

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
  // global watcher – must never be cleared by tab unsubscribe
  try{ window.MK?.subs?.clear && window.MK.subs.clear('global:notifUnread'); }catch(e){}
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

  // register unsubscriber
  try{
    const off = ()=>{
      try{ if(__notifLastSeenRef && __notifLastSeenCb) __notifLastSeenRef.off('value', __notifLastSeenCb); }catch(e){}
      try{ if(__notifUnreadRef && __notifUnreadCb) __notifUnreadRef.off('value', __notifUnreadCb); }catch(e){}
      __notifLastSeenRef = null; __notifLastSeenCb = null;
      __notifUnreadRef = null; __notifUnreadCb = null;
    };
    window.MK?.subs?.set && window.MK.subs.set('global:notifUnread', off, 'global');
  }catch(e){}
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

// DM badge = number of rooms where lastTs > lastReadTs (or legacy unread > 0)
function watchDmUnread(uid){
  // global watcher – must never be cleared by tab unsubscribe
  try{ window.MK?.subs?.clear && window.MK.subs.clear('global:dmUnread'); }catch(e){}

  // stop previous
  try{ if(__inboxMetaRef && __inboxMetaCb) __inboxMetaRef.off('value', __inboxMetaCb); }catch(e){}
  __inboxMetaRef = null;
  __inboxMetaCb = null;
  __dmUnread = 0;
  updateTopBadges();
  if(!uid) return;

  // IMPORTANT: keep this light. Do not re-read the whole inbox on every change.
  // We only track the latest N rooms.
  const q = db.ref('inboxMeta/'+uid).orderByChild('lastTs').limitToLast(200);
  const map = new Map();
  let total = 0;

  const calcUnread = (item)=>{
    const lastTs = Number(item?.lastTs || item?.ts || 0);
    const lastReadTs = Number(item?.lastReadTs || 0);
    if(lastTs && lastReadTs && lastTs > lastReadTs) return true;
    const n = Number(item?.unread || 0);
    return n > 0;
  };

  const setRoom = (roomId, isUnread)=>{
    const prev = map.get(roomId) === true;
    if(prev === isUnread) return;
    map.set(roomId, isUnread);
    total += isUnread ? 1 : -1;
    if(total < 0) total = 0;
    __dmUnread = total;
    updateTopBadges();
  };

  const onAdd = (snap)=>{ setRoom(snap.key, calcUnread(snap.val()||{})); };
  const onChg = (snap)=>{ setRoom(snap.key, calcUnread(snap.val()||{})); };
  const onRem = (snap)=>{
    const prev = map.get(snap.key) === true;
    map.delete(snap.key);
    if(prev){ total = Math.max(0, total-1); }
    __dmUnread = total;
    updateTopBadges();
  };

  q.on('child_added', onAdd);
  q.on('child_changed', onChg);
  q.on('child_removed', onRem);

  // register unsubscriber
  try{
    const off = ()=>{
      try{ q.off('child_added', onAdd); q.off('child_changed', onChg); q.off('child_removed', onRem); }catch(e){}
      __inboxMetaRef = null; __inboxMetaCb = null;
    };
    __inboxMetaRef = q; // store for legacy references
    __inboxMetaCb = null;
    window.MK?.subs?.set && window.MK.subs.set('global:dmUnread', off, 'global');
  }catch(e){}
}
window.watchDmUnread = watchDmUnread;

/*
  Notifications routing module
  - Keeps 06-notifications focused on: badge + feed rendering
  - This file owns click actions / navigation based on notification type
*/

(function notificationsRouteModule(){
  function safeCloseNotifModal(){
    try{ window.closeModal && window.closeModal('modalNotif'); }catch(e){}
    try{ const m=document.getElementById('modalNotif'); if(m) m.hidden = true; }catch(e){}
  }

  async function handleNotificationClick(n){
    try{
      if(!n) return;
      const type = String(n.type||n.kind||'').toLowerCase();

      // close first to avoid "dead" overlay on mobile
      safeCloseNotifModal();

      if(type==='dm'){
        const peer = n.fromUid || n.from || n.peer || n.uid;
        if(!peer){ toast('DM: chybí uživatel'); return; }
        try{ await openDM(peer); }catch(e){ console.warn(e); }
        return;
      }

      if(type==='friend' || type==='friend_request'){
        const from = n.fromUid || n.from || '';
        if(from){ try{ window.__HIGHLIGHT_FRIEND_UID__ = String(from); }catch(e){} }
        try{ showView('view-friends', {forceEnter:true}); }catch(e){ try{ showView('view-friends'); }catch(_e){} }
        return;
      }

      if(type==='premium' || type==='payment' || type==='support'){
        // MVP: premium/payments are handled via dedicated "Privilegia" view.
        try{ showView('view-premium', {forceEnter:true}); }catch(e){ try{ showView('view-premium'); }catch(_e){} }
        return;
      }

      // Fallback
      if(type){ toast('Upozornění: '+type); }
    }catch(e){
      console.warn('handleNotificationClick failed', e);
    }
  }

  // Export as global (used by 06-notifications feed)
  window.handleNotificationClick = handleNotificationClick;
})();
