
(function(){
  const db=firebase.database(); const auth=firebase.auth();
  const ADMIN = window.ADMIN_EMAIL;

  // UI hook
  document.addEventListener('click', async (e)=>{
    if(e.target && e.target.id==='botStart'){
      const u=auth.currentUser; if(!u) return;
      const city=document.getElementById('botCity').value.trim()||'praha';
      const text=document.getElementById('botText').value.trim()||'';
      const image=document.getElementById('botImage').value.trim()||null;
      let interval = parseInt(document.getElementById('botInterval').value||'15',10);
      const pub = await db.ref('usersPublic/'+u.uid).get(); const isAdmin=(u.email===ADMIN);
      if(!isAdmin && interval<15) interval=15; // enforce for non-admins
      const cfg={city,text,image,interval,enabled:true,lastTs:0};
      await db.ref('botConfigs/'+u.uid+'/default').set(cfg);
      document.getElementById('botHint').textContent='Бот запущено ('+interval+' хв.)';
    }
    if(e.target && e.target.id==='botStop'){
      const u=auth.currentUser; if(!u) return;
      await db.ref('botConfigs/'+u.uid+'/default/enabled').set(false);
      document.getElementById('botHint').textContent='Бот зупинено';
    }
  });

  // worker: every 30s check my bots
  setInterval(async ()=>{
    const u=auth.currentUser; if(!u) return;
    const snap=await db.ref('botConfigs/'+u.uid).get(); if(!snap.exists()) return;
    const cfgs=snap.val()||{};
    for(const id in cfgs){
      const c=cfgs[id]; if(!c.enabled) continue;
      const now=Date.now(); const need=(now - (c.lastTs||0)) >= (c.interval||15)*60*1000;
      if(!need) continue;
      // push message
      const pub=(await db.ref('usersPublic/'+u.uid).get()).val()||{};
      const obj={by:u.uid, ts:now}; if(c.text) obj.text=c.text; if(c.image) obj.photo=c.image;
      await db.ref('messages/'+(c.city||'praha')).push(obj);
      await db.ref('botConfigs/'+u.uid+'/'+id+'/lastTs').set(now);
    }
  }, 30000);
})();
