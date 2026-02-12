// features/profiles/70_profiles.js
// Public profiles: usersPublic/{uid}

import { getState, setState } from '../../core/02_state.js';
import { openView } from '../router/20_router.js';

let __wired = false;

function escapeHtml(s){
  return String(s||"").replace(/[&<>\"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
function escapeAttr(s){
  return escapeHtml(s).replace(/"/g,'&quot;');
}
function dmKey(a,b){ return [a,b].sort().join('_'); }
function toast(t){ try{ window.toast ? window.toast(t) : alert(t); }catch(e){} }

async function saveMePublic(patch){
  const u = firebase.auth().currentUser;
  if(!u) return;
  await firebase.database().ref('usersPublic/'+u.uid).update(patch);
}

export function initProfiles(){
  if(__wired) return;
  __wired = true;

  window.__profilesApi = { render: renderProfile };

  // helper for other modules
  window.openProfile = async (uid)=>{
    const meUid = firebase.auth().currentUser?.uid || null;
    const target = uid || meUid;
    setState({ view: 'profile', profileUid: target });
    await openView('profile', { profileUid: target });
  };
}

export async function renderProfile(){
  const box = document.getElementById('view-profile');
  if(!box) return;

  const s = getState();
  const uid = s.profileUid || firebase.auth().currentUser?.uid || null;

  box.innerHTML = `
    <div class="card">
      <div class="row"><b>Profil</b></div>
      <div class="small" style="opacity:.8">UID: ${escapeHtml(uid||"")}</div>
      <div id="profileBody" style="margin-top:10px">Loading…</div>
    </div>`;

  if(!uid) return;

  const me = firebase.auth().currentUser;
  const isMe = !!(me && me.uid === uid);

  const snap = await firebase.database().ref('usersPublic/'+uid).get();
  const p = snap.val() || {};
  const nick = p.nick || (isMe ? (me.displayName || me.email || 'Uživatel') : 'Uživatel');
  const role = p.role || '';
  const roleLabel = role==='employer' ? 'Zaměstnavatel' : (role==='seeker' ? 'Hledám práci' : '');

  const body = box.querySelector('#profileBody');
  if(!body) return;

  if(isMe){
    let selectedRole = role || '';
    body.innerHTML = `
      <div class="row"><div><b>${escapeHtml(nick)}</b></div><div class="small">${escapeHtml(roleLabel)}</div></div>
      <div class="row" style="margin-top:10px"><input id="meNick" class="input" placeholder="Nick" value="${escapeAttr(nick)}"></div>
      <div class="row" style="margin-top:10px">
        <button class="btn btn-primary" data-role="employer">Zaměstnavatel</button>
        <button class="btn btn-primary" data-role="seeker">Hledám práci</button>
      </div>
      <div class="row" style="margin-top:10px"><button id="saveProfile" class="btn btn-primary">Uložit</button></div>
    `;

    body.querySelectorAll('button[data-role]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        selectedRole = btn.dataset.role || '';
        toast('Vybráno: ' + (selectedRole==='employer' ? 'Zaměstnavatel' : 'Hledám práci'));
      });
    });

    body.querySelector('#saveProfile')?.addEventListener('click', async ()=>{
      const newNick = (body.querySelector('#meNick')?.value||'').trim();
      const patch = {};
      if(newNick) patch.nick = newNick;
      if(selectedRole) patch.role = selectedRole;
      await saveMePublic(patch);
      toast('Uloženo');
      await renderProfile();
    });

  } else {
    body.innerHTML = `
      <div class="row"><div><b>${escapeHtml(nick)}</b></div><div class="small">${escapeHtml(roleLabel)}</div></div>
      <div class="row" style="margin-top:10px">
        <button id="profileDM" class="btn btn-primary">Napsat (DM)</button>
        <button id="profileFriend" class="btn btn-ghost">Přidat do přátel</button>
      </div>
    `;

    body.querySelector('#profileDM')?.addEventListener('click', async ()=>{
      const meUid = firebase.auth().currentUser?.uid;
      if(!meUid) return;
      const room = dmKey(meUid, uid);
      setState({ view: 'dm', dm: { room } });
      await openView('dm', { room, peer: uid });
      await window.__dmApi?.openRoom?.(room, uid, { restore:false });
    });

    body.querySelector('#profileFriend')?.addEventListener('click', async ()=>{
      const meUid = firebase.auth().currentUser?.uid;
      if(!meUid) return;
      await firebase.database().ref('friendRequests/'+uid+'/'+meUid).set({ from: meUid, ts: Date.now() });
      try{ await firebase.database().ref('notifications/'+uid).push({ ts: Date.now(), type:'friend', from: meUid }); }catch(e){}
      toast('Žádost odeslána');
    });
  }
}

// Router contract
let __inited = false;
export async function init(){ if(__inited) return; initProfiles(); __inited = true; }
export async function onEnter(){ await renderProfile(); }
export async function onExit(){}
export async function initProfile(){ return init(); }
