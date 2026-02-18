// === Online ×7 (UI-only multiplier) ===
// Safe: does NOT affect any logic/permissions.
// It only updates window.__onlineStatsPublic so UI can show a livelier "online" number.
(function(){
  const MULT = 7;
  const WINDOW_MS = 120000; // online if last presence ts within 2 minutes
  const TICK_MS = 20000;    // recompute every 20s

  let __timer = null;

  async function compute(){
    try{
      if(!window.db || !window.auth) return;
      if(!auth.currentUser) return;

      const now = Date.now();
      const snap = await db
        .ref('presence')
        .orderByChild('ts')
        .startAt(now - WINDOW_MS)
        .once('value');

      const v = snap.val() || {};
      let real = 0;
      for(const uid in v){
        const p = v[uid] || {};
        const ts = Number(p.ts || p.lastActiveTs || 0);
        if(!ts) continue;
        if((now - ts) > WINDOW_MS) continue;
        // If client explicitly writes online:false, respect it.
        if(p && p.online === false) continue;
        real += 1;
      }

      const display = Math.max(MULT, real * MULT);
      window.__onlineStatsPublic = {
        total: display,
        real: real,
        mult: MULT,
        computedAt: now
      };
    }catch(e){
      // keep silent (UI-only)
    }
  }

  function start(){
    if(__timer) return;
    compute();
    __timer = setInterval(compute, TICK_MS);
  }

  window.addEventListener('app:auth-ready', start, {once:true});
})();
