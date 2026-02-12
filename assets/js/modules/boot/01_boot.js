
// NOTE (GitHub Pages cache safety)
// Avoid a *named* static import for initFirebase.
// If a browser keeps an older cached version of 00_firebase.js without that named export,
// the whole app crashes at parse-time with:
//   "does not provide an export named 'initFirebase'"
// Dynamic import prevents that fatal failure; we resolve the function at runtime.
let __initFirebaseFn = null;
async function loadInitFirebase(){
  if(__initFirebaseFn) return __initFirebaseFn;
  const mod = await import("../firebase/00_firebase.js");
  __initFirebaseFn = mod.initFirebase || mod.initFirebaseOnce || mod.initFirebaseCompat || mod.default;
  if(typeof __initFirebaseFn !== 'function'){
    throw new Error('initFirebase export not found in modules/firebase/00_firebase.js');
  }
  return __initFirebaseFn;
}

function showFirebaseFailBanner(err){
  try{
    const el = document.createElement('div');
    el.id = 'firebaseFailBanner';
    el.textContent = 'Firebase init failed — check config / network.';
    el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:10050;padding:10px 12px;background:#8b1e1e;color:#fff;font:14px/1.3 system-ui;';
    if(document.body) document.body.appendChild(el);
  }catch(e){}
  console.error('[boot] Firebase init failed', err);
}
import { initAccess } from "../firebase/10_access.js";
import { restoreView, openView, getState } from "../features/router/20_router.js";
import { ensureModule } from "../features/lazy/14_lazy.js";
import { initOnboarding, ensureCookiesGate, showRoleIfMissing, maybeStart } from "../features/onboarding/15_onboarding.js";
import { watchBadges, wireNotifUI } from "../features/notifications/12_notifications.js";
import { startPresence, stopPresence } from "../features/presence/13_presence.js";
import { wireAuthUI, handleRedirectResultOnce, openAuthIfNeeded, closeAuth } from "../features/auth/09_auth.js";

let BOOT_DONE = false;

function hidePreloader(){
  const p = document.getElementById("preloader");
  if(p) p.classList.add("hidden");
}

export async function boot(){
  if(BOOT_DONE) return;
  BOOT_DONE = true;

  // 1) Firebase init (SSOT)
  try{
    const initFb = await loadInitFirebase();
    initFb();
  }catch(err){
    showFirebaseFailBanner(err);
    return;
  }

  // 2) Wire UI (once)
  wireNotifUI();
  wireAuthUI();
  initOnboarding();

  // 3) Finalize Google redirect if returning from auth handler
  await handleRedirectResultOnce();

  // 4) Wait for auth state (no race)
  // auth state ready logged after resolve
  const user = await new Promise((resolve)=>{
  // Guard: avoid multiple auth listeners (can break restore on F5)
  if(window.__mkAuthListenerActive){
    // If another listener already exists, just poll currentUser once.
    return resolve(firebase.auth().currentUser || null);
  }
  window.__mkAuthListenerActive = true;
  const unsub = firebase.auth().onAuthStateChanged((u)=>{
    try{ unsub && unsub(); }catch(e){}
    window.__mkAuthListenerActive = false;
    resolve(u || null);
  });
});

  console.log('[boot] auth state ready', !!user);

  // 5) Access snapshot (no fallback reads in send paths)
  initAccess(user);

  
// 5.5) First-entry gates (cookies -> role)
// Cookies gate is UI-only; doesn't block auth state.
ensureCookiesGate();
if(user){
  const roleNeeded = await showRoleIfMissing();
  if(!roleNeeded) maybeStart();
}

// 6) Start watchers
  watchBadges(user);
  if(user){ startPresence(user); closeAuth(); }
  else { stopPresence(); }

  console.log('[boot] router started');

  // 7) Restore view state (SSOT) and lazy-load module for it
  const s = restoreView(); // returns state
  console.log('[boot] view restored', s);

  // Guest mode: allow reading public feed without login.
  // If the restored view is private and user is not authenticated, fall back to Chat.
  const restoredView = (s && s.view) ? s.view : "chat";
  const publicViews = new Set(["chat"]);
  const needsAuth = !publicViews.has(restoredView);
  if (!window.auth?.currentUser && needsAuth) {
    console.log('[boot] guest mode → forcing chat view');
    openView('chat');
  }

  const view = (getState() && getState().view) ? getState().view : "chat";
  await ensureModule(view);

  // 8) If auth required (private views) show overlay after view exists (no flicker)
  openAuthIfNeeded();

  // 9) Done: hide preloader
  hidePreloader();
}
