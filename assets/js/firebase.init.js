(function(){
  firebase.initializeApp({
    apiKey: "PASTE_YOUR_KEY",
    authDomain: "PROJECT.firebaseapp.com",
    databaseURL: "https://PROJECT.firebaseio.com",
    projectId: "PROJECT"
  });
  window.db = firebase.database();
  window.auth = firebase.auth();
})();