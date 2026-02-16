// Admin: fixed bot profiles (by UID)
// Extracted from former Stage5 monolith.

(function mkBotProfiles(){
  if(window.__MK_BOT_PROFILES__) return;
  window.__MK_BOT_PROFILES__ = true;

  // --- Bot profiles by UID (for fixed bot accounts) ---
    const BOT_UIDS = ['VrP5IzhgxmT0uKWc9UWlXSCe6nM2','rN93vIzh0AUhX1YsSWb6Th6W9w82'];
    async function loadBotProfiles(){
      const me=auth.currentUser; if(!isAdminUser(me)) return;
      try{
        const u1=(await db.ref('usersPublic/'+BOT_UIDS[0]).get()).val()||{};
        const u2=(await db.ref('usersPublic/'+BOT_UIDS[1]).get()).val()||{};
        const n1=document.getElementById('botNick1'); if(n1) n1.value = u1.nick||u1.name||'';
        const n2=document.getElementById('botNick2'); if(n2) n2.value = u2.nick||u2.name||'';
      }catch(e){ console.warn(e); }
    }
    async function saveBotProfile(which){
      const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
      const uid = BOT_UIDS[which-1];
      const nickEl=document.getElementById(which===1?'botNick1':'botNick2');
      const fileEl=document.getElementById(which===1?'botAva1':'botAva2');
      const nick=(nickEl?.value||'').trim();
      let avatar=null;
      const f=fileEl?.files && fileEl.files[0];
      if(f){ avatar = await fileToDataURL(f); }
      const upd={};
      if(nick) upd.nick=nick;
      if(avatar) upd.avatar=avatar;
      upd.updatedAt=Date.now();
      await db.ref('usersPublic/'+uid).update(upd);
      toast('Uloženo'); playSound('ok');
      if(fileEl) fileEl.value='';
    }
    document.getElementById('botSave1')?.addEventListener('click', ()=>saveBotProfile(1).catch(console.error));
    document.getElementById('botSave2')?.addEventListener('click', ()=>saveBotProfile(2).catch(console.error));
    // (removed) duplicate onAuthStateChanged in Stage5 – handled by main auth handler

    // When admin tab open, refresh
    document.addEventListener('click', (e)=>{
      const t=e.target.closest('[data-view="view-admin"]');
      if(t){ setTimeout(()=>{ if(isAdminUser(auth.currentUser)){ try{ window.loadAdminRequests && window.loadAdminRequests(); }catch(e){}
            try{ window.loadBotProfiles && window.loadBotProfiles(); }catch(e){} } }, 120); }
    });

  // Export (used by admin refresh)
  try{ window.loadBotProfiles = loadBotProfiles; }catch(e){}

})();
