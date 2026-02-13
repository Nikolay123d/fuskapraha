/*
  Notifications routing module
  - Keeps 06-notifications focused on: badge + feed rendering
  - This file owns click actions / navigation based on notification type
*/

(function notificationsRouteModule(){
  function safeCloseNotifModal(){
    try{ window.closeModal && window.closeModal('modalNotif'); }catch(e){}
    try{ const m=document.getElementById('modalNotif'); if(m) m.hidden = true; }catch(e){}
  }

  async function handleNotificationClick(n){
    try{
      if(!n) return;
      const type = String(n.type||n.kind||'').toLowerCase();

      // close first to avoid "dead" overlay on mobile
      safeCloseNotifModal();

      if(type==='dm'){
        const peer = n.fromUid || n.from || n.peer || n.uid;
        if(!peer){ toast('DM: chybí uživatel'); return; }
        try{ await openDM(peer); }catch(e){ console.warn(e); }
        return;
      }

      if(type==='friend' || type==='friend_request'){
        const from = n.fromUid || n.from || '';
        if(from){ try{ window.__HIGHLIGHT_FRIEND_UID__ = String(from); }catch(e){} }
        try{ showView('view-friends', {forceEnter:true}); }catch(e){ try{ showView('view-friends'); }catch(_e){} }
        return;
      }

      if(type==='premium' || type==='payment' || type==='support'){
        // MVP: premium/support is handled via the bot DM.
        try{ window.openPremiumBot && window.openPremiumBot(); return; }catch(e){}
        try{ showView('view-dm'); }catch(e){}
        return;
      }

      // Fallback
      if(type){ toast('Upozornění: '+type); }
    }catch(e){
      console.warn('handleNotificationClick failed', e);
    }
  }

  // Export as global (used by 06-notifications feed)
  window.handleNotificationClick = handleNotificationClick;
})();
