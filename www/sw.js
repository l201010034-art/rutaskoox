// www/sw.js...

const CACHE_VERSION = 'v5.22'; 
const CACHE_NAME = `rutas-1oox-cache-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
    './',
    'index.html',
    'style.min.css',      
    'manifest.json',
    'images/favicon.png',
    'images/icon-512.png',
    'js/app.min.js',      
    'data/paraderos.geojson',
    'data/rutas.geojson',

    // Librerías externas
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/@turf/turf@6/turf.min.js',
    'https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css',
    'https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Abriendo caché y guardando archivos...');
                return cache.addAll(APP_SHELL_URLS);
            })
            .catch(err => console.error("Error al cachear archivos:", err))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Borrando caché antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker activado y reclamando clientes');
            return self.clients.claim(); // Toma control inmediato de Safari
        })
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const requestUrl = new URL(event.request.url);

    // Estrategia Network First para datos (asegura datos frescos)
    if (requestUrl.pathname.includes('/data/')) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                })
                .catch(() => caches.match(event.request)) // Fallback a caché si no hay internet
        );
        return;
    }

    // Estrategia Stale-While-Revalidate para todo lo demás (Velocidad + Actualización)
    // Esto es mejor para Safari: Muestra lo rápido, pero actualiza en segundo plano
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            });
            return cachedResponse || fetchPromise;
        })
    );
});