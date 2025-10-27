
const db=firebase.database(); const auth=firebase.auth();
function ttlDays(d){ return d*24*60*60*1000; }
async function rentAdd(){
  const u=auth.currentUser; if(!u) return alert('Přihlaste se');
  const title=document.getElementById('rentTitle').value.trim();
  const price=parseInt(document.getElementById('rentPrice').value||'0',10);
  const ttl=parseInt(document.getElementById('rentTTL').value||'0',10);
  const f=document.getElementById('rentPhoto').files[0];
  let img=null; if(f){ img=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); }); }
  const d={by:u.uid, title, price, img, status:'active', ts:Date.now()};
  if(ttl>0) d.expiresAt= Date.now()+ttlDays(ttl);
  await db.ref('rentMessages').push(d);
  toast('Inzerát přidán'); loadRent();
}
async function loadRent(){
  const s=await db.ref('rentMessages').get(); const v=s.val()||{}; const arr=Object.keys(v).map(id=>({id,...v[id]}));
  const q={status: document.getElementById('rentStatus').value, sort: document.getElementById('rentSort').value};
  let a=arr.filter(x=> !x.expiresAt || x.expiresAt>Date.now()); if(q.status) a=a.filter(x=>x.status===q.status);
  if(q.sort==='price') a.sort((A,B)=>(+A.price||0)-(+B.price||0)); else a.sort((A,B)=> ( (B.ts||0) - (A.ts||0) ));
  const box=document.getElementById('rentFeed'); box.innerHTML='';
  a.forEach(x=>{ const d=document.createElement('div'); d.className='msg'; d.innerHTML=`<div class="meta"><b>${x.title||'(bez názvu)'}</b> · ${new Date(x.ts).toLocaleString()} · ${x.price||''} Kč</div>`+(x.img?`<img src="${x.img}" class="chat-photo">`:'' ); box.appendChild(d); });
}
document.getElementById('rentAdd')?.addEventListener('click', rentAdd);
document.getElementById('rentApply')?.addEventListener('click', loadRent);
window.addEventListener('DOMContentLoaded', loadRent);
