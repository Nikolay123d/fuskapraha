window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  authDomain: "praga-4baee.firebaseapp.com",
  databaseURL: "https://praga-4baee-default-rtdb.firebaseio.com",
  projectId: "praga-4baee",
  storageBucket: "praga-4baee.appspot.com",
  messagingSenderId: "336023952536",
  appId: "1:336023952536:web:f7437feaa25b6eadcd04ed",
  measurementId: "G-BGDJD6R12N"
};
window.ADMIN_EMAIL="urciknikolaj642@gmail.com";
window.DEFAULT_AVATAR="./img/default-avatar.svg";
window.DEFAULT_BG="./img/default-chat-bg.jpg";
try{ if(!firebase.apps.length){ firebase.initializeApp(window.FIREBASE_CONFIG); } window.auth=firebase.auth(); window.db=firebase.database(); }catch(e){ console.error('Firebase init error', e); }
