/* v30 — без Firebase Storage, фото: URL или локальный файл (сжатый dataURL) */
const $ = (q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const escapeHtml = (s='')=>s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const DEFAULT_AVA='https://i.pravatar.cc/64'; // дефолтный аватар

if(!localStorage.getItem('city')) localStorage.setItem('city','praha');
window.CURRENT_CITY = localStorage.getItem('city') || 'praha';
const usersCache={};

function toast(t){ const el=document.createElement('div'); el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:20px;background:rgba(0,0,0,.8);padding:8px 14px;border:1px solid rgba(255,255,255,.2);border-radius:10px;z-index:50'; el.textContent=t; document.body.appendChild(el); setTimeout(()=>el.remove(),1800); }
const isImgUrl = u=>/^https?:\/\/[^\s]+?\.(png|jpe?g|webp|gif)$/i.test(u||'');

/* ===== File -> resized dataURL (без Storage) ===== */
function fileToDataURL(file, maxSide=1024, quality=0.85){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const c=document.createElement('canvas'); const ctx=c.getContext('2d');
        let w=img.naturalWidth, h=img.naturalHeight;
        if(Math.max(w,h)>maxSide){ if(w>h){ h=Math.round(h*maxSide/w); w=maxSide; } else { w=Math.round(w*maxSide/h); h=maxSide; } }
        c.width=w; c.height=h; ctx.drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/webp', quality));
      };
      img.onerror=()=>reject(new Error('bad image'));
      img.src=fr.result;
    };
    fr.onerror=()=>reject(new Error('read error'));
    fr.readAsDataURL(file);
  });
}

/* ===== UI wiring ===== */
document.addEventListener('DOMContentLoaded', ()=>{
  $('#tabs')?.addEventListener('click',(e)=>{ const b=e.target.closest('.tab'); if(!b) return; const t=b.getAttribute('data-tab'); $$('.tabs .tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); $('#view-'+t)?.classList.add('active'); });
  $('#citySelect')?.addEventListener('change',()=>{ window.CURRENT_CITY=$('#citySelect').value; localStorage.setItem('city',window.CURRENT_CITY); resubscribe(); initMap(); });
  $('#participantsBtn')?.addEventListener('click',()=>{ $('#peoplePanel').hidden=false; renderPeople(); }); $('#peopleClose')?.addEventListener('click',()=> $('#peoplePanel').hidden=true);
  $('#bellBtn')?.addEventListener('click',()=> $('#notifPanel').hidden=!$('#notifPanel').hidden); $('#notifClose')?.addEventListener('click',()=> $('#notifPanel').hidden=true); $('#notifClear')?.addEventListener('click',()=> $('#notifList').innerHTML='');
  $('#profileBtn')?.addEventListener('click',()=> showModal('#profileModal', true)); $('#profileClose')?.addEventListener('click',()=> showModal('#profileModal', false));
  $('#userCardClose')?.addEventListener('click',()=> showModal('#userCard', false));

  // send buttons
  $('#chatSend')?.addEventListener('click',()=> requireAuthThen(sendChat));
  $('#rentSend')?.addEventListener('click',()=> requireAuthThen(sendRent));
  $('#dmSend')?.addEventListener('click',()=> requireAuthThen(sendDm));

  // photo pickers (to dataURL)
  document.addEventListener('change', async(e)=>{
    const f=e.target?.files?.[0]; if(!f) return;
    requireAuthThen(async()=>{
      try{
        const dataUrl=await fileToDataURL(f,1024,0.85);
        if(e.target.id==='chatFile') window.__chatPhoto=dataUrl;
        if(e.target.id==='rentFile') window.__rentPhoto=dataUrl;
        if(e.target.id==='dmFile') window.__dmPhoto=dataUrl;
        toast('Фото готове');
      }catch{ toast('Не вдалося обробити фото'); }
    });
  });

  subUsers(); resubscribe(); initMap();
});

function showModal(id,show=true){ const m=$(id); if(!m) return; m.hidden=!show; }
function requireAuthThen(fn){ if(auth.currentUser) return fn(); alert('Увійдіть/зареєструйтесь, щоб писати.'); }

/* ===== Users cache ===== */
function subUsers(){
  db.ref('usersPublic').on('value', s=>{
    const val=s.val()||{}; Object.assign(usersCache, val);
  });
}
function renderPeople(){
  const list=$('#peopleList'); list.innerHTML='';
  Object.entries(usersCache).forEach(([uid,v])=>{
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${v.avatar||DEFAULT_AVA}"></div><div class="b"><div class="name">${escapeHtml(v.name||uid.slice(0,8))}</div></div>`;
    row.onclick=()=> openUserCard(uid);
    list.appendChild(row);
  });
}
function openUserCard(uid){
  const v=usersCache[uid]||{};
  $('#userCardName').textContent=v.name||uid.slice(0,8);
  $('#userCardAvatar').src=v.avatar||DEFAULT_AVA;
  $('#userCardInfo').textContent=v.email||'';
  window.__userCardUid=uid;
  showModal('#userCard', true);
}

/* ===== Messages ===== */
function msgHtml(v){
  const uid=v.by||'user';
  const wrap=document.createElement('div'); wrap.className='msg';
  wrap.innerHTML=`<div class="ava"><img src="${(usersCache[uid]?.avatar)||DEFAULT_AVA}"></div>
  <div class="b"><div class="name">${(usersCache[uid]?.name)||uid.slice(0,8)}</div>
  <div class="text">${v.text?escapeHtml(v.text):''}${v.photo?`<div><img src="${v.photo}" /></div>`:''}</div></div>`;
  // клик по нику — карточка
  wrap.querySelector('.name').onclick=()=> openUserCard(uid);
  return wrap;
}
function renderMessage(container,v){ container.appendChild(msgHtml(v)); container.scrollTop=container.scrollHeight; }

async function sendChat(){
  const city=window.CURRENT_CITY||'praha';
  let txt=$('#chatInput').value.trim(); let photo=window.__chatPhoto||null;
  if(!photo && isImgUrl(txt)){ photo=txt; txt=''; }
  if(!txt && !photo) return;
  await db.ref('messages/'+city).push({text:txt||null,photo:photo||null,by:auth.currentUser.uid,ts:firebase.database.ServerValue.TIMESTAMP});
  $('#chatInput').value=''; window.__chatPhoto=null;
}
async function sendRent(){
  const city=window.CURRENT_CITY||'praha';
  let txt=$('#rentInput').value.trim(); let photo=window.__rentPhoto||null;
  if(!photo && isImgUrl(txt)){ photo=txt; txt=''; }
  if(!txt && !photo) return;
  await db.ref('rentMessages/'+city).push({text:txt||null,photo:photo||null,by:auth.currentUser.uid,ts:firebase.database.ServerValue.TIMESTAMP});
  $('#rentInput').value=''; window.__rentPhoto=null;
}
async function sendDm(){
  if(!window.__dmPeer){ alert('Виберіть співрозмовника'); return; }
  let txt=$('#dmInput').value.trim(); let photo=window.__dmPhoto||null;
  if(!txt && !photo) return;
  const me=auth.currentUser.uid; const uid=window.__dmPeer; const tid=[me,uid].sort().join('_');
  await db.ref('privateMessages/'+tid).push({text:txt||null,photo:photo||null,by:me,ts:firebase.database.ServerValue.TIMESTAMP});
  $('#dmInput').value=''; window.__dmPhoto=null;
}

/* ===== Live subscriptions ===== */
let chatRef=null, rentRef=null, dmRef=null;
function resubscribe(){
  if(chatRef){ try{ chatRef.off(); }catch{} } if(rentRef){ try{ rentRef.off(); }catch{} }
  $('#chatFeed').innerHTML=''; $('#rentFeed').innerHTML='';
  const city=window.CURRENT_CITY||'praha';
  chatRef=db.ref('messages/'+city).limitToLast(200);
  rentRef=db.ref('rentMessages/'+city).limitToLast(200);
  chatRef.on('child_added', s=> renderMessage($('#chatFeed'), s.val()||{}));
  rentRef.on('child_added', s=> renderMessage($('#rentFeed'), s.val()||{}));
}

/* ===== DM open from user card ===== */
$('#userCardOpenDm')?.addEventListener('click', ()=>{
  if(!window.__userCardUid) return; window.__dmPeer=window.__userCardUid;
  showModal('#userCard', false);
  $$('.tabs .tab').forEach(x=>x.classList.remove('active')); $$('[data-tab="dm"]')[0].classList.add('active');
  $$('.view').forEach(v=>v.classList.remove('active')); $('#view-dm').classList.add('active');
  openDmWith(window.__dmPeer);
});

function openDmWith(uid){
  if(dmRef){ try{ dmRef.off(); }catch{} } $('#dmMessages').innerHTML='';
  const me=auth.currentUser?.uid; if(!me) return;
  const tid=[me,uid].sort().join('_');
  dmRef=db.ref('privateMessages/'+tid).limitToLast(200);
  dmRef.on('child_added', s=> renderMessage($('#dmMessages'), s.val()||{}));
  $('#dmHeader').textContent=(usersCache[uid]?.name)||uid.slice(0,8);
}

/* ===== Map (OSM) ===== */
let map;
function initMap(){
  if(map) return;
  map = L.map('map').setView([50.0755, 14.4378], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(map);
  $('#mapCenter')?.addEventListener('click', ()=> map.setView([50.0755, 14.4378], 12));
}

/* ===== Auth state ===== */
auth.onAuthStateChanged(async u=>{
  if(u){
    $('#myName').textContent=u.email||'Користувач';
    const prof=(await db.ref('users/'+u.uid).get()).val()||{};
    if(prof.name) $('#myName').textContent=prof.name;
    $('#myAvatar').src = prof.avatar || DEFAULT_AVA;
    // auto add usersPublic record if missing
    if(!(await db.ref('usersPublic/'+u.uid).get()).exists()){
      await db.ref('usersPublic/'+u.uid).set({name: prof.name||u.email||'Користувач', avatar: prof.avatar||DEFAULT_AVA, email: u.email||''});
    }
  }
});

