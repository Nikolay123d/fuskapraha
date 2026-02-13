// === Top bar (avatar + plan + admin badge) ===
// Single source of truth:
//   - usersPublic/{uid}: nick, avatar, plan, planUntil
//   - roles/{uid}: admin, moderator
// Subscriptions are GLOBAL (must not be cleared on tab switch).

(function(){
  'use strict';
  if(window.__MK_TOPBAR_INSTALLED__) return;
  window.__MK_TOPBAR_INSTALLED__ = true;

  const db = firebase.database();

  let _profRef=null, _profCb=null;
  let _rolesRef=null, _rolesCb=null;
  let _profile=null, _roles=null;

  function _normPlan(plan, planUntil){
    let p = String(plan||'').trim().toLowerCase();
    if(p==='premium+' || p==='premiumplus+' || p==='plus') p='premiumplus';
    if(!p) p='free';
    const until = Number(planUntil||0);
    // planUntil=0 => no expiry for paid plans (legacy)
    if(p!=='free' && until>0 && Date.now()>until) return 'free';
    return p;
  }

  function _planLabel(p){
    p = String(p||'').toLowerCase();
    if(p==='vip') return 'VIP';
    if(p==='premiumplus') return 'P+';
    if(p==='premium') return 'P';
    return '';
  }

    function _normAvatar(url){
    let u = String(url||'').trim();
    if(!u) return window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg';
    // Legacy paths support
    if(u.startsWith('./img/')) u = 'assets/'+u.slice(2);
    else if(u.startsWith('img/')) u = 'assets/'+u;
    else if(u.startsWith('/img/')) u = 'assets'+u;
    else if(u.startsWith('./assets/')) u = u.slice(2);
    return u;
  }

function renderTopBar(profile, roles){
    profile = profile || {};
    roles = roles || {};
    const ava = _normAvatar(profile.avatar);
    const nick = profile.nick || profile.name || 'Uživatel';

    // Avatar
    try{
      const img = document.getElementById('meMiniAva');
      if(img){ img.onerror = ()=>{ try{ img.src = window.DEFAULT_AVATAR || 'assets/img/default-avatar.svg'; }catch(e){} }; img.src = ava; }
    }catch(e){}

    // Title / tooltip
    try{
      const btn = document.getElementById('btnMe');
      if(btn) btn.title = nick;
    }catch(e){}

    // Admin badge
    const isAdmin = (roles && roles.admin === true) || false;
    try{
      const el = document.getElementById('meMiniAdmin');
      if(el){
        el.style.display = isAdmin ? 'flex' : 'none';
      }
    }catch(e){}

    // Plan badge
    const plan = _normPlan(profile.plan, profile.planUntil);
    const label = _planLabel(plan);
    try{
      const el = document.getElementById('meMiniPlan');
      if(el){
        if(label){
          el.textContent = label;
          el.style.display = 'flex';
        }else{
          el.textContent = '';
          el.style.display = 'none';
        }
      }
    }catch(e){}

    // Keep profile header in sync (optional)
    try{
      const adminBadge = document.getElementById('myAdmin');
      if(adminBadge) adminBadge.style.display = isAdmin ? 'inline-flex' : 'none';
    }catch(e){}
  }

  function watchTopBar(uid){
    // detach old
    try{ if(_profRef && _profCb) _profRef.off('value', _profCb); }catch(e){}
    try{ if(_rolesRef && _rolesCb) _rolesRef.off('value', _rolesCb); }catch(e){}
    _profRef=_rolesRef=null; _profCb=_rolesCb=null;
    _profile=null; _roles=null;

    // reset
    try{ renderTopBar({}, {}); }catch(e){}

    if(!uid) return;

    // usersPublic
    try{
      _profRef = db.ref('usersPublic/'+uid);
      _profCb = (snap)=>{
        _profile = snap.val() || {};
        renderTopBar(_profile, _roles||{});
      };
      _profRef.on('value', _profCb);
      try{ window.MK && window.MK.subs && window.MK.subs.add(()=>{ try{ _profRef.off('value', _profCb); }catch(e){} }, {scope:'global', key:'topbar:profile'}); }catch(e){}
    }catch(e){}

    // roles
    try{
      _rolesRef = db.ref('roles/'+uid);
      _rolesCb = (snap)=>{
        _roles = snap.val() || {};
        renderTopBar(_profile||{}, _roles);
      };
      _rolesRef.on('value', _rolesCb);
      try{ window.MK && window.MK.subs && window.MK.subs.add(()=>{ try{ _rolesRef.off('value', _rolesCb); }catch(e){} }, {scope:'global', key:'topbar:roles'}); }catch(e){}
    }catch(e){}
  }

  // expose
  window.renderTopBar = renderTopBar;
  window.watchTopBar = watchTopBar;

})();
