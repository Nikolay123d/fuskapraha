// Feature: public user card (profile modal) + global [data-uid] delegation
// Extracted from former Stage5 monolith.

(function mkUserCardModule(){
  if(window.__MK_USER_CARD__) return;
  window.__MK_USER_CARD__ = true;

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

      if(ava) ava.src = safeImgSrc(u.avatar||window.DEFAULT_AVATAR, window.DEFAULT_AVATAR);
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
