// === Greeting (Dasha only, non-anon) ===
const GREET_EMAIL = 'darausoan@gmail.com';
let greetedThisSession = false;
function openDmWithCreator(){
  const me = auth.currentUser;
  if(!me) return;
  const creatorUid = window.ADMIN_UID;
  openDMRoom(me.uid, creatorUid);
  showView('view-dm');
  $('#dmTo').value = creatorUid;
}
function sendFriendRequestToCreator(){
  const me = auth.currentUser;
  if(!me) return;
  const creatorUid = window.ADMIN_UID;
  // Server-first: friend requests go through Cloud Functions.
  (async ()=>{
    try{
      if(typeof window.callFn === 'function'){
        const r = await window.callFn('friendSend', { toUid: creatorUid });
        if(!r || r.ok !== true){
          const reason = String(r?.reason||'');
          if(reason==='already_friends'){ toast('Už jste přátelé'); playSound('ok'); return; }
          if(reason==='already_requested'){ toast('Žádost už byla odeslána'); playSound('ok'); return; }
          if(reason==='has_incoming'){ toast('Máte od něj žádost'); playSound('ok'); return; }
          if(reason==='limit'){ toast('Limit přátel vyčerpán'); playSound('err'); return; }
          toast('Nelze odeslat žádost');
          playSound('err');
          return;
        }
      }else{
        toast('Server není dostupný (Functions)');
        throw new Error('functions_unavailable');
      }
      toast('Žádost odeslána');
      playSound('ok');
    }catch(e){
      console.warn(e);
      toast('Chyba');
      playSound('err');
    }
  })();
}
function showGreeting(){
  const o=$('#greetOverlay'); if(!o) return;
  o.hidden=false;
  playSound('party');
  let sec=10; const sEl=$('#greetSec');
  const iv=setInterval(()=>{ sec--; if(sEl) sEl.textContent=String(sec); if(sec<=0){ clearInterval(iv); o.hidden=true; } }, 1000);
}
$('#greetClose')?.addEventListener('click', ()=> $('#greetOverlay').hidden=true);
$('#greetDm')?.addEventListener('click', ()=> { $('#greetOverlay').hidden=true; openDmWithCreator(); });
$('#greetAddFriend')?.addEventListener('click', ()=> { $('#greetOverlay').hidden=true; sendFriendRequestToCreator(); });

