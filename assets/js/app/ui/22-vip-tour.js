/*
  VIP onboarding (10 steps)
  - Trigger: plan becomes VIP (usersPublic.plan) OR user already VIP on first load
  - Shows welcome modal (vipWelcomeModal)
  - Starts a tooltip-based 10-step tour

  Notes:
  - Uses the same tooltip styles as ui/21-tour.js (mk-tour-*)
  - Safe: skips steps if target element is missing
*/
(function vipTourModule(){
  'use strict';

  const KEY_DONE = 'mk_vip_tour_done_v1';
  const KEY_SHOWN = 'mk_vip_welcome_shown_v1';

  function $(sel){
    if(!sel) return null;
    if(sel.startsWith('#')) return document.getElementById(sel.slice(1));
    return document.querySelector(sel);
  }

  function _plan(){
    try{ return (window.getMyPlanState && getMyPlanState().plan) || (window.__myPublic && (window.__myPublic.plan||'free')) || 'free'; }
    catch(e){ return (window.__myPublic && (window.__myPublic.plan||'free')) || 'free'; }
  }

  function _isVip(){
    return String(_plan()||'free').toLowerCase() === 'vip';
  }

  function _lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function _lsSet(k,v){ try{ localStorage.setItem(k,String(v)); }catch(e){} }

  function _openDrawer(){
    const btn = document.getElementById('drawerBtn');
    if(btn) btn.click();
  }

  async function _ensureVisible(selector, viewId){
    if(viewId){
      try{ window.openView && openView(viewId); }catch(e){}
      // small wait for DOM transitions
      await new Promise(r=>setTimeout(r, 250));
    }

    let el = $(selector);
    if(el) return el;

    // If it's inside drawer, open it
    _openDrawer();
    await new Promise(r=>setTimeout(r, 200));
    el = $(selector);
    return el;
  }

  // --- Tooltip engine (simplified, compatible with mk-tour CSS) ---
  let _tip = null;
  let _hi = null;
  let _i = 0;
  let _steps = [];

  function _cleanup(){
    try{ _tip && _tip.remove(); }catch(e){}
    try{ _hi && _hi.classList.remove('mk-tour-highlight'); }catch(e){}
    _tip = null;
    _hi = null;
  }

  function _placeTooltip(target, html, countText){
    _cleanup();
    if(!target) return;

    target.classList.add('mk-tour-highlight');
    _hi = target;

    const tip = document.createElement('div');
    tip.className = 'mk-tour-tooltip arrow-top';
    tip.innerHTML = `
      <div class="mk-tour-title">VIP — обучение</div>
      <div class="mk-tour-text">${html}</div>
      <div class="mk-tour-actions">
        <span class="mk-tour-count">${countText||''}</span>
        <button class="ghost" id="vipTourSkip" type="button">Пропустить</button>
        <button class="primary" id="vipTourNext" type="button">Дальше</button>
      </div>
    `;

    document.body.appendChild(tip);
    _tip = tip;

    const r = target.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();

    // Default: above target
    let top = window.scrollY + r.top - tr.height - 12;
    let left = window.scrollX + r.left + (r.width/2) - (tr.width/2);

    // Clamp within viewport
    const pad = 10;
    left = Math.max(pad, Math.min(left, window.scrollX + window.innerWidth - tr.width - pad));

    // If not enough space above, place below
    if(top < window.scrollY + pad){
      tip.classList.remove('arrow-top');
      tip.classList.add('arrow-bottom');
      top = window.scrollY + r.bottom + 12;
      if(top + tr.height > window.scrollY + window.innerHeight - pad){
        top = window.scrollY + window.innerHeight - tr.height - pad;
      }
    }

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;

    // Ensure target in view
    try{ target.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){}

    // Wire buttons
    const bSkip = document.getElementById('vipTourSkip');
    const bNext = document.getElementById('vipTourNext');

    if(bSkip) bSkip.onclick = ()=> finish(true);
    if(bNext) bNext.onclick = ()=> next();
  }

  async function showStep(i){
    const s = _steps[i];
    if(!s) return finish(false);

    // prepare
    try{ if(typeof s.before === 'function') await s.before(); }catch(e){}

    const el = await _ensureVisible(s.sel, s.view);
    if(!el){
      // skip missing step
      return next();
    }

    const count = `${i+1}/${_steps.length}`;
    _placeTooltip(el, s.html, count);

    // Optional auto action on highlight click
    if(s.onClick){
      try{ el.onclick = s.onClick; }catch(e){}
    }
  }

  function next(){
    _i++;
    if(_i >= _steps.length) return finish(false);
    showStep(_i);
  }

  function finish(skipped){
    _cleanup();
    _lsSet(KEY_DONE, '1');
    try{ toast && toast(skipped ? 'VIP обучение пропущено' : 'VIP обучение завершено'); }catch(e){}
  }

  function startVipTour(){
    if(_lsGet(KEY_DONE)==='1') return;

    _i = 0;
    _steps = [
      {
        sel:'#drawerPremium',
        html:'<b>Privilegia</b> — здесь всё про твой VIP: лимиты, привилегии и доступные функции.',
        before: async ()=>{ _openDrawer(); await new Promise(r=>setTimeout(r,150)); }
      },
      {
        sel:'#premiumPlans',
        view:'view-premium',
        html:'Тут можно увидеть планы и цены. Если активна акция — цена покажется со скидкой.'
      },
      {
        sel:'#drawerAutopost',
        html:'<b>Autoposting</b> — VIP‑функция для автоматической публикации/рассылки. Открой и настроим.',
        before: async ()=>{ _openDrawer(); await new Promise(r=>setTimeout(r,150)); }
      },
      {
        sel:'#autopostCity',
        view:'view-autopost',
        html:'Выбери город, где будет работать автопостинг.'
      },
      {
        sel:'#autopostCreate',
        view:'view-autopost',
        html:'Нажми <b>Vytvořit kampaň</b> — после этого внизу появится список кампаний.'
      },
      {
        sel:'#btnBell',
        html:'<b>Колокольчик</b> — сюда приходят уведомления: друзья, вакансии, акции и системные события.'
      },
      {
        sel:'#drawerProfile',
        html:'Переходим в <b>Profil</b>: там появятся VIP‑возможности (объявления, уведомления друзьям).',
        before: async ()=>{ _openDrawer(); await new Promise(r=>setTimeout(r,150)); }
      },
      {
        sel:'#vacPublish',
        view:'view-profile',
        html:'Кнопка публикации объявления/вакансии. Для VIP доступны расширенные варианты.'
      },
      {
        sel:'#fabDm',
        html:'<b>DM</b> (конвертик) — быстрый вход в личные сообщения. Там уже есть прочитано/непрочитано.'
      },
      {
        sel:'#topPlanBadge',
        html:'Вот твой бейдж <b>VIP</b>. Всё готово — удачи! 🎉'
      }
    ];

    showStep(_i);
  }
  window.startVipTour = startVipTour;

  function showWelcomeIfNeeded(){
    if(!_isVip()) return;
    if(_lsGet(KEY_DONE)==='1') return;
    if(_lsGet(KEY_SHOWN)==='1') return;

    _lsSet(KEY_SHOWN,'1');

    const m = document.getElementById('vipWelcomeModal');
    if(!m) return;

    try{ openModal && openModal('vipWelcomeModal'); }catch(e){ m.hidden=false; }

    const later = document.getElementById('vipWelcomeLater');
    const start = document.getElementById('vipWelcomeStart');

    if(later){
      later.onclick = ()=>{ try{ closeModal && closeModal('vipWelcomeModal'); }catch(e){ m.hidden=true; } };
    }
    if(start){
      start.onclick = ()=>{
        try{ closeModal && closeModal('vipWelcomeModal'); }catch(e){ m.hidden=true; }
        setTimeout(()=> startVipTour(), 200);
      };
    }
  }

  // Triggers
  document.addEventListener('mk:plan-changed', ()=>{
    showWelcomeIfNeeded();
  });
  window.addEventListener('myPublic:changed', ()=>{
    showWelcomeIfNeeded();
  });

  // First load fallback
  setTimeout(()=> showWelcomeIfNeeded(), 1800);

})();
