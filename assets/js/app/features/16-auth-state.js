// === Auth state (single point of truth) ===
// Goals (v32):
//  - Resolve MK.authReady exactly once after redirect handling.
//  - Keep listeners lazy (no tab data listeners started here).
//  - Start only small GLOBAL watchers (badges).

// --- Admin role watcher (RTDB: /roles/{uid}/admin) ---
let _roleRef = null;
let _roleHandler = null;

// Admin detection priority:
// 1) RTDB role flag: /roles/{uid}/admin === true
// 2) Local hard list (ADMIN_UIDS)
// 2) Local hard list (ADMIN_UIDS)
function _adminByLists(user){
  if(!user) return false;
  const uidOk = Array.isArray(window.ADMIN_UIDS) && window.ADMIN_UIDS.includes(user.uid);
  return !!uidOk;
}

function _setAdminUI(is, user){
  window.__isAdmin = !!is;
  try{ document.body.classList.toggle('is-admin', !!is); }catch{}
  try{ console.log('ADMIN =', !!is, 'UID =', user?user.uid:null, 'EMAIL =', user?user.email:null); }catch{}
}

function watchAdminRole(user){
  // detach previous listener
  try{ if(_roleRef && _roleHandler) _roleRef.off('value', _roleHandler); }catch{}
  _roleRef = null;
  _roleHandler = null;

  if(!user){
    _setAdminUI(false, null);
    return;
  }

  // immediate optimistic state from lists
  const listIsAdmin = _adminByLists(user);
  _setAdminUI(listIsAdmin, user);

  // role-based override (preferred)
  try{
    _roleRef = db.ref('roles/'+user.uid+'/admin');
    _roleHandler = (snap)=>{
      const roleIsAdmin = (snap.val() === true);
      _setAdminUI(roleIsAdmin || listIsAdmin, user);
    };
    _roleRef.on('value', _roleHandler);
  }catch(e){
    // keep list-based admin if /roles cannot be read
  }
}

// A small helper to unify "admin" checks in rules + UI.
function isAdminRulesUser(user){
  try{ return isAdminUser(user); }catch(e){ return false; }
}

// ---- Main auth listener ----
auth.onAuthStateChanged(async (u)=>{
  // 1) Make sure redirect result is processed exactly once before we mark auth-ready.
  try{ await (window.__AUTH_REDIRECT_PROMISE__ || Promise.resolve()); }catch(e){}

  // 2) Publish auth state (global)
  try{ window.__AUTH_USER__ = u || null; }catch{}
  try{ window.__AUTH_READY__ = true; }catch{}
  try{ if(window.MK && typeof window.MK.authSetUser==='function') window.MK.authSetUser(u); }catch{}

  // 3) Always stop any tab-scoped listeners from previous user.
  try{ window.unsubscribeAll && window.unsubscribeAll(); }catch{}

  // 4) Global UI for both states
  watchAdminRole(u);

  if(u){
    // Ensure usersPublic exists + normalized fields.
    try{ await ensureUserPublic(u); }catch{}
    try{ await ensureMyPublic(u); }catch{}

    // Verify window gate (existing logic)
    try{ await enforceVerifyWindow(u); }catch{}

    // Presence + me profile
    try{ setPresence(u); }catch{}
    try{ await refreshMe(); }catch{}

    // Top bar (global)
    try{ if(typeof watchTopBar==='function') watchTopBar(u.uid); }catch(e){}

    // Start GLOBAL badge watchers (scope: global). These are small and do not depend on active tab.
    try{ watchDmUnread && watchDmUnread(u.uid); }catch{}
    try{ if(typeof watchFriendRequestsBadge==='function') watchFriendRequestsBadge(u.uid); }catch{}
    try{ if(typeof watchNotificationsBadge==='function') watchNotificationsBadge(u.uid); }catch{}
    try{ if(typeof watchMyPlan==='function') watchMyPlan(u.uid); }catch{}

    // Admin quick tools
    try{ if(isAdminRulesUser(u)) wireAdminQuickCams(); }catch{}

  }else{
    // Logged out: clear badges + UI
    try{ watchDmUnread && watchDmUnread(null); }catch{}
    try{ if(typeof watchFriendRequestsBadge==='function') watchFriendRequestsBadge(null); }catch{}
    try{ if(typeof watchNotificationsBadge==='function') watchNotificationsBadge(null); }catch{}
    try{ if(typeof watchMyPlan==='function') watchMyPlan(null); }catch{}
    try{ if(typeof watchTopBar==='function') watchTopBar(null); }catch(e){}

    try{ $('#profileEmail').textContent = 'E-mail: —'; }catch{}
    try{ $('#myName').textContent = 'Uživatel'; }catch{}
    try{ $('#myAvatar').src = window.DEFAULT_AVATAR; }catch{}
  }
});
