// js/mapService.js

let capaRutaBus = null;
let capaRutaCaminar = null;
let userMarker = null;
export let marcadores = null;
export let map = null;

export function initMap() {
    map = L.map('map', {
        zoomControl: false
    }).setView([19.830, -90.528], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    marcadores = L.layerGroup().addTo(map);
    return map;
}

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

export function limpiarCapasDeRuta() {
    marcadores.clearLayers();
    if (capaRutaBus) {
        map.removeLayer(capaRutaBus);
        capaRutaBus = null;
    }
    if (capaRutaCaminar) {
        if (map.hasLayer(capaRutaCaminar)) {
            map.removeLayer(capaRutaCaminar);
        }
        capaRutaCaminar = null;
    }
}

export function dibujarPaso(paso, puntoInicio) {
    limpiarCapasDeRuta();
    
    const inicioCoords = puntoInicio.geometry.coordinates; // [lon, lat]
    const inicioLatLng = [inicioCoords[1], inicioCoords[0]]; // [lat, lon]

    let bounds;
    switch(paso.tipo) {
        case 'caminar':
            const finCoordsCaminar = paso.paradero.geometry.coordinates;
            const finLatLng = [finCoordsCaminar[1], finCoordsCaminar[0]]; // [lat, lon]
            
            capaRutaCaminar = L.polyline([inicioLatLng, finLatLng], {
                color: 'blue',
                weight: 5,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(map);
            
            L.marker(finLatLng).addTo(marcadores).bindPopup(`Paradero: ${paso.paradero.properties.nombre}`);
            bounds = L.latLngBounds(inicioLatLng, finLatLng);
            break;
            
        case 'bus':
            capaRutaBus = L.geoJSON(paso.ruta, {
                style: { color: "#FF0000", weight: 5, opacity: 0.8 }
            }).addTo(map);
            
            const pInicioCoords = paso.paraderoInicio.geometry.coordinates;
            const pFinCoords = paso.paraderoFin.geometry.coordinates;
            const pInicio = [pInicioCoords[1], pInicioCoords[0]];
            const pFin = [pFinCoords[1], pFinCoords[0]];

            L.marker(pInicio).addTo(marcadores).bindPopup(`Subir en: ${paso.paraderoInicio.properties.nombre}`);
            L.marker(pFin).addTo(marcadores).bindPopup(`Bajar en: ${paso.paraderoFin.properties.nombre}`);
            bounds = capaRutaBus.getBounds();
            break;
        
        case 'transbordo':
            const pTransbordoCoords = paso.paradero.geometry.coordinates;
            const pTransbordo = [pTransbordoCoords[1], pTransbordoCoords[0]];

            L.marker(pTransbordo).addTo(marcadores)
                .bindPopup(`Transbordo: ${paso.paradero.properties.nombre}`)
                .openPopup();
            map.setView(pTransbordo, 17);
            break;

        case 'fin':
            const pDestinoCoords = paso.paradero.geometry.coordinates;
            const pDestino = [pDestinoCoords[1], pDestinoCoords[0]];

            L.marker(pDestino).addTo(marcadores)
                .bindPopup("¡Destino!")
                .openPopup();
            map.setView(pDestino, 17);
            break;
    }
    return bounds;
}

/**
 * Dibuja una SOLA ruta (para el modo Explorar) y todos sus paraderos.
 * @param {object} ruta - El feature GeoJSON de la ruta (LineString).
 * @param {Array} paraderos - Un array de features GeoJSON de paraderos (Points).
 */
export function dibujarRutaExplorar(ruta, paraderos) {
    limpiarCapasDeRuta();
    if (!ruta) return;

    // 1. Dibujar la línea de la ruta
    capaRutaBus = L.geoJSON(ruta, {
        style: { color: "#FF0000", weight: 6, opacity: 0.8 }
    }).addTo(map);

    // 2. Dibujar los marcadores de los paraderos
    const paraderosFeatures = paraderos.map(p => {
        const coords = p.geometry.coordinates;
        const latLng = [coords[1], coords[0]]; // Corregido para [lat, lon]
        return L.marker(latLng, {
            icon: L.divIcon({
                className: 'paradero-marker',
                html: '<div style="background-color: #fff; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #555;"></div>',
                iconSize: [14, 14]
            })
        }).bindPopup(p.properties.nombre || p.properties.Name); // Aseguramos compatibilidad
    });
    
    // Añadirlos a la capa de marcadores
    paraderosFeatures.forEach(marker => marker.addTo(marcadores));

    // 3. Hacer zoom para que quepa todo
    const group = L.featureGroup([capaRutaBus, ...paraderosFeatures]);
    if (group.getBounds().isValid()) {
        map.fitBounds(group.getBounds().pad(0.1));
    }
}