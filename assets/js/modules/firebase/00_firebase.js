// Firebase bootstrap (SINGLE SOURCE OF TRUTH)
// - initializes Firebase exactly once
// - exposes window.auth/window.db/window.st for legacy code
// - keeps config in one place

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDV2BslF-Ll37a1XO3GEfzNMXa7YsSXL1o",
  authDomain: "web-app-b4633.firebaseapp.com",
  databaseURL: "https://web-app-b4633-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "web-app-b4633",
  storageBucket: "web-app-b4633.firebasestorage.app",
  messagingSenderId: "1041887915171",
  appId: "1:1041887915171:web:84d62eae54e9291b47a316",
  measurementId: "G-C65BPE81SJ"
};

// Optional: allow overriding via window.FIREBASE_CONFIG before this module runs.
// (handy for quick experiments without editing the file)
const CFG = (window.FIREBASE_CONFIG && typeof window.FIREBASE_CONFIG === 'object')
  ? window.FIREBASE_CONFIG
  : FIREBASE_CONFIG;

export function getAuth(){ return window.auth || null; }
export function getDb(){ return window.db || null; }
export function getStorage(){ return window.st || null; }
export function getFirebaseError(){ return window.__firebaseError || null; }

// Initialize Firebase exactly once.
// Returns true on success, false on failure (and stores the failure in window.__firebaseError).
export function initFirebaseOnce(){
  if (window.__firebaseReady) return true;

  if (!window.firebase) {
    const err = new Error('Firebase SDK not loaded (firebase-app-compat.js missing)');
    window.__firebaseError = err;
    console.error('[firebase.init] FAILED', err);
    return false;
  }

  try{
    if (!firebase.apps.length) {
      firebase.initializeApp(CFG);
    }

    // expose for non-module / legacy code
    window.FIREBASE_CONFIG = CFG;
    window.auth = firebase.auth();
    window.db   = firebase.database();
    window.st   = firebase.storage();

    window.__firebaseReady = true;
    window.__firebaseError = null;
    console.log('[firebase.init] OK');
    return true;
  }catch(e){
    window.__firebaseError = e;
    console.error('[firebase.init] FAILED', e);
    return false;
  }
}
