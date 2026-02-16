// Admin panel router: home tiles + section tabs + lazy loading.

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

// --- Tabs ---

window.__ADMIN_TAB__ = window.__ADMIN_TAB__ || 'home';

function _adminSetBackVisible(v){
  const b=document.getElementById('adminBackBtn');
  if(!b) return;
  b.style.display = v ? '' : 'none';
}

function _adminShowHome(){
  window.__ADMIN_TAB__='home';
  document.getElementById('adminHome')?.removeAttribute('hidden');
  document.querySelectorAll('#view-admin .admin-tab').forEach(el=> el.hidden=true);
  _adminSetBackVisible(false);
  // Clear admin-only subscriptions from previous section
  try{ MK?.subs?.clearScope?.('admin'); }catch(_){ }
}

async function openAdminTab(tab){
  if(!tab || tab==='home'){
    _adminShowHome();
    return;
  }
  if(!window.__isAdmin){
    toast('Admin only');
    return;
  }

  window.__ADMIN_TAB__=tab;
  document.getElementById('adminHome')?.setAttribute('hidden','');
  document.querySelectorAll('#view-admin .admin-tab').forEach(el=>{
    el.hidden = (el.dataset.adminTab !== tab);
  });
  _adminSetBackVisible(true);

  // Clear previous section listeners
  try{ MK?.subs?.clearScope?.('admin'); }catch(_){ }

  // Lazy loads
  if(tab==='profile'){
    try{ await window.loadAdminRequests?.(); }catch(e){ console.warn(e); }
  }
  if(tab==='premium'){
    try{ await window.loadAdminRequests?.(); }catch(e){ console.warn(e); }
  }
  if(tab==='logs'){
    try{ await adminAuditReload(); }catch(e){ console.warn(e); }
  }
}

window.openAdminTab = openAdminTab;

window.enterAdminView = function(){
  // Default when opening admin view
  _adminShowHome();
};

// --- Audit logs (viewer) ---

let __adminAuditOldestTs = null;
let __adminAuditSeen = new Set();
let __adminAuditLiveOn = false;

function _adminAuditRenderItem(id, v){
  const wrap=document.createElement('div');
  wrap.className='item';

  const ts = (v && typeof v.ts==='number') ? new Date(v.ts).toLocaleString() : '';
  const actor = v?.actorUid || '';
  const action = v?.action || '';
  const target = v?.target || '';
  const meta = v?.meta || '';

  const top=document.createElement('div');
  top.className='row';
  top.style.justifyContent='space-between';

  const left=document.createElement('div');
  left.innerHTML = `<b>${esc(action)}</b> <span class="muted">${esc(target)}</span>`;

  const right=document.createElement('div');
  right.className='muted';
  right.textContent = ts;

  top.appendChild(left);
  top.appendChild(right);

  const sub=document.createElement('div');
  sub.className='muted';
  sub.textContent = actor + (meta ? (' • ' + meta) : '');

  wrap.appendChild(top);
  wrap.appendChild(sub);

  return wrap;
}

async function adminAuditLoadMore(prepend){
  const feed=document.getElementById('adminAuditFeed');
  const empty=document.getElementById('adminAuditEmpty');
  const hint=document.getElementById('adminAuditHint');
  if(!feed) return;

  const LIM=60;
  let q=db.ref('auditLogs').orderByChild('ts');
  if(__adminAuditOldestTs!=null) q=q.endAt(__adminAuditOldestTs-1);
  q=q.limitToLast(LIM);

  const snap=await q.get();
  if(!snap.exists()){
    if(empty) empty.style.display = feed.children.length ? 'none' : '';
    return;
  }

  const items=[];
  snap.forEach(ch=>{
    const id=ch.key;
    const v=ch.val();
    if(__adminAuditSeen.has(id)) return;
    __adminAuditSeen.add(id);
    items.push([id,v]);
    if(v && typeof v.ts==='number'){
      __adminAuditOldestTs = (__adminAuditOldestTs==null) ? v.ts : Math.min(__adminAuditOldestTs, v.ts);
    }
  });
  items.sort((a,b)=>(a[1]?.ts||0)-(b[1]?.ts||0));

  const frag=document.createDocumentFragment();
  items.forEach(([id,v])=> frag.appendChild(_adminAuditRenderItem(id,v)));

  if(prepend && feed.firstChild) feed.prepend(frag);
  else feed.appendChild(frag);

  if(empty) empty.style.display = feed.children.length ? 'none' : '';
  if(hint) hint.textContent = __adminAuditOldestTs ? ('Najstarší: ' + new Date(__adminAuditOldestTs).toLocaleString()) : '';
}

function adminAuditStartLive(){
  if(__adminAuditLiveOn) return;
  __adminAuditLiveOn = true;
  const ref=db.ref('auditLogs').orderByChild('ts').limitToLast(20);
  const handler=(snap)=>{
    const id=snap.key;
    const v=snap.val();
    if(__adminAuditSeen.has(id)) return;
    __adminAuditSeen.add(id);
    const feed=document.getElementById('adminAuditFeed');
    if(!feed) return;
    feed.appendChild(_adminAuditRenderItem(id,v));
  };
  ref.on('child_added', handler);
  try{ MK?.subs?.set?.('admin:auditLive', ()=>ref.off('child_added', handler), 'admin'); }catch(_){ }
}

async function adminAuditReload(){
  const feed=document.getElementById('adminAuditFeed');
  if(feed) feed.innerHTML='';
  __adminAuditOldestTs = null;
  __adminAuditSeen = new Set();
  __adminAuditLiveOn = false;

  await adminAuditLoadMore(false);
  adminAuditStartLive();
}

window.adminAuditReload = adminAuditReload;

// --- Init wiring ---

function initAdminPanelUX(){
  const view=document.getElementById('view-admin');
  if(!view) return;

  // Home tile navigation
  view.querySelectorAll('#adminHome .admin-tile').forEach(btn=>{
    if(btn.dataset.wired==='1') return;
    btn.dataset.wired='1';
    btn.addEventListener('click', ()=> openAdminTab(btn.dataset.adminTab));
  });

  // Back button
  const back=document.getElementById('adminBackBtn');
  if(back && back.dataset.wired!=='1'){
    back.dataset.wired='1';
    back.addEventListener('click', ()=> openAdminTab('home'));
  }

  // Audit controls
  document.getElementById('adminAuditReload')?.addEventListener('click', ()=> adminAuditReload());
  document.getElementById('adminAuditMore')?.addEventListener('click', ()=> adminAuditLoadMore(true));

  // Default state
  _adminShowHome();
}

