/* GENERATED FILE. Edit tools/sw.template.js and run python3 tools/build_pwa.py. */
const BUILD_ID = '46489df7e03c39ee';
const CACHE_NAME = 'polka-offline-' + BUILD_ID;
const PRECACHE_FILES = [
  "./index.html?v=46489df7e03c39ee",
  "./pwa.js?v=46489df7e03c39ee",
  "./pwa.css?v=46489df7e03c39ee",
  "./notes-transfer.js?v=46489df7e03c39ee",
  "./theory-map.js?v=46489df7e03c39ee",
  "./theory-map-legacy.js",
  "./data/theory-map.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./data/art/frontispiece.webp",
  "./data/art/shelf-vignettes.webp",
  "./data/b-apelsiny.js?v=46489df7e03c39ee",
  "./data/b-barthes.js?v=46489df7e03c39ee",
  "./data/b-e_about.js?v=46489df7e03c39ee",
  "./data/b-e_alcestis.js?v=46489df7e03c39ee",
  "./data/b-e_andromache.js?v=46489df7e03c39ee",
  "./data/b-e_bacchae.js?v=46489df7e03c39ee",
  "./data/b-e_bacchaez.js?v=46489df7e03c39ee",
  "./data/b-e_cyclops.js?v=46489df7e03c39ee",
  "./data/b-e_electra.js?v=46489df7e03c39ee",
  "./data/b-e_hecuba.js?v=46489df7e03c39ee",
  "./data/b-e_helena.js?v=46489df7e03c39ee",
  "./data/b-e_heracles.js?v=46489df7e03c39ee",
  "./data/b-e_heraclidae.js?v=46489df7e03c39ee",
  "./data/b-e_hippolytus.js?v=46489df7e03c39ee",
  "./data/b-e_ion.js?v=46489df7e03c39ee",
  "./data/b-e_iphaul.js?v=46489df7e03c39ee",
  "./data/b-e_iphtaur.js?v=46489df7e03c39ee",
  "./data/b-e_medea.js?v=46489df7e03c39ee",
  "./data/b-e_orestes.js?v=46489df7e03c39ee",
  "./data/b-e_phoenissae.js?v=46489df7e03c39ee",
  "./data/b-e_rhesus.js?v=46489df7e03c39ee",
  "./data/b-e_supplices.js?v=46489df7e03c39ee",
  "./data/b-e_troades.js?v=46489df7e03c39ee",
  "./data/b-frye.js?v=46489df7e03c39ee",
  "./data/b-gulliver.js?v=46489df7e03c39ee",
  "./data/b-ne.js?v=46489df7e03c39ee",
  "./data/b-paradise.js?v=46489df7e03c39ee",
  "./data/b-peterburg.js?v=46489df7e03c39ee",
  "./data/b-phedre.js?v=46489df7e03c39ee",
  "./data/b-robinson.js?v=46489df7e03c39ee",
  "./data/b-tartuffe.js?v=46489df7e03c39ee",
  "./data/b-voron.js?v=46489df7e03c39ee",
  "./data/b-werther.js?v=46489df7e03c39ee",
  "./data/img.js?v=46489df7e03c39ee"
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
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    return fetch(req); // New uncached assets can still be requested online.
  })());
});
