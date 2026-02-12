
const KEY = "mk_state";

export function getState(){
  try{ return JSON.parse(localStorage.getItem(KEY) || "{}"); }catch{ return {}; }
}
export function setState(next){
  localStorage.setItem(KEY, JSON.stringify(next||{}));
}
