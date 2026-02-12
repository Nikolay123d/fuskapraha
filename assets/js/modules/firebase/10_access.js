
export const MK_ACCESS={state:{admin:false,mod:false,banned:false,muted:false,dmBanned:false}};

export function initAccess(user){
 if(!user){reset();return;}
 firebase.database().ref("roles/"+user.uid).on("value",s=>{
   const v=s.val()||{};
   MK_ACCESS.state.admin=!!v.admin;
   MK_ACCESS.state.mod=!!v.moderator;
 });
 firebase.database().ref("bans/"+user.uid).on("value",s=>{
   const v=s.val(); MK_ACCESS.state.banned=v&&v.until>Date.now();
 });
 firebase.database().ref("mutes/"+user.uid).on("value",s=>{
   const v=s.val(); MK_ACCESS.state.muted=v&&v.until>Date.now();
 });
 firebase.database().ref("dmBans/"+user.uid).on("value",s=>{
   const v=s.val(); MK_ACCESS.state.dmBanned=v&&v.until>Date.now();
 });
}

function reset(){
 MK_ACCESS.state={admin:false,mod:false,banned:false,muted:false,dmBanned:false};
}

export function canChat(){return !MK_ACCESS.state.banned && !MK_ACCESS.state.muted;}
export function canDM(){return !MK_ACCESS.state.banned && !MK_ACCESS.state.dmBanned;}
export function isAdmin(){return MK_ACCESS.state.admin;}

// Back-compat for older builds that import { getAccess }.
export function getAccess(){
  return MK_ACCESS.state;
}
