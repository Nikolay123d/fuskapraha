
import { getState as _getState, setState as _setState } from "../../core/02_state.js";
import { stopDMListeners } from "../dm/40_dm.js";

export function setState(next){ _setState(next); }
export function getState(){ return _getState(); }

export function openView(view, extra={}){
  const prev = getState();
  // Stop feature listeners when leaving a view (prevents duplicate on F5 + tab switching).
  try{
    if(prev.view === 'dm' && view !== 'dm') stopDMListeners();
  }catch(e){}

  const next = { ...prev, view, ...extra };
  setState(next);

  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  const el = document.getElementById("view-"+view);
  if(el) el.classList.remove("hidden");

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
