// Admin: Premium / Payments queue (server-only actions)
(function adminPremium(){
  'use strict';

  let _timer = null;

  function $(id){ return document.getElementById(id); }

  function esc(s){ return window.esc ? window.esc(s) : String(s||''); }

  function safeImg(u){
    try{ return window.safeImgSrc ? window.safeImgSrc(u,'') : (u||''); }catch(e){ return u||''; }
  }

  async function loadPayments(){
    if(!window.__isAdmin){ try{ window.toast && toast('Pouze admin'); }catch(e){}; return; }
    if(typeof window.callFn !== 'function'){ try{ window.toast && toast('Functions nejsou dostupné'); }catch(e){}; return; }

    const list = $('adminPremiumRequests');
    const hint = $('adminPayHint');
    if(list) list.innerHTML = '';
    if(hint) hint.textContent = '';

    const status = String(($('adminPayStatus')?.value || 'pending')).trim();

    try{
      const res = await window.callFn('adminPaymentsList', { status, limit: 100 });
      const items = (res && (res.items || res.data?.items)) || (res?.data?.items) || [];
      if(hint) hint.textContent = items.length ? `Nalezeno: ${items.length}` : 'Žádné položky';

      for(const it of items){
        const row = document.createElement('div');
        row.className = 'msg';
        const ts = it.ts ? new Date(it.ts).toLocaleString() : '';
        const proof = it.proof || '';

        row.innerHTML = `
          <div class="bubble" style="width:100%">
            <div class="meta">
              <div class="name"><b>${esc(it.plan||'')}</b> <span class="muted">${esc(ts)}</span></div>
              <div class="time"><span class="pill">${esc(it.status||'')}</span></div>
            </div>
            <div class="muted" style="font-size:12px">UID: <code>${esc(it.uid||'')}</code> · Request: <code>${esc(it.requestId||'')}</code></div>
            ${proof ? `<div class="text" style="margin-top:8px"><img src="${esc(safeImg(proof))}" style="max-width:260px;border-radius:12px"/></div>` : `<div class="muted" style="margin-top:8px">(bez proof)</div>`}
            <div class="actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
              ${status==='pending' ? `
                <button class="btn primary" data-act="approve" data-id="${esc(it.requestId)}">Approve</button>
                <button class="danger" data-act="reject" data-id="${esc(it.requestId)}">Reject</button>
              ` : ''}
              <button class="ghost" data-act="openUser" data-uid="${esc(it.uid||'')}">User</button>
            </div>
          </div>`;

        row.addEventListener('click', async (e)=>{
          const act = e.target?.dataset?.act;
          if(!act) return;
          e.preventDefault();
          e.stopPropagation();

          const rid = e.target.dataset.id;
          const uid = e.target.dataset.uid;

          if(act === 'openUser' && uid){
            try{ window.adminOpenUserCard && window.adminOpenUserCard(uid); }catch(_e){}
            return;
          }

          if(act === 'approve' && rid){
            if(!confirm('Approve platbu?')) return;
            try{ await window.callFn('adminPaymentApprove', { requestId: rid }); }catch(err){ console.warn(err); try{ toast('Approve error'); }catch(_e){} }
            await loadPayments();
          }

          if(act === 'reject' && rid){
            const reason = prompt('Důvod zamítnutí (volitelné):','') || '';
            if(!confirm('Reject platbu?')) return;
            try{ await window.callFn('adminPaymentReject', { requestId: rid, reason }); }catch(err){ console.warn(err); try{ toast('Reject error'); }catch(_e){} }
            await loadPayments();
          }
        });

        if(list) list.appendChild(row);
      }

    }catch(err){
      console.warn(err);
      if(hint) hint.textContent = 'Chyba při načítání';
    }
  }

  function initAdminPremium(){
    // wire reload
    const btn = $('adminPayReload');
    if(btn && btn.dataset.wired !== '1'){
      btn.dataset.wired = '1';
      btn.addEventListener('click', ()=>loadPayments());
    }
    const sel = $('adminPayStatus');
    if(sel && sel.dataset.wired !== '1'){
      sel.dataset.wired = '1';
      sel.addEventListener('change', ()=>loadPayments());
    }

    loadPayments();

    if(_timer) clearInterval(_timer);
    _timer = setInterval(()=>{
      // auto-refresh only on pending to reduce noise
      const st = String(($('adminPayStatus')?.value||'pending')).trim();
      if(st==='pending') loadPayments();
    }, 45000);
  }

  function stopAdminPremiumLive(){
    if(_timer){ clearInterval(_timer); _timer = null; }
  }

  window.initAdminPremium = initAdminPremium;
  window.stopAdminPremiumLive = stopAdminPremiumLive;
  window.adminLoadPremium = loadPayments;

})();
