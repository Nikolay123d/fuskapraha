
const db=firebase.database(); const auth=firebase.auth();
function setPresence(u){
  const ref=db.ref('.info/connected');
  ref.on('value', snap=>{
    if(snap.val()===false) return;
    const up=db.ref('presence/'+u.uid);
    up.onDisconnect().set({online:false,ts:firebase.database.ServerValue.TIMESTAMP});
    up.set({online:true,ts:firebase.database.ServerValue.TIMESTAMP});
  });
}
auth.onAuthStateChanged(u=>{ if(u){ setPresence(u); } });
