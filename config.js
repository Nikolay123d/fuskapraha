// === Firebase config (your project) ===
// IMPORTANT: make sure this domain is in Firebase Auth -> Settings -> Authorized domains:
//   - praga-4baee.firebaseapp.com
//   - github.io (or your custom domain)
window.PF = {
  ADMIN_EMAIL: "urciknikolaj642@gmail.com", // change if needed
  DEFAULT_CITY: "Praha",
  TRANSLATE_ENDPOINT: "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=", // + target + &q=...
};

const firebaseConfig = {
  apiKey: "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  authDomain: "praga-4baee.firebaseapp.com",
  databaseURL: "https://praga-4baee-default-rtdb.firebaseio.com",
  projectId: "praga-4baee",
  storageBucket: "praga-4baee.appspot.com",
  messagingSenderId: "336023952536",
  appId: "1:336023952536:web:f7437feaa25b6eadcd04ed",
};

// Init
firebase.initializeApp(firebaseConfig);
window.fb = {
  auth: firebase.auth(),
  db: firebase.database(),
  storage: firebase.storage()
};
