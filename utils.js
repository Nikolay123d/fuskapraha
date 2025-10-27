window.$=(s,r=document)=>r.querySelector(s); window.$$=(s,r=document)=>Array.from(r.querySelectorAll(s));

// Closable toast, per user (not broadcast)
window.toast=(t)=>{
  let d=document.createElement('div'); d.className='toast closable';
  d.innerHTML = `<span>${t}</span><button class="toast-x" aria-label="Zavřít">✖</button>`;
  d.querySelector('.toast-x').onclick=()=>d.remove();
  document.body.appendChild(d); setTimeout(()=>d.remove(), 8000);
};

// Sound consent
function hasSoundConsent(){ try{return localStorage.getItem('sound_ok')==='1';}catch(e){return false;} }
function setSoundConsent(v){ try{localStorage.setItem('sound_ok', v?'1':'0');}catch(e){} }
function ensureSoundBanner(){
  if(hasSoundConsent()) return;
  const bar=document.createElement('div');
  bar.id='soundBanner';
  bar.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;display:flex;gap:8px;align-items:center;padding:10px;background:rgba(0,0,0,.9);border:1px solid rgba(255,255,255,.15);border-radius:12px;z-index:99999';
  bar.innerHTML=`🔔 Povolit zvuky webu? <div style="margin-left:auto;display:flex;gap:8px">
    <button id="sndAllow">Povolit</button><button id="sndLater">Později</button></div>`;
  document.body.appendChild(bar);
  bar.querySelector('#sndAllow').onclick=()=>{ setSoundConsent(true); try{new Audio().play().catch(()=>{});}catch(e){}; bar.remove(); };
  bar.querySelector('#sndLater').onclick=()=>{ setSoundConsent(false); bar.remove(); };
}
window.addEventListener('DOMContentLoaded', ensureSoundBanner);

// Sounds map (local files)
window.SND={
  chat: new Audio('./sounds/new_chat.wav'),
  dm: new Audio('./sounds/new_dm.wav'),
  ok: new Audio('./sounds/ok.wav'),
  err: new Audio('./sounds/err.wav'),
  celebration: new Audio('./sounds/celebration.wav'),
  play(name){ try{ if(!hasSoundConsent()) return; const a=this[name]; if(a){ a.currentTime=0; a.play().catch(()=>{}); } }catch(e){} }
};

// View switching
function showView(id){
  $$('.view').forEach(v=>v.classList.remove('active'));
  const el=$('#'+id); if(el){ el.classList.add('active'); localStorage.setItem('lastView',id); }
}
document.addEventListener('click',e=>{const t=e.target.closest('[data-view]'); if(!t) return; e.preventDefault(); showView(t.dataset.view)});
window.addEventListener('DOMContentLoaded',()=> showView(localStorage.getItem('lastView')||'view-chat'));

// Early wallpaper from cache to avoid flicker
(function(){
  try{
    const city=(localStorage.getItem('city')||'praha').toLowerCase();
    const url=localStorage.getItem('bg_'+city) || localStorage.getItem('bg_default');
    if(url){
      document.documentElement.style.setProperty('--wall', `url('${url}')`);
      document.body && (document.body.style.backgroundImage=`url('${url}')`);
    }
  }catch(e){}
})();

// Dasha greeting 10s (normalize Gmail: ignore dots)
function normalizeGmail(em){
  if(!em) return em;
  const m=em.toLowerCase().match(/^([^@]+)@gmail\.com$/);
  if(!m) return em.toLowerCase();
  const local=m[1].replace(/\./g,''); return local+'@gmail.com';
}
function bindGreeting(){
  const overlay=$('#greetOverlay'); if(!overlay) return;
  firebase.auth().onAuthStateChanged(u=>{
    if(!u){ overlay.hidden=true; return; }
    const em=normalizeGmail(u.email||'');
    overlay.hidden = (em!=='darausoan@gmail.com');
    if(!overlay.hidden){ window.SND.play('celebration'); setTimeout(()=> overlay.hidden=true, 10000); }
  });
  $('#greetClose')?.addEventListener('click',()=> $('#greetOverlay').hidden=true);
}
document.addEventListener('DOMContentLoaded', bindGreeting);

// City helpers
function getCity(){ const sel=$('#citySelect'); const saved=localStorage.getItem('city'); if(saved){ if(sel) sel.value=saved; return saved; } return sel? sel.value : 'praha'; }
function setCity(c){ localStorage.setItem('city',c); }
document.addEventListener('change',e=>{ if(e.target && e.target.id==='citySelect'){ setCity(e.target.value); }});
window.getCity=getCity;

// Small helper: file -> dataURL
window.readFileAsDataURL = (file)=> new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });