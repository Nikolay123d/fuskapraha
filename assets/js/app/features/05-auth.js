// === AUTH UI ===

// === Auth UI (Email/Password + Google) ===
function openModalAuth(mode='login'){
  const m = $('#modalAuth'); if(!m) return;

  // Keep main preloader flow stable; auth will appear after it hides.

  document.body.classList.add('auth-open');
  m.hidden=false;
  // Mobile UX: when auth modal is opened from chat/DM, the browser may
  // auto-restore focus to the email input and pop the keyboard.
  // We explicitly blur any focused element so the keyboard doesn't hijack the screen.
  try{ document.activeElement?.blur?.(); }catch(e){}
  m.dataset.mode = mode;
  try{ m.classList.add('open'); }catch(e){}
  try{ startAuthHeroRotator(); }catch(e){} 
  $('#authTitle').textContent = (mode==='login' ? 'Přihlášení' : 'Registrace');
  $('#authNickRow').style.display = (mode==='register' ? '' : 'none');
  $('#authRoleRow').style.display = (mode==='register' ? '' : 'none');
  $('#authLoginBtn').style.display = (mode==='login' ? '' : 'none');
  $('#authRegisterBtn').style.display = (mode==='register' ? '' : 'none');
  $('#authSwitchToRegister').style.display = (mode==='login' ? '' : 'none');
  $('#authSwitchToLogin').style.display = (mode==='register' ? '' : 'none');
}
function closeModalAuth(){
  const m=$('#modalAuth');
  if(m) m.hidden=true;
  try{ m.classList.remove('open'); }catch(e){}
  document.body.classList.remove('auth-open');
}

// --- Google Auth (Popup first for GitHub Pages; Redirect fallback) ---
async function googleSignIn(){
  const provider = new firebase.auth.GoogleAuthProvider();
  // Force account picker (prevents silent bounce-back when multiple accounts exist)
  try{ provider.setCustomParameters({ prompt: 'select_account' }); }catch(_e){}

  // POPUP first (best for GitHub Pages). If popup is blocked, fall back to redirect.
  try{
    await (window.__AUTH_PERSIST_PROMISE__ || Promise.resolve());
    await firebase.auth().signInWithPopup(provider);
    return;
  }catch(e){
    const code = (e && e.code) ? String(e.code) : '';
    // Popup blocked/unsupported -> fallback to redirect
    const shouldFallback = (
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/operation-not-supported-in-this-environment'
    );
    if(!shouldFallback){
      // Real auth error
      throw e;
    }
  }

  // Redirect fallback (useful on mobile browsers that block popups)
  await (window.__AUTH_PERSIST_PROMISE__ || Promise.resolve());
  await firebase.auth().signInWithRedirect(provider);
}

