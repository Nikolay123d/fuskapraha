/* bots.js — simple client-side autoposter (runs for admin only) */
window.PF_BOTS = (function(){
  let db, auth;
  let timers = {};
  function startForAdmin(firebase){
    db = firebase.database();
    auth = firebase.auth();
    firebase.database().ref('settings/bots').on('value', snap=>{
      // clear previous
      Object.values(timers).forEach(id=>clearInterval(id));
      timers = {};
      const bots = snap.val()||{};
      Object.keys(bots).forEach(bid=>{
        const b = bots[bid];
        if(!b || !b.interval || b.interval < 5) return;
        timers[bid] = setInterval(async ()=>{
          const u = auth.currentUser;
          if(!u || !u.email) return;
          // Only admin posts automatically
          const adminEmailSnap = await db.ref('settings/adminEmail').get();
          const adminEmail = adminEmailSnap.val();
          if(u.email !== adminEmail) return;
          await db.ref('messages/'+(b.city||'praha')).push({
            uid: u.uid, nick: u.displayName||'Бот', ava: u.photoURL||'public/images/ava.png',
            txt: b.text||'',
            ts: Date.now(), bot:true
          });
        }, b.interval*1000);
      });
    });
  }
  return { startForAdmin };
})();