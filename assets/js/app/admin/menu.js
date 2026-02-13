// Admin/User FAB menu (single entry point)
//
// Requirements:
// - User mode: only user actions (no admin items rendered at all)
// - Admin mode: only admin actions (no user items)
// - Menu re-renders on open and when roles/auth change

(function fabMenuModule(){
  function initFabMenu(){
    const btn  = document.getElementById('fabBtn');
    const menu = document.getElementById('fabMenu');
    if(!btn || !menu) return;

    // Wire only once
    if(menu.dataset.wired === '1') return;
    menu.dataset.wired = '1';

    const close = ()=>{ try{ menu.hidden = true; }catch(e){} };

    const mkBtn = (label, opts={})=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if(opts.id) b.id = opts.id;
      if(opts.className) b.className = opts.className;
      if(opts.title) b.title = opts.title;
      if(typeof opts.onClick === 'function') b.addEventListener('click', opts.onClick);
      return b;
    };

    const isAdmNow = ()=>{
      const me = auth?.currentUser || null;
      try{ if(window.__isAdmin) return true; }catch(e){}
      try{ if(typeof isAdminUser === 'function' && isAdminUser(me)) return true; }catch(e){}
      return false;
    };

    const render = ()=>{
      try{ menu.innerHTML = ''; }catch(e){}

      const me = auth?.currentUser || null;
      const isAdm = isAdmNow();

      // Logged out
      if(!me){
        menu.appendChild(mkBtn('Přihlásit / Registrovat', {
          id:'fabLogin',
          onClick: ()=>{
            close();
            try{ openModalAuth?.('login'); }catch(e){ try{ document.getElementById('modalAuth').hidden=false; }catch(_){} }
          }
        }));

        menu.appendChild(mkBtn('Zavřít', { id:'fabClose', className:'ghost', onClick: close }));
        return;
      }

      // ADMIN MODE (admin-only buttons; no user items rendered)
      if(isAdm){
        menu.appendChild(mkBtn('⚙️ Nastavení botů', {
          id:'fabBots',
          onClick: async ()=>{
            close();
            if(!isAdmNow()) return toast('Jen admin');
            try{ openModal('modalBots'); }catch(e){}
            try{ if(typeof loadBotsModal === 'function') await loadBotsModal(); }catch(e){ console.warn(e); toast('Chyba'); }
          }
        }));

        menu.appendChild(mkBtn('✉️ Zprávy botů', {
          id:'fabBotInbox',
          onClick: async ()=>{
            close();
            if(!isAdmNow()) return toast('Jen admin');
            try{ openModal('modalBotInbox'); }catch(e){}
            try{
              if(typeof window.loadBotInboxModal === 'function') await window.loadBotInboxModal();
              else if(typeof loadBotInboxModal === 'function') await loadBotInboxModal();
            }catch(e){ console.warn(e); toast('Chyba'); }
          }
        }));

        menu.appendChild(mkBtn('🛡️ Admin panel', {
          id:'fabAdminPanel',
          onClick: ()=>{
            close();
            try{ showView('view-admin'); }catch(e){ try{ openAdmin?.(); }catch(_){} }
            try{ window.scrollTo({top:0, behavior:'smooth'}); }catch(e){}
          }
        }));

        menu.appendChild(mkBtn('🔔 Upozornění', {
          id:'fabBellAdmin',
          onClick: ()=>{
            close();
            try{ openModal('modalNotif'); }catch(e){}
            try{ markNotificationsRead?.(); }catch(e){}
          }
        }));

        menu.appendChild(mkBtn('Zavřít', { id:'fabClose', className:'ghost', onClick: close }));
        return;
      }

      // USER MODE
      menu.appendChild(mkBtn('Koupit privilegia', {
        id:'fabPremium',
        onClick: ()=>{
          close();
          try{ openPremiumBot(); }catch(e){ console.warn(e); toast('Privilegia nejsou dostupná'); }
        }
      }));

      menu.appendChild(mkBtn('Napsat administrátorovi', {
        id:'fabDmAdmin',
        onClick: async ()=>{
          close();
          const adminUid = (window.ADMIN_UIDS && window.ADMIN_UIDS[0]) ? window.ADMIN_UIDS[0] : (window.ADMIN_UID || null);
          if(!adminUid) return toast('Admin UID nenastaven');
          try{
            if(typeof startDM === 'function') await startDM(adminUid);
            else { openDMRoom(me.uid, adminUid); showView('view-dm'); }
          }catch(e){ console.warn(e); toast('DM není dostupné'); }
        }
      }));

      menu.appendChild(mkBtn('Upozornění', {
        id:'fabBell',
        onClick: ()=>{
          close();
          try{ openModal('modalNotif'); }catch(e){}
          try{ markNotificationsRead?.(); }catch(e){}
        }
      }));

      menu.appendChild(mkBtn('Zavřít', { id:'fabClose', className:'ghost', onClick: close }));
    };

    // expose for auth-state to refresh menu when roles arrive
    window.renderFabMenu = render;

    const open = ()=>{ try{ render(); }catch(e){} try{ menu.hidden = false; }catch(e){} };
    const toggle = ()=>{ try{ if(menu.hidden) open(); else close(); }catch(e){} };

    btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggle(); });

    // Close when tapping outside
    document.addEventListener('click', (e)=>{
      try{
        if(menu.hidden) return;
        if(btn.contains(e.target)) return;
        if(menu.contains(e.target)) return;
        close();
      }catch(err){}
    }, {capture:true});

    // Initial render (menu is hidden by default)
    try{ render(); }catch(e){}
  }

  window.initFabMenu = initFabMenu;
})();
