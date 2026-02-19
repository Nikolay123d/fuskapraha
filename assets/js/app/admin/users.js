// Admin: Users (SaaS-style search + user card). Critical writes via Cloud Functions.

(function adminUsers(){
  'use strict';

  const $ = (id)=>document.getElementById(id);

  let _searchTimer = null;
  window._adminSelectedUid = window._adminSelectedUid || null;

  // -----------------------------
  // List loader
  // -----------------------------
  async function adminLoadUsers(){
    if(!window.__isAdmin){ try{ toast('Pouze admin'); }catch(e){}; return; }

    const list = $('adminUsersList');
    if(list) list.innerHTML = '';

    setMiniLoad('adminUsersMiniLoad','Načítáme…', true);

    try{
      if(window._adminUsersMode === 'complaints'){
        // Keep MVP complaints list (direct read is OK for admins)
        const s = await db.ref('support/tickets').limitToLast(200).get();
        const v = s.val() || {};
        const items = Object.keys(v).map(id=>({id, ...v[id]})).sort((a,b)=>(b.ts||0)-(a.ts||0));
        for(const it of items){
          const type = String(it.type||'support');
          const u = await getUser(it.by);
          const targetUid = String(it.targetUid||'').trim();
          const tgt = targetUid ? await getUser(targetUid) : null;

          const row = document.createElement('div');
          row.className = 'msg';

          const pill = type==='user_report' ? '<span class="pill pill-danger">USER REPORT</span>' : '<span class="pill">SUPPORT</span>';
          const status = String(it.status||'open');
          const statusPill = status==='closed' ? '<span class="pill">CLOSED</span>' : '<span class="pill">OPEN</span>';
          const reason = String(it.reason||'').trim();
          const text = String(it.text||'').trim();
          const imgA = it.img || it.img1 || null;
          const imgB = it.img2 || null;

          row.innerHTML = `
            <div class="ava" data-uid="${esc(it.by)}"><img src="${esc(safeImgSrc(u.avatar||window.DEFAULT_AVATAR, window.DEFAULT_AVATAR))}"></div>
            <div class="bubble" style="width:100%">
              <div class="meta">
                <div class="name"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${new Date(it.ts||0).toLocaleString()}</span></div>
                <div class="time">${pill} ${statusPill}</div>
              </div>

              ${type==='user_report' && tgt ? `
                <div class="muted" style="font-size:12px;margin-top:6px">
                  Target: <b>${esc(tgt.nick||'User')}</b> <span class="muted">(${esc(targetUid)})</span>
                </div>
              ` : ''}

              ${reason ? `<div class="text"><b>Reason:</b> ${esc(reason)}</div>` : ''}
              <div class="text">${esc(text||'(bez textu)')}</div>
              ${imgA ? `<div class="text"><img src="${esc(safeImgSrc(imgA,''))}" style="max-width:240px;border-radius:12px"></div>` : ''}
              ${imgB ? `<div class="text"><img src="${esc(safeImgSrc(imgB,''))}" style="max-width:240px;border-radius:12px"></div>` : ''}

              <div class="actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                <button data-uid="${esc(it.by)}" data-act="openReporter">Reporter</button>
                ${targetUid ? `<button data-uid="${esc(targetUid)}" data-act="openTarget">Target</button>` : ''}
                <button data-id="${esc(it.id)}" data-act="toggleStatus">${status==='closed'?'Reopen':'Close'}</button>
                <button data-id="${esc(it.id)}" data-act="delTicket" class="danger">Smazat ticket</button>
              </div>
            </div>`;

          row.addEventListener('click', async (e)=>{
            const act = e.target?.dataset?.act;
            if(!act) return;
            if(act==='openReporter' || act==='openTarget'){
              await adminOpenUserCard(e.target.dataset.uid);
            }else if(act==='toggleStatus'){
              const tid = e.target.dataset.id;
              if(!tid) return;
              try{
                const cur = (await db.ref('support/tickets/'+tid+'/status').get()).val();
                const next = String(cur||'open')==='closed' ? 'open' : 'closed';
                await db.ref('support/tickets/'+tid).update({status: next});
              }catch(_e){}
              adminLoadUsers();
            }else if(act==='delTicket'){
              if(confirm('Smazat ticket?')) await db.ref('support/tickets/'+e.target.dataset.id).remove();
              adminLoadUsers();
            }
          });

          list.appendChild(row);
        }
        return;
      }

      // USERS mode: server-side search
      if(typeof window.callFn !== 'function'){
        toast('Functions nejsou dostupné');
        return;
      }

      const q = String(($('adminUsersSearch')?.value||'')).trim();
      const plan = String(($('adminUsersPlan')?.value||'')).trim();
      const role = String(($('adminUsersRole')?.value||'')).trim();

      const res = await window.callFn('adminUserSearch', { q, plan, role, limit: 50 });
      const items = (res?.items || res?.data?.items || res?.data || []).slice ? (res.items || res.data?.items || res.data || []) : [];

      for(const it of items){
        const row = document.createElement('div');
        row.className = 'msg';
        row.innerHTML = `
          <div class="ava" data-uid="${esc(it.uid)}"><img src="${esc(safeImgSrc(it.avatar||window.DEFAULT_AVATAR, window.DEFAULT_AVATAR))}"></div>
          <div class="bubble" style="width:100%;cursor:pointer">
            <div class="meta">
              <div class="name" data-uid="${esc(it.uid)}"><b>${esc(it.nick||'Uživatel')}</b> <span class="muted">${esc(it.role||'')}</span></div>
              <div class="time">${esc(it.plan||'free')}</div>
            </div>
            <div class="muted" style="font-size:12px">UID: ${esc(it.uid)}</div>
          </div>`;
        row.addEventListener('click', ()=>adminOpenUserCard(it.uid));
        list.appendChild(row);
      }

      if(!items.length){
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.style.padding = '10px';
        empty.textContent = q ? 'Nic nenalezeno' : 'Žádní uživatelé';
        list.appendChild(empty);
      }

    }catch(e){
      console.warn(e);
    }finally{
      setMiniLoad('adminUsersMiniLoad','', false);
    }
  }

  // -----------------------------
  // User card
  // -----------------------------
  async function adminOpenUserCard(uid){
    if(!window.__isAdmin) return;
    uid = String(uid||'').trim();
    if(!uid) return;

    window._adminSelectedUid = uid;
    try{ window.adminShowPanel && adminShowPanel('adminUserCardPanel'); }catch(e){}

    try{
      if(typeof window.callFn !== 'function'){
        toast('Functions nejsou dostupné');
        return;
      }
      const res = await window.callFn('adminUserGet', { uid });
      const data = res?.data || res;
      if(!data || !data.exists){
        toast('User nenalezen');
        return;
      }

      const pub = data.pub || {};
      const roles = data.roles || {};
      const ban = data.ban || null;
      const mute = data.mute || null;
      const stats = data.stats || {};

      $('adminUserCardTitle').textContent = pub.nick || 'Uživatel';
      $('adminUserCardAva').src = safeImgSrc(pub.avatar || window.DEFAULT_AVATAR, window.DEFAULT_AVATAR);
      $('adminUserCardUid').textContent = 'UID: ' + uid;
      $('adminUserCardEmail').textContent = 'Email: —';

      const plan = pub.plan || 'free';
      const until = pub.premiumUntil ? new Date(pub.premiumUntil).toLocaleString() : '—';
      const mod = roles.moderator === true ? 'MOD' : '—';
      const adm = roles.admin === true ? 'ADMIN' : '—';
      $('adminUserCardRolePlan').textContent = `Role: ${pub.role||'—'} · Plan: ${plan} · Until: ${until} · ${mod} · ${adm}`;

      const parts=[];
      if(ban?.until) parts.push('BAN until=' + new Date(ban.until).toLocaleString());
      if(mute?.until) parts.push('MUTE until=' + new Date(mute.until).toLocaleString());
      parts.push('chat=' + (stats.chatCount||0));
      parts.push('dm=' + (stats.dmCount||0));
      parts.push('lastSeen=' + (stats.lastSeen? new Date(stats.lastSeen).toLocaleString() : '—'));
      if(typeof stats.streakDays === 'number') parts.push('streak=' + (stats.streakDays||0));
      if(typeof stats.totalActiveDays === 'number') parts.push('activeDays=' + (stats.totalActiveDays||0));
      $('adminUserStats').textContent = parts.join(' · ');

    }catch(e){
      console.warn(e);
      try{ toast('Chyba user card'); }catch(_e){}
    }
  }

  window.adminLoadUsers = adminLoadUsers;
  window.adminOpenUserCard = adminOpenUserCard;

  // -----------------------------
  // User card actions (server only)
  // -----------------------------
  async function _adminSetBan(uid, ms, reason){
    if(!uid) return;
    if(typeof window.callFn !== 'function'){ toast('Server není dostupný (Functions)'); return; }
    const minutes = ms>0 ? Math.round(ms/60000) : 0;
    if(minutes > 0){
      await window.callFn('adminBan', { uid, minutes, reason: reason||'' });
      return;
    }
    await window.callFn('adminUnban', { uid });
  }
  async function _adminSetMute(uid, ms, reason){
    if(!uid) return;
    if(typeof window.callFn !== 'function'){ toast('Server není dostupný (Functions)'); return; }
    const minutes = ms>0 ? Math.round(ms/60000) : 0;
    if(minutes > 0){
      await window.callFn('adminMute', { uid, minutes, reason: reason||'' });
      return;
    }
    await window.callFn('adminUnmute', { uid });
  }
  async function _adminSetVip(uid, days){
    if(!uid) return;
    if(typeof window.callFn !== 'function'){ toast('Server není dostupný (Functions)'); return; }
    if(days<=0){
      await window.callFn('adminGrantPlan', { uid, plan:'free' });
      return;
    }
    await window.callFn('adminGrantPlan', { uid, plan:'vip', days });
  }
  async function _adminSetMod(uid, on){
    if(!uid) return;
    if(typeof window.callFn !== 'function'){ toast('Server není dostupný (Functions)'); return; }
    await window.callFn('adminSetModerator', { uid, on: !!on });
  }

  function wireAdminUserCardButtons(){
    const reasonEl = $('adminUserReason');
    const getReason = ()=> (reasonEl?.value||'').trim();
    const uid = ()=>window._adminSelectedUid;

    const once=(id, fn)=>{
      const el=$(id);
      if(!el || el.dataset.wired==='1') return;
      el.dataset.wired='1';
      el.addEventListener('click', fn);
    };

    once('adminUserBan60', async ()=>{ await _adminSetBan(uid(), 60*60*1000, getReason()); toast('Ban 60m'); await adminOpenUserCard(uid()); });
    once('adminUserBan24', async ()=>{ await _adminSetBan(uid(), 24*60*60*1000, getReason()); toast('Ban 24h'); await adminOpenUserCard(uid()); });
    once('adminUserUnban', async ()=>{ await _adminSetBan(uid(), 0, ''); toast('Unban'); await adminOpenUserCard(uid()); });

    once('adminUserMute60', async ()=>{ await _adminSetMute(uid(), 60*60*1000, getReason()); toast('Mute 60m'); await adminOpenUserCard(uid()); });
    once('adminUserMute24', async ()=>{ await _adminSetMute(uid(), 24*60*60*1000, getReason()); toast('Mute 24h'); await adminOpenUserCard(uid()); });
    once('adminUserUnmute', async ()=>{ await _adminSetMute(uid(), 0, ''); toast('Unmute'); await adminOpenUserCard(uid()); });

    once('adminUserVip7', async ()=>{ await _adminSetVip(uid(), 7); toast('VIP 7d'); await adminOpenUserCard(uid()); });
    once('adminUserVip30', async ()=>{ await _adminSetVip(uid(), 30); toast('VIP 30d'); await adminOpenUserCard(uid()); });
    once('adminUserVipOff', async ()=>{ await _adminSetVip(uid(), 0); toast('VIP OFF'); await adminOpenUserCard(uid()); });

    once('adminUserMakeMod', async ()=>{ await _adminSetMod(uid(), true); toast('MOD on'); await adminOpenUserCard(uid()); });
    once('adminUserRemoveMod', async ()=>{ await _adminSetMod(uid(), false); toast('MOD off'); await adminOpenUserCard(uid()); });

    // Keep dangerous clears as MVP direct actions (can be moved server-side later)
    once('adminUserClearChat', async ()=>{
      const target = uid();
      if(!target) return;
      const city = getCity();
      if(!confirm('Vyčistit všechny zprávy uživatele v chatu města '+city+'?')) return;
      const snap = await db.ref('messages/'+city).get();
      const val = snap.val() || {};
      const upd = {};
      for(const mid of Object.keys(val)){
        if(val[mid] && val[mid].from === target) upd['messages/'+city+'/'+mid] = null;
      }
      await db.ref().update(upd);
      toast('Chat vyčištěn');
    });

    once('adminUserClearDM', async ()=>{ toast('DM cleanup MVP není hotový'); });
  }

  function wireUsersPanel(){
    const reload = $('adminUsersReload');
    if(reload && reload.dataset.wired!=='1'){
      reload.dataset.wired='1';
      reload.addEventListener('click', ()=>adminLoadUsers());
    }

    const input = $('adminUsersSearch');
    const plan = $('adminUsersPlan');
    const role = $('adminUsersRole');

    const onChange=()=>{
      if(_searchTimer) clearTimeout(_searchTimer);
      _searchTimer = setTimeout(()=>adminLoadUsers(), 250);
    };

    if(input && input.dataset.wired!=='1'){
      input.dataset.wired='1';
      input.addEventListener('input', onChange);
    }
    if(plan && plan.dataset.wired!=='1'){
      plan.dataset.wired='1';
      plan.addEventListener('change', onChange);
    }
    if(role && role.dataset.wired!=='1'){
      role.dataset.wired='1';
      role.addEventListener('change', onChange);
    }

    // Close buttons already wired in router, but keep safe
    $('adminUserCardClose')?.addEventListener('click', ()=>{ try{ window.adminShowPanel && adminShowPanel('adminUsersPanel'); }catch(e){} });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    wireAdminUserCardButtons();
    wireUsersPanel();
  });

})();
