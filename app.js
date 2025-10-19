
const $ = (q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const escapeHtml = (s='')=>s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const safeUrl = (u)=>/^https?:\/\/[^\s]+$/i.test(u||'') ? u : null;
function toast(msg, ms=2400){ let el=document.createElement('div'); el.className='toast'; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(), ms); }

if(!localStorage.getItem('city')) localStorage.setItem('city','praha');
window.CURRENT_CITY = localStorage.getItem('city') || 'praha';
let autoAuthTimer=null;

document.addEventListener('DOMContentLoaded', ()=>{
  $('#tabs')?.addEventListener('click', (e)=>{ const b=e.target.closest('.tab'); if(!b) return; const t=b.getAttribute('data-tab'); if(!t) return;
    $$('.tabs .tab').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active')); $('#view-'+t)?.classList.add('active');
  });
  $('#citySelect')?.addEventListener('change', ()=>{ window.CURRENT_CITY=$('#citySelect').value; localStorage.setItem('city',window.CURRENT_CITY); resubscribeChats(); });
  $('#bellBtn')?.addEventListener('click', ()=> $('#notifPanel').hidden=!$('#notifPanel').hidden);
  $('#notifClose')?.addEventListener('click', ()=> $('#notifPanel').hidden=true);
  $('#notifClear')?.addEventListener('click', ()=> $('#notifList').innerHTML='');
  $('#profileBtn')?.addEventListener('click', ()=>{ if(!auth.currentUser) showAuth(true,false); else showModal('#profileModal',true)});
  $('#profileClose')?.addEventListener('click', ()=> showModal('#profileModal',false));
  $('#chatSend')?.addEventListener('click', ()=> requireAuthThen(sendChat));
  $('#rentSend')?.addEventListener('click', ()=> requireAuthThen(sendRent));
  $('#dmSend')?.addEventListener('click', ()=> requireAuthThen(sendDm));

  document.addEventListener('change', async(e)=>{
    const f=e.target?.files?.[0]; if(!f) return;
    const ok=/^image\/(png|jpe?g|webp)$/i.test(f.type||'') && f.size<=5*1024*1024; if(!ok){ toast('Фото: PNG/JPG/WebP до 5MB'); return; }
    const folder = e.target.id==='rentFile'?'rent_images':(e.target.id==='dmFile'?'dm_images':'chat_images');
    requireAuthThen(async()=>{
      try{ const ref=storage.ref().child(`${folder}/${auth.currentUser.uid}/${Date.now()}_${f.name}`);
        await ref.put(f); const url=await ref.getDownloadURL();
        if(e.target.id==='chatFile'){ window.__chatPhoto=url; $('#chatToast').hidden=false; }
        if(e.target.id==='rentFile'){ window.__rentPhoto=url; $('#rentToast').hidden=false; }
        if(e.target.id==='dmFile'){ window.__dmPhoto=url; }
      }catch(err){ toast('Помилка завантаження фото'); console.error(err); }
    });
  });

  $('#authClose')?.addEventListener('click', ()=> showAuth(false));
  $('#authSignin')?.addEventListener('click', async()=>{ try{
    await auth.signInWithEmailAndPassword($('#authEmail').value.trim(), $('#authPass').value); toast('Вхід успішний'); showAuth(false);
  }catch(e){ toast('Помилка входу'); $('#authMsg').textContent=e.message; }});
  $('#authSignup')?.addEventListener('click', async()=>{ try{
    await auth.createUserWithEmailAndPassword($('#authEmail').value.trim(), $('#authPass').value); toast('Реєстрація успішна. Перевірте Спам.'); showAuth(false);
  }catch(e){ toast('Помилка реєстрації'); $('#authMsg').textContent=e.message; }});
  $('#authReset')?.addEventListener('click', async()=>{ try{
    await auth.sendPasswordResetEmail($('#authEmail').value.trim()); toast('Лист відправлено. Перевірте Спам.'); 
  }catch(e){ toast('Не вдалося відправити лист'); $('#authMsg').textContent=e.message; }});

  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ showAuth(false); showModal('#profileModal',false); $('#notifPanel').hidden=true; } });

  resubscribeChats(); start30minGuestTimer();
});

function showModal(id, show=true){ const m=$(id); if(!m) return; m.hidden=!show; if(show){ m.style.removeProperty('display'); } else { m.style.display='none'; } }
function showAuth(show=true){ const m=$('#authModal'); if(!m) return; m.hidden=!show; }
function requireAuthThen(fn){ if(auth.currentUser) return fn(); showAuth(true,true); }

async function sendChat(){
  const city=window.CURRENT_CITY||'praha';
  let txt=($('#chatInput')?.value||'').trim();
  const urlRe=/(https?:\/\/[^\s]+?\.(png|jpe?g|webp|gif))/i; let photo=window.__chatPhoto||null;
  if(!photo){ const m=txt.match(urlRe); if(m){ photo=safeUrl(m[1]); txt=txt.replace(m[1],'').trim(); } }
  if(!txt && !photo) return;
  await db.ref('messages/'+city).push({text:txt||null,photo:photo||null,by:auth.currentUser.uid,ts:firebase.database.ServerValue.TIMESTAMP});
  if($('#chatInput')) $('#chatInput').value=''; window.__chatPhoto=null; $('#chatToast')&&($('#chatToast').hidden=true);
}
async function sendRent(){
  const city=window.CURRENT_CITY||'praha';
  let txt=($('#rentInput')?.value||'').trim();
  const urlRe=/(https?:\/\/[^\s]+?\.(png|jpe?g|webp|gif))/i; let photo=window.__rentPhoto||null;
  if(!photo){ const m=txt.match(urlRe); if(m){ photo=safeUrl(m[1]); txt=txt.replace(m[1],'').trim(); } }
  if(!txt && !photo) return;
  await db.ref('rentMessages/'+city).push({text:txt||null,photo:photo||null,by:auth.currentUser.uid,ts:firebase.database.ServerValue.TIMESTAMP});
  if($('#rentInput')) $('#rentInput').value=''; window.__rentPhoto=null; $('#rentToast')&&($('#rentToast').hidden=true);
}
async function sendDm(){
  let txt=($('#dmInput')?.value||'').trim(); let photo=window.__dmPhoto||null; if(!txt && !photo) return;
  const me=auth.currentUser.uid; const tid=`${me}_${me}`;
  await db.ref('privateMessages/'+tid).push({text:txt||null,photo:photo||null,by:me,ts:firebase.database.ServerValue.TIMESTAMP});
  $('#dmInput').value=''; window.__dmPhoto=null;
}

let chatRef=null, rentRef=null;
function renderMessage(container, v){
  const wrap=document.createElement('div'); wrap.className='msg';
  const ava=document.createElement('div'); ava.className='ava';
  const img=document.createElement('img'); img.src='https://i.pravatar.cc/32'; ava.appendChild(img);
  const b=document.createElement('div'); b.className='b';
  const name=document.createElement('div'); name.className='name'; name.textContent=(v.by||'user').slice(0,8);
  const text=document.createElement('div'); text.className='text';
  text.innerHTML=(v.text?escapeHtml(v.text):'') + (v.photo?`<div><img src="${escapeHtml(v.photo)}" alt=""></div>`:'');
  b.appendChild(name); b.appendChild(text); wrap.appendChild(ava); wrap.appendChild(b);
  container.appendChild(wrap); container.scrollTop=container.scrollHeight;
}
function resubscribeChats(){
  if(chatRef){ try{ chatRef.off(); }catch{} } if(rentRef){ try{ rentRef.off(); }catch{} }
  $('#chatFeed').innerHTML=''; $('#rentFeed').innerHTML='';
  const city=window.CURRENT_CITY||'praha';
  chatRef=db.ref('messages/'+city).limitToLast(200);
  rentRef=db.ref('rentMessages/'+city).limitToLast(200);
  chatRef.on('child_added', s=> renderMessage($('#chatFeed'), s.val()||{}));
  rentRef.on('child_added', s=> renderMessage($('#rentFeed'), s.val()||{}));
}

function start30minGuestTimer(){ if(autoAuthTimer) clearTimeout(autoAuthTimer); autoAuthTimer=setTimeout(()=>{ if(!auth.currentUser) showAuth(true,true); }, 30*60*1000); }
auth.onAuthStateChanged(async u=>{
  if(u){
    $('#myName').textContent=u.email||'Користувач'; $('#myPlan').textContent='none'; showAuth(false); start30minGuestTimer();
    try{ const plan=(await db.ref('users/'+u.uid+'/plan').get()).val()||'none'; $('#myPlan').textContent=plan; $('#premiumBox').style.display=(plan==='premium' || plan==='premium_plus')?'block':'none'; }catch{}
  } else { $('#premiumBox').style.display='none'; }
});
