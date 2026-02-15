// Autoposting campaigns + client-side scheduler (runs while site is open)
(function autopostingModule(){
  'use strict';
  if(window.__MK_AUTOPOSTING__) return;
  window.__MK_AUTOPOSTING__ = true;

  const MAX_TEXT = 1200;
  const MAX_IMG = 400000; // dataURL length cap
  const INTERVAL_OPTIONS = [15, 30, 60, 120, 240, 480, 720];

  let _uid = null;
  let _camps = {}; // id -> data
  let _tick = null;
  let _watchUnsub = null;
  let _uiWired = false;
  let _pendingImg = '';

  function _$(id){ return document.getElementById(id); }

  function _todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  function _feats(){
    try{ return window.getMyPlanFeatures ? window.getMyPlanFeatures() : null; }catch(e){ return null; }
  }

  function _plan(){
    try{ return String((window.MK && window.MK.state && window.MK.state.plan) || 'free').toLowerCase(); }catch(e){ return 'free'; }
  }

  function _canUse(){
    const f = _feats();
    return !!(f && f.autopost && f.autopost.slots && f.autopost.slots>0);
  }

  function _minInterval(){
    const f = _feats();
    return Number(f && f.autopost && f.autopost.minIntervalMin) || 120;
  }

  function _slots(){
    const f=_feats();
    return Number(f && f.autopost && f.autopost.slots) || 0;
  }

  function _postsPerDay(){
    const f=_feats();
    return Number(f && f.autopost && f.autopost.postsPerDay) || 0;
  }

  function _allowPhotos(){
    const f=_feats();
    return !!(f && f.autopost && f.autopost.photos);
  }

  function _activeCount(){
    let n=0;
    for(const k in _camps){ if(_camps[k] && _camps[k].isActive) n++; }
    return n;
  }

  function _setMini(on, text){
    const box = _$( 'autopostMiniLoad');
    if(!box) return;
    box.style.display = on ? 'flex' : 'none';
    if(text) {
      const t=_$('autopostMiniText');
      if(t) t.textContent = text;
    }
  }

  function _renderCounters(){
    const el = _$( 'autopostCounters');
    if(!el) return;
    const slots=_slots();
    const active=_activeCount();
    el.textContent = slots ? `Aktivní: ${active}/${slots}` : `Aktivní: ${active}`;
  }

  function _renderPlanHint(){
    const hint = _$( 'autopostPlanHint');
    const ph = _$( 'autopostPhotoHint');
    const btnPhoto = _$( 'autopostPhotoBtn');
    const btnCreate = _$( 'autopostCreate');

    const plan = _plan();
    const slots = _slots();
    const minInt = _minInterval();
    const ppd = _postsPerDay();

    if(hint){
      hint.textContent = `${plan.toUpperCase()} · kampaně: ${slots||0} · min interval: ${minInt}m · posty/den: ${ppd||0}`;
    }

    const photosAllowed = _allowPhotos();
    if(btnPhoto) btnPhoto.classList.toggle('disabled', !photosAllowed);
    if(ph) ph.textContent = photosAllowed ? '' : 'Foto je dostupné od Premium+';

    const can = _canUse();
    if(btnCreate) btnCreate.disabled = !can;
    if(!can){
      const h=_$('autopostHint');
      if(h) h.textContent = 'Autoposting je dostupný v Premium / Premium+ / VIP. Upgrade najdeš v „Privilegia“. (Kampaň běží pouze když máš web otevřený.)';
    }
  }

  function _fillCitySelect(){
    const sel = _$( 'autopostCity');
    if(!sel) return;
    if(sel.options && sel.options.length) return;

    const src = _$( 'citySelect');
    if(src && src.options && src.options.length){
      for(const opt of src.options){
        const o=document.createElement('option');
        o.value=opt.value; o.textContent=opt.textContent;
        sel.appendChild(o);
      }
      try{ sel.value = src.value; }catch(e){}
      return;
    }

    // fallback
    ['praha','brno','ostrava','plzen','liberec','olomouc','hradec','pardubice'].forEach((v)=>{
      const o=document.createElement('option');
      o.value=v; o.textContent=v;
      sel.appendChild(o);
    });
    sel.value='praha';
  }

  function _fillIntervalSelect(){
    const sel = _$( 'autopostInterval');
    if(!sel) return;
    sel.innerHTML='';
    const minI=_minInterval();
    for(const m of INTERVAL_OPTIONS){
      if(m < minI) continue;
      const o=document.createElement('option');
      o.value=String(m);
      o.textContent = `${m} min`;
      sel.appendChild(o);
    }
    if(!sel.options.length){
      const o=document.createElement('option');
      o.value=String(minI);
      o.textContent=`${minI} min`;
      sel.appendChild(o);
    }
    sel.value = sel.options[0].value;
  }

  function _campCard(id, c){
    const div=document.createElement('div');
    div.className='card';
    div.style.padding='10px 12px';
    div.style.margin='8px 0';

    const top=document.createElement('div');
    top.className='row';
    top.style.alignItems='center';

    const title=document.createElement('b');
    title.textContent = `${(c.city||'').toUpperCase()} · ${Number(c.intervalMin||0)}m`;

    const status=document.createElement('span');
    status.className='badge';
    status.style.marginLeft='8px';
    status.textContent = c.isActive ? 'ACTIVE' : 'OFF';

    const sp=document.createElement('span');
    sp.className='spacer';

    const btnToggle=document.createElement('button');
    btnToggle.className='pill';
    btnToggle.textContent = c.isActive ? 'Vypnout' : 'Zapnout';

    const btnEdit=document.createElement('button');
    btnEdit.className='pill';
    btnEdit.textContent='Upravit';

    const btnDel=document.createElement('button');
    btnDel.className='pill danger';
    btnDel.textContent='Smazat';

    top.appendChild(title);
    top.appendChild(status);
    top.appendChild(sp);
    top.appendChild(btnToggle);
    top.appendChild(btnEdit);
    top.appendChild(btnDel);

    const text=document.createElement('div');
    text.className='text';
    text.style.marginTop='8px';
    text.textContent = String(c.text||'');

    const meta=document.createElement('div');
    meta.className='muted';
    meta.style.marginTop='8px';
    const lp = Number(c.lastPostTs||0);
    meta.textContent = lp ? `Last post: ${new Date(lp).toLocaleString()}` : 'Last post: –';

    if(c.imageUrl){
      const img=document.createElement('img');
      img.src = c.imageUrl;
      img.style.maxWidth='100%';
      img.style.borderRadius='10px';
      img.style.marginTop='10px';
      div.appendChild(img);
    }

    btnToggle.onclick = async ()=>{
      try{
        if(!_uid) return;
        const slots=_slots();
        if(!c.isActive){
          const active=_activeCount();
          if(slots && active >= slots){
            toast(`Limit kampaní: ${active}/${slots}`);
            return;
          }
        }
        const ref=db.ref(`autopostCampaigns/${_uid}/${id}/isActive`);
        await ref.set(!c.isActive);
      }catch(e){
        console.warn(e);
        toast(e && e.code ? e.code : 'Chyba');
      }
    };

    btnEdit.onclick = ()=>{ _openEdit(id, c); };

    btnDel.onclick = async ()=>{
      if(!confirm('Smazat kampaň?')) return;
      try{
        await db.ref(`autopostCampaigns/${_uid}/${id}`).remove();
      }catch(e){
        console.warn(e);
        toast(e && e.code ? e.code : 'Chyba');
      }
    };

    div.appendChild(top);
    div.appendChild(text);
    div.appendChild(meta);
    return div;
  }

  function _renderList(){
    const list=_$('autopostList');
    const empty=_$('autopostEmpty');
    if(!list) return;
    list.innerHTML='';

    const arr = Object.entries(_camps).map(([id,c])=>({id,c})).sort((a,b)=Number((b.c||{}).createdTs||0)-Number((a.c||{}).createdTs||0));
    if(!arr.length){
      if(empty) empty.style.display='block';
      _renderCounters();
      return;
    }
    if(empty) empty.style.display='none';

    for(const it of arr){
      list.appendChild(_campCard(it.id, it.c||{}));
    }
    _renderCounters();
  }

  function _openEdit(id, c){
    // simple inline edit via prompt to avoid a dedicated modal
    const newText = prompt('Text kampaně', String(c.text||''));
    if(newText===null) return;
    const text = String(newText||'').trim();
    if(!text || text.length>MAX_TEXT){ toast(`Text 1..${MAX_TEXT}`); return; }

    const minI=_minInterval();
    const curI = Number(c.intervalMin||minI);
    const newI = prompt(`Interval (min) — min ${minI}`, String(curI));
    if(newI===null) return;
    const intervalMin = Math.max(minI, Number(newI)||minI);

    const city = prompt('Město (např. praha/brno/…)', String(c.city||'praha'));
    if(city===null) return;

    const patch = { text, intervalMin, city: String(city||'praha').toLowerCase() };
    db.ref(`autopostCampaigns/${_uid}/${id}`).update(patch).then(()=>toast('Uloženo')).catch((e)=>{ console.warn(e); toast(e && e.code ? e.code : 'Chyba'); });
  }

  async function _createCampaign(){
    if(!_uid){ toast('Musíš být přihlášen'); return; }
    if(!_canUse()){
      toast('Autoposting je dostupný v Premium / Premium+ / VIP');
      return;
    }

    const text = String((_$('autopostText')||{}).value||'').trim();
    if(!text || text.length>MAX_TEXT){ toast(`Text 1..${MAX_TEXT}`); return; }

    const citySel=_$('autopostCity');
    const city = String((citySel && citySel.value) || (window.getCity && getCity()) || 'praha').toLowerCase();

    const intSel=_$('autopostInterval');
    const intervalMin = Math.max(_minInterval(), Number(intSel && intSel.value) || _minInterval());

    if(_pendingImg && !_allowPhotos()){
      toast('Foto je dostupné od Premium+');
      return;
    }

    const slots=_slots();
    const active=_activeCount();
    if(slots && active >= slots){
      toast(`Limit kampaní: ${active}/${slots}`);
      return;
    }

    try{
      const now=Date.now();
      const data={
        city,
        text,
        intervalMin,
        isActive: true,
        createdTs: now,
        lastPostTs: 0,
      };
      if(_pendingImg) data.imageUrl = _pendingImg;

      const ref=db.ref(`autopostCampaigns/${_uid}`).push();
      await ref.set(data);

      // reset UI
      try{ (_$('autopostText')||{}).value=''; }catch(e){}
      _pendingImg='';
      try{ const inp=_$('autopostPhoto'); if(inp) inp.value=''; }catch(e){}
      toast('Kampaň vytvořena');
    }catch(e){
      console.warn(e);
      toast(e && e.code ? e.code : 'Chyba');
    }
  }

  function _wireUIOnce(){
    if(_uiWired) return;
    _uiWired=true;

    _fillCitySelect();
    _fillIntervalSelect();
    _renderPlanHint();

    const btn=_$('autopostCreate');
    if(btn) btn.onclick = ()=>_createCampaign();

    const photoInp=_$('autopostPhoto');
    if(photoInp){
      photoInp.onchange = async ()=>{
        try{
          if(!_allowPhotos()){
            toast('Foto je dostupné od Premium+');
            photoInp.value='';
            return;
          }
          const f = photoInp.files && photoInp.files[0];
          if(!f){ _pendingImg=''; return; }
          const dataUrl = await (window.fileToDataURL ? fileToDataURL(f) : Promise.reject(new Error('fileToDataURL missing')));
          if(String(dataUrl||'').length > MAX_IMG){
            toast('Foto je příliš velké');
            photoInp.value='';
            _pendingImg='';
            return;
          }
          _pendingImg=String(dataUrl||'');
          toast('Foto přidáno');
        }catch(e){
          console.warn(e);
          toast('Chyba foto');
        }
      };
    }

    const citySel=_$('autopostCity');
    if(citySel) citySel.onchange = ()=>{};

    // Refresh intervals if plan changes
    document.addEventListener('mk:plan-changed', ()=>{
      try{ _fillIntervalSelect(); _renderPlanHint(); _renderCounters(); }catch(e){}
    });
  }

  function enterAutopostView(){
    _wireUIOnce();
    _renderPlanHint();
    _fillCitySelect();
    _fillIntervalSelect();
    _renderList();
  }
  window.enterAutopostView = enterAutopostView;

  // -------- scheduler (global) --------

  async function _tryPostCampaign(cid, c){
    try{
      if(!_uid) return;
      if(!c || !c.isActive) return;

      // Enforce plan constraints (in case plan downgraded)
      if(!_canUse()) return;

      const intervalMin = Math.max(_minInterval(), Number(c.intervalMin||0));
      const intervalMs = intervalMin * 60000;
      const now = Date.now();
      const last = Number(c.lastPostTs||0);
      if(last && (now - last) < intervalMs) return;

      // daily post limit
      if(window.checkLimit){
        const ok = await checkLimit('autopost_posts');
        if(!ok) return;
      }

      const city = String(c.city||'praha').toLowerCase();

      // deterministic key to be idempotent across tabs
      const bucket = Math.floor(now / intervalMs);
      const bucketTs = bucket * intervalMs;
      const msgKey = `ap_${_uid}_${cid}_${bucket}`;
      const msgRef = db.ref(`messages/${city}/${msgKey}`);

      const msgObj = {
        ts: bucketTs,
        by: _uid,
        text: String(c.text||'').slice(0, MAX_TEXT),
        meta: { kind: 'autopost', campaignId: cid }
      };
      if(c.imageUrl){ msgObj.img = String(c.imageUrl||'').slice(0, MAX_IMG); }

      // write only if not exists
      const tx = await msgRef.transaction((cur)=>{
        if(cur) return; // already posted
        return msgObj;
      });

      if(tx && tx.committed){
        // Update lastPostTs + counter
        try{ await db.ref(`autopostCampaigns/${_uid}/${cid}/lastPostTs`).set(bucketTs); }catch(e){}
        try{ if(window.incLimit) await incLimit('autopost_posts'); }catch(e){}
      } else {
        // Ensure lastPostTs is at least bucketTs to avoid re-trying forever
        try{
          const lp=Number(c.lastPostTs||0);
          if(!lp || lp < bucketTs){
            await db.ref(`autopostCampaigns/${_uid}/${cid}/lastPostTs`).set(bucketTs);
          }
        }catch(e){}
      }

    }catch(e){
      // don't toast in background scheduler
      console.warn('autopost tick error', e);
    }
  }

  async function _tickOnce(){
    try{
      if(!_uid) return;
      // quick plan-based stop
      if(!_canUse()) return;

      const ids = Object.keys(_camps||{});
      if(!ids.length) return;

      // avoid bursts: process sequentially
      for(const cid of ids){
        const c=_camps[cid];
        await _tryPostCampaign(cid, c);
      }
    }catch(e){
      console.warn(e);
    }
  }

  function startAutopostEngine(uid){
    try{
      stopAutopostEngine();
      _uid = uid || null;
      _camps = {};
      if(!_uid) return;

      // Watch campaigns (global)
      const ref = db.ref(`autopostCampaigns/${_uid}`);
      const cb = (snap)=>{
        _setMini(false);
        _camps = snap.val() || {};
        try{ _renderList(); }catch(e){}
      };
      ref.on('value', cb);
      _watchUnsub = ()=>{ try{ ref.off('value', cb); }catch(e){} };

      try{ if(window.MK && window.MK.subs) window.MK.subs.set('autopost:camps', _watchUnsub, 'global'); }catch(e){}

      // Scheduler tick
      _tick = setInterval(_tickOnce, 30000);
      // kick immediately after short delay to allow campaigns load
      setTimeout(_tickOnce, 2000);

    }catch(e){
      console.warn(e);
    }
  }
  window.startAutopostEngine = startAutopostEngine;

  function stopAutopostEngine(){
    try{ if(_tick){ clearInterval(_tick); _tick=null; } }catch(e){}
    try{ if(_watchUnsub){ _watchUnsub(); } }catch(e){}
    _watchUnsub=null;
    _uid=null;
    _camps={};
  }
  window.stopAutopostEngine = stopAutopostEngine;

})();
