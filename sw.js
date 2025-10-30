// Nombre de nuestro caché
const CACHE_NAME = 'rutas-koox-cache-v4';
const DATA_CACHE_NAME = 'rutas-koox-data-v1';
const MAP_CACHE_NAME = 'rutas-koox-map-tiles-v1';

// Archivos principales de la app (el "App Shell")
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/js/app.js',
  '/js/locationService.js',
  '/js/mapService.js',
  '/js/routeFinder.js',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/@turf/turf@6/turf.min.js',
  'https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css',
  'https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js'
];

// 1. Instalación: Guardar el "App Shell" en el caché
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado');
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Guardando App Shell en caché');
      return cache.addAll(APP_SHELL_FILES);
    })
  );
});

// 2. Activación: Limpiar cachés viejos
self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Activado');
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME && key !== DATA_CACHE_NAME && key !== MAP_CACHE_NAME) {
          console.log('[Service Worker] Borrando caché antiguo', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 3. Fetch: Interceptar todas las peticiones
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Estrategia para las Rutas y Paraderos (data/): Network First
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(e.request).then((response) => {
          cache.put(e.request, response.clone());
          return response;
        }).catch(() => {
          // Si falla la red, busca en el caché
          return caches.match(e.request);
        });
      })
    );
  // Estrategia para los "azulejos" del Mapa: Cache First
  } else if (url.hostname === 's.tile.openstreetmap.org' || url.hostname === 'a.tile.openstreetmap.org' || url.hostname === 'b.tile.openstreetmap.org' || url.hostname === 'c.tile.openstreetmap.org') {
    e.respondWith(
      caches.open(MAP_CACHE_NAME).then((cache) => {
        return cache.match(e.request).then((response) => {
          if (response) {
            return response; // Lo encontró en caché
          }
          // Si no, búscalo en la red y guárdalo
          return fetch(e.request).then((networkResponse) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          }).catch(() => {
            console.log("No se pudo cargar el tile del mapa.");
          });
        });
      })
    );
  // Estrategia para el App Shell: Cache First
  } else if (APP_SHELL_FILES.includes(e.request.url) || APP_SHELL_FILES.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((response) => {
        return response || fetch(e.request);
      })
    );
  }
});