
// diagnostics.js
(function(){
  function start(){
    if(!(window.firebase && firebase.apps && firebase.apps.length)) return;
    const db = firebase.database();
    const out = document.getElementById('diagOut');
    function show(msg){ if(out){ out.textContent = msg; } console.log('[diag]', msg); }
    const pingBtn = document.getElementById('diagPing');
    const seedBtn = document.getElementById('diagSeed');
    if(pingBtn){
      pingBtn.addEventListener('click', async ()=>{
        try{
          const ref = db.ref('diagnostics/ping');
          const ts = Date.now();
          await ref.push({ts});
          show('Ping OK: '+ts);
        }catch(e){
          show('Ping ERR: '+(e && e.code ? e.code : e.message));
        }
      });
    }
    if(seedBtn){
      seedBtn.addEventListener('click', async ()=>{
        try{
          const city = (localStorage.getItem('city') || 'praha');
          const u = firebase.auth().currentUser;
          if(!u){ show('Seed ERR: not signed in'); return; }
          await db.ref('messages/'+city).push({by:u.uid, ts:Date.now(), text:'Test zpráva (seed)'});
          show('Seed OK to messages/'+city);
        }catch(e){
          show('Seed ERR: '+(e && e.code ? e.code : e.message));
        }
      });
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
