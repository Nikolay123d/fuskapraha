// ===== Stage 5 UI enhancements (friends inbox, DM threads, profile locks, bots/admin) =====
(function(){
  const db = firebase.database(); const auth = firebase.auth();

  // --- modal helpers ---
  // --- Modal helpers (stack + backdrop + ESC) ---
  const __openModals = new Set();
  function openModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    // close any other modal of the same "layer" to prevent invisible overlays blocking clicks
    document.querySelectorAll('.modal').forEach(m=>{
      if(!m.hidden && m.id !== id) m.hidden = true;
    });
    el.hidden = false;
    __openModals.add(id);
    document.body.classList.add('modal-open');
    // NOTE: we intentionally do NOT pushState here.
    // On some setups it caused "stuck" UI after closing (especially with hash routing).
    // Mobile back button support can be added later via a dedicated modal route.
  }
  function closeModal(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.hidden = true;
    __openModals.delete(id);
    if(__openModals.size===0) document.body.classList.remove('modal-open');
  }

  // Expose modal helpers for inline onclick handlers
  try{ if(!window.openModal) window.openModal = openModal; }catch(e){}
  try{ if(!window.closeModal) window.closeModal = closeModal; }catch(e){}

  // Backdrop click closes
  document.addEventListener('click', (e)=>{
    const m = e.target && e.target.classList && e.target.classList.contains('modal') ? e.target : null;
    if(m && !m.hidden){
      closeModal(m.id);
    }
  }, true);
  // ESC closes topmost
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && __openModals.size){
      const last = Array.from(__openModals).slice(-1)[0];
      closeModal(last);
    }
  });
  // Browser back closes modal if open
  window.addEventListener('popstate', ()=>{
    if(__openModals.size){
      const last = Array.from(__openModals).slice(-1)[0];
      closeModal(last);
    }
  });


  // --- Auth modal wiring ---
  document.getElementById('authClose')?.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();
    closeModalAuth();
  });
  document.getElementById('authSwitchToRegister')?.addEventListener('click', ()=>openModalAuth('register'));
  document.getElementById('authSwitchToLogin')?.addEventListener('click', ()=>openModalAuth('login'));
  document.getElementById('authLoginBtn')?.addEventListener('click', async ()=>{
    try{ await handleLogin(); }catch(e){ toast(e.message||'Chyba'); }
  });
  document.getElementById('authRegisterBtn')?.addEventListener('click', async ()=>{
    try{ await handleRegister(); }catch(e){ toast(e.message||'Chyba'); }
  });
  document.getElementById('authGoogleBtn')?.addEventListener('click', async ()=>{
    try{ await googleSignIn(); closeModalAuth(); }catch(e){ toast(e.message||'Chyba'); }
  });
  document.getElementById('authResendVerify')?.addEventListener('click', resendVerification);

  // DM mobile back/close
  document.getElementById('dmBackMobile')?.addEventListener('click', ()=>{
    // User intentionally returned to DM LIST
    try{ setDmState('list', null); }catch(e){}
    try{ window.__DM_RESTORE_PEER__=''; window.__DM_ROOM_RESTORED__=false; }catch(e){} try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){} });
  document.getElementById('dmMobileClose')?.addEventListener('click', ()=>{ try{ window.closeDmMobile && window.closeDmMobile(); }catch(e){} });

  document.getElementById('friendAddOpen')?.addEventListener('click', ()=>openModal('modalFriendAdd'));
  document.getElementById('modalFriendClose')?.addEventListener('click', ()=>closeModal('modalFriendAdd'));
  document.getElementById('dmNewBtn')?.addEventListener('click', async ()=>{
  const me=auth.currentUser;
  if(!me){ openModalAuth('login'); return; }
  const raw = prompt('Zadejte UID nebo e-mail uživatele:');
  if(!raw) return;
  let to = raw.trim();
  if(!to) return;
  if(to.includes('@')){
    const uid = await resolveUidByEmail(to);
    if(!uid){ alert('Email neznám'); return; }
    to = uid;
  }
  const room = await startDM(to);
  if(room){
    currentDmRoom = room;
    currentDmPeerUid = to;
    showView('view-dm');
  }
});
  document.getElementById('modalDmClose')?.addEventListener('click', ()=>closeModal('modalDmNew'));
  document.getElementById('userCardClose')?.addEventListener('click', ()=>closeModal('modalUserCard'));

  // --- Friends: split requests and accepted list ---
  async function renderFriendCard(uid, st){
    const u = await getUser(uid);
    const wrap=document.createElement('div'); wrap.className='msg';
    wrap.innerHTML = `
      <div class="ava" data-uid="${uid}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}" alt=""></div>
      <div class="bubble" style="width:100%">
        <div class="name" data-uid="${uid}"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${u.online?'online':'offline'}</span></div>
        <div class="actions">
          <button data-act="dm">Napsat</button>
          ${st==='pending' ? `<button data-act="accept">Přijmout</button>` : ``}
          ${st!=='pending' ? `<button data-act="remove">Odebrat</button>` : `<button data-act="decline">Odmítnout</button>`}
        </div>
      </div>`;
    wrap.addEventListener('click', async (e)=>{
      const act = e.target?.dataset?.act;
      if(!act) return;
      const me = auth.currentUser; if(!me) return toast('Přihlaste se');
      if(act==='dm'){ openDMRoom(me.uid, uid); showView('view-dm'); }
      if(act==='accept'){
        await db.ref('friends/'+me.uid+'/'+uid).set('accepted');
        await db.ref('friends/'+uid+'/'+me.uid).set('accepted');
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        await loadFriendsUI();
      }
      if(act==='decline'){
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        await loadFriendsUI();
      }
      if(act==='remove'){
        await db.ref('friends/'+me.uid+'/'+uid).remove();
        await db.ref('friends/'+uid+'/'+me.uid).remove();
        await loadFriendsUI();
      }
    });
    // avatar click => user card
    wrap.querySelector('.ava')?.addEventListener('click', (ev)=>{ ev.stopPropagation(); showUserCard(uid); });
    return wrap;
  }

  async function loadFriendsUI(){
    const me = auth.currentUser; if(!me) return;
    const reqBox=document.getElementById('friendsRequests');
    const listBox=document.getElementById('friendsList');
    if(reqBox){ reqBox.innerHTML=''; reqBox.style.display='none'; }
    if(listBox) listBox.innerHTML='';
    const rq=(await db.ref('friendRequests/'+me.uid).get()).val()||{};
    const fr=(await db.ref('friends/'+me.uid).get()).val()||{};
    const rqUids = Object.keys(rq);
    for(const uid of rqUids){
      reqBox && reqBox.appendChild(await renderFriendCard(uid, 'pending'));
    }
    const frEntries = Object.entries(fr).filter(([_,st])=>st==='accepted');
    for(const [uid,st] of frEntries){
      listBox && listBox.appendChild(await renderFriendCard(uid, st));
    }
    const badge = document.getElementById('friendsBadge');
    const badge2 = document.getElementById('friendsBadgeInline');
    const n = rqUids.length;
    if(badge){ badge.textContent = n?`(${n})`:''; }
    if(badge2){ badge2.textContent = n?`(${n})`:''; }
    const sum=document.getElementById('friendsSummary');
    if(sum) sum.textContent = `(${frEntries.length} přátel, ${n} žádostí)`;
  }

  // Hook: when tab opened
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('[data-view="view-friends"]');
    if(t){ setTimeout(()=>{ if(auth.currentUser) loadFriendsUI(); }, 60); }
  });

  // Friends: add by email (modal)
  document.getElementById('friendAddBtn')?.addEventListener('click', async ()=>{
    try{
      const me=auth.currentUser; if(!me){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(me.emailVerified===false){
      const until=getVerifyDeadline(me);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
      const email=(document.getElementById('friendEmail')?.value||'').trim();
      if(!email) return toast('Zadejte e-mail');
      toast('Přidání přátel podle e-mailu je dočasně vypnuto');
      return;
      if(uid===me.uid) return toast('Nelze přidat sebe');
      await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
    // Bell notification for receiver
    try{ await db.ref('notifications/'+uid).push({ts:Date.now(), type:'friend', from:me.uid}); }catch(e){}
      toast('Žádost odeslána'); closeModal('modalFriendAdd');
      // notify receiver
      try{
        await db.ref('notifications/'+uid).push({type:'friend', from:me.uid, ts:Date.now(), text:'Nová žádost o přátelství'});
      }catch{}
      loadFriendsUI();
    }catch(e){ console.error(e); toast('Chyba'); }
  });

  // --- User profile modal (public) ---
  async function getFriendState(meUid, otherUid){
    if(!meUid || !otherUid) return 'none';
    const fr = (await db.ref('friends/'+meUid+'/'+otherUid).get()).val();
    if(fr==='accepted') return 'friends';
    const reqIn = (await db.ref('friendRequests/'+meUid+'/'+otherUid).get()).val();
    if(reqIn) return 'incoming';
    const reqOut = (await db.ref('friendRequests/'+otherUid+'/'+meUid).get()).val();
    if(reqOut) return 'outgoing';
    return 'none';
  }

  async function loadVacanciesInto(container, uid){
    const feed = document.getElementById(container);
    const empty = document.getElementById('userCardVacEmpty');
    if(!feed) return;
    feed.innerHTML = '';
    if(empty) empty.style.display='none';
    const snap = await db.ref('vacancies/'+uid).orderByChild('ts').limitToLast(20).get();
    const v = snap.val()||{};
    const ids = Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));
    if(ids.length===0){
      if(empty) empty.style.display='';
      return;
    }
    for(const id of ids){
      const it=v[id]||{};
      const div=document.createElement('div');
      div.className='vac-item';
      div.innerHTML = `<div class="t">${esc(it.title||'Inzerát')}</div>
        <div class="m">${esc(it.city||'')} · ${new Date(it.ts||0).toLocaleString()}</div>
        <div class="d">${esc(it.text||'')}</div>`;
      feed.appendChild(div);
    }
  }

  async function loadRating(uid){
    const snap = await db.ref('ratings/'+uid).get();
    const v = snap.val()||{};
    const arr = Object.values(v).filter(x=>typeof x==='number');
    const avg = arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    return {avg, count: arr.length};
  }

  function renderStars(containerId, value, onPick){
    const el=document.getElementById(containerId);
    if(!el) return;
    el.innerHTML='';
    for(let i=1;i<=5;i++){
      const b=document.createElement('button');
      b.type='button';
      b.textContent='★';
      b.className = i<=value ? 'on' : 'off';
      b.addEventListener('click', ()=> onPick(i));
      el.appendChild(b);
    }
  }

  async function showUserCard(uid){
    const me = auth.currentUser;
    const u = await getUser(uid);

    const ava=document.getElementById('userCardAva');
    const nick=document.getElementById('userCardNick');
    const role=document.getElementById('userCardRole');
    const online=document.getElementById('userCardOnline');

    if(ava) ava.src = u.avatar||window.DEFAULT_AVATAR;
    if(nick) nick.textContent = u.nick||'Uživatel';
    if(role) role.textContent = u.role==='employer' ? 'Zaměstnavatel' : 'Hledám práci';
    if(online) online.textContent = u.online ? 'online' : 'offline';

    const plan=document.getElementById('userCardPlan');
    const admin=document.getElementById('userCardAdmin');
    const planVal = String(u.plan||'').toLowerCase();
    const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
    if(plan){
      plan.style.display = isPrem ? '' : 'none';
      plan.textContent = isPrem ? String(planVal).toUpperCase() : 'PREMIUM';
    }
    const isAdm = (uid === window.ADMIN_UID);
    if(admin){ admin.style.display = isAdm ? '' : 'none'; }

    const aboutEl=document.getElementById('userCardAbout');
    if(aboutEl) aboutEl.textContent = u.about||'';

    const cW=document.getElementById('userCardCompanyWrap');
    const pW=document.getElementById('userCardPhoneWrap');
    const sW=document.getElementById('userCardSkillsWrap');
    if(cW){ cW.style.display = u.company ? '' : 'none'; document.getElementById('userCardCompany').textContent=u.company||''; }
    if(pW){ pW.style.display = u.phone ? '' : 'none'; document.getElementById('userCardPhone').textContent=u.phone||''; }
    if(sW){ sW.style.display = u.skills ? '' : 'none'; document.getElementById('userCardSkills').textContent=u.skills||''; }

    // rating
    const rate = await loadRating(uid);
    const rText=document.getElementById('userCardRatingText');
    if(rText) rText.textContent = rate.count ? `⭐ ${rate.avg.toFixed(1)} / 5 (${rate.count})` : 'Bez hodnocení';
    let myRating = 0;
    if(me){
      const my = (await db.ref('ratings/'+uid+'/'+me.uid).get()).val();
      myRating = (typeof my==='number') ? my : 0;
    }
    renderStars('userCardStars', myRating||Math.round(rate.avg||0), async (n)=>{
      if(!me) return toast('Přihlaste se');
      await db.ref('ratings/'+uid+'/'+me.uid).set(n);
      toast('Hodnocení uloženo'); playSound('ok');
      const r2=await loadRating(uid);
      if(rText) rText.textContent = r2.count ? `⭐ ${r2.avg.toFixed(1)} / 5 (${r2.count})` : 'Bez hodnocení';
      renderStars('userCardStars', n, ()=>{});
    });

    // friend buttons state
    const dmBtn=document.getElementById('userCardDm');
    const addBtn=document.getElementById('userCardAddFriend');
    const rmBtn=document.getElementById('userCardRemoveFriend');

    const state = await getFriendState(me?.uid, uid);
    if(addBtn) addBtn.style.display = (state==='friends') ? 'none' : '';
    if(rmBtn) rmBtn.style.display = (state==='friends') ? '' : 'none';
    if(addBtn){
      addBtn.textContent = state==='incoming' ? '✅ Přijmout' : (state==='outgoing' ? '⏳ Odesláno' : '👥 Přidat');
      addBtn.disabled = (state==='outgoing');
    }

    dmBtn && (dmBtn.onclick = ()=>{
      if(!me) return toast('Přihlaste se');
      startDM(uid, {closeModalId:'modalUserCard'});
    });

    addBtn && (addBtn.onclick = async ()=>{
      if(!me) return toast('Přihlaste se');
      if(state==='incoming'){
        await db.ref('friends/'+me.uid+'/'+uid).set('accepted');
        await db.ref('friends/'+uid+'/'+me.uid).set('accepted');
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        toast('Přátelství potvrzeno'); playSound('ok');
      }else if(state==='none'){
        await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
    // Bell notification for receiver
    try{ await db.ref('notifications/'+uid).push({ts:Date.now(), type:'friend', from:me.uid}); }catch(e){}
        toast('Žádost odeslána'); playSound('ok');
        // notify receiver
        try{ await db.ref('notifications/'+uid).push({type:'friend', from:me.uid, ts:Date.now(), text:'Nová žádost o přátelství'}); }catch{}
      }
      closeModal('modalUserCard');
      loadFriendsUI?.();
    });

    rmBtn && (rmBtn.onclick = async ()=>{
      if(!me) return toast('Přihlaste se');
      await db.ref('friends/'+me.uid+'/'+uid).remove();
      await db.ref('friends/'+uid+'/'+me.uid).remove();
      toast('Odebráno'); playSound('ok');
      closeModal('modalUserCard');
      loadFriendsUI?.();
    });

    document.getElementById('userCardReport')?.addEventListener('click', async ()=>{
      if(!me) return toast('Přihlaste se');
      const txt = prompt('Napište důvod (krátce):','spam');
      if(!txt) return;
      await db.ref('reportsUsers/'+uid).push({from:me.uid, ts:Date.now(), text:txt});
      toast('Nahlášeno'); playSound('ok');
    }, {once:true});

    openModal('modalUserCard');
    await loadVacanciesInto('userCardVacancies', uid);
  }
  window.showUserCard = showUserCard;

  
  // --- Vacancies (employers) ---
  async function loadMyVacancies(){
    const me = auth.currentUser; if(!me) return;
    const feed=document.getElementById('myVacancies'); if(!feed) return;
    feed.innerHTML='';
    // NOTE: do NOT use chatMiniLoad here (it caused stuck chat loader when opening profile)
    try{
    const snap = await db.ref('vacancies/'+me.uid).orderByChild('ts').limitToLast(20).get();
    const v=snap.val()||{};
    const ids=Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));
    for(const id of ids){
      const it=v[id]||{};
      const div=document.createElement('div');
      div.className='vac-item';
      div.innerHTML = `<div class="t">${esc(it.title||'Inzerát')}</div>
        <div class="m">${esc(it.city||'')} · ${new Date(it.ts||0).toLocaleString()}</div>
        <div class="d">${esc(it.text||'')}</div>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="ghost" data-del-vac="${id}" type="button">Smazat</button>
        </div>`;
      div.querySelector('[data-del-vac]')?.addEventListener('click', async ()=>{
        if(!confirm('Smazat inzerát?')) return;
        await db.ref('vacancies/'+me.uid+'/'+id).remove();
        toast('Smazáno'); playSound('ok');
        loadMyVacancies();
      });
      feed.appendChild(div);
    }
    }finally{
      try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
    }
  }
  window.loadMyVacancies = loadMyVacancies;

  async function notifyFriendsAboutVacancy(meUid, vac){
    const fr=(await db.ref('friends/'+meUid).get()).val()||{};
    const friendUids = Object.keys(fr).filter(uid=>fr[uid]==='accepted');
    const payload = {type:'vacancy', from:meUid, ts:Date.now(), title:vac.title||'Nová nabídka práce', text:vac.text?.slice(0,140)||''};
    const updates={};
    for(const f of friendUids){
      const key = db.ref('notifications/'+f).push().key;
      updates['notifications/'+f+'/'+key]=payload;
    }
    if(Object.keys(updates).length) await db.ref().update(updates);
  }

  document.getElementById('vacPublish')?.addEventListener('click', async ()=>{
    const me = auth.currentUser; if(!me) return toast('Přihlaste se');
    const pub = await fetchUserPublic(me.uid);
    if(pub.role!=='employer') return toast('Tato funkce je jen pro zaměstnavatele');
    const title=(document.getElementById('vacTitle')?.value||'').trim();
    const text=(document.getElementById('vacText')?.value||'').trim();
    const city=(document.getElementById('vacCity')?.value||getCity());
    if(!title || !text) return toast('Vyplňte název a popis');
    const vac = {title, text, city, ts:Date.now(), by:me.uid};
    const id = db.ref('vacancies/'+me.uid).push().key;
    const updates={};
    updates['vacancies/'+me.uid+'/'+id]=vac;
    // also store to user public lastVacancy (optional)
    updates['usersPublic/'+me.uid+'/lastVacTs']=vac.ts;
    await db.ref().update(updates);
    toast('Inzerát zveřejněn'); playSound('ok');
    // notify friends looking for job
    try{ await notifyFriendsAboutVacancy(me.uid, vac); }catch(e){ console.warn(e); }
    // clear form
    if(document.getElementById('vacTitle')) document.getElementById('vacTitle').value='';
    if(document.getElementById('vacText')) document.getElementById('vacText').value='';
    loadMyVacancies();
  });

  // --- Notifications ---
  let NOTIF_CHILD_REF=null;
let NOTIF_REF=null;
  function listenNotifications(){
    const me=auth.currentUser; if(!me) return;
    const feed=document.getElementById('notifFeed');
    if(!feed) return;
    if(NOTIF_REF){ try{ NOTIF_REF.off(); }catch{} }
    NOTIF_REF=db.ref('notifications/'+me.uid).orderByChild('ts').limitToLast(50);
    if(NOTIF_CHILD_REF){ try{ NOTIF_CHILD_REF.off(); }catch{} }
    NOTIF_CHILD_REF=db.ref('notifications/'+me.uid).orderByChild('ts').startAt(Date.now());
    NOTIF_CHILD_REF.on('child_added', async s=>{
      const n=s.val()||{};
      if(!n.ts) return;
      if(document.visibilityState==='visible') return;
      const fromU = n.from ? await getUser(n.from) : null;
      const name = fromU?.nick || 'Uživatel';
      if(n.type==='dm') notify('Nová DM', name+': '+(n.text||''), 'dm');
      else if(n.type==='friend') notify('Žádost o přátelství', name, 'friend');
      else notify('Upozornění', n.text||'', 'notify');
    });
    NOTIF_REF.on('value', async snap=>{
      try{ setMiniLoad('chatMiniLoad','', false); }catch(e){}
      const v=snap.val()||{};
      const ids=Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));
      // dmBadge = unread from inboxMeta watcher; friends badge is driven by friendRequests


      feed.innerHTML='';
      // (no chat mini loader here)
      let unread=0;
      for(const id of ids){
        const n=v[id]||{};
        const fromU = n.from ? await getUser(n.from) : null;
        const row=document.createElement('div');
        row.className='msg';
        row.innerHTML = `
          <div class="ava" ${n.from?`data-uid="${esc(n.from)}"`:''}><img src="${esc(fromU?.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="name">${esc(n.title||n.text||'Upozornění')}</div>
            <div class="muted" style="font-size:12px">${new Date(n.ts||0).toLocaleString()}</div>
            ${n.type==='vacancy' ? `<div class="muted">Přítel zveřejnil novou nabídku práce</div>`:''}
          </div>
          <button class="ghost" data-del-notif="${id}" type="button">×</button>`;
        row.querySelector('[data-del-notif]')?.addEventListener('click', async (ev)=>{
          ev.stopPropagation();
          await db.ref('notifications/'+me.uid+'/'+id).remove();
        });

        // v15: actions (open DM / accept friend / open premium)
        row.addEventListener('click', async ()=>{
          try{
            if(n.type==='dm' && n.from){
              closeModal('modalNotif');
              await startDM(n.from, {noBacklog:true});
              showView('view-dm');
              return;
            }
            if(n.type==='friend' && n.from){
              // Try accept directly if request exists
              const req = (await db.ref('friendRequests/'+me.uid+'/'+n.from).get()).val();
              if(req){
                await db.ref().update({
                  ['friends/'+me.uid+'/'+n.from]:'accepted',
                  ['friends/'+n.from+'/'+me.uid]:'accepted',
                  ['friendRequests/'+me.uid+'/'+n.from]: null
                });
                toast('Přátelství potvrzeno'); playSound('ok');
                await db.ref('notifications/'+me.uid+'/'+id).remove();
                try{ await loadFriendsUI(); }catch{}
              }else{
                // fallback: open friends view
                closeModal('modalNotif');
                showView('view-friends');
              }
              return;
            }
            if(n.type==='premiumGranted'){
              closeModal('modalNotif');
              openPremium?.();
              return;
            }
          }catch(e){ console.warn(e); }
        });

        // add inline buttons for friend requests (optional)
        if(n.type==='friend' && n.from){
          const bubble = row.querySelector('.bubble');
          if(bubble){
            const actions=document.createElement('div');
            actions.className='actions';
            actions.innerHTML = `<button data-act="accept">Přijmout</button><button data-act="decline" class="danger">Odmítnout</button>`;
            bubble.appendChild(actions);
            actions.addEventListener('click', async (e)=>{
              e.stopPropagation();
              const act=e.target?.dataset?.act;
              if(act==='accept'){
                await db.ref().update({
                  ['friends/'+me.uid+'/'+n.from]:'accepted',
                  ['friends/'+n.from+'/'+me.uid]:'accepted',
                  ['friendRequests/'+me.uid+'/'+n.from]: null
                });
                await db.ref('notifications/'+me.uid+'/'+id).remove();
                toast('Přijato'); playSound('ok');
                try{ await loadFriendsUI(); }catch{}
              }
              if(act==='decline'){
                await db.ref('friendRequests/'+me.uid+'/'+n.from).remove();
                await db.ref('notifications/'+me.uid+'/'+id).remove();
                toast('Odmítnuto');
                try{ await loadFriendsUI(); }catch{}
              }
            });
          }
        }

        feed.appendChild(row);
      }
      // badge
      const badge=document.getElementById('bellBadge');
      if(badge){ badge.textContent = ids.length ? String(ids.length) : ''; badge.style.display = ids.length? 'inline-flex':'none'; }
    });
  }


  // v15: watch my plan changes -> instant UI + notification entry (self-write)
  let __LAST_PLAN = null;
  function watchMyPlan(){
    const me=auth.currentUser; if(!me) return;
    db.ref('usersPublic/'+me.uid+'/plan').on('value', async (s)=>{
      const plan = s.val()||'';
      if(__LAST_PLAN===null){ __LAST_PLAN = plan; return; }
      if(plan && plan!==__LAST_PLAN){
        __LAST_PLAN = plan;
        // add local notification (user can write to own notifications)
        try{
          await db.ref('notifications/'+me.uid).push({ts:Date.now(), type:'premiumGranted', title:'Privilegium aktivováno', text:'Vaše Privilegium bylo potvrzeno.'});
        }catch(e){}
        toast('Privilegium aktivováno'); playSound('ok');
        try{ await refreshMe(); }catch{}
    try{ watchMyPlan(); }catch(e){}
      }else{
        __LAST_PLAN = plan;
      }
    });
  }
  document.getElementById('btnBell')?.addEventListener('click', ()=>{
    if(!auth.currentUser) return toast('Přihlaste se');
    openModal('modalNotif');
  });
  document.getElementById('notifClear')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!me) return;
    if(!confirm('Vyčistit upozornění?')) return;
    await db.ref('notifications/'+me.uid).remove();
    toast('Vyčištěno'); playSound('ok');
  });

// --- startDM() (stable entrypoint for profiles / buttons) ---
// Creates/opens DM room, ensures membership + inbox meta for both sides.
// NOTE: roomId format is dmKey(a,b) => "uidA_uidB" (sorted/consistent).
async function startDM(toUid, opts={}){
  const me = auth.currentUser;
  if(!me){ openModalAuth('login'); return null; }
  if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return null; }
  if(!toUid || typeof toUid!=='string') return null;
  toUid = toUid.trim();
  if(!toUid || toUid===me.uid) return null;

  const room = dmKey(me.uid, toUid);
  const ts = Date.now();

  // membership (RTDB rules: allow creator to add peer after own membership exists)
  try{
    // 1) set myself first
    await db.ref('privateMembers/'+room+'/'+me.uid).set(true);
    // 2) now rules allow me (as member) to add the peer
    await db.ref('privateMembers/'+room+'/'+toUid).set(true);

    // v15: if DM is with a bot, also add admin(s) as members + register bot room for auto-replies
    try{
      if(String(toUid).startsWith('bot_')){
        const admins = (window.ADMIN_UIDS && window.ADMIN_UIDS.length) ? window.ADMIN_UIDS : (window.ADMIN_UID ? [window.ADMIN_UID] : []);
        for(const a of admins){
          if(a && a!==me.uid) await db.ref('privateMembers/'+room+'/'+a).set(true);
        }
        await db.ref('botRooms/'+room).update({botUid:toUid, userUid:me.uid, ts, lastHandledTs: (opts && opts.noBacklog) ? Date.now() : 0});
      }
    }catch(e){ console.warn('bot DM register failed', e?.code||e); }

  }catch(e){
    console.warn('DM membership write blocked:', e?.code || e);
    // Even if peer write fails, at minimum my membership is set.
  }

  // inbox meta for quick thread list (write for both sides)
  try{
    const myPub = await getUser(me.uid);
    const toPub = await getUser(toUid);
    await Promise.all([
      db.ref('inboxMeta/'+me.uid+'/'+room).update({ ts, lastTs: ts, with: toUid, title: toPub.nick||'Uživatel', lastText:'', unread:0 }),
      db.ref('inboxMeta/'+toUid+'/'+room).update({ ts, lastTs: ts, with: me.uid, title: myPub.nick||'Uživatel', lastText:'', unread:0 })
    ]);
}catch(e){}

  await openDMRoom(me.uid, toUid);
  showView('view-dm');
  // Ensure the right pane is immediately usable on mobile/desktop
  try{
    document.body.classList.add('dm-room-open');
    const back = document.getElementById('dmBackMobile');
    if(back) back.style.display = '';
  }catch(e){}
  if(opts && opts.closeModalId){ try{ closeModal(opts.closeModalId); }catch(e){} }
  return room;
}
window.startDM = startDM;

// --- DM threads / inbox ---
  // NOTE: currentDmRoom/currentDmPeerUid are global (see DM globals above).
  function otherUidFromRoom(room, meUid){
    const parts = String(room).split('_');
    if(parts.length!==2) return null;
    return (parts[0]===meUid) ? parts[1] : parts[0];
  }

  async function loadDmThreads(){
    // Always show loader (even if DOM is not yet mounted on some mobile layouts)
    try{ setMiniLoad('dmMiniLoad','Načítáme soukromé zprávy…', true); }catch(e){}
    const box=document.getElementById('dmThreads');
    if(!box){
      // If DM DOM isn't ready yet, mark for reload after bootstrap/auth.
      window.__DM_NEEDS_LOAD__ = true;
      return;
    }

    const me = auth.currentUser;
    if(!me){
      // Auth not ready yet: keep the loader and let the main auth handler reload DM when ready.
      window.__DM_NEEDS_LOAD__ = true;
      setMiniLoad('dmMiniLoad','Přihlašujeme…', true);
      return;
    }

    // Instant paint from cache.
    try{
      const ck = __cacheKey('dmthreads');
      const cached = __cacheGet(ck, 12*60*60*1000);
      if(cached && cached.val && typeof cached.val.html==='string'){
        box.innerHTML = cached.val.html;
      }
    }catch(e){}

    try{
      const metaSnap = await db.ref('inboxMeta/'+me.uid).orderByChild('lastTs').limitToLast(50).get();
      const v = metaSnap.val()||{};
      const rooms = Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));

      // Avoid duplicates on re-open.
      box.innerHTML = '';

      for(const room of rooms){
        const other = otherUidFromRoom(room, me.uid);
        if(!other) continue;
        const u = await getUser(other);
        const row=document.createElement('div');
        row.className='msg';
        // NOTE: In DM list, tapping anywhere should open the conversation.
        // Profile opening is only via avatar tap (to avoid "opens profile instead of chat" on mobile).
        const avaSrc = esc(u.avatar || window.DEFAULT_AVATAR);
        row.innerHTML = `
        <div class="ava" data-uid="${esc(other)}"><img src="${avaSrc}" alt="" loading="lazy"></div>
        <div class="bubble" style="width:100%;cursor:pointer">
          <div class="name"><b>${esc(u.nick||'Uživatel')}</b> <span class="muted">${u.online?'online':'offline'}</span></div>
          <div class="muted" style="font-size:12px">${new Date(v[room].ts||0).toLocaleString()}</div>
        </div>`;
        row.addEventListener('click', ()=>{
          openDMRoom(me.uid, other);
          // Mobile UX: open room as overlay
          try{
            document.body.classList.add('dm-room-open');
            const back = document.getElementById('dmBackMobile');
            if(back) back.style.display = '';
          }catch(e){}
        });
        const avaEl = row.querySelector('.ava');
        const imgEl = avaEl?.querySelector('img');
        if(imgEl){
          imgEl.onerror = ()=>{ try{ imgEl.src = window.DEFAULT_AVATAR; }catch(e){} };
        }
        avaEl?.addEventListener('click',(ev)=>{ ev.stopPropagation(); showUserCard(other); });
        box.appendChild(row);
      }
      const label=document.getElementById('dmWithName');
      if(label && !currentDmRoom) label.textContent='Osobní zprávy';

      // Save cache after successful render.
      try{
        const ck = __cacheKey('dmthreads');
        __cacheSet(ck, { html: box.innerHTML });
      }catch(e){}
    }catch(e){
      console.warn('loadDmThreads failed', e);
    }finally{
      setMiniLoad('dmMiniLoad','', false);
    }
  }

  // Expose DM thread loader globally (used by topbar envelope + reload restore)
  try{ window.loadDmThreads = loadDmThreads; }catch(e){}

  // Override openDMRoom to set current room and update header
  const _origOpenDMRoom = window.openDMRoom;
  window.openDMRoom = async function(a,b){
    // Ensure DM becomes the active view (and persists across reload).
    try{ if(!document.getElementById('view-dm')?.classList.contains('active')) showView('view-dm'); }catch(e){}
    try{
      if(window.MK && window.MK.persist && window.MK.persist.view) window.MK.persist.view('view-dm');
      else { localStorage.setItem('lastView','view-dm'); localStorage.setItem('mk_last_view','view-dm'); }
    }catch(e){}
    currentDmRoom = dmKey(a,b);
    const other = (a===auth.currentUser?.uid) ? b : a;
    // Persist the last opened DM peer/room so after F5 we can restore the exact conversation.
    try{
      // Single Source of Truth: DM state is controlled via setDmState() + MK.persist.*
      try{ setDmState('thread', String(other)); }catch(e){}
      try{
        if(window.MK && window.MK.persist && window.MK.persist.dmLastRoom) window.MK.persist.dmLastRoom(String(currentDmRoom));
        else localStorage.setItem('mk_last_dm_room', String(currentDmRoom));
      }catch(e){}
    }catch(e){}

    // Mobile UX: if DM room is opened (including restore after reload), ensure the conversation
    // card is visible even when DM list is shown as the default column.
    try{
      if(window.matchMedia && window.matchMedia('(max-width: 720px)').matches){
        // open overlay modal that contains the conversation card
        window.openDmMobile && window.openDmMobile();
      }
    }catch(e){}
    const u = await getUser(other);
    document.getElementById('dmWithName').textContent = u.nick||'Uživatel';
    document.getElementById('dmWithStatus').textContent = u.online?'(online)':'(offline)';
    return _origOpenDMRoom(a,b);
  };

  document.getElementById('dmClearBtn')?.addEventListener('click', ()=>{
    const box=document.getElementById('dmFeed'); if(box) box.innerHTML='';
  });

  // Mobile back from DM room overlay
  document.getElementById('dmBackMobile')?.addEventListener('click', ()=>{
    // User intentionally returned to DM LIST
    try{ setDmState('list', null); }catch(e){}
    try{ window.__DM_RESTORE_PEER__=''; window.__DM_ROOM_RESTORED__=false; }catch(e){}
    try{ document.body.classList.remove('dm-room-open'); }catch(e){}
    const back = document.getElementById('dmBackMobile');
    if(back) back.style.display = 'none';
  });

  // When DM tab open, auto-load threads
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('[data-view="view-dm"]');
    if(t){ setTimeout(()=>{ if(auth.currentUser) loadDmThreads(); }, 80); }
  });

  // --- Profile locking & requests ---
  async function loadMyProfileUI(u){
    const up = (await db.ref('usersPublic/'+u.uid).get()).val()||{};
    const nickLocked = up.nickLocked===true;
    const roleLocked = up.roleLocked===true;

    // Fill UI
    document.getElementById('myName').textContent = up.nick || u.displayName || 'Uživatel';
    document.getElementById('profileEmail').textContent = 'E-mail: '+(u.email||'—');
    document.getElementById('profileRoleLine').textContent = 'Role: '+(up.role==='employer'?'Zaměstnavatel':'Hledám práci');
    document.getElementById('myAvatar').src = up.avatar || window.DEFAULT_AVATAR;
    const plan = (up.plan||'free');
    const badge=document.getElementById('myPlan');
    const planVal = String(plan||'').toLowerCase();
    const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
    if(badge){ badge.style.display = isPrem ? 'inline-block':'none'; }
    const myAdmin=document.getElementById('myAdmin');
    const isAdm = (u.uid === window.ADMIN_UID);
    if(myAdmin){ myAdmin.style.display = isAdm ? 'inline-block':'none'; }

    const setNick=document.getElementById('setNick');
    const setRole=document.getElementById('setRole');
    const setAbout=document.getElementById('setAbout');
    if(setNick){
      setNick.value = up.nick || '';
      setNick.disabled = nickLocked; // only initial set if not locked
      setNick.placeholder = nickLocked ? 'Nick je uzamčen' : 'Nick (nastavíte jen jednou)';
    }
    if(setRole){
      setRole.value = up.role || 'seeker';
      setRole.disabled = roleLocked;
    }
    if(setAbout){
      setAbout.value = up.about || '';
    }

    // buttons
    const btnNick=document.getElementById('reqNickChange');
    if(btnNick) btnNick.disabled = !nickLocked; // request only after initial set
    const btnRole=document.getElementById('reqRoleChange');
    if(btnRole) btnRole.disabled = !roleLocked;

    document.getElementById('saveProfile').onclick = async ()=>{
      const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
      const patch = {};
      // allow avatar/about always
      const avatarUrl=(document.getElementById('setAvatarUrl').value||'').trim();
      if(avatarUrl) patch.avatar = avatarUrl;
      const about=(document.getElementById('setAbout').value||'').trim();
      patch.about = about;
      // allow initial nick/role once
      if(!nickLocked){
        const nick=(document.getElementById('setNick').value||'').trim();
        if(nick){ patch.nick = nick; patch.nickLocked = true; }
      }
      if(!roleLocked){
        const role=document.getElementById('setRole').value;
        if(role){ patch.role = role; patch.roleLocked = true; }
      }
      await db.ref('usersPublic/'+u.uid).update(patch);
      toast('Uloženo'); playSound('ok');
      loadMyProfileUI(u);
    };

    document.getElementById('reqNickChange').onclick = async ()=>{
      const u=auth.currentUser; if(!u) return;
      const cur = (await db.ref('usersPublic/'+u.uid+'/nick').get()).val()||'';
      const wanted = prompt('Nový nick (čeká na schválení adminem):', cur);
      if(!wanted || wanted.trim()===cur) return;
      await db.ref('profileChangeRequests').push({uid:u.uid, type:'nick', from:cur, to:wanted.trim(), ts:Date.now(), status:'pending'});
      toast('Žádost odeslána adminovi');
    };

    document.getElementById('reqRoleChange').onclick = async ()=>{
      const u=auth.currentUser; if(!u) return;
      const curRole = (await db.ref('usersPublic/'+u.uid+'/role').get()).val()||'seeker';
      const wanted = prompt('Nová role: seeker / employer', curRole);
      if(!wanted) return;
      const v=wanted.trim().toLowerCase();
      if(v!=='seeker' && v!=='employer') return toast('Použijte seeker nebo employer');
      if(v===curRole) return;
      await db.ref('profileChangeRequests').push({uid:u.uid, type:'role', from:curRole, to:v, ts:Date.now(), status:'pending'});
      toast('Žádost odeslána adminovi');
    };

    document.getElementById('reqPremium').onclick = async ()=>{
      openPremiumBot();
    };
  }

  // --- Admin: approve requests ---
  async function loadAdminRequests(){
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    const box=document.getElementById('adminProfileRequests'); if(box) box.innerHTML='';
    const snap = await db.ref('profileChangeRequests').orderByChild('ts').limitToLast(50).get();
    const v=snap.val()||{};
    const ids=Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));
    for(const id of ids){
      const r=v[id]; if(!r || r.status!=='pending') continue;
      const u=await getUser(r.uid);
    const el=document.createElement('div'); el.className='msg'; el.dataset.mid = snap.key;
      el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name" data-uid="${r.uid}"><b>${esc(u.nick||'Uživatel')}</b> · ${esc(r.type)}</div>
          <div class="muted">${esc(String(r.from))} → <b>${esc(String(r.to))}</b></div>
          <div class="actions">
            <button data-act="approve">Schválit</button>
            <button data-act="reject">Zamítnout</button>
          </div>
        </div>`;
      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='approve'){
          if(r.type==='nick') await db.ref('usersPublic/'+r.uid).update({nick:r.to});
          if(r.type==='role') await db.ref('usersPublic/'+r.uid).update({role:r.to});
          await db.ref('profileChangeRequests/'+id).update({status:'approved', decidedAt:Date.now()});
          toast('Schváleno');
          loadAdminRequests();
        }
        if(act==='reject'){
          await db.ref('profileChangeRequests/'+id).update({status:'rejected', decidedAt:Date.now()});
          toast('Zamítnuto');
          loadAdminRequests();
        }
      });
      box && box.appendChild(el);
    }

    const boxP=document.getElementById('adminPremiumRequests');
    const boxPay=document.getElementById('adminPaymentRequests'); if(boxP) boxP.innerHTML='';
    // payments/requests/{uid}/{id}
    const ps = await db.ref('payments/requests').get();
    const pv = ps.val() || {};
    // flatten
    const all = [];
    for(const uidKey of Object.keys(pv)){
      const per = pv[uidKey] || {};
      for(const id of Object.keys(per)){
        const r = per[id];
        if(r && r.status==='pending') all.push({id, uid: uidKey, r});
      }
    }
    all.sort((a,b)=>(b.r.ts||0)-(a.r.ts||0));
    for(const item of all.slice(0,100)){
      const r=item.r;
      const u=await getUser(item.uid);
      const el=document.createElement('div'); el.className='msg';
      const planTitle = (PREMIUM_PLANS[r.plan]?.title) || r.plan || 'Premium';
      const proof = r.proofImg ? `<div style="margin-top:6px"><img src="${esc(r.proofImg)}" style="max-width:220px;border-radius:10px"></div>` : '';
      el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name" data-uid="${esc(item.uid)}"><b>${esc(u.nick||'Uživatel')}</b> · ${esc(planTitle)}</div>
          <div class="muted">${esc(r.email||'')}</div>
          <div class="muted">Cena: ${esc(String(r.price||''))} Kč · ${esc(String(r.period||''))}</div>
          ${proof}
          <div class="actions">
            <button data-act="grant">Udělit</button>
            <button data-act="reject">Zamítnout</button>
          </div>
        </div>`;
      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='grant'){
          const plan = r.plan || 'vip';
          await db.ref('usersPublic/'+item.uid).update({plan, premiumSince:Date.now()});
          await db.ref('payments/requests/'+item.uid+'/'+item.id).update({status:'granted', decidedAt:Date.now()});
          toast('Privilegium uděleno');
          loadAdminRequests();
        }
        if(act==='reject'){
          await db.ref('payments/requests/'+item.uid+'/'+item.id).update({status:'rejected', decidedAt:Date.now()});
          toast('Zamítnuto');
          loadAdminRequests();
        }
      });
      boxP && boxP.appendChild(el);
    }
  }

  // --- Bots (MVP client scheduler for admin) ---
  let botTimer=null;
  async function loadBotsUI(){
    const box=document.getElementById('botList'); if(!box) return;
    box.innerHTML='';
    const s=await db.ref('bots').get(); const v=s.val()||{};
    for(const [id,b] of Object.entries(v)){
      const el=document.createElement('div'); el.className='msg';
      el.innerHTML = `<div class="ava"><img src="${esc(b.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="name"><b>${esc(b.nick||'Bot')}</b> <span class="muted">${esc(b.city||'praha')}</span></div>
          <div class="muted">Interval: ${Math.max(1, (+b.intervalMin||15))} min · aktivní: ${b.enabled?'ano':'ne'}</div>
          <div class="actions">
            <button data-act="toggle">${b.enabled?'Vypnout':'Zapnout'}</button>
            <button data-act="edit">Upravit</button>
            <button data-act="del">Smazat</button>
          </div>
        </div>`;
      el.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='toggle'){ await db.ref('bots/'+id).update({enabled:!b.enabled}); loadBotsUI(); }
        if(act==='del'){ await db.ref('bots/'+id).remove(); loadBotsUI(); }
        if(act==='edit'){
          const nick=prompt('Nick bota:', b.nick||'Bot'); if(!nick) return;
          const city=prompt('Město (praha/brno/olomouc):', b.city||'praha')||'praha';
          const interval=prompt('Interval (min):', String(b.intervalMin||15))||'15';
          const text=prompt('Text zprávy:', b.text||'')||'';
          await db.ref('bots/'+id).update({nick:nick.trim(), city:city.trim(), intervalMin:parseInt(interval,10)||15, text});
          loadBotsUI();
        }
      });
      box.appendChild(el);
    }
  }

  
  // --- Bot DM auto-replies (runs only when admin has the site open) ---
  const __BOT_ROOM_LISTENERS = new Map(); // room -> ref
  async function _getBotConfigByUid(botUid){
    const id = String(botUid||'').startsWith('bot_') ? String(botUid).slice(4) : null;
    if(!id) return null;
    const s = await db.ref('bots/'+id).get();
    return s.val()||null;
  }

  async function _ensureBotPublic(botUid, b){
    try{
      await db.ref('usersPublic/'+botUid).update({
        nick: b?.nick || 'Bot',
        avatar: b?.avatar || window.DEFAULT_AVATAR,
        role: 'bot',
        plan: 'bot'
      });
    }catch(e){}
  }

  let __BOT_DM_STARTED = false;
  async function startBotDmEngine(){
    if(__BOT_DM_STARTED) return;
    __BOT_DM_STARTED = true;
    const me = auth.currentUser;
    if(!isAdminUser(me)) return;
    const adminUid = me.uid;

    // Watch bot rooms (created automatically when user opens DM with bot_*)
    db.ref('botRooms').orderByChild('ts').limitToLast(200).on('child_added', async (snap)=>{
      const room = snap.key;
      const r = snap.val()||{};
      if(!room || !r.botUid || !r.userUid) return;

      // Ensure admin is a member (user startDM tries to add, but we enforce too)
      try{ await db.ref('privateMembers/'+room+'/'+adminUid).set(true); }catch{}

      // Avoid double listeners
      if(__BOT_ROOM_LISTENERS.has(room)) return;

      const lastHandled = +r.lastHandledTs || 0;
      const ref = db.ref('privateMessages/'+room).orderByChild('ts').startAt(lastHandled+1);
      __BOT_ROOM_LISTENERS.set(room, ref);

      ref.on('child_added', async (ms)=>{
        const m = ms.val()||{};
        if(!m.ts || !m.by) return;
        const botUid = r.botUid;
        if(m.by === botUid) return; // ignore bot's own messages

        // Update last handled ASAP to prevent duplicate replies
        try{ await db.ref('botRooms/'+room).update({lastHandledTs: m.ts}); }catch{}

        // Forward to admin inbox (per bot)
        try{
          const payload = {
            ts: m.ts,
            botUid,
            from: m.by,
            room,
            text: m.text||'',
            img: m.img||''
          };
          await db.ref('botsInbox/'+adminUid+'/'+botUid).push(payload);
        }catch(e){}

        // Auto-reply (if bot has scenarios)
        try{
          const b = await _getBotConfigByUid(botUid);
          if(!b) return;
          await _ensureBotPublic(botUid, b);

          const sc = Array.isArray(b.scenarios) ? b.scenarios.filter(x=>x && (x.text || x.img)) : [];
          let pick = null;
          if(sc.length){
            pick = sc[Math.floor(Math.random()*sc.length)];
          }
          const replyText = (pick?.text || b.text || '').toString();
          const replyImg  = (pick?.img  || '').toString();
          if(!replyText && !replyImg) return;

          const ts2 = Date.now();
          await db.ref('privateMessages/'+room).push({by: botUid, ts: ts2, text: replyText, img: replyImg});

          // Update inbox meta so the thread stays "alive" for the user
          const userPub = await getUser(r.userUid);
          await Promise.all([
            db.ref('inboxMeta/'+r.userUid+'/'+room).update({with: botUid, ts: ts2, lastTs: ts2, title: b.nick||'Bot'}),
            db.ref('inboxMeta/'+botUid+'/'+room).update({with: r.userUid, ts: ts2, lastTs: ts2, title: userPub.nick||'Uživatel'}),
            db.ref('inboxMeta/'+adminUid+'/'+room).update({with: botUid, ts: ts2, lastTs: ts2, title: (b.nick||'Bot')+' (DM)'})
          ]);
        }catch(e){ console.warn('bot auto-reply failed', e?.code||e); }
      });
    });
  }

  // --- Bots modal (Admin) ---
  let __BOT_EDIT_ID = null;
  let __BOT_EDIT_AVA = null;
  let __BOT_EDIT_IMG = null;

  function _scRow(text='', img=''){
    const row = document.createElement('div');
    row.className = 'scRow';
    row.innerHTML = `
      <textarea rows="2" placeholder="Text odpovědi…"></textarea>
      <label class="filebtn mini">Obrázek <input type="file" accept="image/*"></label>
      <button class="ghost xbtn" type="button">✕</button>
    `;
    const ta = row.querySelector('textarea');
    ta.value = text||'';
    row.dataset.img = img||'';
    row.querySelector('input')?.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      row.dataset.img = await fileToDataURL(f);
      toast('Obrázek uložen (scénář)');
    });
    row.querySelector('button')?.addEventListener('click', ()=> row.remove());
    return row;
  }

  async function loadBotsModal(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const list = document.getElementById('botsModalList');
    if(!list) return;

    list.innerHTML = '<div class="muted">Načítám…</div>';
    const s = await db.ref('bots').get();
    const v = s.val()||{};
    const entries = Object.entries(v);

    list.innerHTML = '';
    if(entries.length===0){
      list.innerHTML = '<div class="muted">Zatím žádní boti.</div>';
    }
    for(const [id,b] of entries){
      const botUid = 'bot_'+id;
      const el = document.createElement('div');
      el.className='msg';
      el.innerHTML = `
        <div class="ava"><img src="${esc(b.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%;cursor:pointer">
          <div class="name"><b>${esc(b.nick||'Bot')}</b> <span class="muted">${esc(b.city||'praha')}</span></div>
          <div class="muted">UID: ${esc(botUid)} · Interval: ${Math.max(1,(+b.intervalMin||15))} min · aktivní: ${b.enabled?'ano':'ne'}</div>
        </div>
      `;
      el.addEventListener('click', ()=> selectBotForEdit(id, b));
      list.appendChild(el);
    }
  }

  function selectBotForEdit(id, b){
    __BOT_EDIT_ID = id;
    __BOT_EDIT_AVA = null;
    __BOT_EDIT_IMG = null;

    const hint = document.getElementById('botEditHint'); if(hint) hint.textContent = 'Upravuješ: bot_'+id;
    const elId = document.getElementById('botEditId'); if(elId) elId.value = id;
    const elNick = document.getElementById('botEditNick'); if(elNick) elNick.value = b?.nick||'';
    const elCity = document.getElementById('botEditCity'); if(elCity) elCity.value = b?.city||'praha';
    const elMode = document.getElementById('botEditMode'); if(elMode) elMode.value = b?.mode||'dm';
    const elFrom = document.getElementById('botEditFrom'); if(elFrom) elFrom.value = b?.activeFrom||'';
    const elTo = document.getElementById('botEditTo'); if(elTo) elTo.value = b?.activeTo||'';
    const elInt = document.getElementById('botEditInterval'); if(elInt) elInt.value = String(b?.intervalMin||15);
    const elEn = document.getElementById('botEditEnabled'); if(elEn) elEn.checked = !!b?.enabled;
    const elText = document.getElementById('botEditText'); if(elText) elText.value = b?.text||'';

    const delBtn = document.getElementById('botEditDelete'); if(delBtn) delBtn.style.display='';
    const sc = document.getElementById('botScenarioList'); if(sc) sc.innerHTML='';
    const arr = Array.isArray(b?.scenarios) ? b.scenarios : [];
    if(sc){
      if(arr.length===0){
        sc.appendChild(_scRow('Ahoj! Jak ti můžu pomoct?',''));
      }else{
        for(const it of arr){
          sc.appendChild(_scRow(it?.text||'', it?.img||''));
        }
      }
    }
  }

  async function saveBotFromEditor(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(!__BOT_EDIT_ID) return toast('Vyber bota');
    const id = __BOT_EDIT_ID;
    const botUid = 'bot_'+id;

    const nick = (document.getElementById('botEditNick')?.value||'').trim() || 'Bot';
    const city = (document.getElementById('botEditCity')?.value||'praha').trim() || 'praha'; // also supports 'all'
    const mode = (document.getElementById('botEditMode')?.value||'dm').trim() || 'dm'; // dm | chat | both
    const activeFrom = (document.getElementById('botEditFrom')?.value||'').trim(); // optional HH:MM
    const activeTo   = (document.getElementById('botEditTo')?.value||'').trim(); // 'all' allowed
    const intervalMin = Math.max(1, parseInt(document.getElementById('botEditInterval')?.value||'15',10) || 15);
    const enabled = !!document.getElementById('botEditEnabled')?.checked;
    const text = (document.getElementById('botEditText')?.value||'').trim();

    const scBox = document.getElementById('botScenarioList');
    const scenarios = [];
    if(scBox){
      for(const row of Array.from(scBox.children)){
        const t = (row.querySelector('textarea')?.value||'').trim();
        const img = (row.dataset.img||'').toString();
        if(t || img) scenarios.push({text:t, img});
      }
    }

    const patch = {nick, city, intervalMin, enabled, text, scenarios};
    if(__BOT_EDIT_AVA) patch.avatar = __BOT_EDIT_AVA;
    if(__BOT_EDIT_IMG) patch.img = __BOT_EDIT_IMG;

    await db.ref('bots/'+id).update(patch);
    await db.ref('usersPublic/'+botUid).update({nick, avatar: patch.avatar || (await getUser(botUid)).avatar || window.DEFAULT_AVATAR, role:'bot', plan:'bot'});
    toast('Bot uložen'); playSound('ok');
    loadBotsModal();
  }

  async function deleteBotFromEditor(){
    const me = auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(!__BOT_EDIT_ID) return;
    if(!confirm('Smazat bota?')) return;
    await db.ref('bots/'+__BOT_EDIT_ID).remove();
    toast('Smazáno');
    __BOT_EDIT_ID=null;
    loadBotsModal();
  }


  
  
// --- Bot Chat Engine (Client-side host lock; runs when ANY client is online) ---
let __BOT_CHAT_TIMER = null;
let __BOT_HOST_TIMER = null;
let __IS_BOT_HOST = false;

function _botHostRef(){ return db.ref('runtime/botHost'); }

async function _tryAcquireBotHost(){
  const me = auth.currentUser;
  if(!me) return false;
  const ref = _botHostRef();
  const now = Date.now();
  try{
    const res = await ref.transaction((cur)=>{
      const stale = !cur || !cur.ts || (now - (+cur.ts||0) > 90000);
      if(!cur || stale) return {uid: me.uid, ts: now};
      if(cur.uid === me.uid) return {uid: me.uid, ts: now};
      return; // abort
    }, undefined, false);
    const v = res && res.snapshot ? res.snapshot.val() : null;
    return !!v && v.uid === me.uid;
  }catch(e){
    return false;
  }
}

async function _ensureBotHostOnce(){
  const me = auth.currentUser;
  if(!me) return;
  const ok = await _tryAcquireBotHost();
  __IS_BOT_HOST = ok;

  if(ok){
    try{ _botHostRef().onDisconnect().remove(); }catch(e){}
    try{ await _botHostRef().update({uid: me.uid, ts: Date.now()}); }catch(e){}
    _startBotTicks();
  }else{
    _stopBotTicks();
  }
}

function _startBotTicks(){
  if(__BOT_CHAT_TIMER) return;
  const run = async()=>{ try{ await _botChatTick(); }catch(e){} };
  __BOT_CHAT_TIMER = setInterval(run, 25000);
  run();
}
function _stopBotTicks(){
  if(__BOT_CHAT_TIMER){ try{ clearInterval(__BOT_CHAT_TIMER); }catch(e){} __BOT_CHAT_TIMER=null; }
}

function startBotHostEngine(){
  if(__BOT_HOST_TIMER) return;
  const loop = async()=>{ try{ await _ensureBotHostOnce(); }catch(e){} };
  __BOT_HOST_TIMER = setInterval(loop, 30000);
  loop();
}
function stopBotHostEngine(){
  if(__BOT_HOST_TIMER){ try{ clearInterval(__BOT_HOST_TIMER); }catch(e){} __BOT_HOST_TIMER=null; }
  _stopBotTicks();
  __IS_BOT_HOST=false;
}

// Bot tick: posts at most 1 due message per bot; supports "catch-up" via nextChatAt
const _botChatTick = async ()=>{
    try{
      const snap = await db.ref('bots').get();
      const bots = snap.val()||{};
      const now = Date.now();

      for(const [id,b] of Object.entries(bots)){
        if(!b || !b.enabled) continue;
        const mode = (b.mode||'dm').toString();
        if(mode!=='chat' && mode!=='both') continue;
        if(!shouldRunNow(b)) continue;

        const nextAt = +b.nextChatAt||0;
        const intervalMs = Math.max(60_000, (+b.intervalMin||15)*60_000);
        if(nextAt && now < nextAt) continue;

        const botUid = 'bot_'+id;
        let pick = null;
        const sc = Array.isArray(b.scenarios) ? b.scenarios : [];
        if(sc.length){ pick = sc[Math.floor(Math.random()*sc.length)]; }
        const text = (pick?.text || b.text || '').toString().trim();
        const img  = (pick?.img  || b.img  || '').toString().trim();
        if(!text && !img) continue;

        const targets = (b.city==='all') ? (window.CITIES || ['praha']) : [ (b.city||'praha') ];
        for(const city of targets){
          const msg = { by: botUid, ts: now, text: text||null, img: img||null, bot:true, botUid };
          await db.ref('messages/'+city).push(msg);
        }

        // schedule next chat post
        const nextChatAt = now + (Number(b.intervalMs) || intervalMs);
        await db.ref('bots/'+id).update({ lastChatTs: now, nextChatAt });
        try{
          await db.ref('usersPublic/'+botUid).update({ nick: b.nick||'Bot', avatar: b.avatar||window.DEFAULT_AVATAR, role:'bot', plan:'bot' });
        }catch(e){}
      }
    }catch(e){
      console.warn('botChat tick', e);
    }
  };

// --- Bot Inbox modal (Admin) ---
  let __BOT_INBOX_REF=null;
  async function loadBotInboxModal(){
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const adminUid=me.uid;
    const sel=document.getElementById('botInboxSelect');
    const box=document.getElementById('botInboxFeedModal');
    if(!sel || !box) return;

    // build bot list
    const s=await db.ref('bots').get(); const v=s.val()||{};
    const ids=Object.keys(v);
    sel.innerHTML='';
    if(ids.length===0){
      sel.innerHTML='<option value="">—</option>';
      box.innerHTML='<div class="muted">Zatím žádní boti.</div>';
      return;
    }
    for(const id of ids){
      const botUid='bot_'+id;
      const opt=document.createElement('option');
      opt.value=botUid;
      opt.textContent = (v[id]?.nick||'Bot')+' ('+botUid+')';
      sel.appendChild(opt);
    }
    const first=sel.value||('bot_'+ids[0]);
    sel.value=first;

    const renderFor = async (botUid)=>{
      if(__BOT_INBOX_REF){ try{ __BOT_INBOX_REF.off(); }catch(e){} }
      box.innerHTML='<div class="muted">Načítám…</div>';
      __BOT_INBOX_REF = db.ref('botsInbox/'+adminUid+'/'+botUid).orderByChild('ts').limitToLast(80);
      __BOT_INBOX_REF.on('value', async (snap)=>{
        const vv=snap.val()||{};
        const keys=Object.keys(vv).sort((a,b)=>(vv[b].ts||0)-(vv[a].ts||0));
        box.innerHTML='';
        if(keys.length===0){
          box.innerHTML='<div class="muted">Zatím žádné zprávy.</div>';
          return;
        }
        const term = (document.getElementById('botInboxSearch')?.value||'').toString().trim().toLowerCase();
        for(const k of keys){
          const it=vv[k]||{};
          const fromU = it.from ? await getUser(it.from) : null;
          if(term){
            const nn = (fromU?.nick||'').toString().toLowerCase();
            if(!nn.includes(term)) continue;
          }
          const el=document.createElement('div'); el.className='msg';
          el.innerHTML = `
            <div class="ava" data-uid="${esc(it.from||'')}"><img src="${esc(fromU?.avatar||window.DEFAULT_AVATAR)}"></div>
            <div class="bubble" style="width:100%">
              <div class="name"><b>${esc(fromU?.nick||'Uživatel')}</b> <span class="muted">${new Date(it.ts||0).toLocaleString()}</span></div>
              ${it.text?`<div class="text">${esc(it.text)}</div>`:''}
              ${it.img?`<div class="text"><img src="${esc(it.img)}"></div>`:''}
              <div class="actions">
                <button data-act="open">Otevřít DM</button>
                <button data-act="del">Smazat</button>
              </div>
            </div>
          `;
          el.addEventListener('click', async (e)=>{
            const act=e.target?.dataset?.act; if(!act) return;
            if(act==='open' && it.from){
              closeModal('modalBotInbox');
              openDMRoom(adminUid, it.from);
              showView('view-dm');
            }
            if(act==='del'){
              await db.ref('botsInbox/'+adminUid+'/'+botUid+'/'+k).remove();
            }
          });
          box.appendChild(el);
        }
      });
    };

    await renderFor(first);
    sel.onchange = ()=> renderFor(sel.value);
    document.getElementById('botInboxSearch')?.addEventListener('input', ()=>renderFor(sel.value));
  }

  document.getElementById('botInboxClear')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    const botUid=document.getElementById('botInboxSelect')?.value;
    if(!botUid) return;
    if(!confirm('Vyčistit inbox pro '+botUid+'?')) return;
    await db.ref('botsInbox/'+me.uid+'/'+botUid).remove();
    toast('Vyčištěno');
  });

async function botTick(){
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    const s=await db.ref('bots').get(); const v=s.val()||{};
    const now=Date.now();
    for(const [id,b] of Object.entries(v)){
      if(!b || !b.enabled) continue;
      const last = +b.lastTs || 0;
      const intervalMs = Math.max(1,(+b.intervalMin||15))*60*1000;
      if(now-last < intervalMs) continue;
      const city = (b.city||'praha');
      // create /usersPublic for botId (virtual)
      const botUid = 'bot_'+id;
      await db.ref('usersPublic/'+botUid).update({nick:b.nick||'Bot', avatar:b.avatar||window.DEFAULT_AVATAR, role:'bot', plan:'bot'});
      await db.ref('messages/'+city).push({by:botUid, ts:now, text:b.text||'', img:b.img||''});
      await db.ref('bots/'+id).update({lastTs:now});
    }
  }

  
  // --- Bot inbox (messages forwarded to owner) ---
  let BOTINBOX_REF=null;
  async function loadBotInboxUI(){
    const me=auth.currentUser; if(!me) return;
    const box=document.getElementById('botInboxFeed'); if(!box) return;
    box.innerHTML = '<div class="muted">Načítám…</div>';
    if(BOTINBOX_REF){ try{ BOTINBOX_REF.off(); }catch(e){} }
    BOTINBOX_REF = db.ref('botsInbox/'+me.uid).orderByChild('ts').limitToLast(80);
    BOTINBOX_REF.on('value', async snap=>{
      const v=snap.val()||{};
      const ids=Object.keys(v).sort((a,b)=> ((v[b].lastTs||v[b].ts||0) - (v[a].lastTs||v[a].ts||0)));
      box.innerHTML='';
      if(ids.length===0){
        box.innerHTML = '<div class="muted">Zatím žádné zprávy.</div>';
        return;
      }
      for(const id of ids){
        const it=v[id]||{};
        const fromU = it.from ? await getUser(it.from) : null;
          if(term){
            const nn = (fromU?.nick||'').toString().toLowerCase();
            if(!nn.includes(term)) continue;
          }
        const botU = it.botUid ? await getUser(it.botUid) : null;
        const el=document.createElement('div'); el.className='msg';
        const who = fromU?.nick || 'Uživatel';
        const botName = botU?.nick || 'Bot';
        el.innerHTML = `<div class="ava" data-uid="${esc(it.from||'')}"><img src="${esc(fromU?.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="name"><b>${esc(who)}</b> → <span class="muted">${esc(botName)}</span> <span class="badge premium">REKLAMA</span></div>
            ${it.text ? `<div class="text">[REKLAMA] ${esc(it.text)}</div>` : ''}
            ${it.img ? `<div class="text"><img src="${esc(it.img)}"></div>` : ''}
            <div class="actions">
              <button data-act="open">Otevřít DM</button>
              <button data-act="del">Smazat</button>
            </div>
          </div>`;
        el.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act; if(!act) return;
          if(act==='open' && it.from){
            openDM(it.from);
          }
          if(act==='del'){
            await db.ref('botsInbox/'+me.uid+'/'+id).remove();
          }
        });
        box.appendChild(el);
      }
    });
  }

document.getElementById('botAdd')?.addEventListener('click', async ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const nick=prompt('Nick bota:', 'Bot'); if(!nick) return;
    const city=prompt('Město (praha/brno/olomouc):', getCity())||getCity();
    const interval=prompt('Interval (min):','15')||'15';
    const text=prompt('Text zprávy:', 'Ahoj!')||'';
    const id = db.ref('bots').push().key;
    await db.ref('bots/'+id).set({nick:nick.trim(), city:city.trim(), intervalMin:parseInt(interval,10)||15, text, enabled:true, createdAt:Date.now()});
    toast('Bot přidán');
    loadBotsUI();
  });
  document.getElementById('botRun')?.addEventListener('click', ()=>{
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    if(botTimer) return toast('Boti již běží');
    botTimer=setInterval(()=>botTick().catch(console.error), 5000);
    toast('Boti spuštěni');
  });
  document.getElementById('botStop')?.addEventListener('click', ()=>{
    if(botTimer){ clearInterval(botTimer); botTimer=null; toast('Boti zastaveni'); }
  });


  // --- Bot profiles by UID (for fixed bot accounts) ---
  const BOT_UIDS = ['VrP5IzhgxmT0uKWc9UWlXSCe6nM2','rN93vIzh0AUhX1YsSWb6Th6W9w82'];
  async function loadBotProfiles(){
    const me=auth.currentUser; if(!isAdminUser(me)) return;
    try{
      const u1=(await db.ref('usersPublic/'+BOT_UIDS[0]).get()).val()||{};
      const u2=(await db.ref('usersPublic/'+BOT_UIDS[1]).get()).val()||{};
      const n1=document.getElementById('botNick1'); if(n1) n1.value = u1.nick||u1.name||'';
      const n2=document.getElementById('botNick2'); if(n2) n2.value = u2.nick||u2.name||'';
    }catch(e){ console.warn(e); }
  }
  async function saveBotProfile(which){
    const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
    const uid = BOT_UIDS[which-1];
    const nickEl=document.getElementById(which===1?'botNick1':'botNick2');
    const fileEl=document.getElementById(which===1?'botAva1':'botAva2');
    const nick=(nickEl?.value||'').trim();
    let avatar=null;
    const f=fileEl?.files && fileEl.files[0];
    if(f){ avatar = await fileToDataURL(f); }
    const upd={};
    if(nick) upd.nick=nick;
    if(avatar) upd.avatar=avatar;
    upd.updatedAt=Date.now();
    await db.ref('usersPublic/'+uid).update(upd);
    toast('Uloženo'); playSound('ok');
    if(fileEl) fileEl.value='';
  }
  document.getElementById('botSave1')?.addEventListener('click', ()=>saveBotProfile(1).catch(console.error));
  document.getElementById('botSave2')?.addEventListener('click', ()=>saveBotProfile(2).catch(console.error));
  // (removed) duplicate onAuthStateChanged in Stage5 – handled by main auth handler

  // When admin tab open, refresh
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('[data-view="view-admin"]');
    if(t){ setTimeout(()=>{ if(isAdminUser(auth.currentUser)){ loadAdminRequests(); loadBotsUI(); loadBotInboxUI(); loadBotProfiles(); } }, 120); }
  });

})();



// Global delegation: click on any element with data-uid opens profile
document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-uid]');
  if(!el) return;
  const uid = el.getAttribute('data-uid');
  if(!uid) return;

  // ignore if clicking inside input/textarea
  if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;

  // In LS/DM the row click must open the conversation, not the profile.
  // Allow opening profile only by clicking the avatar inside DM lists.
  const inDmThreads = !!e.target.closest('#dmThreads');
  const inDmHistory = !!e.target.closest('#dmHistory');
  if((inDmThreads || inDmHistory) && !e.target.closest('.ava')) return;

  if(window.showUserCard){
    e.preventDefault();
    e.stopPropagation();
    window.showUserCard(uid).catch(err=>{ console.error(err); });
  }
});

// Chat avatar -> user card
document.getElementById('chatFeed')?.addEventListener('click', (e)=>{
  const a = e.target.closest('.ava');
  if(!a) return;
  const uid = a.getAttribute('data-uid');
  if(uid) { e.stopPropagation(); window.showUserCard && window.showUserCard(uid); }
});


