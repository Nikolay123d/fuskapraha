// --- INIT ---
const app = firebase.initializeApp(window.firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// Session persistence (LOCAL -> fallback SESSION)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {
  auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
});

// --- DOM helpers ---
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const byId = (id) => document.getElementById(id);
const toast = (msg) => {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.bottom = '24px';
  el.style.transform = 'translateX(-50%)';
  el.style.background = '#2a3340';
  el.style.color = '#fff';
  el.style.padding = '10px 14px';
  el.style.borderRadius = '10px';
  el.style.border = '1px solid #3a4555';
  el.style.zIndex = '9999';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
};

const play = (id) => byId(id)?.play().catch(()=>{});

// --- State ---
let currentUser = null;
let currentCity = 'Praha';
let isAdmin = false;

// --- UI wiring ---
const tabs = $$('.tab');
tabs.forEach(b => b.addEventListener('click', () => {
  tabs.forEach(t => t.classList.remove('active'));
  b.classList.add('active');
  const tab = b.getAttribute('data-tab');
  $$('.view').forEach(v => v.classList.remove('active'));
  byId('view-' + tab).classList.add('active');
  if (tab === 'map') resizeMap();
}));

byId('citySelect').addEventListener('change', (e) => {
  currentCity = e.target.value;
  loadChat();
});

byId('btnLogin').addEventListener('click', () => {
  openAuth();
});

byId('btnProfile').addEventListener('click', () => openProfile());

byId('btnBell').addEventListener('click', () => {
  byId('bellDot').classList.add('hidden');
});

// Auth modal
const authModal = byId('authModal');
function openAuth() { authModal.classList.remove('hidden'); }
byId('closeAuth').addEventListener('click', () => authModal.classList.add('hidden'));

const authTabs = $$('#authModal .tab.small');
authTabs.forEach(b => b.addEventListener('click', () => {
  authTabs.forEach(t => t.classList.remove('active'));
  b.classList.add('active');
  const mode = b.getAttribute('data-auth');
  byId('formLogin').classList.toggle('hidden', mode !== 'login');
  byId('formSignup').classList.toggle('hidden', mode !== 'signup');
}));

// Login/Signup
byId('doLogin').addEventListener('click', async () => {
  const email = byId('loginEmail').value.trim();
  const pass = byId('loginPass').value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    authModal.classList.add('hidden');
  } catch (e) {
    alert('Помилка входу: ' + e.message);
  }
});

byId('doGoogle').addEventListener('click', async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
    } catch (e) {
      await auth.signInWithRedirect(provider);
    }
    authModal.classList.add('hidden');
  } catch (e) {
    alert('Google: ' + e.message);
  }
});

byId('doSignup').addEventListener('click', async () => {
  const email = byId('suEmail').value.trim();
  const pass = byId('suPass').value;
  const nick = byId('suNick').value.trim() || email.split('@')[0];
  const lang = byId('suLang').value || 'uk';
  try {
    const { user } = await auth.createUserWithEmailAndPassword(email, pass);
    await user.sendEmailVerification().catch(()=>{});
    const uid = user.uid;
    // public profile + email -> uid map
    await db.ref('usersPublic/' + uid).set({
      uid, email, nickname: nick, avatar: '', city: currentCity, lang, ts: Date.now()
    });
    const safeEmail = email.replace(/[.#$\[\]@]/g, '_');
    await db.ref('emailToUid/' + safeEmail).set(uid);
    toast('Реєстрація успішна! Підтверди email.');
    authModal.classList.add('hidden');
  } catch (e) {
    alert('Помилка реєстрації: ' + e.message);
  }
});

// --- Auth state ---
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (!user) {
    byId('btnLogin').classList.remove('hidden');
    byId('btnProfile').classList.add('hidden');
    byId('adminTab').classList.add('hidden');
    isAdmin = false;
  } else {
    byId('btnLogin').classList.add('hidden');
    byId('btnProfile').classList.remove('hidden');
    // Load profile
    const snap = await db.ref('usersPublic/' + user.uid).once('value');
    const p = snap.val() || {};
    if (p.avatar) byId('avatarImg').src = p.avatar;
    currentCity = p.city || currentCity;
    byId('citySelect').value = currentCity;
    // admin
    const adminEmailSnap = await db.ref('settings/adminEmail').once('value');
    isAdmin = adminEmailSnap.val() && adminEmailSnap.val().toLowerCase() === user.email.toLowerCase();
    byId('adminTab').classList.toggle('hidden', !isAdmin);
    // listeners
    loadChat();
    loadFriends();
    loadHelp();
    setupDM();
    setupMap();
  }
});

// --- Chat ---
let chatPhotoUrl = null;
byId('chatPick').addEventListener('click', () => byId('chatPhoto').click());
byId('chatPhoto').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file || !currentUser) return;
  const ref = storage.ref().child(`uploads/${currentUser.uid}/${Date.now()}_${file.name}`);
  await ref.put(file);
  chatPhotoUrl = await ref.getDownloadURL();
  toast('✔️ Фото додано…');
});

byId('chatSend').addEventListener('click', async () => {
  if (!currentUser) return openAuth();
  if (!auth.currentUser.emailVerified) {
    alert('Підтвердь email для відправки повідомлень.');
    return;
  }
  const text = byId('chatInput').value.trim();
  if (!text && !chatPhotoUrl) return;
  const uid = currentUser.uid;
  const pub = (await db.ref('usersPublic/' + uid).once('value')).val() || {};
  const msg = {
    uid, nickname: pub.nickname || currentUser.email, avatar: pub.avatar || '', city: currentCity,
    text, photoUrl: chatPhotoUrl || '', ts: Date.now()
  };
  await db.ref(`messages/${currentCity}`).push(msg);
  byId('chatInput').value = '';
  chatPhotoUrl = null;
  byId('chatPhoto').value = '';
  play('sndSend');
});

let chatRef = null;
function loadChat() {
  if (chatRef) chatRef.off();
  byId('chatList').innerHTML = '';
  chatRef = db.ref(`messages/${currentCity}`).limitToLast(200);
  chatRef.on('child_added', (snap) => {
    const m = snap.val();
    addMessage(byId('chatList'), m, m.uid === (currentUser?.uid || ''));
    if (m.uid !== (currentUser?.uid || '')) {
      byId('bellDot').classList.remove('hidden');
      play('sndPing');
    }
  });
}
function addMessage(container, m, mine=false) {
  const div = document.createElement('div');
  div.className = 'item';
  const who = `${m.nickname || 'Anon'} · ${new Date(m.ts).toLocaleString()}`;
  div.innerHTML = `<div class="meta">${who}</div>${m.text ? `<div>${m.text}</div>`:''}${m.photoUrl ? `<img class="msg-photo" src="${m.photoUrl}">`:''}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// --- Friends ---
async function emailToUid(email) {
  if (!email) return null;
  const safe = email.replace(/[.#$\[\]@]/g, '_');
  const snap = await db.ref('emailToUid/' + safe).once('value');
  return snap.val();
}

byId('btnAddFriend').addEventListener('click', async () => {
  if (!currentUser) return openAuth();
  const email = byId('addFriendEmail').value.trim().toLowerCase();
  if (!email) return;
  const uid = await emailToUid(email);
  if (!uid) return toast('Користувача не знайдено');
  if (uid === currentUser.uid) return toast('Це ти :)');
  await db.ref(`friendRequests/${uid}/${currentUser.uid}`).set({ from: currentUser.uid, ts: Date.now() });
  toast('Заявка відправлена');
});

function renderRequest(container, uid, data, incoming) {
  const wrap = document.createElement('div');
  wrap.className = 'item';
  wrap.innerHTML = `<div class="row"><span>Запит від: ${uid.slice(0,6)}…</span></div>`;
  if (incoming) {
    const accept = document.createElement('button'); accept.className='btn small'; accept.textContent='Прийняти';
    const decline = document.createElement('button'); decline.className='btn small outline'; decline.textContent='Відхилити';
    accept.onclick = async () => {
      await db.ref(`friends/${currentUser.uid}/${uid}`).set(true);
      await db.ref(`friends/${uid}/${currentUser.uid}`).set(true);
      await db.ref(`friendRequests/${currentUser.uid}/${uid}`).remove();
    };
    decline.onclick = async () => { await db.ref(`friendRequests/${currentUser.uid}/${uid}`).remove(); };
    const row = document.createElement('div'); row.className='row'; row.append(accept, decline);
    wrap.append(row);
  } else {
    const cancel = document.createElement('button'); cancel.className='btn small outline'; cancel.textContent='Скасувати';
    cancel.onclick = async () => { await db.ref(`friendRequests/${uid}/${currentUser.uid}`).remove(); };
    const row = document.createElement('div'); row.className='row'; row.append(cancel); wrap.append(row);
  }
  container.append(wrap);
}

let frInRef=null, frOutRef=null, frListRef=null;
function loadFriends() {
  // incoming
  const incoming = byId('incomingReqs'); incoming.innerHTML='';
  if (frInRef) frInRef.off();
  frInRef = db.ref(`friendRequests/${currentUser.uid}`);
  frInRef.on('value', (snap) => {
    incoming.innerHTML='';
    snap.forEach(ch => renderRequest(incoming, ch.key, ch.val(), true));
  });
  // outgoing
  const outgoing = byId('outgoingReqs'); outgoing.innerHTML='';
  if (frOutRef) frOutRef.off();
  frOutRef = db.ref('friendRequests');
  frOutRef.on('value', (snap) => {
    outgoing.innerHTML='';
    snap.forEach(node => {
      node.forEach(ch => {
        if (ch.key === currentUser.uid) {
          renderRequest(outgoing, node.key, ch.val(), false);
        }
      });
    });
  });
  // friends list
  const fl = byId('friendsList'); fl.innerHTML='';
  if (frListRef) frListRef.off();
  frListRef = db.ref(`friends/${currentUser.uid}`);
  frListRef.on('value', async (snap) => {
    fl.innerHTML='';
    const val = snap.val() || {};
    for (const uid of Object.keys(val)) {
      const pub = (await db.ref('usersPublic/'+uid).once('value')).val() || {};
      const item = document.createElement('div');
      item.className='item';
      item.innerHTML = `<div class="row" style="align-items:center; gap:.5rem;">
        <img src="${pub.avatar || 'assets/ava.png'}" style="width:28px;height:28px;border-radius:50%;border:1px solid #2a3340;">
        <div style="flex:1;">${pub.nickname || (pub.email || uid)}</div>
        <button class="btn small">Написати</button>
      </div>`;
      item.querySelector('button').onclick = () => openDM(uid);
      fl.appendChild(item);
    }
  });
}

// --- DMs ---
let currentDMUid = null;
let dmRef = null;

async function setupDM() {
  // sidebar of friends
  const sidebar = byId('dmSidebar'); sidebar.innerHTML='';
  const snap = await db.ref(`friends/${currentUser.uid}`).once('value');
  const fr = snap.val() || {};
  for (const uid of Object.keys(fr)) {
    const pub = (await db.ref('usersPublic/'+uid).once('value')).val() || {};
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.textContent = pub.nickname || pub.email || uid;
    btn.onclick = () => openDM(uid);
    sidebar.appendChild(btn);
  }
}

function pairId(a,b){ return [a,b].sort().join('_'); }

async function openDM(uid){
  currentDMUid = uid;
  byId('dmList').innerHTML='';
  const pub = (await db.ref('usersPublic/'+uid).once('value')).val() || {};
  byId('dmHeader').textContent = 'ЛС з: ' + (pub.nickname || pub.email || uid);
  if (dmRef) dmRef.off();
  dmRef = db.ref('dms/' + pairId(currentUser.uid, uid)).limitToLast(200);
  dmRef.on('child_added', (snap) => {
    const m = snap.val();
    addMessage(byId('dmList'), m, m.uid === currentUser.uid);
    if (m.uid !== currentUser.uid) { byId('bellDot').classList.remove('hidden'); play('sndPing'); }
  });
}

let dmPhotoUrl=null;
byId('dmPick').addEventListener('click', () => byId('dmPhoto').click());
byId('dmPhoto').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file || !currentUser) return;
  const ref = storage.ref().child(`uploads/${currentUser.uid}/${Date.now()}_${file.name}`);
  await ref.put(file);
  dmPhotoUrl = await ref.getDownloadURL();
  toast('✔️ Фото додано…');
});

byId('dmSend').addEventListener('click', async () => {
  if (!currentUser) return openAuth();
  if (!currentDMUid) return toast('Обери друга');
  const text = byId('dmInput').value.trim();
  if (!text && !dmPhotoUrl) return;
  const pub = (await db.ref('usersPublic/' + currentUser.uid).once('value')).val() || {};
  const msg = { uid: currentUser.uid, nickname: pub.nickname || currentUser.email, avatar: pub.avatar || '', text, photoUrl: dmPhotoUrl || '', ts: Date.now() };
  await db.ref('dms/' + pairId(currentUser.uid, currentDMUid)).push(msg);
  byId('dmInput').value='';
  dmPhotoUrl = null; byId('dmPhoto').value='';
  play('sndSend');
});

// --- Help feed ---
let helpRef=null;
function loadHelp() {
  if (helpRef) helpRef.off();
  const container = byId('helpFeed'); container.innerHTML='';
  helpRef = db.ref('helpFeed').limitToLast(200);
  helpRef.on('child_added', (snap) => {
    const p = snap.val();
    const div = document.createElement('div');
    div.className='item';
    const who = `${p.botName || 'Helper'} · ${new Date(p.ts).toLocaleString()}`;
    div.innerHTML = `<div class="meta">${who}</div>${p.text ? `<div>${p.text}</div>`:''}${p.photoUrl ? `<img class="msg-photo" src="${p.photoUrl}">`:''}`;
    container.appendChild(div); container.scrollTop = container.scrollHeight;
  });
}

byId('btnPostHelp').addEventListener('click', async () => {
  if (!isAdmin) return toast('Тільки адмін');
  const botName = byId('botName').value.trim() || 'PrahaHelp';
  const botAvatar = byId('botAvatar').value.trim() || '';
  const text = byId('botText').value.trim();
  const photoUrl = byId('botPhoto').value.trim() || '';
  if (!text) return;
  await db.ref('helpFeed').push({ botName, botAvatar, text, photoUrl, ts: Date.now() });
  byId('botText').value=''; byId('botPhoto').value='';
  toast('Опубліковано');
});

// --- Map ---
let leafletMap = null;
let markersLayer = null;
function setupMap() {
  if (leafletMap) return;
  leafletMap = L.map('map').setView([50.0755, 14.4378], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(leafletMap);
  markersLayer = L.layerGroup().addTo(leafletMap);
  db.ref('map/points').on('value', (snap) => {
    markersLayer.clearLayers();
    const val = snap.val() || {};
    Object.values(val).forEach(p => {
      const m = L.marker([p.lat, p.lng]).addTo(markersLayer);
      const img = p.photoUrl ? `<br><img src="${p.photoUrl}" style="width:100px;border-radius:8px;margin-top:6px;">` : '';
      m.bindPopup(`<b>${p.title||'Точка'}</b><br>${p.desc||''}${img}`);
    });
  });
}
function resizeMap(){ setTimeout(()=> leafletMap && leafletMap.invalidateSize(), 50); }

byId('btnAddPoint').addEventListener('click', async () => {
  if (!isAdmin) return toast('Тільки адмін');
  const title = byId('pointTitle').value.trim();
  const lat = parseFloat(byId('pointLat').value);
  const lng = parseFloat(byId('pointLng').value);
  const desc = byId('pointDesc').value.trim();
  const photoUrl = byId('pointPhoto').value.trim();
  if (!title || isNaN(lat) || isNaN(lng)) return toast('Заповни поля');
  await db.ref('map/points').push({ city: currentCity, title, lat, lng, desc, photoUrl, ts: Date.now(), by: currentUser.uid });
  toast('Додано');
});

// --- Profile modal (quick) ---
function openProfile(){
  const uid = currentUser?.uid;
  if (!uid) return openAuth();
  // very small inline profile
  const modal = document.createElement('div');
  modal.className='modal';
  modal.innerHTML = `<div class="modal-content">
    <h2>Профіль</h2>
    <div class="row">
      <input id="pfNick" class="input" placeholder="Нік">
      <input id="pfAvatar" class="input" placeholder="URL аватарки">
    </div>
    <div class="row">
      <select id="pfCity" class="input">
        ${['Praha','Brno','Ostrava','Plzeň','Liberec','Olomouc','České Budějovice','Hradec Králové'].map(c=>`<option>${c}</option>`).join('')}
      </select>
      <select id="pfLang" class="input"><option value="uk">Українська</option><option value="cs">Čeština</option></select>
    </div>
    <div class="row">
      <button id="pfSave" class="btn">Зберегти</button>
      <button id="pfClose" class="btn outline">Закрити</button>
      <button id="pfLogout" class="btn outline">Вийти</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  // load
  db.ref('usersPublic/'+uid).once('value').then(s=>{
    const p = s.val() || {};
    byId('pfNick').value = p.nickname || '';
    byId('pfAvatar').value = p.avatar || '';
    byId('pfCity').value = p.city || currentCity;
    byId('pfLang').value = p.lang || 'uk';
  });
  modal.querySelector('#pfClose').onclick = ()=> modal.remove();
  modal.querySelector('#pfLogout').onclick = async ()=> { await auth.signOut(); modal.remove(); };
  modal.querySelector('#pfSave').onclick = async ()=> {
    const nickname = byId('pfNick').value.trim() || currentUser.email;
    const avatar = byId('pfAvatar').value.trim();
    const city = byId('pfCity').value;
    const lang = byId('pfLang').value;
    await db.ref('usersPublic/'+uid).update({nickname, avatar, city, lang, ts: Date.now()});
    if (avatar) byId('avatarImg').src = avatar;
    byId('citySelect').value = city; currentCity = city; loadChat();
    modal.remove();
    toast('Збережено');
  };
}

// --- Bell notifications for new DMs ---
db.ref('dms').limitToLast(1).on('child_added', ()=>{}); // warm-up to reduce initial ping storms

// --- End ---
