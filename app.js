// ========= Helpers =========
const $ = (q, r=document)=>r.querySelector(q);
const $$ = (q, r=document)=>Array.from(r.querySelectorAll(q));
const defAvatar = window.DEFAULT_AVATAR;
let CURRENT_CITY = localStorage.getItem('city') || 'praha';
let unsubChat = null;

// Escape
function esc(s=''){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ========= Startup =========
document.addEventListener('DOMContentLoaded', ()=>{
  // city select
  $('#citySelect').value = CURRENT_CITY;
  $('#citySelect').addEventListener('change', ()=>{
    CURRENT_CITY = $('#citySelect').value;
    localStorage.setItem('city', CURRENT_CITY);
    subChat(); // reload feed for city
  });

  // login anonymously if needed (prevents undefined uid pushes)
  auth.onAuthStateChanged(u=>{
    if(!u){ auth.signInAnonymously().catch(()=>{}); }
    buildMe(u);
    subChat();
    seedDefaultBank();
  });

  // composer
  const input = $('#chatInput');
  const file  = $('#chatFile');
  $('#chatSend').addEventListener('click', async ()=>{
    const text = (input.value||'').trim();
    let img = null;
    const f = file.files?.[0];
    if (!text && !f) return;
    if (f) {
      // Convert to dataURL (<=2MB enforced)
      if (f.size > 2*1024*1024) { toast('Фото > 2MB'); return; }
      img = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
    }
    const u = auth.currentUser;
    const by = u?.uid || 'guest';
    const msg = { by: by, ts: Date.now() };
    if (text) msg.text = text;
    if (img) msg.img = img;
    // NEVER push undefined fields
    await db.ref('messages/'+CURRENT_CITY).push(msg)
      .then(()=>{ input.value=''; file.value=''; playOk(); })
      .catch(err=>{ console.error(err); toast('Помилка відправки'); playErr(); });
  });

  // notifications sound permission (simple)
  $('#notifBtn').addEventListener('click', ()=>{
    [$('#aNewChat'), $('#aNewDM'), $('#aOk')].forEach(a=>{ try{ a.play().then(()=>a.pause()); }catch(e){} });
    toast('Звуки активовані');
  });
});

function buildMe(u){
  if(!u) return;
  const uid = u.uid;
  // ensure public profile exists
  db.ref('usersPublic/'+uid).transaction(v=>{
    v = v||{};
    v.name = v.name || ('Нік');
    v.avatar = v.avatar || defAvatar;
    v.role = v.role || 'seeker';
    v.plan = v.plan || 'free';
    return v;
  });
}

// ========= Chat =========
function subChat(){
  if (unsubChat) { db.ref('messages/'+CURRENT_CITY).off('child_added', unsubChat); unsubChat=null; }
  const feed = $('#chatFeed'); feed.innerHTML = '';
  const ref = db.ref('messages/'+CURRENT_CITY).limitToLast(50);
  const handler = async (s)=>{
    const v = s.val()||{};
    const up = (await db.ref('usersPublic/'+(v.by||'')).get()).val()||{};
    const row = document.createElement('div'); row.className='msg';
    const name = esc(up.name || v.by || '—');
    row.innerHTML = `<div class="ava"><img src="${esc(up.avatar||defAvatar)}"></div>
      <div class="bubble">
        <div class="name">${name} · <span class="muted">${new Date(v.ts||Date.now()).toLocaleString()}</span></div>
        ${v.text?`<div>${esc(v.text)}</div>`:''}
        ${v.img?`<img class="chat-photo" src="${v.img}">`:''}
      </div>`;
    feed.appendChild(row);
    feed.scrollTop = feed.scrollHeight;
    playNewChat();
  };
  ref.on('child_added', handler);
  unsubChat = handler;
}

// ========= Sounds =========
function playNewChat(){ try{ $('#aNewChat').play(); }catch(e){} }
function playOk(){ try{ $('#aOk').play(); }catch(e){} }
function playErr(){ try{ $('#aErr').play(); }catch(e){} }

// ========= Board (simple demo) =========
document.addEventListener('DOMContentLoaded', ()=>{
  $('#boardForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const u = auth.currentUser; if(!u){ toast('Увійдіть'); return; }
    const ad = {
      by: u.uid,
      title: ($('#adTitle').value||'').trim(),
      link: ($('#adLink').value||'').trim() || null,
      text: ($('#adText').value||'').trim() || null,
      img: ($('#adImg').value||'').trim() || null,
      ts: Date.now(), city: CURRENT_CITY
    };
    // remove undefined keys
    Object.keys(ad).forEach(k=>ad[k]===undefined && delete ad[k]);
    await db.ref('board').push(ad).then(()=>{
      $('#adTitle').value=$('#adLink').value=$('#adText').value=$('#adImg').value='';
      toast('Опубліковано'); playOk();
    });
  });

  // load last 30
  db.ref('board').orderByChild('city').equalTo(CURRENT_CITY).limitToLast(30).on('child_added', async s=>{
    const v=s.val()||{};
    const up=(await db.ref('usersPublic/'+(v.by||'')).get()).val()||{};
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML = `<div class="ava"><img src="${up.avatar||defAvatar}"></div>
      <div class="bubble"><div class="name">${esc(up.name||'—')}</div>
      <div><b>${esc(v.title||'Без назви')}</b></div>
      ${v.text?`<div>${esc(v.text)}</div>`:''}
      ${v.img?`<img class="chat-photo" src="${v.img}">`:''}
      ${v.link?`<div><a href="${esc(v.link)}" target="_blank">Посилання</a></div>`:''}
      </div>`;
    $('#view-board .feed').appendChild(row);
  });
});

// ========= Participants (online presence basic) =========
document.addEventListener('DOMContentLoaded', ()=>{
  $('#participantsBtn').addEventListener('click', async ()=>{
    const box = $('#participantsList'); box.innerHTML='';
    const s = await db.ref('usersPublic').limitToLast(200).get();
    const all = s.val()||{};
    Object.entries(all).forEach(([uid, up])=>{
      const row = document.createElement('div'); row.className='msg';
      row.innerHTML=`<div class="ava"><img src="${up.avatar||defAvatar}"></div>
        <div class="bubble"><div class="name">${esc(up.name||uid)}</div><div class="muted">${esc(uid)}</div></div>`;
      row.onclick = ()=>{ openDmWith(uid); $('#participantsModal').close(); };
      box.appendChild(row);
    });
    $('#participantsModal').showModal();
  });
});

// ========= Map (Leaflet placeholder) =========
document.addEventListener('DOMContentLoaded', ()=>{
  if (typeof L === 'undefined') return;
  const mapEl = $('#map');
  if (!mapEl) return;
  const map = L.map('map').setView([50.087, 14.420], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  $('#addPlace').addEventListener('click', async ()=>{
    const u=auth.currentUser; if(!u){ toast('Увійдіть'); return; }
    const latlng = map.getCenter();
    const p = { by: u.uid, lat: latlng.lat, lng: latlng.lng, title: 'Місце', ts: Date.now() };
    await db.ref('places').push(p); toast('Точка додана');
  });

  // show places
  db.ref('places').limitToLast(200).on('child_added', s=>{
    const v=s.val()||{};
    const m=L.marker([v.lat||50.087, v.lng||14.420]).addTo(map);
    m.bindPopup(`<b>${esc(v.title||'Місце')}</b><br>${new Date(v.ts||Date.now()).toLocaleString()}`);
  });
});

// ========= Bank defaults seed =========
async function seedDefaultBank(){
  try{
    const s = await db.ref('settings/payments/bank').get();
    if (s.exists()) return;
    await db.ref('settings/payments/bank').set({
      holder: "Nikolay Urcik",
      account: "354037257/0300",
      iban: "",
      vs: "",
      msg: "PRACE CZ PREMIUM"
    });
  }catch(e){ /* ignore */ }
}
