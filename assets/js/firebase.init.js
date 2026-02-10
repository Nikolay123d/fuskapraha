(function () {
  'use strict';
  if (window.__FIREBASE_READY__) return;
  window.__FIREBASE_READY__ = true;

  var firebaseConfig = {
    apiKey: "AIzaSyDV2BslF-Ll37a1XO3GEfzNMXa7YsSXL1o",
    authDomain: "web-app-b4633.firebaseapp.com",
    databaseURL: "https://web-app-b4633-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "web-app-b4633",
    storageBucket: "web-app-b4633.firebasestorage.app",
    messagingSenderId: "1041887915171",
    appId: "1:1041887915171:web:84d62eae54e9291b47a316",
    measurementId: "G-C65BPE81SJ"
  };

  firebase.initializeApp(firebaseConfig);
  window.auth = firebase.auth();
  window.db = firebase.database();
  window.storage = firebase.storage();
  console.log('[firebase.init] OK');
})();