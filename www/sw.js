const CACHE_VERSION = 'v5.52'; // 🚀 Subimos la versión para forzar la actualización en los celulares
const CACHE_NAME = `rutas-koox-cache-${CACHE_VERSION}`; 

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
    'https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js',
    
    // Guardamos el escáner en la memoria del celular
    'https://unpkg.com/html5-qrcode' 
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
            return self.clients.claim(); // Toma control inmediato de Safari y Chrome
        })
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    const requestUrl = new URL(event.request.url);

    // =======================================================================
    // 🛡️ INMUNIDAD DIPLOMÁTICA: Dejar pasar el tráfico en vivo (WebSockets)
    // =======================================================================
    if (
        requestUrl.hostname.includes('apibus.rutaskoox.com') || 
        requestUrl.pathname.includes('/socket.io/') ||
        !requestUrl.protocol.startsWith('http') // Ignora extensiones de navegador que causan bugs
    ) {
        return; // Retornamos inmediatamente para que no intente cachearlo
    }

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