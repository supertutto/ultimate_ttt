// sw.js — Service Worker
// INCREMENTA CACHE_VERSION ad ogni aggiornamento per forzare il refresh
const CACHE_VERSION = 'v1.0.4';
const CACHE_NAME    = 'uttt-' + CACHE_VERSION;
const ASSETS = [
  './', './index.html', './style.css',
  './js/constants.js', './js/game.js', './js/ai.js',
  './js/ui.js', './js/main.js', './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
