// === Limits (plans + per-day counters) ===
// Plans: free / premium / premiumplus / vip
// Counters stored in: users/{uid}/counters/{dayKey}/{action}

(function(){
  'use strict';

  // Flag for legacy modules (Stage5) to disable their plan watcher.
  window.MK_LIMITS_MODERN = true;

  const LIMITS = {
    free:       { dm: 5,   friend: 30,  chat: 200,  rent: 10 },
    premium:    { dm: 30,  friend: 100, chat: 500,  rent: 30 },
    premiumplus:{ dm: 100, friend: 200, chat: 1000, rent: 60 },
    vip:        { dm: 1e9, friend: 1e9, chat: 1e9, rent: 1e9 }
  };

  // Plan cache (kept live by watchMyPlan)
  window.__MK_PLAN_CACHE = window.__MK_PLAN_CACHE || { plan:'free', planUntil:0 };

  function _normPlan(p){
    p = String(p||'').trim().toLowerCase();
    if(p==='premium+' || p==='premiumplus+') p='premiumplus';
    if(p==='plus') p='premiumplus';
    if(!p) p='free';
    if(!LIMITS[p]) p='free';
    return p;
  }

  function getEffectivePlan(){
    const c = window.__MK_PLAN_CACHE || {plan:'free', planUntil:0};
    const plan = _normPlan(c.plan);
    const until = Number(c.planUntil||0);
    // Legacy: planUntil=0 means "no expiry" for non-free plans.
    if(plan !== 'free' && until > 0 && Date.now() > until) return 'free';
    return plan;
  }

  function getLimit(action){
    const a = String(action||'').trim().toLowerCase();
    const plan = getEffectivePlan();
    const lim = (LIMITS[plan] && LIMITS[plan][a]);
    return Number(lim||0);
  }

  function dayKeyLocal(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  // --- Plan watcher (global) ---
  let _planRef = null;
  let _planCb = null;

  function watchMyPlan(uid){
    try{ if(_planRef && _planCb) _planRef.off('value', _planCb); }catch(e){}
    _planRef = null;
    _planCb = null;
    window.__MK_PLAN_CACHE = { plan:'free', planUntil:0 };

    // UI clear
    try{ const b = document.getElementById('myPlan'); if(b){ b.style.display='none'; b.textContent=''; } }catch(e){}

    if(!uid) return;

    const ref = db.ref('usersPublic/'+uid);
    const cb = (snap)=>{
      const v = snap.val() || {};
      const plan = _normPlan(v.plan || 'free');
      const until = Number(v.planUntil||0);
      window.__MK_PLAN_CACHE = { plan, planUntil: until };

      // UI badge
      try{
        const badge = document.getElementById('myPlan');
        if(!badge) return;
        const eff = getEffectivePlan();
        if(eff && eff !== 'free'){
          badge.style.display = 'inline-flex';
          badge.textContent = eff.toUpperCase();
        }else{
          badge.style.display = 'none';
          badge.textContent = '';
        }
      }catch(e){}
    };
    ref.on('value', cb);
    _planRef = ref;
    _planCb = cb;

    try{ if(window.MK && window.MK.subs) window.MK.subs.add(()=>{ try{ ref.off('value', cb); }catch(e){} }, {scope:'global', key:'plan'}); }catch(e){}
  }

  // --- Limits API ---
  async function checkLimit(action){
    const me = auth.currentUser;
    if(!me){
      toast('Přihlaste se');
      try{ openModalAuth('login'); }catch(e){}
      return false;
    }
    if(typeof isAdminUser==='function' && isAdminUser(me)) return true;

    const lim = getLimit(action);
    if(lim >= 1e9) return true;
    if(lim <= 0) return true;

    const day = dayKeyLocal();
    const ref = db.ref(`users/${me.uid}/counters/${day}/${String(action||'').toLowerCase()}`);
    const snap = await ref.get();
    const n = Number(snap.val()||0);
    if(n >= lim){
      toast(`Limit: ${action}/den (${lim})`);
      // Soft upsell
      try{ document.getElementById('fabPremium')?.classList.add('pulse'); setTimeout(()=>{ try{ document.getElementById('fabPremium')?.classList.remove('pulse'); }catch(e){} }, 1200); }catch(e){}
      return false;
    }
    return true;
  }

  async function incLimit(action, delta=1){
    const me = auth.currentUser;
    if(!me) return;
    if(typeof isAdminUser==='function' && isAdminUser(me)) return;
    const lim = getLimit(action);
    if(lim >= 1e9) return;
    const day = dayKeyLocal();
    const ref = db.ref(`users/${me.uid}/counters/${day}/${String(action||'').toLowerCase()}`);
    try{ await ref.transaction(n=> (Number(n||0) + Number(delta||1))); }catch(e){}
  }

  // expose
  window.watchMyPlan = watchMyPlan;
  window.checkLimit = checkLimit;
  window.incLimit = incLimit;

})();
