// Feature: vacancies (employer posts) – extracted from Stage5 monolith.

(function mkVacanciesModule(){
  if(window.__MK_VACANCIES__) return;
  window.__MK_VACANCIES__ = true;

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
      // Notifications are admin-only (MVP). Client fan-out would be a spam vector.
      // TODO: implement via Cloud Functions later, or show local badge/feed.
      return;
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
      await db.ref().update(updates);
      toast('Inzerát zveřejněn'); playSound('ok');
      // notify friends looking for job
      try{ await notifyFriendsAboutVacancy(me.uid, vac); }catch(e){ console.warn(e); }
      // clear form
      if(document.getElementById('vacTitle')) document.getElementById('vacTitle').value='';
      if(document.getElementById('vacText')) document.getElementById('vacText').value='';
      loadMyVacancies();
    });

    // Notifications moved to:
    //   - features/06-notifications.js (badge + feed)
    //   - features/notifications.js (routing)
    // Premium/plan watcher is in features/premium-limits.js

})();
