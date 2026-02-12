// assets/js/modules/firebase/10_access.js
// Single access point for Firebase handles.
// Must not crash if Firebase SDK isn't loaded yet.

import { initFirebaseOnce } from './00_firebase.js';

// Admin role cache (set by app-level auth listener in assets/js/app.js)
if (typeof window !== 'undefined' && window.__mk_isAdmin === undefined) {
  window.__mk_isAdmin = false;
}

/**
 * @returns {{auth:any|null, db:any|null, st:any|null, firebase:any|null, ready:boolean, isAdmin:boolean}}
 */
export function getAccess(){
  try {
    initFirebaseOnce();
  } catch (e) {
    console.warn('[access] initFirebaseOnce failed:', e);
  }

  const auth = window.auth ?? null;
  const db   = window.db   ?? null;
  const st   = window.st   ?? null;
  const fb   = window.firebase ?? null;
  const isAdmin = !!window.__mk_isAdmin;

  return { auth, db, st, firebase: fb, ready: !!(auth && db), isAdmin };
}

// Convenience guards used across features.
export function isAuthed(){
  return !!(window.auth && window.auth.currentUser);
}

export function isAdmin(){
  return !!window.__mk_isAdmin;
}

// Minimal capability check for writing to public chat.
// (Real enforcement must be in RTDB rules.)
export function canChat(){
  return isAuthed();
}

// Backward-compat: some older modules call initAccess(user)
export function initAccess(){
  // no-op: access is always via getAccess() / window.*
}
