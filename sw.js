/* GENERATED FILE. Edit tools/sw.template.js and run python3 tools/build_pwa.py. */
const BUILD_ID = 'be45295dd4ff72d6';
const CACHE_NAME = 'polka-offline-' + BUILD_ID;
const PRECACHE_FILES = [
  "./index.html?v=be45295dd4ff72d6",
  "./pwa.js?v=be45295dd4ff72d6",
  "./pwa.css?v=be45295dd4ff72d6",
  "./notes-transfer.js?v=be45295dd4ff72d6",
  "./theory-map.js?v=be45295dd4ff72d6",
  "./theory-map-legacy.js",
  "./data/theory-map.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./data/art/frontispiece.webp",
  "./data/art/shelf-vignettes.webp",
  "./data/art/milton/milton01.webp",
  "./data/art/milton/milton02.webp",
  "./data/art/milton/milton03.webp",
  "./data/art/milton/milton04.webp",
  "./data/art/milton/milton05.webp",
  "./data/art/milton/milton06.webp",
  "./data/art/milton/milton07.webp",
  "./data/art/milton/milton08.webp",
  "./data/art/milton/milton09.webp",
  "./data/art/milton/milton10.webp",
  "./data/art/milton/milton11.webp",
  "./data/art/milton/milton12.webp",
  "./data/art/milton/milton13.webp",
  "./data/art/milton/milton14.webp",
  "./data/art/milton/milton15.webp",
  "./data/art/milton/milton16.webp",
  "./data/art/milton/milton17.webp",
  "./data/art/milton/milton18.webp",
  "./data/art/milton/milton19.webp",
  "./data/art/milton/milton20.webp",
  "./data/art/milton/milton21.webp",
  "./data/art/milton/milton22.webp",
  "./data/art/milton/milton23.webp",
  "./data/art/milton/milton24.webp",
  "./data/art/milton/milton25.webp",
  "./data/art/milton/milton26.webp",
  "./data/art/milton/milton27.webp",
  "./data/art/milton/milton28.webp",
  "./data/art/milton/milton29.webp",
  "./data/art/milton/milton30.webp",
  "./data/art/milton/milton31.webp",
  "./data/art/milton/milton32.webp",
  "./data/art/milton/milton33.webp",
  "./data/art/milton/milton34.webp",
  "./data/art/milton/milton35.webp",
  "./data/art/milton/milton36.webp",
  "./data/art/milton/milton37.webp",
  "./data/art/milton/milton38.webp",
  "./data/art/milton/milton39.webp",
  "./data/art/milton/milton40.webp",
  "./data/art/milton/milton41.webp",
  "./data/art/milton/milton42.webp",
  "./data/art/milton/milton43.webp",
  "./data/art/milton/milton44.webp",
  "./data/art/milton/milton45.webp",
  "./data/art/milton/milton46.webp",
  "./data/art/milton/milton47.webp",
  "./data/art/milton/milton48.webp",
  "./data/art/milton/milton49.webp",
  "./data/art/milton/milton50.webp",
  "./data/art/milton/ornaments.webp",
  "./data/b-apelsiny.js?v=be45295dd4ff72d6",
  "./data/b-barthes.js?v=be45295dd4ff72d6",
  "./data/b-e_about.js?v=be45295dd4ff72d6",
  "./data/b-e_alcestis.js?v=be45295dd4ff72d6",
  "./data/b-e_andromache.js?v=be45295dd4ff72d6",
  "./data/b-e_bacchae.js?v=be45295dd4ff72d6",
  "./data/b-e_bacchaez.js?v=be45295dd4ff72d6",
  "./data/b-e_cyclops.js?v=be45295dd4ff72d6",
  "./data/b-e_electra.js?v=be45295dd4ff72d6",
  "./data/b-e_hecuba.js?v=be45295dd4ff72d6",
  "./data/b-e_helena.js?v=be45295dd4ff72d6",
  "./data/b-e_heracles.js?v=be45295dd4ff72d6",
  "./data/b-e_heraclidae.js?v=be45295dd4ff72d6",
  "./data/b-e_hippolytus.js?v=be45295dd4ff72d6",
  "./data/b-e_ion.js?v=be45295dd4ff72d6",
  "./data/b-e_iphaul.js?v=be45295dd4ff72d6",
  "./data/b-e_iphtaur.js?v=be45295dd4ff72d6",
  "./data/b-e_medea.js?v=be45295dd4ff72d6",
  "./data/b-e_orestes.js?v=be45295dd4ff72d6",
  "./data/b-e_phoenissae.js?v=be45295dd4ff72d6",
  "./data/b-e_rhesus.js?v=be45295dd4ff72d6",
  "./data/b-e_supplices.js?v=be45295dd4ff72d6",
  "./data/b-e_troades.js?v=be45295dd4ff72d6",
  "./data/b-frye.js?v=be45295dd4ff72d6",
  "./data/b-gulliver.js?v=be45295dd4ff72d6",
  "./data/b-ne.js?v=be45295dd4ff72d6",
  "./data/b-paradise.js?v=be45295dd4ff72d6",
  "./data/b-peterburg.js?v=be45295dd4ff72d6",
  "./data/b-phedre.js?v=be45295dd4ff72d6",
  "./data/b-robinson.js?v=be45295dd4ff72d6",
  "./data/b-tartuffe.js?v=be45295dd4ff72d6",
  "./data/b-voron.js?v=be45295dd4ff72d6",
  "./data/b-werther.js?v=be45295dd4ff72d6",
  "./data/img.js?v=be45295dd4ff72d6"
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
