
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
window.CREATOR_EMAIL = "urciknikolaj642@gmail.com";
window.ADMIN_EMAILS = [window.CREATOR_EMAIL, "natasaurcik36@gmail.com"];
window.INIT_AVATAR = "https://i.ibb.co/d4msf73h/snimok-ekrana-2017-11-13-v-16-00-25.png";
window.CSOB_ACC = "354037257/0300";
window.PREMIUM_PRICING = { monthly: 50, plus: 120, lifetime_bot: 200 };

if (!firebase?.apps?.length) { firebase.initializeApp(window.FIREBASE_CONFIG); }
window.auth = firebase.auth();
window.db   = firebase.database();
