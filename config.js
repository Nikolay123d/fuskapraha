window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  authDomain: "praga-4baee.firebaseapp.com",
  databaseURL: "https://praga-4baee-default-rtdb.firebaseio.com",
  projectId: "praga-4baee"
};
window.ADMIN_EMAIL = "urciknikolaj642@gmail.com";
try{ if(!firebase.apps.length){ firebase.initializeApp(window.FIREBASE_CONFIG);} window.auth=firebase.auth(); window.db=firebase.database(); }catch(e){ console.error(e);}