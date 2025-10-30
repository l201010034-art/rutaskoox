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
        // Esto ahora maneja la polilínea
        if (map.hasLayer(capaRutaCaminar)) {
            map.removeLayer(capaRutaCaminar);
        }
        capaRutaCaminar = null;
    }
}

/**
 * ¡REVERTIDO! Dibuja la línea recta punteada (confiable)
 */
export function dibujarPaso(paso, puntoInicio) {
    limpiarCapasDeRuta();
    
    const inicioCoords = puntoInicio.geometry.coordinates; // [lon, lat]
    const inicioLatLng = [inicioCoords[1], inicioCoords[0]]; // [lat, lon]

    let bounds;
    switch(paso.tipo) {
        case 'caminar':
            const finLatLng = paso.paradero.geometry.coordinates.slice().reverse(); // [lat, lon]
            
            // Dibujar una línea recta punteada (confiable)
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
            
            const pInicio = paso.paraderoInicio.geometry.coordinates.slice().reverse();
            const pFin = paso.paraderoFin.geometry.coordinates.slice().reverse();
            L.marker(pInicio).addTo(marcadores).bindPopup(`Subir en: ${paso.paraderoInicio.properties.nombre}`);
            L.marker(pFin).addTo(marcadores).bindPopup(`Bajar en: ${paso.paraderoFin.properties.nombre}`);
            bounds = capaRutaBus.getBounds();
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

    // Devolvemos los límites para que app.js haga el zoom
    return bounds;
}