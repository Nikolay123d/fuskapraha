// features/ui/70_fab.js
// Floating action button (FAB) for quick actions in current view.

import { subscribe, getState } from '../../core/02_state.js';

let __mounted = false;
let __unsub = null;

function isAuthed(){
  return !!(window.auth && window.auth.currentUser);
}

function ensureDom(){
  if(__mounted) return;
  __mounted = true;

  const root = document.createElement('div');
  root.id = 'mkFab';
  root.innerHTML = `
    <div class="fab-wrap">
      <button id="fabMain" class="fab-main" type="button" aria-label="Actions">+</button>
      <div id="fabMenu" class="fab-menu hidden" aria-hidden="true">
        <button id="fabCam"  class="fab-item" type="button" title="Foto">📷</button>
        <button id="fabWrite" class="fab-item" type="button" title="Napsat">✍️</button>
        <button id="fabDown" class="fab-item" type="button" title="Dolů">⬇️</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const main = document.getElementById('fabMain');
  const menu = document.getElementById('fabMenu');
  const cam  = document.getElementById('fabCam');
  const wr   = document.getElementById('fabWrite');
  const down = document.getElementById('fabDown');

  function toggleMenu(force){
    const open = (force!=null) ? !!force : menu.classList.contains('hidden');
    if(open){
      menu.classList.remove('hidden');
      menu.setAttribute('aria-hidden','false');
    }else{
      menu.classList.add('hidden');
      menu.setAttribute('aria-hidden','true');
    }
  }

  main?.addEventListener('click', ()=>toggleMenu());

  // Close menu on outside click
  document.addEventListener('click', (e)=>{
    const r = document.getElementById('mkFab');
    if(!r) return;
    if(r.contains(e.target)) return;
    toggleMenu(false);
  }, true);

  cam?.addEventListener('click', ()=>{
    toggleMenu(false);
    if(!isAuthed()) return window.openAuthOverlay?.();
    document.getElementById('chatAttach')?.click();
  });

  wr?.addEventListener('click', ()=>{
    toggleMenu(false);
    if(!isAuthed()) return window.openAuthOverlay?.();
    const inp = document.getElementById('chatInput');
    inp?.focus();
  });

  down?.addEventListener('click', ()=>{
    toggleMenu(false);
    const feed = document.getElementById('chatFeed');
    if(feed) feed.scrollTop = feed.scrollHeight;
  });
}

function sync(){
  const s = getState();
  const root = document.getElementById('mkFab');
  if(!root) return;
  // Show FAB only in chat view for now
  root.style.display = (s.view === 'chat') ? 'block' : 'none';
}

export function initFab(){
  ensureDom();
  sync();
  if(!__unsub) __unsub = subscribe(()=>sync());
}
