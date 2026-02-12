import { initFirebaseOnce } from "./modules/firebase/00_firebase.js";
import { initAccess, getAccess } from "./modules/firebase/10_access.js";
import { restoreAfterReload, openView, applyPendingAfterLogin } from "./modules/features/router/20_router.js";
import { wireAuthUI, handleRedirectResultOnce } from "./modules/features/auth/09_auth.js";
import { initFab, update as updateFab } from "./modules/ui/70_fab.js";
import { ensureModule } from "./modules/features/lazy/14_lazy.js";

// Strict boot order:
// initFirebaseOnce -> initState (handled by imports) -> initAuth -> restoreAfterReload -> openView(router) -> initFab -> single onAuthStateChanged
async function main(){
  await initFirebaseOnce();

  // Auth UI wiring + redirect handler
  wireAuthUI();
  await handleRedirectResultOnce();

  // Ensure chat module is present early (guest read)
  await ensureModule('chat');

  // Restore desired view (guest-safe)
  const want = restoreAfterReload();
  await openView(want, { restore:true });

  // FAB
  initFab();
  updateFab(want);

  // Single auth state listener
  const { auth } = getAccess();
  if(auth && !window.__MK_AUTH_BOUND__){
    window.__MK_AUTH_BOUND__ = true;
    auth.onAuthStateChanged(async (user)=>{
      initAccess(user); // role watch, flags
      if(user){
        // after login: go pending view if any
        const pv = await applyPendingAfterLogin();
        if(pv) updateFab(pv);
      }
    });
  }
}

window.addEventListener('hashchange', async ()=>{
  const v = (location.hash||'').replace('#','') || 'chat';
  await openView(v);
  updateFab(v);
});

main().catch(e=>console.error(e));
