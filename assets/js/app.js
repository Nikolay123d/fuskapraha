// app.js (v22)
// Правило: app.js = только UI-кнопки → router.openView(view)

import { openView, restoreAfterReload } from './modules/features/router/20_router.js';
import { getState, setView } from './modules/core/02_state.js';
import { openAuthIfNeeded } from './modules/features/auth/09_auth.js';
import { initFirebaseOnce } from './modules/firebase/00_firebase.js';

function setAuthedUI(isAuthed){
  const authOnly = document.querySelectorAll('[data-auth="1"]');
  const guestOnly = document.querySelectorAll('[data-guest="1"]');
  authOnly.forEach(el => el.style.display = isAuthed ? '' : 'none');
  guestOnly.forEach(el => el.style.display = isAuthed ? 'none' : '');
}

function bind(selector, fn){
  const el = document.querySelector(selector);
  if(el) el.addEventListener('click', fn);
}

function viewFromHash(){
  const h = (location.hash || '').replace('#','');
  return h || null;
}

async function boot(){
  // IMPORTANT: Firebase must exist BEFORE any auth/router code touches window.auth
  try {
    await initFirebaseOnce();
  } catch (e) {
    console.error('[boot] firebase init failed', e);
  }

  // UI gate: guests can read public chat, но не должны видеть DM/профиль/админ
  const auth = window.auth;
  if (auth && typeof auth.onAuthStateChanged === 'function') {
    let first = true;
    auth.onAuthStateChanged(async (user)=>{
      setAuthedUI(!!user);

      // first auth tick -> restore view
      if (first) {
        first = false;
        restoreAfterReload();
        const s = getState();
        const initial = viewFromHash() || s.view || 'chat';
        await openView(initial, { restore: true });
        return;
      }

      // after login/logout: keep current hash if any
      const v = viewFromHash();
      if (v) await openView(v, { restore: false });
    });
  } else {
    // fallback: no auth listener, just try guest chat
    setAuthedUI(false);
    restoreAfterReload();
    const s = getState();
    const initial = viewFromHash() || s.view || 'chat';
    await openView(initial, { restore: true });
  }

  // If not logged in, show auth overlay for protected views. Chat can be guest.
  openAuthIfNeeded();
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
