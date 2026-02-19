/*
  Promo: 50% discount after 25 chat messages
  - Offer is created server-side (Cloud Function) under promoOffers/chat25/{uid}
  - Client watches and shows:
      * banner in Chat
      * banner in Profile
      * banner in Privilegia (Premium)
      * countdown 12h
  - Notifications for 6h/1h before expiry are expected from server (Cloud Function scheduler)

  This module is UI-only and safe to load even if offers do not exist.
*/
(function promoChat25Module(){
  'use strict';

  const OFFER_PATH = (uid)=>`promoOffers/chat25/${uid}`;

  let _uid = null;
  let _ref = null;
  let _off = null;
  let _timer = null;
  let _offer = null;

  // Cache original premium prices so we can restore when promo ends
  const _priceCache = {};

  function $(id){ return document.getElementById(id); }

  function _fmtLeft(ms){
    ms = Math.max(0, +ms||0);
    const s = Math.floor(ms/1000);
    const hh = Math.floor(s/3600);
    const mm = Math.floor((s%3600)/60);
    const ss = s%60;
    if(hh <= 0) return `${mm}m ${String(ss).padStart(2,'0')}s`;
    return `${hh}h ${String(mm).padStart(2,'0')}m`;
  }

  function _isActive(offer){
    if(!offer) return false;
    if(String(offer.status||'') !== 'active') return false;
    const exp = +offer.expiresAt || 0;
    return exp > Date.now();
  }

  function _ensureBanner(id, title){
    let el = $(id);
    if(el) return el;

    el = document.createElement('div');
    el.id = id;
    el.className = 'card';
    el.style.margin = '10px 0';
    el.style.padding = '10px 12px';

    el.innerHTML = `
      <div class="row" style="align-items:center;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <b>${title}</b>
          <div class="muted" id="${id}_text" style="margin-top:4px"></div>
        </div>
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
          <span class="muted" id="${id}_timer"></span>
          <button class="btn primary" id="${id}_go" type="button">Vybrat plán</button>
          <button class="ghost" id="${id}_close" type="button" title="Skrýt">×</button>
        </div>
      </div>
    `;

    return el;
  }

  function _mountBanners(){
    try{
      // Chat
      const chatView = $('view-chat');
      if(chatView && !$('promoChat25Banner_chat')){
        const b = _ensureBanner('promoChat25Banner_chat', '🔥 Speciální sleva −50%');
        chatView.insertBefore(b, chatView.firstChild);
      }

      // Profile
      const prof = $('view-profile');
      if(prof && !$('promoChat25Banner_profile')){
        const b = _ensureBanner('promoChat25Banner_profile', '🔥 Speciální sleva −50%');
        // Insert after the first row header if present
        const first = prof.querySelector('.row') || prof.firstChild;
        prof.insertBefore(b, first.nextSibling);
      }

      // Premium / Privilegia
      const prem = $('view-premium');
      if(prem && !$('promoChat25Banner_premium')){
        const b = _ensureBanner('promoChat25Banner_premium', '🔥 Speciální sleva −50%');
        const first = prem.querySelector('.row') || prem.firstChild;
        prem.insertBefore(b, first.nextSibling);
      }
    }catch(e){}
  }

  function _hideBanner(id, hide){
    const el = $(id);
    if(!el) return;
    el.style.display = hide ? 'none' : '';
  }

  function _restorePremiumPrices(){
    try{
      for(const k of Object.keys(_priceCache)){
        const el = $(k);
        if(el) el.textContent = _priceCache[k];
      }
      // Restore buttons
      document.querySelectorAll('button.premiumPick').forEach(btn=>{
        const key = btn.getAttribute('data-plan');
        const priceEl = $('premiumPrice_'+key);
        const price = priceEl ? priceEl.textContent : '';
        const title = btn.dataset.title || btn.textContent;
        if(price && key){
          // Keep the button text consistent with premium-purchase.js
          btn.textContent = btn.dataset._origText || btn.textContent;
        }
      });
    }catch(e){}
  }

  function _applyPromoToPremiumPrices(discountPct){
    discountPct = +discountPct || 50;
    const mult = Math.max(0, Math.min(1, (100 - discountPct)/100));


    // We can't do numeric reliably for every locale, so we do a safe parse.
    function parsePrice(s){
      s = String(s||'');
      const m = s.replace(/\s+/g,'').match(/(\d{2,6})/);
      return m ? (+m[1]) : null;
    }

    function formatDiscounted(originalText){
      const n = parsePrice(originalText);
      if(!n) return `${originalText}  (−${discountPct}%)`;
      const d = Math.max(0, Math.round(n * mult));
      // Keep currency suffix if present
      const suf = (originalText.match(/(Kč|CZK|€|EUR)/i)||[])[1] || '';
      const cur = suf ? ` ${suf}` : '';
      return `${n}${cur} → ${d}${cur}  (−${discountPct}%)`;
    }

    try{
      const keys = ['premium','premiumPlus','vip'];
      for(const k of keys){
        const id = 'premiumPrice_'+k;
        const el = $(id);
        if(!el) continue;
        if((!_priceCache[id] || !_priceCache[id].trim()) && (el.textContent||'').trim()) _priceCache[id] = el.textContent;
        if(!_priceCache[id] || !_priceCache[id].trim()) continue;
        el.textContent = formatDiscounted(_priceCache[id]);

        // Update pick button label (optional)
        const btn = document.querySelector(`button.premiumPick[data-plan="${k}"]`);
        if(btn){
          if(!btn.dataset._origText) btn.dataset._origText = btn.textContent;
          // keep existing title but append promo
          const t = btn.dataset._origText;
          btn.textContent = t.replace(/\s*\(−\d+%\)$/,'') + ` (−${discountPct}%)`;
        }
      }
    }catch(e){}
  }

  function _wireBanner(id){
    const close = $(id+'_close');
    const go = $(id+'_go');
    if(close){
      close.onclick = ()=>{
        try{ localStorage.setItem('promo_chat25_hide','1'); }catch(e){}
        _hideBanner(id, true);
      };
    }
    if(go){
      go.onclick = ()=>{
        try{ localStorage.setItem('promo_chat25_hide','0'); }catch(e){}
        try{ window.openView && openView('view-premium'); }catch(e){}
        try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(e){}
      };
    }
  }

  function _render(){
    _mountBanners();

    const hide = (()=>{ try{ return localStorage.getItem('promo_chat25_hide')==='1'; }catch(e){ return false; } })();

    const plan = (window.getMyPlanState && getMyPlanState().plan) || (window.__MK_PLAN__||'free');
    const allow = (String(plan||'free').toLowerCase()==='free');

    const active = allow && _isActive(_offer);

    const ids = ['promoChat25Banner_chat','promoChat25Banner_profile','promoChat25Banner_premium'];
    for(const id of ids){
      _hideBanner(id, (!active) || hide);
      _wireBanner(id);
    }

    if(!active){
      _restorePremiumPrices();
      return;
    }

    const left = (+_offer.expiresAt||0) - Date.now();
    const txt = `Sleva <b>${_offer.discountPct||50}%</b> na Premium/VIP. Platí ještě <b>${_fmtLeft(left)}</b>.`;

    for(const id of ids){
      const t = $(id+'_text');
      const tm = $(id+'_timer');
      if(t) t.innerHTML = txt;
      if(tm) tm.textContent = _fmtLeft(left);
    }

    _applyPromoToPremiumPrices(_offer.discountPct||50);
  }

  function _startTimer(){
    _stopTimer();
    _timer = setInterval(()=>{
      if(!_offer) return;
      _render();
    }, 1000);
  }

  function _stopTimer(){
    if(_timer){
      clearInterval(_timer);
      _timer = null;
    }
  }

  function _attach(uid){
    _detach();
    if(!uid) return;

    _uid = uid;
    _ref = db.ref(OFFER_PATH(uid));
    _off = (snap)=>{
      _offer = snap.val();
      try{ window.__mkPromoChat25Offer = _offer; window.__mkPromoChat25Active = _isActive(_offer); }catch(e){}
      _render();
      if(_isActive(_offer)) _startTimer();
      else _stopTimer();
    };
    _ref.on('value', _off);

    // Initial paint
    _render();
  }

  function _detach(){
    try{ if(_ref && _off) _ref.off('value', _off); }catch(e){}
    _ref = null;
    _off = null;
    _uid = null;
    _offer = null;
    _stopTimer();

    // Hide banners
    const ids = ['promoChat25Banner_chat','promoChat25Banner_profile','promoChat25Banner_premium'];
    for(const id of ids) _hideBanner(id, true);
    _restorePremiumPrices();
  }

  // Auth hook
  try{
    auth && auth.onAuthStateChanged && auth.onAuthStateChanged((u)=>{
      try{ _attach(u && u.uid ? u.uid : null); }catch(e){}
    });
  }catch(e){
    // Fallback (very early load)
    setTimeout(()=>{ try{ const u = auth?.currentUser || null; _attach(u?.uid||null); }catch(_){} }, 1200);
  }

})();
