// DMs
function openDmWith(uid){
  const me=auth.currentUser?.uid; if(!me) return alert('Увійдіть');
  gateDmIfNeeded(me, uid).then((ok)=>{
    if(!ok) return;
    CURRENT_DM_UID=uid;
    $('.tab[data-tab=dm]').click();
    fetchUserName(uid).then(name=>{ $('#dmHeader').textContent='Діалог з '+name; });
    subDm();
  });
}
async function fetchUserName(uid){ const up=(await db.ref('usersPublic/'+uid).get()).val()||{}; return up.name||uid; }

async function gateDmIfNeeded(me, other){
  const mePub=(await db.ref('usersPublic/'+me).get()).val()||{};
  const otherPub=(await db.ref('usersPublic/'+other).get()).val()||{};
  if(mePub.role==='seeker' && otherPub.role==='employer' && (parseInt(mePub.plan||0,10)<50)){
    alert('Щоб писати роботодавцям — потрібно оформити план 50 Kč.');
    return false;
  }
  return true;
}

function subDm(){
  const me=auth.currentUser?.uid; const other=CURRENT_DM_UID; if(!me||!other) return;
  const tid=[me,other].sort().join('_');
  const box=$('#dmMessages'); box.innerHTML='';
  const ref=db.ref('private/'+tid);
  ref.off();
  ref.limitToLast(200).on('child_added', async s=>{
    const v=s.val()||{};
    const up=(await db.ref('usersPublic/'+v.by).get()).val()||{};
    const row=document.createElement('div'); row.className='msg';
    const mine=v.by===me;
    row.innerHTML=`<div class="ava"><img src="${(up.avatar||window.DEFAULT_AVATAR)}"></div><div class="bubble"><div class="name">${mine?'Ви':(up.name||v.by)}</div><div class="text">${(v.text||'')}${v.photo?`<div><img src="${v.photo}" style="max-width:220px;border-radius:8px;margin-top:6px"></div>`:''}</div>${(mine||auth.currentUser.email===window.ADMIN_EMAIL)?`<div class="row"><button data-del="${s.key}">🗑️</button></div>`:''}</div>`;
    row.onclick = async (e)=>{ if(e.target.dataset.del){ await db.ref('private/'+tid+'/'+e.target.dataset.del).remove(); } };
    box.appendChild(row); box.scrollTop=box.scrollHeight;
  });
  $('#dmSend').onclick = sendDm;
}

async function sendDm(){
  const me=auth.currentUser?.uid; const other=CURRENT_DM_UID; if(!me||!other) return;
  const tid=[me,other].sort().join('_');
  const raw=$('#dmInput').value.trim(); let photo=null; const f=$('#dmFile').files[0]; if(f){ photo=await fileToUrl(f); $('#dmFile').value=''; }
  if(!raw && !photo) return;
  await db.ref('private/'+tid).push({by:me,text:raw||null,photo:photo||null,ts:Date.now()});
  await db.ref('inboxMeta/'+me+'/'+other).set({ts:Date.now()});
  await db.ref('inboxMeta/'+other+'/'+me).set({ts:Date.now()});
  $('#dmInput').value='';
}
