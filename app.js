/* v32: ban/unban + premium user bots (15m), admin unlimited, daily 100, dataURL/URL for avatar/photo; no Storage */
const $=(q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const DEFAULT_AVA='https://i.pravatar.cc/64';
const escapeHtml=(s='')=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
if(!localStorage.getItem('city')) localStorage.setItem('city','praha');
window.CURRENT_CITY=localStorage.getItem('city')||'praha';
let usersCache={}; let bannedCache={}; let myPlan='none'; let isAdmin=false;

function toast(t){ const el=document.createElement('div'); el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:16px;background:#111;padding:8px 12px;border:1px solid rgba(255,255,255,.2);border-radius:10px;z-index:60'; el.textContent=t; document.body.appendChild(el); setTimeout(()=>el.remove(),1800); }
function fileToDataURL(file){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=()=>rej(); fr.readAsDataURL(file); }); }

document.addEventListener('DOMContentLoaded',()=>{
  $('#tabs')?.addEventListener('click',e=>{const b=e.target.closest('.tab'); if(!b)return; const t=b.getAttribute('data-tab'); $$('.tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); $('#view-'+t)?.classList.add('active');});
  $('#citySelect')?.addEventListener('change',()=>{ window.CURRENT_CITY=$('#citySelect').value; localStorage.setItem('city',window.CURRENT_CITY); resubscribe(); applyWallpaper(); });
  $('#participantsBtn')?.addEventListener('click',()=>{ $('#peoplePanel').hidden=false; renderPeople(); }); $('#peopleClose')?.addEventListener('click',()=> $('#peoplePanel').hidden=true);
  $('#profileBtn')?.addEventListener('click',()=> showModal('#profileModal', true)); $('#profileClose')?.addEventListener('click',()=> showModal('#profileModal', false));
  $('#userCardClose')?.addEventListener('click',()=> showModal('#userCard', false));

  $('#chatSend')?.addEventListener('click',()=> requireAuthThen(sendChat));
  $('#dmSend')?.addEventListener('click',()=> requireAuthThen(sendDm));
  document.addEventListener('change', async(e)=>{
    const f=e.target?.files?.[0]; if(!f) return;
    const data=await fileToDataURL(f); 
    if(e.target.id==='chatFile') window.__chatPhoto=data;
    if(e.target.id==='dmFile') window.__dmPhoto=data;
    if(e.target.id==='botAvatarFile') window.__botAvatar=data;
    if(e.target.id==='botPhotoFile') window.__botPhoto=data;
    toast('Файл готовий');
  });

  // Bot buttons
  $('#botSave')?.addEventListener('click', ()=> requireAuthThen(saveBotTemplate));
  $('#botStart')?.addEventListener('click', ()=> requireAuthThen(()=> setBotEnabled(true)));
  $('#botStop')?.addEventListener('click', ()=> requireAuthThen(()=> setBotEnabled(false)));

  // Admin tools
  $('#btnBackfillUsersPublic')?.addEventListener('click', backfillUsersPublic);
  $('#btnFriendAdminAll')?.addEventListener('click', friendAdminAll);

  subUsers(); subBanned(); resubscribe(); initMap(); applyWallpaper(); startBotLoop();
});

function showModal(id,show=true){ const m=$(id); if(!m)return; m.hidden=!show; }
function requireAuthThen(fn){ if(auth.currentUser) return fn(); alert('Увійдіть/зареєструйтесь'); }

/* ===== Users & Participants with ban/unban ===== */
function subUsers(){
  db.ref('usersPublic').on('value', s=>{ usersCache = s.val()||{}; renderPeople(); });
}
function subBanned(){ db.ref('banned').on('value', s=>{ bannedCache = s.val()||{}; }); }
function renderPeople(){
  const list=$('#peopleList'); list.innerHTML='';
  Object.entries(usersCache).forEach(([uid,u])=>{
    const row=document.createElement('div'); row.className='msg'; row.setAttribute('data-uid', uid);
    const badge = (u.plan==='premium')?'<span class="badge">premium</span>':'';
    row.innerHTML = `<div class="ava"><img src="${u.avatar||DEFAULT_AVA}"></div>
      <div class="b"><div class="name">${escapeHtml(u.name||uid.slice(0,8))}${badge}</div><div class="muted">${u.email||''}</div></div>
      <div class="actions"></div>`;
    const actions=row.querySelector('.actions');
    if(isAdmin){
      const banBtn=document.createElement('button'); banBtn.textContent=(bannedCache&&bannedCache[uid])?'Разбан':'Забанити';
      banBtn.onclick=async(e)=>{ e.stopPropagation(); if(bannedCache && bannedCache[uid]) await db.ref('banned/'+uid).remove(); else await db.ref('banned/'+uid).set(true); };
      actions.appendChild(banBtn);
    }
    row.onclick=()=> openUserCard(uid);
    list.appendChild(row);
  });
}

/* ===== Messages ===== */
let chatRef=null, dmRef=null;
function renderMsg(v){
  const uid=v.by||'user';
  if(uid && bannedCache && bannedCache[uid]) return null;
  const up=usersCache[uid]||{};
  const el=document.createElement('div'); el.className='msg'; el.setAttribute('data-uid',uid);
  el.innerHTML = `<div class="ava"><img src="${up.avatar||DEFAULT_AVA}"></div>
    <div class="b"><div class="name">${up.name||uid.slice(0,8)}</div>
    <div class="text">${v.text?escapeHtml(v.text):''}${v.photo?`<div><img src="${v.photo}" style="max-width:260px;border-radius:8px;border:1px solid rgba(255,255,255,.14)"></div>`:''}</div></div>`;
  el.querySelector('.name').onclick=(e)=>{ e.stopPropagation(); openUserCard(uid); };
  return el;
}
function resubscribe(){
  if(chatRef){ try{chatRef.off();}catch{} } if(dmRef){ try{dmRef.off();}catch{} }
  $('#chatFeed').innerHTML=''; $('#dmMessages').innerHTML='';
  const city=window.CURRENT_CITY||'praha';
  chatRef=db.ref('messages/'+city).limitToLast(200);
  chatRef.on('child_added', s=>{ const v=s.val()||{}; const el=renderMsg(v); if(el){ $('#chatFeed').appendChild(el); $('#chatFeed').scrollTop=$('#chatFeed').scrollHeight; } });
}
async function sendChat(){
  if(auth.currentUser && bannedCache && bannedCache[auth.currentUser.uid]) return alert('Ви заблоковані.');
  const city=window.CURRENT_CITY||'praha';
  let txt=($('#chatInput').value||'').trim();
  let photo=window.__chatPhoto||null;
  const urlMatch=txt.match(/https?:\/\/\S+\.(png|jpe?g|gif|webp)/i);
  if(!photo && urlMatch){ photo=urlMatch[0]; txt=txt.replace(urlMatch[0],'').trim(); }
  if(!txt && !photo) return;
  await db.ref('messages/'+city).push({text:txt||null,photo:photo||null,by:auth.currentUser.uid,ts:firebase.database.ServerValue.TIMESTAMP});
  $('#chatInput').value=''; window.__chatPhoto=null;
}

/* ===== DM ===== */
function openUserCard(uid){
  const u=usersCache[uid]||{};
  $('#userCardName').textContent=u.name||uid.slice(0,8);
  $('#userCardAvatar').src=u.avatar||DEFAULT_AVA;
  $('#userCardInfo').textContent=u.email||'';
  window.__userCardUid=uid; showModal('#userCard', true);
}
$('#userCardOpenDm')?.addEventListener('click', ()=>{
  if(!window.__userCardUid) return;
  if(dmRef){ try{dmRef.off();}catch{} } $('#dmMessages').innerHTML='';
  const me=auth.currentUser?.uid; if(!me) return;
  const uid=window.__userCardUid; const tid=[me,uid].sort().join('_');
  dmRef=db.ref('privateMessages/'+tid).limitToLast(200);
  dmRef.on('child_added', s=>{ const v=s.val()||{}; const el=renderMsg(v); if(el){ $('#dmMessages').appendChild(el); $('#dmMessages').scrollTop=$('#dmMessages').scrollHeight; } });
  showModal('#userCard', false);
  $$('.tab').forEach(x=>x.classList.remove('active')); $$('[data-tab="dm"]')[0].classList.add('active');
  $$('.view').forEach(v=>v.classList.remove('active')); $('#view-dm').classList.add('active');
});
async function sendDm(){
  if(!window.__userCardUid) return alert('Виберіть співрозмовника');
  if(auth.currentUser && bannedCache && bannedCache[auth.currentUser.uid]) return alert('Ви заблоковані.');
  const me=auth.currentUser.uid; const uid=window.__userCardUid; const tid=[me,uid].sort().join('_');
  let txt=($('#dmInput').value||'').trim(); let photo=window.__dmPhoto||null;
  if(!txt && !photo) return;
  await db.ref('privateMessages/'+tid).push({text:txt||null,photo:photo||null,by:me,ts:firebase.database.ServerValue.TIMESTAMP});
  $('#dmInput').value=''; window.__dmPhoto=null;
}

/* ===== Map + wallpapers ===== */
let map;
function initMap(){ if(map) return; map=L.map('map').setView([50.0755,14.4378],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(map);
  $('#mapCenter')?.addEventListener('click', ()=> map.setView([50.0755,14.4378],12));
}
async function applyWallpaper(){
  try{
    const city=window.CURRENT_CITY||'praha';
    const cs=await db.ref('settings/theme/cityBackgrounds/'+city).get();
    const gs=await db.ref('settings/theme/wallUrl').get();
    const url=(cs.exists()?cs.val():(gs.exists()?gs.val():null))||'https://i.ibb.co/pr18RzG3/charles-bridge-prague.jpg';
    document.documentElement.style.setProperty('--wall', `url('${url}')`);
    $('#mapAdmin').style.display = (isAdmin?'block':'none');
  }catch(e){}
}

/* ===== Bots (user premium: ≥15m; admin unlimited). Stored in /bots/{uid} and /botsMeta/{uid} ===== */
async function saveBotTemplate(){
  const uid=auth.currentUser.uid;
  const plan=myPlan;
  const intervalMin = Math.max(15, parseInt($('#botInterval').value||'15',10));
  if(!isAdmin && plan!=='premium') return toast('Доступно лише для преміум');
  const bot = {
    city: $('#botCity').value||'praha',
    intervalMin,
    text: ($('#botText').value||'').trim()||null,
    photo: (window.__botPhoto || $('#botPhotoUrl').value.trim() || null),
    avatar: (window.__botAvatar || $('#botAvatarUrl').value.trim() || null),
    enabled: false,
    updatedAt: Date.now()
  };
  await db.ref('bots/'+uid).set(bot);
  toast('Шаблон збережено');
  window.__botPhoto=null; window.__botAvatar=null;
}
async function setBotEnabled(flag){
  const uid=auth.currentUser.uid;
  const plan=myPlan;
  if(!isAdmin && plan!=='premium') return toast('Доступно лише для преміум');
  const snap=await db.ref('bots/'+uid).get(); if(!snap.exists()) return toast('Спочатку збережіть шаблон');
  await db.ref('bots/'+uid+'/enabled').set(flag);
  $('#botStatus').textContent = flag?'Працює':'Зупинено';
  if(flag) toast('Бот запущений'); else toast('Бот зупинений');
}
function startBotLoop(){
  setInterval(async()=>{
    const me=auth.currentUser;
    if(!me) return;
    // Admin обробляє всіх, користувач — тільки себе
    let tasks={};
    if(isAdmin){
      const all=await db.ref('bots').get(); tasks=all.val()||{};
    } else {
      const mine=await db.ref('bots/'+me.uid).get(); if(mine.exists()){ tasks[me.uid]=mine.val(); }
    }
    const today = new Date(); const ymd = today.toISOString().slice(0,10);
    for(const uid in tasks){
      const b=tasks[uid]||{}; if(!b.enabled) continue;
      // premium gate for non-admin
      if(!isAdmin){
        const p=(await db.ref('users/'+uid+'/plan').get()).val()||'none';
        if(p!=='premium') continue;
      }
      const metaSnap=await db.ref('botsMeta/'+uid).get(); const meta=metaSnap.val()||{};
      const count = (meta.date===ymd)?(meta.count||0):0;
      if(!isAdmin && count>=100) { await db.ref('botsMeta/'+uid).set({date:ymd,count, last:(meta.last||0)}); continue; }
      const minInterval = isAdmin ? 1 : Math.max(15, parseInt(b.intervalMin||15,10));
      const now=Date.now(); const last=meta.last||0;
      if(now - last < minInterval*60*1000) continue;
      // Пост від імені користувача
      const city=b.city||'praha';
      const text=b.text||null; const photo=b.photo||null;
      await db.ref('messages/'+city).push({text, photo, by: uid, ts: firebase.database.ServerValue.TIMESTAMP});
      // Оновити лічильники
      const newCount = (count+1);
      await db.ref('botsMeta/'+uid).set({date:ymd, count:newCount, last:now});
      if(uid===me.uid) $('#botStatus').textContent = `Відправлено ${newCount}/100 за сьогодні`;
      // avatar note: показ аватара робиться через usersPublic; якщо заданий bot.avatar — підкажемо записати як аватар профілю
      if(b.avatar && !meta.avatarApplied){ await db.ref('usersPublic/'+uid+'/avatar').set(b.avatar); await db.ref('botsMeta/'+uid+'/avatarApplied').set(true); }
    }
  }, 15000); // чек раз у 15 сек
}

/* ===== Admin tools ===== */
async function backfillUsersPublic(){
  if(!isAdmin) return toast('Тільки адмін');
  const all=(await db.ref('users').get()).val()||{};
  for(const uid in all){
    const u=all[uid]||{};
    const pub={ name: u.name || (u.email||'Користувач'), avatar: u.avatar || DEFAULT_AVA, email: u.email || '', plan: (u.plan||'none') };
    await db.ref('usersPublic/'+uid).set(pub);
  }
  toast('usersPublic оновлено');
}
async function friendAdminAll(){
  if(!isAdmin) return toast('Тільки адмін');
  const me=auth.currentUser.uid;
  const people=(await db.ref('usersPublic').get()).val()||{};
  for(const uid in people){
    if(uid===me) continue;
    await db.ref('friends/'+me+'/'+uid).set({status:'accepted',ts:Date.now()});
    await db.ref('friends/'+uid+'/'+me).set({status:'accepted',ts:Date.now()});
  }
  toast('Дружба з усіма встановлена');
}

/* ===== Auth ===== */
auth.onAuthStateChanged(async u=>{
  if(u){
    isAdmin = (u.email===window.ADMIN_EMAIL);
    const priv=(await db.ref('users/'+u.uid).get()).val()||{};
    const upSnap=await db.ref('usersPublic/'+u.uid).get();
    if(!upSnap.exists()){
      await db.ref('usersPublic/'+u.uid).set({ name: priv.name||u.email||'Користувач', avatar: priv.avatar||DEFAULT_AVA, email: u.email||'', plan: priv.plan||'none' });
    }
    $('#myName').textContent = (priv.name||u.email||'Користувач');
    $('#myAvatar').src = (priv.avatar||DEFAULT_AVA);
    myPlan = (priv.plan||'none'); $('#myPlan').textContent = myPlan;
    // show/hide bots UI
    $('#botsBox').style.display = (isAdmin || myPlan==='premium') ? 'block' : 'none';
    // admin tools visibility
    $('#adminTools').style.display = isAdmin ? 'block' : 'none';
    $('#mapAdmin').style.display = isAdmin ? 'block' : 'none';
    applyWallpaper();
  }
});
