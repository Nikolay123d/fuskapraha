/*
  Lightweight Analytics (client-side)
  - usersStats/{uid} update on visit: lastSeen, streakDays, etc.
  - counters: chatCount, dmCount

  Notes:
  - For best anti-fraud, move these writes to Cloud Functions.
  - This client-side version is meant to unblock admin visibility quickly.
*/

(function mkAnalyticsModule(){
  'use strict';

  function dayKey(ts = Date.now()){
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  function safeNum(v, def=0){
    const n = (typeof v==='number') ? v : (+v||0);
    return Number.isFinite(n) ? n : def;
  }

  async function touchMyStats(reason='visit'){
    const u = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if(!u) return false;
    if(typeof db === 'undefined') return false;

    const uid = u.uid;
    const nowTs = Date.now();
    const today = dayKey(nowTs);
    const yesterday = dayKey(nowTs - 86400000);

    try{
      const ref = db.ref('usersStats/'+uid);
      await ref.transaction((cur)=>{
        cur = cur || {};

        const prevSeen = safeNum(cur.lastSeen, 0);
        const lastDay = String(cur.lastActiveDay || '');

        // Times
        cur.prevSeen = prevSeen || 0;
        cur.lastSeen = nowTs;

        if(prevSeen > 0){
          const gapHours = (nowTs - prevSeen) / 3600000;
          cur.lastVisitGapHours = Math.round(gapHours*10)/10;
        }

        // Streaks
        if(lastDay !== today){
          const prevStreak = safeNum(cur.streakDays, 0);
          let streak = 1;
          if(lastDay === yesterday){
            streak = prevStreak + 1;
          }
          cur.streakDays = streak;
          cur.maxStreakDays = Math.max(safeNum(cur.maxStreakDays, 0), streak);
          cur.totalActiveDays = safeNum(cur.totalActiveDays, 0) + 1;
          cur.lastActiveDay = today;
        }

        // Ensure counters exist
        cur.chatCount = safeNum(cur.chatCount, 0);
        cur.dmCount = safeNum(cur.dmCount, 0);

        return cur;
      });

      // Also mark daily activity + feature usage counters.
      // Best-effort: analytics must never block UX.
      try{ await incFeatureUsage('visit', 1); }catch(e){}
      return true;
    }catch(e){
      console.warn('[analytics] touchMyStats failed', e);
      return false;
    }
  }

  // --- Feature usage counters (for DAU/retention/top functions) ---
  // featureUsageDaily/{YYYY-MM-DD}/users/{uid}/{event}: number
  async function incFeatureUsage(event, delta=1){
    const u = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if(!u) return false;
    if(typeof db === 'undefined') return false;

    const ev = String(event||'').trim();
    if(!ev || !/^[a-z0-9_]{1,40}$/.test(ev)) return false;

    try{
      delta = Number(delta);
      if(!Number.isFinite(delta) || delta <= 0) delta = 1;
      delta = Math.floor(delta);
      if(delta <= 0) delta = 1;
      // hard cap per call (rules also cap)
      if(delta > 500) delta = 500;
    }catch(e){ delta = 1; }

    try{
      const d = dayKey(Date.now());
      const ref = db.ref(`featureUsageDaily/${d}/users/${u.uid}/${ev}`);
      await ref.transaction((cur)=>{
        const n = (typeof cur==='number') ? cur : (+cur||0);
        return n + delta;
      });
      return true;
    }catch(e){
      return false;
    }
  }

  async function incMyStat(field, delta=1){
    const u = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if(!u) return false;
    if(typeof db === 'undefined') return false;

    field = String(field||'').trim();
    const ALLOWED = { chatCount:1, dmCount:1 };
    if(!ALLOWED[field]) return false;

    try{
      delta = Number(delta);
      if(!Number.isFinite(delta) || delta <= 0) delta = 1;
      delta = Math.floor(delta);
      if(delta <= 0) delta = 1;
    }catch(e){ delta = 1; }

    try{
      const ref = db.ref('usersStats/'+u.uid+'/'+field);
      await ref.transaction((cur)=>{
        const n = (typeof cur==='number') ? cur : (+cur||0);
        return n + delta;
      });
      return true;
    }catch(e){
      console.warn('[analytics] incMyStat failed', e);
      return false;
    }
  }

  // Expose
  window.MK_dayKey = dayKey;
  window.MK_stats_touch = touchMyStats;
  window.MK_stats_inc = incMyStat;
  window.MK_usage = incFeatureUsage;
})();
