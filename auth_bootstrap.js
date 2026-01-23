/* auth_bootstrap.js
   Ensures Auth UI works even if the big app.js crashes.
   Requires Firebase compat scripts already loaded.
*/
(function(){
  'use strict';

  function $(id){ return document.getElementById(id); }
  function say(msg){
    const t = String(msg||'');
    try{ if(typeof window.toast === 'function'){ window.toast(t); return; } }catch(e){}
    try{ console.log('[auth]', t); }catch(e){}
    try{ alert(t); }catch(e){}
  }

  function ensureFirebase(){
    if(!window.firebase) throw new Error('Firebase SDK not loaded');
    const cfg = window.FIREBASE_CONFIG || window.firebaseConfig;
    if(!cfg) throw new Error('FIREBASE_CONFIG missing');
    if(!firebase.apps || !firebase.apps.length){
      firebase.initializeApp(cfg);
    }
    return { auth: firebase.auth(), db: firebase.database() };
  }

  function openAuth(mode){
    try{ if(typeof window.openModalAuth === 'function'){ window.openModalAuth(mode||'login'); return; } }catch(e){}
    const m = $('modalAuth');
    if(!m) return;
    m.hidden = false;
    m.dataset.mode = mode||'login';
    document.body.classList.add('auth-open');

    const isLogin = (mode||'login') === 'login';
    const title = $('authTitle'); if(title) title.textContent = isLogin ? 'Přihlášení' : 'Registrace';
    const nr = $('authNickRow'); if(nr) nr.style.display = isLogin ? 'none' : '';
    const rr = $('authRoleRow'); if(rr) rr.style.display = isLogin ? 'none' : '';
    const lb = $('authLoginBtn'); if(lb) lb.style.display = isLogin ? '' : 'none';
    const rb = $('authRegisterBtn'); if(rb) rb.style.display = isLogin ? 'none' : '';
    const sreg = $('authSwitchToRegister'); if(sreg) sreg.style.display = isLogin ? '' : 'none';
    const slog = $('authSwitchToLogin'); if(slog) slog.style.display = isLogin ? 'none' : '';
  }

  function closeAuth(){
    try{ if(typeof window.closeModalAuth === 'function'){ window.closeModalAuth(); return; } }catch(e){}
    const m = $('modalAuth'); if(m) m.hidden = true;
    document.body.classList.remove('auth-open');
  }

  async function ensureUsersPublic(db, u, extra){
    if(!u) return;
    const snap = await db.ref('usersPublic/'+u.uid).get();
    const cur = snap.val() || {};
    const nick = (cur.nick || extra.nick || u.displayName || (u.email?String(u.email).split('@')[0]:'uživatel'));
    const role = cur.role || extra.role || '';
    const avatar = cur.avatar || extra.avatar || window.DEFAULT_AVATAR || './img/default-avatar.svg';
    const merged = {
      email: u.email || cur.email || '',
      nick,
      nickLower: String(nick||'').trim().toLowerCase(),
      role,
      avatar,
      createdAt: cur.createdAt || Date.now()
    };
    await db.ref('usersPublic/'+u.uid).update(merged);
  }

  async function doRegister(){
    const {auth, db} = ensureFirebase();
    const email = String($('authEmail')?.value||'').trim();
    const pass  = String($('authPass')?.value||'');
    const nick  = String($('authNick')?.value||'').trim();
    const role  = String($('authRole')?.value||'').trim();

    if(!email || !pass || pass.length < 6){ say('Zadejte e-mail a heslo (min. 6)'); return; }
    if(!nick){ say('Zadejte přezdívku (nick)'); return; }
    if(!role){ say('Vyberte roli'); return; }

    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await ensureUsersPublic(db, cred.user, {nick, role});
    try{ await db.ref('users/'+cred.user.uid).update({email: email, role: role, plan:'free', planUntil:0, createdAt: Date.now()}); }catch(e){}
    try{ await cred.user.sendEmailVerification(); say('Potvrzovací e-mail odeslán (zkontrolujte SPAM)'); }catch(e){}
    closeAuth();
  }

  async function doLogin(){
    const {auth} = ensureFirebase();
    const email = String($('authEmail')?.value||'').trim();
    const pass  = String($('authPass')?.value||'');
    if(!email || !pass){ say('Zadejte e-mail a heslo'); return; }
    await auth.signInWithEmailAndPassword(email, pass);
    closeAuth();
  }

  async function doGoogle(){
    const {auth, db} = ensureFirebase();
    const provider = new firebase.auth.GoogleAuthProvider();
    try{ provider.addScope('email'); provider.addScope('profile'); }catch(e){}
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
    try{ await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }catch(e){}
    if(isMobile){
      await auth.signInWithRedirect(provider);
      return;
    }
    const res = await auth.signInWithPopup(provider);
    await ensureUsersPublic(db, res.user, {});
    closeAuth();
  }

  async function doReset(){
    const {auth} = ensureFirebase();
    const email = String($('authEmail')?.value||'').trim() || (auth.currentUser ? auth.currentUser.email : '');
    if(!email){ say('Zadejte e-mail'); return; }
    await auth.sendPasswordResetEmail(email);
    say('E-mail pro obnovu odeslán (zkontrolujte SPAM)');
  }

  function wireOnce(id, fn){
    const b = $(id);
    if(!b) return;
    if(b.dataset && b.dataset.wired === '1') return;
    if(b.dataset) b.dataset.wired = '1';
    b.addEventListener('click', fn);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
  // If the main app.js loaded and provides auth handlers, do NOT double-wire buttons here.
  // (Double wiring caused register/login to run twice and the UI looked like it "reset").
  if(typeof window.handleRegister==='function' || typeof window.handleLogin==='function' || typeof window.googleSignIn==='function'){
    wireOnce('btnLogin', ()=>openAuth('login'));
    wireOnce('btnLoginDrawer', ()=>openAuth('login'));
    wireOnce('fabLogin', ()=>openAuth('login'));
    wireOnce('authClose', closeAuth);
    wireOnce('authSwitchToRegister', ()=>openAuth('register'));
    wireOnce('authSwitchToLogin', ()=>openAuth('login'));
    return;
  }

    wireOnce('btnLogin', ()=>openAuth('login'));
    wireOnce('btnLoginDrawer', ()=>openAuth('login'));
    wireOnce('fabLogin', ()=>openAuth('login'));

    wireOnce('authClose', closeAuth);
    wireOnce('authSwitchToRegister', ()=>openAuth('register'));
    wireOnce('authSwitchToLogin', ()=>openAuth('login'));

    wireOnce('authLoginBtn', async ()=>{ try{ await doLogin(); }catch(e){ say(e.message||'Chyba'); } });
    wireOnce('authRegisterBtn', async ()=>{ try{ await doRegister(); }catch(e){ say(e.message||'Chyba'); } });
    wireOnce('authGoogleBtn', async ()=>{ try{ await doGoogle(); }catch(e){ say(e.message||'Chyba'); } });

    wireOnce('authForgotBtn', async ()=>{ try{ await doReset(); }catch(e){ say(e.message||'Chyba'); } });
    wireOnce('authResetPass', async ()=>{ try{ await doReset(); }catch(e){ say(e.message||'Chyba'); } });

    try{
      const {auth, db} = ensureFirebase();
      auth.getRedirectResult().then(async (r)=>{
        if(r && r.user){
          await ensureUsersPublic(db, r.user, {});
          closeAuth();
        }
      }).catch((e)=>{
        const code = String(e?.code||'');
        if(code.includes('unauthorized-domain')){
          say('Google přihlášení: nepovolená doména. Přidejte doménu webu do Firebase Auth → Settings → Authorized domains.');
        } else if(e?.message){
          say(e.message);
        }
      });
    }catch(e){}
  });
})();
