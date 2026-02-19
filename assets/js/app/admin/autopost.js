// Admin: Autopost campaigns overview (server-only control)

(function mkAdminAutopost(){
  if(window.__MK_ADMIN_AUTOPOST__) return;
  window.__MK_ADMIN_AUTOPOST__ = true;

  let _timer = null;

  function $(id){ return document.getElementById(id); }

  function fmtTs(ts){
    ts = Number(ts||0);
    if(!ts) return '—';
    try{ return new Date(ts).toLocaleString(); }catch(e){ return String(ts); }
  }

  async function loadList(){
    const box = $('admAutopostList');
    const mini = $('admAutopostMini');
    if(!box) return;
    box.innerHTML = '';
    if(mini) mini.style.display = '';

    try{
      const snap = await db.ref('autopostActive').orderByChild('nextPostTs').limitToFirst(200).get();
      const v = snap.val() || {};
      const rows = Object.entries(v).map(([id, c])=>({ campaignId:id, ...(c||{}) }));
      rows.sort((a,b)=>Number(a.nextPostTs||0)-Number(b.nextPostTs||0));
      if(!rows.length){
        box.innerHTML = '<div class="mini-hint">Žádné aktivní kampaně.</div>';
        return;
      }

      for(const c of rows){
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginTop = '10px';

        const head = document.createElement('div');
        head.className = 'row';
        head.style.alignItems = 'center';
        head.style.gap = '10px';

        const title = document.createElement('b');
        title.textContent = (c.city||'') + ' · ' + (c.uid||'');
        head.appendChild(title);

        const spacer = document.createElement('span');
        spacer.className = 'spacer';
        head.appendChild(spacer);

        const btnDisable = document.createElement('button');
        btnDisable.type = 'button';
        btnDisable.className = 'ghost';
        btnDisable.textContent = 'Disable';
        btnDisable.addEventListener('click', async (e)=>{
          e.stopPropagation();
          if(typeof window.callFn !== 'function'){ toast('Server není dostupný (Functions)'); return; }
          try{
            await window.callFn('adminAutopostDisable', { campaignId: c.campaignId });
            toast('Disabled');
            await loadList();
          }catch(err){ console.warn(err); toast('Chyba'); }
        });

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'ghost danger';
        btnDel.textContent = 'Delete';
        btnDel.addEventListener('click', async (e)=>{
          e.stopPropagation();
          if(!confirm('Smazat kampaň?')) return;
          if(typeof window.callFn !== 'function'){ toast('Server není dostupný (Functions)'); return; }
          try{
            await window.callFn('adminAutopostDelete', { campaignId: c.campaignId });
            toast('Deleted');
            await loadList();
          }catch(err){ console.warn(err); toast('Chyba'); }
        });

        head.appendChild(btnDisable);
        head.appendChild(btnDel);
        card.appendChild(head);

        const info = document.createElement('div');
        info.className = 'muted';
        info.style.whiteSpace = 'pre-wrap';
        info.textContent =
          'campaignId: ' + c.campaignId + '\n' +
          'intervalMin: ' + (c.intervalMin||'—') + '\n' +
          'lastPostTs: ' + fmtTs(c.lastPostTs) + '\n' +
          'nextPostTs: ' + fmtTs(c.nextPostTs);
        card.appendChild(info);

        box.appendChild(card);
      }
    }catch(e){
      console.warn(e);
      box.innerHTML = '<div class="mini-hint">Chyba načítání autopost indexu.</div>';
    }finally{
      if(mini) mini.style.display = 'none';
    }
  }

  function initAdminAutopost(){
    if(!window.__isAdmin) return;
    stopAdminAutopostLive();
    loadList();
    _timer = setInterval(loadList, 60000);

    const btn = $('admAutopostReload');
    if(btn && btn.dataset.wired!=='1'){
      btn.dataset.wired = '1';
      btn.addEventListener('click', ()=>loadList());
    }
  }

  function stopAdminAutopostLive(){
    if(_timer){ clearInterval(_timer); _timer = null; }
  }

  window.initAdminAutopost = initAdminAutopost;
  window.stopAdminAutopostLive = stopAdminAutopostLive;
})();
