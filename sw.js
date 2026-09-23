// Bump CACHE og VERSJON i app.js sammen ved hver endring.
// Nettverk-først: du ser alltid siste versjon når du er på nett, og cachen
// er bare en reserve når du er offline.
const CACHE = 'hex-v17';
const FILER = ['./', 'index.html', 'styles.css', 'statistikk.js', 'matte.js', 'hexgrid.js', 'finale.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILER.map(f =>
    fetch(f, { cache: 'reload' }).then(r => { if (r.ok) return c.put(f, r); }).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) {
          const kopi = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, kopi)).catch(() => {});
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
