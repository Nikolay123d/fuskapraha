/*
  Firebase Cloud Messaging Service Worker
  Background notifications (tab closed).

  Notes:
  - Works on HTTPS (or localhost). file:// will not work.
  - Some browsers/OS may stop background delivery when the browser is fully terminated.
*/

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// IMPORTANT: Keep this config in sync with app.js (window.FIREBASE_CONFIG)
firebase.initializeApp({
  apiKey: "AIzaSyDw_bVibsVyZegH7OJyZ_yRjI3uLhroVBk",
  authDomain: "praga-4baee.firebaseapp.com",
  databaseURL: "https://praga-4baee-default-rtdb.firebaseio.com",
  projectId: "praga-4baee",
  storageBucket: "praga-4baee.firebasestorage.app",
  messagingSenderId: "336023952536",
  appId: "1:336023952536:web:f7437feaa25b6eadcd04ed",
  measurementId: "G-BGDJD6R12N"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  try {
    const n = payload.notification || {};
    const data = payload.data || {};

    const title = n.title || data.title || 'Makáme.cz';
    const body = n.body || data.body || '';

    // Optional rich image (supported mostly on Chrome)
    const image = n.image || data.image || undefined;
    const icon = n.icon || data.icon || '/img/logo-192.png';

    const notifOptions = {
      body,
      icon,
      image,
      badge: data.badge || '/img/logo-192.png',
      data: {
        url: data.url || '/',
        ...data
      }
    };

    self.registration.showNotification(title, notifOptions);
  } catch (e) {
    // ignore
  }
});

// Click -> open/ focus
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })()
  );
});
