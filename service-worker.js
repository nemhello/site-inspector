// Site Inspector Service Worker
// Version 1.0

const CACHE_NAME = 'site-inspector-v1';
const urlsToCache = [
  '/site-inspector/',
  '/site-inspector/index.html',
  '/site-inspector/app.js',
  '/site-inspector/styles.css',
  '/site-inspector/manifest.json',
  '/site-inspector/icon-192.png',
  '/site-inspector/icon-512.png'
];

// Install - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Background sync for photos (when offline uploads need to be synced)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-photos') {
    event.waitUntil(syncPhotos());
  }
});

async function syncPhotos() {
  // This will be triggered when connection is restored
  console.log('Background sync: syncing photos...');
  // The app will handle the actual sync logic
}

// Push notifications (for future features)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/site-inspector/icon-192.png',
    badge: '/site-inspector/icon-192.png'
  };

  event.waitUntil(
    self.registration.showNotification('Site Inspector', options)
  );
});
