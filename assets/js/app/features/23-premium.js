// Premium / VIP purchase modal (no DM dependency)
// Flow: select plan -> show QR + instructions -> upload proof -> create payments/requests/{uid}/{id}

(function(){
  const PLANS = [
    { key:'premium',     label:'Premium',     badge:'P' },
    { key:'premiumplus', label:'Premium+',    badge:'P+' },
    { key:'vip',         label:'VIP',         badge:'VIP' },
  ];

  let __plan = null;
  let __proof = null;     // dataURL
  let __sending = false;
  let __lastRequestId = null;

  function $(id){ return document.getElementById(id); }

  function normPlan(p){
    p = (p||'').toString().toLowerCase().trim();
    if(p==='premium+' || p==='premiumplus+' || p==='plus') return 'premiumplus';
    if(p==='vip') return 'vip';
    if(p==='premium') return 'premium';
    return null;
  }

  function setStatus(msg){
    const el = $('premiumRequestStatus');
    if(el) el.textContent = msg || '';
  }

  async function loadPremiumText(){
    try{
      // Prefer payments text, fallback to premium text
      const a = (await db.ref('settings/payments/text').get()).val();
      if(a && String(a).trim()) return String(a);
    }catch(e){}
    try{
      const b = (await db.ref('settings/premium/text').get()).val();
      if(b && String(b).trim()) return String(b);
    }catch(e){}
    return '';
  }

  async function refreshQrAndText(){
    const imgEl = $('premiumQrImg');
    if(imgEl){
      try{ imgEl.src = await getPremiumQrImg(); }catch(e){ imgEl.src = './assets/img/csob-qr.png'; }
    }
    const txtEl = $('premiumInfoText');
    if(txtEl){
      const t = await loadPremiumText();
      txtEl.textContent = t || 'Vyber plán, naskenuj QR a nahraj potvrzení platby.';
    }
  }

  function render(){
    const sec = $('premiumQrSection');
    if(sec) sec.hidden = !__plan;

    // highlight plan buttons
    PLANS.forEach(p=>{
      const b = document.querySelector(`#premiumOverlay [data-premium-plan="${p.key}"]`);
      if(!b) return;
      if(__plan===p.key){
        b.classList.add('primary');
        b.classList.remove('ghost');
      }else{
        b.classList.add('ghost');
        b.classList.remove('primary');
      }
    });

    const sendBtn = $('premiumRequestSend');
    if(sendBtn){
      const can = !!(auth.currentUser && __plan && __proof && !__sending);
      sendBtn.disabled = !can;
      sendBtn.textContent = __sending ? 'Odesílám…' : 'Odeslat žádost';
    }

    const prev = $('premiumProofPreview');
    if(prev){
      if(__proof){
        prev.hidden = false;
        prev.src = __proof;
      }else{
        prev.hidden = true;
        prev.removeAttribute('src');
      }
    }
  }

  function reset(){
    __plan = null;
    __proof = null;
    __sending = false;
    __lastRequestId = null;
    const note = $('premiumRequestNote');
    if(note) note.value = '';
    const file = $('premiumProofFile');
    if(file) file.value = '';
    setStatus('');
    render();
  }

  async function sendRequest(){
    const me = auth.currentUser;
    if(!me) return toast('Přihlaste se');
    if(!__plan) return toast('Vyber plán');
    if(!__proof) return toast('Nahraj potvrzení');
    if(__sending) return;

    if(window.MK && !window.MK.lockTake('premium:send', 2000)) return;
    __sending = true;
    setStatus('');
    render();

    try{
      const id = db.ref('payments/requests/'+me.uid).push().key;
      const ts = Date.now();
      const note = ($('premiumRequestNote')?.value||'').toString().trim();
      const req = {
        uid: me.uid,
        plan: __plan,
        ts,
        status: 'pending',
        proofImg: __proof,
        note: note || null
      };
      await db.ref('payments/requests/'+me.uid+'/'+id).set(req);
      __lastRequestId = id;
      setStatus('Žádost odeslána. Čekejte na schválení (Admin).');
      toast('Žádost odeslána');
    }catch(e){
      console.warn('premium request', e);
      toast('Chyba: nelze odeslat');
      setStatus('Chyba odeslání. Zkuste znovu.');
    }finally{
      __sending = false;
      render();
    }
  }

  async function openPremium(){
    // Always open modal; sending requires auth.
    openModal('premiumOverlay');
    await refreshQrAndText();
    render();
  }

  function init(){
    const overlay = $('premiumOverlay');
    if(!overlay) return;

    // Plan buttons
    overlay.querySelectorAll('[data-premium-plan]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const p = normPlan(btn.dataset.premiumPlan);
        if(!p) return;
        __plan = p;
        setStatus('');
        render();
      });
    });

    $('premiumClose')?.addEventListener('click', ()=>{ reset(); window.closeModal('premiumOverlay'); });
    $('premiumRequestSend')?.addEventListener('click', sendRequest);

    $('premiumProofFile')?.addEventListener('change', async (e)=>{
      const f = e.target?.files?.[0];
      if(!f) return;
      try{
        __proof = await fileToDataURL(f);
      }catch(err){
        console.warn('proof load', err);
        toast('Nelze načíst obrázek');
        __proof = null;
      }
      render();
    });
  }

  // expose
  window.openPremium = openPremium;

  document.addEventListener('DOMContentLoaded', init);
})();
