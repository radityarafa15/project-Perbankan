/* eslint-disable no-undef */
importScripts(
  "https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyAs-Ki2X_J5idzbwPxllXewGokmyqgYRaA",
  authDomain: "perbankan-97923.firebaseapp.com",
  projectId: "perbankan-97923",
  storageBucket: "perbankan-97923.firebasestorage.app",
  messagingSenderId: "352281881126",
  appId: "1:352281881126:web:0e7233d52a5551d0b8d4e7",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "SMoney";
  const options = {
    body: payload.notification?.body || "",
    icon: "./android-chrome-192x192.png",
    badge: "./android-chrome-192x192.png",
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          if ("focus" in c) return c.focus();
        }
        if (clients.openWindow) return clients.openWindow("./index.html");
      }),
  );
});
