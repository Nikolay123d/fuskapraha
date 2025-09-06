/* admin.js — admin-only controls */
window.PF_ADMIN = (function(){
  const st = {};
  let db, stg, auth;
  function init(firebase){
    db = firebase.database();
    stg = firebase.storage();
    auth = firebase.auth();
    // Payments inbox
    const payInbox = document.getElementById('payInbox');
    db.ref('payments/inbox').on('value', snap=>{
      payInbox.innerHTML='';
      const all = snap.val()||{};
      Object.keys(all).forEach(uid=>{
        const rec = all[uid];
        Object.keys(rec).forEach(pid=>{
          const p = rec[pid];
          const row = document.createElement('div');
          row.className='row';
          row.innerHTML = `<div style="flex:1">
              <div><b>uid:</b> ${uid}</div>
              <div><b>pid:</b> ${pid}</div>
              <div><b>time:</b> ${new Date(p.ts||Date.now()).toLocaleString()}</div>
            </div>
            <div style="display:flex;gap:6px">
              <button data-act="approve">Підтвердити</button>
              <button data-act="reject">Видалити</button>
            </div>`;
          row.querySelector('[data-act="approve"]').onclick = async ()=>{
            await db.ref('payments/verified/'+uid+'/'+pid).set({by: auth.currentUser.email||'admin', ts: Date.now()});
            await db.ref('usersPublic/'+uid+'/vip').set(true);
            await db.ref('payments/inbox/'+uid+'/'+pid).remove();
          };
          row.querySelector('[data-act="reject"]').onclick = async ()=>{
            await db.ref('payments/inbox/'+uid+'/'+pid).remove();
          };
          payInbox.appendChild(row);
        })
      });
    });

    // Bots manager
    const botsRef = db.ref('settings/bots');
    const botList = document.getElementById('botList');
    document.getElementById('botAdd').onclick = ()=>{
      const id = Date.now().toString();
      botsRef.child(id).set({text:'Новий бот-пост', city:'praha', interval:60});
    };
    botsRef.on('value', snap=>{
      botList.innerHTML='';
      const data = snap.val()||{};
      Object.keys(data).forEach(id=>{
        const b = data[id];
        const wrap = document.createElement('div');
        wrap.className = 'card';
        wrap.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">
            <input data-k="text" value="${b.text||''}" placeholder="Текст бота" style="flex:1">
            <input data-k="city" value="${b.city||'praha'}" placeholder="Місто">
            <input data-k="interval" value="${b.interval||60}" type="number" min="5" step="5" style="width:90px">
            <button data-act="save">Зберегти</button>
            <button data-act="del">Видалити</button>
          </div>`;
        wrap.querySelector('[data-act="save"]').onclick = ()=>{
          const text = wrap.querySelector('[data-k="text"]').value.trim();
          const city = wrap.querySelector('[data-k="city"]').value.trim()||'praha';
          const interval = +wrap.querySelector('[data-k="interval"]').value||60;
          botsRef.child(id).update({text, city, interval});
        };
        wrap.querySelector('[data-act="del"]').onclick = ()=>botsRef.child(id).remove();
        botList.appendChild(wrap);
      });
    });

    // Wallpaper
    const wallInput = document.getElementById('wallUrlInput');
    document.getElementById('wallSave').onclick = async ()=>{
      const url = wallInput.value.trim();
      if(url) await db.ref('settings/theme').set({wallUrl:url});
    };

    // Admin: list users with quick actions
    const uBox = document.getElementById('adminUsers');
    db.ref('usersPublic').on('value', snap=>{
      uBox.innerHTML='';
      const users = snap.val()||{};
      Object.keys(users).forEach(uid=>{
        const u = users[uid];
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<img src="${u.ava||'public/images/ava.png'}">
          <div style="flex:1">
            <div><b>${u.nick||'User'}</b> <span class="badge">${u.vip?'VIP':'FREE'}</span></div>
            <div style="opacity:.7">${uid}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button data-act="vip">${u.vip?'Зняти VIP':'Дати VIP'}</button>
            <button data-act="ban">${u.banned?'Розбан':'Бан'}</button>
          </div>`;
        row.querySelector('[data-act="vip"]').onclick = ()=>db.ref('usersPublic/'+uid+'/vip').set(!u.vip);
        row.querySelector('[data-act="ban"]').onclick = ()=>db.ref('usersPublic/'+uid+'/banned').set(!u.banned);
        uBox.appendChild(row);
      });
    });
  }
  return { init };
})();