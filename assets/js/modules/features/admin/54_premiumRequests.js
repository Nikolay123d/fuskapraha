
import { q } from "../../core/01_dom.js";

export async function renderPremiumRequests(){
  const root = q('#adminPanelBody');
  if(!root) return;
  root.innerHTML = '<div class="mk-card"><div class="mk-h3">Premium requests</div><div id="prBox" class="mk-muted">Loading…</div></div>';
  try{
    const snap = await firebase.database().ref('premiumRequests').orderByChild('ts').limitToLast(50).get();
    const items=[]; snap.forEach(ch=>items.push({id:ch.key, ...ch.val()}));
    items.sort((a,b)=>(b.ts||0)-(a.ts||0));
    const box=q('#prBox');
    if(box) box.innerHTML = items.length? items.map(it=>`<div class="mk-card mk-subcard">
      <div class="mk-row mk-between"><b>${it.nick||it.uid||'user'}</b><span class="mk-muted">${new Date(it.ts).toLocaleString()}</span></div>
      <div class="mk-muted">Status: <b>${it.status||'new'}</b></div>
    </div>`).join('') : 'No requests.';
  }catch(e){
    const box=q('#prBox'); if(box) box.textContent='Load failed';
  }
}
