// Admin features
function ensureAdmin(){ if(!auth.currentUser || auth.currentUser.email!==window.ADMIN_EMAIL){ return false; } return true; }

auth.onAuthStateChanged(u=>{ if(u && u.email===window.ADMIN_EMAIL){ loadAdminUsers(); loadPaymentsInbox(); bindBankSettings(); } });

async function loadAdminUsers(){
  if(!ensureAdmin()) return;
  const box=$('#adminUsers'); box.innerHTML='';
  const s=await db.ref('usersPublic').get(); const all=s.val()||{};
  const q=($('#adminSearch')?.value||'').toLowerCase();
  Object.entries(all).forEach(([uid,up])=>{
    if(q && !((up.name||'').toLowerCase().includes(q) || uid.includes(q))) return;
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML=`<div class="ava"><img src="${up.avatar||window.DEFAULT_AVATAR}"></div>
      <div class="bubble"><div class="name">${up.name||uid}</div>
      <div class="row">Роль: ${up.role||'seeker'} · План: ${up.plan||'free'}</div>
      <div class="row">
        <button data-role="seeker" data-uid="${uid}">seeker</button>
        <button data-role="employer" data-uid="${uid}">employer</button>
        <button data-role="moderator" data-uid="${uid}">moderator</button>
        <button data-ban="${uid}">Бан 30хв</button>
        <button data-unban="${uid}">Розбан</button>
        <button data-wipe10="${uid}">-10</button>
        <button data-wipe20="${uid}">-20</button>
      </div></div>`;
    box.appendChild(row);
  });
  $('#adminSearch').oninput = loadAdminUsers;
  box.onclick = async e=>{
    const uid=e.target.dataset.uid || e.target.dataset.ban || e.target.dataset.unban || e.target.dataset.wipe10 || e.target.dataset.wipe20;
    if(!uid) return;
    if(e.target.dataset.role){ await db.ref('roles/'+uid+'/'+e.target.dataset.role).set(true); await db.ref('usersPublic/'+uid+'/role').set(e.target.dataset.role); alert('Роль оновлено'); }
    if(e.target.dataset.ban){ await db.ref('bans/'+uid).set({until: Date.now()+30*60*1000}); alert('Користувача заблоковано на 30 хв'); }
    if(e.target.dataset.unban){ await db.ref('bans/'+uid).remove(); alert('Розбан'); }
    if(e.target.dataset.wipe10){ await wipeChat(uid,10); }
    if(e.target.dataset.wipe20){ await wipeChat(uid,20); }
  };
}

async function wipeChat(uid, n){
  const city=localStorage.getItem('city')||'praha';
  const ref=db.ref('messages/'+city);
  const snap=await ref.limitToLast(500).get(); const rows=snap.val()||{};
  const ids=Object.keys(rows).filter(id=>rows[id].by===uid).slice(-n);
  await Promise.all(ids.map(id=> ref.child(id).remove()));
  alert('Видалено '+ids.length);
}

// Payments inbox
async function loadPaymentsInbox(){
  if(!ensureAdmin()) return;
  const box=$('#payInbox'); box.innerHTML='';
  const s=await db.ref('payments/requests').get(); const all=s.val()||{};
  for(const uid in all){
    const list=all[uid];
    for(const key in list){
      const r=list[key];
      const row=document.createElement('div'); row.className='msg';
      row.innerHTML=`<div class="bubble"><div>${uid}</div><div>План: ${r.plan} Kč</div>${r.receipt?`<div><a href="${r.receipt}" target="_blank">Квитанція</a></div>`:''}<div class="row"><button data-approve="${uid}" data-amt="${r.plan}">Підтвердити</button></div></div>`;
      box.appendChild(row);
    }
  }
  box.onclick = async e=>{
    const uid=e.target.dataset.approve; if(!uid) return;
    const amt=parseInt(e.target.dataset.amt||0,10);
    await db.ref('usersPublic/'+uid+'/plan').set(amt);
    await db.ref('payments/decisions/'+uid).push({plan:amt, ts:Date.now(), by:auth.currentUser.uid});
    alert('План видано');
  };
}

// Bank settings + QR preview
function bindBankSettings(){
  if(!ensureAdmin()) return;
  $('#saveBank').onclick = async ()=>{
    const data={
      holder: $('#bankHolder').value.trim(),
      account: $('#bankAccount').value.trim(), // domestic format 123456789/0300
      iban: $('#bankIBAN').value.trim(),
      vs: $('#bankVS').value.trim()||null,
      msg: $('#bankMsg').value.trim()||null
    };
    await db.ref('settings/payments/bank').set(data);
    alert('Збережено');
  };
  $('#previewQR').onclick = async ()=>{
    const s=await db.ref('settings/payments/bank').get(); const b=s.val()||{};
    const plan=150;
    const spd = buildSPD(b.account||b.iban, plan, b.msg||'PRACE CZ PREMIUM', b.vs||'');
    $('#qrPreview').innerHTML = `<div class="qr"><img src="https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(spd)}"></div><div class="muted">${spd}</div>`;
  };
}

// SPD (QR Platba) builder: SPD*1.0*ACC:XXXX*AM:123*CC:CZK*X-VS:123456*MSG:Text*
function buildSPD(acc, amount, msg, vs){
  function esc(s=''){ return encodeURIComponent(String(s).replace(/\*/g,'%2A')); }
  const parts = ["SPD*1.0"];
  parts.push("ACC:"+acc);
  parts.push("AM:"+Number(amount||0));
  parts.push("CC:CZK");
  if(vs) parts.push("X-VS:"+vs);
  if(msg) parts.push("MSG:"+msg);
  return parts.join("*")+"*";
}
