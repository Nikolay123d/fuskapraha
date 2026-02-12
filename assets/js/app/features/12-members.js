// === Members (online) ===
let offMembers=null;
async function loadMembers(){
  const feed = $('#membersFeed'); if(!feed) return;
  const q = ($('#membersSearch')?.value||'').toLowerCase().trim();
  feed.innerHTML = '';
  const stopSeq = startMiniSequence('membersMiniLoad', [
    'Načítám účastníky…',
    'Šifruji přítomnost…',
    'Synchronizuji online…'
  ], 650);
  if(offMembers){ offMembers(); offMembers=null; }

  // Listen to online presence (last activity timestamp).
  let firstPaint = true;
  const ref = db.ref('presence').orderByChild('ts').limitToLast(200);
  const cb = async (snap)=>{
    const pres = snap.val()||{};
    const now = Date.now();
    const uids = Object.keys(pres).filter(uid=>{
      const ts = pres[uid]?.ts||0;
      return (now - ts) < 5*60*1000; // online in last 5 min
    }).reverse();

    // render
    feed.innerHTML='';
    for(const uid of uids){
      try{
        const up = await db.ref('usersPublic/'+uid).get();
        const pu = up.val()||{};
        const nick = String(pu.nick||pu.name||'Uživatel');
        if(q && !nick.toLowerCase().includes(q)) continue;

        const row = document.createElement('div');
        row.className='member';
        const isAdm = isAdminUser(auth.currentUser);
        row.innerHTML =
          `<div class="ava"><img src="${esc(pu.avatar||window.DEFAULT_AVATAR)}"></div>`+
          `<div class="meta"><div class="name">${esc(nick)}</div>`+
          `<div class="sub">${esc(uid)}</div></div>`+
          `<div class="acts">`+
            `<button class="ghost" data-act="dm" data-uid="${esc(uid)}">DM</button>`+
            (isAdm ? `<button class="ghost" data-act="ban" data-uid="${esc(uid)}">Ban 24h</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="mute" data-uid="${esc(uid)}">Mute 24h</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="grant7" data-uid="${esc(uid)}">Donat 7d</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="grant30" data-uid="${esc(uid)}">Donat 30d</button>` : ``)+
          `</div>`;
        row.addEventListener('click', (e)=>{
          const btn = e.target?.closest('button'); 
          if(!btn) return;
          e.preventDefault(); e.stopPropagation();
          const act = btn.dataset.act;
          const tuid = btn.dataset.uid;
          if(act==='dm'){ openDM(tuid); return; }
          if(!isAdminUser(auth.currentUser)) return;
          if(act==='ban'){
            if(confirm('Ban uživatele na 24h?')){
              db.ref('bans/'+tuid).set({until: Date.now()+24*60*60*1000, by: auth.currentUser.uid, ts: Date.now()});
            }
          }
          if(act==='mute'){
            if(confirm('Mute uživatele na 24h?')){
              db.ref('mutes/'+tuid).set({until: Date.now()+24*60*60*1000, by: auth.currentUser.uid, ts: Date.now()});
            }
          }
          if(act==='grant7' || act==='grant30'){
            const days = (act==='grant7') ? 7 : 30;
            if(confirm('Vydat donat / privilegium na '+days+' dní?')){
              const until = Date.now() + days*24*60*60*1000;
              db.ref('grants/'+tuid).push({type:'donation', until, ts: Date.now(), by: auth.currentUser.uid});
              toast('Vydáno: '+days+' dní');
            }
          }
        });
        feed.appendChild(row);
      }catch{}
    }

    // Stop mini-loader after first real paint.
    if(firstPaint){
      firstPaint = false;
      setMiniLoad('membersMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
    }
  };
  ref.on('value', cb);
  offMembers=()=>ref.off('value', cb);

  // Failsafe: if rules block presence read, the callback may never fire.
  setTimeout(()=>{
    if(firstPaint){
      firstPaint=false;
      setMiniLoad('membersMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
    }
  }, 1500);
}


async function loadFriends(){
  const stopSeq = startMiniSequence('friendsMiniLoad', [
    'Načítám přátele…',
    'Šifruji seznam přátel…',
    'Synchronizuji žádosti…'
  ], 650);
  const me=auth.currentUser;
  if(!me){
    // Not logged in: stop mini-loader to avoid a permanent spinner.
    try{ stopSeq && stopSeq(); }catch(e){}
    setMiniLoad('friendsMiniLoad','', false);
    return;
  }
  const reqBox=$('#friendsRequests');
  const listBox=$('#friendsList');
  // Instant paint from cache (avoid empty friends screen).
  let __hadFriendsCache = false;
  try{
    const ck = __cacheKey('friends');
    const cached = __cacheGet(ck, 12*60*60*1000);
    if(cached && cached.val){
      __hadFriendsCache = true;
      if(reqBox && typeof cached.val.reqHtml==='string'){
        reqBox.innerHTML = cached.val.reqHtml;
        reqBox.style.display = cached.val.reqHtml ? 'flex' : 'none';
      }
      if(listBox && typeof cached.val.listHtml==='string'){
        listBox.innerHTML = cached.val.listHtml;
      }
    }
  }catch(e){}
  if(!__hadFriendsCache){
    if(reqBox){ reqBox.innerHTML=''; reqBox.style.display='none'; }
    if(listBox) listBox.innerHTML='';
  }
  const reqEmpty=$('#friendsReqEmpty');
  const listEmpty=$('#friendsListEmpty');
  if(reqEmpty) reqEmpty.style.display='none';
  if(listEmpty) listEmpty.style.display='none';

  try{
    // incoming requests
    const rq=(await db.ref('friendRequests/'+me.uid).get()).val()||{};
    const pendingUids = Object.keys(rq||{});
    const cnt=pendingUids.length;

  const topBadge=document.getElementById('friendsBadgeTop');
  const tabBadge=document.getElementById('friendsBadgeTab');
  if(topBadge){ topBadge.textContent = cnt ? String(cnt) : ''; topBadge.style.display = cnt ? 'inline-flex' : 'none'; }
  if(tabBadge){ tabBadge.textContent = cnt ? ('('+cnt+')') : ''; }
  const inlineBadge=document.getElementById('friendsBadgeInline');
  if(inlineBadge){ inlineBadge.textContent = cnt ? ('('+cnt+')') : ''; }

  const reqSection = document.getElementById('friendsReqSection');
  if(cnt===0){
    if(reqSection) reqSection.style.display='none';
  }else if(reqBox){
    if(reqSection) reqSection.style.display='flex';
    reqBox.style.display='flex';
    const note=document.getElementById('friendsReqNote');
    if(note) note.textContent = 'Máte nové žádosti o přátelství ('+cnt+')';

    // prevent duplicates when cache already painted
    reqBox.innerHTML="";

    for(const uid of pendingUids){
      reqBox.appendChild(await friendItem(uid, 'pending'));
    }
  }

    // accepted friends
    const fr=(await db.ref('friends/'+me.uid).get()).val()||{};
    const friendsUids = Object.keys(fr||{});
    if(friendsUids.length===0){
      if(listEmpty) listEmpty.style.display='block';
    }else if(listBox){
      for(const [uid,st] of Object.entries(fr)){
        listBox.appendChild(await friendItem(uid, st || 'friend'));
      }
    }

    // Cache final render
    try{
      __cacheSet(__cacheKey('friends'), { reqHtml: reqBox ? reqBox.innerHTML : '', listHtml: listBox ? listBox.innerHTML : '' });
    }catch(e){}
  }catch(e){
    console.warn('loadFriends failed', e);
  }finally{
    setMiniLoad('friendsMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){}
  }

  // If we arrived here from a notification, highlight the matching request/item
  try{
    const hi = window.__HIGHLIGHT_FRIEND_UID__;
    if(hi){
      const el = document.querySelector(`#view-friends .msg[data-uid="${String(hi)}"]`);
      if(el){
        el.style.outline = '2px solid rgba(255, 193, 7, .95)';
        el.style.borderRadius = '12px';
        setTimeout(()=>{ try{ el.style.outline=''; }catch(e){} }, 2500);
        try{ el.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){}
      }
      window.__HIGHLIGHT_FRIEND_UID__ = null;
    }
  }catch(e){}

  // realtime listen for incoming requests (badge refresh)
  if(FR_REQ_REF){ try{ FR_REQ_REF.off(); }catch(e){} }
  FR_REQ_REF=db.ref('friendRequests/'+me.uid);
  FR_REQ_REF.on('value', (snap)=>{
    const val=snap.val()||{};
    const sig=Object.keys(val).sort().join('|');
    if(sig===__friendsReqSig) return;
    __friendsReqSig=sig;
    if(__friendsReqTimer) clearTimeout(__friendsReqTimer);
    __friendsReqTimer=setTimeout(()=>loadFriends(), 200);
  });
}
$('#friendAddBtn')?.addEventListener('click', async ()=>{
  try{
    const me=auth.currentUser; if(!me){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(me.emailVerified===false){
      const until=getVerifyDeadline(me);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
    const email=$('#friendEmail').value.trim(); if(!email) return;
    const uid = await resolveUidByEmail(email);
    if(!uid) return alert('Email neznám');
    await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
    // Bell notification for receiver
    try{ await db.ref('notifications/'+uid).push({ts:Date.now(), type:'friend', from:me.uid}); }catch(e){}
    toast('Žádost odeslána'); playSound('ok');
    $('#friendEmail').value='';
  }catch(e){ console.error(e); playSound('err'); toast('Chyba'); }
});

// Tab lifecycle support: detach listeners when leaving corresponding tabs
window.__membersUnsub = function(){
  try{ if(offMembers){ offMembers(); offMembers=null; } }catch(e){}
};

window.__friendsUnsub = function(){
  try{ if(FR_REQ_REF){ FR_REQ_REF.off(); FR_REQ_REF=null; } }catch(e){}
  try{ if(__friendsReqTimer){ clearTimeout(__friendsReqTimer); __friendsReqTimer=null; } }catch(e){}
};

