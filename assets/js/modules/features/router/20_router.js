
import { getState as _getState, setState as _setState } from "../../core/02_state.js";

export function setState(next){ _setState(next); }
export function getState(){ return _getState(); }

export function openView(view, extra={}){
  const next = { ...getState(), view, ...extra };
  setState(next);

  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  const el = document.getElementById("view-"+view);
  if(el) el.classList.remove("hidden");

  // Lazy init heavy modules per view
  if(view==='admin'){ import('../admin/50_admin.js').then(m=>m.initAdmin()).catch(()=>{}); }


  return next;
}

export function restoreView(){
  const s = getState();
  const view = s.view || "chat";
  openView(view, s);
  return s;
}

window.openView = openView;
window.restoreView = restoreView;
