// Mill Dust Log service worker: network first, cache fallback, so updates arrive when online and the
// log still opens with no signal. Bump VERSION when app files change.
// The 3D floor (3d/plant-floor.js) is not precached: it's cached the first time it loads.
const VERSION = 'v2';
const CACHE = 'dustlog-' + VERSION;
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'migrate.js', 'zones.js', 'plant.js', 'ui/caylor-ui.css', 'ui/support.js',
  'manifest.webmanifest', 'favicon.ico', 'icons/favicon-32.png', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'fonts/inter-latin-wght-normal.woff2', 'fonts/montserrat-latin-wght-normal.woff2'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
