import { getAccess } from "../../firebase/10_access.js";
import { openAuth } from "../auth/09_auth.js";

let ref = null;
let feedEl, inputEl, sendBtn, attachBtn, statusEl;

function esc(s){ return String(s||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

export function init(){
  const view = document.getElementById('view-chat');
  if(!view) return;
  view.innerHTML = `
    <div class="mk-card">
      <div class="mk-h2">Chat <span class="mk-muted">last 50</span></div>
      <div id="chatFeed" class="mk-feed"></div>
      <div class="mk-composer">
        <input id="chatText" class="mk-input" placeholder="Message..." />
        <button id="chatAttach" class="mk-btn mk-neon">📷</button>
        <button id="chatSend" class="mk-btn mk-primary">Send</button>
      </div>
      <div id="chatStatus" class="mk-muted" style="margin-top:8px"></div>
    </div>
  `;
  feedEl = document.getElementById('chatFeed');
  inputEl = document.getElementById('chatText');
  sendBtn = document.getElementById('chatSend');
  attachBtn = document.getElementById('chatAttach');
  statusEl = document.getElementById('chatStatus');

  sendBtn?.addEventListener('click', sendText);
  attachBtn?.addEventListener('click', ()=>{
    // FAB will dispatch mk:fabricated-photo; here we just open auth if guest
    const { auth } = getAccess();
    if(!auth || !auth.currentUser) return openAuth();
    // fallback: file picker in fab
    window.dispatchEvent(new CustomEvent('mk:open-photo-picker'));
  });

  // FAB event: send file
  window.addEventListener('mk:fabricated-photo', async (e)=>{
    const file = e.detail && e.detail.file;
    if(file) await sendImage(file);
  });
}

export function onEnter(){
  const { db, auth } = getAccess();
  if(!db) return;

  // Always allow read (guest ok)
  if(ref){ try{ ref.off(); }catch(e){} }
  feedEl.innerHTML = '';
  ref = db.ref('messages/global').orderByChild('ts').limitToLast(50);

  ref.on('child_added', (snap)=>{
    const m = snap.val()||{};
    const by = esc(m.by||'');
    const ts = new Date(m.ts||Date.now()).toLocaleTimeString();
    const row = document.createElement('div');
    row.className = 'mk-msg';
    if(m.type==='img' && m.url){
      row.innerHTML = `<div class="mk-msg-meta"><span class="mk-uid">${by}</span><span class="mk-time">${ts}</span></div>
                       <img class="mk-img" src="${esc(m.url)}" />`;
    }else if(m.img){
      row.innerHTML = `<div class="mk-msg-meta"><span class="mk-uid">${by}</span><span class="mk-time">${ts}</span></div>
                       <img class="mk-img" src="${esc(m.img)}" />`;
    }else{
      row.innerHTML = `<div class="mk-msg-meta"><span class="mk-uid">${by}</span><span class="mk-time">${ts}</span></div>
                       <div class="mk-text">${esc(m.text||'')}</div>`;
    }
    feedEl.appendChild(row);
    feedEl.scrollTop = feedEl.scrollHeight;
  });

  // Guest mode: disable send & attach
  const user = auth && auth.currentUser;
  const isGuest = !user;
  inputEl.disabled = isGuest;
  sendBtn.disabled = isGuest;
  attachBtn.disabled = isGuest;
  statusEl.textContent = isGuest ? 'Guest: read-only. To write, login.' : '';
}

export function onExit(){
  if(ref){ try{ ref.off(); }catch(e){} }
  ref=null;
}

async function sendText(){
  const { db, auth } = getAccess();
  if(!auth || !auth.currentUser) return openAuth();
  const text = (inputEl.value||'').trim();
  if(!text) return;
  await db.ref('messages/global').push({
    by: auth.currentUser.uid,
    ts: Date.now(),
    type: 'text',
    text
  });
  inputEl.value='';
}

async function sendImage(file){
  const { db, auth, st } = getAccess();
  if(!auth || !auth.currentUser) return openAuth();
  if(!st) return alert('Storage not available');

  const uid = auth.currentUser.uid;
  const id = Date.now() + '_' + Math.random().toString(16).slice(2);
  const path = 'chatImages/' + uid + '/' + id + '_' + file.name;
  const ref = st.ref().child(path);
  await ref.put(file);
  const url = await ref.getDownloadURL();

  await db.ref('messages/global').push({
    by: uid,
    ts: Date.now(),
    type: 'img',
    url
  });
}
