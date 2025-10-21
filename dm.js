// ========== Direct Messages ==========
function threadId(a,b){ return [a,b].sort().join('_'); }

async function openDmWith(uid){
  const me = auth.currentUser?.uid;
  if(!me){ toast('Увійдіть'); return; }
  CURRENT_DM_UID = uid;
  // switch to DM tab
  document.querySelector('.tab[data-tab="dm"]').click();
  $('#dmHeader').textContent = 'Діалог з ' + (await fetchUserName(uid));
  subDm();
}

async function fetchUserName(uid){
  const up=(await db.ref('usersPublic/'+uid).get()).val()||{};
  return up.name || uid;
}

function subDm(){
  const me = auth.currentUser?.uid, other = window.CURRENT_DM_UID;
  if(!me || !other) return;
  const tid = threadId(me, other);
  const box = $('#dmMessages'); box.innerHTML='';

  db.ref('private/'+tid).limitToLast(200).on('child_added', async s=>{
    const v=s.val()||{};
    const up=(await db.ref('usersPublic/'+(v.by||'')).get()).val()||{};
    const row=document.createElement('div'); row.className='msg';
    row.innerHTML = `<div class="ava"><img src="${up.avatar||window.DEFAULT_AVATAR}"></div>
      <div class="bubble"><div class="name">${up.name||v.by||'—'} · <span class="muted">${new Date(v.ts||Date.now()).toLocaleString()}</span></div>
      ${v.text?('<div>'+v.text.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>'):''}</div>`;
    box.appendChild(row); box.scrollTop = box.scrollHeight;
  });

  $('#dmSend').onclick = async ()=>{
    const input = $('#dmInput');
    const text = (input.value||'').trim();
    if(!text) return;
    await db.ref('private/'+tid).push({ by: me, to: other, text, ts: Date.now() });
    input.value='';
  };
}
