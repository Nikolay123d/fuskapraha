
const $=(q,r=document)=>r.querySelector(q);const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
function play(id){ try{$(id).currentTime=0; $(id).play();}catch(e){} }
function esc(s=''){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
let CITY='praha', CHAT_OFF=null;

document.addEventListener('DOMContentLoaded', ()=>{
  $('#notifBtn').addEventListener('click', async ()=>{
    const p = await Notification.requestPermission().catch(()=> 'denied');
    if(p==='granted'){ toast('Upozornění povolena'); } else { toast('Upozornění zakázána'); }
    ['#aNewChat','#aNewDM','#aOk'].forEach(id=>{ try{$(id).play().then(()=>$(id).pause());}catch(e){} });
  });
  $('#bgFile').addEventListener('change', onPickWallpaper);
  const wall = localStorage.getItem('wall'); if(wall){ document.body.style.background = `#0b1416 url(${wall}) center/cover fixed no-repeat`; }
  $('#chatSend').addEventListener('click', sendChat);
  $('#buyPremiumBtn').addEventListener('click', ()=> window.open('./payments/payments.html','_blank'));
  // Rent / Help
  $('#rentPost').addEventListener('click', postRent);
  $('#helpPost').addEventListener('click', postHelp);
  // Camera inputs success toast
  $('#chatFile').addEventListener('change', ()=> toast('Obrázek připraven k odeslání'));
  $('#rentFile').addEventListener('change', ()=> toast('Fotka přidána'));
  $('#helpFile').addEventListener('change', ()=> toast('Fotka přidána'));
  // Register SW
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
});

auth.onAuthStateChanged(async u=>{
  if(!u){ try{ await auth.signInAnonymously(); toast('Registrováno anonymně'); }catch(e){} return; }
  await ensurePublicProfile(u);
  await setupPresence(u);
  greetIfSpecial(u);
  subChat(); bindParticipants(); bindFriendRequests(); bindProfile(u);
  loadRent(); loadHelp(); loadFriends();
});

async function ensurePublicProfile(u){
  await db.ref('usersPublic/'+u.uid).transaction(v=>{
    v=v||{};
    v.name=v.name|| (u.email? u.email.split('@')[0]:'User');
    v.avatar=v.avatar||window.INIT_AVATAR;
    v.role=v.role||'user';
    v.email = u.email || v.email || null;
    v.createdAt = v.createdAt || Date.now();
    v.premium = v.premium || false;
    v.nickColor = v.nickColor || null;
    return v;
  });
}

async function setupPresence(u){
  const ref = db.ref('presence/'+u.uid);
  await ref.set(true);
  ref.onDisconnect().set(false);
}

// Wallpaper
async function onPickWallpaper(e){
  const f=e.target.files?.[0]; if(!f) return;
  const url = await toDataUrl(f);
  localStorage.setItem('wall', url);
  document.body.style.background = `#0b1416 url(${url}) center/cover fixed no-repeat`;
  toast('Tapeta uložena');
}
function toDataUrl(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}

// Chat
async function sendChat(){
  const u=auth.currentUser; if(!u) return;
  const ban = (await db.ref('bans/'+u.uid).get()).val();
  if (ban && ban.until && ban.until > Date.now()) { toast('Jste dočasně zabanován'); return; }
  const input=$('#chatInput'); const file=$('#chatFile');
  const text=(input.value||'').trim();
  let img=null; const f=file.files?.[0];
  if(!text && !f) return;
  if(f){
    if(f.size>2*1024*1024){ toast('Obrázek >2MB'); play('#aErr'); return; }
    img = await toDataUrl(f);
  }
  const by=u?.uid||'guest';
  const msg={ by, ts: Date.now() }; if(text) msg.text=text; if(img) msg.img=img;
  db.ref('messages/'+CITY).push(msg).then(()=>{
    input.value=''; file.value=''; play('#aOk'); toast(img?'Obrázek úspěšně přidán':'Zpráva odeslána');
    notify('Nová zpráva', { body: 'Zpráva byla odeslána.' });
  }).catch(e=>{ console.error(e); toast('Chyba při odesílání'); play('#aErr'); });
}

function subChat(){
  if (CHAT_OFF){ db.ref('messages/'+CITY).off('child_added', CHAT_OFF); CHAT_OFF=null; }
  const feed=$('#chatFeed'); feed.innerHTML='';
  const h = async s=>{
    const v=s.val()||{}; const up=(await db.ref('usersPublic/'+(v.by||'')).get()).val()||{};
    const isAd = !!up.ad; const premium = !!up.premium; const clr = up.nickColor||null;
    const nameHtml = `<span class="${premium?'premium':''}" style="${clr?`color:${clr}`:''}">${esc(up.name||v.by||'—')}</span>`;
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${up.avatar||window.INIT_AVATAR}"></div>
      <div class="bubble"><div class="name">${nameHtml}${isAd?' · <span class="reklama">REKLAMA</span>':''} · <span class="muted">${new Date(v.ts||Date.now()).toLocaleString('cs-CZ')}</span></div>
      ${v.text?`<div>${esc(v.text)}</div>`:''}${v.img?`<img class="chat-photo" src="${v.img}">`:''}
      <div class="row"><button data-like>👍</button><button data-dislike>👎</button><button data-report>⚠️</button><button data-dm>✉️</button></div></div>`;
    row.querySelector('[data-dm]').onclick=()=> openDmWith(v.by);
    row.querySelector('[data-report]').onclick=()=> db.ref('reports').push({by:auth.currentUser?.uid||'?', ts:Date.now(), type:'chat', ref:s.key});
    feed.appendChild(row); feed.scrollTop=feed.scrollHeight; play('#aNewChat');
  };
  db.ref('messages/'+CITY).limitToLast(50).on('child_added', h); CHAT_OFF=h;
}

// Participants & Friends + Presence
async function bindParticipants(){
  const box=$('#participantsList'); if(!box) return;
  box.innerHTML='';
  const s=await db.ref('usersPublic').limitToLast(300).get(); const all=s.val()||{};
  const pres=(await db.ref('presence').get()).val()||{};
  Object.entries(all).forEach(([uid, up])=>{
    const online = !!pres[uid];
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${up.avatar||window.INIT_AVATAR}"></div><div class="bubble">
      <div class="name">${esc(up.name||uid)} ${online?'· <span class="premium">online</span>':'· <span class="muted">offline</span>'}${up.ad?' · <span class="reklama">REKLAMA</span>':''}</div>
      <div class="row"><button data-add="${uid}">Přidat do přátel</button><button data-dm="${uid}">Napsat</button></div></div>`;
    row.querySelector('[data-add]').onclick=()=> sendFriendRequest(uid);
    row.querySelector('[data-dm]').onclick=()=> openDmWith(uid);
    box.appendChild(row);
  });
}
async function sendFriendRequest(toUid){
  const me=auth.currentUser?.uid; if(!me) return;
  await db.ref('friends/requests/'+toUid+'/'+me).set({from:me, ts:Date.now()});
  toast('Žádost odeslána'); play('#aOk'); notify('Žádost odeslána',{body:'Počkejte na potvrzení.'});
}
async function bindFriendRequests(){
  const me=auth.currentUser?.uid; if(!me) return;
  const box=$('#friendRequests'); box.innerHTML='';
  db.ref('friends/requests/'+me).on('value', async snap=>{
    box.innerHTML='';
    const list=snap.val()||{}; const entries=Object.entries(list);
    $('#notifCount').textContent = entries.length;
    $('#badge').hidden = entries.length===0;
    if(entries.length){ notify('Nová žádost o přátelství',{body:`Počet: ${entries.length}`}); play('#aNewDM'); }
    for(const [fromUid, r] of entries){
      const up=(await db.ref('usersPublic/'+fromUid).get()).val()||{};
      const row=document.createElement('div'); row.className='msg';
      row.innerHTML=`<div class="ava"><img src="${up.avatar||window.INIT_AVATAR}"></div>
        <div class="bubble"><div class="name">${esc(up.name||fromUid)}</div>
        <div class="row"><button data-accept="${fromUid}">Přijmout žádost</button><button data-dm="${fromUid}">Napsat</button></div></div>`;
      row.querySelector('[data-accept]').onclick=()=> acceptFriend(fromUid);
      row.querySelector('[data-dm]').onclick=()=> openDmWith(fromUid);
      box.appendChild(row);
    }
  });
}
async function acceptFriend(fromUid){
  const me=auth.currentUser?.uid; if(!me) return;
  await db.ref('friends/list/'+me+'/'+fromUid).set(true);
  await db.ref('friends/list/'+fromUid+'/'+me).set(true);
  await db.ref('friends/requests/'+me+'/'+fromUid).remove();
  toast('Přátelství potvrzeno'); play('#aOk'); notify('Přátelství potvrzeno',{body:'Napište první zprávu.'});
}

// Friends tab
async function loadFriends(){
  const me=auth.currentUser?.uid; if(!me) return;
  const box=$('#friendsList'); if(!box) return;
  const list=(await db.ref('friends/list/'+me).get()).val()||{};
  const pres=(await db.ref('presence').get()).val()||{};
  box.innerHTML='';
  for(const uid in list){
    const up=(await db.ref('usersPublic/'+uid).get()).val()||{};
    const online = !!pres[uid];
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${up.avatar||window.INIT_AVATAR}"></div>
      <div class="bubble"><div class="name">${esc(up.name||uid)} ${online?'· <span class="premium">online</span>':'· <span class="muted">offline</span>'}</div>
      <div class="row"><button data-dm="${uid}">Napsat</button></div></div>`;
    row.querySelector('[data-dm]').onclick=()=> openDmWith(uid);
    box.appendChild(row);
  }
}

// Profile quick action
function bindProfile(u){
  $('#profileBtn').onclick = async ()=>{
    const up=(await db.ref('usersPublic/'+u.uid).get()).val()||{};
    const url = prompt('Nová URL avataru', up.avatar||window.INIT_AVATAR);
    if(url){ await db.ref('usersPublic/'+u.uid+'/avatar').set(url); toast('Avatar uložen'); }
    if(up.premium){
      const col = prompt('Barva přezdívky (např. #ffd166 nebo red)', up.nickColor || '#ffd166');
      if(col){ await db.ref('usersPublic/'+u.uid+'/nickColor').set(col); toast('Barva nicku uložena'); }
    }
  };
}

// Rent / Help posting (no storage — base64 inline)
async function postRent(){
  const u=auth.currentUser; if(!u) return;
  const t=$('#rentTitle').value.trim(), c=$('#rentCity').value.trim(), p=$('#rentPrice').value.trim();
  if(!t) return toast('Nadpis povinný');
  const f=$('#rentFile').files?.[0]; let img=null; if(f){ if(f.size>2*1024*1024) return toast('Obrázek >2MB'); img=await toDataUrl(f); }
  const it={ by:u.uid, title:t, city:c||CITY, price:p||'', img, ts:Date.now() };
  await db.ref('rent').push(it); $('#rentTitle').value=''; $('#rentPrice').value=''; $('#rentCity').value=''; $('#rentFile').value=''; toast('Inzerát přidán'); play('#aOk'); loadRent();
}
async function loadRent(){
  const feed=$('#rentFeed'); if(!feed) return; feed.innerHTML='';
  const s=await db.ref('rent').limitToLast(100).get(); const all=s.val()||{};
  Object.entries(all).sort((a,b)=>a[1].ts-b[1].ts).forEach(([id,v])=>{
    const el=document.createElement('div'); el.className='msg';
    el.innerHTML=`<div class="ava"><img src="${window.INIT_AVATAR}"></div><div class="bubble">
      <div class="name">${esc(v.title||'Inzerát')} · <span class="muted">${v.city||CITY} · ${v.price?esc(v.price)+' Kč':''} · ${new Date(v.ts).toLocaleString('cs-CZ')}</span></div>
      ${v.img?`<img class="chat-photo" src="${v.img}">`:''}</div>`;
    feed.appendChild(el);
  });
}
async function postHelp(){
  const u=auth.currentUser; if(!u) return;
  const t=$('#helpTitle').value.trim(); if(!t) return toast('Text povinný');
  const f=$('#helpFile').files?.[0]; let img=null; if(f){ if(f.size>2*1024*1024) return toast('Obrázek >2MB'); img=await toDataUrl(f); }
  const it={ by:u.uid, title:t, img, ts:Date.now() };
  await db.ref('help').push(it); $('#helpTitle').value=''; $('#helpFile').value=''; toast('Položka přidána'); play('#aOk'); loadHelp();
}
async function loadHelp(){
  const feed=$('#helpFeed'); if(!feed) return; feed.innerHTML='';
  const s=await db.ref('help').limitToLast(100).get(); const all=s.val()||{};
  Object.entries(all).sort((a,b)=>a[1].ts-b[1].ts).forEach(([id,v])=>{
    const el=document.createElement('div'); el.className='msg';
    el.innerHTML=`<div class="ava"><img src="${window.INIT_AVATAR}"></div><div class="bubble">
      <div class="name">${esc(v.title||'Pomoc')} · <span class="muted">${new Date(v.ts).toLocaleString('cs-CZ')}</span></div>
      ${v.img?`<img class="chat-photo" src="${v.img}">`:''}</div>`;
    feed.appendChild(el);
  });
}

// Local notifications
function notify(title, opts={}){
  if(Notification?.permission==='granted'){
    navigator.serviceWorker?.getRegistration?.().then(reg=>{
      (reg && reg.showNotification)? reg.showNotification(title, opts): new Notification(title, opts);
    }).catch(()=> new Notification(title, opts));
  }
}

// Greeting
async function greetIfSpecial(u){
  const email=(u.email||'').toLowerCase();
  if (email === 'darausoan@gmail.com'){
    const o = $('#greetOverlay'); o.hidden=false;
    try{ $('#aCeleb').play(); }catch(e){}
    setTimeout(()=>{ o.hidden=true; }, 10000);
    const creator = await findUidByEmail(window.CREATOR_EMAIL);
    $('#greetAddFriend').onclick = ()=> creator && sendFriendRequest(creator);
    $('#greetWriteDM').onclick = ()=> creator && openDmWith(creator);
  }
}
async function findUidByEmail(email){
  const s = await db.ref('usersPublic').get(); const all = s.val()||{};
  for(const uid in all){ if((all[uid].email||'').toLowerCase()===email.toLowerCase()){ return uid; } }
  return null;
}
