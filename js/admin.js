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
    panel.querySelector('#dmText').value=''; panel.querySelector('#dmImg').value=''; SND.sent();
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
        refreshFriendsBlocks(); SND.notify();
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
