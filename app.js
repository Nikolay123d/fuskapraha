
(function(){
  // Init
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth=firebase.auth(); const db=firebase.database();
  const $=q=>document.querySelector(q);
  const $$=q=>Array.from(document.querySelectorAll(q));
  const citySel=$('#citySelect');
  const toastBox = $('#toast');
  let CURRENT_CITY = localStorage.getItem('city')||'praha';
  citySel.value=CURRENT_CITY;
  citySel.addEventListener('change',()=>{ CURRENT_CITY=citySel.value; localStorage.setItem('city',CURRENT_CITY); resubscribe(); });

  // UI helpers
  function toast(txt){ toastBox.textContent=txt; toastBox.hidden=false; setTimeout(()=>toastBox.hidden=true,2200); }
  function bubbleHTML(m,u){ const name=(u&&u.name)||'Користувач'; const ava=(u&&u.avatar)||window.DEFAULT_AVATAR;
    const img = m.photo? `<div class='text'><img src='${m.photo}'></div>`:'';
    const txt = m.text? `<div class='text'>${escapeHtml(m.text)}</div>`:'';
    return `<div class="msg">
      <div class="ava"><img src="${ava}" alt=""></div>
      <div class="bubble">
        <div class="name" data-uid="${m.by}">${escapeHtml(name)}</div>
        ${img}${txt}
      </div>
    </div>`;
  }
  const escapeHtml = (s='')=>s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Users cache
  const users = {};
  db.ref('usersPublic').on('value', s=>{ Object.assign(users, s.val()||{}); });

  // Auth
  $('#profileBtn').addEventListener('click', ()=> showProfile(true));
  $('#profileClose').addEventListener('click', ()=> showProfile(false));
  $('#btnToggleMenu').addEventListener('click', ()=>{
    const tabs=$('#tabs'); tabs.style.display = (tabs.style.display==='none'?'flex':'none');
  });

  function fillProfile(u){
    const pu = users[u.uid] || {};
    $('#myAvatar').src = pu.avatar || window.DEFAULT_AVATAR;
    $('#myName').value = pu.name || (u.email||'Користувач');
    $('#myAvatarUrl').value = pu.avatar || '';
    $('#myRole').value = (pu.role || 'seeker');
    // bots box visible for admin or premium
    const isAdmin = (u.email===window.ADMIN_EMAIL);
    $('#botsBox').hidden = !isAdmin && (pu.plan!=='premium' && pu.plan!=='premium_plus');
    $('#botHint').textContent = isAdmin ? 'Адмін може ставити інтервал від 2 хв.' : 'Преміум: не частіше 15 хв. на місто';
  }

  function showProfile(show){
    $('#profileModal').hidden = !show;
    if(show && auth.currentUser){ fillProfile(auth.currentUser); }
  }

  $('#btnSaveProfile').addEventListener('click', async()=>{
    const u = auth.currentUser; if(!u) return toast('Спочатку увійдіть');
    const name=$('#myName').value.trim()||'Користувач';
    let avatar=$('#myAvatarUrl').value.trim(); if(!avatar) avatar = window.DEFAULT_AVATAR;
    const role=$('#myRole').value||'seeker';
    await db.ref('usersPublic/'+u.uid).set({name,avatar,role,plan:(users[u.uid]&&users[u.uid].plan)||'none'});
    toast('Збережено');
    $('#myAvatar').src = avatar;
  });

  $('#btnSignout').addEventListener('click', async()=>{ await auth.signOut(); showProfile(false); toast('Вийшли'); });

  // Login silently (anonymous) to enable writes for demo
  auth.onAuthStateChanged(u=>{ if(u){ resubscribe(); } });

  // Streams
  let chatRef=null, rentRef=null;
  function resubscribe(){
    // chat
    $('#chatFeed').innerHTML='';
    if(chatRef){ chatRef.off(); }
    chatRef = db.ref('messages/'+CURRENT_CITY).limitToLast(200);
    chatRef.on('child_added', snap=>{
      const m=snap.val(); const u=users[m.by]||null;
      $('#chatFeed').insertAdjacentHTML('beforeend', bubbleHTML(m,u));
      scrollFeed('#chatFeed');
    });
    // rent
    $('#rentFeed').innerHTML='';
    if(rentRef){ rentRef.off(); }
    rentRef = db.ref('rentMessages/'+CURRENT_CITY).limitToLast(200);
    rentRef.on('child_added', snap=>{
      const m=snap.val(); const u=users[m.by]||null;
      $('#rentFeed').insertAdjacentHTML('beforeend', bubbleHTML(m,u));
      scrollFeed('#rentFeed');
    });
  }
  function scrollFeed(sel){ const el=$(sel); el.scrollTop=el.scrollHeight; }

  // senders
  function readFileAsDataURL(file){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); }); }
  async function sendTo(path, txt, file){
    const u=auth.currentUser; if(!u) return toast('Увійдіть');
    let photo=null;
    if(file){ photo = await readFileAsDataURL(file); }
    if(!photo && txt && /^https?:\/\//i.test(txt)){ photo=txt; txt=null; }
    const obj={by:u.uid, ts:Date.now()}; if(txt) obj.text=txt; if(photo) obj.photo=photo;
    await db.ref(path).push(obj);
  }
  $('#chatSend').addEventListener('click', async()=>{
    await sendTo('messages/'+CURRENT_CITY, $('#chatInput').value.trim(), $('#chatFile').files[0]);
    $('#chatInput').value=''; $('#chatFile').value=''; toast('Надіслано');
  });
  $('#rentSend').addEventListener('click', async()=>{
    await sendTo('rentMessages/'+CURRENT_CITY, $('#rentInput').value.trim(), $('#rentFile').files[0]);
    $('#rentInput').value=''; $('#rentFile').value=''; toast('Опубліковано');
  });

  // participants
  $('#participantsBtn').addEventListener('click', ()=>{ $('#participantsPanel').hidden=false; renderParticipants(); });
  $('#participantsClose').addEventListener('click', ()=> $('#participantsPanel').hidden=true);
  function renderParticipants(){
    const box=$('#participantsList'); box.innerHTML='';
    const all=users||{};
    Object.keys(all).forEach(uid=>{
      const u=all[uid]; const html=`<div class="user">
        <img src="${u.avatar||window.DEFAULT_AVATAR}" class="ava-lg" style="width:32px;height:32px">
        <b>${escapeHtml(u.name||'Користувач')}</b>
        <span class="muted" style="margin-left:auto">${escapeHtml(u.role||'')}</span>
        <button data-dm="${uid}">Написати</button>
      </div>`;
      box.insertAdjacentHTML('beforeend', html);
    });
    box.querySelectorAll('[data-dm]').forEach(btn=> btn.addEventListener('click', (e)=> openDm(btn.getAttribute('data-dm')) ));
  }

  // DMs
  function tid(a,b){ return [a,b].sort().join('_'); }
  let dmRef=null, currentPeer=null;
  function openDm(uid){
    const me=auth.currentUser && auth.currentUser.uid; if(!me) return toast('Спочатку увійдіть');
    currentPeer = uid;
    $('#tabs .tab').forEach?null:0;
    $$('#tabs .tab').forEach(t=>t.classList.remove('active')); $$('[data-tab="dm"]')[0].classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active')); $('#view-dm').classList.add('active');
    $('#dmHeader').textContent = (users[uid] && users[uid].name) || 'Діалог';
    $('#dmMessages').innerHTML='';
    if(dmRef) dmRef.off();
    const path='privateMessages/'+tid(me, uid);
    dmRef=db.ref(path).limitToLast(200);
    dmRef.on('child_added', s=>{
      const m=s.val(); const u = users[m.by]||null;
      $('#dmMessages').insertAdjacentHTML('beforeend', bubbleHTML(m,u));
      scrollFeed('#dmMessages');
    });
  }
  $('#dmSend').addEventListener('click', async()=>{
    const me=auth.currentUser && auth.currentUser.uid; if(!(me&&currentPeer)) return;
    const txt=$('#dmInput').value.trim(); const f=$('#dmFile').files[0];
    let photo=null; if(f){ photo=await readFileAsDataURL(f); }
    if(!photo && /^https?:\/\//i.test(txt)){ photo=txt; }
    const path='privateMessages/'+tid(me,currentPeer);
    const obj={by:me, ts:Date.now()}; if(txt && !photo) obj.text=txt; if(photo) obj.photo=photo;
    await db.ref(path).push(obj); $('#dmInput').value=''; $('#dmFile').value='';
  });

  // map
  let map, mapReady=false;
  function ensureMap(){
    if(mapReady) return;
    map = L.map('map').setView([50.08, 14.43], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution:'&copy; OpenStreetMap'}).addTo(map);
    mapReady=true;
    $('#mapCenter').addEventListener('click', ()=> map.setView([50.08,14.43], 11));
  }
  // tabs
  $('#tabs').addEventListener('click', (e)=>{
    const btn = e.target.closest('.tab'); if(!btn) return;
    $$('#tabs .tab').forEach(t=>t.classList.remove('active')); btn.classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active'));
    const id = 'view-'+btn.getAttribute('data-tab'); $('#'+id).classList.add('active');
    if(id==='view-map') ensureMap();
  });

  // click on name -> open profile quick actions
  document.addEventListener('click', (e)=>{
    const t=e.target.closest('.name'); if(!t) return;
    const uid=t.getAttribute('data-uid'); if(!uid) return;
    openDm(uid);
  });

  // attempt auto sign-in (anonymous) to allow write
  auth.signInAnonymously().catch(()=>{});
})();
