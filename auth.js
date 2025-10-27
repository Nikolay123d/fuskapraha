
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
