/* GENERATED FILE. Edit tools/sw.template.js and run python3 tools/build_pwa.py. */
const BUILD_ID = 'ace8e2c578adc702';
const CACHE_NAME = 'polka-offline-' + BUILD_ID;
const PRECACHE_FILES = [
  "./index.html?v=ace8e2c578adc702",
  "./pwa.js?v=ace8e2c578adc702",
  "./pwa.css?v=ace8e2c578adc702",
  "./notes-transfer.js?v=ace8e2c578adc702",
  "./theory-map.js?v=ace8e2c578adc702",
  "./theory-map-legacy.js",
  "./data/theory-map.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./data/art/frontispiece.webp",
  "./data/art/shelf-vignettes.webp",
  "./data/b-apelsiny.js?v=ace8e2c578adc702",
  "./data/b-barthes.js?v=ace8e2c578adc702",
  "./data/b-e_about.js?v=ace8e2c578adc702",
  "./data/b-e_alcestis.js?v=ace8e2c578adc702",
  "./data/b-e_andromache.js?v=ace8e2c578adc702",
  "./data/b-e_bacchae.js?v=ace8e2c578adc702",
  "./data/b-e_bacchaez.js?v=ace8e2c578adc702",
  "./data/b-e_cyclops.js?v=ace8e2c578adc702",
  "./data/b-e_electra.js?v=ace8e2c578adc702",
  "./data/b-e_hecuba.js?v=ace8e2c578adc702",
  "./data/b-e_helena.js?v=ace8e2c578adc702",
  "./data/b-e_heracles.js?v=ace8e2c578adc702",
  "./data/b-e_heraclidae.js?v=ace8e2c578adc702",
  "./data/b-e_hippolytus.js?v=ace8e2c578adc702",
  "./data/b-e_ion.js?v=ace8e2c578adc702",
  "./data/b-e_iphaul.js?v=ace8e2c578adc702",
  "./data/b-e_iphtaur.js?v=ace8e2c578adc702",
  "./data/b-e_medea.js?v=ace8e2c578adc702",
  "./data/b-e_orestes.js?v=ace8e2c578adc702",
  "./data/b-e_phoenissae.js?v=ace8e2c578adc702",
  "./data/b-e_rhesus.js?v=ace8e2c578adc702",
  "./data/b-e_supplices.js?v=ace8e2c578adc702",
  "./data/b-e_troades.js?v=ace8e2c578adc702",
  "./data/b-frye.js?v=ace8e2c578adc702",
  "./data/b-gulliver.js?v=ace8e2c578adc702",
  "./data/b-ne.js?v=ace8e2c578adc702",
  "./data/b-paradise.js?v=ace8e2c578adc702",
  "./data/b-peterburg.js?v=ace8e2c578adc702",
  "./data/b-phedre.js?v=ace8e2c578adc702",
  "./data/b-robinson.js?v=ace8e2c578adc702",
  "./data/b-tartuffe.js?v=ace8e2c578adc702",
  "./data/b-voron.js?v=ace8e2c578adc702",
  "./data/b-werther.js?v=ace8e2c578adc702",
  "./data/img.js?v=ace8e2c578adc702"
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
