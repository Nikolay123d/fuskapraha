
function startUserBotLoop(){
  const run = async()=>{
    try{
      const u=auth.currentUser; if(!u) return;
      const snap=await db.ref('userBots/'+u.uid).get(); const b=snap.val(); if(!b || !b.enabled) return;
      const mins=Math.max(15, parseInt(b.interval||15,10)); const city=b.city||'praha'; const now=Date.now();
      // transaction guard
      let can=false;
      await db.ref('userBotsLast/'+u.uid).transaction(prev=>{
        if(!prev || now - prev > mins*60*1000){ can=true; return now; }
        return; // abort
      });
      if(!can) return;
      const text=b.text||'Привіт від мого бота'; const photo=b.image||null;
      await db.ref('messages/'+city).push({text, photo:photo||null, by:u.uid, ts:firebase.database.ServerValue.TIMESTAMP});
      const tid=`${u.uid}_${u.uid}`;
      await db.ref('privateMessages/'+tid).push({text:`[BOT] ${text}`, photo:photo||null, by:u.uid, ts:firebase.database.ServerValue.TIMESTAMP});
    }catch(e){ /* silent */ }
  };
  if(window.__userBotTimer) clearInterval(window.__userBotTimer);
  window.__userBotTimer=setInterval(run, 20000);
  run();
}

document.addEventListener('click', async(e)=>{
  if(e.target && e.target.id==='botSave'){
    const u=auth.currentUser; if(!u) return;
    const cfg={ city: ($('#botCity').value||'praha').trim(), interval: Math.max(15, parseInt($('#botInterval').value||'15',10)), text: ($('#botText').value||'').trim(), image: ($('#botImage').value||'').trim(), enabled: true };
    await db.ref('userBots/'+u.uid).set(cfg); startUserBotLoop();
  }
  if(e.target && e.target.id==='botToggle'){
    const u=auth.currentUser; if(!u) return;
    const s=await db.ref('userBots/'+u.uid).get(); const b=s.val()||{}; b.enabled=!b.enabled; await db.ref('userBots/'+u.uid).set(b);
  }
});

auth.onAuthStateChanged(u=>{ if(u) startUserBotLoop(); });
