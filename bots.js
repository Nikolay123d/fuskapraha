// Bots (admin only)
function subBotsList(){
  if(!auth.currentUser) return;
  db.ref('bots').off();
  db.ref('bots').on('child_added', s=> renderBot(s.key, s.val()));
  db.ref('bots').on('child_changed', s=> renderBot(s.key, s.val(), true));
}

function renderBot(id, b, replace=false){
  const box=$('#botsList'); if(!box) return;
  const row=document.createElement('div'); row.className='msg'; row.dataset.id=id;
  row.innerHTML=`<div class="ava"><img src="${b.avatar||window.DEFAULT_AVATAR}"></div><div class="bubble"><div class="name">${b.owner} · кожні ${Math.round((b.interval||0)/60000)} хв</div><div>${(b.text||'')}</div><div class="row"><button data-stop="${id}">Зупинити</button></div></div>`;
  if(replace){ const old=$$(`#botsList .msg`).find(el=>el.dataset.id===id); if(old) old.replaceWith(row); else box.appendChild(row); } else { box.appendChild(row); }
  box.onclick = async e=>{
    const bid=e.target.dataset.stop; if(!bid) return;
    await db.ref('bots/'+bid).remove(); alert('Бота зупинено');
  };
}

document.addEventListener('DOMContentLoaded',()=>{
  $('#botOpen').addEventListener('click',()=>$('#botModal').hidden=false);
  $('#botClose').addEventListener('click',()=>$('#botModal').hidden=true);
  $('#botCreate').addEventListener('click',createBot);
  $('#botAvatarFile').addEventListener('change', async (e)=>{
    const f=e.target.files[0]; if(!f) return; const url=await fileToUrl(f); $('#botAvatarPrev').src=url; $('#botAvatarPrev').dataset.url=url;
  });
});

async function createBot(){
  if(!auth.currentUser || auth.currentUser.email!==window.ADMIN_EMAIL) return alert('Лише адмін');
  const text=$('#botText').value.trim(); const img=$('#botImageUrl').value.trim()||null; const interval=parseInt($('#botInterval').value,10)||900000;
  const avatar=$('#botAvatarPrev').dataset.url || window.DEFAULT_AVATAR;
  const bot={owner:auth.currentUser.uid, text, image:img||null, interval, avatar, city: (localStorage.getItem('city')||'praha'), next: Date.now()+interval};
  const ref = await db.ref('bots').push(bot);
  $('#botModal').hidden=true; $('#botText').value=''; $('#botImageUrl').value='';
  alert('Бота запущено');
}

// Simple client poller (demo)
setInterval(async ()=>{
  const now=Date.now();
  const snap=await db.ref('bots').get(); const bots=snap.val()||{};
  for(const id in bots){
    const b=bots[id];
    if(now >= (b.next||0)){
      const payload={by: b.owner, text:b.text||null, photo:b.image||null, ts:now, _bot:true};
      await db.ref('messages/'+(b.city||'praha')).push(payload);
      await db.ref('bots/'+id+'/next').set(now+(b.interval||900000));
    }
  }
}, 10000);
