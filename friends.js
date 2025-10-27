(function(){
if(typeof firebase==='undefined') return;
const db=firebase.database();

function uid(){ return (firebase.auth().currentUser||{}).uid; }

// find user by email in usersPublic
async function findUidByEmail(email){
  const snap = await db.ref('usersPublic').get();
  const v = snap.val()||{};
  for(const [k,u] of Object.entries(v)){
    if(u && (u.email||'').toLowerCase()===email.toLowerCase()) return k;
  }
  return null;
}

// send request
document.addEventListener('click', async (e)=>{
  if(e.target && e.target.id==='friendAddBtn'){
    const me=uid(); if(!me){ toast('Přihlaste se'); return; }
    const em = document.getElementById('friendEmail').value.trim();
    if(!em){ toast('Zadejte e-mail'); return; }
    const him = await findUidByEmail(em);
    if(!him){ toast('Uživatel nenalezen'); return; }
    await db.ref('friendRequests/'+him+'/'+me).set({ts:Date.now()});
    toast('Žádost odeslána ✅');
  }
});

// render friends & requests
function render(){
  const me=uid(); if(!me) return;
  // friends
  db.ref('friends/'+me).on('value', snap=>{
    const box=document.getElementById('friendsList'); if(!box) return;
    const v=snap.val()||{}; box.innerHTML='';
    Object.keys(v).forEach(uid=>{
      const div=document.createElement('div'); div.className='row';
      div.innerHTML=`<span>${uid}</span>`;
      box.appendChild(div);
    });
  });
  // incoming
  db.ref('friendRequests/'+me).on('value', snap=>{
    const v=snap.val()||{}; const box=document.getElementById('reqIncoming'); if(!box) return; box.innerHTML='';
    Object.keys(v).forEach(from=>{
      const div=document.createElement('div'); div.className='row';
      div.innerHTML=`<span>${from}</span> <button data-acc="${from}">Přijmout</button> <button data-decl="${from}">Odmítnout</button>`;
      box.appendChild(div);
    });
  });
  // outgoing
  db.ref('friendRequests').on('value', snap=>{
    const v=snap.val()||{}; const box=document.getElementById('reqOutgoing'); if(!box) return; box.innerHTML='';
    const mine = Object.entries(v).flatMap(([to,reqs])=> Object.keys(reqs||{}).map(fr=>({to,from:fr})));
    mine.filter(x=>x.from===me).forEach(x=>{
      const div=document.createElement('div'); div.className='row';
      div.innerHTML=`<span>${x.to}</span>`;
      box.appendChild(div);
    });
  });
}
firebase.auth().onAuthStateChanged(()=>render());

// accept/decline
document.addEventListener('click', async (e)=>{
  const me=uid();
  const acc=e.target.closest('[data-acc]');
  const dec=e.target.closest('[data-decl]');
  if(acc){
    const from=acc.getAttribute('data-acc');
    await db.ref('friends/'+me+'/'+from).set(true);
    await db.ref('friends/'+from+'/'+me).set(true);
    await db.ref('friendRequests/'+me+'/'+from).remove();
    toast('Přidáno do přátel ✅');
  }else if(dec){
    const from=dec.getAttribute('data-decl');
    await db.ref('friendRequests/'+me+'/'+from).remove();
    toast('Zamítnuto');
  }
});
})();