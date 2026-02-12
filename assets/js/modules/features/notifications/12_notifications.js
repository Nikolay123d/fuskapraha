
import { isAdmin } from "../../firebase/10_access.js";

/**
 * Notifications model:
 * notifications/<uid>/<nid> { ts, type, text, from, room, read:false }
 * inboxMeta/<uid>/<room>/unread number
 */

let __notifRef = null;
let __notifCb = null;
let __notifUnread = 0;

let __inboxRef = null;
let __inboxCb = null;
let __dmUnread = 0;

function setBadge(el, n){
  if(!el) return;
  const v = Number(n||0);
  el.textContent = v > 99 ? "99+" : String(v);
  el.hidden = !(v > 0);
}

export function getUnreadCounts(){
  return { dm: __dmUnread, notif: __notifUnread };
}

export function stopBadges(){
  try{ if(__notifRef && __notifCb) __notifRef.off("value", __notifCb); }catch(e){}
  try{ if(__inboxRef && __inboxCb) __inboxRef.off("value", __inboxCb); }catch(e){}
  __notifRef=__inboxRef=null;
  __notifCb=__inboxCb=null;
  __notifUnread=__dmUnread=0;
  renderBadges();
}

export function renderBadges(){
  setBadge(document.getElementById("dmBadge"), __dmUnread);
  setBadge(document.getElementById("notifBadge"), __notifUnread);
}

export function watchBadges(user){
  stopBadges();
  if(!user) return;

  // DM unread sum from inboxMeta/<uid>.*.unread
  __inboxRef = firebase.database().ref("inboxMeta/"+user.uid);
  __inboxCb = (snap)=>{
    let total=0;
    const v=snap.val()||{};
    for(const k of Object.keys(v)){
      const n = Number(v[k]?.unread||0);
      if(n>0) total+=n;
    }
    __dmUnread = total;
    renderBadges();
  };
  __inboxRef.on("value", __inboxCb);

  // Notif unread count from notifications/<uid> where read != true
  __notifRef = firebase.database().ref("notifications/"+user.uid).orderByChild("ts").limitToLast(100);
  __notifCb = (snap)=>{
    let total=0;
    const v=snap.val()||{};
    for(const k of Object.keys(v)){
      if(v[k] && v[k].read!==true) total++;
    }
    __notifUnread = total;
    renderBadges();
    // If panel open, re-render list
    if(!document.getElementById("notifPanel")?.classList.contains("hidden")){
      renderNotifList(v, user.uid);
    }
  };
  __notifRef.on("value", __notifCb);
}

function fmtTs(ts){
  try{ return new Date(ts||Date.now()).toLocaleString(); }catch(e){ return ""; }
}

export function wireNotifUI(){
  const btn = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  const close = document.getElementById("notifClose");
  if(btn) btn.addEventListener("click", async ()=>{
    panel?.classList.toggle("hidden");
    if(panel && !panel.classList.contains("hidden")){
      const u = firebase.auth().currentUser;
      if(u){
        const snap = await firebase.database().ref("notifications/"+u.uid).orderByChild("ts").limitToLast(100).get();
        renderNotifList(snap.val()||{}, u.uid);
      }
    }
  });
  if(close) close.addEventListener("click", ()=> panel?.classList.add("hidden"));
}

async function markRead(uid, nid){
  try{
    await firebase.database().ref("notifications/"+uid+"/"+nid+"/read").set(true);
  }catch(e){}
}

function renderNotifList(obj, uid){
  const list = document.getElementById("notifList");
  if(!list) return;
  list.innerHTML = "";
  const items = Object.entries(obj||{}).map(([id,v])=>({id, v}))
    .sort((a,b)=>(b.v.ts||0)-(a.v.ts||0))
    .slice(0, 50);
  if(items.length===0){
    list.innerHTML = '<div class="small">No notifications yet.</div>';
    return;
  }
  for(const it of items){
    const v = it.v||{};
    const row = document.createElement("div");
    row.className = "card";
    row.style.opacity = (v.read===true) ? "0.65" : "1";
    const title = (v.type||"event").toUpperCase();
    const text = v.text || v.title || "";
    row.innerHTML = `
      <div class="row">
        <div><b>${title}</b> <span class="small">${fmtTs(v.ts)}</span></div>
        <div class="small">${v.read===true ? "read" : "unread"}</div>
      </div>
      <div style="margin-top:6px">${escapeHtml(text)}</div>
      ${v.room ? `<div class="small" style="margin-top:6px">room: ${escapeHtml(v.room)}</div>`:""}
    `;
    row.addEventListener("click", ()=> markRead(uid, it.id));
    list.appendChild(row);
  }
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
