// ==== Прості боти (зберігаються в settings/bots/<botId>)
const db=firebase.database();

async function adminOrDie(){ if(!(await (async()=>{ const u=firebase.auth().currentUser; if(!u) return false; const a=(await db.ref('settings/admins/'+u.uid).get()).val()===true; const em=(u.email||'').toLowerCase(); return a || em==='urciknikolaj642@gmail.com' || em==='darausoan@gmail.com'; })())){ alert('Тільки для адміна'); return false; } return true; }

document.getElementById('botCreate').onclick=async()=>{
  if(!await adminOrDie()) return;
  const nick=document.getElementById('botNick').value.trim() || 'Бот';
  const avatar=document.getElementById('botAvatar').value.trim() || 'public/images/avatar.jpg';
  const text=document.getElementById('botText').value.trim();
  const image=document.getElementById('botImage').value.trim() || null;
  const intervalMin=Number(document.getElementById('botInterval').value||'3');
  const id='bot_'+nick.replace(/\s+/g,'_').toLowerCase();
  await db.ref('settings/bots/'+id).set({nick,avatar,text,image,intervalMin});
  renderBots();
  alert('Збережено');
};

document.getElementById('botPostOnce').onclick=async()=>{
  if(!await adminOrDie()) return;
  const nick=document.getElementById('botNick').value.trim()||'Бот';
  const avatar=document.getElementById('botAvatar').value.trim()||'public/images/avatar.jpg';
  const text=document.getElementById('botText').value.trim()||'';
  const image=document.getElementById('botImage').value.trim()||null;
  await db.ref('messages').push({uid:'bot',nick,avatar,text,image,ts:Date.now()});
  alert('Опубліковано');
};

async function renderBots(){
  const box=document.getElementById('botList'); box.innerHTML='';
  const s=await db.ref('settings/bots').get(); const v=s.val()||{};
  Object.keys(v).forEach(id=>{
    const b=v[id]; const card=document.createElement('div'); card.className='bot-card';
    card.innerHTML=`<div><b>${b.nick}</b> — кожні ${b.intervalMin} хв</div><div style="font-size:13px;color:#64748b">${b.text}</div>`;
    box.appendChild(card);
  });
}
renderBots();

// Клієнтський планувальник для адміна (постить кожні N хв, поки вкладка відкрита)
(async function runScheduler(){
  const u = await new Promise(res=> firebase.auth().onAuthStateChanged(res));
  const em=(u?.email||'').toLowerCase();
  const isAdmin = u && ((await db.ref('settings/admins/'+u.uid).get()).val()===true || em==='urciknikolaj642@gmail.com' || em==='darausoan@gmail.com');
  if(!isAdmin) return;
  db.ref('settings/bots').on('value', snap=>{
    const bots=snap.val()||{};
    Object.keys(bots).forEach(id=>{
      const b=bots[id];
      const key='bot_timer_'+id;
      if(window[key]) clearInterval(window[key]);
      window[key]=setInterval(async()=>{
        await db.ref('messages').push({uid:id,nick:b.nick,avatar:b.avatar,text:b.text,image:b.image||null,ts:Date.now()});
      }, Math.max(1,b.intervalMin)*60*1000);
    });
  });
})();
