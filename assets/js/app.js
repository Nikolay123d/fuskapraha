// assets/js/app.js (v25)
// Single, predictable boot:
//  - init Firebase (compat)
//  - wire auth UI
//  - start router
//  - guest mode: chat read-only

import { initFirebaseOnce } from './modules/firebase/00_firebase.js';
import { openView } from './modules/features/router/20_router.js';
import { getState } from './modules/core/02_state.js';
import { wireAuthUI, handleRedirectResultOnce, openAuthIfNeeded, openAuth } from './modules/features/auth/09_auth.js';
import { initOnboarding } from './modules/features/onboarding/15_onboarding.js';
import { initFab } from './modules/features/ui/70_fab.js';

function hidePreloader(){
  const p = document.getElementById('preloader');
  if(p) p.classList.add('hidden');
}

function setAuthedUI(isAuthed){
  // Protected UI elements
  document.querySelectorAll('[data-auth-only="1"]').forEach(el=>{
    // keep Login button always visible
    if(el.id==='loginBtn') return;
    el.hidden = !isAuthed;
    if(!isAuthed) el.classList.add('hidden');
    else el.classList.remove('hidden');
  });
  // Admin-only elements
  const isAdmin = !!window.__mk_isAdmin;
  document.querySelectorAll('[data-admin-only="1"]').forEach(el=>{
    el.hidden = !(isAuthed && isAdmin);
    if(!(isAuthed && isAdmin)) el.classList.add('hidden');
    else el.classList.remove('hidden');
  });

  // Login/logout
  const login = document.getElementById('loginBtn');
  const logout = document.getElementById('logoutBtn');
  if(login) login.hidden = !!isAuthed;
  if(logout) logout.hidden = !isAuthed;
}

function isAuthed(){
  return !!(window.auth && window.auth.currentUser);
}

async function refreshAdminRole(user){
  window.__mk_isAdmin = false;
  try{
    if(!user || !window.db) return;
    const snap = await window.db.ref('roles/'+user.uid+'/admin').get();
    window.__mk_isAdmin = (snap && snap.val()===true);
  }catch(e){
    window.__mk_isAdmin = false;
  }
}

function viewFromHash(){
  const h = (location.hash || '').replace('#','').trim();
  return h || null;
}

function bindNav(){
  // Event delegation: any element with data-view
  document.addEventListener('click', (e)=>{
    const t = e.target instanceof Element ? e.target.closest('[data-view]') : null;
    if(!t) return;
    const view = t.getAttribute('data-view');
    if(!view) return;
    // Protected clicks -> auth overlay (router will keep user in chat)
    if(view !== 'chat' && !isAuthed()) {
      openAuth();
      // keep the URL/hash clean
      return;
    }
    location.hash = view;
    openView(view);
  }, true);

  window.addEventListener('hashchange', ()=>{
    const v = viewFromHash();
    if(v) openView(v);
  });
}

async function boot(){
  try{ initFirebaseOnce(); }catch(e){ console.error('[boot] firebase init failed', e); }

  // Expose overlay opener for modules (chat etc.)
  window.openAuthOverlay = openAuth;

  wireAuthUI();
  initOnboarding();
  initFab();
  await handleRedirectResultOnce();

  // Single auth listener for app-level UI + restore
  if(window.auth?.onAuthStateChanged){
    let first = true;
    window.auth.onAuthStateChanged(async (user)=>{
      await refreshAdminRole(user);
      setAuthedUI(!!user);

      // onboarding gates (cookies -> tour, role selection)
      try{ window.__onboarding && window.__onboarding.ensureCookiesGate && window.__onboarding.ensureCookiesGate(); }catch(e){}
      if(user){
        try{ window.__onboarding && window.__onboarding.showRoleIfMissing && window.__onboarding.showRoleIfMissing(); }catch(e){}
        try{ window.__onboarding && window.__onboarding.maybeStart && window.__onboarding.maybeStart(); }catch(e){}
      }


      if(first){
        first = false;
        const s = getState();
        const initial = viewFromHash() || s.view || 'chat';
        await openView(initial, { restore: true });
        openAuthIfNeeded();
        hidePreloader();
        return;
      }

      // After login/logout: if hash points to private view & user logged out -> router will bounce to chat.
      const v = viewFromHash() || (getState().view || 'chat');
      await openView(v, { restore: false });
      openAuthIfNeeded();
    });
  } else {
    setAuthedUI(false);
    const s = getState();
    await openView(viewFromHash() || s.view || 'chat', { restore: true });
    openAuthIfNeeded();
    hidePreloader();
  }
}

bindNav();
boot();
