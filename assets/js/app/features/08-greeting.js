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
  db.ref('friendRequests/'+creatorUid+'/'+me.uid).set({from:me.uid, ts:Date.now()});
  toast('Žádost odeslána');
  playSound('ok');
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

