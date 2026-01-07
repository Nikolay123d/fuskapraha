// Firebase compat config (REAL PROJECT)
const firebaseConfig = {
  apiKey: "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  authDomain: "praga-4baee.firebaseapp.com",
  databaseURL: "https://praga-4baee-default-rtdb.firebaseio.com",
  projectId: "praga-4baee",
  storageBucket: "praga-4baee.firebasestorage.app",
  messagingSenderId: "336023952536",
  appId: "1:336023952536:web:f7437feaa25b6eadcd04ed"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

firebase.auth().signInAnonymously();

const chatRef = db.ref("messages/praha");
const chat = document.getElementById("chat");

chatRef.limitToLast(50).on("child_added", snap => {
  const m = snap.val();
  const d = document.createElement("div");
  d.textContent = m.text;
  chat.appendChild(d);
});

document.getElementById("send").onclick = () => {
  const t = msg.value.trim();
  if(!t) return;
  chatRef.push({ text: t, by: firebase.auth().currentUser.uid, ts: Date.now() });
  msg.value = "";
};
