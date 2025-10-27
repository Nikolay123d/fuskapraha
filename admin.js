
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
