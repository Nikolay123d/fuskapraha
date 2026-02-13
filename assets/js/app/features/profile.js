// Feature: profile view (my profile editing + admin approvals)
// Extracted from former Stage5 monolith.

(function mkProfileModule(){
  if(window.__MK_PROFILE__) return;
  window.__MK_PROFILE__ = true;

  // --- Profile locking & requests ---
    async function loadMyProfileUI(u){
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
      document.getElementById('myAvatar').src = up.avatar || window.DEFAULT_AVATAR;
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
        openPremiumBot();
      };
    
      // Load my vacancies editor (if available)
      try{ if(typeof loadMyVacancies === 'function') loadMyVacancies(u.uid); }catch(e){}
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
      const boxPay=document.getElementById('adminPaymentRequests');
      if(boxP) boxP.innerHTML='';

      // Premium plan requests (MVP): payments/requestsIndex/{requestId}
      // - created by user via Privilegia bot screen
      // - admin reviews/approves here
      const idxSnap = await db.ref('payments/requestsIndex').orderByChild('ts').limitToLast(200).get();
      const idxVal = idxSnap.val() || {};

      const all = [];
      for(const [id, idx] of Object.entries(idxVal)){
        if(idx && idx.status === 'pending') all.push({id, idx});
      }
      all.sort((a,b)=>((b.idx.ts||0)-(a.idx.ts||0)));

      for(const item of all.slice(0,160)){
        const uid = item.idx.uid;
        if(!uid) continue;
        const u = await getUser(uid);

        // fetch full request (for note/proof)
        let r = null;
        try{
          const rs = await db.ref(`payments/requests/${uid}/${item.id}`).get();
          r = rs.val() || null;
        }catch(e){}
        r = r || item.idx || {};

        const plan = String(r.plan || item.idx.plan || 'premium');
        const planTitle = (typeof PREMIUM_PLANS!=='undefined' && PREMIUM_PLANS && PREMIUM_PLANS[plan]?.title) ? PREMIUM_PLANS[plan].title : (r.title || plan);
        const period = r.period || (typeof PREMIUM_PLANS!=='undefined' && PREMIUM_PLANS && PREMIUM_PLANS[plan]?.period) || '';
        const price  = (r.price!=null) ? r.price : ((typeof PREMIUM_PLANS!=='undefined' && PREMIUM_PLANS && PREMIUM_PLANS[plan]?.price) ? PREMIUM_PLANS[plan].price : '');
        const proofUrl = r.proofUrl || item.idx.proofUrl || '';
        const note = r.text ? String(r.text) : '';
        const city = r.city || item.idx.city || '';

        const el=document.createElement('div'); el.className='msg';
        el.innerHTML = `<div class="ava"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
          <div class="bubble" style="width:100%">
            <div class="name" data-uid="${esc(uid)}"><b>${esc(u.nick||'Uživatel')}</b> · ${esc(String(planTitle))}</div>
            <div class="muted">Cena: ${esc(String(price||''))} Kč · ${esc(String(period||''))}</div>
            ${city ? `<div class="muted">City: ${esc(String(city))}</div>` : ''}
            ${note ? `<div class="muted" style="margin-top:4px">${esc(note)}</div>` : ''}
            ${proofUrl ? `<div style="margin-top:6px"><a href="${esc(proofUrl)}" target="_blank" rel="noopener">Otevřít screenshot</a><div><img src="${esc(proofUrl)}" style="max-width:220px;border-radius:10px;margin-top:6px"></div></div>` : `<div class="muted" style="margin-top:6px">(bez screenshotu)</div>`}
            <div class="actions">
              <button data-act="grant30">Udělit 30 dní</button>
              <button data-act="grantVip">Udělit VIP</button>
              <button data-act="reject">Zamítnout</button>
            </div>
          </div>`;

        el.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act; if(!act) return;
          const now=Date.now();

          if(act==='grant30' || act==='grantVip'){
            let planUntil=0;
            if(act==='grant30') planUntil = now + 30*24*60*60*1000;
            await db.ref('usersPublic/'+uid).update({plan, planUntil, premiumSince: now});
            await db.ref(`payments/requests/${uid}/${item.id}`).update({status:'approved', decidedAt: now, decidedBy: me.uid});
            await db.ref('payments/requestsIndex/'+item.id).update({status:'approved'});
            try{ auditLog && auditLog('premium_request_approved', String(uid), { plan, planUntil, requestId: item.id }); }catch(e){}
            toast('Privilegium uděleno');
            loadAdminRequests();
            return;
          }

          if(act==='reject'){
            await db.ref(`payments/requests/${uid}/${item.id}`).update({status:'rejected', decidedAt: now, decidedBy: me.uid});
            await db.ref('payments/requestsIndex/'+item.id).update({status:'rejected'});
            try{ auditLog && auditLog('premium_request_rejected', String(uid), { plan, requestId: item.id }); }catch(e){}
            toast('Zamítnuto');
            loadAdminRequests();
            return;
          }
        });
        boxP && boxP.appendChild(el);
      }
    }

  // Export API for drawer/router
  try{ window.loadMyProfileUI = loadMyProfileUI; }catch(e){}
  try{ window.loadAdminRequests = loadAdminRequests; }catch(e){}

})();
