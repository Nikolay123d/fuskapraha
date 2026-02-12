
import { q } from "../../core/01_dom.js";

export async function renderParticipants(){
  const root = q('#adminPanelBody');
  if(!root) return;
  root.innerHTML = '<div class="mk-card"><div class="mk-h3">Participants (presence)</div><div id="pBox" class="mk-muted">Loading…</div></div>';
  try{
    const snap = await firebase.database().ref('presence').orderByChild('ts').limitToLast(200).get();
    const items=[]; snap.forEach(ch=>items.push({uid:ch.key, ...ch.val()}));
    items.sort((a,b)=>(b.ts||0)-(a.ts||0));
    const box=q('#pBox');
    if(box) box.innerHTML = items.length? items.map(it=>`<div class="mk-row mk-between"><span class="mk-mono">${it.uid}</span><span class="mk-muted">${new Date(it.ts).toLocaleTimeString()}</span></div>`).join('') : 'No presence.';
  }catch(e){
    const box=q('#pBox'); if(box) box.textContent='Load failed';
  }
}
