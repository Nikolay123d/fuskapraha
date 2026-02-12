// Admin dashboard v2 (lazy, low-reads)
import { MK_ACCESS } from '../firebase/10_access.js';

let __adminInit = false;
try{ if(window.__adminInit) __adminInit=true; }catch(e){}

function $(s,r=document){ return r.querySelector(s); }
function esc(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg){ try{ window.toast ? window.toast(msg) : alert(msg); }catch(e){} }

function logAction(targetUid, action, meta={}){
  try{
    const u = firebase.auth().currentUser;
    if(!u) return;
    firebase.database().ref('adminLogs/'+targetUid).push({
      ts: Date.now(),
      by: u.uid,
      action,
      meta
    });
  }catch(e){}
}

async function findUidByNick(nick){
  const q = (nick||'').trim().toLowerCase();
  if(!q) return null;
  // Fast path: nickIndex/{nickLower} -> uid
  try{
    const v = (await firebase.database().ref('nickIndex/'+q).get()).val();
    if(typeof v === 'string' && v) return v;
  }catch(e){}
  return null;
}

async function loadUser(uid){
  const snap = await firebase.database().ref('users/'+uid).get();
  return snap.val() || null;
}

function renderUserCard(u, uid){
  return `
    <div class="card" style="margin-top:12px">
      <div style="display:flex;gap:12px;align-items:center">
        <img src="${esc(u?.avatar||'./assets/img/default-avatar.svg')}" style="width:48px;height:48px;border-radius:12px;object-fit:cover" />
        <div style="min-width:0">
          <div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u?.nick||'Uživatel')}</div>
          <div class="muted sm">${esc(uid)}</div>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
        <button class="btn sm" data-act="ban1d">Ban 1d</button>
        <button class="btn sm" data-act="mute1h">Mute 1h</button>
        <button class="btn sm" data-act="dmBan1d">DM-ban 1d</button>
        <button class="btn sm" data-act="roleMod">Toggle moderator</button>
        <button class="btn sm" data-act="roleAdmin">Toggle admin</button>
      </div>

      <div class="muted sm" style="margin-top:10px">Historie akcí (poslední 20):</div>
      <div id="adminLogList" class="sm" style="margin-top:6px;display:flex;flex-direction:column;gap:6px"></div>
    </div>`;
}

async function wireUserActions(root, uid){
  root.querySelectorAll('[data-act]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const act = btn.dataset.act;
      const db = firebase.database();
      const now = Date.now();
      try{
        if(act==='ban1d'){
          const until = now + 24*60*60*1000;
          await db.ref('bans/'+uid).set({until});
          logAction(uid,'ban',{until});
          toast('Ban set');
        }else if(act==='mute1h'){
          const until = now + 60*60*1000;
          await db.ref('mutes/'+uid).set({until});
          logAction(uid,'mute',{until});
          toast('Mute set');
        }else if(act==='dmBan1d'){
          const until = now + 24*60*60*1000;
          await db.ref('dmBans/'+uid).set({until});
          logAction(uid,'dmBan',{until});
          toast('DM-ban set');
        }else if(act==='roleMod'){
          const ref = db.ref('roles/'+uid+'/moderator');
          const cur = (await ref.get()).val()===true;
          await ref.set(!cur);
          logAction(uid,'role:moderator',{value:!cur});
          toast('Moderator toggled');
        }else if(act==='roleAdmin'){
          const ref = db.ref('roles/'+uid+'/admin');
          const cur = (await ref.get()).val()===true;
          await ref.set(!cur);
          logAction(uid,'role:admin',{value:!cur});
          toast('Admin toggled');
        }
      }catch(e){
        console.error(e);
        toast('Action failed (rules?)');
      }
      try{ await renderLogs(root, uid); }catch(e){}
    });
  });
}

async function renderLogs(root, uid){
  const list = $('#adminLogList', root);
  if(!list) return;
  list.innerHTML = '<div class="muted">Načítám…</div>';
  try{
    const snap = await firebase.database().ref('adminLogs/'+uid).limitToLast(20).get();
    const v = snap.val() || {};
    const rows = Object.entries(v)
      .map(([k,x])=>({k, ...x}))
      .sort((a,b)=>(a.ts||0)-(b.ts||0))
      .reverse();
    if(!rows.length){ list.innerHTML = '<div class="muted">Zatím nic.</div>'; return; }
    list.innerHTML = rows.map(x=>`<div><b>${esc(x.action||'')}</b> · ${new Date(x.ts||0).toLocaleString()}</div>`).join('');
  }catch(e){
    list.innerHTML = '<div class="muted">Nelze načíst logy.</div>';
  }
}

export function initAdmin(){
  if(__adminInit) return;
  __adminInit = true;
  try{ window.__adminInit=true; }catch(e){}
}

export async function renderAdmin(){
  const view = document.getElementById('view-admin');
  if(!view) return;
  if(!(MK_ACCESS?.state?.admin===true)){
    view.innerHTML = '<div class="card">Access denied.</div>';
    return;
  }

  view.innerHTML = `
    <div class="card">
      <div style="font-weight:900;font-size:18px">Admin dashboard</div>
      <div class="muted sm" style="margin-top:6px">Low-reads: vše je lazy a pouze na vyžádání.</div>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px">
        <div class="card" style="padding:12px">
          <div style="font-weight:800">Uživatel</div>
          <input id="adminNick" placeholder="Hledat podle nicku…" style="margin-top:8px;width:100%">
          <button class="btn" id="adminFind" style="margin-top:8px;width:100%">Najít</button>
          <div class="muted sm" style="margin-top:6px">Používá nickIndex/{nickLower} → uid.</div>
        </div>
        <div class="card" style="padding:12px">
          <div style="font-weight:800">Design / Premium / Logs</div>
          <div class="muted sm" style="margin-top:8px">MVP: přidáme postupně (bez drahých čtení).</div>
        </div>
      </div>

      <div id="adminResult"></div>
    </div>
  `;

  $('#adminFind', view).addEventListener('click', async ()=>{
    const nick = $('#adminNick', view).value;
    const uid = await findUidByNick(nick);
    const out = $('#adminResult', view);
    if(!uid){ out.innerHTML = '<div class="card" style="margin-top:12px">Nenalezeno (nickIndex prázdný?)</div>'; return; }
    try{
      const u = await loadUser(uid);
      out.innerHTML = renderUserCard(u, uid);
      await wireUserActions(view, uid);
      await renderLogs(view, uid);
    }catch(e){
      out.innerHTML = '<div class="card" style="margin-top:12px">Chyba při načítání uživatele.</div>';
    }
  });
}
