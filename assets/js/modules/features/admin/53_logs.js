
import { q } from "../../core/01_dom.js";

export async function renderLogs(){
  const root = q('#adminPanelBody');
  if(!root) return;
  root.innerHTML = '<div class="mk-card"><div class="mk-h3">Logs</div><div id="logsBox" class="mk-muted">Loading…</div></div>';
  try{
    const snap = await firebase.database().ref('adminLogs').orderByChild('ts').limitToLast(100).get();
    const items=[]; snap.forEach(ch=>items.push(ch.val()));
    items.sort((a,b)=>(b.ts||0)-(a.ts||0));
    const box=q('#logsBox');
    if(box) box.innerHTML = items.length? items.map(it=>`<div class="mk-row mk-between"><span>${new Date(it.ts).toLocaleString()}</span><span>${it.msg||''}</span></div>`).join('') : 'No logs.';
  }catch(e){
    const box=q('#logsBox'); if(box) box.textContent='Logs load failed';
  }
}
