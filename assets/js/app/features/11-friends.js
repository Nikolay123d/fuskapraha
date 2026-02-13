// === FRIENDS ===
async function friendItem(uid, st){
  const wrap=document.createElement('div'); wrap.className='msg';
  try{ wrap.dataset.uid = String(uid); }catch(e){}
  const u=await getUser(uid);
  const nick = u?.nick || 'Uživatel';
  const avatar = u?.avatar || window.DEFAULT_AVATAR;
  const status = st || 'friend';
  const actions = (()=>{
    if(status==='pending'){
      return `<button data-act="accept">Přijmout</button><button data-act="decline" class="danger">Odmítnout</button>`;
    }
    return `<button data-act="chat">Napsat</button><button data-act="remove" class="danger">Odebrat</button>`;
  })();
  wrap.innerHTML = `
    <div class="ava" data-uid="${esc(uid)}"><img src="${esc(avatar)}"></div>
    <div class="bubble">
      <div class="name" data-uid="${esc(uid)}">${esc(nick)}</div>
      <div class="muted">${esc(status)}</div>
      <div class="actions">${actions}</div>
    </div>`;
  wrap.addEventListener('click', async (e)=>{
    const a=e.target?.dataset?.act; if(!a) return;
    // Prevent double-click races (idempotent UX lock)
    if(wrap.dataset.busy==='1') return;
    wrap.dataset.busy='1';
    const done = ()=>{ try{ wrap.dataset.busy='0'; }catch(e){} };
    const me=auth.currentUser; if(!me){ setMiniLoad('friendsMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){} try{ done(); }catch(e){} return; }
    try{
      
if(a==='accept'){
        try{
          if(uid===me.uid){ toast('Chyba'); return; }
          const up = {};
          // Atomic accept: remove request + set both friend edges in ONE update
          up[`friendRequests/${me.uid}/${uid}`] = null;
          up[`friends/${me.uid}/${uid}`] = 'accepted';
          up[`friends/${uid}/${me.uid}`] = 'accepted';
          await db.ref().update(up);
          try{ await db.ref('notifications/'+uid).push({ts:Date.now(), type:'friendAccepted', from:me.uid}); }catch{}
          toast('Přidáno');
          loadFriends();
        }finally{ done(); }
        return;
      }

if(a==='decline'){
        try{
          if(uid===me.uid){ return; }
          await db.ref().update({[`friendRequests/${me.uid}/${uid}`]: null});
          toast('Odmítnuto');
          loadFriends();
        }finally{ done(); }
        return;
      }

if(a==='remove'){
        try{
          if(uid===me.uid){ return; }
          const up = {};
          up[`friends/${me.uid}/${uid}`] = null;
          up[`friends/${uid}/${me.uid}`] = null;
          await db.ref().update(up);
          toast('Odebráno');
          loadFriends();
        }finally{ done(); }
        return;
      }
if(a==='chat'){
        // open DM with that user
        try{ openDM(uid); }finally{ done(); }
        return;
      }
    }catch(err){ console.error(err); playSound('err'); try{ done(); }catch(e){} }
  });
  return wrap;
}
let FR_REQ_REF=null;
let __friendsReqSig='';
let __friendsReqTimer=null;

