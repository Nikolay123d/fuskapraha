// --- helpers
const $ = (q,root=document)=>root.querySelector(q);
const $$ = (q,root=document)=>Array.from(root.querySelectorAll(q));
const toast = (t)=>{ const el=$("#toast"); el.textContent=t; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),1800); };

// --- cities
const CITIES = ["Praha","Brno","Ostrava","Plzeň","Olomouc","Liberec","Ústí nad Labem","Hradec Králové","Pardubice","České Budějovice"];

// --- firebase init
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// keep session
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>auth.setPersistence(firebase.auth.Auth.Persistence.SESSION));

// --- state
let me = null;
let city = localStorage.getItem("city") || "Praha";
let chatOldestTs = null;
let rentOldestTs = null;
let chatPhotoFile = null;
let rentPhotoFile = null;

// --- DOM ready
document.addEventListener("DOMContentLoaded", () => {
  // fill cities
  const sel = $("#citySelect");
  CITIES.forEach(c=>{
    const o = document.createElement("option");
    o.value=o.textContent=c; sel.appendChild(o);
  });
  sel.value = city;
  sel.addEventListener("change", ()=>{
    city = sel.value;
    localStorage.setItem("city", city);
    // reload feeds
    clearFeed("#chatList"); clearFeed("#rentList");
    subscribeChat(); subscribeRent();
    applyCityWallpaper();
  });

  // tabs
  $$(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
  switchTab("chat");

  // composer handlers
  $("#chatPhoto").addEventListener("change", (e)=>{
    chatPhotoFile = e.target.files[0] || null;
    if(chatPhotoFile) toast("✔️ Фото додано. Відправте — з’явиться у стрічці.");
  });
  $("#rentPhoto").addEventListener("change", (e)=>{
    rentPhotoFile = e.target.files[0] || null;
    if(rentPhotoFile) toast("✔️ Фото додано. Відправте — з’явиться у стрічці.");
  });
  $("#chatSend").addEventListener("click", sendChat);
  $("#rentSend").addEventListener("click", sendRent);

  // profile modal
  $("#btnProfile").addEventListener("click", ()=>$("#profileModal").classList.remove("hidden"));
  $("#profileClose").addEventListener("click", ()=>$("#profileModal").classList.add("hidden"));
  $("#saveBgGlobal").addEventListener("click", saveBgGlobal);
  $("#saveBgCity").addEventListener("click", saveBgCity);

  // auth
  $("#btnAuthGoogle").addEventListener("click", signInGoogle);
  $("#btnLogout").addEventListener("click", ()=>auth.signOut());
  $("#btnAuthEmail").addEventListener("click", signInEmailDialog);

  auth.onAuthStateChanged(async (u)=>{
    me = u;
    $("#btnLogout").classList.toggle("hidden", !u);
    $("#btnAuthGoogle").classList.toggle("hidden", !!u);
    $("#btnAuthEmail").classList.toggle("hidden", !!u);
    if(u){
      // write usersPublic
      const pub = {
        uid: u.uid,
        email: u.email || null,
        displayName: u.displayName || (u.email? u.email.split('@')[0] : "Користувач"),
        photoURL: u.photoURL || null,
        ts: Date.now()
      };
      await db.ref(`usersPublic/${u.uid}`).update(pub);
    }
  });

  // first subscriptions
  subscribeChat();
  subscribeRent();
  applyCityWallpaper();
});

function switchTab(name){
  $$(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===name));
  $$(".tabpane").forEach(p=>p.classList.remove("visible"));
  $(`#tab-${name}`).classList.add("visible");
}

function clearFeed(sel){ $(sel).innerHTML=""; if(sel==="#chatList") chatOldestTs=null; if(sel==="#rentList") rentOldestTs=null; }

// ---- subscriptions
function subscribeChat(){
  const ref = db.ref(`messages/${city}`).limitToLast(50);
  $("#chatList").innerHTML="";
  ref.off();
  ref.on("child_added", snap=>{
    const m = snap.val(); renderMsg(m, $("#chatList"));
    chatOldestTs = chatOldestTs ? Math.min(chatOldestTs, m.ts||0) : (m.ts||0);
    // autoscroll
    $("#chatList").lastElementChild?.scrollIntoView({behavior:"smooth", block:"end"});
  });
}

function subscribeRent(){
  const ref = db.ref(`rentMessages/${city}`).limitToLast(50);
  $("#rentList").innerHTML="";
  ref.off();
  ref.on("child_added", snap=>{
    const m = snap.val(); renderMsg(m, $("#rentList"));
    rentOldestTs = rentOldestTs ? Math.min(rentOldestTs, m.ts||0) : (m.ts||0);
    $("#rentList").lastElementChild?.scrollIntoView({behavior:"smooth", block:"end"});
  });
}

function renderMsg(m, root){
  const li = document.createElement("li"); li.className="msg";
  const img = m.photoUrl? `<img src="${m.photoUrl}" alt="">` : "";
  const name = m.user?.name || "—";
  const text = m.text? `<div>${escapeHtml(m.text)}</div>` : "";
  const meta = `<div class="meta">${name} • ${new Date(m.ts||Date.now()).toLocaleString()}</div>`;
  li.innerHTML = `${img}<div class="content">${text}${meta}</div>`;
  root.appendChild(li);
}

function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// ---- senders
async function sendChat(){
  if(!auth.currentUser){ toast("Спочатку увійдіть"); return signInGoogle(); }
  const text = $("#chatText").value.trim();
  let photoUrl=null;
  try{
    if(chatPhotoFile){
      const path = `uploads/${auth.currentUser.uid}/${Date.now()}_${chatPhotoFile.name}`;
      await storage.ref(path).put(chatPhotoFile);
      photoUrl = await storage.ref(path).getDownloadURL();
    }
    if(!text && !photoUrl){ return; }
    const m = {
      text, photoUrl, ts: Date.now(),
      user: { uid: auth.currentUser.uid, name: auth.currentUser.displayName || (auth.currentUser.email? auth.currentUser.email.split('@')[0] : "—"),
              photo: auth.currentUser.photoURL || null }
    };
    await db.ref(`messages/${city}`).push(m);
    $("#chatText").value=""; $("#chatPhoto").value=""; chatPhotoFile=null;
  }catch(e){ console.error(e); toast("Помилка надсилання"); }
}

async function sendRent(){
  if(!auth.currentUser){ toast("Спочатку увійдіть"); return signInGoogle(); }
  const text = $("#rentText").value.trim();
  let photoUrl=null;
  try{
    if(rentPhotoFile){
      const path = `uploads/${auth.currentUser.uid}/${Date.now()}_${rentPhotoFile.name}`;
      await storage.ref(path).put(rentPhotoFile);
      photoUrl = await storage.ref(path).getDownloadURL();
    }
    if(!text && !photoUrl){ return; }
    const m = {
      text, photoUrl, ts: Date.now(),
      user: { uid: auth.currentUser.uid, name: auth.currentUser.displayName || (auth.currentUser.email? auth.currentUser.email.split('@')[0] : "—"),
              photo: auth.currentUser.photoURL || null }
    };
    await db.ref(`rentMessages/${city}`).push(m);
    $("#rentText").value=""; $("#rentPhoto").value=""; rentPhotoFile=null;
  }catch(e){ console.error(e); toast("Помилка надсилання"); }
}

// ---- wallpapers
async function applyCityWallpaper(){
  try{
    // city-specific
    const snapCity = await db.ref(`settings/wallpapers/city/${city}`).get();
    const urlCity = snapCity.val();
    if(urlCity){ document.body.style.backgroundImage = `url('${urlCity}')`; return; }
    // global
    const snapGlobal = await db.ref(`settings/wallpapers/global`).get();
    const urlGlobal = snapGlobal.val();
    if(urlGlobal){ document.body.style.backgroundImage = `url('${urlGlobal}')`; return; }
    document.body.style.backgroundImage = "url('assets/bg.jpg')";
  }catch(e){ document.body.style.backgroundImage = "url('assets/bg.jpg')"; }
}

async function saveBgGlobal(){
  if(!(await isAdmin())){ return toast("Тільки адмін може змінювати обої"); }
  const url = $("#bgGlobal").value.trim(); if(!url) return;
  await db.ref(`settings/wallpapers/global`).set(url);
  toast("Збережено для всіх"); applyCityWallpaper();
}
async function saveBgCity(){
  if(!(await isAdmin())){ return toast("Тільки адмін може змінювати обої"); }
  const url = $("#bgCity").value.trim(); if(!url) return;
  await db.ref(`settings/wallpapers/city/${city}`).set(url);
  toast("Збережено для міста"); applyCityWallpaper();
}
async function isAdmin(){
  try{
    const adminSnap = await db.ref("settings/adminEmail").get();
    const adminEmail = adminSnap.val();
    return auth.currentUser && adminEmail && auth.currentUser.email === adminEmail;
  }catch{return false;}
}

// ---- auth
function signInGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  // redirect if popup blocked
  auth.signInWithPopup(provider).catch(()=>auth.signInWithRedirect(provider));
}
function signInEmailDialog(){
  const email = prompt("Email:"); if(!email) return;
  const pass = prompt("Пароль (новий користувач — введи новий пароль):"); if(!pass) return;
  auth.signInWithEmailAndPassword(email, pass)
    .catch(e=>{
      if(e.code==="auth/user-not-found") return auth.createUserWithEmailAndPassword(email, pass);
      if(e.code==="auth/wrong-password") return alert("Невірний пароль"); 
      alert(e.message);
    });
}
