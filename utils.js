
window.$=(s,r=document)=>r.querySelector(s); window.$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
window.toast=(t)=>{const d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(),2200)};
window.SND={chat:new Audio('./sounds/new_chat.wav'), dm:new Audio('./sounds/new_dm.wav'), ok:new Audio('./sounds/ok.wav'), err:new Audio('./sounds/err.wav')};

function showView(id){ $$('.view').forEach(v=>v.classList.remove('active')); const el=$('#'+id); if(el){ el.classList.add('active'); localStorage.setItem('lastView',id);} }
document.addEventListener('click',e=>{const t=e.target.closest('[data-view]'); if(!t) return; e.preventDefault(); showView(t.dataset.view)});
window.addEventListener('DOMContentLoaded',()=> showView(localStorage.getItem('lastView')||'view-chat'));

// Wallpaper (no flicker)
(function(){ try{const w=localStorage.getItem('wall'); if(w){ document.body.style.background='#0b1416 url('+w+') center/cover fixed no-repeat'; }}catch(e){} })();
document.addEventListener('change',e=>{const t=e.target; if(t && t.id==='wallCamera'){ const f=t.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ localStorage.setItem('wall',r.result);}catch(e){}; document.body.style.background='#0b1416 url('+r.result+') center/cover fixed no-repeat'; toast('Pozadí bylo změněno'); }; r.readAsDataURL(f); }});

// Greeting for Dasha only after auth
function bindGreeting(){
  const overlay=$('#greetOverlay'); if(!overlay) return;
  firebase.auth().onAuthStateChanged(u=>{
    if(!u){ overlay.hidden=true; return; }
    const em=(u.email||'').toLowerCase();
    overlay.hidden = (em!=='darausoan@gmail.com');
  });
  $('#greetClose')?.addEventListener('click',()=> $('#greetOverlay').hidden=true);
});
bindGreeting();

// City state
function getCity(){ const sel=$('#citySelect'); const saved=localStorage.getItem('city'); if(saved){ if(sel) sel.value=saved; return saved; } return sel? sel.value : 'praha'; }
function setCity(c){ localStorage.setItem('city',c); }
document.addEventListener('change',e=>{ if(e.target && e.target.id==='citySelect'){ setCity(e.target.value); }});
window.getCity=getCity;
