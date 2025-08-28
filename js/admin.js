// Friends / DMs
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
    pushNotif({type:'ok',text:'Заявка відправлена'});
  }catch(e){ pushNotif({type:'error',text:'Не вдалося відправити заявку'}); }
}

async function openPrivateChat(otherUid){
  if(!auth.currentUser){ showAuth(); return; }
  const uid=auth.currentUser.uid; const cid=convoIdFor(uid,otherUid);
  const panel=document.createElement('div'); panel.className='modal show'; panel.innerHTML=`<div class="panel"><button class="close">✖</button><h3>Діалог</h3>
  <div id="dmThread" style="max-height:55vh;overflow:auto;border:1px solid #eee;border-radius:8px;padding:8px;margin-bottom:8px;background:#fafafa"></div>
  <div style="display:flex;gap:6px;align-items:center">
    <label class="camera-btn" style="width:auto;padding:6px 10px;display:inline-flex;gap:6px;align-items:center;cursor:pointer">
      📷 <input id="dmFile" type="file" accept="image/*" style="display:none">
    </label>
    <input id="dmText" placeholder="Напишіть повідомлення..." style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd">
    <button id="dmSend" class="tab-button">Відправити</button>
  </div></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.close').onclick=()=>panel.remove();
  const thread=panel.querySelector('#dmThread');

  db.ref('inboxMeta/'+uid+'/'+otherUid).set({ with:otherUid, ts:Date.now() });
  db.ref('inboxMeta/'+otherUid+'/'+uid).set({ with:uid, ts:Date.now() });

  db.ref('privateMessages/'+cid).limitToLast(200).on('child_added',snap=>{
    const m=snap.val(); const row=document.createElement('div');
    row.style.margin='6px 0'; row.style.textAlign=m.from===uid?'right':'left';
    row.innerHTML = `<div style="font-weight:700">${m.from===uid?'Ви':(m.nick||'Користувач')}</div>${m.text?escapeHtml(m.text):''} ${m.image?('<br><img src="'+escapeHtml(m.image)+'" style="max-width:220px;border-radius:8px;margin-top:6px">'):''} <div style="font-size:12px;color:#64748b">(${new Date(m.ts).toLocaleTimeString()})</div>`;
    row.onclick=()=> openProfile(m.from===uid?otherUid:otherUid);
    thread.appendChild(row); thread.scrollTop=thread.scrollHeight;
    if(m.to===uid){ SND.dm(); showDmToast('Нове ЛС'); }
  });

  let dmImageFile=null;
  panel.querySelector('#dmFile').addEventListener('change', (e)=>{ dmImageFile = e.target.files[0] || null; });

  panel.querySelector('#dmSend').onclick=async()=>{
    const t=panel.querySelector('#dmText').value.trim();
    if(!t && !dmImageFile) return;
    let imageUrl=null;
    if(dmImageFile){
      const ref = storage.ref().child(`dm_images/${uid}/${Date.now()}_${dmImageFile.name}`);
      await ref.put(dmImageFile);
      imageUrl = await ref.getDownloadURL();
    }
    const pm={from:uid,to:otherUid,nick:auth.currentUser.displayName||'Користувач',text:t||null,image:imageUrl||null,ts:Date.now()};
    await db.ref('privateMessages/'+cid).push(pm);
    await db.ref('notifications/'+otherUid).push({ ts:Date.now(), type:'dm', text:`Нове ЛС від ${auth.currentUser.displayName||'Користувач'}`, from:uid, convoId:cid });
    await db.ref('inboxMeta/'+uid+'/'+otherUid).update({ last:t||'[фото]', ts:pm.ts });
    await db.ref('inboxMeta/'+otherUid+'/'+uid).update({ last:t||'[фото]', ts:pm.ts });
    panel.querySelector('#dmText').value=''; dmImageFile=null; panel.querySelector('#dmFile').value='';
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
      <div style="display:flex;gap:6px"><button class="tab-button btn-accept">✅ Прийняти</button><button class="tab-button danger btn-decline">✖</button></div>`;
      item.querySelector('.btn-accept').onclick=()=>acceptFriend(fromUid);
      item.querySelector('.btn-decline').onclick=()=>declineFriend(fromUid);
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
        <div style="display:flex;gap:6px">
          <button class="tab-button btn-pm">✉️</button>
          <button class="tab-button btn-open">👀</button>
        </div>`;
      d.querySelector('.btn-open').onclick=()=>openProfile(fid);
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

// ===== Admin modal open (members button opens bot/theme panel)
document.getElementById('membersBtn').addEventListener('click', ()=>{
  if(!auth.currentUser){ showAuth(); return; }
  if(auth.currentUser.email !== ADMIN_EMAIL){ pushNotif({type:'system',text:'Тільки для адміна'}); return; }
  document.getElementById('adminPanel').classList.add('show');
  loadBots();
  loadTheme();
});
document.getElementById('adminClose').onclick=()=> document.getElementById('adminPanel').classList.remove('show');

// ===== Admin theme controls
function loadTheme(){
  db.ref('settings/theme/wallUrl').get().then(s=>{
    const v = s.val() || '';
    document.getElementById('wallUrlInput').value = v;
  });
}
document.getElementById('wallSave').onclick=async()=>{
  const url = document.getElementById('wallUrlInput').value.trim();
  await db.ref('settings/theme/wallUrl').set(url);
  document.documentElement.style.setProperty('--wall-url', `url('${url}')`);
  localStorage.removeItem('wallUrl'); // чтобы использовать глобальную
  pushNotif({type:'ok',text:'Обої збережено для всіх'});
};
document.getElementById('wallApplyLocal').onclick=()=>{
  const url = document.getElementById('wallUrlInput').value.trim();
  localStorage.setItem('wallUrl', url);
  document.documentElement.style.setProperty('--wall-url', `url('${url}')`);
  pushNotif({type:'ok',text:'Обої застосовано тільки вам'});
};

// ===== Bot manager (settings/bots)
function botKey(id){ return 'settings/bots/'+id; }

async function loadBots(){
  const list = document.getElementById('botList'); list.innerHTML='';
  const snap = await db.ref('settings/bots').get();
  const bots = snap.val()||{};
  Object.entries(bots).forEach(([id,b])=>{
    const card = document.createElement('div'); card.className='bot-card';
    card.innerHTML = `<b>${b.nick||id}</b> · інтервал: ${b.minutes||3} хв
      <div style="font-size:13px;color:#64748b">${b.text||''}</div>
      ${b.image?('<img src="'+b.image+'" style="max-width:180px;margin-top:6px;border-radius:8px">'):''}
      <div class="row" style="margin-top:6px;display:flex;gap:8px">
        <button class="tab-button" data-act="post" data-id="${id}">⚡️ Пост зараз</button>
        <button class="tab-button danger" data-act="del" data-id="${id}">Видалити</button>
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll('button[data-act]').forEach(btn=>{
    const id = btn.dataset.id; const act=btn.dataset.act;
    btn.onclick = async ()=>{
      if(act==='post'){
        const b = (await db.ref(botKey(id)).get()).val()||{};
        const msg = { uid:'bot_'+id, nick:b.nick||'Бот', avatar:b.avatar||'public/images/bot1.jpg', text:b.text||'', image:b.image||null, ts:Date.now() };
        await db.ref('messages').push(msg);
        pushNotif({type:'ok',text:'Опубліковано'});
      }else if(act==='del'){
        await db.ref(botKey(id)).remove();
        loadBots();
      }
    };
  });
}

document.getElementById('botCreate').onclick=async()=>{
  const nick = document.getElementById('botNick').value.trim() || 'Бот';
  const avatar = document.getElementById('botAvatar').value.trim() || 'public/images/bot1.jpg';
  const text  = document.getElementById('botText').value.trim();
  const image = document.getElementById('botImage').value.trim() || null;
  const minutes = Math.max(1, Number(document.getElementById('botInterval').value)||3);
  const id = nick.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,24) || ('b'+Date.now());
  await db.ref(botKey(id)).set({ nick, avatar, text, image, minutes });
  loadBots();
  pushNotif({type:'ok',text:'Бот збережений'});
};

document.getElementById('botPostOnce').onclick=async()=>{
  const nick = document.getElementById('botNick').value.trim() || 'Бот';
  const avatar = document.getElementById('botAvatar').value.trim() || 'public/images/bot1.jpg';
  const text  = document.getElementById('botText').value.trim();
  const image = document.getElementById('botImage').value.trim() || null;
  const msg = { uid:'bot_once', nick, avatar, text, image, ts:Date.now() };
  await db.ref('messages').push(msg);
  pushNotif({type:'ok',text:'Опубліковано разово'});
};
