// js/mapService.js

// Almacenaremos las capas aquí
let capaRutaBus = null;
let capaRutaCaminar = null; // ¡NUEVO!
let userMarker = null;
export let marcadores = null;
export let map = null;

/**
 * Inicializa el mapa de Leaflet y las capas.
 */
export function initMap() {
    map = L.map('map', {
        zoomControl: false // Desactivamos el zoom +/- por defecto
    }).setView([19.830, -90.528], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Añadimos el control de zoom en otra esquina
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    marcadores = L.layerGroup().addTo(map);
    return map;
}

/**
 * Crea o actualiza el marcador azul del usuario.
 */
export function crearMarcadorUsuario(latlng) {
    if (userMarker) {
        userMarker.setLatLng(latlng);
    } else {
        userMarker = L.marker(latlng, {
            icon: L.divIcon({
                className: 'user-marker',
                html: '<div style="background-color: #007bff; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>',
                iconSize: [20, 20]
            })
        }).addTo(map);
    }
    return userMarker;
}

/**
 * Dibuja uno o varios planes de ruta en el mapa (para la vista de opciones).
 */
export function dibujarPlan(planes) {
    limpiarCapasDeRuta();
    
    const capasDeRuta = [];
    planes.forEach(plan => {
        plan.forEach(paso => {
            if (paso.tipo === 'bus') {
                capasDeRuta.push(paso.ruta);
            }
        });
    });
    
    if (capasDeRuta.length === 0) return;

    const rutasAGraficar = turf.featureCollection(capasDeRuta);
    
    capaRutaBus = L.geoJSON(rutasAGraficar, {
        style: (feature) => {
            let color = "#" + Math.floor(Math.random()*16777215).toString(16);
            if (planes.length === 1) {
                const plan = planes[0];
                if (plan[1] && feature.properties.id === plan[1].ruta.properties.id) color = "#FF0000";
                if (plan[3] && feature.properties.id === plan[3].ruta.properties.id) color = "#0052FF";
                if (plan[5] && feature.properties.id === plan[5].ruta.properties.id) color = "#00A86B";
                if (plan[7] && feature.properties.id === plan[7].ruta.properties.id) color = "#FF8C00";
            }
            return { color, weight: 5, opacity: 0.7 };
        }
    }).addTo(map);
    
    if (rutasAGraficar.features.length > 0) {
        map.fitBounds(capaRutaBus.getBounds().pad(0.1));
    }
}

/**
 * ¡NUEVO! Limpia todas las capas de ruta y marcadores.
 */
export function limpiarCapasDeRuta() {
    marcadores.clearLayers();
    if (capaRutaBus) {
        map.removeLayer(capaRutaBus);
        capaRutaBus = null;
    }
    if (capaRutaCaminar) {
        map.removeLayer(capaRutaCaminar);
        capaRutaCaminar = null;
    }
}

/**
 * ¡ACTUALIZADO! Dibuja un ÚNICO paso de la navegación.
 * Ahora usa LRM para caminar.
 * @param {object} paso - El objeto del paso.
 * @param {object} puntoInicio - El punto de inicio del usuario (Feature de Turf).
 */
export function dibujarPaso(paso, puntoInicio) {
    limpiarCapasDeRuta();
    
    const inicioCoords = puntoInicio.geometry.coordinates; // [lon, lat]
    const inicioLatLng = [inicioCoords[1], inicioCoords[0]]; // [lat, lon]

    switch(paso.tipo) {
        case 'caminar':
            const finLatLng = paso.paradero.geometry.coordinates.slice().reverse(); // [lat, lon]
            
            // ¡NUEVO! Usar Leaflet Routing Machine
            capaRutaCaminar = L.Routing.control({
                waypoints: [
                    L.latLng(inicioLatLng),
                    L.latLng(finLatLng)
                ],
                routeWhileDragging: false,
                addWaypoints: false, // No permitir que el usuario añada más puntos
                draggableWaypoints: false,
                createMarker: function() { return null; }, // No crear marcadores (ya tenemos el azul)
                lineOptions: {
                    styles: [{color: 'blue', opacity: 0.7, weight: 5, dashArray: '10, 10'}]
                }
            }).addTo(map);
            
            // LRM es asíncrono, ajustamos el zoom cuando la ruta esté lista
            capaRutaCaminar.on('routesfound', function(e) {
                map.fitBounds(e.routes[0].bounds.pad(0.2));
            });
            
            L.marker(finLatLng).addTo(marcadores).bindPopup(`Paradero: ${paso.paradero.properties.nombre}`);
            break;
            
        case 'bus':
            capaRutaBus = L.geoJSON(paso.ruta, {
                style: { color: "#FF0000", weight: 5, opacity: 0.8 }
            }).addTo(map);
            
            const pInicio = paso.paraderoInicio.geometry.coordinates.slice().reverse();
            const pFin = paso.paraderoFin.geometry.coordinates.slice().reverse();
            L.marker(pInicio).addTo(marcadores).bindPopup(`Subir en: ${paso.paraderoInicio.properties.nombre}`);
            L.marker(pFin).addTo(marcadores).bindPopup(`Bajar en: ${paso.paraderoFin.properties.nombre}`);
            
            map.fitBounds(capaRutaBus.getBounds().pad(0.2));
            break;
        
        case 'transbordo':
            const pTransbordo = paso.paradero.geometry.coordinates.slice().reverse();
            L.marker(pTransbordo).addTo(marcadores)
                .bindPopup(`Transbordo: ${paso.paradero.properties.nombre}`)
                .openPopup();
            map.setView(pTransbordo, 17);
            break;

        case 'fin':
            const pDestino = paso.paradero.geometry.coordinates.slice().reverse();
            L.marker(pDestino).addTo(marcadores)
                .bindPopup("¡Destino!")
                .openPopup();
            map.setView(pDestino, 17);
            break;
    }
}