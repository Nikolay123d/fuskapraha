// Feature: profile view (my profile editing + admin approvals)
// Extracted from former Stage5 monolith.

(function mkProfileModule(){
  if(window.__MK_PROFILE__) return;
  window.__MK_PROFILE__ = true;

  // --- Profile locking & requests ---
    async function loadMyProfileUI(u){
      if(!u) return;

      // Unified per-view mini-loader
      try{ setMiniLoad('profileMiniLoad','Načítám profil…', true); }catch(e){}

      try{
      try{ await ensureMyPublic(u); }catch(e){}
      const up = (await db.ref('usersPublic/'+u.uid).get()).val()||{};
      const priv = (await db.ref('users/'+u.uid+'/profile').get()).val()||{};
      const nickLocked = up.nickLocked===true;
      const roleLocked = up.roleLocked===true;

      // Fill UI
      document.getElementById('myName').textContent = up.nick || u.displayName || 'Uživatel';
      // Email is not stored in usersPublic; show stable ID instead
      document.getElementById('profileEmail').textContent = 'ID: '+u.uid;
      document.getElementById('profileRoleLine').textContent = 'Role: '+(up.role==='employer'?'Zaměstnavatel':'Hledám práci');
      document.getElementById('myAvatar').src = safeImgSrc(up.avatar || window.DEFAULT_AVATAR, window.DEFAULT_AVATAR);
      const plan = (up.plan||'free');
      const badge=document.getElementById('myPlan');
      const planVal = String(plan||'').toLowerCase();
      const isPrem = !!planVal && !['free','none','0','basic'].includes(planVal);
      if(badge){ badge.style.display = isPrem ? 'inline-block':'none'; }
      const myAdmin=document.getElementById('myAdmin');
      const isAdm = isAdminUser(u);
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
      if(setAbout) setAbout.value = priv.about || '';

      const setCompany = document.getElementById('setCompany');
      const setPhone = document.getElementById('setPhone');
      const setSkills = document.getElementById('setSkills');
      if(setCompany) setCompany.value = priv.company || '';
      if(setPhone) setPhone.value = priv.phone || '';
      if(setSkills) setSkills.value = priv.skills || '';

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
        const patchPriv = {};
        // public: avatar/nick/role (minimal)
        const avatarUrl=(document.getElementById('setAvatarUrl').value||'').trim();
        if(avatarUrl) patch.avatar = avatarUrl;
        // private fields
        const about=(document.getElementById('setAbout').value||'').trim();
        patchPriv.about = about || null;
        const company=(document.getElementById('setCompany')?.value||'').trim();
        patchPriv.company = company || null;
        const phone=(document.getElementById('setPhone')?.value||'').trim();
        patchPriv.phone = phone || null;
        const skills=(document.getElementById('setSkills')?.value||'').trim();
        patchPriv.skills = skills || null;
        // allow initial nick/role once
        if(!nickLocked){
          const nick=(document.getElementById('setNick').value||'').trim();
          if(nick){ patch.nick = nick; patch.nickLocked = true; }
        }
        if(!roleLocked){
          const role=document.getElementById('setRole').value;
          if(role){ patch.role = role; patch.roleLocked = true; }
        }
        if(Object.keys(patch).length) await db.ref('usersPublic/'+u.uid).update(patch);
        await db.ref('users/'+u.uid+'/profile').update(patchPriv);
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
        try{ showView('view-premium'); }catch(e){ try{ window.openPremiumBot && window.openPremiumBot(); }catch(_e){} }
      };
    
      // Load my vacancies editor (if available)
      try{ if(typeof loadMyVacancies === 'function') loadMyVacancies(u.uid); }catch(e){}
      } finally {
        try{ setMiniLoad('profileMiniLoad','', false); }catch(e){}
      }
}

  // Avatar from phone: convert to medium-size dataURL for fast mobile UX
  let __AVATAR_FILE_WIRED = false;
  function wireAvatarFile(){
    if(__AVATAR_FILE_WIRED) return;
    __AVATAR_FILE_WIRED = true;
    const inp = document.getElementById('avatarFile');
    const urlInput = document.getElementById('setAvatarUrl');
    const preview = document.getElementById('myAvatar');
    if(!inp || !urlInput) return;

    inp.addEventListener('change', async ()=>{
      const f = inp.files && inp.files[0];
      if(!f) return;
      try{
        const dataUrl = await fileToDataURL(f, { max: 420, quality: 0.82 });
        urlInput.value = dataUrl;
        if(preview) preview.src = dataUrl;
      }catch(e){
        console.warn('[PROFILE] avatar file error', e);
        toast('Nepodařilo se načíst obrázek');
      }finally{
        try{ inp.value=''; }catch(_e){}
      }
    });
  }

  async function enterProfileView(){
    const u = auth.currentUser;
    if(!u){
      try{ openModalAuth('login'); }catch(e){}
      return;
    }
    try{ wireAvatarFile(); }catch(e){}
    await loadMyProfileUI(u);
  }

  // Expose minimal API
  window.enterProfileView = enterProfileView;
  window.loadMyProfileUI = loadMyProfileUI;

    
// --- Admin: approve requests ---
    async function loadAdminRequests(){
  const me=auth.currentUser;
  if(!isAdminUser(me)) return;

  // Lazy: load only active admin tab (profile / premium). Fallback: load both.
  const tab=(window.__ADMIN_TAB__||'all');
  let doProfile=true, doPremium=true;
  if(tab==='profile'){ doPremium=false; }
  if(tab==='premium'){ doProfile=false; }

  // --- Profile change requests ---
  const box=document.getElementById('adminProfileRequests');
  const emptyProfile=document.getElementById('adminProfileEmpty');

  if(doProfile && box){
    box.innerHTML='';
    if(emptyProfile) emptyProfile.style.display='none';

    try{
      const snap=await db.ref('profileChangeRequests').orderByChild('ts').limitToLast(80).get();
      const v=snap.exists()?snap.val():{};
      const ids=Object.keys(v||{}).sort((a,b)=>(v[a]?.ts||0)-(v[b]?.ts||0)).reverse();

      let count=0;
      for(const id of ids){
        const req=v[id];
        if(!req) continue;

        const el=document.createElement('div');
        el.className='item';

        const top=document.createElement('div');
        top.className='row';
        top.style.justifyContent='space-between';

        const title=document.createElement('b');
        title.textContent = (req.type||'request');

        const when=document.createElement('div');
        when.className='muted';
        when.textContent = req.ts?new Date(req.ts).toLocaleString():'';

        top.appendChild(title);
        top.appendChild(when);

        const uid=req.uid||'';
        const user=uid?await fetchUserPublic(uid):null;

        const mid=document.createElement('div');
        mid.className='muted';
        mid.textContent = (user?.nick||uid) + ' • ' + (req.status||'');

        const actions=document.createElement('div');
        actions.className='row';
        actions.style.gap='8px';
        actions.style.marginTop='8px';

        if(req.status==='pending'){
          count++;

          const btnOk=document.createElement('button');
          btnOk.className='ghost';
          btnOk.textContent='Approve';
          btnOk.addEventListener('click', async ()=>{
            await db.ref('profileChangeRequests/'+id+'/status').set('approved');
            try{ auditLog('profile_change_approve', uid, JSON.stringify({type:req.type})); }catch(_){}
            loadAdminRequests();
          });

          const btnNo=document.createElement('button');
          btnNo.className='ghost';
          btnNo.textContent='Reject';
          btnNo.addEventListener('click', async ()=>{
            await db.ref('profileChangeRequests/'+id+'/status').set('rejected');
            try{ auditLog('profile_change_reject', uid, JSON.stringify({type:req.type})); }catch(_){}
            loadAdminRequests();
          });

          actions.appendChild(btnOk);
          actions.appendChild(btnNo);
        }

        el.appendChild(top);
        el.appendChild(mid);

        if(req.text){
          const t=document.createElement('div');
          t.textContent=req.text;
          el.appendChild(t);
        }

        if(actions.childNodes.length) el.appendChild(actions);
        box.appendChild(el);
      }

      if(emptyProfile) emptyProfile.style.display = count? 'none' : '';
    }catch(e){ console.warn(e); }
  }else{
    if(emptyProfile) emptyProfile.style.display='none';
  }

  // --- Premium requests (support/planRequests + payments/requestsIndex) ---
  const boxP=document.getElementById('adminPremiumRequests');
  const boxPay=document.getElementById('adminPaymentRequests');
  const emptyPremium=document.getElementById('adminPremiumEmpty');

  if(doPremium && (boxP||boxPay)){
    if(boxP) boxP.innerHTML='';
    if(boxPay) boxPay.innerHTML='';
    if(emptyPremium) emptyPremium.style.display='none';

    let count=0;

    // Legacy/simple requests
    try{
      const snap=await db.ref('support/planRequests').orderByChild('ts').limitToLast(120).get();
      const v=snap.exists()?snap.val():{};
      const ids=Object.keys(v||{}).sort((a,b)=>(v[a]?.ts||0)-(v[b]?.ts||0)).reverse();

      for(const id of ids){
        const req=v[id];
        if(!req) continue;
        const user=req.by?await fetchUserPublic(req.by):null;

        const el=document.createElement('div');
        el.className='item';

        const top=document.createElement('div');
        top.className='row';
        top.style.justifyContent='space-between';

        const title=document.createElement('b');
        title.textContent = `${req.plan||''}`.toUpperCase();

        const when=document.createElement('div');
        when.className='muted';
        when.textContent = req.ts?new Date(req.ts).toLocaleString():'';

        top.appendChild(title);
        top.appendChild(when);

        const mid=document.createElement('div');
        mid.className='muted';
        mid.textContent = (user?.nick||req.by||'') + ' • ' + (req.status||'');

        const actions=document.createElement('div');
        actions.className='row';
        actions.style.gap='8px';
        actions.style.marginTop='8px';

        if(req.status==='pending'){
          count++;

          const btn30=document.createElement('button');
          btn30.className='ghost';
          btn30.textContent='Grant 30d';
          btn30.addEventListener('click', async ()=>{
            const until=Date.now()+30*86400000;
            await db.ref('usersPublic/'+req.by).update({plan:req.plan, planUntil:until});
            await db.ref('support/planRequests/'+id+'/status').set('approved');
            try{ auditLog('plan_grant_30d', req.by, JSON.stringify({plan:req.plan, until})); }catch(_){}
            loadAdminRequests();
          });

          const btnVip=document.createElement('button');
          btnVip.className='ghost';
          btnVip.textContent='Grant VIP';
          btnVip.addEventListener('click', async ()=>{
            const until=Date.now()+30*86400000;
            await db.ref('usersPublic/'+req.by).update({plan:'vip', planUntil:until});
            await db.ref('support/planRequests/'+id+'/status').set('approved');
            try{ auditLog('plan_grant_vip', req.by, JSON.stringify({plan:'vip', until})); }catch(_){}
            loadAdminRequests();
          });

          const btnNo=document.createElement('button');
          btnNo.className='ghost';
          btnNo.textContent='Reject';
          btnNo.addEventListener('click', async ()=>{
            await db.ref('support/planRequests/'+id+'/status').set('rejected');
            try{ auditLog('plan_reject', req.by, JSON.stringify({plan:req.plan})); }catch(_){}
            loadAdminRequests();
          });

          actions.appendChild(btn30);
          actions.appendChild(btnVip);
          actions.appendChild(btnNo);
        }

        el.appendChild(top);
        el.appendChild(mid);

        if(req.text){
          const t=document.createElement('div');
          t.textContent=req.text;
          el.appendChild(t);
        }

        if(req.proofImg){
          const img=document.createElement('img');
          img.className='thumb';
          img.alt='proof';
          img.src=safeImgSrc(req.proofImg);
          img.addEventListener('click', ()=>window.open(img.src,'_blank'));
          el.appendChild(img);
        }

        if(actions.childNodes.length) el.appendChild(actions);
        if(boxP) boxP.appendChild(el);
      }
    }catch(e){ console.warn(e); }

    // New index (if used)
    try{
      const snap=await db.ref('payments/requestsIndex').orderByChild('ts').limitToLast(120).get();
      const v=snap.exists()?snap.val():{};
      const ids=Object.keys(v||{}).sort((a,b)=>(v[a]?.ts||0)-(v[b]?.ts||0)).reverse();

      for(const id of ids){
        const req=v[id];
        if(!req) continue;
        if(!boxPay) break;

        const user=req.uid?await fetchUserPublic(req.uid):null;

        const el=document.createElement('div');
        el.className='item';

        const top=document.createElement('div');
        top.className='row';
        top.style.justifyContent='space-between';

        const title=document.createElement('b');
        title.textContent = `${req.plan||''}`.toUpperCase();

        const when=document.createElement('div');
        when.className='muted';
        when.textContent = req.ts?new Date(req.ts).toLocaleString():'';

        top.appendChild(title);
        top.appendChild(when);

        const mid=document.createElement('div');
        mid.className='muted';
        mid.textContent = (user?.nick||req.uid||'') + ' • ' + (req.status||'');

        el.appendChild(top);
        el.appendChild(mid);

        if(req.proofUrl){
          const a=document.createElement('a');
          a.href=safeHref(req.proofUrl);
          a.target='_blank';
          a.rel='noopener';
          a.textContent='Otevřít screenshot';
          el.appendChild(a);
        }

        boxPay.appendChild(el);
      }
    }catch(e){ console.warn(e); }

    if(emptyPremium) emptyPremium.style.display = count? 'none' : '';
  }else{
    if(emptyPremium) emptyPremium.style.display='none';
  }
}


  try{ window.loadAdminRequests = loadAdminRequests; }catch(e){}

})();
