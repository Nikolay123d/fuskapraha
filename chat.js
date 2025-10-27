
const db=firebase.database(); const auth=firebase.auth();

function userBadge(u){
  if(!u) return '';
  if(u.role==='admin') return '<span class="badge admin">ADMIN</span>';
  if(u.role==='moderator') return '<span class="badge mod">MOD</span>';
  if(u.premium) return '<span class="badge premium">PREMIUM</span>';
  return '';
}

function msgEl(m,u){
  const d=document.createElement('div'); d.className='msg';
  const name=(u?.nick||'Uživatel')+userBadge(u)+ (u?.online?'<span class="online"></span>':'');
  d.innerHTML = `<div class="meta"><b>${name}</b> · ${new Date(m.ts||Date.now()).toLocaleString()}</div>`+
                (m.text? `<div class="text">${m.text}</div>`:'' )+
                (m.img? `<img src="${m.img}" class="chat-photo">`:'');
  return d;
}

let offChat=null;
async function loadChat(){
  const feed=$('#chatFeed'); if(!feed) return;
  feed.innerHTML='';
  if(offChat){ offChat(); offChat=null; }
  const city=getCity(); const sel=$('#citySelect'); if(sel) sel.value=city;

  const usersCache={};
  async function getUser(uid){
    if(usersCache[uid]) return usersCache[uid];
    const v=await fetchUserPublic(uid);
    const p=await db.ref('presence/'+uid).get(); v.online=!!(p.val()&&p.val().online);
    return (usersCache[uid]=v);
  }

  const ref=db.ref('messages/'+city).limitToLast(50);
  const cb=(snap)=>{ const m=snap.val()||{}; getUser(m.by).then(u=> feed.appendChild(msgEl(m,u))); };
  ref.on('child_added', cb); offChat=()=> ref.off('child_added', cb);
}
window.addEventListener('DOMContentLoaded', loadChat);
document.getElementById('citySelect')?.addEventListener('change', loadChat);

async function fileToDataURL(f){ return await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); }); }

document.getElementById('sendBtn')?.addEventListener('click', async ()=>{
  try{
    const u=auth.currentUser; if(!u) return alert('Přihlaste se');
    const text=document.getElementById('msgText').value.trim();
    let img=null; const f=document.getElementById('msgPhoto').files[0]; if(f) img=await fileToDataURL(f);
    if(!text && !img) return;
    const m={by:u.uid, ts:Date.now(), text, img};
    await db.ref('messages/'+getCity()).push(m);
    await db.ref('throttle/'+u.uid+'/lastTs').set(Date.now());
    document.getElementById('msgText').value=''; document.getElementById('msgPhoto').value=''; SND.ok.play();
  }catch(e){ console.error(e); SND.err.play(); }
});
