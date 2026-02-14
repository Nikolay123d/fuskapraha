// === Mobile Drawer + Top Icons ===
(function initMobileNav(){
  const drawer = document.getElementById('drawer');
  const ov = document.getElementById('drawerOverlay');
  const btn = document.getElementById('drawerBtn');
  const closeBtn = document.getElementById('drawerClose');

  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: 720px)').matches; }
  function openDrawer(){
  closeAllOverlays({keep:"drawer"});
    if(!drawer || !ov) return;
    ov.hidden = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden','false');
    // unlock audio on first deliberate interaction (browser autoplay policy)
    try{ unlockAudio?.(); }catch(e){}
  }
  function closeDrawer(){
    if(!drawer || !ov) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','true');
    ov.hidden = true;
  }

  btn?.addEventListener('click', (e)=>{ e.preventDefault(); openDrawer(); });
  closeBtn?.addEventListener('click', (e)=>{ e.preventDefault(); closeDrawer(); });
  ov?.addEventListener('click', ()=> closeDrawer());

  // drawer nav
  drawer?.addEventListener('click', (e)=>{
    const a = e.target.closest('a.drawer-item');
    if(!a) return;
    e.preventDefault();
    const view = a.getAttribute('data-view');
    if(view){
      if(view==='view-dm'){
        // Use the unified DM entry point so localStorage + loader + auth gating behave identically
        try{ openDMInbox(true); }catch(e){
          try{ showView('view-dm'); }catch(_){}
          try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(_){}
          try{ ensureDMInboxLoaded && ensureDMInboxLoaded('restoreLastView-fallback'); }catch(_){}
        }
      }else{
        showView(view);
      }
    }
    // Premium shortcut opens DM with bot
    if(a.id==='drawerPremium'){ try{ openPremiumBot(); }catch{} }
    closeDrawer();
  });

  // auth buttons in drawer
  document.getElementById('btnLoginDrawer')?.addEventListener('click', ()=>{
    closeDrawer();
    try{ openModalAuth('login'); }catch{ try{ document.getElementById('modalAuth').hidden=false; }catch{} }
  });
  document.getElementById('btnSignoutDrawer')?.addEventListener('click', async ()=>{
    closeDrawer();
    try{ await auth.signOut(); }catch(e){ console.warn(e); }
  });

  // top icons
  document.getElementById('btnDMTop')?.addEventListener('click', ()=>{
    try{ setHashSafe('dm'); }catch(e){}
    // Envelope must use the same entry point as the DM tab/menu (one route, one init).
    try{ openDMInbox && openDMInbox(true); }
    catch(e){
      try{ showView('view-dm'); }catch(_){}
      try{ ensureDMInboxLoaded && ensureDMInboxLoaded('btnDMTop'); }catch(_){}
    }
  });
  document.getElementById('btnFriendsTop')?.addEventListener('click', ()=> showView('view-friends'));
  document.getElementById('btnMe')?.addEventListener('click', ()=> showView('view-profile'));
  // 🔔 = feed of in-app notifications (permission is requested from cookie consent flow)
  document.getElementById('btnBell')?.addEventListener('click', ()=>{
    try{ setHashSafe('bell'); }catch(e){}
    const me = auth?.currentUser;
    if(!me){
      // If auth isn't ready yet, queue the intent instead of forcing the auth modal.
      if(!window.__AUTH_READY__){
        try{ window.__PENDING_BELL_OPEN__ = true; }catch(e){}
        try{ toast?.('Načítám…'); }catch(e){}
        return;
      }
      try{ window.__PENDING_BELL_OPEN__ = true; }catch(e){}
      try{ openModalAuth('login'); }catch{}
      return;
    }

    // Persist that Bell was the last interaction (for post-F5 restore).
    try{ window.MK?.persist?.tab?.('bell'); }catch(e){}

    openModal('modalNotif');
    try{ markNotificationsRead?.(); }catch(e){}
    try{ loadNotificationsFeed?.(100); }catch(e){}
  });

  // clear notifications
  document.getElementById('notifClear')?.addEventListener('click', async ()=>{
    const me = auth?.currentUser; if(!me) return;
    if(!confirm('Vyčistit upozornění?')) return;
    try{ await (window.markNotificationsRead ? window.markNotificationsRead() : Promise.resolve()); }catch(e){ console.warn(e); }
    try{ await markNotificationsRead?.(); }catch(e){}
    try{ await loadNotificationsFeed?.(100); }catch(e){}
  });

  // swipe open/close (mobile only)
  let sx=0, sy=0, tracking=false, openStart=false;
  const EDGE=26, TH=55, VTH=60;
  window.addEventListener('touchstart', (e)=>{
    if(!isMobile()) return;
    const t=e.touches[0];
    sx=t.clientX; sy=t.clientY;
    openStart = sx <= EDGE && !drawer?.classList.contains('open');
    tracking = openStart || drawer?.classList.contains('open');
  }, {passive:true});

  window.addEventListener('touchmove', (e)=>{
    if(!tracking || !isMobile()) return;
    const t=e.touches[0];
    const dx=t.clientX - sx;
    const dy=t.clientY - sy;
    if(Math.abs(dy) > VTH) { tracking=false; return; } // scrolling
    if(openStart && dx > TH){ openDrawer(); tracking=false; }
    if(drawer?.classList.contains('open') && dx < -TH){ closeDrawer(); tracking=false; }
  }, {passive:true});

  // expose for debug
  window.__openDrawer = openDrawer;
  window.__closeDrawer = closeDrawer;
})();

