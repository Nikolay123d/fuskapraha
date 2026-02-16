// Feature: vacancies (employer posts) – extracted from Stage5 monolith.

(function mkVacanciesModule(){
  if(window.__MK_VACANCIES__) return;
  window.__MK_VACANCIES__ = true;

  // --- Vacancies (employers) ---
    let __vacImgData = null;

    function _setVacImgPreview(dataUrl){
      __vacImgData = dataUrl || null;
      const row = document.getElementById('vacImgPreviewRow');
      const img = document.getElementById('vacImgPreview');
      if(row && img){
        if(__vacImgData){
          img.src = __vacImgData;
          row.style.display = 'flex';
        }else{
          img.removeAttribute('src');
          row.style.display = 'none';
        }
      }
    }

    document.getElementById('vacImgClear')?.addEventListener('click', ()=>{
      const inp = document.getElementById('vacImgFile');
      if(inp) inp.value='';
      _setVacImgPreview(null);
    });

    document.getElementById('vacImgFile')?.addEventListener('change', (e)=>{
      const f = e?.target?.files?.[0];
      if(!f){ _setVacImgPreview(null); return; }
      if(f.size > 650*1024){ toast('Foto je příliš velké (max ~650KB)'); e.target.value=''; return; }
      const r = new FileReader();
      r.onload = ()=>{
        const dataUrl = String(r.result||'');
        if(dataUrl.length > 420000){ toast('Foto je příliš velké'); return; }
        _setVacImgPreview(dataUrl);
      };
      r.readAsDataURL(f);
    });

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
          ${it.img ? `<div style="margin-top:8px"><img src="${esc(it.img)}" alt="" style="max-width:240px;border-radius:12px;border:1px solid var(--line)"/></div>` : ''}
          <div class="d">${esc(it.text||'')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:8px">
            <button class="ghost" data-del-vac="${id}" type="button">Smazat</button>
          </div>`;
        div.querySelector('[data-del-vac]')?.addEventListener('click', async ()=>{
          if(!confirm('Smazat inzerát?')) return;
          const indexId = me.uid + '_' + id;
          // Delete vacancy first (must succeed even if the public index does not exist)
          await db.ref('vacancies/'+me.uid+'/'+id).remove();
          // Best-effort: remove bell-feed index (VIP-only). If it doesn't exist, ignore.
          try{ await db.ref('vacanciesIndex/'+indexId).remove(); }catch(e){}
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
      // Notifications are admin-only (MVP). Client fan-out would be a spam vector.
      // TODO: implement via Cloud Functions later, or show local badge/feed.
      return;
    }

    document.getElementById('vacPublish')?.addEventListener('click', async ()=>{
      const me = auth.currentUser; if(!me) return toast('Přihlaste se');
      const pub = await fetchUserPublic(me.uid);
      const isEmployer = (pub.role==='employer' || pub.role==='job');
      if(!isEmployer) return toast('Tato funkce je jen pro zaměstnavatele');

      // VIP-only: broadcast vacancy to friends (job seekers) via bell feed.
      const planRaw = String(pub.plan||'free');
      const until = Number(pub.premiumUntil||0);
      const planEff = (until && until > 0 && until < Date.now()) ? 'free' : planRaw;
      const feats = (typeof getPlanFeatures === 'function') ? getPlanFeatures(planEff) : (typeof getMyPlanFeatures==='function' ? getMyPlanFeatures() : {});
      const canNotifyFriends = !!feats?.vacancyNotifyFriends;

      const title=(document.getElementById('vacTitle')?.value||'').trim();
      const text=(document.getElementById('vacText')?.value||'').trim();
      const city=(document.getElementById('vacCity')?.value||getCity());
      if(!title || !text) return toast('Vyplňte název a popis');
      const vac = {title, text, city, ts:Date.now(), by:me.uid, broadcast: canNotifyFriends ? true : false};
      if(__vacImgData) vac.img = __vacImgData;
      const id = db.ref('vacancies/'+me.uid).push().key;
      const indexId = me.uid + '_' + id;
      if(canNotifyFriends){
        const updates={};
        updates['vacancies/'+me.uid+'/'+id]=vac;
        // Public index to build a safe bell feed (no notifications write from users).
        // Rules allow only VIP (active) to create this index.
        updates['vacanciesIndex/'+indexId]={
          uid: me.uid,
          ts: vac.ts,
          city: String(city||'').slice(0,40),
          title: String(title||'').slice(0,80),
          previewText: String(text||'').slice(0,240),
          role: String(pub.role||'').slice(0,24),
          fromNick: String(pub.nick||'').slice(0,60),
          fromAvatar: String(pub.avatar||'').slice(0,400),
        };
        await db.ref().update(updates);
        toast('Inzerát zveřejněn (přátelé dostanou upozornění)');
      }else{
        await db.ref('vacancies/'+me.uid+'/'+id).set(vac);
        toast('Inzerát zveřejněn');
        try{ toast('Upozornění přátelům je dostupné ve VIP'); }catch(e){}
      }
      playSound('ok');
      // notify friends looking for job
      try{ await notifyFriendsAboutVacancy(me.uid, vac); }catch(e){ console.warn(e); }
      // clear form
      if(document.getElementById('vacTitle')) document.getElementById('vacTitle').value='';
      if(document.getElementById('vacText')) document.getElementById('vacText').value='';
      if(document.getElementById('vacImgFile')) document.getElementById('vacImgFile').value='';
      _setVacImgPreview(null);
      loadMyVacancies();
    });

    // Notifications moved to:
    //   - features/06-notifications.js (badge + feed)
    //   - features/notifications.js (routing)
    // Premium/plan watcher is in features/premium-limits.js

})();
