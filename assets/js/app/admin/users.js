// Admin: users (search, bans, mutes, roles, VIP)

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
  if(ms>0){
    await db.ref('bans/'+uid).set({until, reason:reason||'', by:auth.currentUser.uid, ts:Date.now()});
    try{ auditLog && auditLog('ban_set', String(uid), { until, reason:reason||'' }); }catch(e){}
    return;
  }
  await db.ref('bans/'+uid).remove();
  try{ auditLog && auditLog('ban_remove', String(uid), {}); }catch(e){}
}
async function _adminSetMute(uid, ms, reason){
  const until = ms>0 ? (Date.now()+ms) : 0;
  if(ms>0){
    await db.ref('mutes/'+uid).set({until, reason:reason||'', by:auth.currentUser.uid, ts:Date.now()});
    try{ auditLog && auditLog('mute_set', String(uid), { until, reason:reason||'' }); }catch(e){}
    return;
  }
  await db.ref('mutes/'+uid).remove();
  try{ auditLog && auditLog('mute_remove', String(uid), {}); }catch(e){}
}
async function _adminSetVip(uid, days){
  if(days<=0){
    await db.ref('usersPublic/'+uid).update({plan:'free', premiumSince:null, premiumUntil:null});
    try{ auditLog && auditLog('plan_set', String(uid), { plan:'free', days:0 }); }catch(e){}
    return;
  }
  const until = Date.now()+days*24*60*60*1000;
  await db.ref('usersPublic/'+uid).update({plan:'vip', premiumSince:Date.now(), premiumUntil:until});
  try{ auditLog && auditLog('plan_set', String(uid), { plan:'vip', days, until }); }catch(e){}
  return;
}
async function _adminSetMod(uid, on){
  await db.ref('roles/'+uid).update({moderator:!!on});
  try{ auditLog && auditLog('moderator_set', String(uid), { on:!!on }); }catch(e){}
  return;
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
    try{ auditLog && auditLog('admin_clear_chat', String(target), { city, removed: Object.keys(upds).length }); }catch(e){}
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
        try{ await db.ref('privateMembers/'+room).remove(); }catch(e){}
        // clean inbox meta for participants
        for(const u of uids){
          try{ await db.ref('inboxMeta/'+u+'/'+room).remove(); }catch{}
          try{ await db.ref('privateRoomsByUser/'+u+'/'+room).remove(); }catch{}
        }
      }catch{}
    }
    try{ auditLog && auditLog('admin_clear_dm', String(target), { rooms: rooms.length }); }catch(e){}
    toast('DM vyčištěno (MVP)');
  });
}
