/*
  Firebase Cloud Messaging Service Worker
  Background notifications (tab closed).

  Notes:
  - Works on HTTPS (or localhost). file:// will not work.
  - Some browsers/OS may stop background delivery when the browser is fully terminated.

  IMPORTANT:
  - This config MUST match the main app config (assets/js/app/core/02-config.js).
*/

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDV2BslF-Ll37a1XO3GEfzNMXa7YsSXL1o",
  authDomain: "web-app-b4633.web.app",
  databaseURL: "https://web-app-b4633-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "web-app-b4633",
  storageBucket: "web-app-b4633.firebasestorage.app",
  messagingSenderId: "1041887915171",
  appId: "1:1041887915171:web:84d62eae54e9291b47a316",
  measurementId: "G-C65BPE81SJ"
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
    const icon = n.icon || data.icon || '/assets/img/logo-192.png';

    const notifOptions = {
      body,
      icon,
      image,
      badge: data.badge || '/assets/img/logo-192.png',
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
