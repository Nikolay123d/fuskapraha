// === Guided Tour (arrows, skippable, non-dimming) ===
// Shows a lightweight onboarding tooltip with arrows pointing to key UI controls.
// Stored in localStorage: mk_tour_done_v1=1.

(function(){
  'use strict';
  if(window.__MK_TOUR_INSTALLED__) return;
  window.__MK_TOUR_INSTALLED__ = true;

  const LS_KEY = 'mk_tour_done_v1';

  function _qs(sel){ try{ return document.querySelector(sel); }catch(e){ return null; } }

  function _clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function _ensureUI(){
    if(document.getElementById('mkTourTip')) return;

    const tip = document.createElement('div');
    tip.id = 'mkTourTip';
    tip.className = 'mk-tour-tip';
    tip.style.display = 'none';
    tip.innerHTML = `
      <div class="mk-tour-title" id="mkTourTitle"></div>
      <div class="mk-tour-text" id="mkTourText"></div>
      <div class="mk-tour-actions">
        <button class="btn ghost" id="mkTourSkip" type="button">Přeskočit</button>
        <button class="btn" id="mkTourNext" type="button">Další</button>
      </div>
      <div class="mk-tour-arrow" id="mkTourArrow"></div>
    `;
    document.body.appendChild(tip);
  }

  function _markDone(){
    try{ localStorage.setItem(LS_KEY, '1'); }catch(e){}
  }

  function _isDone(){
    try{ return localStorage.getItem(LS_KEY)==='1'; }catch(e){ return false; }
  }

  function _clearHighlight(){
    try{ document.querySelectorAll('.mk-tour-highlight').forEach(el=>el.classList.remove('mk-tour-highlight')); }catch(e){}
  }

  function _positionTip(target){
    const tip = document.getElementById('mkTourTip');
    const arrow = document.getElementById('mkTourArrow');
    if(!tip || !arrow) return;

    const r = target.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth||0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight||0);

    // Choose placement (prefer bottom)
    const spaceBottom = vh - r.bottom;
    const spaceTop = r.top;
    const place = (spaceBottom >= 120 || spaceBottom >= spaceTop) ? 'bottom' : 'top';

    tip.dataset.place = place;

    // Temporarily show to measure
    tip.style.display = 'block';
    tip.style.left = '0px';
    tip.style.top = '0px';
    const tr = tip.getBoundingClientRect();

    const left = _clamp(r.left + (r.width/2) - (tr.width/2), 10, vw - tr.width - 10);
    let top = 0;
    if(place==='bottom') top = _clamp(r.bottom + 10, 10, vh - tr.height - 10);
    else top = _clamp(r.top - tr.height - 10, 10, vh - tr.height - 10);

    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';

    // Arrow positioning
    const arrowX = _clamp((r.left + r.width/2) - left, 14, tr.width - 14);
    arrow.style.left = Math.round(arrowX) + 'px';
  }

  function startTour(){
    if(_isDone()) return;
    if(document.body.dataset && document.body.dataset.tourRunning==='1') return;

    _ensureUI();

    const tip = document.getElementById('mkTourTip');
    const title = document.getElementById('mkTourTitle');
    const text = document.getElementById('mkTourText');
    const btnNext = document.getElementById('mkTourNext');
    const btnSkip = document.getElementById('mkTourSkip');
    if(!tip || !title || !text || !btnNext || !btnSkip) return;

    document.body.dataset.tourRunning = '1';

    const steps = [
      { sel:'#citySelect', title:'Město', text:'Vyber město — chat a nabídky jsou podle města.' },
      { sel:'button.tab[data-view="view-chat"], #tabChat', title:'Chat', text:'Tady je veřejný chat města.' },
      { sel:'#btnDMTop', title:'L.S.', text:'Obálka = soukromé zprávy (DM).' },
      { sel:'#btnBell', title:'Upozornění', text:'Zde uvidíš upozornění (žádosti, DM, systémové zprávy).' },
      { sel:'#drawerBtn', title:'Menu', text:'V menu najdeš „Privilegia“ (Premium/VIP) a další stránky.' },
      { sel:'#btnMe', title:'Profil', text:'Tady upravíš přezdívku, avatar a nastavení.' },
    ];

    let i = 0;

    function showStep(){
      _clearHighlight();

      // Find target (skip missing)
      let target = null;
      for(let j=i; j<steps.length; j++){
        target = _qs(steps[j].sel);
        if(target && target.offsetParent!==null) { i=j; break; }
        target = null;
      }
      if(!target){
        finish();
        return;
      }

      const step = steps[i];
      title.textContent = step.title;
      text.textContent = step.text;
      btnNext.textContent = (i >= steps.length-1) ? 'Hotovo' : 'Další';

      try{ target.classList.add('mk-tour-highlight'); }catch(e){}
      _positionTip(target);
    }

    function finish(){
      _clearHighlight();
      try{ tip.style.display='none'; }catch(e){}
      try{ delete document.body.dataset.tourRunning; }catch(e){}
      _markDone();
    }

    btnNext.onclick = ()=>{
      i++;
      if(i >= steps.length){ finish(); return; }
      showStep();
    };
    btnSkip.onclick = finish;

    // Dismiss on resize/orientation change
    const onResize = ()=>{ try{ if(tip.style.display!=='none') showStep(); }catch(e){} };
    window.addEventListener('resize', onResize, {passive:true});

    showStep();
  }

  // Export manual trigger
  window.startTour = startTour;

  // Auto-start (once) after app is ready
  window.addEventListener('app:ready', ()=>{ setTimeout(()=>{ try{ startTour(); }catch(e){} }, 900); });
  window.addEventListener('DOMContentLoaded', ()=>{ setTimeout(()=>{ try{ if(window.__MK_BOOTSTRAPPED) startTour(); }catch(e){} }, 1500); });
})();
