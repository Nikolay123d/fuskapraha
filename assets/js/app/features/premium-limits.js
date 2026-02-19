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
  // Central plan quotas (single source of truth).
  // IMPORTANT: We limit DM *initiations* (dm_init), not every DM message.
  // Some legacy code may still call the old action name "dm" — we map it to dm_init.
  const PLAN_LIMITS = {
    // Daily counters (stored under users/{uid}/limits/{YYYY-MM-DD}/{action})
    // NOTE: these are *fallback-only* values. The real source of truth is Cloud Functions.
    // Keep in sync with firebase/functions/index.js (PLAN_LIMITS).
    free:        { friend: 10,  dm_init: 10,  autopost_posts: 0 },
    premium:     { friend: 30,  dm_init: 100, autopost_posts: 15 },
    premiumplus: { friend: 60,  dm_init: 300, autopost_posts: 30 },
    vip:         { friend: 9999, dm_init: 9999, autopost_posts: 9999 },

    // Bots are internal/system (effectively unlimited)
    bot:         { friend: 1e12, dm_init: 1e12, autopost_posts: 1e12 }
  };

  // Feature config per plan (not a daily counter)
  // NOTE: keep this as a single source of truth for feature gating across UI/modules.
  const PLAN_FEATURES = {
    free:        { autopost: { slots: 0,  minIntervalMin: 120, photos: false }, vacancyNotifyFriends: false },
    premium:     { autopost: { slots: 1,  minIntervalMin: 60,  photos: true  }, vacancyNotifyFriends: false },
    premiumplus: { autopost: { slots: 3,  minIntervalMin: 30,  photos: true  }, vacancyNotifyFriends: false },
    // VIP-only: employer vacancy broadcast to job-seeker friends (shown via bell feed derived from vacanciesIndex)
    vip:         { autopost: { slots: 10, minIntervalMin: 15,  photos: true  }, vacancyNotifyFriends: true },
    bot:         { autopost: { slots: 999, minIntervalMin: 1,  photos: true  }, vacancyNotifyFriends: true }
  };

  const ACTION_ALIAS = {
    // legacy
    dm: 'dm_init',
    'dm-init': 'dm_init',
    // canonical
    dm_init: 'dm_init',
    friend: 'friend',
    autopost_posts: 'autopost_posts'
  };

  function normAction(action){
    const a = String(action||'').trim().toLowerCase();
    return ACTION_ALIAS[a] || a;
  }

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
    const a = normAction(action);
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
    try{ document.dispatchEvent(new Event('mk:plan-changed')); }catch(e){}
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

  // Daily reset is based purely on the dayKey path.
  // We intentionally do NOT write any "limitsMeta" in DB,
  // so a malicious client cannot brick themselves by setting a far-future dayKey.
  // The only persistent truth is: users/{uid}/limits/{YYYY-MM-DD}/{action}.
  async function resetDay(){
    const u = auth?.currentUser;
    if(!u) return null;
    return dayKey();
  }

  async function checkLimit(action){
    const u = auth?.currentUser;
    if(!u) return { ok:false, msg:'Přihlaste se' };
    action = normAction(action);
    if(!action) return { ok:true, plan: effectivePlan(__myPlan, __myPlanUntil), limit: 1e12, count:0, remaining: 1e12 };

    // Server-first (бетон): all critical counters are owned by Cloud Functions.
    // The client reads the result and should NOT write to /users/{uid}/limits directly.
    try{
      if(typeof window.callFn === 'function'){
        const r = await window.callFn('consumeLimit', { action, amount: 0, dryRun: true });
        if(r && typeof r === 'object'){
          const limit = Number(r.limit);
          const used = Number(r.used);
          const remaining = Number(r.remaining);
          const ok = (r.ok === true);
          const plan = r.plan || effectivePlan(__myPlan, __myPlanUntil);

          if(ok === false){
            const label = (action==='dm_init') ? 'DM (zahájit)' : (action==='friend' ? 'Přátelé' : (action==='autopost_posts' ? 'Autopost' : action));
            return { ok:false, plan, limit, count: used||0, remaining: Math.max(0, remaining||0), msg:`Limit: ${label} (${Number.isFinite(limit)?limit:'—'}/den)` };
          }
          return { ok:true, plan, limit, count: used||0, remaining: Math.max(0, remaining||0) };
        }
      }
    }catch(e){
      // fall back to offline client-only calculation
      console.warn('[premium-limits] consumeLimit(dryRun) failed; falling back to client rules', e);
    }

    // Offline fallback (no Functions): read local counters and compare to fallback PLAN_LIMITS.
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
      const label = (action==='dm_init') ? 'DM (zahájit)' : (action==='friend' ? 'Přátelé' : (action==='autopost_posts' ? 'Autopost' : action));
      return { ok:false, plan: planEff, limit, count, remaining:0, msg:`Limit: ${label} (${limit}/den)` };
    }
    return { ok:true, plan: planEff, limit, count, remaining };
  }

  async function incLimit(action, delta=1){
    const u = auth?.currentUser;
    if(!u) return false;
    action = normAction(action);
    if(!action) return false;
    // Safety: delta must be positive integer
    try{
      delta = Number(delta);
      if(!Number.isFinite(delta) || delta <= 0) delta = 1;
      delta = Math.floor(delta);
      if(delta <= 0) delta = 1;
    }catch(e){ delta = 1; }
    // Server-first (бетон): increment happens inside Cloud Functions.
    try{
      if(typeof window.callFn === 'function'){
        const r = await window.callFn('consumeLimit', { action, amount: delta, dryRun: false });
        return !!(r && r.ok === true);
      }
    }catch(e){
      console.warn('[premium-limits] consumeLimit failed; falling back to local tx (may be blocked by rules)', e);
    }

    // Offline fallback (may be blocked by strict rules; keep as last resort)
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
      console.warn('[premium-limits] incLimit fallback failed', e);
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
  }

  // Export
  window.checkLimit = checkLimit;
  window.incLimit = incLimit;
  window.resetDay = resetDay;
  window.getMyPlanState = getMyPlanState;
  window.watchMyPlan = watchMyPlan;
  window.fetchMyPlanOnce = fetchMyPlanOnce;

  // Feature config (non-counter)
  window.getPlanFeatures = function(plan){
    const p = normPlan(plan);
    return PLAN_FEATURES[p] || PLAN_FEATURES.free;
  };
  window.getMyPlanFeatures = function(){
    try{ return window.getPlanFeatures(getMyPlanState().plan); }catch(e){ return PLAN_FEATURES.free; }
  };
})();
