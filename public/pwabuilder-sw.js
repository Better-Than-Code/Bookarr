const CACHE_NAME = 'bookrr-cache-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './icon-monochrome.svg',
  './icon-192.png',
  './icon-512.png',
  './models/onnx-community/Kokoro-82M-v1.0-ONNX/config.json',
  './models/onnx-community/Kokoro-82M-v1.0-ONNX/tokenizer.json',
  './models/onnx-community/Kokoro-82M-v1.0-ONNX/tokenizer_config.json',
  './models/onnx-community/Kokoro-82M-v1.0-ONNX/preprocessor_config.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Iterative cache loading to ensure service worker installs successfully
      // even if individual static files are temporarily missing or fail to load.
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
          console.log(`[Bookrr SW] Cached asset during installation: ${asset}`);
        } catch (err) {
          console.warn(`[Bookrr SW] Skip non-critical caching for asset: ${asset} - Error:`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass non-GET or cross-origin requests directly to browser network
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Avoid intercepting hot-reloading, local dev-server requests, or large model files being handled by explicit TTS caching
  if (
    event.request.url.includes('/@vite/') || 
    event.request.url.includes('/node_modules/') ||
    event.request.url.includes('/models/') ||
    event.request.url.endsWith('.onnx') ||
    event.request.url.endsWith('.bin')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Trigger background fetch to keep cache fresh (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(async () => {
        // Offline fallback to main app interface
        const cache = await caches.open(CACHE_NAME);
        const cachedFallback = await cache.match('./index.html');
        return cachedFallback || new Response('Offline mode');
      });
    })
  );
});
