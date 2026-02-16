// ==== PREMIUM PURCHASE (view-premium) ====
//
// MVP flow:
//  1) User selects a plan
//  2) QR + instructions are shown in UI
//  3) User uploads payment screenshot
//  4) Client uploads proof to Storage and creates a request in RTDB
//
// Data written:
//  payments/requests/{uid}/{requestId}
//  payments/requestsIndex/{requestId}
//
// NOTE:
//  - No DM-bot dependency.
//  - Admin approves by setting users/{uid}/plan, planUntil (already protected by rules).

(function premiumPurchaseModule(){
  const $ = (id)=>document.getElementById(id);

  const PLAN_KEYS = ['premium','premiumPlus','vip'];

  // Default plan UI (can be overridden from settings/premium)
  const DEFAULT_PLANS = {
    premium:     { title:'Premium',     price:'150 Kč', period:'30 dní', desc:'DM zahájit: 30/den · Autopost: 1 kampaň · ≥60 min · 8 postů/den · Práce: bez upozornění přátel' },
    premiumPlus: { title:'Premium+',    price:'200 Kč', period:'30 dní', desc:'DM zahájit: 100/den · Autopost: 3 kampaně · ≥30 min · 24 postů/den · Práce: bez upozornění přátel' },
    // VIP-only feature: vacancy broadcast to friends (job seekers) via bell feed
    vip:         { title:'VIP',         price:'250 Kč', period:'30 dní', desc:'DM zahájit: 300/den · Autopost: 10 kampaní · ≥15 min · 96 postů/den · Práce: upozornění přátelům' }
  };

  let __settings = null;
  let __selectedPlan = null;
  let __proofFile = null;
  let __submitLock = false;

  // Tab-scope subscription
  let __myReqRef = null;
  let __myReqCb = null;

  function _getCitySafe(){
    try{ return (typeof getCity === 'function') ? getCity() : (window.MK?.state?.city || 'praha'); }catch(e){ return 'praha'; }
  }

  function _safeText(v){ return (v==null) ? '' : String(v); }

  function _setText(id, text){
    try{ const el=$(id); if(!el) return; el.textContent = _safeText(text); }catch(e){}
  }

  function _show(el, on){
    try{
      const node = (typeof el === 'string') ? $(el) : el;
      if(!node) return;
      node.style.display = on ? '' : 'none';
    }catch(e){}
  }

  function _enableSubmitUI(){
    const btn = $('premiumSubmit');
    if(!btn) return;
    const me = auth?.currentUser || null;
    const ok = !!(__selectedPlan && __proofFile && me && !__submitLock);
    btn.disabled = !ok;

    // UX hints
    const hint = $('premiumStatusHint');
    if(hint){
      if(__submitLock) hint.textContent = 'Odesílám…';
      else if(!me) hint.textContent = 'Přihlaste se pro odeslání.';
      else if(!__selectedPlan) hint.textContent = 'Vyberte plán.';
      else if(!__proofFile) hint.textContent = 'Nahrajte screenshot platby.';
      else hint.textContent = '';
    }
  }

  async function _loadPremiumSettingsOnce(){
    if(__settings) return __settings;
    try{
      const snap = await db.ref('settings/premium').get();
      __settings = snap.exists() ? (snap.val()||{}) : {};
    }catch(e){
      __settings = {};
    }
    return __settings;
  }

  async function _renderPlanCards(){
    const st = await _loadPremiumSettingsOnce();
    const plans = {...DEFAULT_PLANS, ...(st?.plans||{})};

    for(const k of PLAN_KEYS){
      const p = plans[k] || DEFAULT_PLANS[k];
      _setText('premiumPrice_'+k, p?.price || '');
      _setText('premiumDesc_'+k, p?.desc || DEFAULT_PLANS[k]?.desc || '');

      // Button text = price (mobile-friendly, as requested)
      try{
        const btn = document.querySelector(`button.premiumPick[data-plan="${k}"]`);
        if(btn){
          const title = p?.title || DEFAULT_PLANS[k]?.title || k;
          const price = p?.price || '';
          btn.textContent = price ? `Koupit ${title} · ${price}` : `Vybrat ${title}`;
        }
      }catch(e){}
    }
  }

  function _resetPayStep(){
    __selectedPlan = null;
    __proofFile = null;
    __submitLock = false;

    try{ const inp = $('premiumProof'); if(inp) inp.value = ''; }catch(e){}
    try{ const note = $('premiumNote'); if(note) note.value = ''; }catch(e){}

    _setText('premiumSelectedLabel','');
    _setText('premiumProofName','Screenshot nepřidán');
    _setText('premiumStatusHint','');

    _show('premiumChoose', true);
    _show('premiumPay', false);

    _enableSubmitUI();
  }

  async function _openPayStep(plan){
    __selectedPlan = String(plan||'').trim();
    if(!PLAN_KEYS.includes(__selectedPlan)) __selectedPlan = 'premium';

    // Settings
    const st = await _loadPremiumSettingsOnce();

    // QR + text
    const qr = $('premiumQr');
    if(qr){
      const url = st?.qrUrl || st?.qr || 'assets/img/csob-qr.png';
      try{ qr.src = safeImgSrc(url, 'assets/img/csob-qr.png'); }catch(e){ qr.src = 'assets/img/csob-qr.png'; }
    }
    _setText('premiumPayText', st?.payText || 'Po zaplacení nahraj screenshot a odešli žádost.');
    _setText('premiumPayHint', st?.payHint || '1) Zaplať 2) Udělej screenshot 3) Nahraj níže 4) Odešli');

    // Label
    const titleMap = {
      premium: 'Premium',
      premiumPlus: 'Premium+',
      vip: 'VIP'
    };
    _setText('premiumSelectedLabel', titleMap[__selectedPlan] || __selectedPlan);

    // Show step
    _show('premiumChoose', false);
    _show('premiumPay', true);

    _enableSubmitUI();

    // Try to keep focus near the file input
    try{ setTimeout(()=>{ $('premiumProof')?.focus?.(); }, 120); }catch(e){}
  }

  async function _uploadProof(uid, reqId, file){
    if(!uid || !reqId || !file) throw new Error('missing params');

    // Basic client-side guard (rules also protect)
    const maxBytes = 6 * 1024 * 1024; // 6 MB
    if(file.size && file.size > maxBytes){
      throw new Error('Soubor je příliš velký (max 6MB).');
    }

    const name = String(file.name||'proof').toLowerCase();
    const extRaw = name.includes('.') ? name.split('.').pop() : 'jpg';
    const ext = String(extRaw||'jpg').replace(/[^a-z0-9]/g,'').slice(0,8) || 'jpg';
    const path = `uploads/${uid}/payments/${reqId}.${ext}`;

    const ref = firebase.storage().ref(path);
    await ref.put(file, { contentType: file.type || 'image/jpeg' });
    return await ref.getDownloadURL();
  }

  async function _submitRequest(){
    const me = auth?.currentUser;
    if(!me){
      try{ openModalAuth?.('login'); }catch(e){}
      return;
    }
    if(window.__EMAIL_VERIFY_REQUIRED__){
      toast('Nejdřív potvrďte e-mail.');
      try{ openModalAuth?.('login'); }catch(e){}
      return;
    }

    if(!__selectedPlan){ toast('Vyberte plán'); return; }
    if(!__proofFile){ toast('Nahrajte screenshot'); return; }

    if(__submitLock) return;
    __submitLock = true;
    _enableSubmitUI();

    let id = null;
    try{
      // ---- Anti-duplicates (бетон): allow only ONE pending request per user ----
      // Mobile multi-tap / slow network / accidental double handlers can create several requests.
      // We hard-block if user already has any pending request.
      try{
        const pendSnap = await db.ref('payments/requests/'+me.uid).orderByChild('ts').limitToLast(25).get();
        const pend = pendSnap.val() || {};
        const hasPending = Object.values(pend).some(r => r && r.status === 'pending');
        if(hasPending){
          toast('Už máte čekající žádost. Zkontrolujte „Moje žádosti“.');
          playSound?.('ok');
          return;
        }
      }catch(e){ /* best-effort */ }

      const ts = Date.now();
      const city = _getCitySafe();
      const note = String($('premiumNote')?.value||'').trim();

      // Create request id (shared between index + per-user node)
      id = db.ref('payments/requestsIndex').push().key;

      // 1) Upload proof
      const proofUrl = await _uploadProof(me.uid, id, __proofFile);

      // 2) Write request (single multi-location update)
      const fromNick = (window.__myPublic && window.__myPublic.nick) ? window.__myPublic.nick : null;

      const req = {
        type: 'plan_request',
        plan: __selectedPlan,
        title: __selectedPlan,
        by: me.uid,
        fromUid: me.uid,
        fromNick: fromNick || null,
        city: city || null,
        text: note || null,
        proofUrl: proofUrl || null,
        ts: ts,
        status: 'pending'
      };

      const idx = {
        uid: me.uid,
        by: me.uid,
        ts: ts,
        plan: __selectedPlan,
        status: 'pending',
        city: city || null,
        fromNick: fromNick || null,
        proofUrl: proofUrl || null
      };

      const updates = {};
      updates[`payments/requests/${me.uid}/${id}`] = req;
      updates[`payments/requestsIndex/${id}`] = idx;
      await db.ref().update(updates);

      try{ toast('Žádost odeslána'); }catch(e){}
      try{ playSound?.('ok'); }catch(e){}

      // Reset step but keep the view
      _resetPayStep();
    }catch(err){
      console.warn('premium submit failed', err);
      // Surface the error code/path so you can immediately see if it's rules/permissions.
      const code = String(err?.code || '').trim();
      const msg  = String(err?.message || 'Chyba při odeslání').trim();
      const p1 = id ? `payments/requests/${me?.uid||'uid'}/${id}` : 'payments/requests/{uid}/{id}';
      const p2 = id ? `payments/requestsIndex/${id}` : 'payments/requestsIndex/{id}';

      try{ toast(`Odeslání selhalo (${code||'error'}).`); }catch(e){}
      try{
        const h = $('premiumStatusHint');
        if(h){
          h.textContent = `Chyba: ${code||'error'} — ${msg}. Zápis: ${p1} + ${p2}`;
        }
      }catch(e){}
    }finally{
      __submitLock = false;
      _enableSubmitUI();
    }
  }

  function _renderMyRequests(val){
    const box = $('premiumMyRequests');
    if(!box) return;

    const me = auth?.currentUser;

    if(!me){
      box.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'mini-hint';
      d.textContent = 'Pro zobrazení žádostí se přihlaste.';
      box.appendChild(d);
      return;
    }

    const rows = Object.entries(val||{})
      .map(([id, r])=>({ id, ...(r||{}) }))
      .sort((a,b)=> Number(b.ts||0) - Number(a.ts||0));

    box.innerHTML = '';

    if(!rows.length){
      const d = document.createElement('div');
      d.className = 'mini-hint';
      d.textContent = 'Zatím nemáte žádné žádosti.';
      box.appendChild(d);
      return;
    }

    for(const r of rows.slice(0, 20)){
      const item = document.createElement('div');
      item.className = 'msg';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.style.width = '100%';

      const head = document.createElement('div');
      head.className = 'name';
      const title = document.createElement('b');
      title.textContent = `Žádost: ${String(r.plan||'')}`;
      const st = document.createElement('span');
      st.className = 'muted';
      st.style.marginLeft = '8px';
      const _st = String(r.status||'pending');
      st.textContent = (_st === 'pending') ? 'В обработке' : (_st === 'approved') ? 'Одобрено' : (_st === 'rejected') ? 'Отклонено' : _st;
      head.appendChild(title);
      head.appendChild(st);

      const meta = document.createElement('div');
      meta.className = 'muted';
      meta.style.fontSize = '12px';
      meta.style.marginTop = '4px';
      {
        const created = r.ts ? new Date(Number(r.ts)).toLocaleString() : '';
        const decided = r.decidedAt ? new Date(Number(r.decidedAt)).toLocaleString() : '';
        meta.textContent = created;
        if(decided){
          meta.textContent = `${created} · Решение: ${decided}`;
        }
      }

      bubble.appendChild(head);
      bubble.appendChild(meta);

      if(r.text){
        const t = document.createElement('div');
        t.className = 'text';
        t.style.whiteSpace = 'pre-wrap';
        t.textContent = String(r.text);
        bubble.appendChild(t);
      }

      if(r.proofUrl){
        const a = document.createElement('a');
        a.href = String(r.proofUrl);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Otevřít screenshot';
        a.className = 'muted';
        a.style.display = 'inline-block';
        a.style.marginTop = '6px';
        bubble.appendChild(a);
      }

      item.appendChild(bubble);
      box.appendChild(item);
    }
  }

  function _stopMyRequestsWatch(){
    try{ if(__myReqRef && __myReqCb) __myReqRef.off('value', __myReqCb); }catch(e){}
    __myReqRef = null;
    __myReqCb = null;
  }

  function _watchMyRequests(uid){
    _stopMyRequestsWatch();

    const box = $('premiumMyRequests');
    if(!box) return;

    if(!uid){
      _renderMyRequests(null);
      return;
    }

    // Lightweight watch while view-premium is open.
    __myReqRef = db.ref('payments/requests/'+uid).orderByChild('ts').limitToLast(20);
    __myReqCb = (snap)=>{ _renderMyRequests(snap.val()||{}); };
    __myReqRef.on('value', __myReqCb);

    // Register as tab-scope sub
    try{ window.MK?.subs?.set && window.MK.subs.set('tab:premium:myRequests', _stopMyRequestsWatch, 'tab'); }catch(e){}
  }

  function _wireUIOnce(){
    const choose = $('premiumChoose');
    if(choose && !choose.dataset.wired){
      choose.dataset.wired = '1';
      choose.addEventListener('click', (e)=>{
        const btn = e.target.closest('button.premiumPick');
        if(!btn) return;
        e.preventDefault();
        const plan = btn.dataset.plan;
        _openPayStep(plan);
      });
    }

    const back = $('premiumBack');
    if(back && !back.dataset.wired){
      back.dataset.wired='1';
      back.addEventListener('click', (e)=>{
        e.preventDefault();
        _resetPayStep();
      });
    }

    const proof = $('premiumProof');
    if(proof && !proof.dataset.wired){
      proof.dataset.wired='1';
      proof.addEventListener('change', (e)=>{
        const f = e.target.files && e.target.files[0];
        __proofFile = f || null;
        _setText('premiumProofName', f ? (f.name || 'screenshot') : 'Screenshot nepřidán');
        _enableSubmitUI();
      });
    }

    const note = $('premiumNote');
    if(note && !note.dataset.wired){
      note.dataset.wired='1';
      note.addEventListener('input', ()=>{ /* noop */ });
    }

    const submit = $('premiumSubmit');
    if(submit && !submit.dataset.wired){
      submit.dataset.wired='1';
      submit.addEventListener('click', async (e)=>{
        e.preventDefault();
        await _submitRequest();
      });
    }
  }

  // Router hook (lazy init)
  async function enterPremiumView(){
    try{ _wireUIOnce(); }catch(e){}
    try{ await _renderPlanCards(); }catch(e){}

    // Always reset pay step on enter to avoid "stuck" composer after F5/navigation.
    // (The user can reselect the plan quickly.)
    _resetPayStep();

    const uid = auth?.currentUser?.uid || null;
    try{ _watchMyRequests(uid); }catch(e){}

    _enableSubmitUI();
  }

  // Router lifecycle (tab scope)
  window.__premiumUnsub = function(){
    try{ _stopMyRequestsWatch(); }catch(e){}
    try{ _resetPayStep(); }catch(e){}
  };

  // Expose router hook
  window.enterPremiumView = enterPremiumView;

  // Convenience: unified entry point (legacy name compatibility)
  window.openPremiumView = function(){
    try{ showView('view-premium', {forceEnter:true}); }catch(e){ try{ showView('view-premium'); }catch(_e){} }
  };

})();
