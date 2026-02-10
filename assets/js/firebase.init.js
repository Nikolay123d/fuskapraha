(function(){
  firebase.initializeApp({
    apiKey: "PASTE_YOUR_KEY",
    authDomain: "PROJECT.firebaseapp.com",
    databaseURL: "https://PROJECT.firebaseio.com",
    projectId: "PROJECT"
  });
  console.log('[firebase.init] OK');
})();