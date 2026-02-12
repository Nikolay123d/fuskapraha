import { canChat } from "../../firebase/10_access.js";

/**
 * Public chat (messages/global)
 * - Guests can READ (rules must allow)
 * - Auth users can WRITE
 * - Supports optional images
 */

let __ref = null;
// Nick cache (authed only)
const __nickCache = new Map();
function shortUid(uid){
  const s = String(uid||"");
  return s.length>10 ? (s.slice(0,6)+"…"+s.slice(-4)) : s;
}
function labelFor(uid){
  if(window.auth && window.auth.currentUser){
    const n = __nickCache.get(uid);
    if(n) return n;
  }
  return shortUid(uid);
}
async function ensureNick(uid){
  if(!uid) return;
  if(!window.auth || !window.auth.currentUser) return;
  if(__nickCache.has(uid)) return;
  __nickCache.set(uid, "");
  try{
    const snap = await firebase.database().ref("usersPublic/"+uid+"/nick").get();
    const nick = snap.val();
    if(nick) __nickCache.set(uid, String(nick));
  }catch(e){
    // ignore (rules / offline)
  }
}


function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function renderMessage(m){
  const by = escapeHtml(labelFor(m.by||"anon"));
  const t  = (m.ts ? new Date(m.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "");
  const text = (m.text != null ? escapeHtml(m.text) : "");
  const img = m.img ? String(m.img) : null;

  return `
    <div class="msg">
      <div class="msg-meta"><span class="msg-by">${by}</span><span class="msg-time">${t}</span></div>
      ${text ? `<div class="msg-text">${text}</div>` : ``}
      ${img ? `<div class="msg-img"><img src="${img}" alt="image" loading="lazy"></div>` : ``}
    </div>
  `;
}

async function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = ()=>resolve(fr.result);
    fr.readAsDataURL(file);
  });
}

async function uploadChatImage(file){
  const u = firebase.auth().currentUser;
  if(!u) throw new Error('not-auth');

  // Prefer Storage if available
  const st = (firebase.storage && firebase.storage()) ? firebase.storage() : null;
  if(st && st.ref){
    const safeName = String(file.name||'img').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,64);
    const path = `chatImages/global/${u.uid}/${Date.now()}_${safeName}`;
    const ref = st.ref().child(path);
    await ref.put(file);
    return await ref.getDownloadURL();
  }

  // Fallback (not ideal for public chat)
  return await fileToDataURL(file);
}

function ensureGuestUiState(){
  const u = firebase.auth().currentUser;
  const isGuest = !u;
  const input = document.getElementById('chatInput');
  const send  = document.getElementById('chatSend');
  const att   = document.getElementById('chatAttach');
  if(!input || !send || !att) return;

  // Важно: гость может печатать и нажимать, но при отправке/фото мы открываем авторизацию.
  input.disabled = false;
  send.disabled  = false;
  att.disabled   = false;
  input.placeholder = isGuest ? 'Напишите сообщение... (при отправке попросим вход)' : 'Сообщение…';
}

export function initChat(){
  const box = document.getElementById('view-chat');
  if(!box) return;

  box.innerHTML = `
    <div class="panel">
      <div class="panel-head">Chat <span class="muted">last 50</span></div>
      <div id="chatFeed" class="feed"></div>
      <div class="input-row">
        <button id="chatAttach" class="btn btn-ghost btn-icon" title="Фото" type="button">📷</button>
        <input id="chatFile" type="file" accept="image/*" style="display:none" />
        <input id="chatInput" class="input" placeholder="Сообщение…" />
        <button id="chatSend" class="btn btn-primary" type="button">Send</button>
      </div>
      <div id="chatGuestHint" class="muted" style="margin-top:8px; display:none;">Гости могут читать чат. Чтобы писать и отправлять фото — нажми Login.</div>
    </div>
  `;

  // UI for guest vs auth
  ensureGuestUiState();
  const hint = document.getElementById('chatGuestHint');
  if(hint){
    hint.style.display = firebase.auth().currentUser ? 'none' : 'block';
  }

  // Keep UI synced when auth changes
  firebase.auth().onAuthStateChanged(()=>{
    ensureGuestUiState();
    const h = document.getElementById('chatGuestHint');
    if(h) h.style.display = firebase.auth().currentUser ? 'none' : 'block';
  });

  // Subscribe last 50
  const feed = document.getElementById('chatFeed');
  if(__ref) try{ __ref.off(); }catch(e){}
  __ref = firebase.database().ref('messages/global').orderByChild('ts').limitToLast(50);

  __ref.on('value', (snap)=>{
    const arr = [];
    snap.forEach(ch=>{ arr.push(ch.val()); });
    if(feed){
      feed.innerHTML = arr.map(renderMessage).join("");
      feed.scrollTop = feed.scrollHeight;
    }
    // Authed: resolve nicks in background and re-render once
    if(window.auth && window.auth.currentUser){
      const uids = Array.from(new Set(arr.map(m=>m && m.by).filter(Boolean)));
      Promise.all(uids.map(ensureNick)).then(()=>{
        if(feed) feed.innerHTML = arr.map(renderMessage).join("");
      });
    }
  }, (err)=>{
    if(feed){
      feed.innerHTML = `<div class="muted">Нет доступа к чату (rules). ${escapeHtml(err && err.message || '')}</div>`;
    }
  });

  // Send text
  const input = document.getElementById('chatInput');
  const send  = document.getElementById('chatSend');
  const att   = document.getElementById('chatAttach');
  const fileI = document.getElementById('chatFile');

  async function sendText(){
    const u = firebase.auth().currentUser;
    if(!u){
      // trigger auth overlay if exists
      if(window.openAuthOverlay) window.openAuthOverlay();
      return;
    }
    if(!canChat()) return;
    const text = (input.value||'').trim();
    if(!text) return;
    input.value='';
    const msg = { by: u.uid, ts: Date.now(), text };
    await firebase.database().ref('messages/global').push(msg);
  }

  send.addEventListener('click', ()=>sendText().catch(console.error));
  input.addEventListener('keydown', (e)=>{
    if(e.key==='Enter') sendText().catch(console.error);
  });

  // Attach image
  att.addEventListener('click', ()=>{
    const u = firebase.auth().currentUser;
    if(!u){ if(window.openAuthOverlay) window.openAuthOverlay(); return; }
    fileI && fileI.click();
  });

  fileI.addEventListener('change', async ()=>{
    const u = firebase.auth().currentUser;
    if(!u) return;
    const f = fileI.files && fileI.files[0];
    fileI.value='';
    if(!f) return;
    if(!canChat()) return;

    try{
      const url = await uploadChatImage(f);
      const msg = { by: u.uid, ts: Date.now(), img: url };
      await firebase.database().ref('messages/global').push(msg);
    }catch(err){
      console.error(err);
      alert('Не удалось отправить фото (проверь Storage rules / лимиты).');
    }
  });
}

export function stopChat(){
  if(__ref){
    try{ __ref.off(); }catch(e){}
    __ref = null;
  }
}

// --- Contract для router ---
let __inited = false;

export async function init(){
  if(__inited) return;
  initChat();
  __inited = true;
}

export async function onEnter(){
  // nothing special: init() already attaches listeners
}

export async function onExit(){
  // optional: stopChat(); // если хочешь отписывать chat когда уходишь с view
}
