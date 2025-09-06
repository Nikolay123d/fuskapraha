(() => {
  /** Utils */
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const toast = (msg) => {
    const node = document.getElementById('toast');
    node.textContent = msg;
    node.style.display = 'block';
    setTimeout(() => node.style.display = 'none', 1600);
  };

  /** Firebase init */
  const app = firebase.initializeApp(PF.FIREBASE);
  const auth = firebase.auth();
  const db   = firebase.database();
  const st   = firebase.storage();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});

  const state = {
    user: null,
    city: 'Praha',
    view: 'chat',
    photoToSend: { chat: null, rent: null },
    adminEmail: null,
    wpCache: null
  };

  // Load admin email
  db.ref('settings/adminEmail').on('value', snap => {
    state.adminEmail = snap.val();
    checkAdminUI();
  });

  /** Auth UI */
  const authDlg = document.getElementById('authDialog');
  $('#btnLogin').addEventListener('click', () => authDlg.showModal());
  $('#doLogin').addEventListener('click', async () => {
    const email = $('#email').value.trim();
    const pass = $('#pass').value.trim();
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      authDlg.close();
    } catch (e) {
      $('#authErr').textContent = e.message;
    }
  });
  $('#doSignup').addEventListener('click', async () => {
    const email = $('#email').value.trim();
    const pass = $('#pass').value.trim();
    try {
      const res = await auth.createUserWithEmailAndPassword(email, pass);
      // create public profile
      await db.ref('usersPublic/'+res.user.uid).update({
        displayName: email.split('@')[0],
        email
      });
      authDlg.close();
    } catch (e) {
      $('#authErr').textContent = e.message;
    }
  });
  $('#doGoogle').addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
      authDlg.close();
    } catch (e) {
      // fallback redirect if popup blocked
      try {
        await auth.signInWithRedirect(provider);
        $('#authErr').textContent = "Виконую редірект входу…";
      } catch (err2) {
        $('#authErr').textContent = (e && e.message) || String(e);
      }
    }
  });

  $('#btnLogout').addEventListener('click', () => auth.signOut());

  auth.onAuthStateChanged(async (u) => {
    state.user = u;
    $('#btnLogout').style.display = u ? '' : 'none';
    $('#btnLogin').style.display  = u ? 'none' : '';
    $('#userBadge').style.display = u ? '' : 'none';
    $('#userBadge').textContent   = u ? (u.email || u.uid) : '';

    // ensure public profile
    if (u) {
      await db.ref('usersPublic/'+u.uid).update({
        displayName: (u.displayName || (u.email ? u.email.split('@')[0] : 'Користувач')),
        email: u.email || null,
        photoURL: u.photoURL || null
      });
    }
    checkAdminUI();
  });

  function isAdmin() {
    const u = state.user;
    return !!(u && state.adminEmail && u.email && u.email === state.adminEmail);
  }
  function checkAdminUI() {
    const show = isAdmin();
    document.getElementById('adminTab').style.display = show ? '' : 'none';
  }

  /** Tabs / view switch */
  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    state.view = view;
    $$('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-'+view).classList.add('active');
    applyWallpaper(); // re-evaluate for context
  }));

  /** City */
  const citySel = document.getElementById('citySel');
  citySel.addEventListener('change', () => {
    state.city = citySel.value;
    subscribeFeeds();
    applyWallpaper();
  });

  /** Feeds (chat / rent) */
  let chatOff = null, rentOff = null;
  function subscribeFeeds() {
    if (chatOff) chatOff.off();
    if (rentOff) rentOff.off();

    // Chat
    const chatRef = db.ref('messages/'+state.city).limitToLast(50);
    $('#chatList').innerHTML = '';
    chatOff = chatRef;
    chatRef.on('child_added', snap => {
      const m = snap.val() || {};
      const li = document.createElement('li');
      li.className = 'msg';
      const who = m.userDisplayName || m.userEmail || '—';
      const meta = new Date(m.ts || Date.now()).toLocaleString();
      li.innerHTML = `<div class="meta">${who} · ${meta}</div>` +
                     (m.photoURL ? `<img src="${m.photoURL}">` : '') +
                     (m.text ? `<div>${escapeHtml(m.text)}</div>` : '');
      $('#chatList').appendChild(li);
      $('#chatList').scrollTop = 1e9;
    });

    // Rent
    const rentRef = db.ref('rentMessages/'+state.city).limitToLast(50);
    $('#rentList').innerHTML = '';
    rentOff = rentRef;
    rentRef.on('child_added', snap => {
      const m = snap.val() || {};
      const li = document.createElement('li');
      li.className = 'msg';
      const who = m.userDisplayName || m.userEmail || '—';
      const meta = new Date(m.ts || Date.now()).toLocaleString();
      li.innerHTML = `<div class="meta">${who} · ${meta}</div>` +
                     (m.photoURL ? `<img src="${m.photoURL}">` : '') +
                     (m.text ? `<div>${escapeHtml(m.text)}</div>` : '');
      $('#rentList').appendChild(li);
      $('#rentList').scrollTop = 1e9;
    });
  }
  const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  // initial subs
  subscribeFeeds();

  /** Send chat / rent */
  async function uploadFile(file) {
    if (!state.user) throw new Error('Необхідний вхід');
    const path = `uploads/${state.user.uid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const ref = st.ref().child(path);
    await ref.put(file);
    return await ref.getDownloadURL();
  }

  document.getElementById('chatPhotoBtn').addEventListener('click', () => $('#chatPhoto').click());
  document.getElementById('rentPhotoBtn').addEventListener('click', () => $('#rentPhoto').click());

  $('#chatPhoto').addEventListener('change', () => {
    const f = $('#chatPhoto').files[0];
    if (f) { state.photoToSend.chat = f; toast('✔️ Фото додано. Натисніть «Відправити».'); }
  });
  $('#rentPhoto').addEventListener('change', () => {
    const f = $('#rentPhoto').files[0];
    if (f) { state.photoToSend.rent = f; toast('✔️ Фото додано. Натисніть «Опублікувати».'); }
  });

  async function requireAuthGuard() {
    if (auth.currentUser) return true;
    authDlg.showModal();
    throw new Error('Потрібен вхід');
  }

  $('#chatSend').addEventListener('click', async () => {
    try{
      await requireAuthGuard();
      const text = $('#chatInput').value.trim();
      let photoURL = null;
      if (state.photoToSend.chat) {
        photoURL = await uploadFile(state.photoToSend.chat);
        state.photoToSend.chat = null;
      }
      if (!text && !photoURL) return;
      const u = auth.currentUser;
      const pub = (await db.ref('usersPublic/'+u.uid).get()).val() || {};
      await db.ref('messages/'+state.city).push({
        text: text || null,
        photoURL: photoURL || null,
        ts: firebase.database.ServerValue.TIMESTAMP,
        userUid: u.uid,
        userEmail: u.email || null,
        userDisplayName: pub.displayName || u.displayName || (u.email ? u.email.split('@')[0] : '—')
      });
      $('#chatInput').value = '';
      toast('Надіслано');
    }catch(e){ toast(e.message || String(e)); }
  });

  $('#rentSend').addEventListener('click', async () => {
    try{
      await requireAuthGuard();
      const text = $('#rentInput').value.trim();
      let photoURL = null;
      if (state.photoToSend.rent) {
        photoURL = await uploadFile(state.photoToSend.rent);
        state.photoToSend.rent = null;
      }
      if (!text && !photoURL) return;
      const u = auth.currentUser;
      const pub = (await db.ref('usersPublic/'+u.uid).get()).val() || {};
      await db.ref('rentMessages/'+state.city).push({
        text: text || null,
        photoURL: photoURL || null,
        ts: firebase.database.ServerValue.TIMESTAMP,
        userUid: u.uid,
        userEmail: u.email || null,
        userDisplayName: pub.displayName || u.displayName || (u.email ? u.email.split('@')[0] : '—')
      });
      $('#rentInput').value = '';
      toast('Опубліковано');
    }catch(e){ toast(e.message || String(e)); }
  });

  /** Wallpapers precedence resolver
   * settings/wallpapers2 structure:
   *  - global: string URL
   *  - byCity: { [city]: url }
   *  - byContext: { chat|rent|...: url }
   *  - byCityContext: { [city]: { [view]: url } }
   */
  function applyWallpaper() {
    const city = state.city;
    const view = state.view;
    if (!state.wpCache) {
      db.ref('settings/wallpapers2').on('value', snap => {
        state.wpCache = snap.val() || {};
        pickAndSet();
        dumpWallpapers();
      });
    } else {
      pickAndSet();
    }

    function pickAndSet(){
      const wp = state.wpCache || {};
      const byCityCtx = (wp.byCityContext && wp.byCityContext[city] && wp.byCityContext[city][view]) || null;
      const byCtx = (wp.byContext && wp.byContext[view]) || null;
      const byCity = (wp.byCity && wp.byCity[city]) || null;
      const global = wp.global || null;
      const url = byCityCtx || byCtx || byCity || global || 'assets/img/bg.jpg';
      document.body.style.backgroundImage = `url('${url}')`;
    }
  }
  applyWallpaper();

  function dumpWallpapers(){
    db.ref('settings/wallpapers2').get().then(snap => {
      $('#wpDump').textContent = JSON.stringify(snap.val() || {}, null, 2);
    }).catch(()=>{});
  }

  /** Admin wallpaper form */
  $('#btnSaveGlobal').addEventListener('click', async () => {
    if (!isAdmin()) return toast('Тільки адмін');
    const url = $('#wpUrl').value.trim(); if (!url) return;
    await db.ref('settings/wallpapers2/global').set(url);
    toast('Збережено global');
    dumpWallpapers(); applyWallpaper();
  });
  $('#btnSaveCity').addEventListener('click', async () => {
    if (!isAdmin()) return toast('Тільки адмін');
    const url = $('#wpUrl').value.trim(); if (!url) return;
    const city = $('#wpCitySel').value.trim(); if (!city) return toast('Оберіть місто');
    await db.ref('settings/wallpapers2/byCity/'+city).set(url);
    toast('Збережено byCity');
    dumpWallpapers(); applyWallpaper();
  });
  $('#btnSaveContext').addEventListener('click', async () => {
    if (!isAdmin()) return toast('Тільки адмін');
    const url = $('#wpUrl').value.trim(); if (!url) return;
    const view = $('#wpViewSel').value.trim(); if (!view) return toast('Оберіть view');
    await db.ref('settings/wallpapers2/byContext/'+view).set(url);
    toast('Збережено byContext');
    dumpWallpapers(); applyWallpaper();
  });
  $('#btnSaveCityContext').addEventListener('click', async () => {
    if (!isAdmin()) return toast('Тільки адмін');
    const url = $('#wpUrl').value.trim(); if (!url) return;
    const view = $('#wpViewSel').value.trim(); if (!view) return toast('Оберіть view');
    const city = $('#wpCitySel').value.trim(); if (!city) return toast('Оберіть місто');
    await db.ref('settings/wallpapers2/byCityContext/'+city+'/'+view).set(url);
    toast('Збережено byCityContext');
    dumpWallpapers(); applyWallpaper();
  });

  // Upload image to Storage and fill URL
  $('#btnUploadWP').addEventListener('click', async () => {
    if (!isAdmin()) return toast('Тільки адмін');
    const f = $('#wpFile').files[0];
    if (!f) return toast('Оберіть файл');
    try {
      const path = `wallpapers/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const ref = st.ref().child(path);
      await ref.put(f);
      const url = await ref.getDownloadURL();
      $('#wpUrl').value = url;
      $('#wpUploadStatus').textContent = 'URL отримано. Натисніть потрібну кнопку збереження.';
      toast('✔️ Завантажено');
    } catch (e) {
      $('#wpUploadStatus').textContent = e.message || String(e);
    }
  });

  /** Diagnostics */
  $('#btnDiagDB').addEventListener('click', async () => {
    try{
      const snap = await db.ref('settings/adminEmail').get();
      $('#diagOut').textContent = snap.exists() ? ('adminEmail: '+snap.val()) : 'settings/adminEmail не задано';
    }catch(e){ $('#diagOut').textContent = e.message || String(e); }
  });
  $('#btnDiagAuth').addEventListener('click', async () => {
    try{
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        const res = await auth.signInWithPopup(provider);
        $('#diagOut').textContent = 'Google OK: '+(res.user.email||res.user.uid);
      } catch(popErr){
        await auth.signInWithRedirect(provider);
        $('#diagOut').textContent = 'Виконую redirect входу…';
      }
    }catch(e){ $('#diagOut').textContent = e.message || String(e); }
  });

})();