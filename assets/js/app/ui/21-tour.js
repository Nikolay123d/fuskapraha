// === Onboarding tour (coach marks with arrows) ===
(function(){
  const TOUR_KEY = 'mk_tour_done_v1';

  function done(){
    try{ return localStorage.getItem(TOUR_KEY)==='1'; }catch(e){ return false; }
  }
  function markDone(){
    try{ localStorage.setItem(TOUR_KEY,'1'); }catch(e){}
  }

  let tooltip = null;
  let currentTarget = null;
  let idx = 0;
  let steps = [];

  function openDrawer(){
    try{ document.getElementById('drawerBtn')?.click(); }catch(e){}
  }
  function closeDrawer(){
    try{ document.getElementById('drawerClose')?.click(); }catch(e){}
  }

  function build(){
    if(tooltip) return;
    tooltip = document.createElement('div');
    tooltip.className = 'mk-tour-tooltip arrow-top';
    tooltip.hidden = true;
    tooltip.innerHTML = `
      <div class="mk-tour-title"></div>
      <div class="mk-tour-text"></div>
      <div class="mk-tour-actions">
        <span class="mk-tour-count"></span>
        <button type="button" id="mkTourSkip">Přeskočit</button>
        <button type="button" class="primary" id="mkTourNext">Další</button>
      </div>
    `;
    document.body.appendChild(tooltip);

    tooltip.querySelector('#mkTourSkip')?.addEventListener('click', end);
    tooltip.querySelector('#mkTourNext')?.addEventListener('click', next);

    // keep position valid
    window.addEventListener('resize', ()=>{
      if(tooltip && !tooltip.hidden && currentTarget){ position(currentTarget); }
    });
    window.addEventListener('scroll', ()=>{
      if(tooltip && !tooltip.hidden && currentTarget){ position(currentTarget); }
    }, {passive:true});
  }

  function clearHighlight(){
    try{ currentTarget?.classList.remove('mk-tour-highlight'); }catch(e){}
    currentTarget = null;
  }

  function position(target){
    if(!tooltip || !target) return;
    const r = target.getBoundingClientRect();

    tooltip.hidden = false;
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';

    // measure
    const pad = 12;
    const w = tooltip.offsetWidth || 280;
    const h = tooltip.offsetHeight || 140;

    // default: tooltip below target
    let top = r.bottom + pad;
    let arrowMode = 'arrow-top';

    // if doesn't fit below, place above
    if(top + h > window.innerHeight - pad){
      top = r.top - h - pad;
      arrowMode = 'arrow-bottom';
    }
    if(top < pad) top = pad;

    let left = r.left + (r.width - w)/2;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));

    // arrow x relative to tooltip
    const arrowX = Math.max(18, Math.min((r.left + r.width/2) - left, w - 18));

    tooltip.classList.remove('arrow-top','arrow-bottom');
    tooltip.classList.add(arrowMode);
    tooltip.style.setProperty('--arrow-x', `${arrowX}px`);

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top  = `${Math.round(top)}px`;
  }

  function show(i){
    if(!tooltip) build();

    clearHighlight();
    const step = steps[i];
    if(!step){ end(); return; }

    // per-step prep
    try{ step.before && step.before(); }catch(e){}

    // slight delay to let DOM settle (drawer open etc)
    setTimeout(()=>{
      const target = document.querySelector(step.selector);
      if(!target){
        // element not available, skip
        next();
        return;
      }

      currentTarget = target;
      try{ target.classList.add('mk-tour-highlight'); }catch(e){}

      try{ target.scrollIntoView({behavior:'smooth', block:'center', inline:'center'}); }catch(e){}

      const titleEl = tooltip.querySelector('.mk-tour-title');
      const textEl  = tooltip.querySelector('.mk-tour-text');
      const countEl = tooltip.querySelector('.mk-tour-count');
      const nextBtn = tooltip.querySelector('#mkTourNext');

      if(titleEl) titleEl.textContent = step.title || '';
      if(textEl)  textEl.textContent  = step.text  || '';
      if(countEl) countEl.textContent = `${i+1}/${steps.length}`;
      if(nextBtn) nextBtn.textContent = (i === steps.length-1) ? 'Hotovo' : 'Další';

      position(target);
    }, 140);
  }

  function next(){
    idx += 1;
    if(idx >= steps.length){
      end();
      return;
    }
    show(idx);
  }

  function end(){
    clearHighlight();
    try{ if(tooltip) tooltip.hidden = true; }catch(e){}
    try{ closeDrawer(); }catch(e){}
    markDone();

    // Tour end/close is a user gesture → safe moment to request permissions.
    try{ if(typeof scheduleNotifPrompt==='function') scheduleNotifPrompt(250); }catch(e){}
  }

  function start(){
    if(done()) return;
    build();

    // Steps should target elements that exist on both desktop + mobile.
    steps = [
      {
        selector: '#citySelect',
        title: 'Чат по городу',
        text: 'Выбери город — общий чат будет сверху. Новые сообщения всегда внизу.'
      },
      {
        // DM entry point is the floating envelope button (header DM is intentionally removed)
        selector: '#fabDm',
        title: 'Личные сообщения (DM)',
        text: 'Конверт — вход в личные сообщения. Лента открывается на самых новых сообщениях.'
      },
      {
        selector: '#btnBell',
        title: 'Уведомления',
        text: 'Колокольчик — уведомления, заявки и события.'
      },
      {
        selector: '#drawerBtn',
        title: 'Меню',
        text: 'В меню: привилегии (Premium/VIP), правила, помощь и выход.'
      },
      {
        selector: '#drawerPremium',
        title: 'Premium / VIP',
        text: 'Здесь можно отправить заявку на Premium / Premium+ / VIP через бота.',
        before: () => openDrawer()
      }
    ];

    idx = 0;
    show(idx);
  }

  window.addEventListener('app:ready', ()=>{
    // Do not block rendering; let the UI settle first.
    setTimeout(()=>{ try{ start(); }catch(e){} }, 900);
  }, {once:true});
})();
