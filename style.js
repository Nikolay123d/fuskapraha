// Minor UI helpers
const $ = (q, r=document)=>r.querySelector(q);
const $$ = (q, r=document)=>Array.from(r.querySelectorAll(q));
function toast(t){ const g = $('#globalToast'); g.textContent = t; g.hidden = false; setTimeout(()=>g.hidden=true, 2200); }

document.addEventListener('DOMContentLoaded', ()=>{
  // Tabs switching
  $('#tabs').addEventListener('click', (e)=>{
    const t = e.target.closest('.tab'); if(!t) return;
    $$('.tab').forEach(b=>b.classList.toggle('active', b===t));
    const name = t.dataset.tab;
    $$('.view').forEach(v=>v.classList.remove('active'));
    $('#view-'+name).classList.add('active');
  });

  $('#toggleTabs').addEventListener('click', ()=>{
    const bar = $('#tabs');
    bar.style.display = (getComputedStyle(bar).display==='none' ? 'flex' : 'none');
  });
});
