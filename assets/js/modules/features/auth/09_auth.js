
/**
 * v11 Auth UI: full-screen overlay in index.html.
 * Google popup -> redirect fallback.
 * No timers. No double overlays.
 */

export function openAuth(){
  const o = document.getElementById("authOverlay");
  if(!o) return;
  // Prefer class-based visibility; some builds ship `class="hidden"` on #authOverlay.
  o.classList.remove('hidden');
  o.hidden = false;
  document.body.classList.add("auth-open");
}
export function closeAuth(){
  const o = document.getElementById("authOverlay");
  if(!o) return;
  o.hidden = true;
  o.classList.add('hidden');
  document.body.classList.remove("auth-open");
}

/** Show overlay if user is not logged in and they open protected actions */
export function openAuthIfNeeded(){
  const user = window.auth.currentUser;
  if(!user){
    // keep auth hidden by default unless user tries protected action or view needs it
    // Here we show it if current view is DM/admin/friends (typical private areas)
    let s = {};
    try{ s = JSON.parse(localStorage.getItem("mk_state")||"{}"); }catch{}
    const view = s.view || "chat";
    const needs = (view==="dm" || view==="admin" || view==="friends" || view==="premium");
    if(needs) openAuth();
  }
}

export function wireAuthUI(){
  document.getElementById('loginBtn')?.addEventListener('click', ()=>openAuth());
  document.getElementById('logoutBtn')?.addEventListener('click', ()=>window.auth.signOut());

  const googleBtn = document.getElementById("googleBtn");
  const emailToggle = document.getElementById("emailToggle");
  const emailForm = document.getElementById("emailForm");
  const closeBtn = document.getElementById("authClose");

  googleBtn?.addEventListener("click", async ()=>{
    try{ await googleSignIn(); }catch(e){ alert(e?.message||"Google sign-in error"); console.error(e); }
  });

  emailToggle?.addEventListener("click", ()=>{
    emailForm?.classList.toggle("hidden");
  });

  closeBtn?.addEventListener("click", closeAuth);

  // click on overlay background closes (but card itself doesn't)
  document.getElementById("authOverlay")?.addEventListener("click", (e)=>{
    if(e.target && e.target.id==="authOverlay") closeAuth();
  });

  document.getElementById("doEmailLogin")?.addEventListener("click", emailLogin);
  document.getElementById("doEmailRegister")?.addEventListener("click", emailRegister);
  document.getElementById("doReset")?.addEventListener("click", resetPass);
}

export async function handleRedirectResultOnce(){
  if(window.__MK_REDIRECT_DONE__) return;
  window.__MK_REDIRECT_DONE__ = true;
  try{
    const res = await window.auth.getRedirectResult();
    if(res && res.user){
      closeAuth();
    }
  }catch(e){
    console.error("[auth] redirect result error", e);
  }
}

export async function googleSignIn(){
  const provider = new firebase.auth.GoogleAuthProvider();
  try{ provider.setCustomParameters({ prompt:"select_account" }); }catch{}

  try{
    await window.auth.signInWithPopup(provider);
    closeAuth();
    return;
  }catch(e){
    const code = e?.code ? String(e.code) : "";
    const fallback = (
      code==="auth/popup-blocked" ||
      code==="auth/popup-closed-by-user" ||
      code==="auth/cancelled-popup-request" ||
      code==="auth/operation-not-supported-in-this-environment"
    );
    if(!fallback) throw e;
  }
  await window.auth.signInWithRedirect(provider);
}

async function emailLogin(){
  const email = (document.getElementById("authEmail")?.value||"").trim();
  const pass  = (document.getElementById("authPass")?.value||"");
  if(!email || !pass) return alert("Zadejte e-mail a heslo");
  await window.auth.signInWithEmailAndPassword(email, pass);
  closeAuth();
}

async function emailRegister(){
  const email = (document.getElementById("authEmail")?.value||"").trim();
  const pass  = (document.getElementById("authPass")?.value||"");
  if(!email || !pass || pass.length<6) return alert("Heslo min. 6 znaků");
  await window.auth.createUserWithEmailAndPassword(email, pass);
  closeAuth();
}

async function resetPass(){
  const email = (document.getElementById("authEmail")?.value||"").trim();
  if(!email) return alert("Zadejte e-mail");
  await window.auth.sendPasswordResetEmail(email);
  alert("Odesláno (zkontrolujte SPAM)");
}
