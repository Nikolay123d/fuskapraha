// app.js (v22)
// Правило: app.js = только UI-кнопки → router.openView(view)

import { openView } from './modules/features/router/20_router.js';
import { getState, setView } from './modules/core/02_state.js';
import { openAuthIfNeeded } from './modules/features/auth/09_auth.js';

function bind(selector, fn){
  const el = document.querySelector(selector);
  if(el) el.addEventListener('click', fn);
}

function viewFromHash(){
  const h = (location.hash || '').replace('#','');
  return h || null;
}

async function boot(){
  // If not logged in, show auth overlay for protected views. Chat can be guest.
  openAuthIfNeeded();

  // Restore last view
  const s = getState();
  const initial = viewFromHash() || s.view || 'chat';
  await openView(initial, { restore: true });
}

// --- top nav buttons ---
bind('#tabChat',    ()=> openView('chat'));
bind('#tabDM',      ()=> openView('dm'));
bind('#tabProfile', ()=> openView('profile'));
bind('#tabFriends', ()=> openView('friends'));
bind('#tabAdmin',   ()=> openView('admin'));

// Optional: when clicking logo, go chat
bind('#logoHome', ()=> openView('chat'));

window.addEventListener('hashchange', ()=>{
  const v = viewFromHash();
  if(v) openView(v);
});

// expose for debugging
window.MK = window.MK || {};
window.MK.openView = openView;
window.MK.setView = setView;
window.MK.state = getState;

boot();
