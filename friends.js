
const db=firebase.database(); const auth=firebase.auth();

async function friendItem(uid, st){
  const wrap=document.createElement('div'); wrap.className='msg';
  const u=await fetchUserPublic(uid);
  wrap.innerHTML = `<div class="meta"><b>${u.nick||'Uživatel'}</b> · ${st}</div>` +
                   `<div class="row"><button data-act="chat">Napsat</button>`+
                   (st==='pending' ? `<button data-act="accept">Přijmout</button>` : `<button data-act="remove">Odebrat</button>`) + `</div>`;
  wrap.addEventListener('click', async (e)=>{
    const a=e.target.dataset.act; if(!a) return; const me=auth.currentUser.uid;
    if(a==='accept'){ await db.ref('friends/'+me+'/'+uid).set('accepted'); await db.ref('friends/'+uid+'/'+me).set('accepted'); await db.ref('friendRequests/'+me+'/'+uid).remove(); loadFriends(); }
    if(a==='remove'){ await db.ref('friends/'+me+'/'+uid).remove(); await db.ref('friends/'+uid+'/'+me).remove(); loadFriends(); }
    if(a==='chat'){ localStorage.setItem('dmTo', uid); document.querySelector('[data-view="view-dm"]').click(); }
  });
  return wrap;
}

async function loadFriends(){
  const me=auth.currentUser; if(!me) return;
  const box=document.getElementById('friendsList'); box.innerHTML='';
  const rq=(await db.ref('friendRequests/'+me.uid).get()).val()||{};
  for(const uid of Object.keys(rq)){ box.appendChild(await friendItem(uid, 'pending')); }
  const fr=(await db.ref('friends/'+me.uid).get()).val()||{};
  for(const [uid,st] of Object.entries(fr)){ box.appendChild(await friendItem(uid, st)); }
}

document.getElementById('friendAddBtn')?.addEventListener('click', async ()=>{
  try{
    const me=auth.currentUser; if(!me) return alert('Přihlaste se');
    const email=document.getElementById('friendEmail').value.trim(); if(!email) return;
    const key=email.toLowerCase().replace(/\./g,',');
    const toS=await db.ref('emails/'+key).get(); const uid=(toS.val()&&toS.val().uid); if(!uid) return alert('Email neznám');
    await db.ref('friendRequests/'+uid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
    toast('Žádost odeslána'); loadFriends();
  }catch(e){ console.error(e); toast('Chyba'); }
});
firebase.auth().onAuthStateChanged(u=>{ if(u) loadFriends(); });
