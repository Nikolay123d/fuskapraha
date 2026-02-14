// ==== MEMBERS / ONLINE LIST (view-members) ====
// NOTE: Friends domain was moved to features/friends.js

let __presenceRef = null;
let __presenceCb = null;

async function loadMembers(limit=30){
  const feed = document.getElementById('membersFeed');
  if(!feed) return;

  try{ setMiniLoad('membersMiniLoad','Načítáme uživatele…', true); }catch(e){}

  // Cleanup previous listener (lazy init)
  try{ if(__presenceRef && __presenceCb) __presenceRef.off('value', __presenceCb); }catch(e){}
  __presenceRef = null;
  __presenceCb = null;

  const lim = Math.max(5, Math.min(100, Number(limit)||30));
  feed.innerHTML = '<div class="mini-hint">Načítám…</div>';

  try{
    __presenceRef = db.ref('presence').orderByChild('lastActiveTs').limitToLast(lim);
    __presenceCb = async (snap)=>{
      try{ setMiniLoad('membersMiniLoad','', false); }catch(e){}
      const val = snap.val() || {};
      const items = Object.entries(val)
        .map(([uid, p])=>({ uid, ...(p||{}) }))
        .filter(x=>x && x.uid)
        .sort((a,b)=> Number(b.lastActiveTs||0) - Number(a.lastActiveTs||0));

      feed.innerHTML = '';
      if(!items.length){
        feed.innerHTML = '<div class="mini-hint">Nikdo online</div>';
        return;
      }

      // Preload usersPublic via getUser()
      const uids = items.map(x=>x.uid);
      const users = {};
      await Promise.all(uids.map(async (uid)=>{
        try{ if(window.getUser) users[uid] = await window.getUser(uid); }catch(e){}
      }));

      for(const it of items){
        const pu = users[it.uid] || {};
        const d = document.createElement('div');
        d.className = 'msg';
        d.dataset.uid = it.uid;
        d.innerHTML =
          `<div class="ava"><img src="${esc(pu.avatar||window.DEFAULT_AVATAR)}"></div>`+
          `<div class="bubble" style="width:100%">`+
            `<div class="name"><b>${esc(pu.nick||'Uživatel')}</b> <span class="muted">online</span></div>`+
            `<div class="actions">`+
              `<button type="button" class="ghost" data-act="card">Profil</button>`+
              `<button type="button" data-act="dm">DM</button>`+
            `</div>`+
          `</div>`;

        d.addEventListener('click', (e)=>{
          const btn = e.target.closest('button');
          const act = btn?.dataset?.act || '';
          if(act==='card'){
            try{ window.showUserCard && window.showUserCard(it.uid); }catch(_e){}
            return;
          }
          if(act==='dm'){
            try{ openDM(it.uid); }catch(_e){}
            return;
          }
          // Default click = open user card
          try{ window.showUserCard && window.showUserCard(it.uid); }catch(_e){}
        });
        feed.appendChild(d);
      }
    };

    __presenceRef.on('value', __presenceCb);
    // Unified registry (tab-scoped)
    try{
      window.MK?.subs?.set('tab:view-members', 'presence', ()=>{
        try{ if(__presenceRef && __presenceCb) __presenceRef.off('value', __presenceCb); }catch(e){}
        __presenceRef = null;
        __presenceCb = null;
      });
    }catch(e){}
  }catch(e){
    console.error(e);
    try{ setMiniLoad('membersMiniLoad','', false); }catch(_e){}
    feed.innerHTML = '<div class="mini-hint">Chyba při načítání uživatelů</div>';
  }
}

// Router lifecycle hook
window.__membersUnsub = ()=>{
  try{ window.MK?.subs?.clear('tab:view-members'); }catch(e){}
  try{ setMiniLoad('membersMiniLoad','', false); }catch(e){}
  try{ if(__presenceRef && __presenceCb) __presenceRef.off('value', __presenceCb); }catch(e){}
  __presenceRef = null;
  __presenceCb = null;
};

window.loadMembers = loadMembers;
