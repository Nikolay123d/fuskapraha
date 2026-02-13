// === RENT (city-based) ===
function ttlDays(d){ return d*24*60*60*1000; }
async function rentAdd(){
  const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
  // Client-side anti-spam (double click)
  try{ if(window.MK && !window.MK.lockTake('rent:add', 1200)) return; }catch(e){}

  // Plan limits
  try{ if(typeof checkLimit==='function'){ const ok = await checkLimit('rent'); if(!ok) return; } }catch(e){}

  const title=$('#rentTitle').value.trim();
  const price=parseInt($('#rentPrice').value||'0',10);
  const ttl=parseInt($('#rentTTL').value||'0',10);
  const f=$('#rentPhoto').files && $('#rentPhoto').files[0];
  let img=null; if(f){ img=await fileToDataURL(f); }
  const d={by:u.uid, title, price, img, status:'active', ts:Date.now()};
  if(ttl>0) d.expiresAt= Date.now()+ttlDays(ttl);
  await db.ref('rentMessages/'+getCity()).push(d);

  // Counters after success
  try{ if(typeof incLimit==='function') await incLimit('rent'); }catch(e){}
  toast('Inzerát přidán'); playSound('ok');
  $('#rentTitle').value=''; $('#rentPrice').value=''; $('#rentTTL').value='0'; $('#rentPhoto').value='';
  loadRent();
}
async function loadRent(){
  const city=getCity();
  const s=await db.ref('rentMessages/'+city).get();
  const v=s.val()||{};
  const arr=Object.keys(v).map(id=>({id,...v[id]}));
  const q={status: $('#rentStatus').value, sort: $('#rentSort').value};
  let a=arr.filter(x=> !x.expiresAt || x.expiresAt>Date.now());
  if(q.status) a=a.filter(x=>x.status===q.status);
  if(q.sort==='price') a.sort((A,B)=>(+A.price||0)-(+B.price||0));
  else a.sort((A,B)=> ( (B.ts||0) - (A.ts||0) ));
  const box=$('#rentFeed'); if(!box) return;
  box.innerHTML='';
  for(const x of a){
    const u=await getUser(x.by);
    const d=document.createElement('div'); d.className='msg';
    d.innerHTML = `<div class="ava" data-uid="${esc(x.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>`+
      `<div class="bubble"><div class="meta"><div class="name" data-uid="${esc(x.by)}">${esc(u.nick||'Uživatel')}</div><div class="time">${fmtTime(x.ts||0)}</div></div>`+
      `<div class="text"><b>${esc(x.title||'(bez názvu)')}</b> · ${esc(x.price||'')} Kč</div>`+
      (x.img?`<div class="text"><img src="${esc(x.img)}"></div>`:'')+
      `<div class="muted">${new Date(x.ts||Date.now()).toLocaleString()}</div>`+
      `</div>`;
    box.appendChild(d);
  }
}
$('#rentAdd')?.addEventListener('click', rentAdd);
$('#rentApply')?.addEventListener('click', loadRent);

