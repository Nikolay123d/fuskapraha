
import { getState, setState } from '../../core/02_state.js';
import { openView } from '../router/20_router.js';

export function initOnboarding(){
  window.__onboarding = { maybeStart, showRoleIfMissing, ensureCookiesGate };
}

export function ensureCookiesGate(){
  const accepted = localStorage.getItem("mk_cookies")==="1";
  const el = document.getElementById("cookieOverlay");
  if(!el) return true;
  if(accepted){ el.classList.add("hidden"); return true; }
  el.classList.remove("hidden");
  document.getElementById("cookieAccept")?.addEventListener("click", ()=>{
    localStorage.setItem("mk_cookies","1");
    el.classList.add("hidden");
    maybeStart();
  }, { once:true });
  return false;
}

export async function showRoleIfMissing(){
  const u = firebase.auth().currentUser;
  if(!u) return false;
  const snap = await firebase.database().ref("usersPublic/"+u.uid+"/role").get();
  const role = snap.val();
  if(role==="employer" || role==="seeker") return false;

  const o = document.getElementById("roleOverlay");
  if(!o) return false;
  o.classList.remove("hidden");

  o.querySelectorAll("[data-role]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const r = btn.dataset.role;
      await firebase.database().ref("usersPublic/"+u.uid).update({
        role: r,
        nick: u.displayName || u.email || "Uživatel",
        email: u.email || ""
      });
      o.classList.add("hidden");
      // go to profile once to complete setup
      localStorage.setItem("mk_first_profile_done","0");
      setState({ ...getState(), view:"profile", profileUid: u.uid });
      openView('profile', { profileUid: u.uid });
      window.openProfile?.(u.uid);
      maybeStart();
    }, { once:true });
  });
  return true;
}

export function maybeStart(){
  // only once
  if(localStorage.getItem("mk_tour_done")==="1") return;
  // require cookies accepted
  if(localStorage.getItem("mk_cookies")!=="1") return;
  const u = firebase.auth().currentUser;
  if(!u) return;

  const tour = document.getElementById("tourOverlay");
  const txt = document.getElementById("tourText");
  const next = document.getElementById("tourNext");
  const skip = document.getElementById("tourSkip");
  const arrow = document.getElementById("tourArrow");
  if(!tour || !txt || !next || !skip || !arrow) return;

  const steps = [
    { text: "Vítejte! Tady je rychlý průvodce (jen jednou).", target: null },
    { text: "Chat: veřejná linta. Pište a hned uvidíte odpovědi.", target: '[data-view="chat"]' },
    { text: "DM: soukromé zprávy. Otevřete room a komunikujte okamžitě.", target: '[data-view="dm"]' },
    { text: "Profil: vyplňte roli a nick (zvyšuje důvěru).", target: '[data-view="profile"]' },
    { text: "Hotovo. Můžete začít.", target: null },
  ];
  let i=0;

  function posTo(target){
    if(!target){ arrow.hidden=true; return; }
    const el = document.querySelector(target);
    if(!el){ arrow.hidden=true; return; }
    const r = el.getBoundingClientRect();
    arrow.hidden=false;
    arrow.style.left = (r.left + r.width/2 - 10) + "px";
    arrow.style.top = (r.bottom + 8) + "px";
  }

  function render(){
    const s = steps[i];
    txt.textContent = s.text;
    posTo(s.target);
    next.textContent = (i===steps.length-1) ? "Dokončit" : "Další";
  }

  tour.classList.remove("hidden");
  render();

  next.onclick = ()=>{
    if(i>=steps.length-1){
      tour.classList.add("hidden");
      arrow.hidden=true;
      localStorage.setItem("mk_tour_done","1");
      return;
    }
    i++;
    render();
  };
  skip.onclick = ()=>{
    tour.classList.add("hidden");
    arrow.hidden=true;
    localStorage.setItem("mk_tour_done","1");
  };
}
