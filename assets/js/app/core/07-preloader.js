// === Preloader control ===
function hidePreloader(){
  const p = $('#preloader');
  if(!p) return;
  // Keep the main preloader visible at least 7s after initial page load (prevents flash + premature mini-loader).
  try{
    if(!window.__PRELOADER_T0) window.__PRELOADER_T0 = Date.now();
    const minMs = 7000;
    const left = (window.__PRELOADER_T0 + minMs) - Date.now();
    if(left > 0){
      if(window.__PRELOADER_HIDE_TIMER__) return;
      window.__PRELOADER_HIDE_TIMER__ = setTimeout(()=>{
        try{ p.classList.add('hidden'); }catch(e){}
        try{ clearTimeout(window.__PRELOADER_HIDE_TIMER__); }catch(e){}
        window.__PRELOADER_HIDE_TIMER__ = null;
      }, left);
      return;
    }
  }catch(e){}
  p.classList.add('hidden');
}

