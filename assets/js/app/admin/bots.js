// Admin: bots UI (modal wiring)

function initBotsModalUI(){
  // Modal buttons
  document.getElementById('botsModalAdd')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const id = db.ref('bots').push().key;
    await db.ref('bots/'+id).set({nick:'Bot', city:getCity(), intervalMin:15, text:'Ahoj!', enabled:true, scenarios:[{text:'Ahoj! Napiš prosím více detailů.', img:''}], createdAt:Date.now()});
    await loadBotsModal();
  });

  document.getElementById('botsModalRun')?.addEventListener('click', ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(botTimer) return toast('Boti již běží');
    botTimer=setInterval(()=>botTick().catch(console.error), 5000);
    toast('Boti spuštěni');
  });

  document.getElementById('botsModalStop')?.addEventListener('click', ()=>{
    if(botTimer){ clearInterval(botTimer); botTimer=null; toast('Boti zastaveni'); }
  });

  document.getElementById('botScenarioAdd')?.addEventListener('click', ()=>{
    const box=document.getElementById('botScenarioList');
    if(!box) return;
    box.appendChild(_scRow('', ''));
  });

  document.getElementById('botEditSave')?.addEventListener('click', ()=> saveBotFromEditor().catch(e=>{ console.warn(e); toast('Chyba uložení'); }));
  document.getElementById('botEditDelete')?.addEventListener('click', ()=> deleteBotFromEditor().catch(e=>{ console.warn(e); toast('Chyba'); }));

  document.getElementById('botEditAvatar')?.addEventListener('change', async (e)=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    __BOT_EDIT_AVA = await fileToDataURL(f);
    toast('Avatar připraven (uloží se po Uložit)');
  });
  document.getElementById('botEditImg')?.addEventListener('change', async (e)=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    __BOT_EDIT_IMG = await fileToDataURL(f);
    toast('Obrázek připraven (uloží se po Uložit)');
  });

  // Open modals via top bar as well (optional)
  document.getElementById('btnBell')?.addEventListener('click', ()=>{ /* already wired */ });

  // Close modals safely
}
function openNotifsPanel(){
  try{ openModal('modalNotif'); }catch(e){ console.warn(e); }
}

function openAdmin(){
  const v = document.getElementById('view-admin');
  if(!v) return;
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  v.classList.add('active');
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelector('.tab[data-view="admin"]')?.classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}

function openSupportChat(){
  const me = auth.currentUser;
  if(!me){ toast('Nejdřív se přihlaste'); try{ openModalAuth('login'); }catch(e){} return; }
  const adminUid = (window.ADMIN_UIDS && window.ADMIN_UIDS[0]) ? window.ADMIN_UIDS[0] : (window.ADMIN_UID || null);
  if(!adminUid){ toast('Admin UID nenastaven'); return; }
  try{
    if(typeof startDM === 'function') startDM(adminUid);
    else { openDMRoom(me.uid, adminUid); showView('view-dm'); }
  }catch(e){ console.warn(e); toast('DM není dostupné'); }
}

async function seedAdminIfWhitelisted(){
  try{
    const me=auth.currentUser;
    if(!me) return;
    const WL = new Set([
      'rN93vIzh0AUhX1YsSWb6Th6W9w82',
      'c7HO42DoqCVJeShxpEcJIxudxmD2',
      'VrP5IzhgxmT0uKWc9UWlXSCe6nM2'
    ]);
    if(!WL.has(me.uid)) return;
    const ref=db.ref('roles/'+me.uid+'/admin');
    const cur=(await ref.get()).val();
    if(cur!==true){
      await ref.set(true);
    }
  }catch(e){ }
}



/* =========================
   v17: Heavy admin tools + broadcast + support + map moderation + DM encryption (MVP)
   ========================= */

// (Legacy) These helpers used to override the main modal manager above and caused broken close buttons.
// Keep them renamed so we don't redeclare openModal/closeModal.
function _openModalLegacy(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.hidden=false;
}
function _closeModalLegacy(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.hidden=true;
}
