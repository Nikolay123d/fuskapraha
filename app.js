/* app.js — core logic (auth, chat, DM, friends, profile, payments) */
(function(){
  const S = {};
  let app, auth, db, st;
  let my = { uid:null, nick:'Гість', ava:'public/images/ava.png', vip:false };
  let currentCity = 'praha';
  let dmPeer = null;
  const ADMIN_EMAIL = (window.PF_ADMIN_EMAIL || 'urciknikolaj642@gmail.com');

  function qs(id){ return document.getElementById(id); }
  function toast(s){
    const t = qs('toast'); t.textContent = s; t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), 2500);
  }
  function play(id){ const a=qs(id); if(a) a.play().catch(()=>{}); }

  // UI switching
  document.querySelectorAll('#tabs button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#tabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      qs('view-'+view).classList.add('active');
    });
  });

  // Firebase init
  window.addEventListener('load', async ()=>{
    const cfg = window.PF_CONFIG;
    firebase.initializeApp(cfg);
    app = firebase.app();
    auth = firebase.auth();
    db = firebase.database();
    st = firebase.storage();

    // Ensure adminEmail in settings for rules
    db.ref('settings/adminEmail').set(ADMIN_EMAIL);

    // auth flow
    auth.onAuthStateChanged(async u=>{
      if(!u){ await auth.signInAnonymously(); return; }
      my.uid = u.uid;
      my.nick = u.displayName || my.nick;
      my.ava = u.photoURL || my.ava;

      // Load or init public profile
      const up = await db.ref('usersPublic/'+my.uid).get();
      if(up.exists()){
        const v = up.val()||{};
        my.nick = v.nick || my.nick;
        my.ava  = v.ava  || my.ava;
        my.vip  = !!v.vip;
      }else{
        await db.ref('usersPublic/'+my.uid).set({ nick: my.nick, ava: my.ava, ts: Date.now(), role:'user', vip:false });
      }

      // presence ping
      db.ref('usersPublic/'+my.uid+'/lastSeen').set(firebase.database.ServerValue.TIMESTAMP);

      // UI
      qs('myAva').src = my.ava;
      qs('profAva').src = my.ava;
      qs('profNick').textContent = my.nick;
      qs('profEmail').textContent = u.email || 'анонім';
      qs('vipBadge').style.display = my.vip ? 'inline-block' : 'none';

      // admin visibility
      document.querySelector('.adminBtn').style.display = (u.email === ADMIN_EMAIL) ? 'inline-block' : 'none';
      if(u.email === ADMIN_EMAIL){
        if(window.PF_ADMIN) PF_ADMIN.init(firebase);
        if(window.PF_BOTS) PF_BOTS.startForAdmin(firebase);
      }

      listenCity();
      loadUsersAndFriends();
      initMap();
    });

    // registration timer after 30 minutes
    setTimeout(()=>{ openRegModal('Реєстрація допоможе іншим бачити вас.'); }, 30*60*1000);
  });

  // ----- City chat -----
  function listenCity(){
    const feed = qs('chatFeed');
    feed.innerHTML = '';
    db.ref('messages/'+currentCity).limitToLast(100).on('child_added', snap=>{
      const v = snap.val();
      const d = document.createElement('div'); d.className='msg';
      d.innerHTML = `<img class="avatar" src="${v.ava||'public/images/ava.png'}">
        <div><div class="meta">${v.nick||'Anon'} · ${new Date(v.ts||Date.now()).toLocaleTimeString()}</div>
        ${v.txt?`<div>${escapeHtml(v.txt)}</div>`:''}
        ${v.img?`<div><img class="photo" src="${v.img}"></div>`:''}</div>`;
      feed.appendChild(d);
      feed.scrollTop = feed.scrollHeight;
      if(v.uid !== my.uid) play('sndPing');
    });
  }
  qs('citySel').addEventListener('change', e=>{
    currentCity = e.target.value;
    listenCity();
  });

  // composer send
  qs('chatSend').addEventListener('click', sendChat);
  qs('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });
  async function sendChat(){
    const txt = qs('chatInput').value.trim();
    const file = qs('chatPhoto').files[0];
    if(!txt && !file){ return; }

    // if anonymous -> force registration modal
    if(auth.currentUser && auth.currentUser.isAnonymous){
      openRegModal('Щоб писати — завершіть реєстрацію');
      return;
    }

    if(!my.vip && await checkLimitHit()) return;

    let img = null;
    if(file){
      const id = 'chat_'+Date.now();
      await st.ref('chat/'+my.uid+'/'+id).put(file);
      img = await st.ref('chat/'+my.uid+'/'+id).getDownloadURL();
      incCount('img');
    }
    await db.ref('messages/'+currentCity).push({ uid: my.uid, nick: my.nick, ava: my.ava, txt: txt||null, img, ts: Date.now() });
    qs('chatInput').value=''; qs('chatPhoto').value='';
    incCount('txt');
    play('sndSend');
  }

  // limits (local per-day)
  function todayKey(){ const d=new Date(); return d.toISOString().slice(0,10); }
  function getCounts(){
    try{ return JSON.parse(localStorage.getItem('pf_limits_'+todayKey())||'{"txt":0,"img":0}'); }catch(e){ return {txt:0,img:0}; }
  }
  function setCounts(o){ localStorage.setItem('pf_limits_'+todayKey(), JSON.stringify(o)); }
  function incCount(key){ const o=getCounts(); o[key]=(o[key]||0)+1; setCounts(o); }
  async function checkLimitHit(){
    const o = getCounts();
    const limitTxt = 200, limitImg = 100;
    if(o.txt >= limitTxt || o.img >= limitImg){
      openPayModal('Ліміт вичерпано. Надішліть чек — і ми підтвердимо VIP.');
      return true;
    }
    return false;
  }

  // ----- Friends / Users -----
  async function loadUsersAndFriends(){
    const allBox = qs('allUsers');
    const reqBox = qs('friendReq');
    const frBox  = qs('friendsList');

    db.ref('usersPublic').on('value', snap=>{
      const data = snap.val()||{};
      // all users
      allBox.innerHTML='';
      Object.keys(data).forEach(uid=>{
        const u = data[uid];
        const row = document.createElement('div'); row.className='row';
        row.innerHTML = `<img src="${u.ava||'public/images/ava.png'}">
          <div style="flex:1">
            <div><b>${u.nick||'User'}</b> ${u.vip?'<span class="badge">VIP</span>':''}</div>
            <div class="meta">${u.role||'user'}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button data-act="add">+ Додати</button>
            <button data-act="msg">ЛС</button>
          </div>`;
        row.querySelector('[data-act="add"]').onclick = ()=>db.ref('friendRequests/'+uid+'/'+my.uid).set(true);
        row.querySelector('[data-act="msg"]').onclick = ()=>openDM(uid, u.nick||'User', u.ava||'public/images/ava.png');
        allBox.appendChild(row);
      });
    });

    // requests to me
    db.ref('friendRequests/'+my.uid).on('value', snap=>{
      reqBox.innerHTML='';
      const data = snap.val()||{};
      Object.keys(data).forEach(from=>{
        const r = document.createElement('div'); r.className='row';
        r.innerHTML = `<div style="flex:1"><b>Заявка в друзі</b> від ${from}</div>
          <div style="display:flex;gap:6px">
            <button data-act="ok">Прийняти</button>
            <button data-act="no">Відхилити</button>
          </div>`;
        r.querySelector('[data-act="ok"]').onclick = async ()=>{
          await db.ref('friends/'+my.uid+'/'+from).set(true);
          await db.ref('friends/'+from+'/'+my.uid).set(true);
          await db.ref('friendRequests/'+my.uid+'/'+from).remove();
        };
        r.querySelector('[data-act="no"]').onclick = ()=>db.ref('friendRequests/'+my.uid+'/'+from).remove();
        reqBox.appendChild(r);
      });
    });

    // my friends
    db.ref('friends/'+my.uid).on('value', async snap=>{
      frBox.innerHTML='';
      const data = snap.val()||{};
      const ids = Object.keys(data);
      for(const fid of ids){
        const u = (await db.ref('usersPublic/'+fid).get()).val()||{};
        const row = document.createElement('div'); row.className='row';
        row.innerHTML = `<img src="${u.ava||'public/images/ava.png'}">
          <div style="flex:1">
            <div><b>${u.nick||'User'}</b></div>
            <div class="meta">${fid}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button data-act="msg">ЛС</button>
            <button data-act="rem">Прибрати</button>
          </div>`;
        row.querySelector('[data-act="msg"]').onclick = ()=>openDM(fid, u.nick||'User', u.ava||'public/images/ava.png');
        row.querySelector('[data-act="rem"]').onclick = async ()=>{
          await db.ref('friends/'+my.uid+'/'+fid).remove();
          await db.ref('friends/'+fid+'/'+my.uid).remove();
        };
        frBox.appendChild(row);
      }
    });
  }

  // ----- Profile -----
  qs('saveProfile').addEventListener('click', async ()=>{
    const nick = qs('nickInput').value.trim() || my.nick;
    const url = qs('avaUrlInput').value.trim();
    let ava = my.ava;
    const file = qs('avaFile').files[0];
    if(file){
      const id = 'ava_'+Date.now();
      await st.ref('ava/'+my.uid+'/'+id).put(file);
      ava = await st.ref('ava/'+my.uid+'/'+id).getDownloadURL();
    }else if(url){ ava = url; }
    await auth.currentUser.updateProfile({ displayName:nick, photoURL:ava });
    await db.ref('usersPublic/'+my.uid).update({ nick, ava });
    my.nick = nick; my.ava = ava;
    qs('myAva').src = ava; qs('profAva').src = ava; qs('profNick').textContent = nick;
    toast('Профіль збережено');
  });

  // ----- Payments -----
  qs('buyVip').addEventListener('click', ()=>openPayModal('Завантажте фото оплати і ми підтвердимо VIP'));
  qs('openPay').addEventListener('click', ()=>openPayModal());
  qs('paySend').addEventListener('click', async ()=>{
    const f = qs('payFile').files[0]; if(!f) return;
    const id = 'pay_'+Date.now();
    await st.ref('payments/'+my.uid+'/'+id).put(f);
    await db.ref('payments/inbox/'+my.uid+'/'+id).set({ uid: my.uid, ts: Date.now() });
    closePayModal(); toast('Чек надіслано. Очікуйте підтвердження.');
    // reset local counts
    localStorage.removeItem('pf_limits_'+todayKey());
  });
  qs('payClose').addEventListener('click', closePayModal);

  function openPayModal(msg){ if(msg) toast(msg); qs('payModal').style.display='flex'; }
  function closePayModal(){ qs('payModal').style.display='none'; }

  // ----- Registration modal -----
  function openRegModal(msg){ if(msg) toast(msg); qs('regModal').style.display='flex'; }
  qs('regClose').addEventListener('click', ()=>qs('regModal').style.display='none');
  qs('regDo').addEventListener('click', async ()=>{
    const nick = qs('regNick').value.trim() || 'Користувач';
    const email= qs('regEmail').value.trim();
    const pass = qs('regPass').value;
    if(!email || !pass){ toast('Email та пароль обовʼязкові'); return; }
    try{
      // link anonymous to email/password to keep data
      const credential = firebase.auth.EmailAuthProvider.credential(email, pass);
      await auth.currentUser.linkWithCredential(credential);
      await auth.currentUser.updateProfile({ displayName:nick });
      await db.ref('usersPublic/'+auth.currentUser.uid).update({ nick });
      qs('regModal').style.display='none';
      toast('Готово!');
    }catch(e){
      if(e.code === 'auth/credential-already-in-use'){
        await auth.signOut();
        await auth.signInWithEmailAndPassword(email, pass);
        await auth.currentUser.updateProfile({ displayName:nick });
        await db.ref('usersPublic/'+auth.currentUser.uid).update({ nick });
        qs('regModal').style.display='none';
      }else{
        toast('Помилка: '+(e.message||e.code));
      }
    }
  });

  // ----- Profile modal for others -----
  document.addEventListener('click', e=>{
    const img = e.target.closest('.msg .avatar'); if(!img) return;
    const uid = img.dataset.uid || null;
  });

  // ----- DM -----
  function threadId(a,b){ return [a,b].sort().join('_'); }
  function openDM(uid, name, ava){
    qs('dmHeader').textContent = 'Листування з '+(name||'User');
    const tId = threadId(my.uid, uid);
    const feed = qs('dmThread'); feed.innerHTML='';
    db.ref('privateMessages/'+tId).limitToLast(100).on('child_added', s=>{
      const v = s.val();
      const m = document.createElement('div'); m.className='msg';
      m.innerHTML = `<img class="avatar" src="${v.ava||'public/images/ava.png'}">
        <div><div class="meta">${v.nick||'User'} · ${new Date(v.ts||Date.now()).toLocaleTimeString()}</div>${v.txt||''}${v.img?'<div><img class="photo" src="'+v.img+'"></div>':''}</div>`;
      feed.appendChild(m); feed.scrollTop = feed.scrollHeight;
    });
    qs('dmModal').style.display='flex';
    qs('dmModalSend').onclick = async ()=>{
      const txt = qs('dmModalInput').value.trim();
      const file = qs('dmModalPhoto').files[0];
      if(!txt && !file) return;
      let img=null; if(file){const id='dm_'+Date.now(); await st.ref('dm/'+my.uid+'/'+id).put(file); img=await st.ref('dm/'+my.uid+'/'+id).getDownloadURL();}
      await db.ref('privateMessages/'+tId).push({ uid: my.uid, nick: my.nick, ava: my.ava, txt, img, ts: Date.now() });
      qs('dmModalInput').value=''; qs('dmModalPhoto').value='';
    };
  }
  window.openDM = openDM;
  qs('dmClose').addEventListener('click', ()=>qs('dmModal').style.display='none');

  // Map / Help placeholders
  function initMap(){
    const m = L.map('map', {zoomControl:true}); m.setView([50.087,14.421], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(m);
    // Help grid simple demo
    qs('helpGrid').innerHTML = `<div class="card">Медична допомога — Prague 1</div>
      <div class="card">Юридична консультація — Prague 3</div>`;
  }

  // Utilities
  function escapeHtml(str){
    return (str||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
  }
})();