/* GENERATED FILE. Edit tools/sw.template.js and run python3 tools/build_pwa.py. */
const BUILD_ID = 'b700f1509724957d';
const CACHE_NAME = 'polka-offline-' + BUILD_ID;
const PRECACHE_FILES = [
  "./index.html?v=b700f1509724957d",
  "./pwa.js",
  "./pwa.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./data/b-apelsiny.js?v=b700f1509724957d",
  "./data/b-e_about.js?v=b700f1509724957d",
  "./data/b-e_alcestis.js?v=b700f1509724957d",
  "./data/b-e_andromache.js?v=b700f1509724957d",
  "./data/b-e_bacchae.js?v=b700f1509724957d",
  "./data/b-e_bacchaez.js?v=b700f1509724957d",
  "./data/b-e_cyclops.js?v=b700f1509724957d",
  "./data/b-e_electra.js?v=b700f1509724957d",
  "./data/b-e_hecuba.js?v=b700f1509724957d",
  "./data/b-e_helena.js?v=b700f1509724957d",
  "./data/b-e_heracles.js?v=b700f1509724957d",
  "./data/b-e_heraclidae.js?v=b700f1509724957d",
  "./data/b-e_hippolytus.js?v=b700f1509724957d",
  "./data/b-e_ion.js?v=b700f1509724957d",
  "./data/b-e_iphaul.js?v=b700f1509724957d",
  "./data/b-e_iphtaur.js?v=b700f1509724957d",
  "./data/b-e_medea.js?v=b700f1509724957d",
  "./data/b-e_orestes.js?v=b700f1509724957d",
  "./data/b-e_phoenissae.js?v=b700f1509724957d",
  "./data/b-e_rhesus.js?v=b700f1509724957d",
  "./data/b-e_supplices.js?v=b700f1509724957d",
  "./data/b-e_troades.js?v=b700f1509724957d",
  "./data/b-frye.js?v=b700f1509724957d",
  "./data/b-gulliver.js?v=b700f1509724957d",
  "./data/b-ne.js?v=b700f1509724957d",
  "./data/b-paradise.js?v=b700f1509724957d",
  "./data/b-peterburg.js?v=b700f1509724957d",
  "./data/b-phedre.js?v=b700f1509724957d",
  "./data/b-robinson.js?v=b700f1509724957d",
  "./data/b-tartuffe.js?v=b700f1509724957d",
  "./data/b-voron.js?v=b700f1509724957d",
  "./data/b-werther.js?v=b700f1509724957d",
  "./data/img.js?v=b700f1509724957d"
];
const SCOPE = self.registration.scope;

// One complete version is cached before activation. Old content stays in place
// if an update loses network access or cannot be fully downloaded.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_FILES.map(path => new Request(new URL(path, SCOPE).href, {cache:'reload'})));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('polka-offline-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    // Do not mix a fresh index with older cached book scripts during updates.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(new URL('./index.html?v=' + BUILD_ID, SCOPE).href) || fetch(req);
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    return fetch(req); // New uncached assets can still be requested online.
  })());
});
