// Feature: public user card (profile modal) + global [data-uid] delegation
// Extracted from former Stage5 monolith.

(function mkUserCardModule(){
  if(window.__MK_USER_CARD__) return;
  window.__MK_USER_CARD__ = true;

  // --- Blocking ---
  // We keep the block list server-owned (Cloud Functions), but allow both sides
  // to read the pair state for UX ("you blocked" vs "you are blocked").
  async function getBlockState(meUid, otherUid){
    const out = { iBlocked:false, blockedByPeer:false };
    if(!meUid || !otherUid) return out;
    try{
      const s1 = await db.ref('blocks/'+meUid+'/'+otherUid).get();
      out.iBlocked = !!s1.exists();
    }catch(e){}
    try{
      const s2 = await db.ref('blocks/'+otherUid+'/'+meUid).get();
      out.blockedByPeer = !!s2.exists();
    }catch(e){}
    return out;
  }
  try{ window.getBlockState = getBlockState; }catch(e){}

  // --- Report modal (user -> admin tickets) ---
  let __reportTargetUid = null;
  let __reportTargetNick = '';
  let __reportImg1 = null;
  let __reportImg2 = null;
  let __reportBusy = false;

  async function __readReportImg(file){
    if(!file) return null;
    try{ return await fileToDataURL(file, {maxSide: 1080, maxLen: 380000, mime:'image/jpeg', quality:0.78}); }
    catch(e){ return null; }
  }

  function openReportUserModal(targetUid, targetNick){
    __reportTargetUid = String(targetUid||'').trim();
    __reportTargetNick = String(targetNick||'').trim();
    __reportImg1 = null;
    __reportImg2 = null;
    try{
      const line = document.getElementById('reportTargetLine');
      if(line) line.textContent = __reportTargetNick ? (`Пользователь: ${__reportTargetNick} (${__reportTargetUid})`) : (`UID: ${__reportTargetUid}`);
    }catch(e){}
    try{ const r=document.getElementById('reportReason'); if(r) r.value=''; }catch(e){}
    try{ const t=document.getElementById('reportText'); if(t) t.value=''; }catch(e){}
    try{ const f1=document.getElementById('reportImg1'); if(f1) f1.value=''; }catch(e){}
    try{ const f2=document.getElementById('reportImg2'); if(f2) f2.value=''; }catch(e){}
    try{ const h=document.getElementById('reportImgHint'); if(h) h.textContent=''; }catch(e){}
    try{ openModal('modalReportUser'); }catch(e){ try{ document.getElementById('modalReportUser').hidden=false; }catch(_){} }
  }
  try{ window.openReportUserModal = openReportUserModal; }catch(e){}

  // Wire modal controls once
  (function wireReportModalOnce(){
    if(window.__MK_REPORT_MODAL_WIRED__) return;
    window.__MK_REPORT_MODAL_WIRED__ = true;

    const f1 = document.getElementById('reportImg1');
    const f2 = document.getElementById('reportImg2');
    const hint = document.getElementById('reportImgHint');
    const btnSend = document.getElementById('reportSend');

    if(f1) f1.addEventListener('change', async (e)=>{
      const file = e.target.files && e.target.files[0];
      __reportImg1 = await __readReportImg(file);
      try{ if(hint) hint.textContent = [__reportImg1 ? '✓ 1' : '', __reportImg2 ? '✓ 2' : ''].filter(Boolean).join(' '); }catch(_e){}
    });
    if(f2) f2.addEventListener('change', async (e)=>{
      const file = e.target.files && e.target.files[0];
      __reportImg2 = await __readReportImg(file);
      try{ if(hint) hint.textContent = [__reportImg1 ? '✓ 1' : '', __reportImg2 ? '✓ 2' : ''].filter(Boolean).join(' '); }catch(_e){}
    });

    if(btnSend) btnSend.onclick = async ()=>{
      const me = auth.currentUser;
      if(!me){ toast('Пожалуйста, войдите'); try{ openModalAuth('login'); }catch(e){} return; }
      if(__reportBusy) return;
      const targetUid = String(__reportTargetUid||'').trim();
      if(!targetUid){ toast('Нет пользователя'); return; }

      const reason = String(document.getElementById('reportReason')?.value||'').trim();
      const text = String(document.getElementById('reportText')?.value||'').trim();

      if(!reason && !text && !__reportImg1 && !__reportImg2){
        toast('Укажите причину или добавьте скриншот');
        playSound('err');
        return;
      }

      __reportBusy = true;
      try{
        if(typeof window.callFn !== 'function') throw new Error('functions_unavailable');
        const r = await window.callFn('reportUser', {
          targetUid,
          reason: reason.slice(0, 120),
          text: text.slice(0, 1200),
          img1: __reportImg1 || null,
          img2: __reportImg2 || null
        });
        if(!r || r.ok !== true) throw new Error(String(r?.reason||'report_failed'));
        toast('Жалоба отправлена');
        playSound('ok');
        try{ closeModal('modalReportUser'); }catch(e){}
      }catch(e){
        console.warn(e);
        toast('Не удалось отправить');
        playSound('err');
      }finally{
        __reportBusy = false;
      }
    };
  })();

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
          ${it.img ? `<div style="margin-top:8px"><img src="${esc(it.img)}" alt="" style="max-width:240px;border-radius:12px;border:1px solid var(--line)"/></div>` : ''}
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

      if(ava) ava.src = safeImgSrc(u.avatar||window.DEFAULT_AVATAR, window.DEFAULT_AVATAR);
      if(nick) nick.textContent = u.nick||'Uživatel';
      const r = (u.role==='job') ? 'employer' : u.role;
      if(role) role.textContent = r==='employer' ? 'Zaměstnavatel' : 'Hledám práci';
      if(online) online.textContent = u.online ? 'online' : 'offline';

      const plan=document.getElementById('userCardPlan');
      const admin=document.getElementById('userCardAdmin');
      const planVal = String(u.plan||'').toLowerCase();
      const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
      if(plan){
        plan.style.display = isPrem ? '' : 'none';
        plan.textContent = isPrem ? String(planVal).toUpperCase() : 'PREMIUM';
      }
      const isAdm = false; // admin badge hidden in public card (roles are private)
      if(admin){ admin.style.display = isAdm ? '' : 'none'; }

      // Privacy MVP: public profile is minimal (usersPublic exposes only nick/avatar/plan/role)
      // Hide extra personal fields for other users.
      const aboutEl=document.getElementById('userCardAbout');
      if(aboutEl) aboutEl.textContent = '';
      const cW=document.getElementById('userCardCompanyWrap');
      const pW=document.getElementById('userCardPhoneWrap');
      const sW=document.getElementById('userCardSkillsWrap');
      if(cW) cW.style.display = 'none';
      if(pW) pW.style.display = 'none';
      if(sW) sW.style.display = 'none';

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
      const blockBtn=document.getElementById('userCardBlock');
      const reportBtn=document.getElementById('userCardReport');

      const state = await getFriendState(me?.uid, uid);
      const blockState = await getBlockState(me?.uid, uid);
      if(addBtn) addBtn.style.display = (state==='friends') ? 'none' : '';
      if(rmBtn) rmBtn.style.display = (state==='friends') ? '' : 'none';
      if(addBtn){
        addBtn.textContent = state==='incoming' ? '✅ Přijmout' : (state==='outgoing' ? '⏳ Odesláno' : '👥 Přidat');
        addBtn.disabled = (state==='outgoing');
      }

      // Blocking UI
      if(blockBtn){
        if(!me || me.uid===uid){
          blockBtn.style.display = 'none';
        }else{
          blockBtn.style.display = '';
          blockBtn.textContent = blockState.iBlocked ? '🔓 Разблокировать' : '🚫 Блокировать';
          blockBtn.onclick = async ()=>{
            if(!me) return toast('Пожалуйста, войдите');
            try{
              if(typeof window.callFn !== 'function') throw new Error('functions_unavailable');
              if(blockState.iBlocked){
                if(!confirm('Разблокировать пользователя?')) return;
                const r = await window.callFn('unblockUser', { uid });
                if(!r || r.ok !== true) throw new Error('unblock_failed');
                toast('Разблокировано');
              }else{
                if(!confirm('Заблокировать пользователя? Он не сможет писать вам в Л.С. и отправлять заявки.')) return;
                const reason = prompt('Причина (необязательно):','') || '';
                const r = await window.callFn('blockUser', { uid, reason: String(reason).slice(0,120) });
                if(!r || r.ok !== true) throw new Error('block_failed');
                toast('Пользователь заблокирован');
              }
              playSound('ok');
              try{ await showUserCard(uid); }catch(e){}
              return;
            }catch(e){ console.error(e); toast('Ошибка'); playSound('err'); }
          };
        }
      }

      // DM button
      dmBtn && (dmBtn.onclick = ()=>{
        if(!me) return toast('Пожалуйста, войдите');
        if(blockState.iBlocked){ toast('Вы заблокировали пользователя'); playSound('err'); return; }
        if(blockState.blockedByPeer){ toast('Пользователь ограничил переписку'); playSound('err'); return; }
        (window.startDM ? window.startDM(uid, {closeModalId:'modalUserCard'}) : openDMRoom(me.uid, uid));
      });

      // Disable friend actions when blocked
      try{
        const blocked = blockState.iBlocked || blockState.blockedByPeer;
        if(blocked){
          if(addBtn){ addBtn.disabled = true; addBtn.textContent = '🚫 Недоступно'; }
          if(rmBtn){ rmBtn.disabled = true; }
        }
      }catch(e){}

      addBtn && (addBtn.onclick = async ()=>{
        if(!me) return toast('Přihlaste se');
        try{
          if(state==='incoming'){
            await (window.acceptFriend ? window.acceptFriend(uid) : Promise.resolve());
          }else if(state==='none'){
            await (window.sendFriendRequest ? window.sendFriendRequest(uid) : Promise.resolve());
          }
        }catch(e){ console.error(e); toast('Chyba'); }
        try{ closeModal('modalUserCard'); }catch(e){}
        try{ window.loadFriends && window.loadFriends(); }catch(e){}
      });

      rmBtn && (rmBtn.onclick = async ()=>{
        if(!me) return toast('Přihlaste se');
        if(!confirm('Odebrat z přátel?')) return;
        try{ await (window.removeFriend ? window.removeFriend(uid) : Promise.resolve()); }
        catch(e){ console.error(e); toast('Chyba'); }
        try{ closeModal('modalUserCard'); }catch(e){}
        try{ window.loadFriends && window.loadFriends(); }catch(e){}
      });

      // Report -> admin ticket (with optional screenshots)
      if(reportBtn){
        reportBtn.onclick = ()=>{
          if(!me) return toast('Пожалуйста, войдите');
          try{ closeModal('modalUserCard'); }catch(e){}
          try{ openReportUserModal(uid, u.nick||''); }catch(e){ console.error(e); }
        };
      }

      openModal('modalUserCard');
      await loadVacanciesInto('userCardVacancies', uid);
    }
    window.showUserCard = showUserCard;

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
})();
