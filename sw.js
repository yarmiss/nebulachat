/**
 * NebulaChat Service Worker
 * Offline support and caching
 */

const CACHE_NAME = 'nebulachat-v1';
const RUNTIME_CACHE = 'nebulachat-runtime-v1';

// Files to cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/icons.svg',
  '/manifest.webmanifest',
  '/data/mock.json',
  '/js/core/router.js',
  '/js/core/store.js',
  '/js/core/websocket.js',
  '/js/ui/components.js',
  '/js/ui/modals.js',
  '/js/ui/render.js',
  '/js/state/actions.js',
  '/js/utils/markdown.js',
  '/js/utils/security.js',
  '/js/utils/helpers.js',
  '/js/utils/virtualization.js'
];

/**
 * Install event - precache resources
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch event - network first, fallback to cache
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip WebSocket and other non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Cache-first strategy for static assets
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request).then((response) => {
            // Cache the fetched response
            if (response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          });
        })
    );
    return;
  }

  // Network-first strategy for dynamic content
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(request);
      })
  );
});

/**
 * Check if URL is a static asset
 * @param {string} pathname - URL pathname
 * @returns {boolean}
 */
function isStaticAsset(pathname) {
  const staticExtensions = [
    '.js', '.css', '.svg', '.png', '.jpg', '.jpeg',
    '.gif', '.webp', '.woff', '.woff2', '.ttf', '.json'
  ];

  return staticExtensions.some(ext => pathname.endsWith(ext));
}

/**
 * Message event - handle messages from clients
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_CLEAR') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});

/**
 * Push event - handle push notifications
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body || 'Новое сообщение в NebulaChat',
    icon: '/manifest-icon-192.png',
    badge: '/manifest-icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'nebulachat-notification',
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'NebulaChat', options)
  );
});

/**
 * Notification click event
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }

        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

console.log('[SW] Service Worker loaded');

