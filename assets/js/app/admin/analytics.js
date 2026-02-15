// Admin Analytics (DAU / retention / top features) based on featureUsageDaily + usersStats
(function adminAnalyticsModule(){
  'use strict';

  function _$(id){ return document.getElementById(id); }
  function _esc(s){ try{ return (window.esc ? esc(String(s)) : String(s)); }catch(e){ return String(s); } }

  const _nickCache = Object.create(null);

  function _isPriv(){
    return !!(window.__isAdmin || window.__isMod);
  }

  function _setMini(show, text){
    const box=_$('adminAnalyticsMiniLoad');
    if(!box) return;
    box.style.display = show ? 'flex' : 'none';
    if(text){
      const t=_$('adminAnalyticsMiniText');
      if(t) t.textContent = String(text);
    }
  }

  function _fmtPct(x){
    if(!Number.isFinite(x)) return '—';
    const v = Math.max(0, Math.min(999, x));
    return (Math.round(v*10)/10).toFixed(1) + '%';
  }

  async function _getNick(uid){
    const key = String(uid||'');
    if(!key) return '';
    if(_nickCache[key]) return _nickCache[key];
    try{
      if(typeof db === 'undefined') return key;
      const s = await db.ref('usersPublic/'+key+'/nick').get();
      const nick = (s && s.exists()) ? String(s.val()||'') : '';
      _nickCache[key] = nick || key;
      return _nickCache[key];
    }catch(e){
      _nickCache[key] = key;
      return key;
    }
  }

  async function loadAdminAnalytics(){
    try{
      if(!_isPriv()){
        try{ window.mkToast && mkToast('Admin: analytics nejsou dostupné'); }catch(e){}
        return;
      }
      if(typeof db === 'undefined'){
        try{ window.mkToast && mkToast('Firebase není připraven'); }catch(e){}
        return;
      }

      const daysEl=_$('adminAnalyticsDays');
      let days = daysEl ? parseInt(daysEl.value,10) : 7;
      if(!Number.isFinite(days) || days<1) days=7;
      if(days>60) days=60;

      const now = Date.now();
      const dayKeys=[];
      for(let i=days-1;i>=0;i--){
        const ts = now - i*86400000;
        if(window.MK_dayKey) dayKeys.push(MK_dayKey(ts));
        else dayKeys.push(new Date(ts).toISOString().slice(0,10));
      }

      _setMini(true, 'Načítám analytics…');

      const perDay=[]; // {day, dau, set}
      const rangeEventTotals = Object.create(null); // ev -> count
      const rangeUserTotals  = Object.create(null); // uid -> count

      for(let i=0;i<dayKeys.length;i++){
        const day = dayKeys[i];
        _setMini(true, 'Načítám '+day+'…');

        let val = null;
        try{
          const snap = await db.ref('featureUsageDaily/'+day+'/users').get();
          val = snap.exists() ? (snap.val()||{}) : {};
        }catch(e){
          val = {};
        }

        const uids = Object.keys(val||{});
        const set = new Set(uids);
        perDay.push({day, dau: uids.length, set});

        // accumulate totals (range)
        for(const uid of uids){
          const uObj = val[uid] || {};
          for(const k in uObj){
            if(!Object.prototype.hasOwnProperty.call(uObj,k)) continue;
            const n = Number(uObj[k]);
            if(!Number.isFinite(n)) continue;
            rangeEventTotals[k] = (rangeEventTotals[k]||0) + n;
            rangeUserTotals[uid] = (rangeUserTotals[uid]||0) + n;
          }
        }
      }

      // Render daily rows
      const tbody=_$('adminAnalyticsDailyRows');
      if(tbody) tbody.innerHTML='';

      for(let i=0;i<perDay.length;i++){
        const cur = perDay[i];
        let retentionTxt='—';
        if(i>0){
          const prev = perDay[i-1];
          const prevCount = prev.dau;
          if(prevCount>0){
            let inter=0;
            for(const uid of prev.set){ if(cur.set.has(uid)) inter++; }
            retentionTxt = _fmtPct((inter/prevCount)*100);
          }
        }

        if(tbody){
          const tr=document.createElement('tr');
          tr.innerHTML = `
            <td><code>${_esc(cur.day)}</code></td>
            <td>${_esc(cur.dau)}</td>
            <td>${_esc(retentionTxt)}</td>
          `;
          tbody.appendChild(tr);
        }
      }

      // Summary
      const summary=_$('adminAnalyticsSummary');
      try{
        const today = perDay.length ? perDay[perDay.length-1] : null;
        const yest  = perDay.length>1 ? perDay[perDay.length-2] : null;
        let ret='—';
        if(today && yest && yest.dau>0){
          let inter=0;
          for(const uid of yest.set){ if(today.set.has(uid)) inter++; }
          ret=_fmtPct((inter/yest.dau)*100);
        }
        const activeUids = Object.keys(rangeUserTotals).length;
        if(summary){
          summary.textContent = `Rozsah: posledních ${days} dní. Dnes DAU: ${today?today.dau:0}. Včera DAU: ${yest?yest.dau:0}. D1 (včera→dnes): ${ret}. Aktivních uživatelů v rozsahu: ${activeUids}.`;
        }
      }catch(e){
        if(summary) summary.textContent='';
      }

      // Top functions
      const topFns=_$('adminAnalyticsTopFns');
      if(topFns) topFns.innerHTML='';
      const evPairs = Object.entries(rangeEventTotals).sort((a,b)=>(b[1]||0)-(a[1]||0)).slice(0,15);
      if(topFns){
        if(evPairs.length===0){
          topFns.innerHTML = '<div class="muted">Zatím žádná data.</div>';
        }else{
          for(const [ev,count] of evPairs){
            const row=document.createElement('div');
            row.className='row';
            row.style.alignItems='center';
            row.style.justifyContent='space-between';
            row.style.padding='8px 0';
            row.innerHTML = `<div><b>${_esc(ev)}</b></div><div class="muted">${_esc(count)}</div>`;
            topFns.appendChild(row);
          }
        }
      }

      // Top users
      const topUsers=_$('adminAnalyticsTopUsers');
      if(topUsers) topUsers.innerHTML='';
      const userPairs = Object.entries(rangeUserTotals).sort((a,b)=>(b[1]||0)-(a[1]||0)).slice(0,15);
      if(topUsers){
        if(userPairs.length===0){
          topUsers.innerHTML = '<div class="muted">Zatím žádní aktivní uživatelé.</div>';
        }else{
          for(const [uid,count] of userPairs){
            const nick = await _getNick(uid);
            const row=document.createElement('div');
            row.className='card';
            row.style.padding='10px 12px';
            row.style.margin='8px 0';
            row.innerHTML = `
              <div class="row" style="align-items:center">
                <b>${_esc(nick || '—')}</b>
                <span class="spacer"></span>
                <span class="muted">${_esc(count)}</span>
              </div>
              <div class="muted" style="margin-top:6px"><code>${_esc(uid)}</code></div>
            `;
            topUsers.appendChild(row);
          }
        }
      }

      _setMini(false);
    }catch(e){
      console.warn('[adminAnalytics] failed', e);
      _setMini(false);
      try{ window.mkToast && mkToast('Analytics: chyba načtení'); }catch(_e){}
    }
  }

  window.loadAdminAnalytics = loadAdminAnalytics;

})();
