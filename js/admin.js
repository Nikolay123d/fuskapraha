const friendsList=document.getElementById('friendsList');
const friendRequestsEl=document.getElementById('friendRequests');
const friendsOnlineCountEl=document.getElementById('friendsOnlineCount');
const dmList=document.getElementById('dmList');

function convoIdFor(a,b){ return a<b? a+'_'+b : b+'_'+a; }

async function sendFriendRequest(toUid){
  if(!auth.currentUser){ showAuth(); return; }
  const from=auth.currentUser.uid; if(from===toUid) return;
  try{
    await db.ref('friendRequests/'+toUid+'/'+from).set({ from, ts:Date.now() });
    await db.ref('friends/'+from+'/'+toUid).set({ status:'requested', ts:Date.now(), fromUid:from });
    await db.ref('notifications/'+toUid).push({ ts:Date.now(), type:'friend_req', text:`Запит у друзі від ${auth.currentUser.displayName||'Користувач'}`, from });
    renderNotifItem('ok',{type:'ok',text:'Заявка відправлена'});
  }catch(e){ renderNotifItem('err',{type:'error',text:'Не вдалося відправити заявку'}); }
}

async function openPrivateChat(otherUid){
  if(!auth.currentUser){ showAuth(); return; }
  const uid=auth.currentUser.uid; const cid=convoIdFor(uid,otherUid);
  const panel=document.createElement('div'); panel.className='modal show'; panel.innerHTML=`<div class="panel"><button class="close">✖</button><h3>Діалог</h3>
  <div id="dmThread" style="max-height:55vh;overflow:auto;border:1px solid #eee;border-radius:8px;padding:8px;margin-bottom:8px;background:#fafafa"></div>
  <div style="display:flex;gap:6px"><input id="dmImg" placeholder="URL зображення (опційно)" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd"><input id="dmText" placeholder="Напишіть повідомлення..." style="flex:2;padding:10px;border-radius:8px;border:1px solid #ddd"><button id="dmSend" class="tab-button">Відправити</button></div></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.close').onclick=()=>panel.remove();
  const thread=panel.querySelector('#dmThread');

  db.ref('inboxMeta/'+uid+'/'+otherUid).set({ with:otherUid, ts:Date.now() });
  db.ref('inboxMeta/'+otherUid+'/'+uid).set({ with:uid, ts:Date.now() });

  db.ref('privateMessages/'+cid).limitToLast(200).on('child_added',snap=>{
    const m=snap.val(); const row=document.createElement('div');
    row.style.margin='6px 0'; row.style.textAlign=m.from===uid?'right':'left';
    row.innerHTML = `${m.text?escapeHtml(m.text):''} ${m.image?('<br><img src="'+escapeHtml(m.image)+'" style="max-width:220px;border-radius:8px;margin-top:6px">'):''} <div style="font-size:12px;color:#64748b">(${new Date(m.ts).toLocaleTimeString()})</div>`;
    thread.appendChild(row); thread.scrollTop=thread.scrollHeight;
    if(m.to===uid){ SND.dm(); }
  });
  panel.querySelector('#dmSend').onclick=async()=>{
    const t=panel.querySelector('#dmText').value.trim();
    const img = panel.querySelector('#dmImg').value.trim() || null;
    if(!t && !img) return;
    const pm={from:uid,to:otherUid,text:t||null,image:img||null,ts:Date.now()};
    await db.ref('privateMessages/'+cid).push(pm);
    await db.ref('notifications/'+otherUid).push({ ts:Date.now(), type:'dm', text:`Нове ЛС від ${auth.currentUser.displayName||'Користувач'}`, from:uid, convoId:cid });
    await db.ref('inboxMeta/'+uid+'/'+otherUid).update({ last:t||'[фото]', ts:pm.ts });
    await db.ref('inboxMeta/'+otherUid+'/'+uid).update({ last:t||'[фото]', ts:pm.ts });
    panel.querySelector('#dmText').value=''; panel.querySelector('#dmImg').value=''; 
  };
}

async function deriveDisplayName(uid){
  const us = await db.ref('users/'+uid).get();
  if (us.exists()){
    const u = us.val();
    if (u.nick)  return u.nick;
    if (u.email) return (u.email.split('@')[0] || 'Користувач');
  }
  return (uid || 'Користувач').slice(0,8) + '…';
}

async function refreshFriendsBlocks(){
  const u=auth.currentUser; if(!u){ friendsList.innerHTML=''; friendRequestsEl.innerHTML=''; friendsOnlineCountEl.textContent='0'; return; }
  const reqSnap=await db.ref('friendRequests/'+u.uid).get(); friendRequestsEl.innerHTML='';
  if(reqSnap.exists()){
    const reqs=reqSnap.val();
    for(const fromUid of Object.keys(reqs)){
      const uSnap=await db.ref('users/'+fromUid).get(); const ud=uSnap.exists()?uSnap.val():{nick:'Користувач',avatar:DEFAULT_AVATAR};
      const item=document.createElement('div'); item.className='help-card'; item.style.display='flex'; item.style.alignItems='center'; item.style.gap='8px';
      item.innerHTML=`<img src="${ud.avatar||DEFAULT_AVATAR}" style="width:48px;height:48px;border-radius:10px;object-fit:cover">
      <div style="flex:1"><div style="font-weight:800;color:#0b1220">${escapeHtml(ud.nick||'Користувач')}</div><div class="muted" style="font-size:12px;color:#64748b">заявка у друзі</div></div>
      <div style="display:flex;gap:6px"><button class="tab-button btn-accept">✅ Прийняти</button><button class="tab-button btn-decline" style="background:#ffe1e1">✖</button></div>`;
      item.querySelector('.btn-accept').onclick=async()=>{
        await db.ref('friends/'+u.uid+'/'+fromUid).set({ status:'accepted', ts:Date.now() });
        await db.ref('friends/'+fromUid+'/'+u.uid).set({ status:'accepted', ts:Date.now() });
        await db.ref('friendRequests/'+u.uid+'/'+fromUid).remove();
        await db.ref('notifications/'+fromUid).push({ ts:Date.now(), type:'friend_ok', text:`${u.displayName||'Користувач'} додав(ла) вас у друзі`, from:u.uid });
        refreshFriendsBlocks();
      };
      item.querySelector('.btn-decline').onclick=async()=>{
        await db.ref('friendRequests/'+u.uid+'/'+fromUid).remove(); await db.ref('friends/'+fromUid+'/'+u.uid).remove(); refreshFriendsBlocks();
      };
      friendRequestsEl.appendChild(item);
    }
  }else{
    friendRequestsEl.innerHTML="<i style='color:#64748b'>Немає заявок</i>";
  }

  friendsList.innerHTML=''; const frSnap=await db.ref('friends/'+u.uid).get(); let onlineCount=0;
  if(frSnap.exists()){
    const fr=frSnap.val();
    for(const fid of Object.keys(fr)){ const rel=fr[fid]; if(rel.status!=='accepted') continue;
      const uSnap=await db.ref('users/'+fid).get(); const ud=uSnap.exists()?uSnap.val():{nick:'Користувач',avatar:DEFAULT_AVATAR};
      const pSnap=await db.ref('presence/'+fid).get(); const isOn=pSnap.exists(); if(isOn) onlineCount++;
      const d=document.createElement('div'); d.className='help-card'; d.style.display='flex'; d.style.alignItems='center'; d.style.gap='8px';
      d.innerHTML=`<img src="${ud.avatar||DEFAULT_AVATAR}" style="width:48px;height:48px;border-radius:10px;object-fit:cover">
        <div style="flex:1"><div style="font-weight:800;color:#0b1220">${escapeHtml(ud.nick||'Користувач')}</div><div style="font-size:12px;color:${isOn?'#10b981':'#64748b'}">${isOn?'онлайн':'офлайн'}</div></div>
        <div style="display:flex;gap:6px"><button class="tab-button btn-pm">✉️</button></div>`;
      d.querySelector('.btn-pm').onclick=()=>openPrivateChat(fid);
      friendsList.appendChild(d);
    }
  } else friendsList.innerHTML='<i>Додайте друзів через профілі</i>';
  friendsOnlineCountEl.textContent=String(onlineCount);
}

function renderDMInbox(){
  const u=auth.currentUser;
  if(!u){ dmList.innerHTML='<i>Увійдіть, щоб бачити ЛС</i>'; return; }
  db.ref('inboxMeta/'+u.uid).off();
  dmList.innerHTML='';
  db.ref('inboxMeta/'+u.uid).orderByChild('ts').limitToLast(200).on('child_added', async snap=>{
    const other=snap.key; const meta=snap.val()||{};
    const name=await deriveDisplayName(other);
    const avatar=(await db.ref('users/'+other+'/avatar').get()).val()||DEFAULT_AVATAR;
    const card=document.createElement('div'); card.className='help-card'; card.style.display='flex'; card.style.alignItems='center'; card.style.gap='8px';
    card.innerHTML=`<img src="${avatar}" style="width:42px;height:42px;border-radius:10px;object-fit:cover">
      <div style="flex:1"><div style="font-weight:800">${escapeHtml(name)}</div><div style="font-size:12px;color:#64748b">${escapeHtml(meta.last||'Без тексту')}</div></div>
      <button class='tab-button'>Відкрити</button>`;
    card.querySelector('button').onclick=()=> openPrivateChat(other);
    dmList.prepend(card);
  });
}

// ===== Админка участников (вынеси таблицу в модал на своей странице — здесь только логика)
const adminModalHtml = `<div id="adminUsersModal" class="modal show"><div class="panel"><button class="close" id="adminUsersClose">✖</button><div class="user-badge" style="margin-bottom:8px">Список учасників</div><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input id="userSearch" placeholder="Пошук за ніком або email…" style="flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:10px" /><span class="user-badge">Усього: <b id="usersTotal">0</b></span><span class="user-badge">На екрані: <b id="usersShown">0</b></span></div><div style="flex:1;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;background:#fff"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:10px">Користувач</th><th style="text-align:left;padding:10px">Email</th><th style="text-align:left;padding:10px">Статус</th><th style="text-align:left;padding:10px">Преміум</th><th style="text-align:left;padding:10px">Дії</th></tr></thead><tbody id="usersTBody"></tbody></table></div></div></div>`;

document.getElementById('membersBtn').addEventListener('click', ()=>{
  if(!auth.currentUser){ showAuth(); return; }
  if(auth.currentUser.email !== ADMIN_EMAIL){ renderNotifItem('system',{type:'system',text:'Тільки для адміна'}); return; }
  const el = document.createElement('div');
  el.innerHTML = adminModalHtml;
  document.body.appendChild(el.firstChild);
  bindAdminModal();
  loadUsers();
});

function bindAdminModal(){
  const closeBtn = document.getElementById('adminUsersClose');
  closeBtn.onclick = ()=> document.getElementById('adminUsersModal').remove();
  window.$usersTBody=document.getElementById('usersTBody');
  window.$userSearch=document.getElementById('userSearch');
  window.$usersTotal=document.getElementById('usersTotal');
  window.$usersShown=document.getElementById('usersShown');
  $userSearch.addEventListener('input', ()=> renderUsersTable(window.__allUsers || []));
  db.ref('presence').on('value', s=>{ window.__presence=s.val()||{}; if(document.getElementById('adminUsersModal')) renderUsersTable(window.__allUsers || []); });
  db.ref('settings/userFlags').on('value', s=>{ window.__userFlags=s.val()||{}; if(document.getElementById('adminUsersModal')) renderUsersTable(window.__allUsers || []); });
}

async function loadUsers(){
  const s=await db.ref('users').get(); const obj=s.val()||{};
  window.__allUsers=Object.keys(obj).map(uid=>({uid,...obj[uid]}));
  $usersTotal.textContent=String(window.__allUsers.length);
  renderUsersTable(window.__allUsers);
}

function renderUsersTable(list){
  const flagsAll = window.__userFlags||{}; const pres = window.__presence||{};
  const q=($userSearch.value||'').trim().toLowerCase();
  const filtered=list.filter(u=>!q||(u.nick||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $usersShown.textContent=String(filtered.length); $usersTBody.innerHTML='';
  const SUB_PLAN={ none:{label:'—',badge:'#f1f5f9',color:'#111'}, trial:{label:'TRIAL',badge:'#c084fc',color:'#fff'}, premium:{label:'ПРЕМІУМ',badge:'#16a34a',color:'#fff'}, premiumPlus:{label:'ПРЕМІУМ+',badge:'#0ea5e9',color:'#fff'} };
  filtered.forEach(u=>{
    const flags=flagsAll[u.uid]||{}; const banned=!!flags.banned; const premKey=flags.premium||'none';
    const plan=SUB_PLAN[premKey]||SUB_PLAN.none; const online=!!pres[u.uid];
    const tr=document.createElement('tr');
    tr.innerHTML=`<td style="padding:10px"><div style="display:flex;gap:10px;align-items:center"><span title="${online?'Онлайн':'Офлайн'}" style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${online?'#22c55e':'#94a3b8'}"></span><img src="${u.avatar||DEFAULT_AVATAR}" style="width:36px;height:36px;border-radius:10px;object-fit:cover"><div><div style="font-weight:800">${escapeHtml(u.nick||'Користувач')}</div><div style="font-size:12px;color:#64748b">${u.uid.slice(0,8)}…</div></div></div></td><td style="padding:10px;color:#64748b">${escapeHtml(u.email||'')}</td><td style="padding:10px">${banned?'<span class="user-badge" style="background:#fee2e2;color:#991b1b">Забанено</span>':'<span class="user-badge">OK</span>'}</td><td style="padding:10px"><span class="user-badge" style="background:${plan.badge};color:${plan.color};font-weight:900">${plan.label}</span></td><td style="padding:10px"><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn-mini" data-act="ban" data-uid="${u.uid}">${banned?'Розбанити':'Забанити'}</button><button class="btn-mini" data-act="grant100" data-uid="${u.uid}">Донат 100</button><button class="btn-mini" data-act="grant199" data-uid="${u.uid}">Донат 199</button><button class="btn-mini" data-act="pm" data-uid="${u.uid}">✉️ ЛС</button></div></td>`;
    $usersTBody.appendChild(tr);
  });
  $usersTBody.querySelectorAll('button[data-act]').forEach(btn=> btn.onclick=()=> adminUserAction(btn.dataset.act, btn.dataset.uid));
}

async function adminUserAction(act,uid){
  if(!auth.currentUser || auth.currentUser.email!==ADMIN_EMAIL){ renderNotifItem('system',{type:'system',text:'Потрібні права адміна'}); return; }
  try{
    const path='settings/userFlags/'+uid;
    if(act==='ban'){
      const cur=(await db.ref(path+'/banned').get()).val()===true;
      await db.ref(path).update({ banned:!cur, updatedBy:auth.currentUser.uid });
      await db.ref('notifications/'+uid).push({ ts:Date.now(), type:'system', text: cur?'Бан знято.':'Ваш акаунт заблоковано.'});
    } else if(act==='grant100'){
      await db.ref(path).update({ premium:'premium', premiumSince:Date.now(), updatedBy:auth.currentUser.uid });
      await db.ref('notifications/'+uid).push({ ts:Date.now(), type:'premium', text:'Активовано план BASIC (100 Kč).' });
    } else if(act==='grant199'){
      await db.ref(path).update({ premium:'premiumPlus', premiumSince:Date.now(), updatedBy:auth.currentUser.uid });
      await db.ref('notifications/'+uid).push({ ts:Date.now(), type:'premium', text:'Активовано план PRO (199 Kč).' });
    } else if(act==='pm'){
      openPrivateChat(uid);
    }
  }catch(e){ renderNotifItem('error',{type:'error',text:'Помилка дії'}); }
}
