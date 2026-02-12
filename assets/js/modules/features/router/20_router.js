
import { getState as _getState, setState as _setState } from "../../core/02_state.js";
import { ensureModule } from "../lazy/14_lazy.js";

// Init guards: each feature module should register listeners only once.
const __inited = {
  chat: false,
  dm: false,
  friends: false,
  profile: false,
  premium: false,
  admin: false,
};

async function initFeatureForView(view){
  // Keep mapping minimal; add more views later.
  if(view === 'chat' && !__inited.chat){
    const m = await ensureModule('chat');
    if(m?.initChat) m.initChat();
    __inited.chat = true;
  }
  if(view === 'dm' && !__inited.dm){
    const m = await ensureModule('dm');
    if(m?.initDM) m.initDM();
    __inited.dm = true;
  }
  if(view === 'friends' && !__inited.friends){
    const m = await ensureModule('friends');
    if(m?.initFriends) m.initFriends();
    __inited.friends = true;
  }
  if(view === 'profile' && !__inited.profile){
    const m = await ensureModule('profile');
    if(m?.initProfile) m.initProfile();
    __inited.profile = true;
  }
  if(view === 'premium' && !__inited.premium){
    const m = await ensureModule('premium');
    if(m?.initPremium) m.initPremium();
    __inited.premium = true;
  }
  if(view === 'admin' && !__inited.admin){
    const m = await ensureModule('admin');
    if(m?.initAdmin) m.initAdmin();
    __inited.admin = true;
  }
}

export function setState(next){ _setState(next); }
export function getState(){ return _getState(); }

export async function openView(view, extra={}){
  const next = { ...getState(), view, ...extra };
  setState(next);

  // 1) Lazy init feature (may attach listeners)
  try { await initFeatureForView(view); } catch(e) { /* ignore */ }

  // 2) Toggle views. If unknown view id - fallback to chat without blank screen.
  const el = document.getElementById("view-"+view);
  if(!el){
    view = 'chat';
  }
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  const target = document.getElementById("view-"+view);
  if(target) target.classList.remove("hidden");


  return next;
}

export function restoreView(){
  const s = getState();
  const view = s.view || "chat";
  // If user is not logged in, we still restore to public chat.
  const isAuthed = !!(window.auth && window.auth.currentUser);
  const privateViews = new Set(['dm','friends','admin','premium','profile']);
  const effectiveView = (!isAuthed && privateViews.has(view)) ? 'chat' : view;
  openView(effectiveView, s);
  return s;
}

window.openView = openView;
window.restoreView = restoreView;
