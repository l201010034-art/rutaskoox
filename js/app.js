// js/app.js

import { initMap, crearMarcadorUsuario, dibujarPlan, dibujarPaso, marcadores, map } from './mapService.js';
import { getUbicacionUsuario, iniciarWatchLocation, detenerWatchLocation } from './locationService.js';
import { encontrarRutaCompleta, crearMapaRutas, linkParaderosARutas } from './routeFinder.js';

// --- 2. VARIABLES GLOBALES DE ESTADO ---
let todosLosParaderos = [];
let todasLasRutas = [];
let paraderosCollection = null;
let mapRutaParaderos = new Map();
let listaDePlanes = [];
let rutaCompletaPlan = [];
let pasoActual = 0; 
let alertaMostrada = false;
let watchId = null;
let autoCentrar = true;
let puntoInicio = null; 
let paraderoInicioCercano = null;
let paraderoFin = null;
let panelToggle;
let choicesDestino = null;

// --- 3. REFERENCIAS AL DOM ---
const selectDestino = document.getElementById('selectDestino');
const inputInicio = document.getElementById('inputInicio');
// ... (el resto de las referencias)
const instruccionesEl = document.getElementById('instrucciones');
const btnIniciarRuta = document.getElementById('btnIniciarRuta');
const btnLimpiar = document.getElementById('btnLimpiar');
const panelControl = document.getElementById('panel-control');
const panelNavegacion = document.getElementById('panel-navegacion');
const instruccionActualEl = document.getElementById('instruccion-actual');
const btnAnterior = document.getElementById('btnAnterior');
const btnSiguiente = document.getElementById('btnSiguiente');
const btnFinalizar = document.getElementById('btnFinalizar');
panelToggle = document.getElementById('panel-toggle');
    panelToggle.addEventListener('click', togglePanel);
    panelControl.classList.add('oculto');


// --- 4. ARRANQUE DE LA APP ---
document.addEventListener('DOMContentLoaded', async () => {
    initMap(); 
    
    try {
        const [resParaderos, resRutas] = await Promise.all([
            fetch('data/paraderos.geojson'),
            fetch('data/rutas.geojson')
        ]);
        const dataParaderos = await resParaderos.json();
        const dataRutas = await resRutas.json();
        
        todosLosParaderos = dataParaderos.features;
        todosLosParaderos.forEach((feature, index) => {
            const props = feature.properties;
            feature.properties.nombre = props.name || props.Name || props.Paradero || "Paradero sin nombre";
            feature.properties.originalIndex = index;
        });

        todosLosParaderos.sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre));

        todasLasRutas = dataRutas.features;
        todasLasRutas.forEach(feature => {
            const props = feature.properties;
            const nombreCompleto = props.name || props.Name || props.Ruta || "Ruta desconocida";
            feature.properties.id = nombreCompleto.split(' ').slice(0, 2).join(' ');
            feature.properties.nombre = nombreCompleto.split(' ').slice(2).join(' ');
        });

        console.log("Enlazando paraderos a rutas...");
        linkParaderosARutas(todosLosParaderos, todasLasRutas);
        console.log("Creando mapa de búsqueda de rutas...");
        mapRutaParaderos = crearMapaRutas(todasLasRutas, todosLosParaderos);
        
        console.log("¡Enlace completado!");
        paraderosCollection = turf.featureCollection(todosLosParaderos);
        
        // ¡Esta es la función correcta!
        initChoicesSelect();
        
        getUbicacionUsuario(handleInitialLocation, handleLocationError);

    } catch (error) {
        console.error("Error cargando o procesando los datos GeoJSON:", error);
    }
});

// --- 5. LÓGICA DE LA APP (EVENT HANDLERS) ---

function handleInitialLocation(pos) {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    puntoInicio = turf.point([lon, lat]);
    paraderoInicioCercano = encontrarParaderoMasCercano(puntoInicio);
    
    inputInicio.value = `Cerca de "${paraderoInicioCercano.properties.nombre}"`;
    inputInicio.style.fontStyle = 'normal';
    map.setView([lat, lon], 16);
    
    const marker = crearMarcadorUsuario([lat, lon]);
    marker.bindPopup("<b>Estás aquí</b>").openPopup();
}

function handleLocationError(err) {
    console.warn(`ERROR(${err.code}): ${err.message}`);
    inputInicio.value = "No se pudo obtener ubicación";
}

// ¡Esta es la función que debe estar (en lugar de poblarSelectDestinos)!
function initChoicesSelect() {
    const choicesData = todosLosParaderos.map(paradero => ({
        value: paradero.properties.originalIndex,
        label: paradero.properties.nombre,
    }));

    choicesDestino = new Choices(selectDestino, {
        choices: choicesData,
        itemSelectText: 'Seleccionar',
        searchPlaceholderValue: 'Escribe para filtrar...',
        shouldSort: false,
        removeItemButton: true,
    });

    selectDestino.addEventListener('change', (event) => {
        if (!puntoInicio) {
            alert("Espera a que se detecte tu ubicación.");
            choicesDestino.clearInput();
            return;
        }
        
        const destinoIndex = event.detail.value;
        if (destinoIndex) {
            paraderoFin = todosLosParaderos.find(p => p.properties.originalIndex == destinoIndex);
            
            listaDePlanes = encontrarRutaCompleta(paraderoInicioCercano, paraderoFin, todasLasRutas, mapRutaParaderos);
            mostrarPlanes(listaDePlanes);
        }
    });
}

// --- (Copiado del final del archivo anterior para completitud) ---

btnLimpiar.addEventListener('click', limpiarMapa);
btnIniciarRuta.addEventListener('click', iniciarRutaProgresiva);
btnSiguiente.addEventListener('click', siguientePaso);
btnAnterior.addEventListener('click', pasoAnterior);
btnFinalizar.addEventListener('click', finalizarRuta);


function limpiarMapa() {
    dibujarPlan([]);
    marcadores.clearLayers();
    instruccionesEl.innerHTML = "Selecciona tu destino para ver la ruta.";
    paraderoFin = null;
    rutaCompletaPlan = [];
    listaDePlanes = [];
    pasoActual = 0;
    
    if (choicesDestino) {
        choicesDestino.clearStore();
        choicesDestino.setChoices(todosLosParaderos.map(p => ({
            value: p.properties.originalIndex,
            label: p.properties.nombre
        })), 'value', 'label', true);
        choicesDestino.clearInput();
        choicesDestino.removeActiveItems();
    }

    btnIniciarRuta.style.display = 'none';
    btnLimpiar.style.display = 'none';
    
    panelNavegacion.style.display = 'none';
    panelControl.classList.remove('oculto');
    
    detenerWatchLocation(watchId);
    
    if (puntoInicio) {
        const coords = puntoInicio.geometry.coordinates;
        map.setView([coords[1], coords[0]], 16);
        crearMarcadorUsuario([coords[1], coords[0]]).bindPopup("<b>Estás aquí</b>").openPopup();
    }
}
function togglePanel() {
    panelControl.classList.toggle('oculto');
}

function mostrarPlanes(planes) {
    instruccionesEl.innerHTML = '';
    marcadores.clearLayers();
    
    const inicioCoords = puntoInicio.geometry.coordinates;
    L.marker([inicioCoords[1], inicioCoords[0]]).addTo(marcadores).bindPopup("<b>Estás aquí</b>");
    const finCoords = paraderoFin.geometry.coordinates;
    L.marker([finCoords[1], finCoords[0]]).addTo(marcadores).bindPopup(`<b>Destino:</b><br>${paraderoFin.properties.nombre}`);

    if (!planes || planes.length === 0) {
        instruccionesEl.innerHTML = `
            <p><strong>Ruta no encontrada</strong></p>
            <p>No se pudo encontrar una ruta con menos de 4 buses (límite de 4 transbordos).</p>
        `;
        btnIniciarRuta.style.display = 'none';
        btnLimpiar.style.display = 'block';
        return;
    }

    let html = `<p><strong>Se encontraron ${planes.length} opciones:</strong></p>`;
    
    planes.forEach((plan, index) => {
        html += `<div class="opcion-ruta">`;
        const buses = plan.filter(p => p.tipo === 'bus').map(p => p.ruta.properties.id);
        html += `<h4>Opción ${index + 1} <span style="font-weight:normal; font-size: 0.8em;">(${buses.join(' &rarr; ')})</span></h4>`;
        
        html += "<ol>";
        plan.forEach(paso => {
            if (paso.tipo === 'caminar' || paso.tipo === 'bus') {
                html += `<li>${paso.texto}</li>`;
            }
        });
        html += "</ol>";
        
        window.seleccionarPlan = seleccionarPlan;
        html += `<button class="btn-seleccionar" onclick="seleccionarPlan(${index})">Seleccionar esta ruta</button>`;
        html += `</div>`;
    });

    instruccionesEl.innerHTML = html;
    dibujarPlan(planes);
    btnLimpiar.style.display = 'block';
    btnIniciarRuta.style.display = 'none'; 
}

window.seleccionarPlan = (indice) => {
    rutaCompletaPlan = listaDePlanes[indice]; 
    
    instruccionesEl.innerHTML = `<p><strong>Ruta seleccionada. ¡Listo para navegar!</strong></p>`;
    const buses = rutaCompletaPlan.filter(p => p.tipo === 'bus').map(p => p.ruta.properties.id);
    instruccionesEl.innerHTML += `<p>${buses.join(' &rarr; ')}</p>`;
    
    btnIniciarRuta.style.display = 'block';
    dibujarPlan([rutaCompletaPlan]);
}

function encontrarParaderoMasCercano(punto) {
    return turf.nearestPoint(punto, paraderosCollection);
}

// --- 7. FUNCIONES DE NAVEGACIÓN (FASE 3.2) ---

function iniciarRutaProgresiva() {
    if (!rutaCompletaPlan || rutaCompletaPlan.length === 0) return;
    console.log("Iniciando modo de navegación...");
    panelControl.classList.add('oculto'); 
    panelNavegacion.style.display = 'flex';
    pasoActual = 0;
    alertaMostrada = false;
    crearMarcadorUsuario(puntoInicio.geometry.coordinates.slice().reverse());
    watchId = iniciarWatchLocation(handleLocationUpdate, handleLocationError);
    map.on('dragstart', () => { autoCentrar = false; });
    mostrarPaso(pasoActual);
}

function finalizarRuta() {
    console.log("Finalizando navegación.");
    panelNavegacion.style.display = 'none'; 
    panelControl.classList.remove('oculto');
    detenerWatchLocation(watchId);
    map.off('dragstart');
    limpiarMapa();
}

function handleLocationUpdate(pos) {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const latlng = [lat, lon];
    
    puntoInicio = turf.point([lon, lat]);
    crearMarcadorUsuario(latlng);

    if (autoCentrar) {
        map.panTo(latlng);
    }
    checkProximidad(); 
}

function checkProximidad() {
    if (!rutaCompletaPlan || rutaCompletaPlan.length === 0 || pasoActual >= rutaCompletaPlan.length) return;
    const paso = rutaCompletaPlan[pasoActual];
    let distanciaMetros = Infinity;

    if (paso.tipo === 'caminar') {
        distanciaMetros = turf.distance(puntoInicio, paso.paradero, { units: 'meters' });
        if (distanciaMetros < 25) { 
            console.log("Llegaste al paradero, avanzando al siguiente paso...");
            siguientePaso();
        }
    } else if (paso.tipo === 'bus') {
        distanciaMetros = turf.distance(puntoInicio, paso.paraderoFin, { units: 'meters' });
        
        if (distanciaMetros < 300 && !alertaMostrada) {
            console.log("¡Alerta! Bajas pronto.");
            alertaMostrada = true;
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            instruccionActualEl.textContent = `¡BAJA PRONTO! (${paso.paraderoFin.properties.nombre})`;
        }
        
        if (distanciaMetros < 40) {
            console.log("Llegaste al paradero de destino, avanzando...");
            siguientePaso();
        }
    }
}

function watchError(err) {
    console.warn(`ERROR(${err.code}): ${err.message}`);
}

function siguientePaso() {
    if (pasoActual < rutaCompletaPlan.length - 1) {
        pasoActual++;
        autoCentrar = true; 
        alertaMostrada = false;
        mostrarPaso(pasoActual);
    }
}

function pasoAnterior() {
    if (pasoActual > 0) {
        pasoActual--;
        autoCentrar = true; 
        alertaMostrada = false;
        mostrarPaso(pasoActual);
    }
}

function mostrarPaso(indice) {
    const paso = rutaCompletaPlan[indice];
    instruccionActualEl.textContent = paso.texto;
    btnAnterior.disabled = (indice === 0);
    const esUltimoPaso = (indice === rutaCompletaPlan.length - 1);
    btnSiguiente.disabled = esUltimoPaso;
    btnFinalizar.style.display = esUltimoPaso ? 'block' : 'none';
    btnSiguiente.style.display = esUltimoPaso ? 'none' : 'block';
    dibujarPaso(paso, puntoInicio);
    if (autoCentrar) {
        const bounds = L.latLngBounds([puntoInicio.geometry.coordinates.slice().reverse()]);
        if (paso.tipo === 'caminar') {
            bounds.extend(paso.paradero.geometry.coordinates.slice().reverse());
        } else if (paso.tipo === 'bus') {
            bounds.extend(L.geoJSON(paso.ruta).getBounds());
        } else if (paso.tipo === 'transbordo' || paso.tipo === 'fin') {
            bounds.extend(paso.paradero.geometry.coordinates.slice().reverse());
        }
        if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.2));
        }
    }
}


// --- 8. REGISTRO DEL SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Service Worker: Registrado exitosamente', reg.scope);
      })
      .catch((err) => {
        console.log('Service Worker: Falló el registro', err);
      });
  });
}