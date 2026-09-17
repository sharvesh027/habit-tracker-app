// ============================================================
// SERVICE WORKER — makes the app installable and usable offline
// ============================================================

const CACHE_NAME = 'habit-tracker-v1';

// The "app shell" — everything needed to open the app itself,
// even with no internet. Your actual habit/checklist DATA still
// needs a connection since it lives in Google Sheets.
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old cache versions from previous deployments.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept calls to the Apps Script backend — always let
  // those go straight to the network so your data stays live and
  // fresh. Offline behavior for those is handled by the app's own
  // error alerts, not by this service worker.
  if (url.hostname.includes('script.google.com')) {
    return;
  }

  // For the app's own files: try the cache first (instant load,
  // works offline), fall back to the network for anything new.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
