// Admin: Dashboard (MVP)
// Shows a few quick metrics without heavy scans.

(function mkAdminDashboard(){
  if(window.__MK_ADMIN_DASH__) return;
  window.__MK_ADMIN_DASH__ = true;

  let _timer = null;

  function $(id){ return document.getElementById(id); }

  async function calcOnlineApprox(){
    // Best-effort: count presence/* children (limited).
    // If your presence node differs, replace here.
    try{
      const snap = await db.ref('presence').limitToFirst(5000).get();
      const v = snap.val() || {};
      return Object.keys(v).length;
    }catch(e){
      return null;
    }
  }

  async function calcDauApprox(){
    // Best-effort: scan lastSeen of usersStats (limited).
    // NOTE: for real DAU you need server-side aggregation.
    try{
      const snap = await db.ref('usersStats').limitToFirst(3000).get();
      const v = snap.val() || {};
      const cutoff = Date.now() - 24*60*60*1000;
      let n = 0;
      for(const it of Object.values(v)){
        const ls = Number(it?.lastSeen||0);
        if(ls && ls >= cutoff) n++;
      }
      return n;
    }catch(e){
      return null;
    }
  }

  async function calcMessagesTodayApprox(){
    // No global aggregate in current schema. Return null.
    return null;
  }

  async function calcAutopostToday(){
    try{
      const day = (typeof window.MK_dayKey === 'function') ? window.MK_dayKey(Date.now()) : new Date().toISOString().slice(0,10);
      const snap = await db.ref('autopostStats').orderByKey().limitToLast(2000).get();
      const v = snap.val() || {};
      let total = 0;
      for(const uid of Object.keys(v)){
        const d = v[uid]?.[day];
        if(d && typeof d.posts==='number') total += d.posts;
        else if(typeof d === 'number') total += d;
      }
      return total;
    }catch(e){
      return null;
    }
  }

  function setBig(id, val){
    const el = $(id);
    if(!el) return;
    el.textContent = (val===null || val===undefined) ? '—' : String(val);
  }

  async function refresh(){
    if(!window.__isAdmin) return;
    try{
      const [onl, dau, auto] = await Promise.all([
        calcOnlineApprox(),
        calcDauApprox(),
        calcAutopostToday()
      ]);
      setBig('admDashOnline', onl);
      setBig('admDashDau', dau);
      setBig('admDashAuto', auto);
      const msg = await calcMessagesTodayApprox();
      setBig('admDashMsg', msg);

      const alerts = $('admDashAlerts');
      if(alerts){
        const out = [];
        if(onl !== null && onl > 4000) out.push('⚠️ Podezřele vysoký online (zkontroluj abuser / bots)');
        if(auto !== null && auto > 5000) out.push('⚠️ Autopost spike (zkontroluj intervaly kampaní)');
        alerts.textContent = out.length ? out.join('\n') : 'Žádné alerty (MVP).';
      }
    }catch(e){
      console.warn(e);
    }
  }

  function initAdminDashboard(){
    if(!window.__isAdmin) return;
    stopAdminDashboardLive();
    refresh();
    _timer = setInterval(refresh, 30000);
  }
  function stopAdminDashboardLive(){
    if(_timer){ clearInterval(_timer); _timer = null; }
  }

  window.initAdminDashboard = initAdminDashboard;
  window.stopAdminDashboardLive = stopAdminDashboardLive;
})();
