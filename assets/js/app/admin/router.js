// Admin: router (entry buttons, quick navigation UX)

function wireAdminEntryButtons(){
  document.getElementById('adminUsersBtn')?.addEventListener('click', ()=>{
    if(!window.__isAdmin) return;
    _adminUsersMode='users';
    openModal('adminUsersModal');
    adminLoadUsers();
  });
  document.getElementById('adminComplaintsBtn')?.addEventListener('click', ()=>{
    if(!window.__isAdmin) return;
    _adminUsersMode='complaints';
    openModal('adminUsersModal');
    adminLoadUsers();
  });
  document.getElementById('adminBroadcastBtn')?.addEventListener('click', ()=>{
    if(!window.__isAdmin) return;
    openModal('adminBroadcastModal');
  });
  document.getElementById('adminMapPointsBtn')?.addEventListener('click', ()=>{
    if(!window.__isAdmin) return;
    openModal('adminMapPointsModal');
    adminLoadMapPoints();
  });

  document.getElementById('adminUsersReload')?.addEventListener('click', adminLoadUsers);
  document.getElementById('adminUsersSearch')?.addEventListener('input', ()=>{
    if(_adminUsersMode==='users') adminLoadUsers();
  });
}

function initAdminPanelUX(){
  const view=document.getElementById('view-admin');
  if(!view) return;

  const cards=Array.from(view.querySelectorAll('.card'));
  // One-time collapse init (keep anchors visible)
  if(!view.dataset.collapseInit){
    view.dataset.collapseInit='1';
    cards.forEach(c=>c.classList.add('collapsed'));
    // keep first card (moderation) open as default
    const first=cards[0];
    if(first) first.classList.remove('collapsed');
  }

  cards.forEach(card=>{
    const header=card.querySelector('header');
    if(!header) return;
    if(header.dataset.wired==='1') return;
    header.dataset.wired='1';
    header.addEventListener('click',(e)=>{
      // do not toggle if user clicks a control inside header
      if(e.target && e.target.closest && e.target.closest('button,input,select,textarea,a,label')) return;
      card.classList.toggle('collapsed');
    });
  });

  // Clicking admin chips expands the relevant card before scrolling (scroll handled elsewhere)
  document.querySelectorAll('.admin-nav .chip[data-admin-jump]').forEach(btn=>{
    if(btn.dataset.wired==='1') return;
    btn.dataset.wired='1';
    btn.addEventListener('click',()=>{
      const sel=btn.dataset.adminJump;
      if(!sel) return;
      const anchor=document.querySelector(sel);
      if(!anchor) return;
      let n=anchor;
      while(n && !(n.classList && n.classList.contains('card'))){
        n=n.nextElementSibling;
      }
      if(n && n.classList) n.classList.remove('collapsed');
    });
  });
}
