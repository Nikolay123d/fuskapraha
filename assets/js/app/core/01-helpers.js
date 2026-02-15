try{ if(!window.__PRELOADER_T0) window.__PRELOADER_T0 = Date.now(); }catch(e){}


// --- Mini loader helpers ---

function initDmMobileModal(){
  const overlay = document.getElementById('dmMobileOverlay');
  const mount = document.getElementById('dmMobileMount');
  const card = document.getElementById('dmConversationCard');
  const closeBtn = document.getElementById('dmMobileClose');
  if(!overlay || !mount || !card || !closeBtn) return;
  if(overlay.dataset.wired==='1') return;
  overlay.dataset.wired='1';

  let origParent = card.parentElement;
  let origNext = card.nextSibling;

  function open(){
    // only for narrow screens
    if(window.matchMedia && !window.matchMedia('(max-width: 720px)').matches) return;
    // move card into modal
    try{
      mount.appendChild(card);
      overlay.hidden=false;
      // update title from current peer if available
      try{
        const t=document.getElementById('dmMobileTitle');
        if(t){
          const u = window._lastDmPeerPublic || null;
          t.textContent = u && u.nick ? ('DM: '+u.nick) : 'Konverzace';
        }
      }catch(e){}
    }catch(e){}
  }
  function close(){
    try{
      overlay.hidden=true;
      // move back
      if(origParent){
        if(origNext) origParent.insertBefore(card, origNext);
        else origParent.appendChild(card);
      }
    }catch(e){}
  }

  closeBtn.addEventListener('click', close);

  // expose
  window.openDmMobile = open;
  window.closeDmMobile = close;
}


// --- time formatting ---
function fmtTime(ts){
  try{ return new Date(ts||0).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }catch(e){ return ''; }
}

function setMiniLoad(id, text, show){
  const el = document.getElementById(id);
  if(!el) return;
  const st = el.querySelector('.mini-status');
  if(typeof text==='string' && text.length){
    if(st) st.textContent = text; else el.textContent = text;
  }
  el.setAttribute('role','status');
  el.setAttribute('aria-live','polite');
  el.style.display = show ? 'flex' : 'none';
  if(show) startMiniTipsFor(el); else stopMiniTipsFor(el);
}

/** Rotating mini-loader texts while an async load is in progress. */
function startMiniSequence(id, texts, stepMs){
  const el = document.getElementById(id);
  if(!el) return ()=>{};
  const arr = Array.isArray(texts) && texts.length ? texts : ['Načítám…'];
  const ms = Math.max(250, +stepMs||700);
  let i=0;
  setMiniLoad(id, arr[0], true);
  const t = setInterval(()=>{
    i = (i+1)%arr.length;
    setMiniLoad(id, arr[i], true);
  }, ms);
  return ()=>{ try{ clearInterval(t); }catch(e){} };
}

// === Mini tips (rotating hints under mini-loaders) ===
const __MINI_TIPS = [
  "Tip: Přidej si přátele a piš v soukromí přes obálku.",
  "Tip: V profilu si nastav přezdívku a avatar — budeš víc vidět.",
  "Věděl jsi, že… V Premium můžeš mít vlastní boty pro inzerci?",
  "Tip: Mapu otevři jen když ji potřebuješ — zrychlíš start aplikace.",
  "Tip: Klepni na zvonek — uvidíš žádosti, zprávy a systémové novinky."
];
function startMiniTipsFor(el){
  try{
    if(!el) return;
    const tipEl = el.querySelector('.mini-tip');
    if(!tipEl) return;
    if(el.__tipTimer) clearInterval(el.__tipTimer);
    let i = 0;
    tipEl.textContent = __MINI_TIPS[0];
    el.__tipTimer = setInterval(()=>{
      i = (i + 1) % __MINI_TIPS.length;
      tipEl.textContent = __MINI_TIPS[i];
    }, 2800);
  }catch(e){}
}
function stopMiniTipsFor(el){
  try{
    if(el && el.__tipTimer){ clearInterval(el.__tipTimer); el.__tipTimer=null; }
  }catch(e){}
}

// === Local cache + staged prefetch (speed / "no empty screens")
// The goal is: instant paint from localStorage, then live sync in the background.
function __cacheKey(kind, extra){
  const uid = (window.auth && auth.currentUser && auth.currentUser.uid) ? auth.currentUser.uid : 'anon';
  const suffix = (extra!=null && String(extra).length) ? String(extra) : '';
  return `mk_cache_${kind}_${uid}${suffix ? '_' + suffix : ''}`;
}

function __cacheGet(key, maxAgeMs){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || typeof obj.ts!=='number') return null;
    if(maxAgeMs && (Date.now() - obj.ts) > maxAgeMs) return null;
    return obj;
  }catch(e){
    return null;
  }
}

function __cacheSet(key, val){
  try{
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), val }));
  }catch(e){}
}

function __cacheDelPrefix(prefix){
  try{
    for(let i=localStorage.length-1;i>=0;i--){
      const k = localStorage.key(i);
      if(k && k.startsWith(prefix)) localStorage.removeItem(k);
    }
  }catch(e){}
}

let __PREFETCH_STARTED = false;
async function __runPrefetchStages(){
  if(__PREFETCH_STARTED) return;
  __PREFETCH_STARTED = true;

  const stages = [
    { name:'dmThreads', fn: async()=>{ try{ if(window.loadDmThreads) await window.loadDmThreads(); }catch(e){} } },
    { name:'friends',   fn: async()=>{ try{ await loadFriends(); }catch(e){} } },
    { name:'members',   fn: async()=>{ try{ await loadMembers(); }catch(e){} } },
    { name:'mapPoi',    fn: async()=>{ try{ if(typeof prefetchMapPoi==='function') await prefetchMapPoi(); }catch(e){} } },
  ];

  for(const s of stages){
    // idle scheduling between stages (keeps UI responsive)
    await new Promise((resolve)=>{
      const run = async()=>{ try{ await s.fn(); }catch(e){} resolve(); };
      if('requestIdleCallback' in window){
        try{ window.requestIdleCallback(()=>run(), { timeout: 1400 }); }catch(e){ setTimeout(run, 350); }
      } else {
    try{ stopBotHostEngine(); }catch(e){}
    try{ if(window.__stopBotDmEngine) window.__stopBotDmEngine(); }catch(e){}
        setTimeout(run, 350);
      }
    });
  }
}

// Clear user-scoped caches on logout to avoid "wrong account" artifacts.

// Start staged prefetch safely (called after chat first paint)
function __startPrefetchStages(){
  try{
    if('requestIdleCallback' in window){
      requestIdleCallback(()=>{ __runPrefetchStages(); }, {timeout:1500});
    }else{
      setTimeout(()=>{ __runPrefetchStages(); }, 800);
    }
  }catch(e){}
}
function __clearUserCachesOnLogout(){
  try{ __cacheDelPrefix('mk_cache_'); }catch(e){}
}



/** Admin: quick camera buttons in headers (change wallpapers instantly for all) */
let __ADMIN_CAM_WIRED = false;
function wireAdminQuickCams(){
  const me = auth.currentUser;
  if(!me || !isAdminUser(me) || __ADMIN_CAM_WIRED) return;
  __ADMIN_CAM_WIRED = true;

  const svg = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 7l1.5-2h3L15 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3Z" stroke="currentColor" stroke-width="1.6"/><path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" stroke-width="1.6"/></svg>';

  const mk = (targetInputId, title)=>{
    const inp = document.getElementById(targetInputId);
    if(!inp) return null;
    const b = document.createElement('button');
    b.type='button';
    b.className='admin-cam-btn';
    b.title = title || 'Změnit pozadí';
    b.innerHTML = svg;
    b.addEventListener('click', ()=>{ try{ inp.click(); }catch(e){} });
    return b;
  };

  // Chat header
  try{
    const chatHeader = document.querySelector('#view-chat .top-actions') || document.querySelector('#view-chat header') || document.querySelector('#view-chat');
    const btn = mk('wpChat','Admin: pozadí chatu');
    if(btn && chatHeader) chatHeader.appendChild(btn);
  }catch(e){}

  // DM header
  try{
    const dmHeader = document.querySelector('#view-dm .top-actions') || document.querySelector('#view-dm header') || document.querySelector('#view-dm');
    const btn = mk('wpDm','Admin: pozadí DM');
    if(btn && dmHeader) dmHeader.appendChild(btn);
  }catch(e){}

  // Profile modal header (best-effort)
  try{
    const profHeader = document.querySelector('#modalUserCard header') || document.querySelector('#modalProfile header') || document.querySelector('#view-profile header');
    const btn = mk('wpProfile','Admin: pozadí profilu');
    if(btn && profHeader) profHeader.appendChild(btn);
  }catch(e){}

  // Main + Auth wallpapers (use admin settings inputs)
  try{
    const top = document.querySelector('.topbar') || document.body;
    const b1 = mk('wallCamera','Admin: hlavní pozadí');
    const b2 = mk('authWallCamera','Admin: pozadí přihlášení');
    if(b1) top.appendChild(b1);
    if(b2) top.appendChild(b2);
  }catch(e){}
}

function wireScrollDown(feedId, btnId){
  const feed=document.getElementById(feedId);
  const btn=document.getElementById(btnId);
  if(!feed || !btn) return;
  const update=()=>{
    const atBottom = (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 220;
    btn.style.display = atBottom ? 'none' : 'block';
  };
  feed.addEventListener('scroll', update);
  btn.addEventListener('click', ()=>{ feed.scrollTop = feed.scrollHeight; });
  setTimeout(update, 500);
}

// Normalize city key used for DB paths.
// Accepts either option value (praha) or label (Praha), returns the option value.
function mkNormalizeCity(input){
  try{
    const raw = String(input ?? '').trim();
    if(!raw) return 'praha';
    const low = raw.toLowerCase();

    const sel = document.getElementById('citySelect');
    if(sel && sel.options){
      for(const opt of sel.options){
        const v = String(opt.value||'').toLowerCase();
        const t = String(opt.textContent||'').trim().toLowerCase();
        if(v === low || t === low) return String(opt.value||'praha');
      }
    }

    // fallback: slugify
    let slug = low;
    if(slug.normalize){
      slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    }
    slug = slug
      .replace(/\s+/g,'-')
      .replace(/[^a-z0-9-]/g,'')
      .replace(/-+/g,'-')
      .replace(/^-|-$/g,'');

    if(sel && sel.options){
      for(const opt of sel.options){
        if(String(opt.value||'').toLowerCase() === slug) return String(opt.value||'praha');
      }
    }
    return slug || 'praha';
  }catch(e){
    return 'praha';
  }
}
window.mkNormalizeCity = mkNormalizeCity;
MK.normalizeCity = mkNormalizeCity;

// Some mobile browsers aggressively autofill "email" into the first visible input.
// We hard-clear it on first load for message fields (chat/DM) to avoid confusion.
(function(){
  const looksLikeEmail = (s)=> /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'').trim());
  const clearIfAutofilledEmail = (id)=>{
    const el = document.getElementById(id);
    if(!el) return;
    // Mark user edits to not fight the user.
    el.addEventListener('input', ()=>{ el.dataset.userEdited = '1'; }, {passive:true});
    // Clear only if it looks like an email AND user hasn't typed anything.
    if(!el.dataset.userEdited && looksLikeEmail(el.value)){
      el.value = '';
    }
  };
  window.addEventListener('DOMContentLoaded', ()=>{
    clearIfAutofilledEmail('msgText');
    clearIfAutofilledEmail('dmText');
  });
})();

