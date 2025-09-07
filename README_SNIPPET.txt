Why chats/participants didn't load:
- You used ESM imports (v9 modular: `import { initializeApp } from "firebase/app"`) inside a plain HTML page.
- Our app.js expects the global `firebase` from CDN (compat build). With ESM snippet, `firebase` is undefined → nothing works.

Fix in this build (v3-praga):
- `index.html` includes compat scripts:
  <script src="https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.4/firebase-auth-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.4/firebase-database-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.4/firebase-storage-compat.js" defer></script>

- `config.js` defines:
  window.PF_CONFIG = { ...your keys... };

If you want the **modular v9+ ESM** style, you must rebuild app.js to use:
  import {{ initializeApp }} from "firebase/app";
  import {{ getAuth, signInAnonymously, onAuthStateChanged, updateProfile, ... }} from "firebase/auth";
  import {{ getDatabase, ref, onChildAdded, ... }} from "firebase/database";
  import {{ getStorage, ref as sRef, uploadBytes, getDownloadURL }} from "firebase/storage";
and remove all `firebase.*` globals.
