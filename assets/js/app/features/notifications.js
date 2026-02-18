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
let __dmReqUnread = 0;
let __notifUnread = 0;
let __friendReqUnread = 0;
let __payUnread = 0;
let __vacUnread = 0;
let __inboxMetaRef = null;
let __inboxMetaCb = null;
let __dmReqRef = null;
let __dmReqCb = null;

function updateTopBadges(){
  // DM badge = only unread threads (inboxMeta).
  // Incoming DM requests are counted in the bell badge (as notifications).
  const dmTotal = (__dmUnread + __dmReqUnread);
  setBadge(document.getElementById('fabDmBadge'), dmTotal);
  // Bell badge = (admin notifications unread) + (friend requests unread)
  // + (incoming DM requests) + (payments/vacancies events unread)
  setBadge(
    document.getElementById('bellBadge') || document.getElementById('notifBadge'),
    (__notifUnread + __friendReqUnread + __dmReqUnread + __payUnread + __vacUnread)
  );
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
  try{ window.MK?.subs?.clear && window.MK.subs.clear('global:payUnread'); }catch(e){}
  try{ window.MK?.subs?.clear && window.MK.subs.clear('global:vacUnread'); }catch(e){}
  try{ if(__notifLastSeenRef && __notifLastSeenCb) __notifLastSeenRef.off('value', __notifLastSeenCb); }catch(e){}
  try{ if(__notifUnreadRef && __notifUnreadCb) __notifUnreadRef.off('value', __notifUnreadCb); }catch(e){}
  __notifLastSeenRef = null;
  __notifLastSeenCb = null;
  __notifUnreadRef = null;
  __notifUnreadCb = null;
  __notifUnread = 0;
  __notifLastSeenTs = 0;
  __payUnread = 0;
  __vacUnread = 0;
  updateTopBadges();
  if(!uid) return;

  // Payments events are part of bell surface (derived from payments/requests)
  try{ watchPaymentsUnread(uid); }catch(e){}

  // Vacancy events from employer friends (derived from vacanciesIndex)
  try{ watchVacanciesUnread(uid); }catch(e){}

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

// Payments badge = events from payments/requests where (decidedAt||ts) > users/{uid}/paymentsLastSeenTs
let __payLastSeenTs = 0;
let __payLastSeenRef = null;
let __payLastSeenCb = null;
let __payUnreadRef = null;
let __payUnreadCb = null;

function watchPaymentsUnread(uid){
  // stop previous
  try{ if(__payLastSeenRef && __payLastSeenCb) __payLastSeenRef.off('value', __payLastSeenCb); }catch(e){}
  try{ if(__payUnreadRef && __payUnreadCb) __payUnreadRef.off('value', __payUnreadCb); }catch(e){}
  __payLastSeenRef=null; __payLastSeenCb=null;
  __payUnreadRef=null; __payUnreadCb=null;
  __payUnread=0;
  __payLastSeenTs=0;
  updateTopBadges();
  if(!uid) return;

  __payLastSeenRef = db.ref('users/'+uid+'/paymentsLastSeenTs');
  __payLastSeenCb = (snap)=>{
    const v = snap.val();
    __payLastSeenTs = (typeof v === 'number' && isFinite(v)) ? v : 0;

    // Re-bind unread query whenever lastSeen changes
    try{ if(__payUnreadRef && __payUnreadCb) __payUnreadRef.off('value', __payUnreadCb); }catch(e){}
    __payUnreadRef = db.ref('payments/requests/'+uid)
      .orderByChild('ts')
      .limitToLast(60);

    __payUnreadCb = (ss)=>{
      const val = ss.val() || {};
      let unread = 0;
      for(const r of Object.values(val)){
        if(!r) continue;
        const t = Number(r.decidedAt || r.ts || 0);
        if(__payLastSeenTs){
          if(t > __payLastSeenTs) unread++;
        }else{
          // If user never opened bell before, only show decisions to avoid constant badge
          if(r.status==='approved' || r.status==='rejected') unread++;
        }
      }
      __payUnread = unread;
      updateTopBadges();
    };
    __payUnreadRef.on('value', __payUnreadCb);
  };
  __payLastSeenRef.on('value', __payLastSeenCb);

  // register unsubscriber
  try{
    const off = ()=>{
      try{ if(__payLastSeenRef && __payLastSeenCb) __payLastSeenRef.off('value', __payLastSeenCb); }catch(e){}
      try{ if(__payUnreadRef && __payUnreadCb) __payUnreadRef.off('value', __payUnreadCb); }catch(e){}
      __payLastSeenRef=null; __payLastSeenCb=null;
      __payUnreadRef=null; __payUnreadCb=null;
    };
    window.MK?.subs?.set && window.MK.subs.set('global:payUnread', off, 'global');
  }catch(e){}
}
window.watchPaymentsUnread = watchPaymentsUnread;

// Vacancies badge (job seekers): events from vacanciesIndex where poster is accepted friend employer
let __vacLastSeenTs = 0;
let __vacLastSeenRef = null;
let __vacLastSeenCb = null;
let __vacFriendsRef = null;
let __vacFriendsCb = null;
let __vacIdxRef = null;
let __vacIdxCb = null;
let __vacFriendsAccepted = new Set();
let __vacIdxCache = {};

function __normRole(role){
  return role==='job' ? 'employer' : (role||'');
}

function __recalcVacUnread(){
  const myRole = __normRole(window.__myPublic?.role);
  // Only seekers need employer vacancies notifications
  if(myRole==='employer'){
    __vacUnread = 0;
    updateTopBadges();
    return;
  }
  const seen = Number(__vacLastSeenTs||0);
  const friends = __vacFriendsAccepted;
  let unread = 0;
  try{
    for(const it of Object.values(__vacIdxCache||{})){
      if(!it) continue;
      const ts = Number(it.ts||0);
      if(!ts || (seen && ts<=seen)) continue;
      const uid = String(it.uid||'');
      if(!uid || !friends.has(uid)) continue;
      const posterRole = __normRole(it.role);
      if(posterRole && posterRole!=='employer') continue;
      unread++;
    }
  }catch(e){}
  __vacUnread = unread;
  updateTopBadges();
}

function watchVacanciesUnread(uid){
  // stop previous
  try{ if(__vacLastSeenRef && __vacLastSeenCb) __vacLastSeenRef.off('value', __vacLastSeenCb); }catch(e){}
  try{ if(__vacFriendsRef && __vacFriendsCb) __vacFriendsRef.off('value', __vacFriendsCb); }catch(e){}
  try{ if(__vacIdxRef && __vacIdxCb) __vacIdxRef.off('value', __vacIdxCb); }catch(e){}
  __vacLastSeenRef=null; __vacLastSeenCb=null;
  __vacFriendsRef=null; __vacFriendsCb=null;
  __vacIdxRef=null; __vacIdxCb=null;
  __vacUnread=0;
  __vacLastSeenTs=0;
  __vacFriendsAccepted = new Set();
  __vacIdxCache = {};
  updateTopBadges();
  if(!uid) return;

  __vacLastSeenRef = db.ref('users/'+uid+'/vacanciesLastSeenTs');
  __vacLastSeenCb = (snap)=>{
    const v = snap.val();
    __vacLastSeenTs = (typeof v === 'number' && isFinite(v)) ? v : 0;
    __recalcVacUnread();
  };
  __vacLastSeenRef.on('value', __vacLastSeenCb);

  __vacFriendsRef = db.ref('friends/'+uid);
  __vacFriendsCb = (snap)=>{
    const v = snap.val()||{};
    const s = new Set();
    try{ for(const k of Object.keys(v)){ if(v[k]==='accepted') s.add(k); } }catch(e){}
    __vacFriendsAccepted = s;
    __recalcVacUnread();
  };
  __vacFriendsRef.on('value', __vacFriendsCb);

  __vacIdxRef = db.ref('vacanciesIndex').orderByChild('ts').limitToLast(120);
  __vacIdxCb = (snap)=>{ __vacIdxCache = snap.val()||{}; __recalcVacUnread(); };
  __vacIdxRef.on('value', __vacIdxCb);

  // register unsubscriber
  try{
    const off = ()=>{
      try{ if(__vacLastSeenRef && __vacLastSeenCb) __vacLastSeenRef.off('value', __vacLastSeenCb); }catch(e){}
      try{ if(__vacFriendsRef && __vacFriendsCb) __vacFriendsRef.off('value', __vacFriendsCb); }catch(e){}
      try{ if(__vacIdxRef && __vacIdxCb) __vacIdxRef.off('value', __vacIdxCb); }catch(e){}
      __vacLastSeenRef=null; __vacLastSeenCb=null;
      __vacFriendsRef=null; __vacFriendsCb=null;
      __vacIdxRef=null; __vacIdxCb=null;
    };
    window.MK?.subs?.set && window.MK.subs.set('global:vacUnread', off, 'global');
  }catch(e){}
}
window.watchVacanciesUnread = watchVacanciesUnread;

async function markNotificationsRead(){
  const me = auth?.currentUser;
  if(!me) return;
  const nowTs = Date.now();
  try{ await db.ref('users/'+me.uid+'/notifLastSeenTs').set(nowTs); }catch(e){ console.warn('markNotificationsRead failed', e); }
  try{ await db.ref('users/'+me.uid+'/paymentsLastSeenTs').set(nowTs); }catch(e){}
  try{ await db.ref('users/'+me.uid+'/vacanciesLastSeenTs').set(nowTs); }catch(e){}
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

  // Slow network hint (non-blocking)
  let slowT = null;
  try{
    slowT = setTimeout(()=>{
      try{
        if(!feed) return;
        const stillLoading = (feed.textContent || '').includes('Načítám');
        if(!stillLoading) return;
        feed.innerHTML = '<div class="mini-hint">Načítání trvá déle… Klepni pro obnovu</div>';
        feed.style.cursor = 'pointer';
        feed.onclick = ()=>{ try{ feed.style.cursor=''; feed.onclick=null; }catch(e){}; try{ loadNotificationsFeed(); }catch(e){} };
      }catch(e){}
    }, 2000);
  }catch(e){}

  try{
    // MVP model:
    // - notifications/* are written by admin only
    // - friend requests + DM unread are derived locally (no server-stored notifications)

    const [frSnap, dmReqSnap, dmSnap, paySnap, notifSnap, friendsSnap, vacSeenSnap, vacIdxSnap] = await Promise.all([
      db.ref('friendRequests/'+me.uid).orderByChild('ts').limitToLast(50).get(),
      db.ref('dmRequests/'+me.uid).orderByChild('ts').limitToLast(50).get().catch(()=>({ val: ()=>({}) })),
      db.ref('inboxMeta/'+me.uid).orderByChild('lastTs').limitToLast(50).get(),
      db.ref('payments/requests/'+me.uid).orderByChild('ts').limitToLast(50).get(),
      db.ref('notifications/'+me.uid).orderByChild('ts').limitToLast(lim).get(),
      db.ref('friends/'+me.uid).get().catch(()=>null),
      db.ref('users/'+me.uid+'/vacanciesLastSeenTs').get().catch(()=>null),
      db.ref('vacanciesIndex').orderByChild('ts').limitToLast(80).get().catch(()=>null)
    ]);

    const items = [];

    // Friend requests (incoming)
    const frVal = frSnap.val() || {};
    for(const [fromUid, req] of Object.entries(frVal)){
      const ts = Number(req?.ts || 0);
      items.push({ kind:'friend', type:'friend', ts, fromUid });
    }

    // DM requests (incoming)
    const dmReqVal = (typeof dmReqSnap?.val === 'function') ? (dmReqSnap.val() || {}) : (dmReqSnap || {});
    for(const [fromUid, req] of Object.entries(dmReqVal||{})){
      const ts = Number(req?.ts || 0);
      const firstText = String(req?.text || req?.firstText || '').slice(0, 240);
      items.push({ kind:'dm_request', type:'dm_request', ts, fromUid, firstText });
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

    // Vacancies from employer friends (safe: derived from public index, no user-written notifications)
    try{
      const myRole = __normRole(window.__myPublic?.role);
      if(myRole!=='employer'){
        const fval = friendsSnap?.val?.() || {};
        const accepted = new Set();
        for(const k of Object.keys(fval)){
          if(fval[k]==='accepted') accepted.add(k);
        }
        const seen = Number(vacSeenSnap?.val?.() || 0);
        const idx = vacIdxSnap?.val?.() || {};
        for(const it of Object.values(idx)){
          if(!it) continue;
          const ts = Number(it.ts||0);
          if(!ts || (seen && ts<=seen)) continue;
          const posterUid = String(it.uid||'');
          if(!posterUid || !accepted.has(posterUid)) continue;
          const posterRole = __normRole(it.role);
          if(posterRole && posterRole!=='employer') continue;
          items.push({
            kind:'vacancy',
            type:'vacancy',
            ts,
            uid: posterUid,
            title: String(it.title||'').slice(0,80),
            city: String(it.city||'').slice(0,40),
            previewText: String(it.previewText||'').slice(0,240),
            fromNick: String(it.fromNick||'').slice(0,60),
            fromAvatar: String(it.fromAvatar||'').slice(0,400),
          });
        }
      }
    }catch(e){}

    // Admin notifications (stored)
    const notifVal = notifSnap.val() || {};
    for(const [id, n] of Object.entries(notifVal)){
      items.push({ id, ...(n||{}), kind:'admin' });
    }

    // Payment requests (my own) – derived client-side events
    const payVal = paySnap.val() || {};
    for(const [id, r] of Object.entries(payVal)){
      const ts = Number(r?.decidedAt || r?.ts || 0);
      items.push({ id, ...(r||{}), kind:'payment', type:'payment', ts });
    }

    items.sort((a,b)=> Number(b.ts||0) - Number(a.ts||0));
    const rows = items.slice(0, lim);
    if(!rows.length){
      feed.innerHTML = '<div class="mini-hint">Žádná upozornění.</div>';
      return;
    }

    // Preload user public profiles for friend requests + DM + vacancy posters
    const needUids = new Set();
    for(const it of rows){
      if(it.kind==='friend' && it.fromUid) needUids.add(it.fromUid);
      if(it.kind==='dm_request' && it.fromUid) needUids.add(it.fromUid);
      if(it.kind==='dm' && it.fromUid) needUids.add(it.fromUid);
      if(it.kind==='vacancy' && it.uid) needUids.add(it.uid);
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
      }else if(n.kind==='dm_request'){
        const u = users[n.fromUid] || {};
        const nick = u.nick || n.fromUid || 'Uživatel';
        title = 'DM žádost';
        bodyText = 'Žádost o DM od: '+nick + (n.firstText ? ('\n' + String(n.firstText)) : '');
      }else if(n.kind==='dm'){
        const u = users[n.fromUid] || {};
        const nick = u.nick || n.fromUid || 'Uživatel';
        title = 'DM';
        const preview = (n.lastText||'').trim();
        bodyText = nick + (preview ? (': ' + preview) : '') + (n.unread ? ('\n(' + n.unread + ' nové)') : '');
      }else if(n.kind==='vacancy'){
        const u = users[n.uid] || {};
        const nick = n.fromNick || u.nick || n.uid || 'Uživatel';
        title = 'Práce';
        const head=[];
        if(n.title) head.push(String(n.title));
        if(n.city) head.push(String(n.city));
        bodyText = 'Nový inzerát od: ' + nick + (head.length ? ('\n' + head.join(' · ')) : '') + (n.previewText ? ('\n' + String(n.previewText)) : '');
      }else if(n.kind==='payment'){
        const st = String(n.status||'pending');
        title = (st==='approved') ? 'Premium schváleno' : (st==='rejected' ? 'Premium zamítnuto' : 'Premium čeká');
        bodyText = 'Plán: ' + String(n.plan||'') + (n.text ? ('\n' + String(n.text)) : '');
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

      // Inline quick-actions for friend/DM requests ("bell" workflow)
      if(n.kind==='friend' || n.kind==='dm_request'){
        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.style.marginTop = '10px';
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.style.flexWrap = 'wrap';

        const btnProfile = document.createElement('button');
        btnProfile.type = 'button';
        btnProfile.className = 'ghost';
        btnProfile.textContent = 'Profil';

        const btnAccept = document.createElement('button');
        btnAccept.type = 'button';
        btnAccept.textContent = 'Přijmout';

        const btnDecline = document.createElement('button');
        btnDecline.type = 'button';
        btnDecline.className = 'danger';
        btnDecline.textContent = 'Odmítnout';

        btnProfile.addEventListener('click', (ev)=>{
          ev.preventDefault(); ev.stopPropagation();
          try{ window.showUserCard?.(String(n.fromUid||'')); }catch(e){}
        });

        btnAccept.addEventListener('click', async (ev)=>{
          ev.preventDefault(); ev.stopPropagation();
          const uid = String(n.fromUid||'');
          if(!uid) return;
          try{
            if(n.kind==='friend'){
              if(typeof window.acceptFriend === 'function'){
                await window.acceptFriend(uid);
              }else{
                toast('Friend: accept není dostupný');
              }
            }else{
              // DM request accept = confirm room atomically via server
              if(typeof window.callFn !== 'function'){
                toast('Server není dostupný');
              }else{
                const r = await window.callFn('dmConfirmAtomic', { peerUid: uid });
                if(r && r.ok){
                  try{ await openDM(uid); }catch(e){}
                }else{
                  toast('DM: žádost už není aktuální');
                }
              }
            }
          }catch(e){
            console.warn(e);
            toast('Chyba');
          }
          try{ await loadNotificationsFeed(lim); }catch(e){}
        });

        btnDecline.addEventListener('click', async (ev)=>{
          ev.preventDefault(); ev.stopPropagation();
          const uid = String(n.fromUid||'');
          if(!uid) return;
          try{
            if(n.kind==='friend'){
              if(typeof window.declineFriend === 'function'){
                await window.declineFriend(uid);
              }else{
                toast('Friend: decline není dostupný');
              }
            }else{
              if(typeof window.callFn !== 'function'){
                toast('Server není dostupný');
              }else{
                const r = await window.callFn('dmRequestDecline', { fromUid: uid });
                if(!(r && r.ok)) toast('DM: žádost už není aktuální');
              }
            }
          }catch(e){
            console.warn(e);
            toast('Chyba');
          }
          try{ await loadNotificationsFeed(lim); }catch(e){}
        });

        actions.appendChild(btnProfile);
        actions.appendChild(btnAccept);
        actions.appendChild(btnDecline);
        bubble.appendChild(actions);
      }

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
  // Notifications are admin-written (MVP бетон). Users mark them as "seen" via lastSeenTs.
  // Admins can optionally clear their own stored notifications.
  try{ if(isAdminUser(me)) await db.ref('notifications/'+me.uid).remove(); }catch(e){}
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

// DM Requests count (incoming requests).
// Counts dmRequests/{uid} children and adds into the DM badge.
function watchDmRequestsUnread(uid){
  try{ window.MK?.subs?.clear && window.MK.subs.clear('global:dmReqUnread'); }catch(e){}

  try{ if(__dmReqRef && __dmReqCb) __dmReqRef.off('value', __dmReqCb); }catch(e){}
  __dmReqRef = null;
  __dmReqCb = null;
  __dmReqUnread = 0;
  updateTopBadges();
  if(!uid) return;

  const q = db.ref('dmRequests/'+uid).orderByChild('ts').limitToLast(200);
  __dmReqRef = q;
  __dmReqCb = (snap)=>{
    const v = snap.val() || {};
    __dmReqUnread = Object.keys(v).length;
    updateTopBadges();
  };
  q.on('value', __dmReqCb);

  try{
    const off = ()=>{ try{ q.off('value', __dmReqCb); }catch(e){} __dmReqRef=null; __dmReqCb=null; };
    window.MK?.subs?.set && window.MK.subs.set('global:dmReqUnread', off, 'global');
  }catch(e){}
}

window.watchDmUnread = watchDmUnread;
window.watchDmRequestsUnread = watchDmRequestsUnread;

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

      if(type==='dm_request' || type==='dmrequest' || type==='dmreq'){
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

      if(type==='vacancy' || type==='job'){
        const uid = n.uid || n.fromUid || n.from || '';
        if(!uid){ toast('Inzerát: chybí uživatel'); return; }
        try{ window.showUserCard?.(String(uid)); }catch(e){ console.warn(e); }
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
