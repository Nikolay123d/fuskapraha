// features/router/20_router.js
// Единственный entrypoint для навигации/инициализации view.

import { ensureModule } from '../lazy/14_lazy.js';
import { getState, setView, setPendingView, clearPendingView } from '../../core/02_state.js';
import { getAccess } from '../../firebase/10_access.js';
import { openAuth } from '../auth/09_auth.js';

const VIEW_TO_MODULE = {
  chat: 'chat',
  dm: 'dm',
  profile: 'profile',
  friends: 'friends',
  admin: 'admin',
  premium: 'premium'
};

function isProtected(view){
  return (view === 'dm' || view === 'profile' || view === 'friends' || view === 'admin' || view === 'premium');
}

let __currentView = null;

export async function openView(view, opts={}){
  // Normalize
  view = view || 'chat';
  if(!VIEW_TO_MODULE[view]) view = 'chat';

  const access = getAccess();
  const authed = !!(access.auth && access.auth.currentUser);

  // Guest hard gate: keep UI visible but protect actions
  if(!authed && isProtected(view)){
    setPendingView(view);
    setView('chat'); // persist last tab as chat for guests
    // ensure chat module loaded
    await ensureModule('chat');
    // show chat view
    showView('chat');
    // open auth overlay (non-crashing)
    openAuth();
    return 'chat';
  }

  // Load module for view
  await ensureModule(VIEW_TO_MODULE[view]);

  // Hide previous, show next
  showView(view);

  // Persist
  setView(view);

  // Hash sync (optional, stable)
  if(opts.updateHash !== false){
    const h = '#'+view;
    if(location.hash !== h) history.replaceState(null,'',h);
  }

  __currentView = view;
  return view;
}

function showView(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  const el = document.getElementById('view-'+view);
  if(el) el.classList.remove('hidden');
}

export function restoreAfterReload(){
  const s = getState();
  const access = getAccess();
  const authed = !!(access.auth && access.auth.currentUser);

  // Prefer hash if present
  const hash = (location.hash||'').replace('#','');
  const want = hash || s.view || 'chat';

  if(!authed && isProtected(want)){
    // guests always land in chat; pending view preserved
    setPendingView(want);
    return 'chat';
  }
  return want;
}

export async function applyPendingAfterLogin(){
  const s = getState();
  const pv = s.pendingView;
  if(pv){
    clearPendingView();
    await openView(pv, { updateHash:true });
    return pv;
  }
  return null;
}
