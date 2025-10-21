// ========== Admin features ==========
function ensureAdmin(){
  return !!(auth.currentUser && auth.currentUser.email===window.ADMIN_EMAIL);
}

auth.onAuthStateChanged(u=>{
  if (u && u.email===window.ADMIN_EMAIL){
    loadAdminUsers();
    loadPaymentsInbox();
    bindBankSettings();
    document.querySelectorAll('.adm-only').forEach(n=>n.style.display='inline-block');
  }
});

async function loadAdminUsers(){
  if(!ensureAdmin()) return;
  const box = document.getElementById('adminUsers'); box.innerHTML='';
  const s = await db.ref('usersPublic').get(); const all = s.val()||{};
  const q = (document.getElementById('adminSearch')?.value||'').toLowerCase();
  Object.entries(all).forEach(([uid, up])=>{
    if(q && !((up.name||'').toLowerCase().includes(q) || uid.includes(q))) return;
    const row = document.createElement('div'); row.className='msg';
    row.innerHTML = `<div class="ava"><img src="${up.avatar||window.DEFAULT_AVATAR}"></div>
      <div class="bubble">
        <div class="name">${up.name||uid}</div>
        <div class="row">Роль: ${up.role||'seeker'} · План: ${up.plan||'free'}</div>
        <div class="row">
          <button data-role="seeker" data-uid="${uid}">шукаю</button>
          <button data-role="employer" data-uid="${uid}">роботодавець</button>
          <button data-role="moderator" data-uid="${uid}">moderator</button>
          <button data-ban="${uid}">Бан 30хв</button>
          <button data-unban="${uid}">Розбан</button>
          <button data-wipe="10" data-uid="${uid}">-10</button>
          <button data-wipe="20" data-uid="${uid}">-20</button>
        </div>
      </div>`;
    box.appendChild(row);
  });
  document.getElementById('adminSearch').oninput = loadAdminUsers;
  box.onclick = async (e)=>{
    const uid = e.target.dataset.uid || e.target.dataset.ban || e.target.dataset.unban;
    if(!uid) return;
    if(e.target.dataset.role){
      await db.ref('roles/'+uid+'/'+e.target.dataset.role).set(true);
      await db.ref('usersPublic/'+uid+'/role').set(e.target.dataset.role);
      alert('Роль оновлено');
    }
    if(e.target.dataset.ban){ await db.ref('bans/'+uid).set({until: Date.now()+30*60*1000}); alert('Бан на 30 хв'); }
    if(e.target.dataset.unban){ await db.ref('bans/'+uid).remove(); alert('Розбанено'); }
    if(e.target.dataset.wipe){
      await wipeChat(uid, parseInt(e.target.dataset.wipe,10));
    }
  };
}

async function wipeChat(uid, n){
  const city = localStorage.getItem('city')||'praha';
  const ref = db.ref('messages/'+city);
  const snap = await ref.limitToLast(500).get(); const rows=snap.val()||{};
  const ids = Object.keys(rows).filter(id=>rows[id].by===uid).slice(-n);
  await Promise.all(ids.map(id=> ref.child(id).remove()));
  alert('Видалено '+ids.length);
}

// ===== Payments inbox =====

const PLAN_PRICE = {
  "basic": 50,
  "premium": 120,
  "premium_plus": 200,
  "lifetime_bot": 200
};

function planLabel(p){
  if (typeof p === 'number') return p + ' Kč';
  return (PLAN_PRICE[p] ? (p+' · '+PLAN_PRICE[p]+' Kč') : (String(p||'free')));
}

async function loadPaymentsInbox(){
  if(!ensureAdmin()) return;
  const box = document.getElementById('payInbox'); box.innerHTML='';
  const s = await db.ref('payments/requests').get(); const all = s.val()||{};
  for(const uid in all){
    const list = all[uid];
    for(const key in list){
      const r = list[key]||{};
      const price = typeof r.plan === 'number' ? r.plan : (PLAN_PRICE[r.plan]||0);
      const row = document.createElement('div'); row.className='msg';
      row.innerHTML = `<div class="bubble">
        <div class="name">${uid}</div>
        <div>План: ${planLabel(r.plan)}</div>
        ${r.receipt?`<div><a href="${r.receipt}" target="_blank">Квитанція</a></div>`:''}
        <div class="row">
          <button data-approve="${uid}" data-key="${key}" data-plan="${r.plan}">Підтвердити</button>
        </div>
      </div>`;
      box.appendChild(row);
    }
  }
  box.onclick = async (e)=>{
    const uid = e.target.dataset.approve; if(!uid) return;
    const key = e.target.dataset.key;
    let plan = e.target.dataset.plan;
    // Store both label and price
    const amount = (plan && !isNaN(plan)) ? Number(plan) : (PLAN_PRICE[plan]||0);
    await db.ref('usersPublic/'+uid).update({ plan: plan||'basic', plan_paid: amount, premium: true });
    await db.ref('payments/decisions/'+uid).push({ plan: plan||'basic', amount, ts: Date.now(), by: auth.currentUser.uid });
    await db.ref('payments/requests/'+uid+'/'+key).remove();
    alert('План підтверджено');
    loadPaymentsInbox();
  };
}

// ===== Bank settings + QR preview =====
function bindBankSettings(){
  if(!ensureAdmin()) return;
  document.getElementById('saveBank').onclick = async ()=>{
    const data = {
      holder: document.getElementById('bankHolder').value.trim(),
      account: document.getElementById('bankAccount').value.trim(), // 354037257/0300
      iban: document.getElementById('bankIBAN').value.trim(),
      vs: document.getElementById('bankVS').value.trim() || null,
      msg: document.getElementById('bankMsg').value.trim() || null
    };
    await db.ref('settings/payments/bank').set(data);
    alert('Збережено');
  };
  document.getElementById('previewQR').onclick = async ()=>{
    const s = await db.ref('settings/payments/bank').get(); const b=s.val()||{};
    const plan = 200;
    const spd = buildSPD(b.account||b.iban, plan, b.msg||'PRACE CZ PREMIUM', b.vs||'');
    document.getElementById('qrPreview').innerHTML = `<div class="qr"><img src="https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(spd)}"></div><div class="muted">${spd}</div>`;
  };
}

// SPD (QR Platba) builder
function buildSPD(acc, amount, msg, vs){
  const parts = ["SPD*1.0"];
  parts.push("ACC:"+String(acc||""));
  parts.push("AM:"+Number(amount||0));
  parts.push("CC:CZK");
  if(vs) parts.push("X-VS:"+vs);
  if(msg) parts.push("MSG:"+msg);
  return parts.join("*")+"*";
}
