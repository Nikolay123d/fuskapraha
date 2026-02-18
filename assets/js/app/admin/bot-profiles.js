// === ADMIN: Bot profiles editor (single source of truth: botProfiles/{botUid}) ===
//
// This file was refactored to match the current Admin UI (view-admin → "Bot profily").
// Previously it edited hardcoded user UIDs and conflicted with botProfiles.

(function(){
  if(!window.db) return;

  const $id = (id)=>document.getElementById(id);
  const esc = (s)=>String(s||'').replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]||c));

  const elUid = $id('botUid1');
  const elNick = $id('botNick1');
  const elAvatar = $id('botAvatar1');
  const elMode = $id('botMode1');
  const elText = $id('botText1');
  const elWelcome = $id('botWelcome1');
  const elImg = $id('botImg1');
  const btnSave = $id('botSave1');

  if(!elUid || !elNick || !elAvatar || !elMode || !elText || !elWelcome || !elImg || !btnSave) return;

  const DEFAULT_UID = (window.PREMIUM_BOT_UID ? String(window.PREMIUM_BOT_UID) : 'bot_premium');

  function isAdmin(){
    try{ return !!(window.auth && auth.currentUser && (rootRole('admin'))); }catch(e){ return false; }
  }
  function rootRole(role){
    // relies on authState syncing roles to window.__myRoles
    try{ return !!(window.__myRoles && window.__myRoles[role] === true); }catch(e){ return false; }
  }

  function normUid(v){
    return String(v||'').trim();
  }

  function fillForm(data){
    const d = data || {};
    elNick.value = String(d.nick||'');
    elAvatar.value = String(d.avatar||'');
    elMode.value = String(d.mode||'both');
    elText.value = String(d.text||'');
    elWelcome.value = String(d.welcome||'');
    elImg.value = String(d.img||'');
  }

  async function loadBot(uid){
    uid = normUid(uid);
    if(!uid) return;
    try{
      btnSave.disabled = true;
      const snap = await db.ref('botProfiles/'+uid).get();
      if(snap.exists()){
        fillForm(snap.val()||{});
      }else{
        // Fallback: try usersPublic as a convenience
        const ps = await db.ref('usersPublic/'+uid).get();
        const p = ps.val()||{};
        fillForm({
          nick: p.nick||'',
          avatar: p.avatar||'',
          mode: 'both',
          text: '',
          welcome: '',
          img: ''
        });
      }
    }catch(e){
      console.warn(e);
      try{ window.toast && toast('Nelze načíst profil bota'); }catch(_e){}
    }finally{
      btnSave.disabled = false;
    }
  }

  async function saveBot(){
    const me = (window.auth && auth.currentUser) ? auth.currentUser : null;
    if(!me){ try{ window.openModalAuth && openModalAuth('login'); }catch(e){} return; }
    if(!(window.isAdminUser && isAdminUser(me)) && !rootRole('admin')){
      try{ window.toast && toast('Pouze admin'); }catch(e){}
      return;
    }

    const uid = normUid(elUid.value);
    if(!uid){ try{ window.toast && toast('Zadejte UID bota'); }catch(e){} return; }

    const nick = String(elNick.value||'').trim().slice(0, 40);
    const avatar = String(elAvatar.value||'').trim().slice(0, 400000);
    const mode = String(elMode.value||'both');
    const text = String(elText.value||'').trim().slice(0, 4000);
    const welcome = String(elWelcome.value||'').trim().slice(0, 4000);
    const img = String(elImg.value||'').trim().slice(0, 400000);

    if(!nick){ try{ window.toast && toast('Nick je povinný'); }catch(e){} return; }
    if(!['dm','chat','both'].includes(mode)){
      try{ window.toast && toast('Režim: dm / chat / both'); }catch(e){}
      return;
    }

    const payload = { nick, avatar, mode, text, welcome, img };

    try{
      btnSave.disabled = true;
      // Single source of truth
      await db.ref('botProfiles/'+uid).set(payload);

      // Keep usersPublic in sync so bot is visible consistently in UI.
      // (Only whitelisted fields; rules enforce strict schema.)
      const now = Date.now();
      const pubUpd = {
        nick,
        avatar,
        role: 'bot',
        plan: 'bot',
        updatedAt: now
      };
      try{
        // set createdAt only if missing
        const pubSnap = await db.ref('usersPublic/'+uid+'/createdAt').get();
        if(!pubSnap.exists()) pubUpd.createdAt = now;
      }catch(e){}
      try{ await db.ref('usersPublic/'+uid).update(pubUpd); }catch(e){}

      try{ window.toast && toast('Uloženo'); }catch(e){}
      try{ window.auditLog && auditLog('bot_profile_saved', String(uid), { mode }); }catch(e){}
    }catch(e){
      console.error(e);
      try{ window.toast && toast('Chyba při ukládání'); }catch(_e){}
      try{ window.playSound && playSound('err'); }catch(_e){}
    }finally{
      btnSave.disabled = false;
    }
  }

  // Wire UI
  if(!elUid.value) elUid.value = DEFAULT_UID;
  elUid.addEventListener('change', ()=>{ loadBot(elUid.value); });
  btnSave.addEventListener('click', saveBot);

  // Auto-load default
  loadBot(elUid.value);

})();
