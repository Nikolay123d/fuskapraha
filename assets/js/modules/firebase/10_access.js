// assets/js/modules/firebase/10_access.js
// Single access point for Firebase handles.
// Must not crash if Firebase SDK isn't loaded yet.

import { initFirebaseOnce } from './00_firebase.js';

/**
 * @returns {{auth:any|null, db:any|null, st:any|null, firebase:any|null, ready:boolean}}
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

  return { auth, db, st, firebase: fb, ready: !!(auth && db) };
}
