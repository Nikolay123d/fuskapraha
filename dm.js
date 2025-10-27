
const db=firebase.database(); const auth=firebase.auth();
function dmKey(a,b){ return [a,b].sort().join('_'); }
async function resolveUidByEmail(email){
  const key=email.toLowerCase().replace(/\./g,',');
  const s=await db.ref('emails/'+key).get();
  return (s.val()&&s.val().uid)||null;
}

async function renderDM(room){
  const box=document.getElementById('dmFeed'); box.innerHTML='';
  const ref=db.ref('privateMessages/'+room).limitToLast(50);
  ref.on('child_added', async snap=>{
    const m=snap.val(); const u=await fetchUserPublic(m.by);
    const el=document.createElement('div'); el.className='msg';
    el.innerHTML=`<div class="meta"><b>${u.nick||'Uživatel'}</b> · ${new Date(m.ts).toLocaleString()}</div>`+
      (m.text?`<div>${m.text}</div>`:'')+(m.img?`<img src="${m.img}" class="chat-photo">`:'');
    box.appendChild(el);
  });
}

document.getElementById('dmSend')?.addEventListener('click', async ()=>{
  try{
    const me=auth.currentUser; if(!me) return alert('Přihlaste se');
    let to=document.getElementById('dmTo').value.trim(); if(!to) return;
    if(to.includes('@')){ const uid=await resolveUidByEmail(to); if(!uid) return alert('Email neznám'); to=uid; }
    const text=document.getElementById('dmText').value.trim();
    let img=null; const f=document.getElementById('dmPhoto').files[0]; if(f) img=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
    if(!text && !img) return;
    const room=dmKey(me.uid,to);
    await db.ref('privateMessages/'+room).push({by:me.uid, ts:Date.now(), text, img});
    await db.ref('inboxMeta/'+to+'/'+room).set({from:me.uid, ts:Date.now()});
    document.getElementById('dmText').value=''; document.getElementById('dmPhoto').value=''; toast('Odesláno'); SND.dm.play();
    renderDM(room);
  }catch(e){ console.error(e); SND.err.play(); }
});
