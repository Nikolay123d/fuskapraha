// Firebase bootstrap (single source of truth)
// Uses Firebase *compat* SDK loaded from CDN in index.html.

export function initFirebaseOnce(){
  if (window.__MK_FB_READY__) return;

  if (!window.firebase || !window.firebase.initializeApp) {
    console.error('[firebase] compat SDK not loaded (check index.html scripts)');
    return;
  }

  // IMPORTANT: real config for project web-app-b4633
  const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
    apiKey: "AIzaSyDV2BslF-Ll37a1XO3GEfzNMXa7YsSXL1o",
    authDomain: "web-app-b4633.firebaseapp.com",
    databaseURL: "https://web-app-b4633-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "web-app-b4633",
    storageBucket: "web-app-b4633.firebasestorage.app",
    messagingSenderId: "1041887915171",
    appId: "1:1041887915171:web:84d62eae54e9291b47a316",
    measurementId: "G-C65BPE81SJ",
  };

  // Guard against placeholders
  if (!FIREBASE_CONFIG.apiKey || String(FIREBASE_CONFIG.apiKey).includes('YOUR_API_KEY')) {
    console.error('[firebase] invalid apiKey in FIREBASE_CONFIG');
    return;
  }
  if (!FIREBASE_CONFIG.databaseURL || String(FIREBASE_CONFIG.databaseURL).includes('your_project')) {
    console.error('[firebase] invalid databaseURL in FIREBASE_CONFIG');
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  window.auth = firebase.auth();
  window.db   = firebase.database();
  window.st   = firebase.storage ? firebase.storage() : null;

  // Recommended on GH Pages: use local persistence (default in most browsers) explicitly.
  try {
    window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch(e) {
    // ignore
  }

  window.__MK_FB_READY__ = true;
  console.log('[firebase] initialized');
}
