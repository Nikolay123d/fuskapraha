
import { isAdmin } from "../../firebase/10_access.js";
import { renderPremiumCabinet } from "./61_premiumCabinet.js";
import { cleanupNow } from "./55_cleanup.js";

/**
 * Admin dashboard:
 * - Moderation quick actions: ban/mute/dmBan (12h)
 * - Presence list (online last 5 min)
 * - Premium cabinet (pending requests)
 * - Cleanup 14d
 */

export function initAdmin(){
  const box=document.getElementById("view-admin");
  if(!box) return;

  if(!isAdmin()){
    box.innerHTML = '<div class="card"><b>Admin</b><div class="small">No access</div></div>';
    return;
  }

  box.innerHTML = "";
  const header = document.createElement("div");
  header.className = "card";
  header.innerHTML = `
    <div class="row">
      <div><b>Admin dashboard</b> <span class="small">actions</span></div>
      <button id="cleanupBtn" class="btn danger">Cleanup 14d</button>
    </div>
    <div class="small" style="margin-top:6px">Moderation writes: bans/mutes/dmBans. Presence reads: presence/*</div>
  `;
  box.appendChild(header);

  const tools = document.createElement('div');
  tools.className='card';
  tools.innerHTML = `
    <div class="row"><div><b>Tools</b> <span class="small">quick actions</span></div></div>
    <div class="row" style="margin-top:10px">
      <input id="dmOpenUid" class="input" placeholder="Open DM with UID">
      <button id="dmOpenBtn" class="btn primary">Open</button>
    </div>
  `;
  box.appendChild(tools);
  tools.querySelector('#dmOpenBtn').addEventListener('click', ()=>{
    const uid = tools.querySelector('#dmOpenUid').value.trim();
    if(!uid) return;
    window.__dmApi?.openDMWith(uid);
    window.openView?.('dm', {view:'dm', dmMode:'room'});
  });


  header.querySelector("#cleanupBtn").addEventListener("click", cleanupNow);

  // Presence list
  const presCard = document.createElement("div");
  presCard.className = "card";
  presCard.innerHTML = `
    <div class="row"><div><b>Online users</b> <span class="small">(last 5 min)</span></div>
      <button id="presRefresh" class="btn">Refresh</button>
    </div>
    <div id="presList" class="list" style="margin-top:10px"></div>
  `;
  box.appendChild(presCard);

  presCard.querySelector("#presRefresh").addEventListener("click", ()=>loadPresence(presCard.querySelector("#presList")));
  loadPresence(presCard.querySelector("#presList"));

  // Premium cabinet
  renderPremiumCabinet(box);
}

async function loadPresence(list){
  list.innerHTML = '<div class="small">Loading…</div>';
  const snap = await firebase.database().ref("presence").orderByChild("ts").limitToLast(200).get();
  const v = snap.val()||{};
  const now = Date.now();
  const uids = Object.keys(v).filter(uid=> (now - (v[uid]?.ts||0)) < 5*60*1000)
    .sort((a,b)=>(v[b].ts||0)-(v[a].ts||0))
    .slice(0, 100);
  list.innerHTML = "";
  if(uids.length===0){
    list.innerHTML = '<div class="small">No one online.</div>';
    return;
  }
  for(const uid of uids){
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="small">${uid}</div>
      <div style="display:flex;gap:6px">
        <button class="btn" data-act="ban">Ban 12h</button>
        <button class="btn" data-act="mute">Mute 12h</button>
        <button class="btn" data-act="dmban">DM ban 12h</button>
      </div>
    `;
    row.querySelector('[data-act="ban"]').addEventListener("click", ()=>setMod("bans", uid, 12, "Ban 12h"));
    row.querySelector('[data-act="mute"]').addEventListener("click", ()=>setMod("mutes", uid, 12, "Mute 12h"));
    row.querySelector('[data-act="dmban"]').addEventListener("click", ()=>setMod("dmBans", uid, 12, "DM ban 12h"));
    list.appendChild(row);
  }
}

async function setMod(kind, uid, hours, title){
  const reason = prompt(title+" reason (optional):","") || "";
  const until = Date.now() + hours*60*60*1000;
  const me = firebase.auth().currentUser;
  await firebase.database().ref(kind+"/"+uid).set({until, ts:Date.now(), by: me.uid, reason});
  await firebase.database().ref("notifications/"+uid).push({ts:Date.now(), type:"moderation", text: title + (reason?(" — "+reason):""), read:false});
  alert("Set: "+title);
}


// one-time init hook for lazy loader
if(!window.__initAdminOnce){
  window.__initAdminOnce = ()=>{ try{ initAdmin(); }catch(e){console.error(e);} };
}
