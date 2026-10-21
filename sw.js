/* ==========================================================
   GetNumber — sw.js
   Offline support. Network-first so published updates land
   immediately; cache fallback so the app still opens with no
   signal.
   ========================================================== */
'use strict';

var CACHE = 'getnumber-v1';

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/themes.css',
  './css/print.css',
  './js/crypto.js',
  './js/vault.js',
  './js/qr.js',
  './js/app.js',
  './js/editor.js',
  './js/backup.js',
  './js/print.js',
  './js/boot.js',
  './data/public.json',
  './data/vault.enc.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Add individually so one missing file does not abort the install.
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline and not cached.', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
