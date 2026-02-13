// Admin: menu / entry points (FAB menu, quick actions)

function initFabMenu(){
  const btn = document.getElementById('fabBtn');
  const menu = document.getElementById('fabMenu');
  if(!btn || !menu) return;

  // Wire only once
  if(menu.__wiredFab) return;
  menu.__wiredFab = true;

  const close = ()=>{ try{ menu.hidden = true; }catch(e){} };
  const toggle = ()=>{ try{ menu.hidden = !menu.hidden; }catch(e){} };

  const mkBtn = (id, label, cls)=>{
    const b = document.createElement('button');
    if(id) b.id = id;
    b.type = 'button';
    b.textContent = label;
    if(cls) b.className = cls;
    return b;
  };

  // Render menu based on auth + role.
  const render = ()=>{
    try{ menu.innerHTML = ''; }catch(e){}

    const me = auth.currentUser;
    const isAdm = !!window.__isAdmin || (typeof isAdminUser==='function' ? isAdminUser(me) : false);

    // Logged out: only login + close.
    if(!me){
      const login = mkBtn('fabLogin', 'Přihlásit / Registrovat');
      login.addEventListener('click', ()=>{
        close();
        try{ openModalAuth('login'); }catch(e){ try{ document.getElementById('modalAuth').hidden=false; }catch(_){} }
      });
      menu.appendChild(login);

      const c = mkBtn('fabClose', 'Zavřít', 'ghost');
      c.addEventListener('click', close);
      menu.appendChild(c);
      return;
    }

    // ADMIN MODE (no user items)
    if(isAdm){
      const bots = mkBtn('fabBots', 'Nastavení botů');
      bots.addEventListener('click', async ()=>{
        close();
        if(!isAdm) return toast('Jen admin');
        try{ openModal('modalBots'); }catch(e){}
        try{ await loadBotsModal(); }catch(e){ console.warn(e); toast('Chyba'); }
      });
      menu.appendChild(bots);

      const inbox = mkBtn('fabBotInbox', 'Zprávy botů');
      inbox.addEventListener('click', async ()=>{
        close();
        if(!isAdm) return toast('Jen admin');
        try{ openModal('modalBotInbox'); }catch(e){}
        try{
          if(typeof window.loadBotInboxModal === 'function') await window.loadBotInboxModal();
          else if(typeof loadBotInboxModal === 'function') await loadBotInboxModal();
        }catch(e){ console.warn(e); toast('Chyba'); }
      });
      menu.appendChild(inbox);

      const logs = mkBtn('fabAdmin', 'Logy');
      logs.addEventListener('click', ()=>{
        close();
        try{ showView('view-admin'); }catch(e){ try{ openAdmin(); }catch(_){} }
        // Optional: jump to support anchor as a "logs/support" area
        try{
          const el = document.querySelector('#adm_support');
          if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
        }catch(e){}
      });
      menu.appendChild(logs);
    }else{
      // USER MODE
      const prem = mkBtn('fabPremium', 'Koupit privilegia');
      prem.addEventListener('click', ()=>{
        close();
        try{ openPremiumBot(); }catch(e){ console.warn(e); toast('Privilegia nejsou dostupná'); }
      });
      menu.appendChild(prem);

      const dmAdmin = mkBtn('fabDmAdmin', 'Napsat administrátorovi');
      dmAdmin.addEventListener('click', async ()=>{
        close();
        const adminUid = (window.ADMIN_UIDS && window.ADMIN_UIDS[0]) ? window.ADMIN_UIDS[0] : (window.ADMIN_UID || null);
        if(!adminUid) return toast('Admin UID nenastaven');
        try{
          if(typeof startDM === 'function') await startDM(adminUid);
          else { openDMRoom(me.uid, adminUid); showView('view-dm'); }
        }catch(e){ console.warn(e); toast('DM není dostupné'); }
      });
      menu.appendChild(dmAdmin);

      const bell = mkBtn('fabBell', 'Upozornění');
      bell.addEventListener('click', ()=>{
        close();
        try{ openModal('modalNotif'); }catch(e){}
        try{ markNotificationsRead?.(); }catch(e){}
      });
      menu.appendChild(bell);
