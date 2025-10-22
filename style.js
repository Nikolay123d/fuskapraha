function setCookie(n,v,days=365){const d=new Date(Date.now()+days*864e5).toUTCString();document.cookie=`${n}=${encodeURIComponent(v)};expires=${d};path=/`;}
function getCookie(n){return document.cookie.split('; ').find(x=>x.startsWith(n+'='))?.split('=')[1]||null;}


const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
function toast(t){const g=$('#globalToast');g.textContent=t;g.hidden=false;setTimeout(()=>g.hidden=true,2500);}

document.addEventListener('DOMContentLoaded',()=>{
  $('#tabs').addEventListener('click',(e)=>{
    const t=e.target.closest('.tab'); if(!t) return;
    $$('.tab').forEach(b=>b.classList.toggle('active', b===t));
    const name=t.dataset.tab;
    $$('.view').forEach(v=>v.classList.remove('active'));
    $('#view-'+name).classList.add('active');
  
  const cs=$('#citySelect');
  const savedCity=localStorage.getItem('city')||'praha';
  if(cs){ cs.value=savedCity; cs.onchange=()=>{ localStorage.setItem('city', cs.value); window.setCity && window.setCity(cs.value); }; }


  const soundAllowed = localStorage.getItem('soundAllowed') || getCookie('soundAllowed');
  if(!soundAllowed){
    setTimeout(async ()=>{
      try{
        const p = await Notification.requestPermission();
        if(p==='granted'){ localStorage.setItem('notifAllowed','1'); setCookie('notifAllowed','1'); }
      }catch(e){}
      const a=document.createElement('audio'); a.src='./sounds/ok.wav';
      a.play().then(()=>{ a.pause(); localStorage.setItem('soundAllowed','1'); setCookie('soundAllowed','1');}).catch(()=>{});
    }, 800);
  }

});
  $('#toggleTop').onclick=()=>{
    const b=$('#topButtons');
    b.style.display=(getComputedStyle(b).display==='none'?'flex':'none');
  };
  const saved=localStorage.getItem('theme');
  if(saved) document.documentElement.setAttribute('data-theme', saved);
  const themeSel=$('#themeSelect');
  if(themeSel){
    themeSel.value=saved||'dark';
    themeSel.onchange=()=>{
      const v=themeSel.value;
      document.documentElement.setAttribute('data-theme', v);
      localStorage.setItem('theme', v);
    };
  }

  const cs=$('#citySelect');
  const savedCity=localStorage.getItem('city')||'praha';
  if(cs){ cs.value=savedCity; cs.onchange=()=>{ localStorage.setItem('city', cs.value); window.setCity && window.setCity(cs.value); }; }


  const soundAllowed = localStorage.getItem('soundAllowed') || getCookie('soundAllowed');
  if(!soundAllowed){
    setTimeout(async ()=>{
      try{
        const p = await Notification.requestPermission();
        if(p==='granted'){ localStorage.setItem('notifAllowed','1'); setCookie('notifAllowed','1'); }
      }catch(e){}
      const a=document.createElement('audio'); a.src='./sounds/ok.wav';
      a.play().then(()=>{ a.pause(); localStorage.setItem('soundAllowed','1'); setCookie('soundAllowed','1');}).catch(()=>{});
    }, 800);
  }

});
