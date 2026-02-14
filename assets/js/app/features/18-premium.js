// === Premium / Privilegia (VIP / Premium) ===
// Goal: decouple purchases from DM-bot. MVP flow:
// 1) user picks plan -> creates payments/requests/{uid}/{requestId}
// 2) QR is shown immediately in the same modal
// 3) user uploads screenshot -> stored in Firebase Storage + url written into the request
// 4) admin grants planUntil and updates request status

(function(){
  const db = firebase.database();
  const auth = firebase.auth();
  let storage = null;
  try{ storage = firebase.storage(); }catch(e){ storage = null; }

  const PLAN_META = {
    vip: { title:'VIP', price: 300, period:'30 dní', code:'vip' },
    premium: { title:'Premium', price: 150, period:'30 dní', code:'premium' },
    premiumPlus: { title:'Premium+', price: 200, period:'30 dní', code:'premiumPlus' }
  };

  const STATE = {
    plan: null,
    requestId: null,
    requestStatus: null,
    proofUrl: null,
    busy: false,
    bound: false,
    lastLoadedUid: null
  };

  function $(id){ return document.getElementById(id); }

  function normalizePlan(p){
    const s = String(p||'').trim().toLowerCase();
    if(s==='premium+'||s==='premiumplus'||s==='premium_plus') return 'premiumPlus';
    if(s==='vip') return 'vip';
    if(s==='premium') return 'premium';
    return '';
  }

  function planLabel(plan){
    const meta = PLAN_META[plan] || null;
    if(meta) return `${meta.title} · ${meta.price} Kč · ${meta.period}`;
    return plan;
  }

  async function loadSettingsText(){
    try{
      const snap = await db.ref('settings/premium').get();
      const v = snap.val()||{};
      const t = (v && v.text) ? String(v.text) : '';
      const el = $('premiumInstructions');
      if(el){
        if(t.trim()) el.textContent = t;
        else el.textContent = 'Nahraj screenshot / potvrzení. Pak odešli žádost.';
      }
    }catch(e){
      const el = $('premiumInstructions');
      if(el) el.textContent = 'Nahraj screenshot / potvrzení. Pak odešli žádost.';
    }
  }


  function ensureCompareBox(){
    const plansBox = $('premiumPlans');
    if(!plansBox) return null;
    let box = $('premiumCompare');
    if(!box){
      box = document.createElement('div');
      box.id = 'premiumCompare';
      box.className = 'card';
      box.style.padding = '10px 12px';
      box.style.margin = '8px 0';
      // Insert above plan buttons
      plansBox.parentNode && plansBox.parentNode.insertBefore(box, plansBox);
    }
    return box;
  }

  function renderCompareTable(){
    const box = ensureCompareBox();
    if(!box) return;

    const cfg = (typeof window.getPlanLimitsConfig === 'function')
      ? window.getPlanLimitsConfig()
      : (window.__PLAN_LIMITS__ || {});

    const plans = [
      { key:'free', label:'Free' },
      { key:'premium', label:'Premium' },
      { key:'premiumPlus', label:'Premium+' },
      { key:'vip', label:'VIP' }
    ];

    function lim(planKey, k){
      const v = cfg && cfg[planKey] && cfg[planKey][k] && cfg[planKey][k].day;
      return (typeof v === 'number') ? String(v) : '—';
    }

    const badge = {
      free: '—',
      premium: 'PREMIUM',
      premiumPlus: 'PREMIUM+',
      vip: 'VIP'
    };

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '13px';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.textContent = 'Srovnání';
    th0.style.textAlign = 'left';
    th0.style.padding = '8px 6px';
    trh.appendChild(th0);
    for(const p of plans){
      const th = document.createElement('th');
      th.textContent = p.label;
      th.style.textAlign = 'center';
      th.style.padding = '8px 6px';
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const rows = [
      { name:'DM / den', key:'dm', fn:(pk)=>lim(pk,'dm') },
      { name:'Přátelé / den', key:'friends', fn:(pk)=>lim(pk,'friends') },
      { name:'Badge', key:'badge', fn:(pk)=>badge[pk] || '—' }
    ];

    for(const row of rows){
      const tr = document.createElement('tr');
      const td0 = document.createElement('td');
      td0.textContent = row.name;
      td0.style.padding = '8px 6px';
      td0.style.borderTop = '1px solid rgba(255,255,255,0.08)';
      tr.appendChild(td0);

      for(const p of plans){
        const td = document.createElement('td');
        td.textContent = row.fn(p.key);
        td.style.textAlign = 'center';
        td.style.padding = '8px 6px';
        td.style.borderTop = '1px solid rgba(255,255,255,0.08)';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    box.innerHTML = '';
    box.appendChild(table);

    const note = document.createElement('div');
    note.className = 'muted';
    note.style.fontSize = '12px';
    note.style.marginTop = '8px';
    note.textContent = 'Limity jsou brané z premium-limits (musí sedět s pravidly).';
    box.appendChild(note);
  }

  async function loadQr(){
    const img = $('premiumQrImg');
    if(!img) return;
    try{
      const dataUrl = await (window.getPremiumQrImg ? window.getPremiumQrImg() : null);
      if(typeof dataUrl === 'string' && dataUrl.startsWith('data:image')){
        img.src = dataUrl;
        return;
      }
    }catch(e){}
    // fallback
    try{ img.src = 'assets/img/csob-qr.png'; }catch(e){}
  }

  function setStatusLine(text){
    const el = $('premiumStatusLine');
    if(el) el.textContent = String(text||'');
  }

  function setProofHint(text){
    const el = $('premiumProofHint');
    if(el) el.textContent = String(text||'');
  }

  function renderPlanInfo(plan){
    const el = $('premiumPlanInfo');
    if(!el) return;
    const p = normalizePlan(plan);
    if(!p){
      el.textContent = 'Vyber plán výše.';
      return;
    }
    const meta = PLAN_META[p] || {};
    el.textContent = `${meta.title||p} · ${meta.price||''} Kč · ${meta.period||''}`;
  }

  function setPlanSelected(plan){
    STATE.plan = normalizePlan(plan);
    // visual selected state
    try{
      document.querySelectorAll('#premiumPlanButtons [data-plan]').forEach(btn=>{
        const bp = normalizePlan(btn.getAttribute('data-plan'));
        btn.classList.toggle('active', bp && bp===STATE.plan);
      });
    }catch(e){}
    renderPlanInfo(STATE.plan);
  }

  async function findExistingPendingRequest(uid, plan){
    try{
      const snap = await db.ref('payments/requests/'+uid).orderByChild('ts').limitToLast(30).get();
      const v = snap.val()||{};
      const now = Date.now();
      let best = null;
      for(const [rid, r] of Object.entries(v)){
        if(!r) continue;
        const p = normalizePlan(r.plan);
        const st = String(r.status||'');
        const ts = Number(r.ts||0);
        if(p !== plan) continue;
        if(!['pending_proof','pending'].includes(st)) continue;
        if(!ts || (now - ts) > 24*60*60*1000) continue; // reuse only fresh drafts
        if(!best || ts > best.ts) best = { id: rid, ...r };
      }
      return best;
    }catch(e){
      return null;
    }
  }

  async function ensureRequestForSelectedPlan(){
    const u = auth.currentUser;
    if(!u){
      try{ openModalAuth && openModalAuth('login'); }catch(e){}
      return null;
    }
    const plan = normalizePlan(STATE.plan);
    if(!plan){
      toast('Vyber plán');
      return null;
    }

    if(STATE.requestId && STATE.lastLoadedUid===u.uid){
      return { id: STATE.requestId };
    }

    // Dedup: reuse an existing pending request for the same plan (last 24h)
    const existing = await findExistingPendingRequest(u.uid, plan);
    if(existing && existing.id){
      STATE.requestId = existing.id;
      STATE.requestStatus = existing.status || 'pending';
      STATE.proofUrl = existing.proofUrl || existing.proof || null;
      STATE.lastLoadedUid = u.uid;
      return existing;
    }

    // Create a new request right away (as requested)
    const meta = PLAN_META[plan] || {};
    const payload = {
      uid: u.uid,
      plan,
      price: Number(meta.price||0),
      period: String(meta.period||''),
      ts: Date.now(),
      status: 'pending_proof'
    };
    try{
      // Create requestId once and write BOTH:
      //   - payments/requests/{uid}/{requestId} (user truth)
      //   - payments/requestsIndex/{requestId} (admin convenience index)
      const ref = db.ref('payments/requests/'+u.uid).push();
      const requestId = ref.key;
      const updates = {};
      updates['payments/requests/'+u.uid+'/'+requestId] = payload;
      updates['payments/requestsIndex/'+requestId] = payload;
      await db.ref().update(updates);

      STATE.requestId = requestId;
      STATE.requestStatus = 'pending_proof';
      STATE.proofUrl = null;
      STATE.lastLoadedUid = u.uid;
      return { id: requestId, ...payload };
    }catch(e){
      console.warn('create payment request failed', e?.code||e);
      toast('Nelze vytvořit žádost');
      playSound && playSound('err');
      return null;
    }
  }

  async function uploadProof(file){
    const u = auth.currentUser;
    if(!u){ try{ openModalAuth && openModalAuth('login'); }catch(e){}; return null; }
    if(!storage){ toast('Storage není k dispozici'); return null; }
    const plan = normalizePlan(STATE.plan);
    if(!plan){ toast('Vyber plán'); return null; }

    // Ensure request exists
    const req = await ensureRequestForSelectedPlan();
    if(!req || !req.id) return null;
    const requestId = req.id;

    const ext = (file && file.name && file.name.includes('.')) ? file.name.split('.').pop().slice(0,6) : 'jpg';
    const safeExt = String(ext||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path = `uploads/${u.uid}/payments/${requestId}/proof_${Date.now()}.${safeExt||'jpg'}`;

    try{
      setProofHint('Nahrávám…');
      const ref = storage.ref().child(path);
      const snap = await ref.put(file, { contentType: file.type||'image/jpeg' });
      const url = await snap.ref.getDownloadURL();

      // Mark request as pending (ready for admin review)
      const nowTs = Date.now();

      // Update request + admin index WITHOUT overwriting the whole object
      // (required fields like uid/plan/ts must stay intact)
      const upds = {};
      const base = 'payments/requests/'+u.uid+'/'+requestId;
      upds[base+'/proofUrl'] = url;
      upds[base+'/proofPath'] = path;
      upds[base+'/proofTs'] = nowTs;
      upds[base+'/status'] = 'pending';

      const ibase = 'payments/requestsIndex/'+requestId;
      upds[ibase+'/uid'] = u.uid;
      upds[ibase+'/plan'] = plan;
      upds[ibase+'/proofUrl'] = url;
      upds[ibase+'/proofPath'] = path;
      upds[ibase+'/proofTs'] = nowTs;
      upds[ibase+'/status'] = 'pending';

      await db.ref().update(upds);

      STATE.proofUrl = url;
      STATE.requestStatus = 'pending';
      setProofHint('Screenshot nahrán ✔');
      const btn = $('premiumSubmit');
      if(btn) btn.disabled = false;
      try{ playSound && playSound('ok'); }catch(e){}
      return url;
    }catch(e){
      console.warn('proof upload failed', e?.code||e);
      setProofHint('Chyba uploadu');
      toast('Upload se nepovedl');
      try{ playSound && playSound('err'); }catch(_){}
      return null;
    }
  }

  async function submitRequest(){
    const u = auth.currentUser;
    if(!u){ try{ openModalAuth && openModalAuth('login'); }catch(e){}; return; }
    const plan = normalizePlan(STATE.plan);
    if(!plan){ toast('Vyber plán'); return; }
    const req = await ensureRequestForSelectedPlan();
    if(!req || !req.id){ return; }
    const requestId = req.id;

    try{
      const snap = await db.ref('payments/requests/'+u.uid+'/'+requestId).get();
      const r = snap.val()||{};
      const st = String(r.status||'');
      const proof = r.proofUrl || r.proof || '';
      if(st==='pending_proof' || !proof){
        toast('Nejdřív nahraj screenshot');
        try{ playSound && playSound('err'); }catch(_){}
        return;
      }

      // Stamp submittedAt (optional)
      const submittedAt = Date.now();
      const upds = {};
      const base = 'payments/requests/'+u.uid+'/'+requestId;
      upds[base+'/submittedAt'] = submittedAt;
      upds[base+'/plan'] = plan;

      // Index keeps same request id, so admin sees updated state
      const ibase = 'payments/requestsIndex/'+requestId;
      upds[ibase+'/submittedAt'] = submittedAt;
      upds[ibase+'/plan'] = plan;
      upds[ibase+'/status'] = 'pending';

      await db.ref().update(upds);

      toast('Žádost odeslána ✔');
      try{ playSound && playSound('ok'); }catch(e){}
      // Close and reset UI state (no "stuck" modal)
      try{ closeModal && closeModal('modalPremium'); }catch(e){}
      STATE.requestId = null;
      STATE.requestStatus = null;
      STATE.proofUrl = null;
      setStatusLine('');
      setProofHint('');
      const file = $('premiumProofFile');
      if(file) file.value = '';
      const btn = $('premiumSubmit');
      if(btn) btn.disabled = true;
      await loadMyRequests(true);
    }catch(e){
      console.warn('submit request failed', e?.code||e);
      toast('Chyba');
      try{ playSound && playSound('err'); }catch(_){}
    }
  }

  function renderRequestsList(uid, items){
    const box = $('premiumMyRequests');
    if(!box) return;
    box.innerHTML = '';

    const arr = Array.isArray(items) ? items : [];
    if(arr.length===0){
      const e = document.createElement('div');
      e.className = 'muted';
      e.style.padding = '10px 12px';
      e.textContent = 'Zatím žádné žádosti.';
      box.appendChild(e);
      return;
    }

    for(const it of arr){
      const r = it.r || {};
      const row = document.createElement('div');
      row.className = 'msg';

      const plan = normalizePlan(r.plan);
      const status = String(r.status||'');
      const ts = Number(r.ts||0);
      const proof = r.proofUrl || '';

      const top = document.createElement('div');
      top.style.display = 'flex';
      top.style.justifyContent = 'space-between';
      top.style.gap = '12px';

      const left = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = planLabel(plan);
      const sub = document.createElement('div');
      sub.className = 'muted';
      sub.style.fontSize = '12px';
      sub.textContent = ts ? new Date(ts).toLocaleString() : '';
      // If granted, show planUntil (if present)
      const until = Number(r.planUntil||0);
      if(status==='granted' && until){
        const untilEl = document.createElement('div');
        untilEl.className = 'muted';
        untilEl.style.fontSize = '12px';
        untilEl.textContent = 'Aktivní do: ' + new Date(until).toLocaleDateString();
        left.appendChild(untilEl);
      }
      // If rejected, show reason
      const reason = (r && r.reason) ? String(r.reason) : '';
      if(status==='rejected' && reason){
        const reasonEl = document.createElement('div');
        reasonEl.className = 'muted';
        reasonEl.style.fontSize = '12px';
        reasonEl.textContent = 'Důvod: ' + reason;
        left.appendChild(reasonEl);
      }
      left.appendChild(b);
      left.appendChild(sub);

      const right = document.createElement('div');
      right.style.textAlign = 'right';
      const st = document.createElement('div');
      st.className = 'pill';
      // Human-friendly status
      let statusLabel = status || '—';
      if(status==='pending_proof') statusLabel = 'čeká na screenshot';
      else if(status==='pending') statusLabel = 'čeká na schválení';
      else if(status==='granted') statusLabel = 'aktivní';
      else if(status==='rejected') statusLabel = 'zamítnuto';
      st.textContent = statusLabel;
      right.appendChild(st);

      top.appendChild(left);
      top.appendChild(right);
      row.appendChild(top);

      if(proof){
        const a = document.createElement('a');
        a.href = proof;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'muted';
        a.style.display = 'inline-block';
        a.style.marginTop = '8px';
        a.textContent = '📎 Screenshot (otevřít)';
        row.appendChild(a);
      }else if(status==='pending_proof'){
        const hint = document.createElement('div');
        hint.className = 'muted';
        hint.style.marginTop = '8px';
        hint.textContent = 'Chybí screenshot.';
        row.appendChild(hint);
      }

      box.appendChild(row);
    }
  }

  async function loadMyRequests(force){
    const u = auth.currentUser;
    if(!u){
      renderRequestsList('', []);
      return;
    }
    // Avoid spamming reads if modal opened repeatedly very fast
    if(!force && STATE.__reqLoadTs && (Date.now() - STATE.__reqLoadTs) < 900) return;
    STATE.__reqLoadTs = Date.now();

    try{
      const snap = await db.ref('payments/requests/'+u.uid).orderByChild('ts').limitToLast(10).get();
      const v = snap.val()||{};
      const arr = Object.entries(v).map(([id,r])=>({id, r})).sort((a,b)=> (Number(b.r.ts||0) - Number(a.r.ts||0)));
      renderRequestsList(u.uid, arr);
    }catch(e){
      console.warn('loadMyRequests failed', e?.code||e);
      renderRequestsList(u.uid, []);
    }
  }

  function bindUIOnce(){
    if(STATE.bound) return;
    STATE.bound = true;

    // Plan buttons
    try{
      document.querySelectorAll('#premiumPlanButtons [data-plan]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          if(STATE.busy) return;
          const plan = btn.getAttribute('data-plan');
          setPlanSelected(plan);
          setProofHint('');
          setStatusLine('Vytvářím žádost…');
          const submit = $('premiumSubmit');
          if(submit) submit.disabled = true;
          const req = await ensureRequestForSelectedPlan();
          if(req && req.id){
            setStatusLine(`Žádost vytvořena: ${req.id}`);
            // UX: after choosing a plan, bring the user to QR + proof area (mobile-friendly).
            try{ $('premiumQrImg')?.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){}
            // If proof already exists, allow submit
            const snap = await db.ref('payments/requests/'+auth.currentUser.uid+'/'+req.id).get();
            const r = snap.val()||{};
            const hasProof = !!(r.proofUrl || r.proof);
            if(submit) submit.disabled = !hasProof;
          }else{
            setStatusLine('');
          }
        });
      });
    }catch(e){}

    // Upload proof
    $('premiumProofFile')?.addEventListener('change', async (e)=>{
      const f = e.target && e.target.files && e.target.files[0];
      if(!f) return;
      await uploadProof(f);
      try{ await loadMyRequests(true); }catch(_e){}
    });

    // Submit
    $('premiumSubmit')?.addEventListener('click', submitRequest);
  }

  async function openPremiumModal(){
    const u = auth.currentUser;
    if(!u){
      try{ openModalAuth && openModalAuth('login'); }catch(e){}
      return;
    }
    bindUIOnce();
    try{ renderCompareTable(); }catch(e){}
    try{ openModal && openModal('modalPremium'); }catch(e){}
    setStatusLine('');
    setProofHint('');
    renderPlanInfo(STATE.plan);
    await Promise.all([
      loadQr(),
      loadSettingsText(),
      loadMyRequests(true)
    ]);
  }

  // Public API
  window.openPremiumModal = openPremiumModal;

  // Backward compatibility: old code calls openPremiumBot()
  try{ window.openPremiumBot = openPremiumModal; }catch(e){}

  // Ensure modal is reset on close (prevents "stuck" state after navigation)
  try{
    const el = $('modalPremium');
    if(el && !el.__mkBoundCloseReset){
      el.__mkBoundCloseReset = true;
      const reset = ()=>{
        // do not drop plan selection, but drop transient state
        STATE.requestId = null;
        STATE.requestStatus = null;
        STATE.proofUrl = null;
        setStatusLine('');
        setProofHint('');
        try{ const f = $('premiumProofFile'); if(f) f.value = ''; }catch(e){}
        try{ const btn = $('premiumSubmit'); if(btn) btn.disabled = true; }catch(e){}
      };
      // Reset when closing via backdrop
      el.addEventListener('click', (ev)=>{ if(ev.target===el) reset(); });
      // Reset when closed programmatically (best effort: observe hidden attribute)
      const mo = new MutationObserver(()=>{ if(el.hidden) reset(); });
      mo.observe(el, { attributes:true, attributeFilter:['hidden'] });
    }
  }catch(e){}
})();
