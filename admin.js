
const db=firebase.database(); const auth=firebase.auth();

document.getElementById('createMakameBot')?.addEventListener('click', async ()=>{
  const city=prompt('Město? (např. praha)','praha')||'praha';
  const every=parseInt(prompt('Interval minut?','30')||'30',10);
  await BOTS.create({type:'chat', city, everyMin:every, text:'Makame.cz — najdi práci za 5 minut (živě)', ad:true});
  toast('Bot vytvořen');
});

document.getElementById('premiumGive')?.addEventListener('click', async ()=>{
  const uid=prompt('UID uživatele?'); if(!uid) return;
  await db.ref('roles/'+uid+'/premium').set(true); toast('Premium uděleno');
});
document.getElementById('premiumRevoke')?.addEventListener('click', async ()=>{
  const uid=prompt('UID uživatele?'); if(!uid) return;
  await db.ref('roles/'+uid+'/premium').set(false); toast('Premium odebráno');
});
document.getElementById('ban30')?.addEventListener('click', async ()=>{
  const uid=prompt('UID?'); if(!uid) return; await db.ref('bans/'+uid).set({until: Date.now()+30*60*1000}); toast('Ban 30 min');
});
document.getElementById('unban')?.addEventListener('click', async ()=>{
  const uid=prompt('UID?'); if(!uid) return; await db.ref('bans/'+uid).remove(); toast('Zrušen ban');
});

async function loadUsers(){
  const box=document.getElementById('usersList'); if(!box) return;
  const s=await db.ref('users').get(); const v=s.val()||{}; box.innerHTML='';
  Object.entries(v).forEach(([uid,u])=>{
    const d=document.createElement('div'); d.className='msg';
    d.innerHTML=`<div class="meta"><b>${(u.name||u.nick||'(bez nicku)')}</b> · ${u.email||''}</div>`;
    box.appendChild(d);
  });
}
window.addEventListener('DOMContentLoaded', loadUsers);

(function(){
if(typeof firebase==='undefined') return;
const db=firebase.database();
// Nick requests list
function renderNickRequests(){
  const box = document.getElementById('reportsBox'); if(!box) return;
  const wrap = document.createElement('div'); wrap.id='nickRequestsBox';
  wrap.innerHTML = `<h4>Žádosti o změnu nicku</h4><div id="nickReqList"></div>`;
  box.parentNode.insertBefore(wrap, box);
  db.ref('nickRequests').on('value', snap=>{
    const v=snap.val()||{}; const list=document.getElementById('nickReqList'); list.innerHTML='';
    Object.entries(v).forEach(([uid,req])=>{
      if(!req || !req.newNick) return;
      const div=document.createElement('div');
      div.className='row';
      div.innerHTML=`<code>${uid}</code> → <b>${req.newNick}</b> <button data-approve="${uid}">Schválit</button> <button data-reject="${uid}">Zamítnout</button>`;
      list.appendChild(div);
    });
  });
  document.addEventListener('click', async (e)=>{
    const a=e.target.closest('[data-approve]'); const r=e.target.closest('[data-reject]');
    if(a){
      const uid=a.getAttribute('data-approve');
      const snap=await db.ref('nickRequests/'+uid).get(); const req=snap.val();
      if(req && req.newNick){
        await db.ref('usersPublic/'+uid+'/name').set(req.newNick);
        await db.ref('nickRequests/'+uid).remove();
        toast('Nick změněn ✅');
      }
    }else if(r){
      const uid=r.getAttribute('data-reject');
      await db.ref('nickRequests/'+uid).remove();
      toast('Zamítnuto');
    }
  });
}
document.addEventListener('DOMContentLoaded', renderNickRequests);
})();
