// ==== Firebase & App config ====
window.APP = {
  ADMIN_EMAIL: "urciknikolaj642@gmail.com",
  DEFAULT_CITY: "Praha",
  DEFAULT_WALLPAPER: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&q=80&auto=format&fit=crop", // Prague skyline (Unsplash)
  CITIES: ["Praha","Brno","Ostrava","Plzeň","Liberec"]
};

const firebaseConfig = {
  apiKey: "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  authDomain: "praga-4baee.firebaseapp.com",
  databaseURL: "https://praga-4baee-default-rtdb.firebaseio.com",
  projectId: "praga-4baee",
  storageBucket: "praga-4baee.appspot.com",
  messagingSenderId: "336023952536",
  appId: "1:336023952536:web:f7437feaa25b6eadcd04ed"
};

firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db   = firebase.database();
window.stg  = firebase.storage();
