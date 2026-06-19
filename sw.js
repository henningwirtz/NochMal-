// ============================================================================
// sw.js – Service Worker für die PWA.
// Strategie: "Network-first" – online wird immer die aktuelle Version geladen
// (kein Stale-Cache-Problem), offline fällt es auf den zuletzt gecachten Stand
// zurück. Beim Installieren wird die App-Shell vorab gecacht (Offline-Start).
// ============================================================================

// Cache-Name aus der EINEN Versionsquelle (version.js) ableiten. So invalidiert
// der Offline-Cache automatisch, sobald die Version hochgezaehlt wird - man muss
// die Cache-Version nicht mehr separat pflegen.
importScripts('version.js');
const CACHE = 'nochmal-' +
  String(self.APP_VERSION || 'dev').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'version.js',
  'css/styles.css',
  'js/main.js',
  'js/core/constants.js',
  'js/core/dice.js',
  'js/core/rules.js',
  'js/core/sheet.js',
  'js/core/game.js',
  'js/core/ai.js',
  'js/data/board.js',
  'js/ui/boardView.js',
  'js/ui/controls.js',
  'js/ui/flow.js',
  'js/ui/storage.js',
  'js/ui/sound.js',
  'js/ui/util.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // cache: 'reload' umgeht den HTTP-Cache des Browsers (GitHub Pages liefert
  // ~10 Min max-age) - so ist online wirklich immer der frische Stand da.
  e.respondWith(
    fetch(e.request, { cache: 'reload' })
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
