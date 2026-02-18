// Admin router (home tiles + inline panels inside Users section)
(function adminRouter(){
  'use strict';

  function $(id){ return document.getElementById(id); }

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

  function _hideAllSections(){
    Object.values(sectionIds).forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
  }

  function _hideInlinePanels(){
    inlinePanels.forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
  }

  function adminShowPanel(id){
    _hideInlinePanels();
    if(!id) return;
    const el=$(id);
    if(el){
      el.style.display='';
      try{ el.scrollIntoView({block:'start', behavior:'smooth'}); }catch(e){}
    }
  }
  window.adminShowPanel = adminShowPanel;

  function showAdminSection(key){
    _hideAllSections();
    _hideInlinePanels();
    const el = $(sectionIds[key] || '');
    if(el) el.style.display='';

    // Lazy init hooks
    try{
      if(key==='settings' && window.initAdminSettings) initAdminSettings();
      if(key==='logs' && window.initAdminLogs) initAdminLogs();
    }catch(e){}
  }

  function showAdminHome(){
    showAdminSection('home');
  }

  function wireTiles(){
    document.querySelectorAll('[data-admin-open]').forEach(tile=>{
      tile.addEventListener('click', ()=>{
        const key = String(tile.getAttribute('data-admin-open')||'').trim();
        if(!key) return;
        showAdminSection(key);
      });
    });
  }

  function wireBackClose(){
    $('adminBack')?.addEventListener('click', showAdminHome);
    $('adminClose')?.addEventListener('click', ()=>{
      try{ window.openView && openView('view-chat'); }catch(e){}
    });
  }

  function wireInlinePanelButtons(){
    const btnUsers = $('adminUsersBtn');
    const btnComplaints = $('adminComplaintsBtn');
    const btnBroadcast = $('adminBroadcastBtn');
    const btnMap = $('adminMapPointsBtn');

    const title = $('adminUsersTitle');

    btnUsers?.addEventListener('click', ()=>{
      window._adminUsersMode = 'users';
      if(title) title.textContent = 'Uživatelé';
      adminShowPanel('adminUsersPanel');
      try{ window.adminLoadUsers && adminLoadUsers(); }catch(e){}
    });

    btnComplaints?.addEventListener('click', ()=>{
      window._adminUsersMode = 'complaints';
      if(title) title.textContent = 'Stížnosti';
      adminShowPanel('adminUsersPanel');
      try{ window.adminLoadUsers && adminLoadUsers(); }catch(e){}
    });

    btnBroadcast?.addEventListener('click', ()=>{
      adminShowPanel('adminBroadcastPanel');
    });

    btnMap?.addEventListener('click', ()=>{
      adminShowPanel('adminMapPointsPanel');
      try{ window.adminLoadMapPoints && adminLoadMapPoints(); }catch(e){}
    });

    // Close buttons
    $('adminUsersClose')?.addEventListener('click', ()=> adminShowPanel(null));
    $('adminBroadcastClose')?.addEventListener('click', ()=> adminShowPanel(null));
    $('adminMapPointsClose')?.addEventListener('click', ()=> adminShowPanel(null));
    $('adminUserCardClose')?.addEventListener('click', ()=> adminShowPanel('adminUsersPanel'));
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    wireTiles();
    wireBackClose();
    wireInlinePanelButtons();
    showAdminHome();
  });

})();
