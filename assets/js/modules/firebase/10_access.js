// assets/js/modules/firebase/10_access.js
// Single access point + role state (admin/mod).
import { initFirebaseOnce } from './00_firebase.js';

const ACCESS = {
  ready: false,
  auth: null,
  db: null,
  st: null,
  firebase: null,
  user: null,
  isAuthed: false,
  isAdmin: false,
  isModerator: false,
  banUntil: 0,
  muteUntil: 0,
  dmBanUntil: 0,
  _roleRef: null,
  _roleCb: null
  ,_banRef: null
  ,_banCb: null
  ,_muteRef: null
  ,_muteCb: null
  ,_dmBanRef: null
  ,_dmBanCb: null
};

export function initAccess(user){
  // Ensure firebase handles
  try{ initFirebaseOnce(); }catch(e){}
  ACCESS.auth = window.auth || null;
  ACCESS.db   = window.db   || null;
  ACCESS.st   = window.st   || null;
  ACCESS.firebase = window.firebase || null;

  ACCESS.user = user || null;
  ACCESS.isAuthed = !!user;
  ACCESS.ready = !!(ACCESS.auth && ACCESS.db);

  // detach old role watcher
  try{ if(ACCESS._roleRef && ACCESS._roleCb) ACCESS._roleRef.off('value', ACCESS._roleCb); }catch(e){}
  ACCESS._roleRef=null; ACCESS._roleCb=null;
  ACCESS.isAdmin=false; ACCESS.isModerator=false;

  // detach old ban/mute watchers
  try{ if(ACCESS._banRef && ACCESS._banCb) ACCESS._banRef.off('value', ACCESS._banCb); }catch(e){}
  try{ if(ACCESS._muteRef && ACCESS._muteCb) ACCESS._muteRef.off('value', ACCESS._muteCb); }catch(e){}
  try{ if(ACCESS._dmBanRef && ACCESS._dmBanCb) ACCESS._dmBanRef.off('value', ACCESS._dmBanCb); }catch(e){}
  ACCESS._banRef=null; ACCESS._banCb=null;
  ACCESS._muteRef=null; ACCESS._muteCb=null;
  ACCESS._dmBanRef=null; ACCESS._dmBanCb=null;
  ACCESS.banUntil=0; ACCESS.muteUntil=0; ACCESS.dmBanUntil=0;

  // Watch roles only when authed
  if(ACCESS.isAuthed && ACCESS.db){
    ACCESS._roleRef = ACCESS.db.ref('roles/'+user.uid);
    ACCESS._roleCb = (snap)=>{
      const v = snap.val()||{};
      ACCESS.isAdmin = v.admin===true;
      ACCESS.isModerator = v.moderator===true;
    };
    ACCESS._roleRef.on('value', ACCESS._roleCb);

    // bans/mutes are optional nodes; missing => treated as 0
    ACCESS._banRef = ACCESS.db.ref('bans/'+user.uid+'/until');
    ACCESS._banCb = (snap)=>{ ACCESS.banUntil = Number(snap.val()||0); };
    ACCESS._banRef.on('value', ACCESS._banCb);

    ACCESS._muteRef = ACCESS.db.ref('mutes/'+user.uid+'/until');
    ACCESS._muteCb = (snap)=>{ ACCESS.muteUntil = Number(snap.val()||0); };
    ACCESS._muteRef.on('value', ACCESS._muteCb);

    ACCESS._dmBanRef = ACCESS.db.ref('dmBans/'+user.uid+'/until');
    ACCESS._dmBanCb = (snap)=>{ ACCESS.dmBanUntil = Number(snap.val()||0); };
    ACCESS._dmBanRef.on('value', ACCESS._dmBanCb);
  }
}

export function getAccess(){
  try{ initFirebaseOnce(); }catch(e){}
  ACCESS.auth = window.auth || ACCESS.auth;
  ACCESS.db   = window.db   || ACCESS.db;
  ACCESS.st   = window.st   || ACCESS.st;
  ACCESS.firebase = window.firebase || ACCESS.firebase;
  ACCESS.ready = !!(ACCESS.auth && ACCESS.db);
  // keep ACCESS.user from initAccess()
  return { ...ACCESS };
}

// ---- Synchronous permission gates (UI helpers) ----

export function canChat(){
  const now = Date.now();
  if(!ACCESS.isAuthed) return false;
  if(Number(ACCESS.banUntil||0) > now) return false;
  if(Number(ACCESS.muteUntil||0) > now) return false;
  return true;
}

export function canDM(){
  const now = Date.now();
  if(!ACCESS.isAuthed) return false;
  if(Number(ACCESS.banUntil||0) > now) return false;
  if(Number(ACCESS.dmBanUntil||0) > now) return false;
  return true;
}
