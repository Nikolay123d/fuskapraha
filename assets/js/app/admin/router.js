// Admin panel navigation (cards UX)
(function adminRouterModule(){
  'use strict';

  function _$(id){ return document.getElementById(id); }

  const SECTIONS = {
    premium: 'adminSectionPremium',
    profile: 'adminSectionProfile',
    users: 'adminSectionUsers',
    bots: 'adminSectionBots',
    settings: 'adminSectionSettings',
    logs: 'adminSectionLogs',
    analytics: 'adminSectionAnalytics'
  };

  let _current = '';
  let _logsCursor = null; // ts cursor
  let _logsBusy = false;

  function _isAdmin(){
    return !!(window.__isAdmin || window.__isMod);
  }

  function _hideAllSections(){
    Object.values(SECTIONS).forEach((id)=>{
      const el=_$(id);
      if(el) el.style.display='none';
    });
  }

  function _showHome(){
    _current='';
    _hideAllSections();
    const home=_$('adminHome');
    const back=_$('adminBackHome');
    if(home) home.style.display='block';
    if(back) back.style.display='none';
  }

  function _showSection(name){
    _current=name;
    const home=_$('adminHome');
    const back=_$('adminBackHome');
    if(home) home.style.display='none';
    if(back) back.style.display='inline-flex';

    _hideAllSections();
    const id=SECTIONS[name];
    const el=_$(id);
    if(el) el.style.display='block';

    // Lazy loaders
    if(name==='premium' || name==='profile'){
      try{ window.loadAdminRequests && loadAdminRequests(); }catch(e){}
    }
    if(name==='bots'){
      // nothing auto-load; bots modal loads itself
      try{ window.loadBotProfiles && loadBotProfiles(); }catch(e){}
    }
    if(name==='settings'){
      try{ window.initAdminSettings && initAdminSettings(); }catch(e){}
    }
    if(name==='logs'){
      _loadAuditLogs(true);
    }
    if(name==='analytics'){
      try{ window.loadAdminAnalytics && loadAdminAnalytics(); }catch(e){}
    }

    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(e){}
  }

  function enterAdminView(){
    const no=_$('adminNoAccess');
    if(!_isAdmin()){
      if(no) no.style.display='block';
      const home=_$('adminHome');
      if(home) home.style.display='none';
      _hideAllSections();
      return;
    }
    if(no) no.style.display='none';

    initAdminPanelUX();
    _showHome();
  }
  window.enterAdminView = enterAdminView;

  function _wireBackButtons(){
    const backHome=_$('adminBackHome');
    if(backHome) backHome.onclick = ()=>_showHome();

    document.querySelectorAll('[data-admin-back]').forEach((b)=>{
      b.onclick = ()=>_showHome();
    });
  }

  function _wireTiles(){
    document.querySelectorAll('[data-admin-open]').forEach((btn)=>{
      btn.onclick = ()=>{
        const sec = btn.getAttribute('data-admin-open');
        if(sec && SECTIONS[sec]) _showSection(sec);
      };
    });
  }

  function _wireEntryButtons(){
    // Users modal
    const btnUsers=_$('adminUsersBtn');
    const btnCompl=_$('adminComplaintsBtn');
    const btnBroadcast=_$('adminBroadcastBtn');
    const btnMap=_$('adminMapPointsBtn');

    if(btnUsers) btnUsers.onclick = ()=>{
      try{ window._adminUsersMode='users'; openModal('adminUsersModal'); adminLoadUsers(); }catch(e){}
    };
    if(btnCompl) btnCompl.onclick = ()=>{
      try{ window._adminUsersMode='complaints'; openModal('adminUsersModal'); adminLoadUsers(); }catch(e){}
    };
    if(btnBroadcast) btnBroadcast.onclick = ()=>{
      try{ openModal('adminBroadcastModal'); }catch(e){}
    };
    if(btnMap) btnMap.onclick = ()=>{
      try{ openModal('adminMapPointsModal'); window.loadMapPoints && loadMapPoints(); }catch(e){}
    };

    // Logs
    const reload=_$('adminLogsReload');
    const more=_$('adminLogsMore');
    if(reload) reload.onclick = ()=>_loadAuditLogs(true);
    if(more) more.onclick = ()=>_loadAuditLogs(false);

    // Analytics
    const aReload=_$('adminAnalyticsReload');
    if(aReload) aReload.onclick = ()=>{ try{ window.loadAdminAnalytics && loadAdminAnalytics(); }catch(e){} };
  }

  function _setLogsMini(show, text){
    const box=_$('adminLogsMiniLoad');
    if(!box) return;
    box.style.display = show ? 'flex' : 'none';
    if(text){
      const t=_$('adminLogsMiniText');
      if(t) t.textContent=text;
    }
  }

  function _renderAuditRow(id, a){
    const div=document.createElement('div');
    div.className='card';
    div.style.padding='10px 12px';
    div.style.margin='8px 0';

    const ts=Number(a && a.ts || 0);
    const when = ts ? new Date(ts).toLocaleString() : '';
    const actor = (a && a.actorUid) ? String(a.actorUid) : '';
    const action = (a && a.action) ? String(a.action) : '';
    const target = (a && a.target) ? String(a.target) : '';
    const meta = (a && a.meta) ? String(a.meta) : '';

    div.innerHTML = `
      <div class="row" style="align-items:center">
        <b>${esc(action)}</b>
        <span class="spacer"></span>
        <span class="muted">${esc(when)}</span>
      </div>
      <div class="muted" style="margin-top:6px">actor: <code>${esc(actor)}</code></div>
      <div class="muted">target: <code>${esc(target)}</code></div>
      ${meta ? `<div class="muted" style="margin-top:6px;white-space:pre-wrap">${esc(meta)}</div>` : ''}
    `;
    return div;
  }

  async function _loadAuditLogs(reset){
    if(!_isAdmin()) return;
    if(_logsBusy) return;
    _logsBusy=true;

    try{
      const list=_$('adminAuditList');
      if(!list) return;

      _setLogsMini(true, 'Načítám logy…');

      let q = db.ref('auditLogs').orderByChild('ts');
      if(reset){
        list.innerHTML='';
        _logsCursor=null;
      }
      if(_logsCursor){
        q = q.endAt(_logsCursor-1);
      }
      q = q.limitToLast(50);

      const snap = await q.get();
      const val = snap.val() || {};

      const rows = Object.entries(val)
        .map(([id,a])=>({id,a}))
        .sort((x,y)=>Number((y.a||{}).ts||0)-Number((x.a||{}).ts||0));

      if(!rows.length){
        if(reset){
          const m=document.createElement('div');
          m.className='muted';
          m.textContent='Žádné logy.';
          list.appendChild(m);
        }
        _setLogsMini(false);
        return;
      }

      // Update cursor (oldest ts in this batch)
      _logsCursor = Number((rows[rows.length-1].a||{}).ts||_logsCursor||0);

      const frag=document.createDocumentFragment();
      for(const r of rows){
        frag.appendChild(_renderAuditRow(r.id, r.a));
      }
      list.appendChild(frag);

      _setLogsMini(false);

    }catch(e){
      console.warn(e);
      try{ toast(e && e.code ? e.code : 'Chyba logů'); }catch(_){}
      _setLogsMini(false);
    }finally{
      _logsBusy=false;
    }
  }

  function initAdminPanelUX(){
    if(window.__adminUXWired_v2) return;
    window.__adminUXWired_v2 = true;

    _wireBackButtons();
    _wireTiles();
    _wireEntryButtons();
  }

  window.initAdminPanelUX = initAdminPanelUX;

})();
