// Autoposting campaigns (server-first)
// - Client manages campaigns via Cloud Functions (create/update/toggle/remove)
// - Server posts messages on schedule (Cloud Scheduler → autopostTick)

(function autopostingModule(){
  'use strict';
  if(window.__MK_AUTOPOSTING__) return;
  window.__MK_AUTOPOSTING__ = true;

  const MAX_TEXT = 1200;
  const MAX_IMG  = 400000; // dataURL length cap
  const INTERVAL_OPTIONS = [15, 30, 60, 120, 240, 480, 720, 1440];

  let _uid = null;
  let _camps = {}; // id -> data
  let _watchUnsub = null;
  let _uiWired = false;
  let _pendingImg = '';

  function _$(id){ return document.getElementById(id); }

  function _feats(){
    try{ return window.getMyPlanFeatures ? window.getMyPlanFeatures() : null; }catch(e){ return null; }
  }
  function _plan(){
    try{ return String((window.MK && window.MK.state && window.MK.state.plan) || 'free').toLowerCase(); }catch(e){ return 'free'; }
  }
  function _canUse(){
    const f = _feats();
    return !!(f && f.autopost && f.autopost.slots && f.autopost.slots > 0);
  }
  function _minInterval(){
    const f = _feats();
    return Number(f && f.autopost && f.autopost.minIntervalMin) || 120;
  }
  function _slots(){
    const f = _feats();
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
    if(text){
      const t = _$( 'autopostMiniText');
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
    const hintBox = _$( 'autopostHint');

    const plan = _plan();
    const slots = _slots();
    const minInt = _minInterval();
    const ppd = _postsPerDay();

    if(hint){
      hint.textContent = `${plan.toUpperCase()} · kampaně: ${slots||0} · min interval: ${minInt}m · posty/den: ${ppd||0}`;
    }

    const photosAllowed = _allowPhotos();
    if(btnPhoto) btnPhoto.classList.toggle('disabled', !photosAllowed);
    if(ph) ph.textContent = photosAllowed ? '' : 'Foto není dostupné v tomto tarifu';

    const can = _canUse();
    if(btnCreate) btnCreate.disabled = !can;
    if(hintBox){
      if(!can){
        hintBox.textContent = 'Autoposting je dostupný v Premium / Premium+ / VIP. Upgrade najdeš v „Privilegia“. (Kampaň běží na serveru i když máš web zavřený.)';
      }else{
        hintBox.textContent = 'Vytvoř si kampaň a server bude pravidelně publikovat tvůj text do chatu (funguje i když máš web zavřený).';
      }
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

  function _fmtTs(ts){
    try{ ts = Number(ts||0); return ts ? new Date(ts).toLocaleString() : '–'; }catch(e){ return '–'; }
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
    title.textContent = `${String(c.city||'').toUpperCase()} · ${Number(c.intervalMin||0)}m`;

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
    meta.textContent = `Last post: ${_fmtTs(c.lastPostTs)} · Next: ${_fmtTs(c.nextPostTs)}`;

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
        if(typeof window.callFn !== 'function') throw new Error('functions_unavailable');

        // Lightweight local gating (server enforces as source of truth)
        if(!c.isActive){
          const slots=_slots();
          const active=_activeCount();
          if(slots && active >= slots){
            toast(`Limit kampaní: ${active}/${slots}`);
            return;
          }
        }

        btnToggle.disabled = true;
        const r = await window.callFn('autopostCampaignToggle', { campaignId: id, isActive: !c.isActive });
        if(r && r.ok === false){
          toast(_reasonToMsg(r));
          return;
        }
        await _loadCampaigns();
      }catch(e){
        console.warn(e);
        toast(e && e.code ? e.code : 'Chyba');
      }finally{
        btnToggle.disabled = false;
      }
    };

    btnEdit.onclick = ()=>{ _openEdit(id, c); };

    btnDel.onclick = async ()=>{
      if(!confirm('Smazat kampaň?')) return;
      try{
        if(!_uid) return;
        if(typeof window.callFn !== 'function') throw new Error('functions_unavailable');
        btnDel.disabled = true;
        const r = await window.callFn('autopostCampaignRemove', { campaignId: id });
        if(r && r.ok === false){ toast('Nelze smazat'); }
        await _loadCampaigns();
      }catch(e){
        console.warn(e);
        toast(e && e.code ? e.code : 'Chyba');
      }finally{
        btnDel.disabled = false;
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

    const arr = Object.entries(_camps)
      .map(([id,c])=>({id,c}))
      .sort((a,b)=>Number((b.c||{}).createdTs||0) - Number((a.c||{}).createdTs||0));

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

  async function _openEdit(id, c){
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

    if(typeof window.callFn !== 'function'){
      toast('Functions nejsou dostupné');
      return;
    }try{
      const r = await window.callFn('autopostCampaignUpdate', {
        campaignId: id,
        text,
        intervalMin,
        city: String(city||'praha').toLowerCase()
      });
      if(r && r.ok === false){ toast(_reasonToMsg(r)); return; }
      toast('Uloženo');
      await _loadCampaigns();
    }catch(e){
      console.warn(e);
      toast(e && e.code ? e.code : 'Chyba');
    }rn(e);
      toast(e && e.code ? e.code : 'Chyba');
    });
  }

  function _reasonToMsg(r){
    const reason = String((r && r.reason) || '').toLowerCase();
    if(reason==='plan') return 'Autoposting není dostupný v tomto tarifu';
    if(reason==='slots') return `Limit kampaní: ${r.active||0}/${r.slots||0}`;
    if(reason==='min_interval') return `Min interval: ${r.minIntervalMin||'?'} min`;
    if(reason==='no_photos') return 'Foto není dostupné v tomto tarifu';
    if(reason==='image') return 'Foto je příliš velké / neplatné';
    if(reason==='text') return 'Text je prázdný nebo příliš dlouhý';
    if(reason==='city') return 'Neplatné město';
    return 'Nelze provést akci';
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
      toast('Foto není dostupné v tomto tarifu');
      return;
    }

    const slots=_slots();
    const active=_activeCount();
    if(slots && active >= slots){
      toast(`Limit kampaní: ${active}/${slots}`);
      return;
    }

    if(typeof window.callFn !== 'function'){
      toast('Functions nejsou dostupné');
      return;
    }

    try{
      _setMini(true, 'Vytvářím kampaň…');
      const r = await window.callFn('autopostCampaignCreate', {
        city,
        text,
        intervalMin,
        isActive: true,
        imageUrl: _pendingImg || ''
      });

      if(r && r.ok === false){
        toast(_reasonToMsg(r));
        return;
      }

      // reset UI
      try{ (_$('autopostText')||{}).value=''; }catch(e){}
      _pendingImg='';
      try{ const inp=_$('autopostPhoto'); if(inp) inp.value=''; }catch(e){}
      toast('Kampaň vytvořena');
      await _loadCampaigns();
    }catch(e){
      console.warn(e);
      toast(e && e.code ? e.code : 'Chyba');
    }finally{
      _setMini(false);
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
            toast('Foto není dostupné v tomto tarifu');
            photoInp.value='';
            return;
          }
          const f = photoInp.files && photoInp.files[0];
          if(!f){ _pendingImg=''; return; }
          const dataUrl = await (window.fileToDataURL ? fileToDataURL(f, {maxSide:960, maxLen:MAX_IMG, quality:0.78}) : Promise.reject(new Error('fileToDataURL missing')));
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

    // Refresh selects/hints when plan changes
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

  // --------
  // Watch campaigns (read-only)
  // --------

  async function _loadCampaigns(){
    try{
      if(!_uid) return;
      if(typeof window.callFn !== 'function'){
        toast('Functions nejsou dostupné');
        return;
      }
      _setMini(true, 'Načítám kampaně…');
      const r = await window.callFn('autopostCampaignList', {});
      _camps = (r && r.campaigns) ? r.campaigns : {};
    }catch(e){
      console.warn(e);
      _camps = {};
      // Don't spam toasts on every load; only show if explicitly needed.
    }finally{
      _setMini(false);
      try{ _renderList(); }catch(e){}
    }
  }

  function startAutopostEngine(uid){
    try{
      stopAutopostEngine();
      _uid = uid || null;
      _camps = {};
      if(!_uid) return;
      _loadCampaigns();
    }catch(e){
      console.warn(e);
    }
  }
  window.startAutopostEngine = startAutopostEngine;

  function stopAutopostEngine(){
    try{ if(_watchUnsub) _watchUnsub(); }catch(e){}
    _watchUnsub=null;
    _uid=null;
    _camps={};
  }
  window.stopAutopostEngine = stopAutopostEngine;

})();
