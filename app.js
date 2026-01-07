/**
 * MAKÁME / PRAHA FUŠKY — Stable Chat Core (v13)
 * Goal: chat works 100% (Realtime + after reload) with minimal moving parts.
 * DB path: /rooms/<city>/messages
 * Auth: anonymous (fallback), because rules require auth.
 */
(function () {
  'use strict';

  // --- Safety: prevent inline onclick errors from killing the app
  window.closeModal = window.closeModal || function(){};
  window.openModal  = window.openModal  || function(){};

  // --- Firebase init (compat SDK is loaded in index.html)
  const firebaseConfig = {
  "apiKey": "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  "authDomain": "praga-4baee.firebaseapp.com",
  "databaseURL": "https://praga-4baee-default-rtdb.firebaseio.com",
  "projectId": "praga-4baee",
  "storageBucket": "praga-4baee.firebasestorage.app",
  "messagingSenderId": "336023952536",
  "appId": "1:336023952536:web:f7437feaa25b6eadcd04ed",
  "measurementId": "G-BGDJD6R12N"
};
  if (!window.firebase) {
    console.error('Firebase SDK not loaded');
    return;
  }
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
  const auth = firebase.auth();
  const db = firebase.database();

  // --- Helpers
  const $ = (id) => document.getElementById(id);
  function toast(text) {
    // lightweight toast if your UI has one; fallback to console
    try {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;border:1px solid rgba(255,255,255,.15);padding:10px 12px;border-radius:12px;z-index:99999;max-width:92vw;font:14px system-ui;';
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 2600);
    } catch(e) {
      console.log(text);
    }
  }

  function safeNick() {
    const stored = (localStorage.getItem('nick') || '').trim();
    if (stored) return stored.slice(0, 40);
    // try take from UI if exists
    const me = $('meNick');
    if (me && me.textContent) return me.textContent.trim().slice(0,40);
    return 'Uživatel';
  }

  async function ensureAuth() {
    if (auth.currentUser) return auth.currentUser;
    try {
      const cred = await auth.signInAnonymously();
      return cred.user;
    } catch (e) {
      console.warn('Anonymous auth failed:', e);
      toast('Нужно включить Anonymous Auth в Firebase Authentication.');
      throw e;
    }
  }

  // --- Chat core
  let chatUnsub = null;
  let currentRoom = null;

  function renderMessage(key, m) {
    const feed = $('chatFeed');
    if (!feed) return;

    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.dataset.key = key;

    const ava = document.createElement('div');
    ava.className = 'ava';
    const img = document.createElement('img');
    img.src = './img/default-avatar.svg';
    img.alt = 'ava';
    ava.appendChild(img);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = (m.nick || 'Uživatel');

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = (m.text || '');

    bubble.appendChild(name);
    bubble.appendChild(text);

    msg.appendChild(ava);
    msg.appendChild(bubble);

    const atBottom = (feed.scrollTop + feed.clientHeight) >= (feed.scrollHeight - 40);
    feed.appendChild(msg);
    if (atBottom) {
      feed.scrollTop = feed.scrollHeight;
    }
  }

  function clearFeed() {
    const feed = $('chatFeed');
    if (feed) feed.innerHTML = '';
  }

  function stopChat() {
    if (typeof chatUnsub === 'function') {
      chatUnsub();
    }
    chatUnsub = null;
  }

  function startChat(room) {
    stopChat();
    currentRoom = room;
    clearFeed();

    const feed = $('chatFeed');
    if (!feed) return;

    const ref = db.ref(`rooms/${room}/messages`).orderByChild('ts').limitToLast(50);

    const handler = (snap) => {
      const val = snap.val();
      if (!val) return;
      renderMessage(snap.key, val);
    };

    ref.off();
    ref.on('child_added', handler, (err) => {
      console.error('chat listener error', err);
      toast('Ошибка доступа к чату (rules). Проверь Rules + Publish.');
    });

    chatUnsub = () => ref.off('child_added', handler);
  }

  async function sendMessage() {
    const input = $('msgText');
    const btn = $('sendBtn');
    if (!input || !btn) return;

    const text = (input.value || '').trim();
    if (!text) return;

    btn.disabled = true;
    try {
      await ensureAuth();
      const user = auth.currentUser;
      const msg = {
        text,
        uid: user.uid,
        nick: safeNick(),
        ts: firebase.database.ServerValue.TIMESTAMP
      };
      const room = currentRoom || (($('citySelect') && $('citySelect').value) || 'praha');
      await db.ref(`rooms/${room}/messages`).push(msg);
      input.value = '';
    } catch (e) {
      console.error(e);
      toast('Не удалось отправить. Проверь интернет / rules / auth.');
    } finally {
      btn.disabled = false;
      input && input.focus && input.focus();
    }
  }

  function wireUI() {
    const sendBtn = $('sendBtn');
    const msgText = $('msgText');
    const citySelect = $('citySelect');

    if (msgText) {
      msgText.setAttribute('autocomplete','off');
      msgText.setAttribute('autocorrect','off');
      msgText.setAttribute('autocapitalize','sentences');
      msgText.setAttribute('spellcheck','true');
      msgText.setAttribute('inputmode','text');
      msgText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', sendMessage);
    }

    if (citySelect) {
      citySelect.addEventListener('change', () => {
        startChat(citySelect.value || 'praha');
      });
    }

    // Default: open chat on Praha
    startChat((citySelect && citySelect.value) || 'praha');
  }

  // Boot
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await ensureAuth();
    } catch (e) {
      // still allow UI, but sending will show message
    }
    wireUI();
  });

})();
