// === Members (online) ===
let offMembers=null;
async function loadMembers(){
  const feed = $('#membersFeed'); if(!feed) return;
  const q = ($('#membersSearch')?.value||'').toLowerCase().trim();
  feed.innerHTML = '';
  const stopSeq = startMiniSequence('membersMiniLoad', [
    'Načítám účastníky…',
    'Šifruji přítomnost…',
    'Synchronizuji online…'
  ], 650);
  if(offMembers){ offMembers(); offMembers=null; }

  // Listen to online presence (last activity timestamp).
  let firstPaint = true;
  const ref = db.ref('presence').orderByChild('ts').limitToLast(200);
  const cb = async (snap)=>{
    const pres = snap.val()||{};
    const now = Date.now();
    const uids = Object.keys(pres).filter(uid=>{
      const ts = pres[uid]?.ts||0;
      return (now - ts) < 5*60*1000; // online in last 5 min
    }).reverse();

    // render
    feed.innerHTML='';
    for(const uid of uids){
      try{
        const up = await db.ref('usersPublic/'+uid).get();
        const pu = up.val()||{};
        const nick = String(pu.nick||pu.name||'Uživatel');
        if(q && !nick.toLowerCase().includes(q)) continue;

        const row = document.createElement('div');
        row.className='member';
        const isAdm = isAdminUser(auth.currentUser);
        row.innerHTML =
          `<div class="ava"><img src="${esc(pu.avatar||window.DEFAULT_AVATAR)}"></div>`+
          `<div class="meta"><div class="name">${esc(nick)}</div>`+
          `<div class="sub">${esc(uid)}</div></div>`+
          `<div class="acts">`+
            `<button class="ghost" data-act="dm" data-uid="${esc(uid)}">DM</button>`+
            (isAdm ? `<button class="ghost" data-act="ban" data-uid="${esc(uid)}">Ban 24h</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="mute" data-uid="${esc(uid)}">Mute 24h</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="grant7" data-uid="${esc(uid)}">Donat 7d</button>` : ``)+
            (isAdm ? `<button class="ghost" data-act="grant30" data-uid="${esc(uid)}">Donat 30d</button>` : ``)+
          `</div>`;
        row.addEventListener('click', (e)=>{
          const btn = e.target?.closest('button'); 
          if(!btn) return;
          e.preventDefault(); e.stopPropagation();
          const act = btn.dataset.act;
          const tuid = btn.dataset.uid;
          if(act==='dm'){ openDM(tuid); return; }
          if(!isAdminUser(auth.currentUser)) return;
          if(act==='ban'){
            if(confirm('Ban uživatele na 24h?')){
              db.ref('bans/'+tuid).set({until: Date.now()+24*60*60*1000, by: auth.currentUser.uid, ts: Date.now()});
            }
          }
          if(act==='mute'){
            if(confirm('Mute uživatele na 24h?')){
              db.ref('mutes/'+tuid).set({until: Date.now()+24*60*60*1000, by: auth.currentUser.uid, ts: Date.now()});
            }
          }
          if(act==='grant7' || act==='grant30'){
            const days = (act==='grant7') ? 7 : 30;
            if(confirm('Vydat donat / privilegium na '+days+' dní?')){
              const until = Date.now() + days*24*60*60*1000;
              db.ref('grants/'+tuid).push({type:'donation', until, ts: Date.now(), by: auth.currentUser.uid});
              toast('Vydáno: '+days+' dní');
            }
          }
        });
        feed.appendChild(row);
      }catch{}
    }

    // Stop mini-loader after first real paint.
    if(firstPaint){
      firstPaint = false;
      setMiniLoad('membersMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
    }
  };
  ref.on('value', cb);
  offMembers=()=>ref.off('value', cb);

  // Tab-scoped subscription (killed on tab switch)
  try{ if(window.MK && window.MK.subs) window.MK.subs.add(offMembers, {scope:'tab', key:'members'}); }catch(e){}

  // Failsafe: if rules block presence read, the callback may never fire.
  setTimeout(()=>{
    if(firstPaint){
      firstPaint=false;
      setMiniLoad('membersMiniLoad','', false);
      try{ stopSeq && stopSeq(); }catch(e){}
    }
  }, 1500);
}

