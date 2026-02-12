
/**
 * presence/<uid>/ts = last activity timestamp
 * Online = now - ts < 5min
 * Heartbeat: every 30s when visible + on focus/visibilitychange
 */

let __hb = null;
let __uid = null;

function beat(){
  if(!__uid) return;
  try{
    firebase.database().ref("presence/"+__uid).update({ ts: Date.now() });
  }catch(e){}
}

export function startPresence(user){
  stopPresence();
  if(!user) return;
  __uid = user.uid;

  // initial beat
  beat();

  const onVis = ()=>{
    if(document.visibilityState==="visible") beat();
  };
  window.addEventListener("focus", beat);
  document.addEventListener("visibilitychange", onVis);

  // heartbeat timer (acceptable here; NOT a boot timer)
  __hb = setInterval(()=>{
    if(document.visibilityState==="visible") beat();
  }, 30000);

  // cleanup listeners in stopPresence
  startPresence.__onVis = onVis;
}

export function stopPresence(){
  if(__hb){ try{ clearInterval(__hb); }catch(e){} }
  __hb = null;
  __uid = null;
  try{ window.removeEventListener("focus", beat); }catch(e){}
  try{ document.removeEventListener("visibilitychange", startPresence.__onVis); }catch(e){}
  startPresence.__onVis = null;
}
