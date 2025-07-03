#!/bin/bash

cat <<EOF > "./public/firebase-messaging-sw.js"
importScripts(
    "https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js"
);
importScripts(
    "https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js"
);

const firebaseConfig = {
  apiKey: "${FCM_API_KEY}",
  authDomain: "${FCM_AUTH_DOMAIN}",
  projectId: "${FCM_PROJECT_ID}",
  storageBucket: "${FCM_STORAGE_BUCKET}",
  messagingSenderId: "${FCM_MESSAGING_SENDER_ID}",
  appId: "${FCM_APP_ID}",
  measurementId: "${FCM_MEASUREMENT_ID}"
};

const app = firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    self.registration.showNotification(payload.data?.title, {
        body: payload.data?.body,
        data: {
            url: payload.data?.url
        },
    });
});

self.addEventListener('notificationclick', (event) => {
    const url = event.notification.data.url;
    if (url) event.waitUntil(clients.openWindow(url));
});
EOF