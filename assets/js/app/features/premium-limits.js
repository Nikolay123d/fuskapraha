/*
  Premium + Limits (centralized)
  - Reads user plan from usersPublic/{uid}/plan (+ optional premiumUntil)
  - Provides daily limit counters stored privately under users/{uid}/limits

  API:
    checkLimit(action) -> { ok, plan, limit, count, remaining, msg? }
    incLimit(action, delta=1)
    resetDay()
    watchMyPlan(uid) // started/stopped by auth-state
*/

(function premiumLimitsModule(){
  // Defaults are intentionally generous to avoid disrupting UX.
  // Adjust centrally here if you want stricter limits.
  const PLAN_LIMITS = {
    free:        { friend: 30, dm: 200 },
    premium:     { friend: 200, dm: 1000 },
    premiumplus: { friend: 500, dm: 2500 },
    vip:         { friend: 1e12, dm: 1e12 },
    bot:         { friend: 1e12, dm: 1e12 }
  };

  let __myPlan = 'free';
  let __myPlanUntil = 0;
  let __planLoaded = false;
  let __planRef = null;
  let __planCb = null;

  function dayKey(ts = Date.now()){
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  function normPlan(p){
    p = String(p||'free').trim().toLowerCase();
    if(!p) p = 'free';
    if(p === 'premium+') p = 'premiumplus';
    if(p === 'premium_plus') p = 'premiumplus';
    return p;
  }

  function effectivePlan(plan, until){
    const p = normPlan(plan);
    const u = +until || 0;
    // If there is an expiration and it's in the past, treat as free locally.
    if(u && u > 0 && u < Date.now()) return 'free';
    return p;
  }

  function getLimitFor(plan, action){
    const p = normPlan(plan);
    const a = String(action||'').trim().toLowerCase();
    const byPlan = PLAN_LIMITS[p] || PLAN_LIMITS.free;
    const v = byPlan[a];
    return (typeof v === 'number') ? v : 1e12;
  }

  function updatePlanBadge(){
    try{
      const el = document.getElementById('myPlan');
      if(!el) return;
      const p = effectivePlan(__myPlan, __myPlanUntil);
      if(!p || p === 'free'){
        el.style.display = 'none';
        el.textContent = 'PREMIUM';
        return;
      }
      el.style.display = '';
      const label = (p === 'premiumplus') ? 'PREMIUM+' : p.toUpperCase();
      el.textContent = label;
    }catch(e){}
  }

  function setLocalPlan(plan, until){
    __myPlan = normPlan(plan);
    __myPlanUntil = +until || 0;
    __planLoaded = true;
    try{ window.__MK_PLAN__ = __myPlan; }catch(e){}
    try{ window.__MK_PLAN_UNTIL__ = __myPlanUntil; }catch(e){}
    try{
      if(window.MK && window.MK.state){
        window.MK.state.plan = __myPlan;
        window.MK.state.planUntil = __myPlanUntil;
      }
    }catch(e){}
    updatePlanBadge();
  }

  async function fetchMyPlanOnce(){
    const u = auth?.currentUser;
    if(!u){ setLocalPlan('free', 0); return {plan:'free', until:0}; }
    try{
      const snap = await db.ref('usersPublic/'+u.uid).get();
      const v = snap.val() || {};
      const plan = v.plan || 'free';
      const until = v.planUntil || v.premiumUntil || 0;
      setLocalPlan(plan, until);
      return { plan: __myPlan, until: __myPlanUntil };
    }catch(e){
      console.warn('[premium-limits] plan fetch failed', e);
      return { plan: effectivePlan(__myPlan, __myPlanUntil), until: __myPlanUntil };
    }
  }

  async function resetDay(){
    const u = auth?.currentUser;
    if(!u) return null;
    const dk = dayKey();
    try{
      const metaRef = db.ref('users/'+u.uid+'/limitsMeta');
      const snap = await metaRef.get();
      const cur = snap.val() || {};
      if(cur.dayKey !== dk){
        await metaRef.update({ dayKey: dk, lastReset: Date.now() });
      }
    }catch(e){}
    return dk;
  }

  async function checkLimit(action){
    const u = auth?.currentUser;
    if(!u) return { ok:false, msg:'Přihlaste se' };
    action = String(action||'').trim().toLowerCase();
    if(!action) return { ok:true, plan: effectivePlan(__myPlan, __myPlanUntil), limit: 1e12, count:0, remaining: 1e12 };

    // Ensure we have fresh plan at least once per session.
    if(!__planLoaded){ await fetchMyPlanOnce(); }
    const planEff = effectivePlan(__myPlan, __myPlanUntil);
    const limit = getLimitFor(planEff, action);
    if(limit >= 1e11) return { ok:true, plan: planEff, limit, count:0, remaining: 1e12 };

    const dk = await resetDay();
    if(!dk) return { ok:true, plan: planEff, limit, count:0, remaining: limit };
    const ref = db.ref('users/'+u.uid+'/limits/'+dk+'/'+action);
    const snap = await ref.get();
    const count = (typeof snap.val()==='number') ? snap.val() : (+snap.val()||0);
    const remaining = Math.max(0, limit - count);
    if(count >= limit){
      return { ok:false, plan: planEff, limit, count, remaining:0, msg:`Limit: ${action} (${limit}/den)` };
    }
    return { ok:true, plan: planEff, limit, count, remaining };
  }

  async function incLimit(action, delta=1){
    const u = auth?.currentUser;
    if(!u) return false;
    action = String(action||'').trim().toLowerCase();
    if(!action) return false;
    const dk = await resetDay();
    if(!dk) return false;

    const ref = db.ref('users/'+u.uid+'/limits/'+dk+'/'+action);
    try{
      await ref.transaction((cur)=>{
        const n = (typeof cur==='number') ? cur : (+cur||0);
        return n + (+(delta||1));
      });
      return true;
    }catch(e){
      console.warn('[premium-limits] incLimit failed', e);
      return false;
    }
  }

  function getMyPlanState(){
    return {
      plan: effectivePlan(__myPlan, __myPlanUntil),
      rawPlan: normPlan(__myPlan),
      until: __myPlanUntil,
      active: effectivePlan(__myPlan, __myPlanUntil) !== 'free'
    };
  }

  // Lightweight live watcher (started/stopped by auth-state)
  function watchMyPlan(uid){
    // Unified registry (global)
    try{ window.MK?.subs?.off('global', 'myPlan'); }catch(e){}
    try{ if(__planRef && __planCb) __planRef.off('value', __planCb); }catch(e){}
    __planRef = null;
    __planCb = null;

    if(!uid){
      setLocalPlan('free', 0);
      return;
    }

    __planRef = db.ref('usersPublic/'+uid);
    __planCb = (snap)=>{
      const v = snap.val() || {};
      const plan = v.plan || 'free';
      const until = v.planUntil || v.premiumUntil || 0;
      setLocalPlan(plan, until);
    };
    __planRef.on('value', __planCb);

    // Register unified global off
    try{
      window.MK?.subs?.set('global', 'myPlan', ()=>{ try{ if(__planRef && __planCb) __planRef.off('value', __planCb); }catch(e){} __planRef=null; __planCb=null; });
    }catch(e){}
  }

  // Expose limits for UI tables (read-only)
  try{ window.__PLAN_LIMITS__ = PLAN_LIMITS; }catch(e){}
  window.getPlanLimitsConfig = function(){
    try{ return JSON.parse(JSON.stringify(PLAN_LIMITS)); }catch(e){ return PLAN_LIMITS; }
  };

  // Export
  window.checkLimit = checkLimit;
  window.incLimit = incLimit;
  window.resetDay = resetDay;
  window.getMyPlanState = getMyPlanState;
  window.watchMyPlan = watchMyPlan;
  window.fetchMyPlanOnce = fetchMyPlanOnce;
})();
