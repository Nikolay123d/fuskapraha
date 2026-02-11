
import { isAdmin } from "../../firebase/10_access.js";

const PLANS = {
  vip: { title:"VIP", price:100, days:3650 },
  premium: { title:"Premium", price:150, days:30 },
  premiumPlus: { title:"Premium+", price:200, days:30 }
};

function el(tag, attrs={}, html=""){
  const x = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==="class") x.className=v;
    else x.setAttribute(k, v);
  }
  if(html) x.innerHTML = html;
  return x;
}

export function renderPremiumCabinet(container){
  if(!container) return;

  const me = firebase.auth().currentUser;
  const card = el("div", {class:"card"});
  container.appendChild(card);

  if(!me){
    card.innerHTML = `<b>Premium</b><div class="small">Login required.</div>`;
    return;
  }

  if(!isAdmin()){
    // USER CABINET: show own requests with status
    card.innerHTML = `
      <div class="row"><div><b>Premium</b> <span class="small">stav žádosti / статус заявки</span></div>
        <button id="premMyRefresh" class="btn">Refresh</button>
      </div>
      <div id="premMyList" class="list" style="margin-top:10px"></div>
    `;
    card.querySelector("#premMyRefresh").addEventListener("click", loadMy);
    loadMy();
    return;

    async function loadMy(){
      const list = card.querySelector("#premMyList");
      list.innerHTML = '<div class="small">Loading…</div>';
      const snap = await firebase.database().ref("payments/requests/"+me.uid).orderByChild("ts").limitToLast(20).get();
      const v = snap.val()||{};
      const items = Object.entries(v).map(([rid,req])=>({rid, req})).sort((a,b)=>(b.req.ts||0)-(a.req.ts||0));
      list.innerHTML = "";
      if(items.length===0){
        list.innerHTML = '<div class="small">Zatím žádné žádosti / пока заявок нет.</div>';
        return;
      }
      for(const it of items){
        const r = it.req||{};
        const plan = PLANS[r.plan]?.title || r.plan || "plan";
        const st = r.status || "pending";
        const stLabel = (st==="approved") ? "approved / schváleno" : (st==="rejected" ? "rejected / zamítnuto" : "pending / čeká");
        const wrap = el("div", {class:"card"});
        wrap.innerHTML = `
          <div class="row">
            <div><b>${escapeHtml(plan)}</b> <span class="small">${new Date(r.ts||Date.now()).toLocaleString()}</span></div>
            <div class="small"><b>${escapeHtml(stLabel)}</b></div>
          </div>
          <div class="small" style="margin-top:6px">price: ${escapeHtml(r.price)} · ${escapeHtml(r.period||"")}</div>
          ${r.proofImg ? `<div style="margin-top:8px"><img src="${escapeHtml(r.proofImg)}" style="max-width:220px;border-radius:10px;border:1px solid #263a5f"></div>` : ""}
        `;
        list.appendChild(wrap);
      }
    }
  }

  // ADMIN CABINET
  card.innerHTML = `
    <div class="row"><div><b>Premium cabinet</b> <span class="small">requests (admin)</span></div>
      <button id="premRefresh" class="btn">Refresh</button>
    </div>
    <div id="premList" class="list" style="margin-top:10px"></div>
  `;
  card.querySelector("#premRefresh").addEventListener("click", loadRequests);
  loadRequests();

  async function loadRequests(){
    const list = card.querySelector("#premList");
    list.innerHTML = '<div class="small">Loading…</div>';
    const root = await firebase.database().ref("payments/requests").get();
    const all = root.val()||{};
    const items = [];
    for(const uid of Object.keys(all)){
      for(const [rid,req] of Object.entries(all[uid]||{})){
        if(req && req.status==="pending"){
          items.push({uid, rid, req});
        }
      }
    }
    items.sort((a,b)=>(b.req.ts||0)-(a.req.ts||0));
    list.innerHTML = "";
    if(items.length===0){
      list.innerHTML = '<div class="small">No pending requests.</div>';
      return;
    }
    for(const it of items.slice(0,100)){
      const r = it.req||{};
      const wrap = el("div", {class:"card"});
      const plan = PLANS[r.plan]?.title || r.plan || "plan";
      wrap.innerHTML = `
        <div class="row">
          <div><b>${escapeHtml(plan)}</b> <span class="small">${new Date(r.ts||Date.now()).toLocaleString()}</span></div>
          <div class="small">${escapeHtml(it.uid)}</div>
        </div>
        <div class="small" style="margin-top:6px">price: ${escapeHtml(r.price)} / period: ${escapeHtml(r.period||"")}</div>
        ${r.proofImg ? `<div style="margin-top:8px"><img src="${escapeHtml(r.proofImg)}" style="max-width:260px;border-radius:10px;border:1px solid #263a5f"></div>` : ""}
        <div class="row" style="margin-top:10px">
          <button class="btn primary" data-act="approve">Approve</button>
          <button class="btn danger" data-act="reject">Reject</button>
        </div>
      `;
      wrap.querySelector('[data-act="approve"]').addEventListener("click", ()=>approve(it.uid, it.rid, r.plan));
      wrap.querySelector('[data-act="reject"]').addEventListener("click", ()=>reject(it.uid, it.rid));
      list.appendChild(wrap);
    }
  }

  async function approve(uid, rid, planKey){
    const plan = PLANS[planKey] || PLANS.premium;
    const until = Date.now() + plan.days*24*60*60*1000;
    const me = firebase.auth().currentUser;
    await firebase.database().ref("grants/"+uid).push({type:"premium", plan:planKey, until, ts:Date.now(), by:me.uid});
    await firebase.database().ref("payments/requests/"+uid+"/"+rid).update({status:"approved", approvedAt:Date.now(), by:me.uid});
    await firebase.database().ref("notifications/"+uid).push({ts:Date.now(), type:"premium", text:"Premium approved: "+plan.title, read:false});
    alert("Approved");
    loadRequests();
  }

  async function reject(uid, rid){
    const me = firebase.auth().currentUser;
    await firebase.database().ref("payments/requests/"+uid+"/"+rid).update({status:"rejected", rejectedAt:Date.now(), by:me.uid});
    await firebase.database().ref("notifications/"+uid).push({ts:Date.now(), type:"premium", text:"Premium rejected", read:false});
    alert("Rejected");
    loadRequests();
  }
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
