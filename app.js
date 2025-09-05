// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const db = fb.db, auth = fb.auth, storage = fb.storage();
const state = {
  city: window.PF.DEFAULT_CITY || "Praha",
  user: null,
  chatPhotoUrl: null,
  rentPhotoUrl: null,
  dmPhotoUrl: null,
  dmPeer: null, // uid
  users: {},
  lang: localStorage.getItem('pf_lang') || 'uk',
};

function toast(text){
  const t = $("#toast");
  t.textContent = text;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 1800);
}

// UI i18n dictionary for interface (uk/cs)
const i18n = {
  uk: {
    msgAdded: "Фото успішно додано. Відправте — з’явиться у стрічці.",
    dmAdded: "Фото додано в діалог.",
    friendAdded: "Успішно додано в друзі",
    needLogin: "Спочатку увійдіть",
  },
  cs: {
    msgAdded: "Fotka byla úspěšně přidána. Po odeslání se objeví v feedu.",
    dmAdded: "Fotka byla přidána do dialogu.",
    friendAdded: "Úspěšně přidán do přátel",
    needLogin: "Nejprve se přihlaste",
  }
};
function tkey(k){ return (i18n[state.lang]||i18n.uk)[k] || k; }

// ---------- Auth ----------
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>auth.setPersistence(firebase.auth.Auth.Persistence.SESSION));

auth.onAuthStateChanged(async(user)=>{
  state.user = user || null;
  $("#btnGoogle").style.display = user ? "none" : "";
  $("#btnEmail").style.display = user ? "none" : "";
  $(".adminOnly")?.style; // noop

  if(user){
    // write public profile
    const prof = {
      displayName: user.displayName || (user.email? user.email.split('@')[0]: "User"),
      photoURL: user.photoURL || "",
      email: user.email || "",
      lang: state.lang
    };
    await db.ref("usersPublic/"+user.uid).update(prof);

    // admin controls visible?
    const isAdmin = window.isAdminEmail(user.email);
    $$(".adminOnly").forEach(el=> el.style.display = isAdmin? "" : "none");

    // notifications count
    db.ref("notifications/"+user.uid).on("value", s=>{
      const cnt = s.exists()? Object.keys(s.val()).length : 0;
      $("#notifCount").textContent = cnt;
    });

    // auto-friend admin (if not me)
    if(!isAdmin && window.PF.ADMIN_EMAIL){
      const usersSnap = await db.ref("usersPublic").get();
      let adminUid = null;
      usersSnap.forEach(ch=>{ if((ch.val().email||"").toLowerCase() === window.PF.ADMIN_EMAIL.toLowerCase()) adminUid = ch.key; });
      if(adminUid){
        await db.ref(`friends/${user.uid}/${adminUid}`).set({ts:Date.now()});
        await db.ref(`friends/${adminUid}/${user.uid}`).set({ts:Date.now()});
      }
    }

    closeModal("#authModal");
  }
});

// Google login buttons
$("#btnGoogle").addEventListener("click", ()=> openModal("#authModal"));
$("#btnEmail").addEventListener("click", ()=> openModal("#authModal"));
$("#doGoogle").addEventListener("click", async()=>{
  try{
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  }catch(e){
    // Popup blocked or invalid credentials: fallback to redirect
    try{
      await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
    }catch(e2){
      alert("Google увійти не вдалось. Дозвольте попапи та додайте github.io до Authorized Domains у Firebase Auth.");
    }
  }
});
auth.getRedirectResult().catch(()=>{});

// Email login/register
$("#doLogin").addEventListener("click", async()=>{
  const em = $("#loginEmail").value.trim(), pw = $("#loginPass").value;
  try{ await auth.signInWithEmailAndPassword(em,pw); }
  catch(e){ alert("Помилка входу: "+e.message); }
});
$("#doReset").addEventListener("click", async()=>{
  const em = $("#loginEmail").value.trim();
  if(!em) return alert("Вкажіть email");
  try{ await auth.sendPasswordResetEmail(em); toast("Лист для скидання пароля відправлено"); }
  catch(e){ alert("Помилка: "+e.message); }
});
$("#doRegister").addEventListener("click", async()=>{
  const nick=$("#regNick").value.trim(), em=$("#regEmail").value.trim(), pw=$("#regPass").value, lang=$("#regLang").value;
  try{
    const cred = await auth.createUserWithEmailAndPassword(em,pw);
    await cred.user.updateProfile({displayName:nick});
    state.lang = lang; localStorage.setItem("pf_lang", lang);
    await db.ref("usersPublic/"+cred.user.uid).set({displayName:nick,email:em,photoURL:"",lang});
    toast("Готово, ви увійшли");
    closeModal("#authModal");
  }catch(e){ alert("Помилка реєстрації: "+e.message); }
});

// Modal tab switch
$$('[data-auth-tab]').forEach(btn=>btn.addEventListener('click', ()=>{
  $$('.tabs.small .tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const tab = btn.getAttribute('data-auth-tab');
  $$('.authPane').forEach(p=>p.classList.remove('show'));
  $("#auth"+tab.charAt(0).toUpperCase()+tab.slice(1)).classList.add('show');
}));

// --------- Cities ---------
async function loadCities(){
  const res = await fetch("cities.json"); const data = await res.json();
  const list = data.list || []; state.city = data.default || window.PF.DEFAULT_CITY || "Praha";
  const sel = $("#citySelect"); sel.innerHTML = list.map(c=>`<option ${c===state.city?'selected':''}>${c}</option>`).join("");
  sel.addEventListener("change", ()=>{ state.city = sel.value; attachChat(); attachRent(); loadMap(); loadHelp(); applyWallpaper(); });
}
loadCities();

// --------- Tabs ---------
$$('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  const id = btn.getAttribute('data-tab');
  $$('.tabPage').forEach(p=>p.classList.remove('show'));
  $("#tab-"+id).classList.add('show');
}));

// ---------- Modals ----------
function openModal(sel){ $(sel).classList.remove("hidden"); }
function closeModal(sel){ $(sel).classList.add("hidden"); }
$$('.modal [data-close]').forEach(b=>b.addEventListener('click', e=> closeModal('#'+e.target.closest('.modal').id)));
$("#profileBtn").addEventListener("click", ()=> openModal("#profileModal"));

// ---------- Profile ----------
$("#saveProfile").addEventListener("click", async()=>{
  if(!state.user) return alert("Увійдіть");
  const lang = $("#profileLang").value;
  const avatar = $("#profileAvatar").value.trim();
  state.lang = lang; localStorage.setItem('pf_lang', lang);
  await db.ref("usersPublic/"+state.user.uid).update({lang, photoURL: avatar});
  toast("Збережено");
});
$("#logoutBtn").addEventListener("click", ()=> auth.signOut());

// ---------- Wallpaper ----------
async function applyWallpaper(){
  const city = state.city;
  const g = await db.ref("settings/wallpapers/global").get();
  const c = await db.ref("settings/wallpapers/city/"+city).get();
  const url = (c.exists() && c.val()) || (g.exists() && g.val()) || "assets/bg.png";
  document.body.style.backgroundImage = `url('${url}')`;
}
$("#saveBgGlobal").addEventListener("click", async()=>{
  if(!state.user || !window.isAdminEmail(state.user.email)) return alert("Тільки адмін");
  await db.ref("settings/wallpapers/global").set($("#bgGlobalUrl").value.trim());
  applyWallpaper(); toast("Глобальні обої збережено");
});
$("#saveBgCity").addEventListener("click", async()=>{
  if(!state.user || !window.isAdminEmail(state.user.email)) return alert("Тільки адмін");
  await db.ref("settings/wallpapers/city/"+state.city).set($("#bgCityUrl").value.trim());
  applyWallpaper(); toast("Обої для міста збережено");
});

// ---------- Users list / Friends ----------
db.ref("usersPublic").on("value", s=>{
  state.users = s.val() || {};
  const list = Object.entries(state.users);
  $("#usersList").innerHTML = list.map(([uid,u])=>`<div class="item">
    <span>${u.displayName||'User'} <small>${u.email||''}</small></span>
    <span>
      <button data-add-friend="${uid}" class="secondary">+ друг</button>
      <button data-open-dm="${uid}" class="ghost">ЛС</button>
    </span>
  </div>`).join("");
});
document.addEventListener("click", async(e)=>{
  const t = e.target;
  if(t.matches("[data-add-friend]")){
    if(!state.user) return toast(tkey('needLogin')) || openModal("#authModal");
    const uid = t.getAttribute("data-add-friend");
    await db.ref(`friends/${state.user.uid}/${uid}`).set({ts:Date.now()});
    await db.ref(`friends/${uid}/${state.user.uid}`).set({ts:Date.now()});
    toast(tkey('friendAdded'));
  }
  if(t.matches("[data-open-dm]")){
    if(!state.user) return toast(tkey('needLogin')) || openModal("#authModal");
    state.dmPeer = t.getAttribute("data-open-dm");
    openDM(state.dmPeer);
  }
});

db.ref("friends").on("value", s=>{
  if(!state.user) return;
  const my = (s.val()||{})[state.user.uid]||{};
  $("#friendsList").innerHTML = Object.keys(my).map(uid=>{
    const u = state.users[uid] || {displayName:'User'};
    return `<div class="item"><span>${u.displayName}</span><span><button data-open-dm="${uid}" class="ghost">ЛС</button></span></div>`;
  }).join("");
});

// ---------- Chat feed ----------
function msgHtml(m,u){
  const name = (u && u.displayName) || "User";
  const text = m.text? `<div class="text">${escapeHtml(m.text)}</div>` : "";
  const img = m.photo? `<img src="${m.photo}" alt="photo">` : "";
  const ts = new Date(m.ts||Date.now()).toLocaleString();
  return `<div class="msg"><div class="meta">${name} • ${ts}</div>${text}${img}</div>`;
}
function escapeHtml(s){ return s? s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#039;" }[m])):""; }

let chatOff = null, rentOff = null;
function attachChat(){
  if(chatOff) chatOff();
  $("#chatList").innerHTML = "";
  const ref = db.ref("messages/"+state.city).limitToLast(50);
  ref.on("child_added", snap=>{
    const m = snap.val();
    const u = state.users[m.uid] || null;
    renderTranslated("#chatList", msgHtml(m,u), m.text);
    $("#chatList").scrollTop = $("#chatList").scrollHeight;
  });
  chatOff = ()=> ref.off();
}
function attachRent(){
  if(rentOff) rentOff();
  $("#rentList").innerHTML = "";
  const ref = db.ref("rentMessages/"+state.city).limitToLast(50);
  ref.on("child_added", snap=>{
    const m = snap.val();
    const u = state.users[m.uid] || null;
    renderTranslated("#rentList", msgHtml(m,u), m.text);
    $("#rentList").scrollTop = $("#rentList").scrollHeight;
  });
  rentOff = ()=> ref.off();
}
attachChat(); attachRent();

// Send with "auth on first SMS"
async function ensureAuth(){ if(state.user) return true; openModal("#authModal"); toast(tkey('needLogin')); return false; }

async function uploadPicked(file, path){
  const id = Date.now()+"_"+(file.name||"photo");
  const ref = storage.ref().child(`${path}/${id}`);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  return url;
}

$("#chatPhoto").addEventListener("change", async(e)=>{
  const f = e.target.files[0]; if(!f) return;
  if(!await ensureAuth()) return;
  state.chatPhotoUrl = await uploadPicked(f, `chatUploads/${state.user.uid}`);
  toast(tkey('msgAdded'));
});
$("#rentPhoto").addEventListener("change", async(e)=>{
  const f = e.target.files[0]; if(!f) return;
  if(!await ensureAuth()) return;
  state.rentPhotoUrl = await uploadPicked(f, `rentUploads/${state.user.uid}`);
  toast(tkey('msgAdded'));
});
$("#dmPhoto").addEventListener("change", async(e)=>{
  const f = e.target.files[0]; if(!f) return;
  if(!await ensureAuth()) return;
  state.dmPhotoUrl = await uploadPicked(f, `dmUploads/${state.user.uid}`);
  toast(tkey('dmAdded'));
});

$("#chatSend").addEventListener("click", async()=>{
  if(!await ensureAuth()) return;
  const text = $("#chatInput").value.trim(); if(!text && !state.chatPhotoUrl) return;
  await db.ref("messages/"+state.city).push({ uid: state.user.uid, text, photo: state.chatPhotoUrl||"", ts: Date.now() });
  $("#chatInput").value = ""; state.chatPhotoUrl = null;
});
$("#rentSend").addEventListener("click", async()=>{
  if(!await ensureAuth()) return;
  const text = $("#rentInput").value.trim(); if(!text && !state.rentPhotoUrl) return;
  await db.ref("rentMessages/"+state.city).push({ uid: state.user.uid, text, photo: state.rentPhotoUrl||"", ts: Date.now() });
  $("#rentInput").value = ""; state.rentPhotoUrl = null;
});

// ---------- DM ----------
function dialogId(a,b){ return [a,b].sort().join('_'); }
let dmOff = null;
async function openDM(peerUid){
  $("#tab-dm").classList.add("show");
  $$('.tab').forEach(b=>b.classList.remove('active')); $$('[data-tab="dm"]').forEach(b=>b.classList.add('active'));
  $("#dmList").innerHTML = "";
  const dId = dialogId(state.user.uid, peerUid);
  if(dmOff) dmOff();
  const ref = db.ref("dm/"+dId).limitToLast(50);
  ref.on("child_added", s=>{
    const m = s.val(); const u = state.users[m.uid] || null;
    renderTranslated("#dmList", msgHtml(m,u), m.text);
    $("#dmList").scrollTop = $("#dmList").scrollHeight;
  });
  dmOff = ()=> ref.off();
}
$("#dmSend").addEventListener("click", async()=>{
  if(!state.user || !state.dmPeer) return;
  const dId = dialogId(state.user.uid, state.dmPeer);
  const text = $("#dmInput").value.trim(); if(!text && !state.dmPhotoUrl) return;
  const msgRef = db.ref("dm/"+dId).push();
  await msgRef.set({ uid: state.user.uid, text, photo: state.dmPhotoUrl||"", ts: Date.now() });
  // inbox meta
  await db.ref(`inboxMeta/${state.user.uid}/${dId}`).set({peer: state.dmPeer, lastTs: Date.now(), lastText: text || 'photo'});
  await db.ref(`inboxMeta/${state.dmPeer}/${dId}`).set({peer: state.user.uid, lastTs: Date.now(), lastText: text || 'photo'});
  $("#dmInput").value=""; state.dmPhotoUrl=null;
  // notification for peer
  const nid = db.ref(`notifications/${state.dmPeer}`).push();
  await nid.set({from: state.user.uid, type:'dm', ts:Date.now()});
});

// ---------- Map ----------
let map, markers=[];
function clearMarkers(){ markers.forEach(m=> m.remove()); markers = []; }
function loadMap(){
  if(!map){
    map = L.map('map').setView([50.0755, 14.4378], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  }
  clearMarkers();
  const ref = db.ref("map/poi/"+state.city);
  ref.off(); ref.on('value', s=>{
    clearMarkers();
    const data = s.val()||{};
    Object.values(data).forEach(p=>{
      if(!p || !('lat' in p)) return;
      const mk = L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<b>${p.title||''}</b><br>${p.type||''}<br><a href="${p.url||'#'}" target="_blank">Посилання</a>`);
      markers.push(mk);
    });
  });
}
$("#addPoiBtn").addEventListener("click", async()=>{
  if(!state.user || !window.isAdminEmail(state.user.email)) return alert("Тільки адмін");
  const c = map.getCenter();
  const title = prompt("Назва точки:"); if(!title) return;
  const type = prompt("Тип (help/pharmacy/shop):","help");
  const url = prompt("URL (опціонально):","");
  await db.ref(`map/poi/${state.city}`).push({title,type,url,lat:c.lat,lng:c.lng,ts:Date.now()});
});
$("#runMapBot").addEventListener("click", ()=> Bot.runMapBot(state.city));
loadMap();

// ---------- Help feed ----------
function loadHelp(){
  const ref = db.ref("help/"+state.city);
  ref.off(); ref.on('value', s=>{
    const val = s.val()||{};
    $("#helpList").innerHTML = Object.entries(val).sort((a,b)=> (a[1].ts||0)-(b[1].ts||0)).reverse().map(([id,c])=>{
      return `<div class="card">
        ${c.photo? `<img src="${c.photo}">`: ""}
        <h4>${escapeHtml(c.title||'')}</h4>
        <p>${escapeHtml(c.text||'')}</p>
        ${c.url? `<p><a target="_blank" href="${c.url}">Посилання</a></p>`:""}
      </div>`;
    }).join("");
  });
}
$("#addHelpBtn").addEventListener("click", async()=>{
  if(!state.user || !window.isAdminEmail(state.user.email)) return alert("Тільки адмін");
  const title = prompt("Заголовок:"); if(!title) return;
  const text = prompt("Опис:","");
  const url = prompt("Посилання:","");
  const photo = prompt("Фото URL:","");
  await db.ref(`help/${state.city}`).push({title,text,url,photo,ts:Date.now()});
});
$("#runHelpBot").addEventListener("click", ()=> Bot.runHelpBot(state.city));
loadHelp();

// ---------- Participants (admin) ----------
function loadAdminUsers(){
  db.ref("usersPublic").on("value", s=>{
    const val = s.val()||{};
    $("#adminUsers").innerHTML = Object.entries(val).map(([uid,u])=>{
      return `<div class="item">
        <span>${u.displayName||'User'} <small>${u.email||''}</small></span>
        <span>
          <button class="ghost" data-ban="${uid}">Ban</button>
          <button class="ghost" data-unban="${uid}">Unban</button>
        </span>
      </div>`
    }).join("");
  });
}
document.addEventListener("click", async(e)=>{
  const t = e.target;
  if(t.matches("[data-ban]")){
    if(!state.user || !window.isAdminEmail(state.user.email)) return;
    await db.ref("bans/"+t.getAttribute("data-ban")).set({ts:Date.now(), by: state.user.uid});
    toast("Заблоковано");
  }
  if(t.matches("[data-unban]")){
    if(!state.user || !window.isAdminEmail(state.user.email)) return;
    await db.ref("bans/"+t.getAttribute("data-unban")).remove();
    toast("Розблоковано");
  }
});
loadAdminUsers();

// ---------- Translation of messages to user's UI language ----------
async function translateText(text, target){
  try{
    const url = window.PF.TRANSLATE_ENDPOINT + encodeURIComponent(target) + "&q=" + encodeURIComponent(text);
    const r = await fetch(url);
    const data = await r.json(); // [[["translated","orig",null,null, ...]],...]
    const translated = data && data[0] && data[0][0] && data[0][0][0];
    return translated || text;
  }catch(e){
    return text; // fallback to original
  }
}

// renderTranslated: insert HTML and, if text exists, translate and replace text node
async function renderTranslated(containerSel, html, originalText){
  const list = $(containerSel);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const node = wrapper.firstElementChild;
  if(originalText && state.lang){
    // replace the .text div innerText with translated
    const td = node.querySelector(".text");
    if(td){
      td.textContent = await translateText(originalText, state.lang);
      td.title = originalText; // hover to see original
    }
  }
  list.appendChild(node);
}

// ---------- Participants (button) ----------
$("#participantsBtn").addEventListener("click", ()=>{
  $$('.tab').forEach(b=>b.classList.remove('active')); $$('[data-tab="friends"]').forEach(b=>b.classList.add('active'));
  $$('.tabPage').forEach(p=>p.classList.remove('show')); $("#tab-friends").classList.add('show');
});

// ---------- Notifications (bell) ----------
$("#notifBtn").addEventListener("click", async()=>{
  if(!state.user) return openModal("#authModal");
  // clear notifications
  await db.ref("notifications/"+state.user.uid).remove();
  $("#notifCount").textContent = "0";
  toast("Сповіщення очищено");
});

// ---------- Initial ----------
applyWallpaper();
document.addEventListener("DOMContentLoaded", ()=>{
  // If UI language stored, set selects
  $("#profileLang").value = state.lang;
});

