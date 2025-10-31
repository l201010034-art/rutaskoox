// js/app.js

// 1. IMPORTACIÓN CORREGIDA
import { initMap, crearMarcadorUsuario, dibujarPlan, dibujarPaso, marcadores, map, dibujarRutaExplorar, limpiarCapasDeRuta } from './mapService.js';
import { getUbicacionUsuario, iniciarWatchLocation, detenerWatchLocation } from './locationService.js';
import { encontrarRutaCompleta, crearMapaRutas, linkParaderosARutas } from './routeFinder.js';
import { startNavigation, stopNavigation, updatePosition } from './navigationService.js';


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
let choicesDestino = null;
let distanciaTotalRuta = 0;
let distanciaRestanteEl, tiempoEsperaEl, tiempoViajeEl;
let choicesRuta = null;

// --- 3. REFERENCIAS AL DOM (Solo declaradas) ---
let selectDestino, inputInicio, instruccionesEl, btnIniciarRuta, btnLimpiar;
let panelControl, panelNavegacion, instruccionActualEl, btnAnterior, btnSiguiente, btnFinalizar, panelToggle;
let btnModoViaje, btnModoExplorar, panelViaje, panelExplorar;
let selectRuta, instruccionesExplorarEl, btnLimpiarExplorar;
let btnInfo, infoModal, btnCloseModal;

// --- 4. ARRANQUE DE LA APP ---
document.addEventListener('DOMContentLoaded', async () => {
    
    // Asignamos todas las referencias al DOM aquí
    selectDestino = document.getElementById('selectDestino');
    inputInicio = document.getElementById('inputInicio');
    instruccionesEl = document.getElementById('instrucciones');
    btnIniciarRuta = document.getElementById('btnIniciarRuta');
    btnLimpiar = document.getElementById('btnLimpiar');
    panelControl = document.getElementById('panel-control');
    panelNavegacion = document.getElementById('panel-navegacion');
    instruccionActualEl = document.getElementById('instruccion-actual');
    btnAnterior = document.getElementById('btnAnterior');
    btnSiguiente = document.getElementById('btnSiguiente');
    btnFinalizar = document.getElementById('btnFinalizar');
    panelToggle = document.getElementById('panel-toggle');
    distanciaRestanteEl = document.getElementById('distancia-restante');
    tiempoEsperaEl = document.getElementById('tiempo-espera');
    btnModoViaje = document.getElementById('btnModoViaje');
    btnModoExplorar = document.getElementById('btnModoExplorar');
    panelViaje = document.getElementById('panel-viaje');
    panelExplorar = document.getElementById('panel-explorar');
    selectRuta = document.getElementById('selectRuta');
    instruccionesExplorarEl = document.getElementById('instrucciones-explorar');
    btnLimpiarExplorar = document.getElementById('btnLimpiarExplorar');
    btnInfo = document.getElementById('btnInfo');
    infoModal = document.getElementById('info-modal');
    btnCloseModal = document.getElementById('btnCloseModal');
    tiempoViajeEl = document.getElementById('tiempo-viaje');
    
    // Conectamos TODOS los eventos principales aquí
    panelToggle.addEventListener('click', togglePanel);
    btnLimpiar.addEventListener('click', limpiarMapa);
    btnIniciarRuta.addEventListener('click', iniciarRutaProgresiva);
    btnSiguiente.addEventListener('click', siguientePaso);
    btnAnterior.addEventListener('click', pasoAnterior);
    btnFinalizar.addEventListener('click', finalizarRuta);
    btnModoViaje.addEventListener('click', () => cambiarModo('viaje'));
    btnModoExplorar.addEventListener('click', () => cambiarModo('explorar'));
    btnLimpiarExplorar.addEventListener('click', limpiarMapa);
    btnInfo.addEventListener('click', () => infoModal.classList.remove('oculto'));
    btnCloseModal.addEventListener('click', () => infoModal.classList.add('oculto'));
    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) {
            infoModal.classList.add('oculto');
        }
    });
    
    panelControl.classList.add('oculto'); 
    panelNavegacion.classList.add('oculto');
    
    initMap(); 
    
    try {
        const [resParaderos, resRutas] = await Promise.all([
            fetch('data/paraderos.geojson'),
            fetch('data/rutas.geojson')
        ]);
        const dataParaderos = await resParaderos.json();
        const dataRutas = await resRutas.json();
        
        todosLosParaderos = dataParaderos.features.map((feature, index) => {
            feature.properties.originalIndex = index;
            return feature;
        }).filter(feature => {
            if (!feature || !feature.geometry || !feature.geometry.coordinates || 
                feature.geometry.coordinates.length < 2 || 
                typeof feature.geometry.coordinates[0] !== 'number' || 
                typeof feature.geometry.coordinates[1] !== 'number') 
            {
                console.warn(`Paradero inválido/sin coordenadas en índice ${feature.properties.originalIndex} (${feature.properties.name}). Omitiendo.`);
                return false;
            }
            return true;
        });

        todosLosParaderos.forEach(feature => {
            const props = feature.properties;
            // Asegura que 'nombre' exista, usando los campos de QGIS o los originales
            feature.properties.nombre = props.nombre || props.Name || props.Paradero || props.NOMVIAL || "Paradero sin nombre";
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
        
        initChoicesSelect();
        initChoicesSelectRuta();
        
        getUbicacionUsuario(handleInitialLocation, handleLocationError);

    } catch (error) {
        console.error("Error cargando o procesando los datos GeoJSON:", error);
    }
}); // <-- FIN DEL DOMCONTENTLOADED

// --- 5. LÓGICA DE LA APP (EVENT HANDLERS) ---

function handleInitialLocation(pos) {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    
    if (lat === 0 && lon === 0) {
        console.error("Posición GPS inválida (0,0) detectada.");
        handleLocationError({ code: 0, message: "Posición GPS inválida (0,0)" });
        inputInicio.value = "Error de GPS (0,0)";
        return;
    }

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


function initChoicesSelect() {
    
    const choicesData = todosLosParaderos.map(paradero => {
        const props = paradero.properties;
        const nombreCalle = props.NOMVIAL || props.calle_cercana || "";
        const nombreColonia = props.NOM_COL || props.colonia_cercana || "";

        return {
            value: props.originalIndex,
            label: props.nombre,
            customProperties: { 
                calle: nombreCalle,
                colonia: nombreColonia
            }
        };
    });

    choicesDestino = new Choices(selectDestino, {
        choices: choicesData,
        itemSelectText: 'Seleccionar',
        searchPlaceholderValue: 'Escribe paradero, calle o colonia...',
        shouldSort: false,
        removeItemButton: true,
        searchFields: ['label', 'customProperties.calle', 'customProperties.colonia'],
        
        // 2. TEMPLATES LIMPIOS (Sin 'style')
        callbackOnCreateTemplates: function(template) {
            return {
                item: ({ classNames }, data) => {
                    return template(
                        `<div class="${classNames.item} ${data.highlighted ? classNames.highlightedState : classNames.itemSelectable}" data-item data-value="${data.value}" ${data.active ? 'aria-selected="true"' : ''} ${data.disabled ? 'aria-disabled="true"' : ''}>
                            <span>${data.label}</span>
                            <small>${data.customProperties.calle || data.customProperties.colonia || ''}</small>
                        </div>`
                    );
                },
                choice: ({ classNames }, data) => {
                    return template(
                        `<div class="${classNames.item} ${classNames.itemChoice} ${data.disabled ? classNames.itemDisabled : classNames.itemSelectable}" data-select-text="${this.config.itemSelectText}" data-choice ${data.disabled ? 'data-choice-disabled aria-disabled="true"' : 'data-choice-selectable'}" data-id="${data.id}" data-value="${data.value}" ${data.groupId > 0 ? 'role="treeitem"' : 'role="option"'}>
                            <span>${data.label}</span>
                            <small>${data.customProperties.calle || data.customProperties.colonia || ''}</small>
                        </div>`
                    );
                },
            };
        }
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

function cambiarModo(modo) {
    if (modo === 'viaje') {
        panelViaje.classList.remove('oculto');
        panelExplorar.classList.add('oculto');
        btnModoViaje.classList.add('activo');
        btnModoExplorar.classList.remove('activo');
        limpiarMapa();
    } else {
        panelViaje.classList.add('oculto');
        panelExplorar.classList.remove('oculto');
        btnModoViaje.classList.remove('activo');
        btnModoExplorar.classList.add('activo');
        limpiarMapa();
    }
}

function initChoicesSelectRuta() {
    todasLasRutas.sort((a, b) => a.properties.id.localeCompare(b.properties.id, undefined, {numeric: true}));

    const choicesData = todasLasRutas.map(ruta => ({
        value: ruta.properties.id,
        label: `${ruta.properties.id} (${ruta.properties.nombre})`,
    }));

    choicesRuta = new Choices(selectRuta, {
        choices: choicesData,
        itemSelectText: 'Seleccionar',
        searchPlaceholderValue: 'Escribe para filtrar...',
        shouldSort: false,
    });

    selectRuta.addEventListener('change', (event) => {
        if (event.detail.value) {
            handleExplorarRuta(event.detail.value);
        }
    });
}

function handleExplorarRuta(rutaId) {
    const ruta = todasLasRutas.find(r => r.properties.id === rutaId);
    if (!ruta) return;

    const paraderosSet = mapRutaParaderos.get(rutaId);
    const paraderosArray = paraderosSet ? [...paraderosSet] : [];

    dibujarRutaExplorar(ruta, paraderosArray);

    instruccionesExplorarEl.innerHTML = `
        <p>Mostrando <strong>${ruta.properties.id}</strong>.</p>
        <p>Esta ruta tiene aproximadamente <strong>${paraderosArray.length}</strong> paraderos.</p>
    `;
}

function limpiarMapa() {
    dibujarPlan([]);
    limpiarCapasDeRuta(); // <-- AHORA FUNCIONA

    // --- RESETEAR MODO VIAJE ---
    instruccionesEl.innerHTML = "Selecciona tu destino para ver la ruta.";
    paraderoFin = null;
    rutaCompletaPlan = [];
    listaDePlanes = [];
    pasoActual = 0;
    
    if (choicesDestino) {
        choicesDestino.clearInput();
        choicesDestino.removeActiveItems();
    }

    btnIniciarRuta.style.display = 'none';
    btnLimpiar.style.display = 'none';
    
    // --- RESETEAR MODO EXPLORAR ---
    instruccionesExplorarEl.innerHTML = "Selecciona una ruta para ver su trayecto y paraderos.";
    if (choicesRuta) {
        choicesRuta.clearInput();
        choicesRuta.removeActiveItems();
    }
    
    // --- RESETEAR NAVEGACIÓN ---
    panelNavegacion.classList.add('oculto');
    stopNavigation();
    detenerWatchLocation(watchId);
    
    // --- RESETEAR UBICACIÓN ---
    if (puntoInicio) {
        const coords = puntoInicio.geometry.coordinates;
        map.setView([coords[1], coords[0]], 16);
        crearMarcadorUsuario([coords[1], coords[0]]).bindPopup("<b>Estás aquí</b>").openPopup();
    }
}


function togglePanel() {
    const enNavegacion = !panelNavegacion.classList.contains('oculto');

    if (enNavegacion) {
        panelNavegacion.classList.toggle('oculto');
    } else {
        panelControl.classList.toggle('oculto');
    }
}


// --- 6. LÓGICA DE NAVEGACIÓN (UI) ---

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

    const fragment = document.createDocumentFragment();
    const header = document.createElement('p');
    header.innerHTML = `<strong>Se encontraron ${planes.length} opciones:</strong>`;
    fragment.appendChild(header);
    
    planes.forEach((plan, index) => {
        const opcionDiv = document.createElement('div');
        opcionDiv.className = 'opcion-ruta';
        
        const buses = plan.filter(p => p.tipo === 'bus').map(p => p.ruta.properties.id);
        const opcionHeader = document.createElement('h4');
        opcionHeader.innerHTML = `Opción ${index + 1} <span style="font-weight:normal; font-size: 0.8em;">(${buses.join(' &rarr; ')})</span>`;
        opcionDiv.appendChild(opcionHeader);
        
        const listaOL = document.createElement('ol');
        plan.forEach(paso => {
            if (paso.tipo === 'caminar' || paso.tipo === 'bus') {
                const li = document.createElement('li');
                li.textContent = paso.texto;
                listaOL.appendChild(li);
            }
        });
        opcionDiv.appendChild(listaOL);
        
        const btnSeleccionar = document.createElement('button');
        btnSeleccionar.className = 'btn-seleccionar';
        btnSeleccionar.textContent = 'Seleccionar esta ruta';
        
        btnSeleccionar.addEventListener('click', () => {
            seleccionarPlan(index);
        });
        
        opcionDiv.appendChild(btnSeleccionar);
        fragment.appendChild(opcionDiv);
    });

    instruccionesEl.appendChild(fragment);
    dibujarPlan(planes);
    btnLimpiar.style.display = 'block';
    btnIniciarRuta.style.display = 'none'; 
}

const seleccionarPlan = (indice) => {
    rutaCompletaPlan = listaDePlanes[indice];

    distanciaTotalRuta = 0;
    let puntoAnterior = puntoInicio;

    rutaCompletaPlan.forEach(paso => {
        try {
            if (paso.tipo === 'caminar') {
                distanciaTotalRuta += turf.distance(puntoAnterior, paso.paradero, { units: 'meters' });
                puntoAnterior = paso.paradero;
            } else if (paso.tipo === 'bus') {
                const startOnLine = turf.nearestPointOnLine(paso.ruta, paso.paraderoInicio);
                const endOnLine = turf.nearestPointOnLine(paso.ruta, paso.paraderoFin);
                const segmentoDeRuta = turf.lineSlice(startOnLine, endOnLine, paso.ruta);
                distanciaTotalRuta += turf.length(segmentoDeRuta, { units: 'meters' });
                puntoAnterior = paso.paraderoFin;
            }
        } catch (e) {
            console.error("Error calculando distancia del paso:", paso, e);
        }
    });

    console.log(`Distancia total de la ruta: ${distanciaTotalRuta} metros`);
    
    instruccionesEl.innerHTML = `<p><strong>Ruta seleccionada. ¡Listo para navegar!</strong></p>`;
    const buses = rutaCompletaPlan.filter(p => p.tipo === 'bus').map(p => p.ruta.properties.id);
    instruccionesEl.innerHTML += `<p>${buses.join(' &rarr; ')}</p>`;
    instruccionesEl.innerHTML += `<p><strong>Distancia total:</strong> ${(distanciaTotalRuta / 1000).toFixed(2)} km</p>`;
    
    btnIniciarRuta.style.display = 'block';
    dibujarPlan([rutaCompletaPlan]);
}


function encontrarParaderoMasCercano(punto) {
    return turf.nearestPoint(punto, paraderosCollection);
}

// --- 7. FUNCIONES DE NAVEGACIÓN ---
function iniciarRutaProgresiva() {
    if (!rutaCompletaPlan || rutaCompletaPlan.length === 0) return;
    console.log("Iniciando modo de navegación...");
    panelControl.classList.add('oculto'); 
    panelNavegacion.classList.remove('oculto');
    pasoActual = 0;
    alertaMostrada = false;

    crearMarcadorUsuario(puntoInicio.geometry.coordinates.slice().reverse());
    startNavigation(puntoInicio); 

    watchId = iniciarWatchLocation(handleLocationUpdate, handleLocationError);
    map.on('dragstart', () => { autoCentrar = false; });
    mostrarPaso(pasoActual);
}

function finalizarRuta() {
    console.log("Finalizando navegación.");
    panelNavegacion.classList.add('oculto'); 
    panelControl.classList.remove('oculto');
    stopNavigation(); 
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

    const navState = updatePosition(puntoInicio);
    if (navState) {
        actualizarUI_Navegacion(navState);
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
    
    const bounds = dibujarPaso(paso, puntoInicio); 
    
    if (autoCentrar && bounds && bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2));
    } else if (autoCentrar && !bounds) {
        map.setView(map.getCenter(), 17);
    }
}

function actualizarUI_Navegacion(navState) {

    // 1. Actualizar distancia
    const distanciaFaltante = Math.max(0, distanciaTotalRuta - navState.distanciaRecorrida);
    if (distanciaFaltante > 1000) {
        distanciaRestanteEl.textContent = `Faltan: ${(distanciaFaltante / 1000).toFixed(2)} km`;
    } else {
        distanciaRestanteEl.textContent = `Faltan: ${distanciaFaltante.toFixed(0)} m`;
    }

    // 2. Actualizar tiempo de espera
    if (navState.enMovimiento) {
        tiempoEsperaEl.textContent = "En movimiento";
        tiempoEsperaEl.style.color = "#28a745"; // Verde
    } else {
        const minutos = Math.floor(navState.tiempoDetenido / 60);
        const segundos = navState.tiempoDetenido % 60;
        tiempoEsperaEl.textContent = `Esperando: ${minutos}:${segundos < 10 ? '0' : ''}${segundos}`;
        tiempoEsperaEl.style.color = "#dc3545"; // Rojo
    }
    
    // 3. Actualizar tiempo total de viaje
    const LIMITE_TIEMPO = 7200; // 2 horas en segundos
    const totalMinutos = Math.floor(navState.tiempoTotalViaje / 60);
    const totalSegundos = navState.tiempoTotalViaje % 60;
    
    tiempoViajeEl.textContent = `Viaje: ${totalMinutos}:${totalSegundos < 10 ? '0' : ''}${totalSegundos}`;

    if (navState.tiempoTotalViaje > LIMITE_TIEMPO) {
        tiempoViajeEl.classList.add('advertencia');
    } else {
        tiempoViajeEl.classList.remove('advertencia');
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