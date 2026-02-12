
import { boot } from "./modules/boot/01_boot.js";
import { openView, getState } from "./modules/features/router/20_router.js";
import { ensureModule } from "./modules/features/lazy/14_lazy.js";

document.addEventListener("DOMContentLoaded", async ()=>{
  // menu buttons should have data-view; if not, we won't break
  document.querySelectorAll("[data-view]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const v = btn.getAttribute("data-view");
      await ensureModule(v);
      openView(v, {view:v});
      // DM deep restore (room/inbox) handled by DM module when it inits reading mk_state
      
if(v==="profile"){
  await ensureModule("profile");
  await window.openProfile?.(firebase.auth().currentUser?.uid || null);
}
if(v==="friends"){
  await ensureModule("friends");
  await window.__friendsApi?.renderFriends?.();
}
if(v==="dm"){
        // DM module follows mk_state on init; no extra calls needed here.
      }
    });
  });

  await boot();

  // after boot, DM restore if needed
  try{
    const s = getState();
    if(s.view==="dm"){
      await ensureModule("dm");
      // DM init decides inbox vs room based on mk_state.
    }
  }catch(e){ console.error(e); }
});
