// ui/70_fab.js - floating action button (FAB)
import { getState } from "../core/02_state.js";

let fab, panel, fileInput;

function ensure(){
  if(fab) return;
  fab = document.createElement('button');
  fab.id = 'mkFab';
  fab.className = 'mk-fab';
  fab.innerHTML = '+';
  panel = document.createElement('div');
  panel.id='mkFabPanel';
  panel.className='mk-fab-panel hidden';
  panel.innerHTML = `
    <button class="mk-fab-act" data-act="photo">📷</button>
    <button class="mk-fab-act" data-act="write">✍️</button>
    <button class="mk-fab-act" data-act="down">⬇️</button>
  `;
  fileInput = document.createElement('input');
  fileInput.type='file';
  fileInput.accept='image/*';
  fileInput.style.display='none';
  document.body.appendChild(fab);
  document.body.appendChild(panel);
  document.body.appendChild(fileInput);

  fab.addEventListener('click', ()=>{
    panel.classList.toggle('hidden');
  });

  panel.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const act = btn.getAttribute('data-act');
    if(act==='photo'){
      fileInput.click();
    }else if(act==='write'){
      const inp = document.querySelector('#chatText') || document.querySelector('#dmText');
      if(inp) inp.focus();
    }else if(act==='down'){
      const feed = document.querySelector('#chatFeed') || document.querySelector('#dmFeed');
      if(feed) feed.scrollTop = feed.scrollHeight;
    }
  });

  fileInput.addEventListener('change', ()=>{
    const f = fileInput.files && fileInput.files[0];
    if(!f) return;
    // delegate to chat attach handler if present
    const evt = new CustomEvent('mk:fabricated-photo', { detail: { file:f } });
    window.dispatchEvent(evt);
    fileInput.value='';
    panel.classList.add('hidden');
  });
}

export function initFab(){
  ensure();
  // show/hide based on view
  const s = getState();
  const view = s.view || 'chat';
  update(view);
}

export function update(view){
  ensure();
  // show on chat/dm only
  const show = (view==='chat' || view==='dm');
  fab.style.display = show ? 'flex' : 'none';
  panel.classList.add('hidden');
}
