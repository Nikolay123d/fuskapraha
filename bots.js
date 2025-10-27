(function(){
  let timer=null;
  function isAdmin(u){ return u?.email === window.ADMIN_EMAIL; }

  async function tick(){
    const auth=firebase.auth(); const db=firebase.database();
    const u=auth.currentUser; if(!u) return;
    const cfg = JSON.parse(localStorage.getItem('BOT_CFG')||'null');
    if(!cfg || !cfg.enabled) return;
    if(!isAdmin(u) && (+cfg.interval < 15)) cfg.interval = 15; // non-admin limit

    const now=Date.now();
    const last=+(localStorage.getItem('BOT_LAST')||0);
    if(now-last < cfg.interval*60*1000) return;

    await db.ref('messages/'+(cfg.city||'praha')).push({
      by: u.uid, text: cfg.text||null, photo: cfg.image||null, ts: now
    });
    localStorage.setItem('BOT_LAST', String(now));
  }

  function startBot(city,text,image,intervalMin){
    localStorage.setItem('BOT_CFG', JSON.stringify({enabled:true,city,text,image,interval:+intervalMin||15}));
    if(timer) clearInterval(timer);
    timer=setInterval(tick, 15000);
    tick();
  }
  function stopBot(){
    localStorage.setItem('BOT_CFG', JSON.stringify({enabled:false}));
    if(timer) clearInterval(timer); timer=null;
  }

  document.addEventListener('click',(e)=>{
    if(e.target && e.target.id==='botStart'){
      const city=document.getElementById('botCity').value||'praha';
      const text=document.getElementById('botText').value||'';
      const image=document.getElementById('botImage').value||null;
      const interval=document.getElementById('botInterval').value||15;
      startBot(city,text,image,interval);
      alert('Бот запущений');
    }
    if(e.target && e.target.id==='botStop'){ stopBot(); alert('Бот зупинений'); }
  });
})();