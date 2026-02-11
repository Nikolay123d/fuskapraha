
import { initFirebase } from "../firebase/00_firebase.js";
import { initAccess } from "../firebase/10_access.js";
import { restoreView } from "../features/router/20_router.js";
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
  initFirebase();

  // 2) Wire UI (once)
  wireNotifUI();
  wireAuthUI();
  initOnboarding();

  // 3) Finalize Google redirect if returning from auth handler
  await handleRedirectResultOnce();

  // 4) Wait for auth state (no race)
  const user = await new Promise((resolve)=>{
    firebase.auth().onAuthStateChanged((u)=>resolve(u));
  });

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

  // 7) Restore view state (SSOT) and lazy-load module for it
  const s = restoreView(); // returns state
  const view = (s && s.view) ? s.view : "chat";
  await ensureModule(view);

  // 8) If auth required (private views) show overlay after view exists (no flicker)
  openAuthIfNeeded();

  // 9) Done: hide preloader
  hidePreloader();
}
