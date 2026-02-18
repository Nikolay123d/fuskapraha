// Admin router (home navigation + sections + inline panels)
//
// Goals:
// - Only one "window" visible at a time (no stacked/triple windows)
// - Idempotent wiring (no duplicated listeners)
// - Proper cleanup (unsubscribe) when leaving admin / leaving sections

(function adminRouter(){
  'use strict';

  if(window.__MK_ADMIN_ROUTER__) return;
  window.__MK_ADMIN_ROUTER__ = true;

  const $ = (id)=>document.getElementById(id);

  const sectionIds = {
    home: 'adminHome',
    premium: 'adminSectionPremium',
    profile: 'adminSectionProfile',
    users: 'adminSectionUsers',
    bots: 'adminSectionBots',
    settings: 'adminSectionSettings',
    logs: 'adminSectionLogs'
  };

  const inlinePanels = [
    'adminUsersPanel',
    'adminUserCardPanel',
    'adminBroadcastPanel',
    'adminMapPointsPanel'
  ];

  // Moderator is a limited role. Keep one entry-point "Admin Panel" but gate actions/UI.
  const MOD_ALLOWED_SECTIONS = new Set(['home','users','logs']);

  function _isAdmin(){ return !!window.__isAdmin; }
  function _isMod(){ return !!window.__isMod; }
  function _isStaff(){ return !!window.__isStaff; }

  function _applyRoleUiGates(){
    const isAdmin = _isAdmin();
    const isMod = _isMod();

    // Tiles on the home screen
    const hideForMod = ['premium','profile','bots','settings'];
    hideForMod.forEach(key=>{
      document.querySelectorAll(`#view-admin [data-admin-open="${key}"]`).forEach(btn=>{
        btn.style.display = isAdmin ? '' : 'none';
      });
    });

    // Admin-only buttons inside Users panel
    const adminOnlyIds = [
      'adminBroadcastBtn','adminBroadcastPanel',
      'adminUserBan60','adminUserBan24','adminUserUnban',
      'adminUserVip7','adminUserVip30','adminUserVipOff',
      'adminUserMakeMod','adminUserRemoveMod',
      'adminUserClearChat','adminUserClearDM'
    ];
    adminOnlyIds.forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      el.style.display = (isAdmin ? '' : 'none');
    });

    // Email in user card (admin only)
    const email = document.getElementById('adminUserCardEmail');
    if(email) email.style.display = isAdmin ? '' : 'none';

    // If moderator is in the panel, ensure there is at least ONE usable section
    // (Users). Home still stays accessible (tile screen) because it also acts as a hub.
    if(isMod && !isAdmin){
      // ensure we don't show empty tiles layout (only Users+Logs remain)
      // nothing else needed here
    }
  }

  let currentSection = 'home';

  function _hideAllSections(){
    try{
      Object.values(sectionIds).forEach(id=>{
        const el = $(id);
        if(el) el.style.display = 'none';
      });
    }catch(e){}
  }

  function _hideInlinePanels(){
    try{
      inlinePanels.forEach(id=>{
        const el = $(id);
        if(el) el.style.display = 'none';
      });
    }catch(e){}
  }

  function _setBackVisible(on){
    const b = $('adminBackHome');
    if(b) b.style.display = on ? '' : 'none';
  }

  function _stopSection(key){
    try{
      if(key === 'settings'){
        try{ window.stopAdminSettingsLive?.(); }catch(e){}
      }
    }catch(e){}
  }

  function _startSection(key){
    try{
      if(key === 'settings'){
        try{ window.initAdminSettings?.(); }catch(e){}
      }
      if(key === 'logs'){
        try{ window.initAdminLogs?.(); }catch(e){}
      }
    }catch(e){}
  }

  function adminShowPanel(id){
    _hideInlinePanels();
    if(!id) return;
    const el = $(id);
    if(el){
      el.style.display = '';
      try{ el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }catch(e){}
    }
  }
  window.adminShowPanel = adminShowPanel;

  function showAdminSection(key){
    key = String(key || 'home').trim() || 'home';
    if(!sectionIds[key]) key = 'home';

    const isAdmin = _isAdmin();
    const isStaff = _isStaff();

    // Apply role-based UI gating (hide admin-only tiles/actions for moderators).
    _applyRoleUiGates();

    // Access gate (also prevents client-side UI being exposed accidentally)
    const noAccess = $('adminNoAccess');
    if(!isStaff){
      _stopSection(currentSection);
      currentSection = 'home';
      _hideAllSections();
      _hideInlinePanels();
      if(noAccess) noAccess.style.display = '';
      _setBackVisible(false);
      return;
    }
    if(noAccess) noAccess.style.display = 'none';

    // Moderator restrictions: allow only limited sections.
    if(!isAdmin && !MOD_ALLOWED_SECTIONS.has(key)){
      key = 'users';
    }

    // Stop live listeners from previous section
    if(currentSection && currentSection !== key){
      _stopSection(currentSection);
    }

    _hideAllSections();
    _hideInlinePanels();

    const el = $(sectionIds[key]);
    if(el) el.style.display = '';

    currentSection = key;
    _setBackVisible(key !== 'home');

    _startSection(key);
  }

  function showAdminHome(){
    showAdminSection('home');
  }

  function wireTiles(){
    document.querySelectorAll('#view-admin [data-admin-open]').forEach(btn=>{
      if(btn.dataset.wired === '1') return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', ()=>{
        const key = String(btn.getAttribute('data-admin-open') || '').trim();
        if(!key) return;
        showAdminSection(key);
      });
    });
  }

  function wireBackButtons(){
    const topBack = $('adminBackHome');
    if(topBack && topBack.dataset.wired !== '1'){
      topBack.dataset.wired = '1';
      topBack.addEventListener('click', (e)=>{ e.preventDefault(); showAdminHome(); });
    }

    document.querySelectorAll('#view-admin [data-admin-back]').forEach(btn=>{
      if(btn.dataset.wired === '1') return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', (e)=>{ e.preventDefault(); showAdminHome(); });
    });
  }

  function wireInlinePanelButtons(){
    const btnUsers = $('adminUsersBtn');
    const btnComplaints = $('adminComplaintsBtn');
    const btnBroadcast = $('adminBroadcastBtn');
    const btnMap = $('adminMapPointsBtn');

    const title = $('adminUsersTitle');

    const once = (el, fn)=>{
      if(!el || el.dataset.wired === '1') return;
      el.dataset.wired = '1';
      el.addEventListener('click', fn);
    };

    once(btnUsers, ()=>{
      window._adminUsersMode = 'users';
      if(title) title.textContent = 'Uživatelé';
      adminShowPanel('adminUsersPanel');
      try{ window.adminLoadUsers?.(); }catch(e){}
    });

    once(btnComplaints, ()=>{
      window._adminUsersMode = 'complaints';
      if(title) title.textContent = 'Stížnosti';
      adminShowPanel('adminUsersPanel');
      try{ window.adminLoadUsers?.(); }catch(e){}
    });

    once(btnBroadcast, ()=>{
      adminShowPanel('adminBroadcastPanel');
    });

    once(btnMap, ()=>{
      adminShowPanel('adminMapPointsPanel');
      try{ window.adminLoadMapPoints?.(); }catch(e){}
    });

    once($('adminUsersClose'), ()=>adminShowPanel(null));
    once($('adminBroadcastClose'), ()=>adminShowPanel(null));
    once($('adminMapPointsClose'), ()=>adminShowPanel(null));
    once($('adminUserCardClose'), ()=>adminShowPanel('adminUsersPanel'));
  }

  // Called by core routing when switching to view-admin
  window.enterAdminView = function(){
    try{
      // Keep current section, but re-apply access/visibility and restart section live watchers.
      showAdminSection(currentSection || 'home');
    }catch(e){
      showAdminSection('home');
    }
  };

  // Called by core routing when leaving view-admin
  window.__adminUnsub = function(){
    try{ _stopSection(currentSection); }catch(e){}
    try{ currentSection = 'home'; }catch(e){}
    try{ _hideInlinePanels(); }catch(e){}
    try{ _setBackVisible(false); }catch(e){}
  };

  document.addEventListener('DOMContentLoaded', ()=>{
    wireTiles();
    wireBackButtons();
    wireInlinePanelButtons();
    showAdminSection('home');
  });

})();
