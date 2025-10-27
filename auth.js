
// auth.js
(function(){
  function start(){
    try{
      if(!(window.firebase && firebase.apps && firebase.apps.length)){
        console.error('Firebase not initialized (auth.js)'); return;
      }
      // If not signed in, try anonymous (debug fallback)
      firebase.auth().onAuthStateChanged(async (u)=>{
        if(!u){
          try{
            await firebase.auth().signInAnonymously();
            console.log('[auth] signed in anonymously');
          }catch(e){
            console.warn('[auth] anon sign-in failed:', e);
          }
        }else{
          // Show email/uid in profile
          const em = (u.email || '(anonymní)');
          const emailEl = document.getElementById('profileEmail');
          if(emailEl) emailEl.textContent = em + ' · ' + u.uid.slice(0,6);
        }
      });
    }catch(e){ console.error(e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// Ask for nick change
document.addEventListener('click', async (e)=>{
  if(e.target && e.target.id==='askNick'){
    const u=firebase.auth().currentUser; if(!u){ toast('Přihlaste se'); return; }
    const newNick = prompt('Zadejte nový nick:');
    if(!newNick) return;
    await firebase.database().ref('nickRequests/'+u.uid).set({newNick:newNick, ts: Date.now()});
    toast('Žádost odeslána ✅');
  }
});
