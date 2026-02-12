
import { canChat, isAdmin } from "../../firebase/10_access.js";

/**
 * Chat: messages/global
 * Always limitToLast, no full loads.
 */

let __ref = null;

export function initChat(){
  const box = document.getElementById("view-chat");
  if(!box) return;

  box.innerHTML = `
    <div class="card">
      <div class="row"><div><b>Chat</b> <span class="small">last 50</span></div></div>
      <div id="chatFeed" class="list" style="margin-top:10px"></div>
      <div class="row" style="margin-top:10px">
        <input id="chatText" class="input" placeholder="Message...">
        <button id="chatSend" class="btn primary">Send</button>
      </div>
    </div>
  `;

  box.querySelector("#chatSend").addEventListener("click", sendChat);

  const feed = box.querySelector("#chatFeed");
  feed.innerHTML = "";

  if(__ref){ try{ __ref.off(); }catch(e){} }
  __ref = firebase.database().ref("messages/global").orderByChild("ts").limitToLast(50);

  __ref.on("child_added", (snap)=>{
    const m = snap.val()||{};
    const div = document.createElement("div");
    div.className = "msg" + (isAdmin() ? " adminMsg" : "");
    div.innerHTML = `
      <div class="row"><div class="small"><a href="#" data-uid="${escapeHtml(m.by||"")}" class="uidLink">${escapeHtml(m.by||"")}</a></div><div class="small">${new Date(m.ts||Date.now()).toLocaleTimeString()}</div></div>
      <div style="margin-top:6px">${escapeHtml(m.text||"")}</div>
      ${isAdmin()?`<div style="margin-top:8px"><button class="btn danger" data-del>Delete</button></div>`:""}
    `;
    if(isAdmin()){
      div.querySelector("[data-del]").addEventListener("click", ()=>{
        firebase.database().ref("messages/global/"+snap.key).remove();
      });
    }
    feed.appendChild(div);
    div.querySelector(".uidLink")?.addEventListener("click", async (e)=>{ e.preventDefault(); const uid = m.by; if(uid){ window.openProfile?.(uid); } });
    if(m.by && firebase.auth().currentUser && m.by!==firebase.auth().currentUser.uid){
      const btn=document.createElement("button"); btn.className="btn btn-ghost"; btn.textContent="DM";
      btn.addEventListener("click", async ()=>{ const me=firebase.auth().currentUser.uid; const room=[me,m.by].sort().join("_"); localStorage.setItem("mk_state", JSON.stringify({ ...(JSON.parse(localStorage.getItem("mk_state")||"{}")), view:"dm", dmMode:"room", room, peer:m.by })); window.openView?.("dm",{dmMode:"room",room,peer:m.by}); await window.__dmApi?.openRoom?.(room,m.by,{restore:false}); });
      div.appendChild(btn);
    }
  });
}

async function sendChat(){
  const u = (window.auth && window.auth.currentUser) ? window.auth.currentUser : (firebase.auth ? firebase.auth().currentUser : null);
  if(!u){
    try{ (window.MK && window.MK.auth && window.MK.auth.openAuth) ? window.MK.auth.openAuth() : null; }catch(e){}
    return;
  }
  if(!canChat()) return alert("Chat blocked (mute/ban)");
const input = document.getElementById("chatText");
  const text = (input.value||"").trim();
  if(!text) return;

  const ts = Date.now();
  await firebase.database().ref("messages/global").push({by:u.uid, ts, text});

  input.value = "";
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}


// one-time init hook for lazy loader
if(!window.__initChatOnce){
  window.__initChatOnce = ()=>{ try{ initChat(); }catch(e){console.error(e);} };
}