
import { q } from "../../core/01_dom.js";
import { openAdminUser } from "./51_userProfile.js";

function normNick(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }

export function renderNickSearch(){
  const root = q('#adminPanelBody');
  if(!root) return;
  root.innerHTML = `
    <div class="mk-card">
      <div class="mk-h3">Search by nick (nickIndex)</div>
      <div class="mk-row mk-gap8">
        <input id="adminNickQuery" class="mk-input" placeholder="nick..." />
        <button id="adminNickGo" class="btn btn-neon">Search</button>
      </div>
      <div id="adminNickResult" class="mk-muted" style="margin-top:10px;"></div>
    </div>
  `;

  const go = q('#adminNickGo');
  go && go.addEventListener('click', async ()=>{
    const qv = normNick(q('#adminNickQuery')?.value);
    const out = q('#adminNickResult');
    if(!qv){ if(out) out.textContent='Enter nick'; return; }

    if(out) out.textContent = 'Searching…';
    try{
      const snap = await firebase.database().ref('nickIndex/'+encodeURIComponent(qv)).get();
      if(!snap.exists()){ if(out) out.textContent='Not found'; return; }
      const uid = snap.val();
      if(out) out.innerHTML = `Found: <span class="mk-mono">${uid}</span> <button id="openUser" class="btn btn-neon" style="margin-left:8px;">Open</button>`;
      const btn = q('#openUser');
      btn && btn.addEventListener('click', ()=>openAdminUser(uid));
    }catch(e){
      if(out) out.textContent = 'Search failed';
      console.warn(e);
    }
  });
}
