const KEY = "mk_state";

function readRaw(){
  try{ return JSON.parse(localStorage.getItem(KEY) || "{}"); }catch{ return {}; }
}
function writeRaw(obj){
  localStorage.setItem(KEY, JSON.stringify(obj||{}));
}

export function getState(){ return readRaw(); }

export function setState(patch){
  const cur = readRaw();
  const next = { ...cur, ...patch };
  writeRaw(next);
  return next;
}

export function setView(view){
  return setState({ view });
}

export function setPendingView(view){
  return setState({ pendingView: view });
}

export function clearPendingView(){
  const cur = readRaw();
  delete cur.pendingView;
  writeRaw(cur);
  return cur;
}

// DM helpers can be added later (room/peer)
