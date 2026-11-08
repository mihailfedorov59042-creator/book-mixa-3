// The three sections and their controls are one self-contained release.
const scope = self.registration.scope;
const index = new URL('index.html', scope).href;
const stagedIndex = new URL('index.html?ssl-staged', scope).href;
const cacheName = 'ssl-study:' + scope;
const appAssets = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']
  .map(path => new URL(path, scope).href);

async function downloadIndex() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(index, { cache: 'no-store', signal: controller.signal });
    if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) {
      throw new Error('Cannot download the study site');
    }

    const bytes = await response.arrayBuffer();
    const decoder = new TextDecoder();
    if (!decoder.decode(bytes.slice(0, 2048)).includes('<meta name="ssl-app" content="1">') ||
        !decoder.decode(bytes.slice(-100)).trimEnd().endsWith('</body></html>')) {
      throw new Error('Incomplete or unrecognized study site');
    }
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const revision = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    return new Response(bytes, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-SSL-Revision': revision },
    });
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const active = await cache.match(index);
    // Refresh manifest/icons even when the saved study page is already present.
    await cache.addAll(appAssets.map(url => new Request(url, { cache: 'reload' })));
    if (active) return;
    const page = await downloadIndex();
    await cache.put(index, page);
  })());
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const pageRequest = url.href === index ||
    (request.mode === 'navigate' && url.origin + url.pathname === scope);
  if (!pageRequest && !appAssets.includes(url.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(pageRequest ? index : url.href) || fetch(request);
  })());
});

function revisionOf(response) {
  return response?.headers.get('X-SSL-Revision');
}

async function update(message) {
  const cache = await caches.open(cacheName);
  const active = await cache.match(index);
  const activeRevision = revisionOf(active);

  if (message.type === 'CHECK_UPDATE') {
    const downloaded = await downloadIndex();
    const revision = revisionOf(downloaded);
    if (revision === activeRevision) {
      await cache.delete(stagedIndex);
      return { state: 'current' };
    }
    await cache.put(stagedIndex, downloaded);
    return { state: 'ready', revision };
  }

  const staged = await cache.match(stagedIndex);
  const stagedRevision = revisionOf(staged);
  if (message.type === 'APPLY_UPDATE') {
    if (activeRevision && activeRevision === message.revision) return { state: 'applied' };
    if (stagedRevision && stagedRevision === message.revision) {
      await cache.put(index, staged);
      await cache.delete(stagedIndex);
      return { state: 'applied' };
    }
  }
  return stagedRevision ? { state: 'ready', revision: stagedRevision } : { state: 'current' };
}

// Serialize checks and activations from multiple windows.
let queue = Promise.resolve();
self.addEventListener('message', event => {
  const reply = event.ports[0];
  const message = event.data;
  if (!reply || !event.source?.url.startsWith(scope) ||
      !['CHECK_UPDATE', 'GET_UPDATE', 'APPLY_UPDATE'].includes(message?.type)) return;

  queue = queue.then(() => update(message))
    .then(result => reply.postMessage(result))
    .catch(() => reply.postMessage({ state: 'error' }));
  event.waitUntil(queue);
});
