
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
        const s = getState();
        if(s.dmMode==="room" && window.__dmApi?.openRoom){
          await window.__dmApi.openRoom(s.room, s.peer, {restore:true});
        }else{
          await window.__dmApi?.showInbox?.();
        }
      }
    });
  });

  await boot();

  // after boot, DM restore if needed
  try{
    const s = getState();
    if(s.view==="dm"){
      await ensureModule("dm");
      if(s.dmMode==="room") await window.__dmApi?.openRoom?.(s.room, s.peer, {restore:true});
      else await window.__dmApi?.showInbox?.();
    }
  }catch(e){ console.error(e); }
});
