
// bootstrap.js — safe startup layer for local file:// runs
(function(){
  function log(...a){ try{ console.log('[bootstrap]', ...a); }catch(e){} }
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }
  function ensureCity(){
    try{
      const sel = document.getElementById('citySelect');
      let v = (localStorage.getItem('city') || (sel && sel.value) || 'praha');
      const map = { 'Praha':'praha', 'Brno':'brno', 'Ostrava':'ostrava' };
      if(map[v]) v = map[v];
      v = (v||'praha').toLowerCase();
      localStorage.setItem('city', v);
      if(sel && sel.value !== (map[v] || v)) { sel.value = (map[v] || 'Praha'); }
      if(!window.getCity){ window.getCity = ()=> (localStorage.getItem('city') || 'praha'); }
    }catch(e){ log('ensureCity ERR', e); }
  }
  function ensureLocale(){
    try{
      if(typeof window.localeCS === 'undefined' && typeof localeCS !== 'undefined'){
        window.localeCS = localeCS;
      }
    }catch(e){}
  }
  function ensureAuth(cb){
    if(!(window.firebase && firebase.apps && firebase.apps.length)){
      log('Firebase app not ready yet'); cb && cb(); return;
    }
    const auth = firebase.auth();
    let done = false;
    auth.onAuthStateChanged(function(u){
      if(done) return;
      done = true;
      if(u){ log('Auth OK', u.uid); cb && cb(); }
      else{
        auth.signInAnonymously().then(()=>{ log('Signed in anon'); cb && cb(); })
          .catch(e=>{ log('Anon sign-in ERR', e && e.code || e); cb && cb(); });
      }
    });
  }

  window.addEventListener('error', function(e){
    try{ console.log('[JS-ERROR]', e.message, e.filename, e.lineno); }catch(_){}
  });

  ready(function(){
    ensureLocale();
    ensureCity();
    ensureAuth(function(){
      document.dispatchEvent(new CustomEvent('app-bootstrap-ready'));
    });
  });
})();
