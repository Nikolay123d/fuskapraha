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
    const me=auth.currentUser; if(!me){ setMiniLoad('friendsMiniLoad','', false);
    try{ stopSeq && stopSeq(); }catch(e){} return; }
    try{
      if(a==='accept'){
        await db.ref().update({
          ['friends/'+me.uid+'/'+uid]:'accepted',
          ['friends/'+uid+'/'+me.uid]:'accepted'
        });
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        try{ await db.ref('notifications/'+uid).push({ts:Date.now(), type:'friendAccepted', from:me.uid}); }catch{}
        toast('Přidáno');
        loadFriends();
        return;
      }
      if(a==='decline'){
        await db.ref('friendRequests/'+me.uid+'/'+uid).remove();
        toast('Odmítnuto');
        loadFriends();
        return;
      }
      if(a==='remove'){
        await db.ref('friends/'+me.uid+'/'+uid).remove();
        await db.ref('friends/'+uid+'/'+me.uid).remove();
        toast('Odebráno');
        loadFriends();
        return;
      }
      if(a==='chat'){
        // open DM with that user
        openDM(uid);
        return;
      }
    }catch(err){ console.error(err); playSound('err'); }
  });
  return wrap;
}
let FR_REQ_REF=null;
let __friendsReqSig='';
let __friendsReqTimer=null;


