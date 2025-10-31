// js/sw.js

/* =================================================================
   1. DEFINICIONES DE CACHÉ
   ================================================================= */

// !! IMPORTANTE !!
// ¡Sube la versión cada vez que hagas un cambio!
// Cambiémoslo de 'v1.15' a 'v1.16'
const CACHE_VERSION = 'v1.18'; // <-- ¡INCREMENTADO!
const CACHE_NAME = `rutas-koox-cache-${CACHE_VERSION}`;

// ⬇️⬇️⬇️ INICIO DE LA SECCIÓN CORREGIDA ⬇️⬇️⬇️

// Estos son los archivos MÍNIMOS para que la app "funcione" sin conexión.
const APP_SHELL_URLS = [
    '/',
    '/index.html',
    // '/style.css', <-- Ya no se usa
    '/style.min.css', // <-- Se añade el minificado
    '/manifest.json',
    '/images/favicon.png',
    '/images/icon-512.png',
    
    // '/js/app.js',  <-- Borramos los individuales
    // '/js/mapService.js',
    // '/js/routeFinder.js',
    // '/js/locationService.js',
    // '/js/navigationService.js', // (Este también estaba en tu repo)
    
    '/js/app.min.js', // <-- Se añade el minificado
    
    // Los datos para el cálculo offline (esto estaba perfecto)
    '/data/paraderos.geojson',
    '/data/rutas.geojson',

    // Librerías de terceros que también queremos offline
// ... (el resto del archivo sigue igual)
    // =========================================================
    // ⬆️⬆️⬆️ FIN DE LA SECCIÓN CORREGIDA ⬆️⬆️⬆️
    // =========================================================

    // Librerías de terceros que también queremos offline
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/@turf/turf@6/turf.min.js',
    'https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css',
    'https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js'
];


/* =================================================================
   2. CICLO DE VIDA DEL SERVICE WORKER
   ================================================================= */

// Evento 'install': Se dispara cuando se detecta un NUEVO sw.js
self.addEventListener('install', (event) => {
    console.log(`[SW] Instalando versión: ${CACHE_VERSION}`);
    
    // Esperamos a que el caché del App Shell se complete
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Guardando App Shell en caché');
                return cache.addAll(APP_SHELL_URLS);
            })
            .then(() => {
                // ¡Forzamos al nuevo Service Worker a activarse de inmediato!
                console.log('[SW] Instalación completa. Saltando espera (skipWaiting).');
                self.skipWaiting();
            })
    );
});

// Evento 'activate': Se dispara DESPUÉS de 'install'.
self.addEventListener('activate', (event) => {
    console.log(`[SW] Activando versión: ${CACHE_VERSION}`);
    
    // Esperamos a que la limpieza de caché se complete
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Si el nombre del caché NO es el actual, lo borramos.
                    if (cacheName !== CACHE_NAME) {
                        console.log(`[SW] Borrando caché antiguo: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // ¡Tomamos control de todas las pestañas/clientes abiertos de inmediato!
            console.log('[SW] Activado y controlando clientes.');
            return self.clients.claim();
        })
    );
});


/* =================================================================
   3. ESTRATEGIAS DE CACHÉ (EVENTO 'FETCH')
   ================================================================= */

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // ESTRATEGIA 1: "Network First" (Red primero) para nuestros DATOS
    // (Esto sigue siendo bueno, porque si el usuario TIENE internet,
    // buscará actualizaciones de los geojson, pero si no tiene,
    // ahora SÍ encontrará la versión del caché que instalamos.)
    if (requestUrl.pathname.startsWith('/data/')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                // 1. Intentamos ir a la red
                return fetch(event.request).then((networkResponse) => {
                    // Si la red funciona, guardamos la respuesta fresca en caché
                    console.log(`[SW] Cacheando dato (Network First): ${event.request.url}`);
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                }).catch(() => {
                    // 2. Si la red falla (offline), buscamos en el caché
                    console.log(`[SW] Red falló, sirviendo desde caché: ${event.request.url}`);
                    return cache.match(event.request);
                });
            })
        );
        return;
    }

    // ESTRATEGIA 2: "Cache First" (Caché primero) para todo lo demás
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 1. Si está en caché, lo devolvemos
                if (response) {
                    return response;
                }
                
                // 2. Si no está en caché, vamos a la red
                return fetch(event.request).then((networkResponse) => {
                    // 3. Y guardamos la respuesta en caché
                    return caches.open(CACHE_NAME).then((cache) => {
                        console.log(`[SW] Cacheando nuevo recurso: ${event.request.url}`);
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
    );
});