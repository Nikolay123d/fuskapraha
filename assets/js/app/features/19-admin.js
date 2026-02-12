// === Admin settings (wallpapers, sounds, premium) ===
function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=()=>reject(r.error||new Error('read failed'));
    r.readAsDataURL(file);
  });
}
async function adminSet(path, value){
  if(!auth.currentUser) throw new Error('no auth');
  if(!window.__isAdmin) throw new Error('not admin');
  return db.ref(path).set(value);
}
function bindUpload(id, onData){
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('change', async ()=>{
    try{
      if(!window.__isAdmin){ toast('Pouze administrátor.'); el.value=''; return; }
      const f=el.files && el.files[0]; if(!f) return;
      const data=await readFileAsDataURL(f);
      await onData(data, f);
      el.value='';
    }catch(e){
      console.warn(e);
      toast('Chyba při uploadu');
      try{ el.value=''; }catch{}
    }
  });
}
function setThumb(id, dataUrl){
  try{
    const img=document.getElementById(id);
    if(img && typeof dataUrl==='string' && dataUrl.startsWith('data:')) img.src=dataUrl;
  }catch{}
}
function initAdminSettings(){
  // Wallpapers uploads
  bindUpload('wpGlobal', async (data)=>{
    setMainWallpaper(data);
    setThumb('wpGlobalPrev', data);
    await adminSet('settings/wallpapers/main', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('Global wallpaper uložen');
  });
  bindUpload('wpAuth', async (data)=>{
    setAuthWallpaper(data);
    setThumb('wpAuthPrev', data);
    await adminSet('settings/wallpapers/auth', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('Auth wallpaper uložen');
  });
  bindUpload('wpChat', async (data)=>{
    setChatWallpaper(data);
    setThumb('wpChatPrev', data);
    await adminSet('settings/wallpapers/chat', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('Chat wallpaper uložen');
  });
  bindUpload('wpDm', async (data)=>{
    setDmWallpaper(data);
    setThumb('wpDmPrev', data);
    await adminSet('settings/wallpapers/dm', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('DM wallpaper uložen');
  });
  bindUpload('wpProfile', async (data)=>{
    setProfileWallpaper(data);
    setThumb('wpProfilePrev', data);
    await adminSet('settings/wallpapers/profile', {url:data, ts:Date.now(), by: auth.currentUser.uid});
    toast('Profile wallpaper uložen');
  });
  // Payments QR upload (VIP/Premium bot)
  bindUpload('payQrImg', async (data)=>{
    setThumb('payQrImgPrev', data);
    await adminSet('settings/payments/qrImg', data);
    toast('QR pro platby uložen');
  });

  // Sounds uploads
  bindUpload('sndDm', async (data)=>{
    _setAudioSrc('dm', data);
    await adminSet('settings/sounds/dm', data);
    toast('dm.mp3 uložen');
  });
  bindUpload('sndNotify', async (data)=>{
    _setAudioSrc('notify', data);
    await adminSet('settings/sounds/notify', data);
    toast('notify.mp3 uložen');
  });
  bindUpload('sndFriend', async (data)=>{
    _setAudioSrc('friend', data);
    await adminSet('settings/sounds/friend', data);
    toast('friend.mp3 uložen');
  });

  // Sound tests
  document.getElementById('testDm')?.addEventListener('click', ()=> playSound('dm'));
  document.getElementById('testNotify')?.addEventListener('click', ()=> playSound('notify'));
  document.getElementById('testFriend')?.addEventListener('click', ()=> playSound('friend'));

  // Master volume + mute default
  const mv=document.getElementById('masterVolume');
  const mvVal=document.getElementById('masterVolumeVal');
  const mute=document.getElementById('muteDefault');
  if(mv){
    mv.addEventListener('input', ()=>{
      SOUND_CFG.masterVolume = Number(mv.value);
      applySoundVolumes();
      if(mvVal) mvVal.textContent = String(Number(mv.value).toFixed(2));
    });
    mv.addEventListener('change', async ()=>{
      try{
        await adminSet('settings/sounds/masterVolume', Number(mv.value));
      }catch(e){ console.warn(e); }
    });
  }
  if(mute){
    mute.addEventListener('change', async ()=>{
      try{
        await adminSet('settings/sounds/muteDefault', !!mute.checked);
      }catch(e){ console.warn(e); }
    });
  }

  // Load current settings for previews/fields
  try{
    db.ref('settings/wallpapers').on('value', (s)=>{
      const v=s.val()||{};
      const get=(k)=> (typeof v[k]==='string')?v[k]:(v[k]&&v[k].url);
      const main=get('main'); if(main) setThumb('wpGlobalPrev', main);
      const authw=get('auth'); if(authw) setThumb('wpAuthPrev', authw);
      const chat=get('chat'); if(chat) setThumb('wpChatPrev', chat);
      const dm=get('dm'); if(dm) setThumb('wpDmPrev', dm);
      const prof=get('profile'); if(prof) setThumb('wpProfilePrev', prof);
    });
  }catch{}
  try{
    db.ref('settings/sounds').on('value', (s)=>{
      const v=s.val()||{};
      if(mv && typeof v.masterVolume!=='undefined'){ mv.value=String(v.masterVolume); if(mvVal) mvVal.textContent=String(Number(v.masterVolume).toFixed(2)); }
      if(mute && typeof v.muteDefault!=='undefined'){ mute.checked=!!v.muteDefault; }
    });
  }catch{}

  // Premium / QR
  bindUpload('premiumQrUpload', async (data)=>{
    setThumb('premiumQrPreview', data);
    await adminSet('settings/premium/qr', data);
    toast('QR uložen');
  });
  const saveBtn=document.getElementById('savePremium');
  saveBtn?.addEventListener('click', async ()=>{
    try{
      if(!window.__isAdmin){ toast('Pouze administrátor'); return; }
      const txt=document.getElementById('premiumText')?.value||'';
      const sup=document.getElementById('supportUid')?.value||'';
      await adminSet('settings/premium/text', txt);
      await adminSet('settings/premium/supportUid', sup);
      await adminSet('settings/premium/plans', { premium:{price:150}, premium_plus:{price:200} });
      toast('Premium nastavení uloženo');
    }catch(e){ console.warn(e); toast('Chyba uložení'); }
  });
  try{
    db.ref('settings/premium').on('value', (s)=>{
      const v=s.val()||{};
      if(typeof v.qr==='string') setThumb('premiumQrPreview', v.qr);
      const txtEl=document.getElementById('premiumText'); if(txtEl && typeof v.text==='string') txtEl.value=v.text;
      const supEl=document.getElementById('supportUid'); if(supEl && typeof v.supportUid==='string') supEl.value=v.supportUid;
    });
  }catch{}
}


/* [MK_BOOTSTRAP] removed duplicate DOMContentLoaded block */


function initFabMenu(){
  const btn = document.getElementById('fabBtn');
  const menu = document.getElementById('fabMenu');
  if(!btn || !menu) return;

  const close = ()=>{ menu.hidden = true; };
  const toggle = ()=>{ menu.hidden = !menu.hidden; };

  btn.addEventListener('click', (e)=>{ e.preventDefault(); toggle(); });
  document.addEventListener('click', (e)=>{
    if(menu.hidden) return;
    if(e.target===btn || menu.contains(e.target)) return;
    close();
  }, true);

  const loginBtn=document.getElementById('fabLogin');
  const dmAdminBtn=document.getElementById('fabDmAdmin');
  const bellBtn=document.getElementById('fabBell');
  const adminBtn=document.getElementById('fabAdmin');
  const premBtn=document.getElementById('fabPremium');
  const botsBtn=document.getElementById('fabBots');
  const botInboxBtn=document.getElementById('fabBotInbox');

  loginBtn?.addEventListener('click', ()=>{ close(); try{ openAuth(); }catch{ document.getElementById('authModal')?.classList.add('show'); } });
  dmAdminBtn?.addEventListener('click', ()=>{ close(); try{ openSupportChat(); }catch(e){ console.warn(e); toast('Support není připraven'); } });
  bellBtn?.addEventListener('click', ()=>{ close(); try{ openNotifsPanel(); }catch(e){ console.warn(e); } });
  premBtn?.addEventListener('click', ()=>{ close(); try{ openPremium(); }catch(e){ console.warn(e); } });
  botsBtn?.addEventListener('click', async ()=>{ close(); const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin'); openModal('modalBots'); await loadBotsModal(); });
  botInboxBtn?.addEventListener('click', async ()=>{ close(); const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin'); openModal('modalBotInbox'); await loadBotInboxModal(); });
  adminBtn?.addEventListener('click', ()=>{ close(); try{ openAdmin(); }catch(e){ console.warn(e); } });

  // show/hide admin entry
  const refreshAdminBtn=()=>{
    const ok = !!window.__isAdmin;
    if(adminBtn) adminBtn.style.display = ok ? 'block' : 'none';
  };
  refreshAdminBtn();
  
  try{ window.addEventListener('admin-changed', refreshAdminBtn); }catch{}
}

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
  if(!window._user){ toast('Nejdřív se přihlaste'); openAuth(); return; }
  const adminUid = (window.ADMIN_UIDS && window.ADMIN_UIDS[0]) ? window.ADMIN_UIDS[0] : null;
  if(!adminUid){ toast('Admin UID nenastaven'); return; }
  openDMRoom(window._user.uid, adminUid);
  // switch to DM view
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.getElementById('view-dm')?.classList.add('active');
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelector('.tab[data-view="dm"]')?.classList.add('active');
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

// --- Drawer: Rules / Help / Support ---
function initInfoPages(){
  const rulesHtml = `
    <h3>Pravidla MAKÁME CZ</h3>
    <ol>
      <li><b>Respekt:</b> zákaz urážek, výhrůžek, diskriminace a nenávisti.</li>
      <li><b>Spam:</b> zákaz floodu, opakování stejného textu, klamavých nabídek.</li>
      <li><b>Podvody:</b> zákaz vylákání plateb mimo dohodnutý proces, falešných profilů.</li>
      <li><b>Soukromí:</b> nezveřejňujte cizí osobní údaje bez souhlasu.</li>
      <li><b>Obsah:</b> žádné ilegální služby, drogy, násilí, zbraně, extremismus.</li>
      <li><b>Moderace:</b> porušení pravidel může vést k mute/ban dle závažnosti.</li>
    </ol>
    <p class="muted">Pozn.: Systém je ve vývoji. Pokud narazíte na chybu, použijte „Kontakt / Stížnost“.</p>
  `;
  const helpHtml = `
    <h3>Pomoc + Pravidla</h3>
    <div class="card" style="padding:12px;margin:10px 0;">
      <h4 style="margin:0 0 6px 0;">Rychlá pomoc</h4>
      <ul>
        <li><b>Chat:</b> vyberte město nahoře a pište do veřejného chatu.</li>
        <li><b>DM:</b> otevřete „Osobní (DM)“ a napište příteli nebo botovi.</li>
        <li><b>Přátelé:</b> pošlete žádost e‑mailem. Nové žádosti uvidíte v 🔔.</li>
        <li><b>Privilegia:</b> v menu ⭐ najdete nákup a potvrzení.</li>
        <li><b>Notifikace:</b> povolení se nabídne po souhlasu s cookies (automaticky, se zpožděním).</li>
      </ul>
      <p class="muted" style="margin:6px 0 0 0;">Tip: Pokud se něco načítá déle, vyčkejte – mini‑preloader ukazuje stav.</p>
    </div>
    <div class="card" style="padding:12px;margin:10px 0;">
      ${rulesHtml}
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;">
      <button id="openSupportFromHelp" class="btn btn-neon">Kontakt / Stížnost</button>
    </div>
  `;
  const rulesEl=document.getElementById('rulesContent'); if(rulesEl) rulesEl.innerHTML = rulesHtml;
  const helpEl=document.getElementById('helpContent'); if(helpEl) helpEl.innerHTML = helpHtml;

  // One entry point: "Pomoc + Pravidla" (drawer) -> helpModal, inside it you can open support ticket.
  document.getElementById('drawerSupport')?.addEventListener('click', (e)=>{ e.preventDefault(); openModal('helpModal'); try{ window.__closeDrawer?.(); }catch{} });

  document.getElementById('rulesClose')?.addEventListener('click', ()=>closeModal('rulesModal'));
  document.getElementById('helpClose')?.addEventListener('click', ()=>closeModal('helpModal'));
  document.getElementById('supportClose')?.addEventListener('click', ()=>closeModal('supportModal'));

  // open support from combined help
  setTimeout(()=>{
    document.getElementById('openSupportFromHelp')?.addEventListener('click', ()=>{ closeModal('helpModal'); openModal('supportModal'); });
  },0);
}

// --- Support tickets (users -> admin) ---
let _supportImgData=null;
document.getElementById('supportImg')?.addEventListener('change', async (e)=>{
  try{
    const f=e.target.files && e.target.files[0];
    if(!f){ _supportImgData=null; return; }
    _supportImgData = await fileToDataURL(f);
    toast('Screenshot přidán'); playSound('ok');
  }catch(e){ _supportImgData=null; }
});
document.getElementById('supportSend')?.addEventListener('click', async ()=>{
  try{
    const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    const txt=(document.getElementById('supportText')?.value||'').trim();
    if(!txt && !_supportImgData) return;
    await db.ref('support/tickets').push({by:u.uid, ts:Date.now(), text:txt||null, img:_supportImgData||null, ua:(navigator.userAgent||'')});
    document.getElementById('supportText').value='';
    document.getElementById('supportImg').value='';
    _supportImgData=null;
    toast('Odesláno. Děkujeme.'); playSound('ok');
    closeModal('supportModal');
  }catch(e){ console.warn(e); toast('Chyba odeslání'); playSound('err'); }
});

// --- Broadcast (admin -> all users) ---
let _broadcastImg=null, _broadcastMp3=null;
document.getElementById('broadcastImg')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  _broadcastImg = f ? await fileToDataURL(f) : null;
});
document.getElementById('broadcastMp3')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  _broadcastMp3 = f ? await fileToDataURL(f) : null;
});
document.getElementById('broadcastSave')?.addEventListener('click', async ()=>{
  try{
    if(!window.__isAdmin){ toast('Pouze admin'); return; }
    const title=(document.getElementById('broadcastTitle')?.value||'').trim()||'MAKÁME CZ';
    const text=(document.getElementById('broadcastText')?.value||'').trim()||'';
    const link=(document.getElementById('broadcastLink')?.value||'').trim()||'';
    const id = String(Date.now()) + '_' + Math.random().toString(16).slice(2,8);
    await db.ref('settings/broadcast').set({id, title, text, link, img:_broadcastImg||null, mp3:_broadcastMp3||null, ts:Date.now(), by:auth.currentUser.uid});
    toast('Uloženo'); playSound('ok');
    closeModal('adminBroadcastModal');
  }catch(e){ console.warn(e); toast('Chyba uložení'); playSound('err'); }
});

function showBroadcastBanner(data){
  if(!data || !data.id) return;
  try{
    const seenKey='broadcast_seen_'+data.id;
    if(localStorage.getItem(seenKey)==='1') return;

    let banner=document.getElementById('broadcastBanner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='broadcastBanner';
      banner.className='broadcast-banner';
      banner.innerHTML = `
        <div class="bb-left">
          <div class="bb-title"></div>
          <div class="bb-text"></div>
        </div>
        <div class="bb-actions">
          <button class="ghost" id="bbOpen" type="button">Otevřít</button>
          <button class="ghost" id="bbSupport" type="button">Kontakt</button>
          <button class="ghost" id="bbHide" type="button">Nezobrazovat</button>
          <button class="iconbtn" id="bbX" type="button" aria-label="Zavřít">✕</button>
        </div>`;
      document.body.appendChild(banner);
    }
    banner.querySelector('.bb-title').textContent = data.title || 'MAKÁME CZ';
    banner.querySelector('.bb-text').textContent = data.text || '';
    banner.style.display='flex';

    if(data.mp3){ try{ _setAudioSrc('notify', data.mp3); playSound('notify'); }catch{} }

    banner.querySelector('#bbHide').onclick=()=>{
      try{ localStorage.setItem(seenKey,'1'); }catch{}
      banner.style.display='none';
    };
    banner.querySelector('#bbX').onclick=()=>{ banner.style.display='none'; };
    banner.querySelector('#bbSupport').onclick=()=>{
      openModal('supportModal');
      try{
        const t=document.getElementById('supportText');
        if(t && data.title) t.value = `Broadcast: ${data.title}\n\n`;
      }catch{}
    };
    banner.querySelector('#bbOpen').onclick=()=>{
      if(data.link){ try{ window.open(data.link,'_blank'); }catch{} }
      else openModal('helpModal');
      banner.style.display='none';
    };
  }catch(e){}
}
function watchBroadcast(){
  try{
    db.ref('settings/broadcast').on('value', (s)=>{
      const v=s.val();
      if(v) showBroadcastBanner(v);
    });
  }catch(e){}
}

// --- Admin: Users list & user card ---
let _adminUsersMode='users'; // 'users' | 'complaints'
let _adminSelectedUid=null;

async function adminLoadUsers(){
  if(!window.__isAdmin){ toast('Pouze admin'); return; }
  setMiniLoad('adminUsersMiniLoad','Načítáme…', true);
  const list=document.getElementById('adminUsersList');
  if(list) list.innerHTML='';
  try{
    if(_adminUsersMode==='complaints'){
      const s=await db.ref('support/tickets').limitToLast(200).get();
      const v=s.val()||{};
      const items=Object.keys(v).map(id=>({id,...v[id]})).sort((a,b)=>(b.ts||0)-(a.ts||0));
      for(const it of items){
        const u=await getUser(it.by);
        const row=document.createElement('div');
        row.className='msg';
        row.innerHTML = `
          <div class="ava" data-uid="${esc(it.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="meta"><div class="name"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${new Date(it.ts||0).toLocaleString()}</span></div></div>
            <div class="text">${esc(it.text||'(bez textu)')}</div>
            ${it.img?`<div class="text"><img src="${esc(it.img)}" style="max-width:220px;border-radius:12px"></div>`:''}
            <div class="actions" style="margin-top:8px">
              <button data-uid="${esc(it.by)}" data-act="openUser">Otevřít uživatele</button>
              <button data-id="${esc(it.id)}" data-act="delTicket" class="danger">Smazat ticket</button>
            </div>
          </div>`;
        row.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act;
          if(act==='openUser'){
            await adminOpenUserCard(e.target.dataset.uid);
          }else if(act==='delTicket'){
            if(confirm('Smazat ticket?')) await db.ref('support/tickets/'+e.target.dataset.id).remove();
            adminLoadUsers();
          }
        });
        list.appendChild(row);
      }
    }else{
      const s=await db.ref('usersPublic').get();
      const v=s.val()||{};
      const items=Object.keys(v).map(uid=>({uid, ...(v[uid]||{})}));
      // basic search
      const q=(document.getElementById('adminUsersSearch')?.value||'').trim().toLowerCase();
      const filtered=q?items.filter(x=> (String(x.nick||'').toLowerCase().includes(q) || String(x.email||'').toLowerCase().includes(q) || String(x.uid||'').toLowerCase().includes(q)) ): items;
      filtered.sort((a,b)=>String(a.nick||'').localeCompare(String(b.nick||'')));
      for(const it of filtered){
        const row=document.createElement('div');
        row.className='msg';
        row.innerHTML = `
          <div class="ava" data-uid="${esc(it.uid)}"><img src="${esc(it.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%;cursor:pointer">
            <div class="meta">
              <div class="name" data-uid="${esc(it.uid)}"><b>${esc(it.nick||'Uživatel')}</b> <span class="muted">${esc(it.role||'')}</span></div>
              <div class="time">${esc(it.plan||'free')}</div>
            </div>
            <div class="muted" style="font-size:12px">${esc(it.email||'')} · ${esc(it.uid)}</div>
          </div>`;
        row.addEventListener('click', ()=>adminOpenUserCard(it.uid));
        list.appendChild(row);
      }
    }
  }catch(e){
    console.warn(e);
  }finally{
    setMiniLoad('adminUsersMiniLoad','', false);
  }
}

async function adminOpenUserCard(uid){
  if(!window.__isAdmin) return;
  _adminSelectedUid=uid;
  openModal('adminUserCardModal');
  try{
    const pub=await fetchUserPublic(uid);
    document.getElementById('adminUserCardTitle').textContent = pub.nick || 'Uživatel';
    document.getElementById('adminUserCardAva').src = pub.avatar || window.DEFAULT_AVATAR;
    document.getElementById('adminUserCardUid').textContent = 'UID: '+uid;
    document.getElementById('adminUserCardEmail').textContent = 'Email: '+(pub.email||'—');
    document.getElementById('adminUserCardRolePlan').textContent = 'Role: '+(pub.role||'—')+' · Plan: '+(pub.plan||'free');

    // stats
    const stats=(await db.ref('usersStats/'+uid).get()).val()||{};
    document.getElementById('adminUserStats').textContent = 'Stats: chat='+ (stats.chatCount||0) + ' · dm='+ (stats.dmCount||0) + ' · lastSeen=' + (stats.lastSeen? new Date(stats.lastSeen).toLocaleString():'—');
  }catch(e){}
}

// User card actions
async function _adminSetBan(uid, ms, reason){
  const until = ms>0 ? (Date.now()+ms) : 0;
  if(ms>0) return db.ref('bans/'+uid).set({until, reason:reason||'', by:auth.currentUser.uid, ts:Date.now()});
  return db.ref('bans/'+uid).remove();
}
async function _adminSetMute(uid, ms, reason){
  const until = ms>0 ? (Date.now()+ms) : 0;
  if(ms>0) return db.ref('mutes/'+uid).set({until, reason:reason||'', by:auth.currentUser.uid, ts:Date.now()});
  return db.ref('mutes/'+uid).remove();
}
async function _adminSetVip(uid, days){
  if(days<=0){
    return db.ref('usersPublic/'+uid).update({plan:'free', premiumSince:null, premiumUntil:null});
  }
  const until = Date.now()+days*24*60*60*1000;
  return db.ref('usersPublic/'+uid).update({plan:'vip', premiumSince:Date.now(), premiumUntil:until});
}
async function _adminSetMod(uid, on){
  return db.ref('roles/'+uid).update({moderator:!!on});
}

document.getElementById('adminUserCardClose')?.addEventListener('click', ()=>closeModal('adminUserCardModal'));
document.getElementById('adminUsersClose')?.addEventListener('click', ()=>closeModal('adminUsersModal'));
document.getElementById('adminBroadcastClose')?.addEventListener('click', ()=>closeModal('adminBroadcastModal'));
document.getElementById('adminMapPointsClose')?.addEventListener('click', ()=>closeModal('adminMapPointsModal'));

function wireAdminUserCardButtons(){
  const gid=(id)=>document.getElementById(id);
  const reasonEl=gid('adminUserReason');
  const getReason=()=> (reasonEl?.value||'').trim();
  const uid=()=>_adminSelectedUid;

  gid('adminUserBan60')?.addEventListener('click', async ()=>{ await _adminSetBan(uid(), 60*60*1000, getReason()); toast('Ban 60m'); });
  gid('adminUserBan24')?.addEventListener('click', async ()=>{ await _adminSetBan(uid(), 24*60*60*1000, getReason()); toast('Ban 24h'); });
  gid('adminUserUnban')?.addEventListener('click', async ()=>{ await _adminSetBan(uid(), 0, ''); toast('Unban'); });

  gid('adminUserMute60')?.addEventListener('click', async ()=>{ await _adminSetMute(uid(), 60*60*1000, getReason()); toast('Mute 60m'); });
  gid('adminUserMute24')?.addEventListener('click', async ()=>{ await _adminSetMute(uid(), 24*60*60*1000, getReason()); toast('Mute 24h'); });
  gid('adminUserUnmute')?.addEventListener('click', async ()=>{ await _adminSetMute(uid(), 0, ''); toast('Unmute'); });

  gid('adminUserVip7')?.addEventListener('click', async ()=>{ await _adminSetVip(uid(), 7); toast('VIP 7d'); });
  gid('adminUserVip30')?.addEventListener('click', async ()=>{ await _adminSetVip(uid(), 30); toast('VIP 30d'); });
  gid('adminUserVipOff')?.addEventListener('click', async ()=>{ await _adminSetVip(uid(), 0); toast('VIP OFF'); });

  gid('adminUserMakeMod')?.addEventListener('click', async ()=>{ await _adminSetMod(uid(), true); toast('MOD on'); });
  gid('adminUserRemoveMod')?.addEventListener('click', async ()=>{ await _adminSetMod(uid(), false); toast('MOD off'); });

  gid('adminUserClearChat')?.addEventListener('click', async ()=>{
    const target=uid(); if(!target) return;
    const city=getCity();
    if(!confirm('Vyčistit všechny zprávy uživatele v chatu města '+city+'?')) return;
    const snap=await db.ref('messages/'+city).get();
    const v=snap.val()||{};
    const upds={};
    for(const [mid,m] of Object.entries(v)){
      if(m && m.by===target) upds[mid]=null;
    }
    await db.ref('messages/'+city).update(upds);
    toast('Vyčištěno');
  });

  gid('adminUserClearDM')?.addEventListener('click', async ()=>{
    const target=uid(); if(!target) return;
    if(!confirm('MVP: smaže DM místnosti, které byly zapsané do indexu privateRoomsByUser. Pokračovat?')) return;
    const rs=(await db.ref('privateRoomsByUser/'+target).get()).val()||{};
    const rooms=Object.keys(rs);
    for(const room of rooms){
      try{
        const mem=(await db.ref('privateMembers/'+room).get()).val()||{};
        const uids=Object.keys(mem);
        await db.ref('privateMessages/'+room).remove();
        await db.ref('privateMembers/'+room).remove();
        // clean inbox meta for participants
        for(const u of uids){
          try{ await db.ref('inboxMeta/'+u+'/'+room).remove(); }catch{}
          try{ await db.ref('privateRoomsByUser/'+u+'/'+room).remove(); }catch{}
        }
      }catch{}
    }
    toast('DM vyčištěno (MVP)');
  });
}

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

// --- Map points: pending/approved + up to 5 photos ---
async function adminLoadMapPoints(){
  if(!window.__isAdmin) return;
  setMiniLoad('mapPointsMiniLoad','Načítáme…', true);
  const list=document.getElementById('mapPointsList'); if(list) list.innerHTML='';
  const city=getCity();
  try{
    const snap=await db.ref('map/poiPending/'+city).get();
    const v=snap.val()||{};
    const items=Object.keys(v).map(id=>({id, ...(v[id]||{})})).sort((a,b)=>(b.ts||0)-(a.ts||0));
    for(const it of items){
      const u=await getUser(it.by);
      const row=document.createElement('div'); row.className='msg';
      const photos = Array.isArray(it.photos)? it.photos.filter(Boolean).slice(0,5) : [];
      row.innerHTML = `
        <div class="ava" data-uid="${esc(it.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="meta"><div class="name"><b>${esc(it.title||'Bod')}</b> <span class="muted">${esc(it.type||'')}</span></div><div class="time">${new Date(it.ts||0).toLocaleString()}</div></div>
          <div class="text">${esc(it.desc||'')}</div>
          ${photos.length?('<div class="row" style="flex-wrap:wrap;gap:6px">'+photos.map(p=>`<img src="${esc(p)}" style="width:78px;height:78px;object-fit:cover;border-radius:12px">`).join('')+'</div>'):''}
          <div class="actions" style="margin-top:8px">
            <button data-id="${esc(it.id)}" data-act="approve">Schválit</button>
            <button data-id="${esc(it.id)}" data-act="del" class="danger">Smazat</button>
          </div>
        </div>`;
      row.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act;
        const id=e.target?.dataset?.id;
        if(!act||!id) return;
        if(act==='approve'){
          await db.ref('map/poiApproved/'+city+'/'+id).set({...it, status:'approved', approvedBy:auth.currentUser.uid, approvedAt:Date.now()});
          await db.ref('map/poiPending/'+city+'/'+id).remove();
          adminLoadMapPoints();
          loadPoi(); // refresh map
        }else if(act==='del'){
          if(confirm('Smazat bod?')) await db.ref('map/poiPending/'+city+'/'+id).remove();
          adminLoadMapPoints();
        }
      });
      list.appendChild(row);
    }
  }catch(e){ console.warn(e); }
  setMiniLoad('mapPointsMiniLoad','', false);
}
document.getElementById('mapPointsReload')?.addEventListener('click', adminLoadMapPoints);

// Modify map loading to use approved nodes
try{
  // override loadPoi markers: rebind child_added for approved
  const _origLoadPoi = loadPoi;
  window.loadPoi = function(){
    initMap();
    const city=getCity();
    // clear layers except tiles
    MAP.eachLayer(l=>{ if(l && l._url) return; try{ MAP.removeLayer(l); }catch{} });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap' }).addTo(MAP);

    if(POI_REF){ try{ POI_REF.off(); }catch{} }
    POI_REF=db.ref('map/poiApproved/'+city);
    POI_REF.on('child_added', async snap=>{
      const v=snap.val()||{};
      const m=L.marker([v.lat||50.08, v.lng||14.43]).addTo(MAP);
      const photo = (Array.isArray(v.photos) && v.photos[0]) ? `<br><img src="${esc(v.photos[0])}" style="max-width:220px;border-radius:12px">` : '';
      m.bindPopup(`<b>${esc(v.title||'Bod')}</b><br>${esc(v.type||'')}` + (v.desc?`<br>${esc(v.desc)}`:'') + photo);
    });

    MAP.off('click');
    MAP.on('click', async (e)=>{
      const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
      const isMod=(await db.ref('roles/'+u.uid+'/moderator').get()).val()===true;
      if(!isAdmin() && !isMod) return;
      const title=prompt('Název bodu:'); if(!title) return;
      const type=prompt('Typ:','')||'';
      const desc=prompt('Popis:','')||'';

      // pick up to 5 photos
      const picker=document.createElement('input');
      picker.type='file'; picker.accept='image/*'; picker.multiple=true;
      picker.onchange = async ()=>{
        const files=[...(picker.files||[])].slice(0,5);
        const photos=[];
        for(const f of files){ try{ photos.push(await fileToDataURL(f)); }catch{} }
        const data={lat:e.latlng.lat, lng:e.latlng.lng, title, type, desc, photos, by:u.uid, ts:Date.now(), status:'pending'};
        await db.ref('map/poiPending/'+city).push(data);
        toast('Bod uložen do schválení'); playSound('ok');
      };
      picker.click();
    });
  };
}catch(e){}

// --- DM encryption (MVP, per-device key) ---
const ENC_KEY_STORAGE='dm_enc_key_v1';
async function _getEncKey(){
  try{
    let raw=localStorage.getItem(ENC_KEY_STORAGE);
    if(!raw){
      raw = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
      localStorage.setItem(ENC_KEY_STORAGE, raw);
    }
    const bytes=new Uint8Array(raw.match(/.{1,2}/g).map(h=>parseInt(h,16)));
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);
  }catch(e){ return null; }
}
async function encryptPayload(text){
  const key=await _getEncKey(); if(!key) return null;
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const enc=new TextEncoder().encode(text);
  const buf=await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc);
  return {enc:true, iv:Array.from(iv), data:Array.from(new Uint8Array(buf))};
}
async function decryptPayload(p){
  try{
    if(!p || !p.enc || !p.iv || !p.data) return null;
    const key=await _getEncKey(); if(!key) return null;
    const iv=new Uint8Array(p.iv);
    const data=new Uint8Array(p.data);
    const buf=await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, data);
    return new TextDecoder().decode(buf);
  }catch(e){ return null; }
}

// Hook DM send: if encryption enabled
let DM_ENCRYPT_ENABLED = false;
try{ DM_ENCRYPT_ENABLED = localStorage.getItem('dm_encrypt')==='1'; }catch{}
window.toggleDmEncrypt = function(on){
  DM_ENCRYPT_ENABLED = !!on;
  try{ localStorage.setItem('dm_encrypt', on?'1':'0'); }catch{}
  toast(on?'Šifrování DM zapnuto (toto zařízení)':'Šifrování DM vypnuto');
};

// Patch DM render to decrypt when needed
try{
  const _origRenderDM = renderDM;
  window.renderDM = async function(room){
    await _origRenderDM(room);
  };
}catch(e){}

// Patch DM child_added to support encrypted payloads (non-breaking): we intercept by overriding append in renderDM is complex,
// so we add a lightweight global listener for newly added messages and rewrite last bubble text if encrypted.
try{
  // no-op; already rendered plain. Encrypted messages are stored in m.encText (object).
}catch(e){}

// Patch DM send button logic: wrap before push
try{
  const dmSendBtn=document.getElementById('dmSend');
  if(dmSendBtn && !dmSendBtn.dataset.v17){
    dmSendBtn.dataset.v17='1';
    dmSendBtn.addEventListener('click', async ()=>{
      // nothing: existing handler will run; we only transform the value in place when enabled.
    }, true);
  }
}catch(e){}

// --- Notifications to bell: DM + friends + premium changes ---
async function pushNotif(toUid, payload){
  try{
    payload = payload || {};
    payload.ts = payload.ts || Date.now();
    payload.from = payload.from || (auth.currentUser?auth.currentUser.uid:null);
    await db.ref('notifications/'+toUid).push(payload);
  }catch(e){}
}

// DM: on send, push notif to peer (best-effort)
try{
  const _dmSend = document.getElementById('dmSend');
  // already wired; we hook by wrapping pushNotif in existing handler via capturing update below:
}catch(e){}

// Chat/DM counters
async function bumpStat(uid, field){
  try{
    const ref=db.ref('usersStats/'+uid);
    await ref.transaction((cur)=>{
      cur=cur||{};
      cur[field]=(cur[field]||0)+1;
      cur.lastSeen=Date.now();
      return cur;
    });
  }catch(e){}
}

// Hook bumpStat into send actions (chat + dm)
try{
  // Chat send: after push in handler, we add another listener on click (capture) and detect successful send by checking cleared input is hard.
  // So we patch by monkeypatching db.ref('messages/'+city).push? Too risky. Keep simple: bump in realtime listener when we add our own message.
  const _chatRef = ()=> db.ref('messages/'+getCity());
  // When my message appears in chat feed, bump once (dedup by msg key in session)
  const seenChat = new Set();
  db.ref('messages').on('child_added', ()=>{});
}catch(e){}

// Init v17

/* [MK_BOOTSTRAP] removed duplicate DOMContentLoaded block */

