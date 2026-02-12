
import { getState, setState } from '../../core/02_state.js';
import { openView } from '../router/20_router.js';

let __wired=false;
let __reqRef=null;
let __friendsRef=null;

export function initFriends(){
  if(__wired) return;
  __wired=true;
  window.__friendsApi = { renderFriends };
}

export async function renderFriends(){
  const box=document.getElementById("view-friends");
  if(!box) return;
  const me=firebase.auth().currentUser;
  if(!me){
    box.innerHTML = `<div class="card"><b>Přátelé</b><div class="small" style="margin-top:8px">Přihlaste se.</div></div>`;
    return;
  }

  box.innerHTML = `
    <div class="card">
      <div class="row"><b>Přátelé</b><div class="small" style="opacity:.85">žádosti + seznam</div></div>
      <div style="margin-top:10px">
        <div class="small"><b>Žádosti</b></div>
        <div id="frReq" class="list" style="margin-top:6px"></div>
      </div>
      <div style="margin-top:14px">
        <div class="small"><b>Seznam</b></div>
        <div id="frList" class="list" style="margin-top:6px"></div>
      </div>
    </div>
  `;

  const reqEl=box.querySelector("#frReq");
  const listEl=box.querySelector("#frList");

  const rqSnap = await firebase.database().ref("friendRequests/"+me.uid).get();
  const rq = rqSnap.val()||{};
  reqEl.innerHTML="";
  for(const fromUid of Object.keys(rq)){
    const row=document.createElement("div");
    row.className="msg";
    row.innerHTML = `<div class="row"><div class="small">${escapeHtml(fromUid)}</div><div class="row" style="gap:8px">
      <button class="btn btn-primary" data-a="acc">Přijmout</button>
      <button class="btn btn-ghost" data-a="dec">Odmítnout</button></div></div>`;
    row.addEventListener("click", async (e)=>{
      const a=e.target?.dataset?.a; if(!a) return;
      if(a==="acc"){
        await firebase.database().ref("friends/"+me.uid+"/"+fromUid).set("accepted");
        await firebase.database().ref("friends/"+fromUid+"/"+me.uid).set("accepted");
        await firebase.database().ref("friendRequests/"+me.uid+"/"+fromUid).remove();
        try{ await firebase.database().ref("notifications/"+fromUid).push({ts:Date.now(), type:"friendAccepted", from: me.uid}); }catch(e){}
        toast("Přidáno");
        renderFriends();
      }else if(a==="dec"){
        await firebase.database().ref("friendRequests/"+me.uid+"/"+fromUid).remove();
        toast("Odmítnuto");
        renderFriends();
      }
    });
    reqEl.appendChild(row);
  }
  if(!Object.keys(rq).length){
    reqEl.innerHTML = `<div class="small" style="opacity:.8">Žádné žádosti.</div>`;
  }

  const frSnap = await firebase.database().ref("friends/"+me.uid).get();
  const fr = frSnap.val()||{};
  listEl.innerHTML="";
  for(const uid of Object.keys(fr)){
    const row=document.createElement("div");
    row.className="msg";
    row.innerHTML = `<div class="row"><div class="small">${escapeHtml(uid)}</div><div class="row" style="gap:8px">
      <button class="btn btn-primary" data-a="dm">DM</button>
      <button class="btn btn-ghost" data-a="pr">Profil</button>
      <button class="btn btn-ghost" data-a="rm">Odebrat</button></div></div>`;
    row.addEventListener("click", async (e)=>{
      const a=e.target?.dataset?.a; if(!a) return;
      if(a==="dm"){
        const room = dmKey(me.uid, uid);
        setState({ ...getState(), view:"dm", dmMode:"room", room, peer: uid });
        openView("dm", { dmMode:"room", room, peer: uid });
        await window.__dmApi?.openRoom?.(room, uid, {restore:false});
      }else if(a==="pr"){
        setState({ ...getState(), view:"profile", profileUid: uid });
        openView("profile", { profileUid: uid });
        await window.__profilesApi?.render?.();
        await window.openProfile?.(uid);
      }else if(a==="rm"){
        await firebase.database().ref("friends/"+me.uid+"/"+uid).remove();
        await firebase.database().ref("friends/"+uid+"/"+me.uid).remove();
        toast("Odebráno");
        renderFriends();
      }
    });
    listEl.appendChild(row);
  }
  if(!Object.keys(fr).length){
    listEl.innerHTML = `<div class="small" style="opacity:.8">Zatím nemáte přátele.</div>`;
  }
}

function escapeHtml(s){ return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
function dmKey(a,b){ return [a,b].sort().join("_"); }
function toast(t){ try{ window.toast ? window.toast(t) : alert(t); }catch(e){} }

// Router contract
let __inited = false;
export async function init(){ if(__inited) return; initFriends(); __inited=true; }
export async function onEnter(){ await renderFriends(); }
export async function onExit(){}
