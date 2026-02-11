
import { initFirebaseOnce, getFirebaseError } from "../firebase/00_firebase.js";
import { initAccess } from "../firebase/10_access.js";
import { restoreView } from "../features/router/20_router.js";
import { ensureModule } from "../features/lazy/14_lazy.js";
import { initOnboarding, ensureCookiesGate, showRoleIfMissing, maybeStart } from "../features/onboarding/15_onboarding.js";
import { watchBadges, wireNotifUI } from "../features/notifications/12_notifications.js";
import { startPresence, stopPresence } from "../features/presence/13_presence.js";
import { wireAuthUI, handleRedirectResultOnce, openAuthIfNeeded, closeAuth } from "../features/auth/09_auth.js";

let BOOT_DONE = false;

function logBoot(msg, extra){
  try{
    const line = `[boot] ${msg}`;
    if(extra!==undefined) console.log(line, extra);
    else console.log(line);
    window.__bootLog = window.__bootLog || [];
    window.__bootLog.push({ ts: Date.now(), msg, extra });
  }catch(e){}
}

function showBootBanner(text){
  let el = document.getElementById('bootBanner');
  if(!el){
    el = document.createElement('div');
    el.id = 'bootBanner';
    el.className = 'boot-banner';
    el.innerHTML = `<div class="boot-banner__text"></div><button type="button" class="boot-banner__btn">OK</button>`;
    document.body.appendChild(el);
    el.querySelector('.boot-banner__btn')?.addEventListener('click', ()=>{ el.remove(); });
  }
  const t = el.querySelector('.boot-banner__text');
  if(t) t.textContent = text;
}

function showFirebaseFailBanner(){
  const msg = getFirebaseError() || "Firebase init failed";
  console.error("[firebase] init failed:", msg);
  // Try toast if present
  try{
    if(window.toast) window.toast(`Firebase init failed: ${msg}`);
  }catch(e){}
  // Fallback banner
  let b = document.getElementById('bootFailBanner');
  if(!b){
    b = document.createElement('div');
    b.id = 'bootFailBanner';
    b.innerHTML = `<div class="bootfail-card"><b>Firebase init failed</b><div class="muted" style="margin-top:6px"></div></div>`;
    document.body.appendChild(b);
  }
  const m = b.querySelector('.muted');
  if(m) m.textContent = String(msg);
  b.style.display = 'block';
}

function hidePreloader(){
  const p = document.getElementById("preloader");
  if(p) p.classList.add("hidden");
}

export async function boot(){
  if(BOOT_DONE) return;
  BOOT_DONE = true;

  // 1) Firebase init (SSOT)
  const ok = initFirebaseOnce();
  if(!ok){
    const err = getFirebaseError() || 'Firebase init failed';
    logBoot('firebase init failed', err);
    try{ showBootBanner(`Firebase init failed: ${err}`); }catch(_){ }
    return; // do not start router / listeners
  }
  logBoot('firebase ready');

  // 2) Wire UI (once)
  wireNotifUI();
  wireAuthUI();
  initOnboarding();

  // 3) Finalize Google redirect if returning from auth handler
  await handleRedirectResultOnce();

  // 4) Wait for auth state (no race)
  const auth = firebase.auth();
  const user = await new Promise((resolve)=>{
    const unsub = auth.onAuthStateChanged((u)=>{
      try{ unsub && unsub(); }catch(e){}
      resolve(u);
    });
  });
  logBoot('auth state ready', user ? user.uid : null);

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
  logBoot('view restored', view);
  await ensureModule(view);
  logBoot('router started', view);

  // 8) If auth required (private views) show overlay after view exists (no flicker)
  openAuthIfNeeded();

  // 9) Done: hide preloader
  hidePreloader();
}
