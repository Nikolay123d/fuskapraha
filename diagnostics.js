
// diagnostics.js
(function(){

// --- auto UI inject ---
(function(){
  if (document.getElementById('diagPanel')) return;
  const wrap = document.createElement('div');
  wrap.id = 'diagPanel';
  wrap.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;background:#0e1a1f;color:#d7fbe8;border:1px solid #1f3b45;border-radius:10px;padding:10px;font:12px/1.2 system-ui;box-shadow:0 6px 24px rgba(0,0,0,.3)';
  wrap.innerHTML = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;"><b>Diag</b><button id="diagPing">Ping</button><button id="diagSeed">Seed</button><button id="diagClose" title="Hide">×</button></div><pre id="diagOut" style="margin:0;max-width:300px;max-height:160px;overflow:auto;"></pre>';
  document.body.appendChild(wrap);
  document.getElementById('diagClose').onclick = ()=> wrap.remove();
})();

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
