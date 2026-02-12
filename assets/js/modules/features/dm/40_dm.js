
import { canDM } from "../../firebase/10_access.js";
import { BOT_UID, PREMIUM_PLANS, sendBotMessage, submitPremiumRequest, premiumRoomKey, botTextIntro, botTextAfterChoose, botTextNeedProof } from "../premium/60_premiumBot.js";
import { setState } from "../../core/02_state.js";

/**
 * DM architecture (production):
 * room = uid_uid sorted
 * privateMembers/<room>/<uid> = true
 * privateMessages/<room>/<mid> {by, ts, text, img?, bot?}
 * inboxMeta/<uid>/<room> { peer, lastTs, lastText, unread }
 *
 * UI modes:
 *  - inbox (thread list)
 *  - room (conversation)
 */

function roomKey(a,b){ return [a,b].sort().join("_"); }
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

let __dmRoom = null;
let __peer = null;
let __ref = null;

export function initDM(){
  const box = document.getElementById("view-dm");
  if(!box) return;

  box.innerHTML = `
    <div class="card">
      <div class="row">
        <div><b>DM</b> <span id="dmModeLabel" class="small"></span></div>
        <button id="dmNewBot" class="btn">Premium bot</button>
      </div>

      <div id="dmInbox" class="list" style="margin-top:10px"></div>

      <div id="dmRoomWrap" class="hidden" style="margin-top:10px">
        <div class="row">
          <div><b>Room</b> <span id="dmRoomLabel" class="small"></span></div>
          <button id="dmBack" class="btn">Back</button>
        </div>

        <div id="botPanel" class="card hidden" style="margin-top:10px"></div>

        <div id="dmFeed" class="list" style="margin-top:10px"></div>
        <div class="row" style="margin-top:10px">
          <input id="dmText" class="input" placeholder="Message...">
          <button id="dmSend" class="btn primary">Send</button>
        </div>
        <div class="row" style="margin-top:10px">
          <input id="dmProof" type="file" accept="image/*" class="input">
          <button id="dmSendImg" class="btn">Send image</button>
        </div>
      </div>
    </div>
  `;

  box.querySelector("#dmBack").addEventListener("click", showInbox);
  box.querySelector("#dmSend").addEventListener("click", sendCurrent);
  box.querySelector("#dmSendImg").addEventListener("click", sendProofImage);
  box.querySelector("#dmNewBot").addEventListener("click", openPremiumBot);

  // Expose API for router/app restore
  window.__dmApi = {
    showInbox,
    openRoom,
    openDMWith,
  };

  // initial inbox
  showInbox();
}

async function showInbox(){
  const u = firebase.auth().currentUser;
  const inbox = document.getElementById("dmInbox");
  const roomWrap = document.getElementById("dmRoomWrap");
  document.getElementById("dmModeLabel").textContent = "inbox";
  roomWrap.classList.add("hidden");
  inbox.classList.remove("hidden");
  __dmRoom=null; __peer=null;
  // ⚠️ НЕ пишем mk_state напрямую. Только через core/02_state.js
  setState({ view: "dm", dmMode: "inbox", room: null, peer: null });

  if(!u){
    inbox.innerHTML = '<div class="small">Login required.</div>';
    return;
  }
  inbox.innerHTML = '<div class="small">Loading…</div>';

  const snap = await firebase.database().ref("inboxMeta/"+u.uid).orderByChild("lastTs").limitToLast(50).get();
  const v = snap.val()||{};
  const items = Object.entries(v).map(([room,m])=>({room, m}))
    .sort((a,b)=>(b.m.lastTs||0)-(a.m.lastTs||0));

  inbox.innerHTML = "";
  if(items.length===0){
    inbox.innerHTML = '<div class="small">No threads yet. Use Premium bot or open a DM from admin tools later.</div>';
    return;
  }
  for(const it of items){
    const row = document.createElement("div");
    row.className = "card";
    const unread = Number(it.m.unread||0);
    row.innerHTML = `
      <div class="row">
        <div><b>${escapeHtml(it.m.peer||"peer")}</b> ${unread?`<span class="badge">${unread}</span>`:""}</div>
        <div class="small">${new Date(it.m.lastTs||Date.now()).toLocaleString()}</div>
      </div>
      <div class="small" style="margin-top:6px">${escapeHtml(it.m.lastText||"")}</div>
    `;
    row.addEventListener("click", ()=>openRoom(it.room, it.m.peer));
    inbox.appendChild(row);
  }
}

async function openRoom(room, peerUid, opts={}){
  const u = firebase.auth().currentUser;
  if(!u) return alert("Login required");

  // ensure membership (required by rules)
  const memUpdates = {};
  memUpdates["privateMembers/"+room+"/"+u.uid] = true;
  memUpdates["privateMembers/"+room+"/"+peerUid] = true;
  try{ await firebase.database().ref().update(memUpdates); }catch(e){}

  __dmRoom = room;
  __peer = peerUid;

  // persist restore state
  // ⚠️ НЕ пишем mk_state напрямую. Только через core/02_state.js
  setState({ view: "dm", dmMode: "room", room, peer: peerUid });

  document.getElementById("dmModeLabel").textContent = "room";
  document.getElementById("dmRoomLabel").textContent = room;

  const inbox = document.getElementById("dmInbox");
  const roomWrap = document.getElementById("dmRoomWrap");
  inbox.classList.add("hidden");
  roomWrap.classList.remove("hidden");

  // mark read
  try{ await firebase.database().ref("inboxMeta/"+u.uid+"/"+room+"/unread").set(0); }catch(e){}

  // premium bot panel toggle
  await renderBotPanel(room, peerUid);

  // unsubscribe prev
  try{ if(__ref) __ref.off(); }catch(e){}
  __ref = firebase.database().ref("privateMessages/"+room).orderByChild("ts").limitToLast(50);

  const feed = document.getElementById("dmFeed");
  feed.innerHTML = "";

  __ref.on("child_added", (snap)=>{
    const m = snap.val()||{};
    const div = document.createElement("div");
    div.className = "msg";
    div.innerHTML = `
      <div class="row"><div class="small">${escapeHtml(m.by||"")}${m.bot?` <span class="small">(bot)</span>`:""}</div>
      <div class="small">${new Date(m.ts||Date.now()).toLocaleTimeString()}</div></div>
      ${m.text?`<div style="margin-top:6px">${escapeHtml(m.text)}</div>`:""}
      ${m.img?`<div style="margin-top:8px"><img src="${escapeHtml(m.img)}" style="max-width:260px;border-radius:10px;border:1px solid #263a5f"></div>`:""}
    `;
    feed.appendChild(div);
  });
}

async function sendCurrent(){
  const u = firebase.auth().currentUser;
  if(!u) return alert("Login required");
  if(!__dmRoom || !__peer) return alert("Open a thread first");
  if(!canDM()) return alert("DM blocked (ban)");

  const input = document.getElementById("dmText");
  const text = (input.value||"").trim();
  if(!text) return;
  const ts = Date.now();

  await firebase.database().ref("privateMessages/"+__dmRoom).push({by:u.uid, ts, text});

  // update inbox meta + unread for peer (no extra reads)
  const updates = {};
  updates["inboxMeta/"+u.uid+"/"+__dmRoom+"/peer"] = __peer;
  updates["inboxMeta/"+u.uid+"/"+__dmRoom+"/lastTs"] = ts;
  updates["inboxMeta/"+u.uid+"/"+__dmRoom+"/lastText"] = text.slice(0,120);
  updates["inboxMeta/"+u.uid+"/"+__dmRoom+"/unread"] = 0;

  updates["inboxMeta/"+__peer+"/"+__dmRoom+"/peer"] = u.uid;
  updates["inboxMeta/"+__peer+"/"+__dmRoom+"/lastTs"] = ts;
  updates["inboxMeta/"+__peer+"/"+__dmRoom+"/lastText"] = text.slice(0,120);

  await firebase.database().ref().update(updates);
  await firebase.database().ref("inboxMeta/"+__peer+"/"+__dmRoom+"/unread").transaction(n=>(n||0)+1);

  // bell notification for peer
  try{
    await firebase.database().ref("notifications/"+__peer).push({ts, type:"dm", text:"New DM", room: __dmRoom, read:false});
  }catch(e){}

  input.value = "";
}

async function fileToDataURL(f){
  return await new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

async function sendProofImage(){
  const u = firebase.auth().currentUser;
  if(!u) return alert("Login required");
  if(!__dmRoom || !__peer) return alert("Open a thread first");
  if(!canDM()) return alert("DM blocked (ban)");

  const inp = document.getElementById("dmProof");
  const f = inp?.files?.[0];
  if(!f) return alert("Choose an image first");
  const img = await fileToDataURL(f);
  const ts = Date.now();

  await firebase.database().ref("privateMessages/"+__dmRoom).push({by:u.uid, ts, img, text:"proof"});

  const updates = {};
  updates["inboxMeta/"+u.uid+"/"+__dmRoom+"/peer"] = __peer;
  updates["inboxMeta/"+u.uid+"/"+__dmRoom+"/lastTs"] = ts;
  updates["inboxMeta/"+u.uid+"/"+__dmRoom+"/lastText"] = "📷 Image";
  updates["inboxMeta/"+u.uid+"/"+__dmRoom+"/unread"] = 0;

  updates["inboxMeta/"+__peer+"/"+__dmRoom+"/peer"] = u.uid;
  updates["inboxMeta/"+__peer+"/"+__dmRoom+"/lastTs"] = ts;
  updates["inboxMeta/"+__peer+"/"+__dmRoom+"/lastText"] = "📷 Image";

  await firebase.database().ref().update(updates);
  await firebase.database().ref("inboxMeta/"+__peer+"/"+__dmRoom+"/unread").transaction(n=>(n||0)+1);

  try{
    await firebase.database().ref("notifications/"+__peer).push({ts, type:"dm", text:"New image", room: __dmRoom, read:false});
  }catch(e){}

  inp.value = "";
}

/** Create a thread instantly and open it */
export function openDMWith(peerUid){
  const u = firebase.auth().currentUser;
  if(!u) return alert("Login required");
  const room = roomKey(u.uid, peerUid);
  const now = Date.now();
  const updates = {};
  updates["inboxMeta/"+u.uid+"/"+room+"/peer"] = peerUid;
  updates["inboxMeta/"+u.uid+"/"+room+"/lastTs"] = now;
  updates["inboxMeta/"+u.uid+"/"+room+"/lastText"] = "";
  updates["inboxMeta/"+u.uid+"/"+room+"/unread"] = 0;
  updates["inboxMeta/"+peerUid+"/"+room+"/peer"] = u.uid;
  updates["inboxMeta/"+peerUid+"/"+room+"/lastTs"] = now;
  updates["inboxMeta/"+peerUid+"/"+room+"/lastText"] = "";
  firebase.database().ref().update(updates).finally(()=>openRoom(room, peerUid));
}

/** Premium bot flow */
async function openPremiumBot(){
  const u = firebase.auth().currentUser;
  if(!u) return alert("Login required");
  if(!BOT_UID || BOT_UID.includes("PREMIUM_BOT_UID_HERE")) return alert("Set BOT_UID in modules/60_premiumBot.js");
  const room = premiumRoomKey(u.uid);
  // Ensure thread exists both sides so it shows in inbox instantly
  const now = Date.now();
  const updates = {};
  updates["inboxMeta/"+u.uid+"/"+room+"/peer"] = BOT_UID;
  updates["inboxMeta/"+u.uid+"/"+room+"/lastTs"] = now;
  updates["inboxMeta/"+u.uid+"/"+room+"/lastText"] = "Premium bot";
  updates["inboxMeta/"+u.uid+"/"+room+"/unread"] = 0;
  updates["inboxMeta/"+BOT_UID+"/"+room+"/peer"] = u.uid;
  updates["inboxMeta/"+BOT_UID+"/"+room+"/lastTs"] = now;
  updates["inboxMeta/"+BOT_UID+"/"+room+"/lastText"] = "User opened bot";
  await firebase.database().ref().update(updates);

  await openRoom(room, BOT_UID);
  await ensureBotIntro(room);
}

async function ensureBotIntro(room){
  // Send intro once per room if no bot msg exists in last 10
  const snap = await firebase.database().ref("privateMessages/"+room).limitToLast(10).get();
  const v = snap.val()||{};
  const has = Object.values(v).some(m=>m && m.bot===true);
  if(!has){
    await sendBotMessage(room, botTextIntro());
  }
}

async function renderBotPanel(room, peerUid){
  const panel = document.getElementById("botPanel");
  if(!panel) return;

  const isBot = (peerUid === BOT_UID);
  panel.classList.toggle("hidden", !isBot);
  if(!isBot) return;

  const stateKey = "mk_premium_state";
  const state = JSON.parse(localStorage.getItem(stateKey) || '{"step":"choose","plan":null}');
  const setState = (s)=>{ localStorage.setItem(stateKey, JSON.stringify(s)); renderBotPanel(room, peerUid); };

  panel.innerHTML = `
    <div class="row"><div><b>Premium bot</b> <span class="small">${escapeHtml(state.step)}</span></div></div>
    <div id="botBody" style="margin-top:10px"></div>
  `;
  const body = panel.querySelector("#botBody");

  if(state.step==="choose"){
    body.innerHTML = `
      <div class="small">Vyber balíček:</div>
      <div class="row" style="margin-top:10px; gap:8px; flex-wrap:wrap">
        <button class="btn primary" data-plan="vip">${PREMIUM_PLANS.vip.title} (${PREMIUM_PLANS.vip.price} Kč)</button>
        <button class="btn primary" data-plan="premium">${PREMIUM_PLANS.premium.title} (${PREMIUM_PLANS.premium.price} Kč)</button>
        <button class="btn primary" data-plan="premiumPlus">${PREMIUM_PLANS.premiumPlus.title} (${PREMIUM_PLANS.premiumPlus.price} Kč)</button>
      </div>
    `;
    body.querySelectorAll("[data-plan]").forEach(b=>{
      b.addEventListener("click", async ()=>{
        const plan = b.getAttribute("data-plan");
        await sendBotMessage(room, botTextAfterChoose(PREMIUM_PLANS[plan].title, PREMIUM_PLANS[plan].price));
        setState({step:"pay", plan});
      });
    });
    return;
  }

  if(state.step==="pay"){
    const plan = PREMIUM_PLANS[state.plan] || PREMIUM_PLANS.premium;
    body.innerHTML = `
      <div class="small">Balíček: <b>${escapeHtml(plan.title)}</b> (${plan.price} Kč). 1) Zaplať 2) Pošli fotku platby.</div>
      <div style="margin-top:10px">
        <img src="assets/img/csob-qr.png" style="max-width:260px;border-radius:10px;border:1px solid #263a5f">
      </div>
      <div class="row" style="margin-top:10px; gap:8px; flex-wrap:wrap">
        <button class="btn" id="botChange">Změnit balíček</button>
        <button class="btn primary" id="botNext">Už jsem poslal fotku</button>
      </div>
    `;
    body.querySelector("#botChange").addEventListener("click", ()=>setState({step:"choose", plan:null}));
    body.querySelector("#botNext").addEventListener("click", ()=>setState({step:"submit", plan: state.plan}));
    return;
  }

  if(state.step==="submit"){
    const plan = PREMIUM_PLANS[state.plan] || PREMIUM_PLANS.premium;
    body.innerHTML = `
      <div class="small">Balíček: <b>${escapeHtml(plan.title)}</b>. Найди последнюю картинку в этом чате и нажми submit.</div>
      <div class="row" style="margin-top:10px; gap:8px; flex-wrap:wrap">
        <button class="btn" id="botBack">Назад</button>
        <button class="btn primary" id="botSubmit">Подать заявку</button>
      </div>
    `;
    body.querySelector("#botBack").addEventListener("click", ()=>setState({step:"pay", plan: state.plan}));
    body.querySelector("#botSubmit").addEventListener("click", async ()=>{
      const proof = await findLastProof(room);
      if(!proof) return alert(botTextNeedProof());
      const id = await submitPremiumRequest(state.plan, proof);
      await sendBotMessage(room, "✅ Заявка отправлена (ID: "+id+"). Админ проверит и выдаст доступ.");
      setState({step:"choose", plan:null});
    });
    return;
  }
}

async function findLastProof(room){
  const u = firebase.auth().currentUser;
  const snap = await firebase.database().ref("privateMessages/"+room).limitToLast(40).get();
  const v = snap.val()||{};
  const msgs = Object.values(v).filter(Boolean).sort((a,b)=>(a.ts||0)-(b.ts||0));
  for(let i=msgs.length-1;i>=0;i--){
    const m = msgs[i];
    if(m.by===u.uid && m.img) return m.img;
  }
  return null;
}


// one-time init guard
if(!window.__dmInited){ window.__dmInited=true; }

if(!window.__initDMOnce){ window.__initDMOnce = ()=>{ if(window.__dmInited2) return; window.__dmInited2=true; try{ initDM(); }catch(e){ console.error(e);} }; }

// --- Contract для router (единый API) ---
let __inited = false;

export async function init(){
  if(__inited) return;
  if(typeof window.__initDMOnce === 'function') {
    window.__initDMOnce();
  } else {
    initDM();
  }
  __inited = true;
}

export async function onEnter(state){
  const s = state || {};
  // Default: show inbox. If state says room -> open it.
  if(s.dmMode === 'room' && s.room) {
    openRoom(s.room, s.peer || null);
  } else {
    showInbox();
  }
}

export async function onExit(){
  // no-op (keep DM state)
}
