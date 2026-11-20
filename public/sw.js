const STATIC_CACHE = 'autotrack-static-v3';
const DATA_CACHE = 'autotrack-data-v1';

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-maskable.svg',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/favicon-48x48.png',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-120x120.png',
  '/apple-touch-icon-152x152.png',
  '/apple-touch-icon-167x167.png',
  '/pwa-192x192.png',
  '/pwa-maskable-192x192.png',
  '/pwa-384x384.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
];

const DATA_ENDPOINTS = {
  jobCards: '/__offline-cache/job-cards.json',
  inventory: '/__offline-cache/inventory.json',
  schedules: '/__offline-cache/schedules.json',
  settings: '/__offline-cache/settings.json',
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await Promise.allSettled(
        APP_SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const allowedCaches = new Set([STATIC_CACHE, DATA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!allowedCaches.has(key)) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

async function writeDataRecord(url, payload) {
  const cache = await caches.open(DATA_CACHE);
  const body = JSON.stringify({
    cachedAt: new Date().toISOString(),
    data: payload,
  });
  await cache.put(
    url,
    new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Offline-Source': 'autotrack-sw',
      },
    })
  );
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (msg.type === 'SYNC_OFFLINE_RECORDS') {
    const writes = [];
    if (Array.isArray(msg.jobCards)) {
      writes.push(writeDataRecord(DATA_ENDPOINTS.jobCards, msg.jobCards));
    }
    if (Array.isArray(msg.inventory)) {
      writes.push(writeDataRecord(DATA_ENDPOINTS.inventory, msg.inventory));
    }
    if (Array.isArray(msg.schedules)) {
      writes.push(writeDataRecord(DATA_ENDPOINTS.schedules, msg.schedules));
    }
    if (msg.settings && typeof msg.settings === 'object') {
      writes.push(writeDataRecord(DATA_ENDPOINTS.settings, msg.settings));
    }
    event.waitUntil(Promise.allSettled(writes));
    return;
  }

  if (msg.type === 'PRECACHE_ASSETS' && Array.isArray(msg.urls)) {
    event.waitUntil(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const uniqueUrls = Array.from(new Set(msg.urls)).slice(0, 80);
        await Promise.allSettled(
          uniqueUrls.map(async (rawUrl) => {
            try {
              const parsed = new URL(rawUrl, self.location.origin);
              if (parsed.origin !== self.location.origin) return;
              if (
                isViteDevRequest(parsed) ||
                parsed.pathname === '/sw.js' ||
                parsed.pathname.startsWith('/api/') ||
                parsed.pathname.startsWith('/__offline-cache/')
              ) {
                return;
              }
              const existing = await cache.match(parsed.href);
              if (existing) return;
              const resp = await fetch(parsed.href, { credentials: 'same-origin' });
              if (resp && resp.ok) {
                await cache.put(parsed.href, resp);
              }
            } catch {
              // Ignore transient asset prefetch error
            }
          })
        );
      })
    );
  }
});

function isViteDevRequest(url) {
  if (url.origin !== self.location.origin) return false;
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/@id/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return true;
  }
  return (
    url.searchParams.has('v') ||
    url.searchParams.has('t') ||
    url.searchParams.has('import')
  );
}

function isStaticAssetRequest(url) {
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com'
  ) {
    return true;
  }
  if (url.origin !== self.location.origin) return false;
  if (isViteDevRequest(url)) return false;
  if (url.pathname === '/sw.js') return false;
  if (url.pathname.startsWith('/__offline-cache/')) return false;
  if (url.pathname.startsWith('/api/')) return false;

  return (
    url.pathname.startsWith('/assets/') ||
    /\.(js|mjs|css|png|jpg|jpeg|svg|ico|woff|woff2|webmanifest|json)$/i.test(
      url.pathname
    )
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/event-stream')) return;

  const url = new URL(request.url);

  // Never intercept or cache Vite dev modules or source files
  if (isViteDevRequest(url)) return;

  // Serve virtual offline record snapshots straight from DATA_CACHE
  if (url.origin === self.location.origin && url.pathname.startsWith('/__offline-cache/')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
        return new Response(JSON.stringify({ cachedAt: null, data: null }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Never intercept SSE or auth/external Google/Firebase API calls
  if (
    url.pathname === '/api/sync/stream' ||
    url.pathname === '/api/customer-portal/stream'
  ) {
    return;
  }

  // Network-first with cache fallback for HTML navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            void caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(STATIC_CACHE);
          return (
            (await cache.match(request)) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/')) ||
            new Response('Offline - App Shell not cached yet.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        })
    );
    return;
  }

  // Network-first with cache fallback for read-only workshop API endpoints
  if (
    url.origin === self.location.origin &&
    (url.pathname === '/api/jobs' ||
      url.pathname === '/api/inventory' ||
      url.pathname === '/api/customer-portal/lookup')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            void caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(DATA_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: 'Offline and no cached API response available.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Stale-while-revalidate for static assets (JS, CSS, fonts, images, Vite dev modules)
  if (isStaticAssetRequest(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
              void cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
