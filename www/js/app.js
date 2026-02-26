// js/app.js

import { 
    initMap, crearMarcadorUsuario, dibujarPlan, dibujarPaso, marcadores, map, 
    dibujarRutaExplorar, limpiarCapasDeRuta, 
    crearPopupInteligente, iconoParadero, iconoTransbordo, iconoDestino, 
    actualizarMarcadorBus, 
    removerMarcadorBus, 
    limpiarCapaBuses

} from './mapService.js';
import { getUbicacionUsuario, iniciarWatchLocation, detenerWatchLocation } from './locationService.js';
import { encontrarRutaCompleta, crearMapaRutas, linkParaderosARutas } from './routeFinder.js';
import { initSettings, userSettings } from './settings.js';
import { startNavigation, stopNavigation, updatePosition, activarModoTransbordo } from './navigationService.js';
import { KeepAwake } from '@capacitor-community/keep-awake'; // CORRECTO
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Dialog } from '@capacitor/dialog';
import { iniciarSesion, monitorEstadoAuth, getUsuario } from './authService.js';
import { verificarEstadoPremium, isUserPremium, mostrarMensajeIndie } from './subscriptionService.js';
import { buscarLugarEnNominatim, categoriasRapidas, sitiosTuristicos,buscarEnDatosLocales} from './searchService.js';
import { procesarETAMasivo, limpiarETAs } from './etaService.js';
import { esBusVisible } from './privacyService.js';
import { iniciarTour, checkAndStartTour } from './tour.js';
import { iniciarMotorInteligente, detenerMotorInteligente, registrarLatidoBusMotor } from './statusEngine.js';
import { recargarSaldo, obtenerSaldo, procesarAbordaje, vincularTarjetaQR, obtenerDatosTarjeta, fijarSaldo, desvincularTarjetaQR } from './walletService.js';
import { calcularCostoEstimado, checkSaldoParaRuta, advertirSaldoInsuficiente } from './costService.js';

async function mantenerPantallaEncendida() {
    try {
        await KeepAwake.keepAwake();
        console.log('Modo KeepAwake activado: La pantalla no se apagará.');
    } catch (error) {
        console.error('Error al activar KeepAwake:', error);
    }
}

/* --- Función de espera (Debounce) para no saturar el buscador --- */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

async function solicitarPermisosIniciales() {
    try {
        // --- 1. PERMISO DE UBICACIÓN (GPS) ---
        const estadoGPS = await Geolocation.checkPermissions();
        
        if (estadoGPS.location !== 'granted') {
            // Mostrar explicación "educada" antes de pedir el permiso
            const { value } = await Dialog.confirm({
                title: 'Permiso de Ubicación',
                message: 'Para mostrarte tu posición en el mapa y avisarte cuando llegues a tu parada, Rutas Koox necesita acceder a tu ubicación. ¿Nos das permiso?',
                okButtonTitle: 'Claro, activar',
                cancelButtonTitle: 'Ahora no'
            });

            if (value) {
                const resultado = await Geolocation.requestPermissions();
                if (resultado.location !== 'granted') {
                    console.warn('El usuario denegó el GPS.');
                }
            }
        }

        // --- 2. PERMISO DE NOTIFICACIONES ---
        const estadoNotif = await LocalNotifications.checkPermissions();

        if (estadoNotif.display !== 'granted') {
            const { value } = await Dialog.confirm({
                title: 'Alertas de Viaje',
                message: '¿Te gustaría que te avisemos cuando estés cerca de bajar del autobús? Activa las notificaciones para no perder tu parada.',
                okButtonTitle: 'Activar Alertas',
                cancelButtonTitle: 'No gracias'
            });

            if (value) {
                await LocalNotifications.requestPermissions();
            }
        }

        // --- 3. ACTIVAR PANTALLA ENCENDIDA ---
        // Esto no pide permiso al usuario, es automático, pero lo iniciamos aquí
        await KeepAwake.keepAwake();
        console.log("Modo viaje activo: Pantalla encendida.");

    } catch (error) {
        console.error('Error al solicitar permisos:', error);
    }
}
let socketVinden = null; // Guardará la conexión al satélite
let socketsVindenMulti = []; // ⏱️ NUEVO: Guardará el escuadrón de conexiones múltiples

// Diccionario EXACTO alineado con la base de datos oficial de Vinden
const mapaIdsVinden = {
    'koox-01': '233',
    'koox-02': '218',
    'koox-03': '219',
    'koox-04': '220',
    'koox-05': '221',
    'koox-06': '222',
    'koox-07': '223',
    'koox-08': '234',
    'koox-10': '236',
    'koox-11': '237',
    'koox-12': '238',
    'koox-13': '232',
    'koox-14': '239',
    'koox-15': '224',
    'koox-16': '225',
    'koox-17': '226',
    'koox-19': '241',
    'koox-20': '242',
    'koox-21': '227',
    'koox-22': '228',
    'koox-23': '229',
    'koox-24': '247',
    'koox-25': '230',
    'koox-26': '243',
    'koox-27': '244'
};

function obtenerIdVinden(kooxId) {
    if (!kooxId) return null;
    return mapaIdsVinden[kooxId] || null;
}

// ⬇️⬇️ CORRECCIÓN 2: Módulo Firebase (movido aquí) ⬇️⬇️
const firebaseConfig = {
  apiKey: "AIzaSyDozEdN4_g7u-D6XcJdysuns8-iLbfMS5I",
  authDomain: "rutaskoox-alertas.firebaseapp.com",
  // ❗️ ATENCIÓN: databaseURL es necesario para la v8 (compat)
  databaseURL: "https://rutaskoox-alertas-default-rtdb.firebaseio.com/", // ⬅️ Asegúrate de que esta sea la URL de tu Realtime Database
  projectId: "rutaskoox-alertas",
  storageBucket: "rutaskoox-alertas.firebasestorage.app",
  messagingSenderId: "332778953247",
  appId: "1:332778953247:web:4460fef290b88fb1b1932a",
  measurementId: "G-XH7ZKS825M"
};

// ⬇️⬇️ CORRECCIÓN 3: Usar la sintaxis "compat" (v8) ⬇️⬇️
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Obtener referencias a los servicios que usaremos
const db = firebase.firestore(); // ⬅️ Sintaxis v8
const rtdb = firebase.database(); // ⬅️ Sintaxis v8
// ⬆️⬆️ FIN DEL MÓDULO FIREBASE ⬆️⬆️

const verificarMantenimiento = () => {
    const pantallaMant = document.getElementById('pantalla-mantenimiento');
    if (!pantallaMant) return;

    // Escuchamos la variable 'config/mantenimiento_activo' en la base de datos
    // Nota: Tú crearás esta ruta en Firebase luego o usarás el Admin para cambiarla
    rtdb.ref('config/mantenimiento_activo').on('value', (snapshot) => {
        const estaEnMantenimiento = snapshot.val();

        if (estaEnMantenimiento === true) {
            console.warn("⚠️ MODO MANTENIMIENTO ACTIVADO");
            // 1. Mostramos la cortina
            pantallaMant.classList.remove('oculto');
            // 2. Opcional: Forzamos 'display: flex' por si la clase oculto usa !important
            pantallaMant.style.display = 'flex'; 
        } else {
            console.log("✅ Sistema operativo");
            // Ocultamos la cortina
            pantallaMant.classList.add('oculto');
            pantallaMant.style.display = 'none';
        }
    });
};

// Llamamos a la función
verificarMantenimiento();


// --- 2. VARIABLES GLOBALES DE ESTADO ---
let todosLosParaderos = [];
let todasLasRutas = [];
let paraderosCollection = null;
let mapRutaParaderos = new Map();
let listaDePlanes = [];
let rutaCompletaPlan = [];
let pasoActual = 0; 
let alertaMostrada = false;
let watchId = null; // ⬅️ Este será el watchId de NAVEGACIÓN
let autoCentrar = true;
let puntoInicio = null; 
let paraderoInicioCercano = null; 
let paraderoFin = null;
let choicesDestino = null;
let distanciaTotalRuta = 0;
let distanciaRestanteEl, tiempoEsperaEl, tiempoViajeEl;
let choicesRuta = null;
let btnParaderosCercanos;
let offlineIndicatorEl = null;
let btnFabReporte, btnModoReporte, panelReporte;
let alertIndicatorEl = null; // ⬅️ AÑADE ESTA LÍNEA
let rtdbSnapshot = null; // Guardará la última copia de los datos de la RTDB
let dbGestion = null;
let gestionApp = null;
let firestoreListenerUnsubscribe = null;
let initialWatchId = null; // ⬅️ AÑADIDA: Nuevo ID para la detección inicial (handleInitialLocation)

// ⬇️⬇️ NUEVAS VARIABLES PARA MODO MANUAL Y GPS INICIAL ⬇️⬇️
let choicesInicioManual = null;
let ubicacionInicialFijada = false; // ⬅️ Para arreglar Bug 1 (mapa que se mueve)

// --- 3. REFERENCIAS AL DOM (Solo declaradas) ---
let selectDestino, inputInicio, instruccionesEl, btnIniciarRuta, btnLimpiar;
let panelControl, panelNavegacion, instruccionActualEl, btnAnterior, btnSiguiente, btnFinalizar;
let panelViaje, panelExplorar;
let selectRuta, instruccionesExplorarEl, btnLimpiarExplorar;
let btnInfo, infoModal, btnCloseModal;

// ⬇️⬇️ NUEVAS REFERENCIAS AL DOM ⬇️⬇️
let selectInicioManual, controlInputInicio, controlSelectInicio;

// js/app.js

// ⬇️⬇️ INICIO DE FUNCIONES GLOBALES DE ALERTA Y RUTAS ⬇️⬇️

/**
 * Función auxiliar para obtener el ID + Nombre de la ruta.
 * (Accede a 'todasLasRutas', que es una variable global)
 */
function getRutaNombrePorId(rutaId) {
    const ruta = todasLasRutas.find(r => r.properties.id === rutaId);
    // Retorna "ID (Nombre)" o simplemente el ID si no encuentra el nombre.
    return ruta ? `${ruta.properties.id} (${ruta.properties.nombre})` : rutaId;
}

/**
 * Función de ayuda para mostrar/ocultar el banner.
 */
function mostrarAlertaComunitaria(mensaje) {
    if (mensaje) {
        alertIndicatorEl.textContent = mensaje;
        alertIndicatorEl.classList.remove('oculto');
    } else {
        alertIndicatorEl.classList.add('oculto');
    }
}

/**
 * Función que DIBUJA la alerta y contiene toda la lógica de filtro y caducidad.
 * (Accede a 'rtdbSnapshot', 'getRutaActivaId', y 'alertIndicatorEl' que son globales)
 */
function actualizarDisplayAlertas() {
    if (!rtdbSnapshot) return;

    const alertas = rtdbSnapshot.val();
    const rutaActiva = getRutaActivaId();
    const ahora = Date.now();
    
    // --- LÓGICA DE FILTRADO Y CADUCIDAD ---
    if (rutaActiva && alertas && alertas[rutaActiva]) {
        const alerta = alertas[rutaActiva];
        const nombreMostrar = getRutaNombrePorId(rutaActiva); 

        // Verificamos si la alerta ya caducó
        if (ahora < alerta.expiraEn) {
            // Si la alerta es RELEVANTE y VIGENTE: la mostramos.
            mostrarAlertaComunitaria(`⚠️ ALERTA: ${alerta.mensaje} en ${nombreMostrar}`);              
            return; 
        }
    }
    
    // Si no hay ruta activa, la alerta caducó o no es relevante: Ocultamos.
    mostrarAlertaComunitaria(null);
}

// ⬆️⬆️ FIN DE FUNCIONES GLOBALES DE ALERTA Y RUTAS ⬆️⬆️

// --- 4. ARRANQUE DE LA APP ---
document.addEventListener('DOMContentLoaded', async () => { 

    // Listener para el botón de prueba
    const btnTest = document.getElementById('btnTestSimulador');
    if (btnTest) {
        btnTest.addEventListener('click', () => {
            // Llamamos a la función que pegaste al final del archivo
            if (typeof window.simularBus === 'function') {
                window.simularBus();
            } else {
                alert("⚠️ Error: La función simularBus no se ha cargado. Revisa el final de tu archivo app.js");
            }
        });
    }
    const btnBuscarLugar = document.getElementById('btnBuscarLugar');
    const infoLugarDetectado = document.getElementById('info-lugar-buscado');
    const contenedorChips = document.getElementById('contenedor-chips');
    const btnModoTurista = document.getElementById('btnModoTurista');
const btnMinimizarPanel = document.getElementById('btnMinimizarPanel');
const btnMinimizarNav = document.getElementById('btnMinimizarNav');
    // Asignamos todas las referencias al DOM aquí
    selectDestino = document.getElementById('selectDestino');
    inputInicio = document.getElementById('inputInicio');
    instruccionesEl = document.getElementById('panel-instrucciones'); // ⬅️ CORREGIDO (apunta al panel)
    btnIniciarRuta = document.getElementById('btnIniciarRuta');
    btnLimpiar = document.getElementById('btnLimpiar');
    panelControl = document.getElementById('panel-control');
    panelNavegacion = document.getElementById('panel-navegacion');
    instruccionActualEl = document.getElementById('instruccion-actual');
    btnAnterior = document.getElementById('btnAnterior');
    btnSiguiente = document.getElementById('btnSiguiente');
    btnFinalizar = document.getElementById('btnFinalizar');
    distanciaRestanteEl = document.getElementById('distancia-restante');
    tiempoEsperaEl = document.getElementById('tiempo-espera');
    panelViaje = document.getElementById('panel-viaje');
    panelExplorar = document.getElementById('panel-explorar');
    selectRuta = document.getElementById('selectRuta');
    instruccionesExplorarEl = document.getElementById('instrucciones-explorar');
    btnLimpiarExplorar = document.getElementById('btnLimpiarExplorar');
    btnInfo = document.getElementById('btnInfo');
    infoModal = document.getElementById('info-modal');
    btnCloseModal = document.getElementById('btnCloseModal');
    tiempoViajeEl = document.getElementById('tiempo-viaje');
    btnParaderosCercanos = document.getElementById('btnParaderosCercanos');
    alertIndicatorEl = document.getElementById('alert-indicator'); // ⬅️ ASIGNA EL BANNER
    btnModoReporte = document.getElementById('btnModoReporte');
    panelReporte = document.getElementById('panel-reporte');
    solicitarPermisosIniciales();
    // ⬇️⬇️ NUEVO: Inicializar Ajustes y Barra de Navegación ⬇️⬇️
    initSettings(); 

    // --- LÓGICA DE BARRA DE NAVEGACIÓN INFERIOR ---
    const navItems = document.querySelectorAll('.nav-item');
    const pantallaSaldo = document.getElementById('pantalla-saldo');
    const pantallaRecargas = document.getElementById('pantalla-recargas');


    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const target = btn.dataset.target;
            const yaEstabaActivo = btn.classList.contains('activo');
    
            // Si ya estaba activo y es un panel lateral (Viaje/Explorar/Reporte), lo cerramos (toggle)
            if (yaEstabaActivo && (target === 'viaje' || target === 'explorar' || target === 'reporte')) {
                minimizarPaneles();
                return; // Salimos, no abrimos nada
            }
    
            // Si no, comportamiento normal de cambiar modo
            navItems.forEach(nav => nav.classList.remove('activo'));
            btn.classList.add('activo');
            cambiarModo(target);
        });
    });
    // ⬆️⬆️ FIN NUEVO BLOQUE ⬆️⬆️
    mantenerPantallaEncendida();

    // ⬇️⬇️ INICIO DEL MÓDULO OFFLINE ⬇️⬇️
    offlineIndicatorEl = document.getElementById('offline-indicator');
    
    // Función para mostrar/ocultar el banner
    const actualizarEstadoOffline = () => {
        if (!navigator.onLine) {
            offlineIndicatorEl.classList.remove('oculto');
        } else {
            offlineIndicatorEl.classList.add('oculto');
        }
    };
    
    // Listeners que detectan cambios de conexión
    window.addEventListener('offline', actualizarEstadoOffline);
    window.addEventListener('online', actualizarEstadoOffline);
    
    // Comprobar el estado al cargar la app
    actualizarEstadoOffline();
    // ⬆️⬆️ FIN DEL MÓDULO OFFLINE ⬆️⬆️

    // ⬇️⬇️ INICIO MÓDULO FIREBASE (RECEPCIÓN DE ALERTAS) - MODIFICADO ⬇️⬇️
    try {
        const alertasRef = rtdb.ref('alertas'); // Referencia a la raíz de todas las alertas

        // 2. Escucha cambios y llama a la función de dibujo
        alertasRef.on('value', (snapshot) => {
            rtdbSnapshot = snapshot; // ⬅️ Guardamos la copia global de los datos
            actualizarDisplayAlertas(); // ⬅️ Dibujamos inmediatamente
        });

    } catch (err) {
        console.error("No se pudo conectar a Firebase Realtime Database", err);
    }
    // ⬆️⬆️ FIN MÓDULO FIREBASE ⬆️⬆️

    inicializarFirebaseGestion(); // Solo inicializa Firebase, no escucha nada.

    // ⬇️⬇️ ASIGNACIÓN DE NUEVOS ELEMENTOS DEL DOM ⬇️⬇️
    selectInicioManual = document.getElementById('selectInicioManual'); // (de index.html corregido)
    controlInputInicio = document.getElementById('control-input-inicio');
    controlSelectInicio = document.getElementById('control-select-inicio');
    
    // Conectamos TODOS los eventos principales aquí
    btnParaderosCercanos.addEventListener('click', handleParaderosCercanos);
    btnLimpiar.addEventListener('click', limpiarMapa);
    btnIniciarRuta.addEventListener('click', iniciarRutaProgresiva);
    btnSiguiente.addEventListener('click', siguientePaso);
    btnAnterior.addEventListener('click', pasoAnterior);
    btnFinalizar.addEventListener('click', finalizarRuta);
    btnLimpiarExplorar.addEventListener('click', limpiarMapa);
    // ⬇️⬇️ INICIO MÓDULO DE ENVÍO DE REPORTES ⬇️⬇️
    document.querySelectorAll('.btn-reporte').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tipoReporte = e.target.dataset.tipo;
            handleEnviarReporte(tipoReporte);
        });
    });
    // ⬆️⬆️ FIN MÓDULO ⬆️⬆️

    btnInfo.addEventListener('click', () => infoModal.classList.remove('oculto'));
    btnCloseModal.addEventListener('click', () => infoModal.classList.add('oculto'));
    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) {
            infoModal.classList.add('oculto');
        }
    });
    
    panelControl.classList.add('oculto'); 
    panelNavegacion.classList.add('oculto');
    
    // Ocultar panel manual por defecto
    if (controlSelectInicio) {
        controlSelectInicio.style.display = 'none';
    }
    // En tu función de inicio (init o DOMContentLoaded)
    initMap();

    // --- A. INICIALIZAR CHIPS DE CATEGORÍAS ---
    if (contenedorChips) {
        categoriasRapidas.forEach(cat => {
            const chip = document.createElement('button');
            chip.className = 'chip';
            chip.innerHTML = `<i class="${cat.icono}"></i> ${cat.label}`;
            chip.addEventListener('click', () => {
                // Al hacer click, buscamos esa categoría en internet
                ejecutarBusquedaInternet(`${cat.query} en Campeche`);
            });
            contenedorChips.appendChild(chip);
        });
    }

// --- B. BOTÓN DE LUPA (Ahora solo enfoca el menú) ---
if (btnBuscarLugar) {
    btnBuscarLugar.addEventListener('click', () => {
        if (choicesDestino) {
            // 1. Enfocamos el buscador del menú
            choicesDestino.showDropdown();
            
            // 2. Opcional: Si ya escribió algo, forzamos la búsqueda
            const textoActual = choicesDestino.input.value;
            if(textoActual && textoActual.length > 2) {
                // Disparamos el evento manualmente para reactivar la búsqueda
                choicesDestino.input.element.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    });
}

    // --- C. BOTÓN MODO TURISTA ---
    if (btnModoTurista) {
        btnModoTurista.addEventListener('click', () => {
            mostrarOpcionesTurismo();
        });
    }

    function minimizarPaneles() {
        panelControl.classList.add('oculto');
        panelNavegacion.classList.add('oculto');
    
        // Opcional: Quitar el estado "activo" de la barra de abajo para indicar que estamos viendo el mapa puro
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('activo'));
    }
    
    // Listener para el botón de la flecha en Panel Control
    if(btnMinimizarPanel) {
        btnMinimizarPanel.addEventListener('click', minimizarPaneles);
    }
    
    // Listener para el botón de la flecha en Panel Navegación
    if(btnMinimizarNav) {
        btnMinimizarNav.addEventListener('click', minimizarPaneles);
    }
    
    // Listener para cerrar al tocar el mapa (UX Clásica)
    map.on('click', () => {
        minimizarPaneles();
    });

// ... dentro de DOMContentLoaded ...
    
    // --- NUEVO: Monitoreo de Usuario y Suscripción ---
    monitorEstadoAuth(async (user) => {
        if (user) {
            // Si el usuario existe, verificamos si pagó
            await verificarEstadoPremium(user.uid);
        } else {
            console.log("App iniciada en modo invitado");
        }
    });

    // Exponemos la función global para redireccionar desde el Modal Indie
    window.app = window.app || {};
    window.app.irASeccionRecargas = () => {
        // Simulamos clic en el botón de navegación inferior
        const btnRecargas = document.querySelector('.nav-item[data-target="recargas"]');
        if (btnRecargas) btnRecargas.click();
    };
    

    // js/app.js (en DOMContentLoaded, después de initMap())

    // ⬇️⬇️ INICIO DEL MÓDULO: LÓGICA DE POPUP INTELIGENTE ⬇️⬇️
    map.on('popupopen', (e) => {
        // Esto se dispara cada vez que se abre un popup
        const popupEl = e.popup.getElement();
        const btn = popupEl.querySelector('.btn-ver-rutas-paradero');

        if (btn) {
            // Si el popup tiene nuestro botón, le añadimos el listener
            btn.addEventListener('click', handleMostrarRutasDeParadero);
        }
    });
    // ⬆️⬆️ FIN DEL MÓDULO ⬆️⬆️

// ... (justo después de initMap())
    map.on('contextmenu', (e) => { // ⬅️ CAMBIADO DE VUELTA
        // 1. Prevenir el menú contextual (clic derecho)
        e.originalEvent.preventDefault(); 
        // ...

        // 2. Comprobar si tenemos un punto de inicio
        if (!paraderoInicioCercano) {
            alert("Por favor, selecciona un punto de inicio o espera a que tu GPS se active antes de fijar un destino.");
            return;
        }

        console.log("Clic largo detectado. Buscando paradero más cercano...");
        
        // 3. Convertir las coordenadas del clic en un punto GeoJSON
        const puntoClickeado = turf.point([e.latlng.lng, e.latlng.lat]);

        // 4. Encontrar el paradero más cercano a ese clic
        const paraderoDestino = encontrarParaderoMasCercano(puntoClickeado);

        if (!paraderoDestino) {
            alert("No se encontraron paraderos cercanos a ese punto.");
            return;
        }

        // 5. Asignar como destino global y actualizar el selector
        paraderoFin = paraderoDestino; // 'paraderoFin' es una variable global
        
        // --- ⬇️ AQUÍ ESTÁ LA CORRECCIÓN ⬇️ ---
        //   (quitamos el .toString() para pasarlo como NÚMERO)
        choicesDestino.setChoiceByValue(paraderoDestino.properties.originalIndex);
        // --- ⬆️ FIN DE LA CORRECCIÓN ⬆️ ---

        console.log(`Destino fijado en: ${paraderoFin.properties.nombre}`);

        // 6. Ejecutar la búsqueda de ruta
        const puntoDePartida = paraderoInicioCercano;
        listaDePlanes = encontrarRutaCompleta(puntoDePartida, paraderoFin, todosLosParaderos, todasLasRutas, mapRutaParaderos);
        
        // 7. Mostrar los resultados
        mostrarPlanes(listaDePlanes);
        abrirPanelControl();
    });
    // ⬆️⬆️ FIN DEL MÓDULO CORREGIDO ⬆️⬆️
    
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
            feature.properties.id = nombreCompleto.split(' ').slice(0, 2).join('-').toLowerCase();
            feature.properties.nombre = nombreCompleto.split(' ').slice(2).join(' ');
        });

        console.log("Enlazando paraderos a rutas...");
        linkParaderosARutas(todosLosParaderos, todasLasRutas);
        console.log("Creando mapa de búsqueda de rutas...");
        mapRutaParaderos = crearMapaRutas(todasLasRutas, todosLosParaderos);
        
        console.log("¡Enlace completado!");
        paraderosCollection = turf.featureCollection(todosLosParaderos);
        
        // Inicializar AMBOS selectores
        initChoicesSelect(); // Destino
        initChoicesSelectInicioManual(); // Inicio Manual
        
        initChoicesSelectRuta(); // Explorar
        
        // ⬇️ MODIFICADO (BUG 1): Usar 'iniciarWatchLocation' para que el inicio se actualice en vivo ⬇️
        initialWatchId = iniciarWatchLocation(handleInitialLocation, handleLocationError);
        actualizarPanelDeInicio();

    } catch (error) {
        console.error("Error cargando o procesando los datos GeoJSON:", error);
    }
    checkAndStartTour();

    // ⬇️⬇️ INICIALIZAR MONEDERO VIRTUAL Y ESCÁNER QR ⬇️⬇️
    const uiSaldo = document.getElementById('ui-saldo-virtual');
    const uiIdTarjeta = document.getElementById('ui-id-tarjeta');
    const selectTipoTarjeta = document.getElementById('select-tipo-tarjeta');
    const tarjetaUI = document.getElementById('tarjeta-virtual-ui');
    const etiquetaTipo = document.getElementById('etiqueta-tipo-tarjeta');
    
// COLORES EXACTOS DE LAS TARJETAS FÍSICAS KOO'OX
    const coloresTarjeta = {
        'general': 'linear-gradient(135deg, #8B1F41, #5c1120)', // Guinda/Vino oficial
        'estudiante': 'linear-gradient(135deg, #D4AF37, #B8860B)', // Dorado
        'discapacidad': 'linear-gradient(135deg, #4CAF50, #2E7D32)', // Verde
        'inapam': 'linear-gradient(135deg, #ef5350, #c62828)' // Rojo más bajito
    };

function actualizarInterfazTarjeta() {
        if (!uiSaldo) return;
        const datos = obtenerDatosTarjeta();
        const btnEscanear = document.getElementById('btn-escanear-qr');
        const btnDesvincular = document.getElementById('btn-desvincular-qr');
        
        uiSaldo.innerText = `$${obtenerSaldo()}`;
        
        if (datos.id) {
            // 🔒 ESTADO: TARJETA VINCULADA
            uiIdTarjeta.innerText = `ID: ${datos.id}`;
            selectTipoTarjeta.value = datos.tipo; // Forzamos a mostrar el tipo real guardado
            selectTipoTarjeta.disabled = true;    // Bloqueamos el selector para evitar cambios accidentales
            
            if (btnEscanear) btnEscanear.style.display = 'none';
            if (btnDesvincular) btnDesvincular.style.display = 'inline-block';
        } else {
            // 🔓 ESTADO: SIN VINCULAR (Libre)
            uiIdTarjeta.innerText = 'ID: SIN VINCULAR';
            selectTipoTarjeta.disabled = false;   // Desbloqueamos el selector
            
            if (btnEscanear) btnEscanear.style.display = 'inline-block';
            if (btnDesvincular) btnDesvincular.style.display = 'none';
        }
        
        // Pintamos la tarjeta basándonos en el selector
        const tipoActual = selectTipoTarjeta.value;
        tarjetaUI.style.background = coloresTarjeta[tipoActual];
        tarjetaUI.style.boxShadow = `0 15px 35px ${coloresTarjeta[tipoActual].split(',')[1].trim()}66`;
        etiquetaTipo.innerText = selectTipoTarjeta.options[selectTipoTarjeta.selectedIndex].text;
    }

    // Al arrancar, pintamos
    actualizarInterfazTarjeta();

    // Si cambian el select (solo funcionará si no hay tarjeta vinculada)
    selectTipoTarjeta.addEventListener('change', actualizarInterfazTarjeta);

    // --- LÓGICA DE DESVINCULAR ---
    const btnDesvincular = document.getElementById('btn-desvincular-qr');
    if (btnDesvincular) {
        btnDesvincular.addEventListener('click', () => {
            if (confirm("¿Seguro que quieres desvincular tu tarjeta actual?")) {
                desvincularTarjetaQR();
                selectTipoTarjeta.value = 'general'; // Regresamos por defecto a general
                actualizarInterfazTarjeta();
            }
        });
    }

    // Al arrancar, pintamos la tarjeta FORZANDO los datos guardados en memoria
    actualizarInterfazTarjeta(true);

    // Si el usuario cambia el select, SOLO actualizamos colores para previsualizar (no forzamos memoria)
    selectTipoTarjeta.addEventListener('change', () => actualizarInterfazTarjeta(false));

    // Al arrancar, pintamos la tarjeta
    actualizarInterfazTarjeta();

    // Si cambian el select, actualizamos el color en vivo
    selectTipoTarjeta.addEventListener('change', actualizarInterfazTarjeta);

    // --- LÓGICA DEL ESCÁNER QR ---
    const btnEscanear = document.getElementById('btn-escanear-qr');
    const btnCerrarEscaner = document.getElementById('btn-cerrar-escaner');
    const contenedorEscaner = document.getElementById('contenedor-escaner');
    let scannerH5 = null;

if (btnEscanear) {
        btnEscanear.addEventListener('click', () => {
            // Aseguramos que el contenedor esté limpio antes de empezar
            document.getElementById('lector-qr').innerHTML = "";
            contenedorEscaner.style.display = 'block';
            btnEscanear.style.display = 'none';

            // Inicialización limpia
            scannerH5 = new Html5Qrcode("lector-qr");
            
            const config = { 
                fps: 10, 
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0 
            };

            scannerH5.start(
                { facingMode: "environment" }, 
                config,
                (decodedText) => {
                    // ÉXITO AL ESCANEAR
                    scannerH5.stop().then(() => {
                        contenedorEscaner.style.display = 'none';
                        btnEscanear.style.display = 'inline-block';
                        
                        const tipoSeleccionado = selectTipoTarjeta.value;
                        vincularTarjetaQR(decodedText, tipoSeleccionado);
                        actualizarInterfazTarjeta();
                        
                        alert(`✅ ¡Tarjeta vinculada!\nID: ${decodedText}`);
                    }).catch(err => console.error("Error al detener:", err));
                },
                (errorMessage) => { /* Silenciar errores de escaneo continuo */ }
            ).catch(err => {
                console.error("Error crítico de cámara:", err);
                alert("No se pudo acceder a la cámara. Asegúrate de dar permisos en el navegador o en los ajustes del celular.");
                contenedorEscaner.style.display = 'none';
                btnEscanear.style.display = 'inline-block';
            });
        });
    }

// ... (aquí arriba está el código de scannerH5.start) ...

    if (btnCerrarEscaner) {
        btnCerrarEscaner.addEventListener('click', () => {
            if (scannerH5) {
                scannerH5.stop().catch(e => console.log(e));
            }
            contenedorEscaner.style.display = 'none';
            btnEscanear.style.display = 'inline-block';
        });
    }

    // ----------------------------------------------------
    // ⬇️⬇️ CONECTAR LOS BOTONES DE SALDO (SIN EL DE PRUEBA) ⬇️⬇️
    // ----------------------------------------------------
    const btnRecargarDemo = document.getElementById('btn-recargar-demo');
    const btnFijarSaldo = document.getElementById('btn-fijar-saldo');

    if (btnRecargarDemo) {
        btnRecargarDemo.addEventListener('click', () => {
            recargarSaldo(50);
            actualizarInterfazTarjeta(); // Actualiza los números en la UI
            alert("✅ ¡Se sumaron $50 MXN a tu tarjeta!");
        });
    }

    if (btnFijarSaldo) {
        btnFijarSaldo.addEventListener('click', () => {
            const cantidad = prompt("¿Cuál es el saldo real actual de tu tarjeta física? (ej. 120.50):");
            if (cantidad !== null && !isNaN(cantidad) && cantidad.trim() !== "") {
                fijarSaldo(cantidad);
                actualizarInterfazTarjeta();
                alert(`✅ Saldo actualizado a $${parseFloat(cantidad).toFixed(2)}`);
            }
        });
    }
    // ⬆️⬆️ FIN MONEDERO Y ESCÁNER ⬆️⬆️

}); // <-- FIN DEL DOMCONTENTLOADED

// --- 5. LÓGICA DE LA APP (EVENT HANDLERS) ---

// ⬇️ MODIFICADO (BUG 1): Esta función ahora es llamada por 'iniciarWatchLocation' ⬇️
function handleInitialLocation(pos) {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    
    if (lat === 0 && lon === 0) {
        console.error("Posición GPS inválida (0,0) detectada.");
        // Solo mostramos error si es la primera vez (para no ser molestos)
        if (!ubicacionInicialFijada) {
            handleLocationError({ code: 0, message: "Posición GPS inválida (0,0)" });
            inputInicio.value = "Error de GPS (0,0)";
        }
        return;
    }

    puntoInicio = turf.point([lon, lat]); // Guardamos el punto GPS real (siempre se actualiza)
    paraderoInicioCercano = encontrarParaderoMasCercano(puntoInicio); // ⬅️ FIJAMOS EL INICIO (siempre se actualiza)
    
    // Actualizamos el input de texto (siempre)
    inputInicio.value = `Cerca de "${paraderoInicioCercano.properties.nombre}"`;
    inputInicio.style.fontStyle = 'normal';
    inputInicio.style.color = 'black';
    inputInicio.style.fontWeight = 'normal';
    
    // Solo centramos el mapa y abrimos el popup LA PRIMERA VEZ
    if (!ubicacionInicialFijada) {
        ubicacionInicialFijada = true; // Marcamos que ya fijamos la vista
        map.setView([lat, lon], 16);
        const marker = crearMarcadorUsuario([lat, lon]);
        marker.bindPopup("<b>Estás aquí</b>").openPopup();
    }
}

// ⬇️ MODIFICADO: Ahora el HTML se inserta en 'panel-instrucciones' ⬇️
function handleLocationError(err) {
    console.warn(`ERROR DE UBICACIÓN (${err.code}): ${err.message}`);
    
    // Actualizar el input de "Autodetección" para mostrar el error
    inputInicio.value = "Ubicación bloqueada";
    inputInicio.style.color = "red";
    inputInicio.style.fontWeight = "bold";

    // Determinar el mensaje de error
    let titulo = 'GPS bloqueado o desactivado';
    let texto = 'Parece que tu navegador (como el de Facebook) bloquea la geolocalización o el permiso fue denegado.';
    
    if (err.code === 2) { // POSITION_UNAVAILABLE
        titulo = 'GPS no disponible';
        texto = 'No pudimos obtener una señal de GPS. Revisa que tu ubicación esté encendida.';
    } else if (err.code === 0 || err.message === "Posición GPS inválida (0,0)") {
        titulo = 'Error de GPS';
        texto = 'Tu GPS reportó una ubicación inválida (0,0). Intenta moverte a un área con mejor señal.';
    }

    // Mostrar el panel de opciones manuales
    instruccionesEl.innerHTML = `
        <div class="alerta-manual">
            <h5 style="margin-top:0;">${titulo}</h5>
            <p>${texto}</p>
            <p><strong>Soluciones:</strong></p>
            <div class="alerta-manual-botones">
                <button id="btnModoManual" class="btn-alerta btn-primario">
                    📍 Usar Modo Manual
                </button>
                <button id="btnCopiarLink" class="btn-alerta btn-secundario">
                    📋 Copiar Link
                </button>
            </div>
            <small style="display: block; margin-top: 10px; text-align: center;">
                (Puedes copiar el link y pegarlo en Chrome o Safari)
            </small>
        </div>
    `;

    // Añadir listeners a los nuevos botones
    document.getElementById('btnModoManual').addEventListener('click', activarModoManual);
    document.getElementById('btnCopiarLink').addEventListener('click', copiarLink);
}

// ⬇️ MODIFICADO: Ahora el HTML se inserta en 'panel-instrucciones' ⬇️
function activarModoManual() {
    console.log("Activando modo manual");
    
    // Ocultar el input de GPS y mostrar el dropdown manual
    if (controlInputInicio) controlInputInicio.style.display = 'none';
    if (controlSelectInicio) controlSelectInicio.style.display = 'block';

    // Actualizar instrucciones
    instruccionesEl.innerHTML = `
        <p>Has activado el modo manual.</p>
        <p>1. Selecciona tu <strong>paradero de inicio</strong>.</p>
        <p>2. Selecciona tu <strong>paradero de destino</strong>.</p>
    `;
    
    // Limpiar la variable de inicio. El usuario DEBE seleccionar uno.
    paraderoInicioCercano = null; 
    puntoInicio = null; // ⬅️ Aseguramos que no haya GPS
}

function copiarLink() {
    try {
        navigator.clipboard.writeText(window.location.href);
        alert('¡Link copiado al portapapeles!\n\nPégalo en un navegador como Chrome, Safari o Firefox para un mejor funcionamiento.');
    } catch (err) {
        console.error('Error al copiar link:', err);
        alert('No se pudo copiar el link. Por favor, hazlo manualmente desde la barra de direcciones.');
    }
}

function initChoicesSelect() {
    // 1. Inicializamos Choices LIMPIO
    if (choicesDestino) choicesDestino.destroy();
    
    choicesDestino = new Choices(selectDestino, {
        choices: [], // Arrancamos vacíos
        itemSelectText: 'Ir aquí',
        searchPlaceholderValue: 'Escribe un lugar (ej. Walmart, Centro)...',
        shouldSort: false,
        searchResultLimit: 20,
        noResultsText: 'Escribe para buscar...',
        loadingText: 'Cargando...',
    });
    window.choicesDestino = choicesDestino;

    let ultimoTextoBuscado = "";
    
    // Referencia al loader HTML
    const loaderEl = document.getElementById('loader-busqueda');

 // ... dentro de initChoicesSelect ...

// 2. EVENTO DE BÚSQUEDA (Con Loader, Alerta y MODO OFFLINE)
const buscadorInternet = debounce(async (event) => {
    const texto = event.detail.value;
    
    if (!texto || texto.length < 2) return; // Bajamos a 2 letras para búsqueda local
    
    // ⬇️ NUEVO: Detección de Internet
    const isOnline = navigator.onLine; 
    
    // Loader visual
    const loaderEl = document.getElementById('loader-busqueda');
    if (loaderEl) loaderEl.classList.remove('oculto');

    try {
        let nuevasOpciones = [];

        if (isOnline) {
            // --- MODO ONLINE (Tu código actual) ---
            console.log(`🌐 Buscando online: '${texto}'`);
            const resultados = await buscarLugarEnNominatim(texto);
            
            if (resultados && resultados.length > 0) {
                nuevasOpciones = resultados.map((lugar, index) => ({
                    value: `ext_${lugar.lat}_${lugar.lng}_${index}`, 
                    label: `📍 ${lugar.nombre}`, 
                    customProperties: { fullData: lugar }
                }));
            }

        } else {
            // --- ⬇️ MODO OFFLINE (Nuevo) ---
            console.log(`📴 Buscando offline en paraderos: '${texto}'`);
            
            // Usamos la variable global 'todosLosParaderos' que ya cargaste al inicio
            const resultadosLocales = buscarEnDatosLocales(texto, todosLosParaderos);

            if (resultadosLocales.length > 0) {
                nuevasOpciones = resultadosLocales.map(item => ({
                    // Usamos el ID interno directamente
                    value: item.id.toString(), 
                    label: `🚏 ${item.nombre}`,
                    customProperties: { esLocal: true } 
                }));
            }
            
            // 💡 AGREGAMOS EL TIP EDUCATIVO AL FINAL DE LA LISTA
            nuevasOpciones.push({
                value: 'tip_offline',
                label: '💡 Tip: Sin internet, mantén presionado el mapa para elegir destino',
                disabled: true,
                customProperties: { tipo: 'aviso' }
            });
        }

        // --- Manejo de "Sin resultados" (Común) ---
        if (nuevasOpciones.length === 0 || (nuevasOpciones.length === 1 && nuevasOpciones[0].value === 'tip_offline')) {
            nuevasOpciones.unshift({
                value: 'no_found',
                label: isOnline ? `🚫 Nada encontrado para "${texto}"` : `🚫 Ningún paradero llamado "${texto}"`,
                disabled: true
            });
        }

        // Actualizar Choices
        choicesDestino.setChoices(nuevasOpciones, 'value', 'label', true); 

    } catch (e) {
        console.error("Error buscando:", e);
    } finally {
        if (loaderEl) loaderEl.classList.add('oculto');
    }

}, 1200); // Un debounce un poco más rápido se siente mejor offline

selectDestino.addEventListener('search', buscadorInternet);

// 3. MANEJO DE SELECCIÓN (ACTUALIZADO PARA SOPORTAR PARADEROS LOCALES)
selectDestino.addEventListener('change', (event) => {
    const valor = event.detail.value;

    // Caso A: Resultado de Internet (Nominatim)
    if (valor.startsWith('ext_')) {
        const opcion = choicesDestino._store.choices.find(c => c.value === valor);
        if (opcion && opcion.customProperties.fullData) {
            procesarSeleccionLugar(opcion.customProperties.fullData);
        }
    } 
    // ⬇️ NUEVO: Caso B: Resultado Local (Paradero existente)
    else {
        // Si el valor es un número (índice del paradero)
        const indexParadero = parseInt(valor);
        if (!isNaN(indexParadero)) {
            const paraderoSeleccionado = todosLosParaderos.find(p => p.properties.originalIndex === indexParadero);
            
            if (paraderoSeleccionado) {
                console.log("Seleccionado paradero offline:", paraderoSeleccionado.properties.nombre);
                
                // Asignamos destino
                paraderoFin = paraderoSeleccionado;
                
                // Disparamos la lógica de ruta (igual que en el clic derecho)
                if (paraderoInicioCercano) {
                    listaDePlanes = encontrarRutaCompleta(paraderoInicioCercano, paraderoFin, todosLosParaderos, todasLasRutas, mapRutaParaderos);
                    mostrarPlanes(listaDePlanes);
                    abrirPanelControl();
                } else {
                    // Si no hay inicio, centramos el mapa en el paradero
                    const coords = paraderoFin.geometry.coordinates;
                    map.setView([coords[1], coords[0]], 16);
                    L.marker([coords[1], coords[0]], {icon: iconoDestino})
                     .addTo(marcadores)
                     .bindPopup(`<b>${paraderoFin.properties.nombre}</b><br>Destino seleccionado`).openPopup();
                     
                    instruccionesEl.innerHTML = '<p>Destino fijado. Esperando ubicación o selecciona inicio manual.</p>';
                }
            }
        }
    }
});
}

function initChoicesSelectInicioManual() {
    if (!selectInicioManual) return; // Salir si el HTML no está listo

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

    choicesInicioManual = new Choices(selectInicioManual, {
        choices: choicesData,
        itemSelectText: 'Seleccionar',
        searchPlaceholderValue: 'Escribe paradero, calle o colonia...',
        shouldSort: false,
        removeItemButton: true,
        searchFields: ['label', 'customProperties.calle', 'customProperties.colonia'],
        
// ... dentro de initChoicesSelectInicioManual ...

        callbackOnCreateTemplates: function(template) {
            return {
                item: ({ classNames }, data) => {
                    // ⬇️⬇️ CORRECCIÓN ⬇️⬇️
                    const props = data.customProperties || {}; 
                    const subtext = props.calle || props.colonia || '';
                    // ⬆️⬆️ FIN DE LA CORRECCIÓN ⬆️⬆️
                    
                    return template(
                        `<div class="${classNames.item} ${data.highlighted ? classNames.highlightedState : classNames.itemSelectable}" data-item data-value="${data.value}" ${data.active ? 'aria-selected="true"' : ''} ${data.disabled ? 'aria-disabled="true"' : ''}>
                            <span>${data.label}</span>
                            <small>${subtext}</small> </div>`
                    );
                },
                choice: ({ classNames }, data) => {
                    // ⬇️⬇️ CORRECCIÓN (Aplicada también aquí por seguridad) ⬇️⬇️
                    const props = data.customProperties || {};
                    const subtext = props.calle || props.colonia || '';
                    // ⬆️⬆️ FIN DE LA CORRECCIÓN ⬆️⬆️

                    return template(
                        `<div class="${classNames.item} ${classNames.itemChoice} ${data.disabled ? classNames.itemDisabled : classNames.itemSelectable}" data-select-text="${this.config.itemSelectText}" data-choice ${data.disabled ? 'data-choice-disabled aria-disabled="true"' : 'data-choice-selectable'}" data-id="${data.id}" data-value="${data.value}" ${data.groupId > 0 ? 'role="treeitem"' : 'role="option"'}>
                            <span>${data.label}</span>
                            <small>${subtext}</small> </div>`
                    );
                },
            };
        }
    });
    
    // ... resto de la función ...
    // Event listener para CUANDO SE SELECCIONA UN INICIO MANUAL
    selectInicioManual.addEventListener('change', (event) => {
        const inicioIndex = event.detail.value;
        if (inicioIndex) {
            // ⬅️ FIJAMOS EL INICIO MANUALMENTE
            paraderoInicioCercano = todosLosParaderos.find(p => p.properties.originalIndex == inicioIndex);
            console.log("Inicio manual fijado:", paraderoInicioCercano.properties.nombre);
            
            // Si ya hay un destino, recalcular la ruta
            if (paraderoFin) {
                // ⬇️⬇️ CORRECCIÓN 1: Se usa "paraderoInicioCercano" (el paradero manual) ⬇️⬇️
                // Esto asegura que se use el paradero manual aunque el GPS esté activo.
                const puntoDePartida = paraderoInicioCercano; 
                
                // ⬇️⬇️ CORRECCIÓN 2: Se pasa "todosLosParaderos" a la función ⬇️⬇️
                listaDePlanes = encontrarRutaCompleta(puntoDePartida, paraderoFin, todosLosParaderos, todasLasRutas, mapRutaParaderos);
                mostrarPlanes(listaDePlanes);
            }
        }
    });
}


// js/app.js

function cambiarModo(modo) {
    console.log("Cambiando a modo:", modo);
    
    // 1. Definir referencias a pantallas nuevas (por seguridad las buscamos aquí)
    const pantallaSaldo = document.getElementById('pantalla-saldo');
    const pantallaRecargas = document.getElementById('pantalla-recargas');

    // 2. Ocultar TODAS las pantallas especiales y paneles primero
    if(pantallaSaldo) pantallaSaldo.classList.add('oculto');
    if(pantallaRecargas) pantallaRecargas.classList.add('oculto');
    
    // Ocultamos paneles de mapa
    panelViaje.classList.add('oculto');
    panelExplorar.classList.add('oculto');
    panelReporte.classList.add('oculto');
    
    // 3. Lógica específica por modo
    if (modo === 'saldo') {
        panelControl.classList.add('oculto'); 
        panelNavegacion.classList.add('oculto'); 
        if(pantallaSaldo) pantallaSaldo.classList.remove('oculto');
    } 
    else if (modo === 'recargas') {
        panelControl.classList.add('oculto');
        panelNavegacion.classList.add('oculto');
        if(pantallaRecargas) pantallaRecargas.classList.remove('oculto');
    } 
    else {
        // --- Modos de Mapa (Viaje, Explorar, Reporte) ---
        
        // Verificamos si la navegación está activa (usando variable global watchId)
        const enNavegacion = (watchId !== null);
        
        if (enNavegacion && modo === 'viaje') {
             // Si navega y pulsa "Viaje", ve el panel de navegación
             panelControl.classList.add('oculto');
             panelNavegacion.classList.remove('oculto');
        } else {
             // Si no, ve el panel flotante normal
             panelControl.classList.remove('oculto');
             if(panelNavegacion) panelNavegacion.classList.add('oculto');
        }

        if (modo === 'viaje') {
            panelViaje.classList.remove('oculto');
            // Nota: Ya no llamamos a limpiarMapa() automáticamente al cambiar tab,
            // para no borrar la ruta si el usuario solo cambiaba de vista momentáneamente.
        } else if (modo === 'explorar') {
            panelExplorar.classList.remove('oculto');
        } else if (modo === 'reporte') {
            panelReporte.classList.remove('oculto');
        }
    }

    // 4. Actualizar visualmente la barra inferior (Iconos rellenos vs línea)
    document.querySelectorAll('.nav-item').forEach(item => {
        const icon = item.querySelector('i');
        if (item.dataset.target === modo) {
            item.classList.add('activo');
            if(icon && icon.className.includes('-line')) {
                icon.className = icon.className.replace('-line', '-fill');
            }
        } else {
            item.classList.remove('activo');
            if(icon && icon.className.includes('-fill')) {
                icon.className = icon.className.replace('-fill', '-line');
            }
        }
    });

    // 5. Re-evaluar alertas
    actualizarDisplayAlertas();
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
    actualizarDisplayAlertas(); 

    // ⏱️ Generamos una lista bonita con los contenedores de ETA
    let html = `
        <p>Mostrando ruta <strong>${ruta.properties.id}</strong>.</p>
        <ul style="padding-left: 20px; max-height: 40vh; overflow-y: auto; font-size: 0.95em;">
    `;
    paraderosArray.forEach(p => {
        const pid = p.properties.originalIndex;
        html += `<li style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                    ${p.properties.nombre}
                    <div class="eta-live-badge eta-contenedor-${pid}"></div>
                 </li>`;
    });
    html += `</ul>`;
    instruccionesExplorarEl.innerHTML = html;

    // Pasamos el array de paraderos al radar
    iniciarEscuchaBuses(rutaId, null, paraderosArray); 
}

// ⬇️ MODIFICADO: Ahora el HTML se inserta en 'panel-instrucciones' ⬇️
function limpiarMapa() {
    window.unidadAbordadaViajeActual = null;
    dibujarPlan([]);
    limpiarCapasDeRuta();
    actualizarDisplayAlertas(); // ⬅️ AÑADIDA
    marcadores.clearLayers(); // ⬅️ ¡AÑADE ESTA LÍNEA!
    detenerEscuchaBuses(); // ⬅️ AÑADE ESTA LÍNEA

    // ⬇️⬇️ CORRECCIÓN AÑADIDA ⬇️⬇️
    // Esto resetea el texto del panel de "Opciones de ruta"
    instruccionesEl.innerHTML = '<p>Selecciona tu destino para ver la ruta.</p>';
    actualizarPanelDeInicio();
    // ⬆️⬆️ FIN DE LA CORRECCIÓN ⬆️⬆️

    // --- RESETEAR NAVEGACIÓN ---
    panelNavegacion.classList.add('oculto');
    document.getElementById('nav-estado').style.display = 'flex'; 
    tiempoEsperaEl.className = ''; // ⬅️ AÑADE ESTA LÍNEA (resetea el color)
    stopNavigation(); 
    detenerWatchLocation(watchId); // ⬅️ Detiene el watch de NAVEGACIÓN
    
    if (choicesDestino) {
        choicesDestino.clearInput();
        choicesDestino.removeActiveItems();
    }

    // ⬇️ Resetear UI de Modo Manual ⬇️
    if (controlSelectInicio) controlSelectInicio.style.display = 'none';
    if (controlInputInicio) controlInputInicio.style.display = 'block'; 

    if (choicesInicioManual) {
        choicesInicioManual.clearInput();
        choicesInicioManual.removeActiveItems();
    }
    // ⬆️ Fin Reseteo UI ⬆️// js/app.js (en la función limpiarMapa)

// ... (inicio de limpiarMapa) ...

    // --- RESETEAR UI DE SELECTORES (Choices.js) ---
    // ⬇️ La limpieza es ahora más segura y centralizada para evitar bugs ⬇️
    if (choicesDestino) {
        choicesDestino.clearInput();
        choicesDestino.removeActiveItems();
    }
    if (choicesInicioManual) {
        choicesInicioManual.clearInput();
        choicesInicioManual.removeActiveItems();
    }
    if (choicesRuta) {
        choicesRuta.clearInput();
        choicesRuta.removeActiveItems();
    }
    
    // Resetear UI de Modo Manual/GPS
    if (controlSelectInicio) controlSelectInicio.style.display = 'none';
    if (controlInputInicio) controlInputInicio.style.display = 'block'; 

    btnIniciarRuta.style.display = 'none';
    btnLimpiar.style.display = 'none';
    
    // --- RESETEAR MODO EXPLORAR ---
    instruccionesExplorarEl.innerHTML = "Selecciona una ruta para ver su trayecto y paraderos.";
    
    // --- RESETEAR NAVEGACIÓN (Visual y Variables) ---
    panelNavegacion.classList.add('oculto');
    document.getElementById('nav-estado').style.display = 'flex'; // Resetea el panel de nav
    tiempoEsperaEl.className = ''; 
    stopNavigation();
    
    // ❗️ IMPORTANTE: Solo detener el watch de navegación (watchId), NO el inicial.
    detenerWatchLocation(watchId); 
    watchId = null; // ⬅️ Aseguramos que el estado de navegación es nulo
    
    // --- RESETEAR UBICACIÓN ---
    // ⬇️ Lógica modificada ⬇️
    if (puntoInicio) {
        // Si el GPS funcionó (y sigue funcionando), lo restauramos
        paraderoInicioCercano = encontrarParaderoMasCercano(puntoInicio);
        inputInicio.value = `Cerca de "${paraderoInicioCercano.properties.nombre}"`;
        inputInicio.style.color = "black";
        inputInicio.style.fontWeight = "normal";
        const coords = puntoInicio.geometry.coordinates;
        map.setView([coords[1], coords[0]], 16);
        crearMarcadorUsuario([coords[1], coords[0]]).bindPopup("<b>Estás aquí</b>").openPopup();
    } else {
        // Si el GPS NUNCA funcionó, reseteamos
        paraderoInicioCercano = null;
        inputInicio.value = "Detectando ubicación...";
        inputInicio.style.color = "black";
        inputInicio.style.fontWeight = "normal";
        // El watch de ubicación general (iniciarWatchLocation) sigue corriendo, no
        // necesitamos llamarlo de nuevo.
    }
    // ⬆️ Fin lógica modificada ⬆️
}

// --- 6. LÓGICA DE NAVEGACIÓN (UI) ---

function mostrarPlanes(planes) {
    instruccionesEl.innerHTML = ''; // Limpia el panel
    marcadores.clearLayers();     // ⬅️ Limpia marcadores viejos
    limpiarCapasDeRuta();         // ⬅️ Limpia líneas de ruta viejas
    
    const puntoDePartida = puntoInicio || paraderoInicioCercano;
    if (!puntoDePartida) {
        instruccionesEl.innerHTML = `<p><strong>Error:</strong> No se ha fijado un punto de inicio.</p>`;
        return;
    }
    
    // 1. DIBUJAR MARCADOR DE USUARIO ("Estás aquí")
    const inicioCoords = puntoDePartida.geometry.coordinates;
    L.marker([inicioCoords[1], inicioCoords[0]])
     .addTo(marcadores)
     .bindPopup(puntoInicio ? "<b>Estás aquí</b>" : `<b>Inicio (Manual):</b><br>${paraderoInicioCercano.properties.nombre}`);

    // 2. DIBUJAR MARCADOR DE DESTINO FINAL
    const finCoords = paraderoFin.geometry.coordinates; // Esto es [Lng, Lat]
    
    // ⬇️ ¡CORRECCIÓN! Invertimos las coordenadas para Leaflet
    const finLatLng = [finCoords[1], finCoords[0]]; 
    
    const popupDestino = crearPopupInteligente(paraderoFin, "Destino Final");
    L.marker(finLatLng, { icon: iconoDestino }) // ⬅️ Usamos las coords corregidas
     .addTo(marcadores)
     .bindPopup(popupDestino);


    if (!planes || planes.length === 0) {
        // ... (código de error)
        return;
    }

    // 3. DIBUJAR MARCADORES DEL PLAN (INICIO Y TRANSBORDOS)
    // (Solo dibujamos los del primer plan para la vista previa)
    const planEjemplo = planes[0];
    const pasosBus = planEjemplo.filter(paso => paso.tipo === 'bus');

    // 3A. Paradero de Inicio (Subida)
    const pasoInicio = planEjemplo.find(p => p.tipo === 'caminar');
    if (pasoInicio) {
        const paraderoInicio = pasoInicio.paradero;
        const pCoords = paraderoInicio.geometry.coordinates;
        const pLatLng = [pCoords[1], pCoords[0]];
        const popupInicio = crearPopupInteligente(paraderoInicio, "Subir aquí");
        L.marker(pLatLng, { icon: iconoParadero }) // ⬅️ Icono Azul
         .addTo(marcadores)
         .bindPopup(popupInicio);
    }

    // 3B. Paraderos de Transbordo
    for (let i = 0; i < pasosBus.length - 1; i++) {
        const paraderoDeTransbordo = pasosBus[i].paraderoFin; 
        const coords = paraderoDeTransbordo.geometry.coordinates;
        const latLng = [coords[1], coords[0]];
        const popup = crearPopupInteligente(paraderoDeTransbordo, "Transbordo Aquí");
        L.marker(latLng, { icon: iconoTransbordo }) // ⬅️ Icono Naranja
         .addTo(marcadores)
         .bindPopup(popup);
    }

    // 4. CREAR EL HTML DEL PANEL
    const fragment = document.createDocumentFragment();
    // ... (el resto del código que crea el HTML sigue igual)
    const header = document.createElement('p');
    header.innerHTML = `<strong>Se encontraron ${planes.length} opciones:</strong>`;
    fragment.appendChild(header);
    
planes.forEach((plan, index) => {
        const opcionDiv = document.createElement('div');
        opcionDiv.className = 'opcion-ruta';
        
        const numBuses = plan.filter(p => p.tipo === 'bus').length;
        const estimacion = calcularCostoEstimado(numBuses); // ⬅️ Recibe el objeto
        const buses = plan.filter(p => p.tipo === 'bus').map(p => p.ruta.properties.id);
        
        const opcionHeader = document.createElement('h4');
        
        // 🚀 MAGIA VISUAL: Si trae viaje previo, le ponemos un letrerito amarillo
        const badgeTransbordo = estimacion.aplicaTransbordoActivo 
            ? '<div style="font-size:0.65em; background:#ffc107; color:#856404; padding:3px 8px; border-radius:10px; margin-bottom:4px; text-transform:uppercase; font-weight:bold; width:max-content; margin-left:auto;">Transbordo Activo</div>' 
            : '';

        opcionHeader.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span>Opción ${index + 1} <br><span style="font-weight:normal; font-size: 0.8em; color: #666;">(${buses.join(' &rarr; ')})</span></span>
                <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
                    ${badgeTransbordo}
                    <span style="background:#e8f5e9; color:#1b5e20; padding:6px 10px; border-radius:12px; font-size:0.9em; font-weight:bold; border:1px solid #c8e6c9;">
                        $${estimacion.costoTotal.toFixed(2)}
                    </span>
                </div>
            </div>
        `;
        opcionDiv.appendChild(opcionHeader);
        // ... (el resto del bucle sigue igual, creando el <ol> y el botón seleccionar) ...
        
        const listaOL = document.createElement('ol');
        plan.forEach(paso => {
            if (paso.tipo === 'caminar' || paso.tipo === 'bus') {
                const li = document.createElement('li');
                li.textContent = paso.texto; // <-- ¡El texto ya tiene la distancia/tiempo!
                listaOL.appendChild(li);
            }
        });
        opcionDiv.appendChild(listaOL);
        
        const btnSeleccionar = document.createElement('button');
        btnSeleccionar.className = 'btn-seleccionar';
        // Usamos innerHTML para incluir el icono de Remix Icons
        btnSeleccionar.innerHTML = 'Seleccionar <i class="ri-arrow-right-line"></i>';
    
        btnSeleccionar.addEventListener('click', () => {
            seleccionarPlan(index);
        });
        
        opcionDiv.appendChild(btnSeleccionar);
        fragment.appendChild(opcionDiv);
    });
    // ... (fin del bucle)

    instruccionesEl.appendChild(fragment);
    
    // 5. DIBUJAR LÍNEAS DE RUTA
    dibujarPlan(planes); // ⬅️ ¡Ahora solo dibuja líneas!
    
    btnLimpiar.style.display = 'block';
    btnIniciarRuta.style.display = 'none'; 

}
// js/app.js

const seleccionarPlan = (indice) => {
    rutaCompletaPlan = listaDePlanes[indice];

    distanciaTotalRuta = 0;
    let puntoAnterior = puntoInicio || paraderoInicioCercano; 

    // ⬇️⬇️ INICIO DEL MÓDULO DE DISTANCIA/TIEMPO ⬇️⬇️
    // Este bucle ahora reemplaza al bucle anterior.
    rutaCompletaPlan.forEach(paso => {
        let distanciaPaso = 0;
        try {
            if (paso.tipo === 'caminar') {
                // 1. Calcular distancia del paso
                distanciaPaso = turf.distance(puntoAnterior, paso.paradero, { units: 'meters' });
                distanciaTotalRuta += distanciaPaso; // Sumar al total
                puntoAnterior = paso.paradero; // Actualizar el punto de anclaje

                // 2. Enriquecer el paso (Módulo de Tiempo/Distancia)
                const tiempoPaso = Math.max(1, Math.round(distanciaPaso / 80)); // 80m/min, mínimo 1 min
                paso.distanciaMetros = distanciaPaso;
                paso.tiempoEstimadoMin = tiempoPaso;
                // 3. ¡Actualizar el texto que verá el usuario!
                paso.texto = `Dirígete a ${paso.paradero.properties.nombre} (${distanciaPaso.toFixed(0)} m - ${tiempoPaso} min 🚶‍♂️)`;

            } else if (paso.tipo === 'bus') {
                // 1. Calcular distancia del paso
                
                // ⬇️⬇️ CORRECCIÓN: "Aplanar" rutas MultiLineString ⬇️⬇️
                let rutaGeometria = paso.ruta; // Por defecto usamos la original

                // Si la ruta es compleja (MultiLineString), la convertimos a simple
                if (paso.ruta.geometry.type === 'MultiLineString') {
                    try {
                        // Unimos todos los fragmentos de la ruta en una sola línea continua
                        // (El método .flat() une los arrays de coordenadas)
                        const coordenadasUnidas = paso.ruta.geometry.coordinates.flat();
                        rutaGeometria = turf.lineString(coordenadasUnidas);
                    } catch (err) {
                        console.warn("No se pudo aplanar la ruta MultiLineString, usando cálculo simple.");
                    }
                }
                // ⬆️⬆️ FIN DE LA CORRECCIÓN ⬆️⬆️

                // Usamos 'rutaGeometria' (la versión corregida) para los cálculos
                const startOnLine = turf.nearestPointOnLine(rutaGeometria, paso.paraderoInicio);
                const endOnLine = turf.nearestPointOnLine(rutaGeometria, paso.paraderoFin);
                
                // Ahora lineSlice no fallará porque le pasamos una LineString segura
                const segmentoDeRuta = turf.lineSlice(startOnLine, endOnLine, rutaGeometria);
                
                distanciaPaso = turf.length(segmentoDeRuta, { units: 'meters' });
                distanciaTotalRuta += distanciaPaso; 
                puntoAnterior = paso.paraderoFin; 

                // 2. Enriquecer el paso
                paso.distanciaMetros = distanciaPaso;
                // 3. Actualizar texto
                paso.texto = `Toma ${paso.ruta.properties.id} y baja en ${paso.paraderoFin.properties.nombre} (${(distanciaPaso / 1000).toFixed(1)} km)`;
            
            } else if (paso.tipo === 'transbordo') {
                // (Opcional) Estandarizamos el texto del transbordo
                paso.texto = `En ${paso.paradero.properties.nombre}, espera el siguiente camión.`;
            }

        } catch (e) {
            console.error("Error calculando distancia del paso:", paso, e);
        }
    });
    // ⬆️⬆️ FIN DEL MÓDULO ⬆️⬆️

    console.log(`Distancia total de la ruta: ${distanciaTotalRuta} metros`);
    
    // (El resto de la función es idéntico y sigue creando los botones)
    const buses = rutaCompletaPlan.filter(p => p.tipo === 'bus').map(p => p.ruta.properties.id);
    const rutaResumen = buses.join(' → ');

    instruccionesEl.innerHTML = `
        <p><strong>Ruta seleccionada. ¡Listo para navegar!</strong></p>
        <p>${rutaResumen}</p>
        <p><strong>Distancia total:</strong> ${(distanciaTotalRuta / 1000).toFixed(2)} km</p>
        
        <div class="panel-acciones">
            <button id="btnIniciarRuta">Iniciar Ruta</button>
            <button id="btnGuardarFavorito" class="btn-secundario">⭐️ Guardar Favorito</button>
        </div>
    `;

    instruccionesEl.querySelector('#btnIniciarRuta').addEventListener('click', iniciarRutaProgresiva);
    
    instruccionesEl.querySelector('#btnGuardarFavorito').addEventListener('click', () => {
        handleGuardarFavoritoClick();
    });
    
    btnIniciarRuta.style.display = 'none'; 
    dibujarPlan([rutaCompletaPlan]);

    // 🚀 NUEVO: EL ESCÁNER DE VIAJE (PRE-FLIGHT CHECK)
    // Extraemos todas las rutas que el usuario va a necesitar
    const busesDelViaje = rutaCompletaPlan.filter(p => p.tipo === 'bus');
    const rutasIdsDelViaje = busesDelViaje.map(p => p.ruta.properties.id);
    
    if (rutasIdsDelViaje.length > 0) {
        // Le avisamos al motor cuáles rutas vamos a vigilar
        iniciarMotorInteligente(rutasIdsDelViaje);
        
        // Recopilamos los paraderos de subida para que también calcule los ETAs
        const paraderosSubida = busesDelViaje.map(p => p.paraderoInicio);
        
        // Disparamos el escuadrón multihilo
        iniciarEscuchaMultihilo(rutasIdsDelViaje, paraderosSubida);
    }
}

function encontrarParaderoMasCercano(punto) {
    return turf.nearestPoint(punto, paraderosCollection);
}

// --- 7. FUNCIONES DE NAVEGACIÓN ---

// ⬇️ MODIFICADO: Permite modo manual (sin GPS) ⬇️
// js/app.js

function iniciarRutaProgresiva() {
    if (!rutaCompletaPlan || rutaCompletaPlan.length === 0) return;

// ⬇️⬇️ NUEVO MÓDULO DE VERIFICACIÓN DE COSTOS ⬇️⬇️
    const numBuses = rutaCompletaPlan.filter(p => p.tipo === 'bus').length;
    if (numBuses > 0) {
        const estimacion = calcularCostoEstimado(numBuses);
        if (!checkSaldoParaRuta(estimacion.costoTotal)) {
            advertirSaldoInsuficiente(estimacion.costoTotal);
        }
    }
    // ⬆️⬆️ FIN DEL MÓDULO ⬆️⬆️

    // se guarde en la nube de Firebase, de lo contrario, puedes quitarla también.
    const user = getUsuario();
    
    if (!user) {
        if(confirm("Para guardar tus viajes favoritos y tu historial, inicia sesión con Google. ¿Deseas hacerlo ahora?")) {
            iniciarSesion();
            return;
        }
        // Si dice que no, igual lo dejamos usar el GPS como invitado libre.
    }

    // ⬇️⬇️ INICIO DEL NUEVO MÓDULO DE HISTORIAL ⬇️⬇️
    try {
        const rutaResumen = rutaCompletaPlan.filter(p => p.tipo === 'bus').map(p => p.ruta.properties.id).join(' → ');

        const itemHistorial = {
            inicioId: paraderoInicioCercano.properties.originalIndex,
            inicioNombre: paraderoInicioCercano.properties.nombre,
            finId: paraderoFin.properties.originalIndex,
            finNombre: paraderoFin.properties.nombre,
            rutaResumen: rutaResumen,
            fecha: new Date().toISOString()
        };
        guardarEnHistorial(itemHistorial);

    } catch (e) {
        console.error("Error al guardar en el historial:", e);
    }
    // ⬆️⬆️ FIN DEL MÓDULO (CORREGIDO) ⬆️⬆️
    // Configuración común para ambos modos
    pasoActual = 0;
    alertaMostrada = false;
    panelControl.classList.add('oculto'); 
    panelNavegacion.classList.remove('oculto');
    
    // Comprobamos si el GPS está activo (si puntoInicio fue fijado)
    if (puntoInicio) {
        // --- MODO GPS (ACTIVO) ---
        console.log("Iniciando modo de navegación GPS (Activo)...");
        detenerWatchLocation(initialWatchId);
        // Mostramos los contadores de tiempo real
        document.getElementById('nav-estado').style.display = 'flex'; 
        
        // Iniciamos los servicios de GPS
        crearMarcadorUsuario(puntoInicio.geometry.coordinates.slice().reverse());
        startNavigation(puntoInicio); 
        // ❗️Importante: El 'watchId' global ya está corriendo (Bug 1).
        // Lo re-asignamos a 'watchId' de navegación y cambiamos su callback.
        // (Esto asume que 'iniciarWatchLocation' detiene el anterior si existe,
        // o que 'locationService' maneja un solo watchId. Para ser seguros,
        // cambiamos el callback en 'locationService' o lo manejamos aquí)
        // Por simplicidad, asumimos que 'iniciarWatchLocation' es el mismo watch.
        watchId = iniciarWatchLocation(handleLocationUpdate, handleLocationError); // ⬅️ Asignamos el watch a la NAVEGACIÓN
        map.on('dragstart', () => { autoCentrar = false; });

    } else {
        // --- MODO MANUAL (PASIVO) ---
        console.log("Iniciando modo de navegación MANUAL (Pasivo)...");
        
        // Ocultamos los contadores de tiempo real (no hay GPS)
        document.getElementById('nav-estado').style.display = 'none'; 
        
        watchId = null; // No hay GPS
        autoCentrar = true; 
    }
    llamarEscuchaParaPaso(pasoActual);
    // Mostramos el primer paso para ambos modos
    mostrarPaso(pasoActual);
}

// js/app.js (en la función finalizarRuta)

function finalizarRuta() {
    console.log("Finalizando navegación.");
    panelNavegacion.classList.add('oculto'); 
    panelControl.classList.remove('oculto');
    map.off('dragstart');
    
    // ⬇️ LÍNEAS MODIFICADAS ⬇️
    // 1. Reiniciar el watcher inicial (si estaba corriendo)
    if (initialWatchId) {
        detenerWatchLocation(initialWatchId);
    }
    initialWatchId = iniciarWatchLocation(handleInitialLocation, handleLocationError);    
    // 2. Limpiar el mapa (la función limpiarMapa se encarga de detener 'watchId' y 'stopNavigation')
    limpiarMapa();
}

// js/app.js

// ... (código previo de handleLocationUpdate) ...

function handleLocationUpdate(pos) {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const speed = pos.coords.speed; // ⬅️ Extraemos la velocidad
    const latlng = [lat, lon];

    puntoInicio = turf.point([lon, lat]);
    crearMarcadorUsuario(latlng);

    if (autoCentrar) {
        map.panTo(latlng);
    }

    const navState = updatePosition(puntoInicio, speed); 
    if (!navState) return; // Salimos si la navegación no está iniciada

// ----------------------------------------------------
    // ⬇️⬇️ LÓGICA DE DETECCIÓN "A BORDO" (BLINDADA V3) ⬇️⬇️
    // ----------------------------------------------------
    if (rutaCompletaPlan && pasoActual < rutaCompletaPlan.length) {
        const paso = rutaCompletaPlan[pasoActual];
        
        if (paso.tipo === 'caminar' || paso.tipo === 'transbordo') {
            const proximoPasoBus = rutaCompletaPlan[pasoActual + 1];
            
            if (proximoPasoBus && proximoPasoBus.tipo === 'bus') {
                const rutaId = proximoPasoBus.ruta.properties.id;
                const paraderoSubida = proximoPasoBus.paraderoInicio;
                
                let busMasCercano = null;
                let distanciaMinima = Infinity;

                // Aplanamos la ruta para la regla de sentido
                let rutaLine = proximoPasoBus.ruta;
                if(rutaLine.geometry.type === 'MultiLineString') {
                    rutaLine = turf.lineString(rutaLine.geometry.coordinates.flat());
                }
                const distParaderoOnLine = turf.nearestPointOnLine(rutaLine, paraderoSubida).properties.location;
                
                map.eachLayer(layer => {
                    if (layer.options && layer.options.rutaId === rutaId) {
                        const busPunto = turf.point([layer.getLatLng().lng, layer.getLatLng().lat]);
                        
                        // 🚀 CORRECCIÓN CRÍTICA: Forzamos KILÓMETROS y multiplicamos por 1000.
                        // Esto mata el bug que te subía a unidades que estaban a 17km de distancia.
                        const distanciaMetros = turf.distance(puntoInicio, busPunto, { units: 'kilometers' }) * 1000;
                        const distBusOnLine = turf.nearestPointOnLine(rutaLine, busPunto).properties.location;
                        
                        // 🛡️ REGLA DE SENTIDO: El bus debe estar ANTES del paradero (damos 150m de tolerancia si va pasando)
                        if (distBusOnLine <= distParaderoOnLine + 0.15) {
                            if (distanciaMetros < distanciaMinima) {
                                distanciaMinima = distanciaMetros;
                                busMasCercano = layer;
                            }
                        }
                    }
                });

                const UMBRAL_DISTANCIA = 35; // 35 metros reales y verificados
                const UMBRAL_VELOCIDAD = 8; // km/h

                if (busMasCercano && distanciaMinima < UMBRAL_DISTANCIA) {
                    const unidadId = busMasCercano.options.unidadId || (busMasCercano.getPopup().getContent().match(/Unidad (\w+)/) || [])[1];

                    // Acumulamos tiempo para estar seguros de que no va pasando
                    if (window.candidatoAbordaje.unidad === unidadId) {
                        window.candidatoAbordaje.contador += 3;
                    } else {
                        window.candidatoAbordaje.unidad = unidadId;
                        window.candidatoAbordaje.contador = 0;
                    }

                    if (window.candidatoAbordaje.contador >= 10 || (speedKmH > UMBRAL_VELOCIDAD)) {
                        console.log(`🚌 ABORDAJE CONFIRMADO: Unidad ${unidadId} a ${distanciaMinima.toFixed(1)}m`);
                        window.unidadAbordadaViajeActual = unidadId; 
                        window.candidatoAbordaje = { unidad: null, contador: 0 };
                        activarModoTransbordo(false); 
                        siguientePaso(); 
                        return; 
                    }
                } else {
                    window.candidatoAbordaje = { unidad: null, contador: 0 };
                }
            }
        }
    }
    // ----------------------------------------------------
    // ⬆️⬆️ FIN LÓGICA DE DETECCIÓN "A BORDO" (CORREGIDA) ⬆️⬆️
    // ----------------------------------------------------

    actualizarUI_Navegacion(navState);

    // ⬇️ Revisión de avance de paso (Bajada) ⬇️
    checkProximidad(navState); 
}

// ... (el resto del archivo, incluyendo la función checkProximidad) ...

function checkProximidad(navState) {
    if (!rutaCompletaPlan || rutaCompletaPlan.length === 0 || pasoActual >= rutaCompletaPlan.length) return;
    const paso = rutaCompletaPlan[pasoActual];
    const umbralProximidadMetros = 40; // Umbral de proximidad general para alerta o avance
    
    // Solo revisa proximidad si el GPS está activo
    if (!puntoInicio) return; 

    // --- Lógica Común: Proyección sobre la ruta (Busca la ruta activa) ---
    let puntoDeInteres = null;
    let rutaGeoJSON = null;
    
    // 1. Definir el Punto y Ruta de Interés
    if (paso.tipo === 'caminar') {
        // En caminar, el punto de interés es el paradero de subida.
        // La "ruta" es la línea recta entre el GPS y el paradero.
        puntoDeInteres = paso.paradero;
        // Solo verificamos proximidad estricta para el paso de caminar (línea recta)
    } else if (paso.tipo === 'bus') {
        // En bus, el punto de interés es el paradero de bajada.
        puntoDeInteres = paso.paraderoFin;
        rutaGeoJSON = paso.ruta; // Usamos el GeoJSON de la ruta del bus
    }

    // --- 2. Detección de Avance (Lógica Central) ---

    // A. Paso de Caminar (Inicio de la Ruta o Transbordo)
    if (paso.tipo === 'caminar') {
        const distanciaMetros = turf.distance(puntoInicio, puntoDeInteres, { units: 'meters' });
        
        // Si la distancia es muy pequeña, AVANZA.
        if (distanciaMetros < 25) { 
            console.log("Llegaste al paradero de subida, avanzando...");
            siguientePaso();
            return;
        }
    }

    // B. Paso de Bus (Monitoreo de Bajada)
    if (paso.tipo === 'bus') {
        const distanciaMetros = turf.distance(puntoInicio, puntoDeInteres, { units: 'meters' });
        
        // --- 2.1 Lógica de Alerta de Bajada (Proximidad) ---
        if (distanciaMetros < 300 && !alertaMostrada) {
            console.log("¡Alerta! Bajas pronto.");
            alertaMostrada = true;
            
            // ⬇️ MODIFICADO: Usa userSettings.vibration
            if (userSettings.vibration && navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }            
            // ⬆️ FIN MODIFICADO
            
            instruccionActualEl.textContent = `¡BAJA PRONTO! (${puntoDeInteres.properties.nombre})`;
        }

        // --- 2.2 Lógica de Avance (Proyección sobre la Ruta) ---
        
        try {
            // Proyectar ambos puntos sobre la ruta de bus
            const puntoUsuarioEnRuta = turf.nearestPointOnLine(rutaGeoJSON, puntoInicio);
            const puntoParaderoEnRuta = turf.nearestPointOnLine(rutaGeoJSON, puntoDeInteres);

            // Obtener las ubicaciones proyectadas (distancia en km desde el inicio de la polilínea)
            const distUsuario = puntoUsuarioEnRuta.properties.location;
            const distParadero = puntoParaderoEnRuta.properties.location;
            
            // Si el usuario está 50 metros MÁS ADELANTE que el paradero...
            // (La diferencia se multiplica por 1000 para pasar de km a metros)
            if ((distUsuario - distParadero) * 1000 > umbralProximidadMetros) { 
                
                console.log("Detección de Avance: El usuario pasó el punto de bajada. Avanzando...");
                
                const esPasoFinal = (pasoActual === rutaCompletaPlan.length - 1);
                
                // Si NO es el paso final, activamos el transbordo
                if (!esPasoFinal) {
                    console.log("Activando contador de transbordo...");
                    activarModoTransbordo(); 
                    // ⬇️ MODIFICADO
                    if (userSettings.vibration && navigator.vibrate) {
                        navigator.vibrate([200, 100, 200, 100, 200]);
                    }
                    // ⬆️ FIN MODIFICADO
                }
                
                // Avanzamos al siguiente paso (o finalizamos)
                siguientePaso();
                return;
            }
        } catch (e) {
            console.error("Error en lógica de proyección Turf:", e);
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
        llamarEscuchaParaPaso(pasoActual);
    }
}

function pasoAnterior() {
    if (pasoActual > 0) {
        pasoActual--;
        autoCentrar = true; 
        alertaMostrada = false;
        mostrarPaso(pasoActual);
        llamarEscuchaParaPaso(pasoActual);
    }
}

// js/app.js

function mostrarPaso(indice) {
    const paso = rutaCompletaPlan[indice];
    instruccionActualEl.textContent = paso.texto;
    btnAnterior.disabled = (indice === 0);
    
    // ⬇️⬇️ INICIO DE LA CORRECCIÓN ⬇️⬇️
    const esUltimoPaso = (indice === rutaCompletaPlan.length - 1);
    
    btnSiguiente.disabled = esUltimoPaso;
    btnFinalizar.style.display = 'block'; // ⬅️ CORRECCIÓN: Mostrar SIEMPRE
    
    // Simplemente ocultamos "Siguiente" en el último paso
    if (esUltimoPaso) {
        btnSiguiente.style.display = 'none';
    } else {
        btnSiguiente.style.display = 'block'; // O 'inline-block' si prefieres
    }
    // ⬆️⬆️ FIN DE LA CORRECCIÓN ⬆️⬆️
    
    const puntoDePartida = puntoInicio || paraderoInicioCercano;
    const bounds = dibujarPaso(paso, puntoDePartida); 
    
    if (autoCentrar && bounds && bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2));
    } else if (autoCentrar && !bounds) {
        map.setView(map.getCenter(), 17);
    }
}

// js/app.js

function actualizarUI_Navegacion(navState) {

    // 1. Actualizar distancia
    const distanciaFaltante = Math.max(0, distanciaTotalRuta - navState.distanciaRecorrida);
    if (distanciaFaltante > 1000) {
        distanciaRestanteEl.textContent = `Faltan: ${(distanciaFaltante / 1000).toFixed(2)} km`;
    } else {
        distanciaRestanteEl.textContent = `Faltan: ${distanciaFaltante.toFixed(0)} m`;
    }

    // ⬇️ SECCIÓN DE LÓGICA DE CONTADOR COMPLETAMENTE REEMPLAZADA ⬇️
    // 2. Actualizar estado (Movimiento / Transbordo / Esperando)
    const LIMITE_TIEMPO_TRANSBORDO = 5400; // 2 horas en segundos

    // Resetea la clase CSS
    tiempoEsperaEl.className = ''; 

    if (navState.enModoTransbordo && !navState.enMovimiento) {
        // --- ESTADO 1: En Transbordo (Detenido) ---
        const tiempoRestanteSeg = LIMITE_TIEMPO_TRANSBORDO - navState.tiempoTotalViaje;
        
        if (tiempoRestanteSeg > 0) {
            const minutos = Math.floor(tiempoRestanteSeg / 60);
            const segundos = tiempoRestanteSeg % 60;
            tiempoEsperaEl.textContent = `Transbordo: ${minutos}:${segundos < 10 ? '0' : ''}${segundos}`;
            tiempoEsperaEl.classList.add('transbordo-timer'); // Clase Azul
        } else {
            tiempoEsperaEl.textContent = "Tiempo Agotado";
            tiempoEsperaEl.classList.add('advertencia'); // Clase Roja
        }

    } else if (navState.enMovimiento) {
        // --- ESTADO 2: En Movimiento ---
        tiempoEsperaEl.textContent = "En movimiento";
        tiempoEsperaEl.classList.add('en-movimiento'); // Clase Verde
    
    } else {
        // --- ESTADO 3: Esperando (Detenido, ej. semáforo) ---
        const minutos = Math.floor(navState.tiempoDetenido / 60);
        const segundos = navState.tiempoDetenido % 60;
        tiempoEsperaEl.textContent = `Esperando: ${minutos}:${segundos < 10 ? '0' : ''}${segundos}`;
        tiempoEsperaEl.classList.add('advertencia'); // Clase Roja
    }
    // ⬆️ FIN DE LA SECCIÓN REEMPLAZADA ⬆️

    // 3. Actualizar tiempo total de viaje
    const LIMITE_TIEMPO_VIAJE = 7200; // 2 horas en segundos (puedes cambiar esto si quieres)
    const totalMinutos = Math.floor(navState.tiempoTotalViaje / 60);
    const totalSegundos = navState.tiempoTotalViaje % 60;
    
    tiempoViajeEl.textContent = `Viaje: ${totalMinutos}:${totalSegundos < 10 ? '0' : ''}${totalSegundos}`;

    if (navState.tiempoTotalViaje > LIMITE_TIEMPO_VIAJE) {
        tiempoViajeEl.classList.add('advertencia');
    } else {
        tiempoViajeEl.classList.remove('advertencia');
    }
}


// --- 8. REGISTRO DEL SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('Service Worker: Registrado exitosamente', reg.scope);
      })
      .catch((err) => {
        console.log('Service Worker: Falló el registro', err);
      });
  });
}

/**
 * (NUEVO MÓDULO) Guarda un item en el historial de localStorage.
 * Mantiene un máximo de 5 items y evita duplicados.
 */
function guardarEnHistorial(item) {
    const MAX_ITEMS = 5;
    let historial = JSON.parse(localStorage.getItem('historialRutas')) || [];

    // 1. Evitar duplicados: Si ya existe, la borramos para ponerla al inicio
    historial = historial.filter(h => 
        !(h.inicioId === item.inicioId && h.finId === item.finId)
    );

    // 2. Añadir el nuevo item al INICIO
    historial.unshift(item);

    // 3. Limitar el historial a 5 items
    const historialLimitado = historial.slice(0, MAX_ITEMS);

    // 4. Guardar de vuelta en localStorage
    localStorage.setItem('historialRutas', JSON.stringify(historialLimitado));
}

/**
 * (MÓDULO ACTUALIZADO) Carga Favoritos e Historial de localStorage
 * y los muestra en el panel de instrucciones.
 */
function actualizarPanelDeInicio() {
    const historial = JSON.parse(localStorage.getItem('historialRutas')) || [];
    const favoritos = JSON.parse(localStorage.getItem('favoritasRutas')) || [];

    let html = "";

    // --- 1. Generar HTML para Favoritos ---
    if (favoritos.length > 0) {
        html += `<p style="font-weight: bold; margin-bottom: 10px;">⭐️ Tus Favoritos:</p>`;
        
        html += favoritos.map(item => {
            return `
                <div class="opcion-ruta favorito-item" 
                     data-inicio-id="${item.inicioId}" 
                     data-fin-id="${item.finId}"
                     title="Repetir: ${item.inicioNombre} → ${item.finNombre}">
                    
                    <span class="delete-favorito" data-nombre="${item.nombre}" title="Borrar favorito">&times;</span>
                    
                    <h4 style="margin-bottom: 5px;">${item.nombre}</h4>
                    <small style="color: #555;">${item.inicioNombre} → ${item.finNombre}</small>
                </div>
            `;
        }).join('');
    }

    // --- 2. Generar HTML para Historial ---
    if (historial.length > 0) {
        html += `<p style="font-weight: bold; margin-bottom: 10px; margin-top: 20px;">Tu historial reciente:</p>`;
        
        html += historial.map(item => {
            return `
                <div class="opcion-ruta historial-item" 
                     data-inicio-id="${item.inicioId}" 
                     data-fin-id="${item.finId}"
                     title="Repetir esta búsqueda">
                    <h4 style="margin-bottom: 5px;">${item.inicioNombre} → ${item.finNombre}</h4>
                    <small style="color: #555;">${item.rutaResumen || 'Ruta de caminata'}</small>
                </div>
            `;
        }).join('');
    }

    // --- 3. Si no hay nada, mostrar mensaje pordefecto ---
    if (html === "") {
        instruccionesEl.innerHTML = '<p>Selecciona tu destino para ver la ruta.</p>';
        return;
    }

    // --- 4. Insertar todo en el panel ---
    instruccionesEl.innerHTML = html;
    
    // --- 5. Asignar los listeners ---
    
    // ❗️ Usamos la función renombrada 'ejecutarBusquedaGuardada' para AMBOS
    document.querySelectorAll('.historial-item').forEach(item => {
        item.addEventListener('click', ejecutarBusquedaGuardada);
    });
    document.querySelectorAll('.favorito-item').forEach(item => {
        item.addEventListener('click', ejecutarBusquedaGuardada);
    });
    
    // Listener para los botones de borrar
    document.querySelectorAll('.delete-favorito').forEach(item => {
        item.addEventListener('click', handleFavoritoDelete);
    });
}

async function ejecutarBusquedaGuardada(event) {
    const item = event.currentTarget;
    const inicioId = item.dataset.inicioId;
    const finId = item.dataset.finId;

    if (!inicioId || !finId) return;

    console.log(`Cargando historial: Inicio ${inicioId}, Fin ${finId}`);

    // 1. Encontrar los paraderos en la base de datos interna
    const paraderoInicio = todosLosParaderos.find(p => p.properties.originalIndex == inicioId);
    paraderoFin = todosLosParaderos.find(p => p.properties.originalIndex == finId);

    if (!paraderoInicio || !paraderoFin) {
        alert("Error: Datos de ruta no encontrados.");
        return;
    }

    // 2. Configurar Inicio
    paraderoInicioCercano = paraderoInicio; 
    puntoInicio = null; 
    controlInputInicio.style.display = 'none';
    controlSelectInicio.style.display = 'block';
    // (Asumimos que el selector de inicio manual sí tiene la lista cargada)
    if(choicesInicioManual) choicesInicioManual.setChoiceByValue(inicioId.toString());

    // 3. CONFIGURAR DESTINO (CORRECCIÓN CRÍTICA)
    // Como el menú de destino ahora está vacío, primero "inyectamos" este paradero
    // para poder seleccionarlo visualmente.
    const opcionTemporal = {
        value: finId.toString(),
        label: paraderoFin.properties.nombre,
        selected: true // ¡Lo marcamos seleccionado de una vez!
    };
    
    // Agregamos la opción y reemplazamos lo que había (true)
    choicesDestino.setChoices([opcionTemporal], 'value', 'label', true); 

    // 4. Ejecutar la búsqueda
    listaDePlanes = encontrarRutaCompleta(paraderoInicioCercano, paraderoFin, todosLosParaderos, todasLasRutas, mapRutaParaderos);
    mostrarPlanes(listaDePlanes);
}

function handleGuardarFavoritoClick() {
    const nombre = prompt("Dale un nombre a esta ruta (ej. Casa a Oficina):", "");

    if (!nombre || nombre.trim() === "") {
        return;
    }

    try {
        const itemFavorito = {
            inicioId: paraderoInicioCercano.properties.originalIndex,
            inicioNombre: paraderoInicioCercano.properties.nombre,
            finId: paraderoFin.properties.originalIndex,
            finNombre: paraderoFin.properties.nombre,
            nombre: nombre.trim()
        };

        guardarEnFavoritos(itemFavorito);

    } catch (e) {
        console.error("Error al guardar en favoritos:", e);
        alert("Error: No se pudo guardar el favorito.");
    }
}

/**
 * (NUEVO MÓDULO) Guarda un item en la lista de favoritos.
 */
function guardarEnFavoritos(item) {
    let favoritos = JSON.parse(localStorage.getItem('favoritasRutas')) || [];

    // 1. Evitar duplicados por nombre
    favoritos = favoritos.filter(f => f.nombre !== item.nombre);

    // 2. Añadir el nuevo item al INICIO
    favoritos.unshift(item);

    // 3. Guardar (sin límite, a diferencia del historial)
    localStorage.setItem('favoritasRutas', JSON.stringify(favoritos));
    
    alert(`¡Ruta "${item.nombre}" guardada como favorita!`);
}

/**
 * (NUEVO MÓDULO) Se activa al hacer clic en el botón 'X' de un favorito.
 */
function handleFavoritoDelete(event) {
    // ❗️ Detiene el clic para que no active la búsqueda de ruta
    event.stopPropagation(); 
    
    const nombre = event.currentTarget.dataset.nombre;
    if (!nombre) return;
    
    if (confirm(`¿Seguro que quieres borrar el favorito "${nombre}"?`)) {
        let favoritos = JSON.parse(localStorage.getItem('favoritasRutas')) || [];
        favoritos = favoritos.filter(f => f.nombre !== nombre);
        localStorage.setItem('favoritasRutas', JSON.stringify(favoritos));
        
        // Refresca el panel para mostrar la lista actualizada
        actualizarPanelDeInicio(); 
    }
}

/**
 * (MÓDULO ACTUALIZADO) Busca paraderos cercanos e inicia ETA en tiempo real.
 */
function handleParaderosCercanos() {
    if (!puntoInicio) {
        alert("No se ha podido detectar tu ubicación GPS. Muévete a un lugar con mejor señal o reinicia la app.");
        return;
    }

    console.log("Buscando paraderos cercanos y preparando ETAs...");
    limpiarCapasDeRuta(); 
    marcadores.clearLayers(); 
    if (choicesRuta) {
        choicesRuta.clearInput();
        choicesRuta.removeActiveItems();
    }

    const paraderosConDistancia = todosLosParaderos.map(paradero => {
        const distancia = turf.distance(puntoInicio, paradero, { units: 'meters' });
        return { paradero, distancia };
    });

    const paraderosCercanos = paraderosConDistancia
        .sort((a, b) => a.distancia - b.distancia)
        .slice(0, 5);

    const marcadoresDeParaderos = [];
    let htmlInstrucciones = '<p><strong>Paraderos cercanos a ti:</strong></p><ul style="padding-left: 10px; list-style:none; font-size: 0.95em;">';

    // ⏱️ Recolectaremos todas las rutas únicas que pasan por estos 5 paraderos
    let rutasUnicasSet = new Set();

    paraderosCercanos.forEach(item => {
        const coords = item.paradero.geometry.coordinates;
        const latLng = [coords[1], coords[0]];
        const nombre = item.paradero.properties.nombre;
        const dist = item.distancia.toFixed(0);
        const pid = item.paradero.properties.originalIndex;

        // Recolectar rutas de este paradero
        const rutasDelParadero = item.paradero.properties.rutas || [];
        rutasDelParadero.forEach(r => rutasUnicasSet.add(r));

        // Añadir a la lista HTML con su contenedor ETA
        htmlInstrucciones += `
            <li style="margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                <div style="font-weight:bold; color:#0056b3;"><i class="ri-map-pin-user-line"></i> ${nombre}</div>
                <div style="font-size:0.85em; color:#666; margin-bottom: 4px;">A ${dist} metros de ti</div>
                <div class="eta-live-badge eta-contenedor-${pid}"></div>
            </li>
        `;
        
        const icono = L.divIcon({
            className: 'icono-mapa-bus', 
            html: '<i class="ri-bus-fill"></i>',
            iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12]
        });

        const marker = L.marker(latLng, { icon: icono }).bindPopup(crearPopupInteligente(item.paradero));
        marker.addTo(marcadores); 
        marcadoresDeParaderos.push(marker);
    });

    htmlInstrucciones += '</ul>';
    instruccionesExplorarEl.innerHTML = htmlInstrucciones;

    const userMarker = crearMarcadorUsuario(puntoInicio.geometry.coordinates.slice().reverse());
    const group = L.featureGroup([userMarker, ...marcadoresDeParaderos]);
    if (group.getBounds().isValid()) {
        map.fitBounds(group.getBounds().pad(0.2));
    }
    abrirPanelControl();

    // ⏱️ DISPARAMOS EL RADAR MULTIHILO PARA ESTAS RUTAS
    const rutasArray = Array.from(rutasUnicasSet);
    if (rutasArray.length > 0) {
        console.log(`Desplegando radar para ${rutasArray.length} rutas cercanas:`, rutasArray);
        iniciarEscuchaMultihilo(rutasArray, paraderosCercanos);
    }
}

/**
 * (NUEVO MÓDULO) Se activa al pulsar el botón "Ver detalles"
 * en el popup de un paradero.
 */
function handleMostrarRutasDeParadero(event) {
    const paraderoId = event.target.dataset.paraderoId;
    if (!paraderoId) return;

    // 1. Encontrar el paradero en nuestra lista global
    const paradero = todosLosParaderos.find(p => p.properties.originalIndex == paraderoId);
    if (!paradero) return;

    // 2. Obtener la lista de IDs de ruta (ej: ["Koox 06", "Koox 10"])
    const rutasIds = paradero.properties.rutas || [];
    
    // 3. Obtener los nombres completos de esas rutas (ej: "Koox 06 - Centro")
    const rutasInfo = rutasIds.map(id => {
        return todasLasRutas.find(r => r.properties.id === id);
    }).filter(Boolean); // .filter(Boolean) elimina rutas no encontradas

    // 4. Generar el HTML para el panel
    let html = `<p>Mostrando rutas para:</p>
                <h4 style="margin-top:0;">${paradero.properties.nombre}</h4>`;
    
    if (rutasInfo.length > 0) {
        html += '<ul style="padding-left: 20px; margin-top: 10px;">';
        rutasInfo.forEach(ruta => {
            html += `<li style="margin-bottom: 5px;">
                        <strong>${ruta.properties.id}</strong>
                        <small>(${ruta.properties.nombre})</small>
                    </li>`;
        });
        html += '</ul>';
    } else {
        html += '<p>No hay rutas registradas para este paradero.</p>';
    }

    // 5. Mostrar en el panel de explorar y cerrar el popup del mapa
    instruccionesExplorarEl.innerHTML = html;
    map.closePopup();
    abrirPanelControl();
}

// js/app.js

/**
 * (NUEVO MÓDULO) Asegura que el panel de control esté visible.
 * Lo abre si estaba cerrado, para que el usuario vea el resultado
 * de su acción en el mapa.
 */
function abrirPanelControl() {
    if (panelControl.classList.contains('oculto')) {
        panelControl.classList.remove('oculto');
    }
}

// js/app.js (Al final del archivo, en el Módulo NUEVO)

/**
 * (MÓDULO ACTUALIZADO) Obtiene la ruta activa actual para el reporte.
 * * Prioridad 1: Navegación GPS/Manual activa (máxima certeza).
 * Prioridad 2: Ruta en modo Explorar (elección explícita).
 * Prioridad 3: Ruta más común del paradero más cercano al GPS (estimación).
 */
function getRutaActivaId() {
    // 1. ¿Estamos en navegación? (Prioridad 1)
    if (rutaCompletaPlan && rutaCompletaPlan.length > 0 && pasoActual < rutaCompletaPlan.length) {
        const paso = rutaCompletaPlan[pasoActual];
        if (paso.tipo === 'bus') {
            return paso.ruta.properties.id;
        }
    }
    
    // 2. ¿Estamos en modo explorar? (Prioridad 2)
    if (choicesRuta && choicesRuta.getValue(true)) {
        return choicesRuta.getValue(true);
    }
    
    // 3. ¿Estamos en modo Reporte Y con ubicación GPS? (Prioridad 3: Reporte desde ubicación)
    // Usamos 'paraderoInicioCercano' (el paradero más cercano al GPS)
    if (paraderoInicioCercano && !panelNavegacion.classList.contains('oculto') === false) { 
        // Solo aplica si el panel de Navegación NO está activo, es decir, el usuario
        // está en el panel de Control (Reportar)
        
        // Obtener todas las rutas que pasan por ese paradero
        const rutasEnParadero = paraderoInicioCercano.properties.rutas || [];
        
        if (rutasEnParadero.length > 0) {
            // Regla de desempate simple: Usar la PRIMERA ruta en la lista
            // (Se asume que la lista de rutas en el paradero está en orden lógico o numérico)
            return rutasEnParadero[0];
        }
    }
    
    // 4. No hay ruta activa
    return null;
}

/**
 * (MÓDULO FIREBASE) Envía el reporte comunitario a Cloud Firestore.
 */
async function handleEnviarReporte(tipo) {
    const rutaId = getRutaActivaId();
    
    if (!rutaId) {
        alert("Por favor, inicia una navegación o selecciona una ruta en 'Explorar' para poder reportar un incidente sobre ella.");
        return;
    }

    console.log(`Enviando reporte a Firebase: ${tipo} en ${rutaId}`);
    
    try {
        // Añade un nuevo "documento" (reporte) a la colección "reportes_pendientes"
        await db.collection("reportes_pendientes").add({
            tipo: tipo,
            rutaId: rutaId,
            // Guardamos el timestamp para la "inteligencia" del backend
            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
        });

        alert(`¡Gracias! Tu reporte para la ruta ${rutaId} ha sido enviado.`);

    } catch (err) {
        console.error("Error al enviar reporte a Firebase:", err);
        alert("No se pudo enviar el reporte. Revisa tu conexión a internet.");
    }
}

export function detenerEscuchaBuses() {
    if (firestoreListenerUnsubscribe) {
        firestoreListenerUnsubscribe(); 
        firestoreListenerUnsubscribe = null;
    }
    // Silenciamos y desconectamos la ruta única
    if (socketVinden) {
        socketVinden.disconnect();
        socketVinden = null;
    }
    // Silenciamos y desconectamos el escuadrón multihilo
    if (socketsVindenMulti.length > 0) {
        socketsVindenMulti.forEach(s => s.disconnect());
        socketsVindenMulti = [];
    }
    
    limpiarCapaBuses(); 
    mostrarInfoETA(null); 
    limpiarETAs(); // 🧹 Limpia los ETAs del motor (importado de etaService.js)
    detenerMotorInteligente(); // 🧠 Apagamos el motor
    console.log("🛑 Escucha de buses DETENIDA. Memoria liberada.");
}

/**
 * (ACTUALIZADO) Muestra/Oculta la información de ETA adaptando el texto
 * dependiendo de si estamos esperando o viajando.
 */
function mostrarInfoETA(info) {
    const etaContenedor = document.getElementById('eta-info');
    if (!etaContenedor) return;

    if (!info) {
        etaContenedor.style.display = 'none';
        etaContenedor.innerHTML = '';
        return;
    }
    
    // 🚀 Detectamos si estamos esperando o ya vamos en viaje
    let enViaje = false;
    if (rutaCompletaPlan && rutaCompletaPlan[pasoActual] && rutaCompletaPlan[pasoActual].tipo === 'bus') {
        enViaje = true;
    }

    // Adaptamos el título
    let contenido = `<strong>${enViaje ? 'Viajando en' : 'Próximo bus'} (Unidad ${info.id}):</strong>`;
    
    // Adaptamos el tiempo/distancia
    if (info.etaMinutos) {
        contenido += `<p>${enViaje ? 'Llegas a tu destino en aprox.' : 'Llega a tu parada en aprox.'} <strong>${info.etaMinutos} min</strong>.</p>`;
    } else {
        contenido += `<p>A <strong>${info.distanciaMetros.toFixed(0)} m</strong> de la parada.</p>`;
    }
    
    etaContenedor.innerHTML = contenido;
    etaContenedor.style.display = 'block';
}


/**
 * (NUEVO) Inicia la escucha de buses en vivo (el nuevo cerebro)
 * @param {string} filtroRutaId - El ID de la ruta que queremos ver (ej. 'koox-06')
 * @param {object} paraderoDeInteres - El paradero GeoJSON donde esperamos el bus
 */
/**
 * (ACTUALIZADO - VERSIÓN VINDEN DIRECTO) 
 * Inicia la escucha de buses saltándose Firebase
 */
export function iniciarEscuchaBuses(filtroRutaId, paraderoDeInteres, paraderosMasivos = null) {
    // 1. Limpiamos conexiones previas
    detenerEscuchaBuses(); 
    
    if (filtroRutaId) {
        iniciarMotorInteligente(filtroRutaId); 
    }

    // 2. Buscamos el ID de Vinden (usando el automático puro)
    const idVinden = obtenerIdVinden(filtroRutaId);

    if (!idVinden) {
        console.log(`⚠️ La ruta ${filtroRutaId} aún no tiene ID de Vinden configurado.`);
        mostrarInfoETA(null);
        return;
    }

    console.log(`📡 Iniciando conexión directa a Vinden para ruta: ${filtroRutaId} (ID Vinden: ${idVinden})`);

    // 3. Conectamos al WebSocket de Vinden
    if (!socketVinden) {
        socketVinden = io('wss://socketio.campeche.vinden.cloud/app', {
            transports: ['websocket'],
            query: { r: '977', EIO: '3', transport: 'websocket' } // Puerto de enlace
        });
        
        socketVinden.on('connect', () => {
            console.log('✅ Conectado al satélite Vinden');
            socketVinden.emit('change-route', idVinden);
        });
    } else {
        // Si ya está conectado, solo cambiamos de canal
        socketVinden.emit('change-route', idVinden);
    }

    const rutaGeoJSON = todasLasRutas.find(r => r.properties.id === filtroRutaId);
    
    // 💡 SOLUCIÓN AL ERROR TURF.JS: "Aplanar" MultiLineString a LineString
    let rutaParaTurf = rutaGeoJSON;
    if (rutaGeoJSON && rutaGeoJSON.geometry && rutaGeoJSON.geometry.type === 'MultiLineString') {
        try {
            // Unimos todos los fragmentos en una sola línea continua
            const coordenadasUnidas = rutaGeoJSON.geometry.coordinates.flat();
            rutaParaTurf = turf.lineString(coordenadasUnidas);
        } catch (e) {
            console.warn("No se pudo aplanar la ruta para el cálculo de ETA.");
        }
    }
    
    let approachingBusesMap = new Map(); 

// 4. El Radar Interceptor (La Magia + Invisibilidad)
    const originalOnEvent = socketVinden.onevent;
    socketVinden.onevent = function (packet) {
        const args = packet.data || [];
        
        if (args[0] === 'update-location' && args[1] && args[1].data) {
            try {
                const bus = JSON.parse(args[1].data);
                const unidadId = bus.unit_id;
                const lat = parseFloat(bus.latlng[0]);
                const lng = parseFloat(bus.latlng[1]);
                
                const speedKmH = parseFloat(bus.speed) || 0;
                const velocidadReal = bus.status === 5 ? 0 : (speedKmH / 3.6); 

// --- 🛡️ INICIO GEOCERCA Y ETA MASIVO 🛡️ ---
                let busVisible = true;
                const busPunto = turf.point([lng, lat]);

                if (rutaParaTurf) {
                    busVisible = esBusVisible(busPunto, rutaParaTurf);
                }

                if (busVisible) {
                    actualizarMarcadorBus(bus, filtroRutaId);
                    
                    // 🧠 Alimentamos el motor con el latido de este camión
                    // Ahora le mandamos la velocidad matemática corregida
                    registrarLatidoBusMotor(unidadId, bus.velocidadCalculada, filtroRutaId);
                    
                    // ⏱️ ETA MASIVO
                    if (paraderosMasivos && paraderosMasivos.length > 0) {
                        procesarETAMasivo(bus, busPunto, rutaParaTurf, paraderosMasivos, filtroRutaId);
                    }
                } else {
                    removerMarcadorBus(unidadId); 
                    originalOnEvent.call(this, packet);
                    return; 
                }
                // --- 🛡️ FIN GEOCERCA Y ETA MASIVO 🛡️ ---

// 5. CÁLCULO DE ETA (CON FILTRO DE SENTIDO TOPOLÓGICO)
                if (paraderoDeInteres && rutaParaTurf) {
                    let enViaje = (rutaCompletaPlan && rutaCompletaPlan[pasoActual] && rutaCompletaPlan[pasoActual].tipo === 'bus');
                    
                    // Si ya vamos a bordo de la U081, ignoramos por completo a las demás unidades
                    if (enViaje && window.unidadAbordadaViajeActual && window.unidadAbordadaViajeActual !== unidadId) {
                        approachingBusesMap.delete(unidadId);
                    } else {
                        const puntoBusEnRuta = turf.nearestPointOnLine(rutaParaTurf, busPunto);
                        const puntoParaderoEnRuta = turf.nearestPointOnLine(rutaParaTurf, paraderoDeInteres.geometry.coordinates);
                        
                        // 'location' devuelve la distancia en KILÓMETROS desde el origen de la línea
                        const distBusKm = puntoBusEnRuta.properties.location;
                        const distParaderoKm = puntoParaderoEnRuta.properties.location;
                        
                        // Cuánto le falta al bus para llegar al paradero (en km)
                        const distanciaFaltanteKm = distParaderoKm - distBusKm;

                        // 🛡️ REGLA ORO: Si distanciaFaltanteKm es MAYOR a -0.05 significa que el camión viene HACIA el paradero.
                        if (distanciaFaltanteKm > -0.05) {
                            const distanciaMetrosReal = distanciaFaltanteKm * 1000;
                            
                            approachingBusesMap.set(unidadId, {
                                id: bus.unit_number || unidadId, 
                                distanciaMetros: distanciaMetrosReal > 0 ? distanciaMetrosReal : 0,
                                speed: velocidadReal
                            });
                        } else {
                            // El camión ya pasó el paradero y se está alejando. Lo eliminamos del cálculo.
                            approachingBusesMap.delete(unidadId);
                        }
                    }
                    
                    const approachingBuses = Array.from(approachingBusesMap.values());
                    
                    if (approachingBuses.length > 0) {
                        // 🚀 Ordenamos para que SIEMPRE gane el que está más cerca
                        approachingBuses.sort((a, b) => a.distanciaMetros - b.distanciaMetros);
                        const nextBus = approachingBuses[0];
                        
                        let etaMinutos = null;
                        if (nextBus.speed > 1.0) { 
                            etaMinutos = Math.round((nextBus.distanciaMetros / nextBus.speed) / 60);
                        }
                        
                        mostrarInfoETA({ 
                            id: nextBus.id, 
                            etaMinutos: etaMinutos, 
                            distanciaMetros: nextBus.distanciaMetros 
                        });
                    }
                }
            } catch (e) {
                console.error("Error procesando telemetría de Vinden:", e);
            }
        }
        originalOnEvent.call(this, packet); 
    };
}

/**
 * ⏱️ INICIA ESCUCHA MULTIHILO (Para Paraderos Cercanos)
 * Escucha múltiples rutas simultáneamente y calcula el ETA para varios paraderos.
 */
export function iniciarEscuchaMultihilo(rutasIds, paraderosDeInteres) {
    detenerEscuchaBuses(); // Limpia sockets y mapa previos
    if (rutasIds && rutasIds.length > 0) {
        iniciarMotorInteligente(rutasIds);
    }

    const paraderosLimpios = paraderosDeInteres.map(item => item.paradero ? item.paradero : item);

    rutasIds.forEach((rutaId, index) => {
        const idVinden = obtenerIdVinden(rutaId);
        if (!idVinden) return;

        // Escalonamos la conexión (300ms) para no ahogar la red del celular
        setTimeout(() => {
            const unSocket = io('wss://socketio.campeche.vinden.cloud/app', {
                transports: ['websocket'],
                query: { r: '977', EIO: '3', transport: 'websocket' },
                forceNew: true 
            });

            unSocket.on('connect', () => {
                unSocket.emit('change-route', idVinden);
            });

            // Aplanamos la ruta para la matemática de Turf.js
            const rutaGeoJSON = todasLasRutas.find(r => r.properties.id === rutaId);
            let rutaParaTurf = rutaGeoJSON;
            if (rutaGeoJSON && rutaGeoJSON.geometry && rutaGeoJSON.geometry.type === 'MultiLineString') {
                try {
                    const coordUnidas = rutaGeoJSON.geometry.coordinates.flat();
                    rutaParaTurf = turf.lineString(coordUnidas);
                } catch(e){}
            }

            const originalOnEvent = unSocket.onevent;
            unSocket.onevent = function (packet) {
                const args = packet.data || [];
                if (args[0] === 'update-location' && args[1] && args[1].data) {
                    try {
                        const bus = JSON.parse(args[1].data);
                        const lat = parseFloat(bus.latlng[0]);
                        const lng = parseFloat(bus.latlng[1]);
                        const unidadId = bus.unit_id; // ⬅️ FALTABA ESTO
                        
                        // 🛡️ Filtro de Privacidad
                        const busPunto = turf.point([lng, lat]);
                        let busVisible = true;
                        if (rutaParaTurf) {
                            busVisible = esBusVisible(busPunto, rutaParaTurf);
                        }

                        if (busVisible) {
                            // 🔥 CORRECCIÓN: Ahora le pasamos el objeto 'bus' completo
                            actualizarMarcadorBus(bus, rutaId);
                            // Ahora le mandamos la velocidad matemática corregida
                            registrarLatidoBusMotor(unidadId, bus.velocidadCalculada, rutaId);      

                            // ⏱️ ETA MASIVO
                            if (paraderosLimpios.length > 0 && rutaParaTurf) {
                                procesarETAMasivo(bus, busPunto, rutaParaTurf, paraderosLimpios, rutaId);
                            }
                        } else {
                            removerMarcadorBus(unidadId); // ⬅️ CORREGIDO
                        }
                    } catch (e) {}
                }
                originalOnEvent.call(this, packet);
            };
            
            socketsVindenMulti.push(unSocket);

        }, index * 300);
    });
}

/**
 * (ACTUALIZADO) Revisa el paso actual y decide si debe
 * iniciar la escucha de buses (y para dónde).
 */
function llamarEscuchaParaPaso(indicePaso) {
    // 1. Detenemos cualquier escucha anterior para no mezclar rutas
    detenerEscuchaBuses(); 

    const paso = rutaCompletaPlan[indicePaso];
    if (!paso) return;

    // 2. CASO A: Caminando hacia el paradero o esperando un transbordo
    if (paso.tipo === 'caminar' || paso.tipo === 'transbordo') {
        const proximoPasoBus = rutaCompletaPlan[indicePaso + 1];
        
        if (proximoPasoBus && proximoPasoBus.tipo === 'bus') {
            const rutaId = proximoPasoBus.ruta.properties.id;
            // El paradero de interés es donde vamos a SUBIR
            const paraderoDeSubida = proximoPasoBus.paraderoInicio;
            
            console.log(`Esperando bus: ETA para ${rutaId} en ${paraderoDeSubida.properties.nombre}`);
            iniciarEscuchaBuses(rutaId, paraderoDeSubida);
        }
    }
    // 3. CASO B: ¡Ya estamos arriba del camión!
    else if (paso.tipo === 'bus') {
        const rutaId = paso.ruta.properties.id;
        // El paradero de interés ahora es donde nos vamos a BAJAR
        const paraderoDeBajada = paso.paraderoFin;
        
        console.log(`Viajando en bus: ETA de bajada para ${rutaId} en ${paraderoDeBajada.properties.nombre}`);
        iniciarEscuchaBuses(rutaId, paraderoDeBajada);
    }
}

// js/app.js

/**
 * (NUEVO) Inicializa la app de Firebase (Gestión)
 * (Este código lo movimos desde DOMContentLoaded)
 */
function inicializarFirebaseGestion() {
    const gestionFirebaseConfig = {
      apiKey: "AIzaSyDcaVTGa3j1YZjbd1D52wNNc1qk7VnrorY",
      authDomain: "rutaskoox-gestion.firebaseapp.com",
      projectId: "rutaskoox-gestion",
      storageBucket: "rutaskoox-gestion.firebasestorage.app",
      messagingSenderId: "2555756265",
      appId: "1:2555756265:web:c6f7487ced40a4f6f87538",
      measurementId: "G-81656MC0ZC"
    };

    try {
        // Le damos un nombre ("gestionApp") para que no entre en conflicto
        // con tu app de "alertas"
        gestionApp = firebase.initializeApp(gestionFirebaseConfig, "gestionApp");
        dbGestion = gestionApp.firestore();
        console.log("Servicio de Gestión Firebase inicializado.");
    } catch (err) {
        console.error("Error inicializando Firebase Gestión", err);
    }
}

// ===============================================
// ⬇️⬇️ NUEVAS FUNCIONES DE BÚSQUEDA Y CHIPS (V2: LISTAS) ⬇️⬇️
// ===============================================

// Variable temporal para guardar los resultados de la búsqueda actual
let resultadosBusquedaActual = [];

/**
 * Orquestador: Busca en internet -> Si hay 1, selecciona. Si hay varios, muestra lista.
 */
async function ejecutarBusquedaInternet(query) {
    const btnBuscar = document.getElementById('btnBuscarLugar');
    
    // Feedback visual
    if(btnBuscar) {
        var iconoOriginal = btnBuscar.innerHTML;
        btnBuscar.innerHTML = '<i class="ri-loader-4-line ri-spin"></i>';
        btnBuscar.disabled = true;
    }

    try {
        // 1. Llamada al Servicio Modular (Pedimos hasta 15 resultados)
        const lugares = await buscarLugarEnNominatim(query, 100);

        if (lugares && lugares.length > 0) {
            
            if (lugares.length === 1) {
                // CASO A: Solo hay un resultado (ej. "Catedral"), lo seleccionamos directo
                procesarSeleccionLugar(lugares[0]);
            } else {
                // CASO B: Hay muchos resultados (ej. "Escuelas"), mostramos lista
                mostrarListaDeResultados(lugares);
            }

        } else {
            alert("No encontramos lugares con ese nombre en Campeche.");
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión al buscar.");
    } finally {
        if(btnBuscar) {
            btnBuscar.innerHTML = iconoOriginal;
            btnBuscar.disabled = false;
        }
    }
}

/**
 * Pinta una lista de tarjetas en el panel de instrucciones para que el usuario elija.
 */
function mostrarListaDeResultados(lugares) {
    const panelInst = document.getElementById('panel-instrucciones');
    resultadosBusquedaActual = lugares; // Guardamos en memoria

    let html = `
        <div class="info-seccion">
            <p style="margin-bottom:10px;">Encontramos <strong>${lugares.length}</strong> opciones:</p>
            <div class="lista-resultados" style="max-height: 60vh; overflow-y: auto; padding-bottom: 20px;">
    `;

    lugares.forEach((lugar, index) => {
        // Usamos el estilo .opcion-ruta para que parezcan tarjetas bonitas
        html += `
            <div class="opcion-ruta" onclick="window.app.seleccionarResultado(${index})" style="cursor:pointer; padding: 15px; margin-bottom: 10px;">
                <h4 style="margin:0 0 5px 0; font-size: 1em; color: var(--primary-color);">
                    <i class="ri-map-pin-line"></i> ${lugar.nombre}
                </h4>
                <small style="color: var(--text-color); opacity: 0.8; line-height: 1.2; display:block;">
                    ${lugar.direccion}
                </small>
            </div>
        `;
    });

    html += `</div></div>`;
    
    // Inyectamos el HTML
    panelInst.innerHTML = html;
    
    // Aseguramos que el panel esté visible
    abrirPanelControl();
}

// ===============================================
// ⬇️⬇️ CORRECCIÓN AQUÍ ⬇️⬇️
// ===============================================

// 1. PRIMERO: Aseguramos que 'window.app' exista
window.app = window.app || {}; 

// 2. AHORA SÍ: Asignamos la función
window.app.seleccionarResultado = (index) => {
    const lugar = resultadosBusquedaActual[index];
    if (lugar) {
        procesarSeleccionLugar(lugar);
    }
};

/**
 * Lógica final: Toma un lugar (lat/lng), busca el paradero y, si hay inicio, TRAZA LA RUTA.
 */
function procesarSeleccionLugar(lugar) {
    const infoLabel = document.getElementById('info-lugar-buscado');
    console.log("Procesando lugar:", lugar);

    // 1. Buscar paradero más cercano al destino elegido
    const puntoLugar = turf.point([lugar.lng, lugar.lat]);
    const paraderoCercano = encontrarParaderoMasCercano(puntoLugar);

    if (paraderoCercano) {
        // 2. Actualizar variable global de destino
        paraderoFin = paraderoCercano; 
        
        // 3. Actualizar VISUALMENTE el selector (Choices.js)
        if(choicesDestino) {
            // Esto pone el nombre del paradero en la cajita del menú
            choicesDestino.setChoiceByValue(paraderoCercano.properties.originalIndex.toString());
        }

        // ---------------------------------------------------------
        // 🚀 AQUÍ ESTÁ LA MAGIA: AUTO-ARRANQUE DE RUTA
        // ---------------------------------------------------------
        
        // Verificamos si ya tenemos un punto de partida (ya sea por GPS o Manual)
        if (paraderoInicioCercano) {
            console.log("📍 Inicio detectado, calculando ruta automática...");
            
            // a) Limpiamos mensajes anteriores
            instruccionesEl.innerHTML = ''; 

            // b) Ejecutamos la búsqueda de ruta DIRECTAMENTE
            // (Usamos las mismas funciones que usa el selector normal)
            const puntoDePartida = paraderoInicioCercano;
            listaDePlanes = encontrarRutaCompleta(puntoDePartida, paraderoFin, todosLosParaderos, todasLasRutas, mapRutaParaderos);
            
            // c) Mostramos los resultados (las líneas azules y opciones)
            mostrarPlanes(listaDePlanes);
            
        } else {
            // Si NO tenemos GPS aún, mostramos mensaje pidiendo inicio
            const panelInst = document.getElementById('panel-instrucciones');
            panelInst.innerHTML = `
                <div class="alerta-verde" style="text-align:left; margin-top:0;">
                    <strong>✅ Destino: ${lugar.nombre}</strong><br>
                    <small>Paradero más cercano: ${paraderoCercano.properties.nombre}</small>
                </div>
                <div style="background:#fff3e0; color:#e65100; padding:10px; margin-top:10px; border-radius:8px; border:1px solid #ffe0b2; text-align:center;">
                    📍 <strong>Falta tu ubicación</strong><br>
                    Espera al GPS o selecciona un "Inicio Manual" arriba.
                </div>
            `;
        }
        
        // 4. Aseguramos que el panel se abra para ver el resultado
        abrirPanelControl();

        // 5. Dibujar pin temporal en el mapa (solo visual)
        const tempMarker = L.marker([lugar.lat, lugar.lng], {
            icon: L.divIcon({
                className: 'icono-destino-especial',
                html: '<i class="ri-map-pin-star-fill" style="color:#E91E63; font-size:30px; text-shadow: 0 2px 5px rgba(0,0,0,0.3);"></i>',
                iconSize: [30, 30], iconAnchor: [15, 30]
            })
        }).addTo(map).bindPopup(`<b>${lugar.nombre}</b>`).openPopup();
        
        // 6. Centrar mapa y limpiar pin luego de unos segundos
        map.setView([lugar.lat, lugar.lng], 16);
        setTimeout(() => map.removeLayer(tempMarker), 5000);

    } else {
        alert("El lugar existe, pero está muy lejos de cualquier ruta de transporte.");
    }
}
/**
 * Muestra una lista de opciones turísticas (usando Choices.js o un menú simple)
 */
function mostrarOpcionesTurismo() {
    // Usamos un Prompt mejorado o inyectamos HTML temporalmente
    // Para simplificar, usaremos Choice.js del destino para mostrar las opciones
    
    if(!choicesDestino) return;

    // Crear un grupo de opciones temporal
    const opcionesTurismo = sitiosTuristicos.map(sitio => ({
        value: 'turismo_' + sitio.query, // Prefijo para identificar
        label: `📸 ${sitio.nombre}`,
        customProperties: { calle: 'Sitio Turístico', colonia: 'Recomendado' }
    }));

    // Esto es un truco: Reemplazamos las opciones del select por un momento
    // O mejor: Ejecutamos la búsqueda directamente si el usuario elige de una lista simple.
    
    // Opción Simple y Efectiva: Crear un menú modal rápido
    let menuHTML = `<div class="info-seccion"><h5>Sitios de Interés</h5><div class="chips-scroll" style="flex-wrap:wrap;">`;
    
    sitiosTuristicos.forEach(sitio => {
        menuHTML += `<button class="chip" onclick="window.app.buscarTurismo('${sitio.query}')">
            <i class="${sitio.icono}"></i> ${sitio.nombre}
        </button>`;
    });
    menuHTML += `</div></div>`;
    
    // Inyectar en el panel de instrucciones
    const panelInst = document.getElementById('panel-instrucciones');
    panelInst.innerHTML = menuHTML;
}

// Exponer función helper para el HTML inyectado arriba
window.app = window.app || {};
window.app.buscarTurismo = (query) => {
    ejecutarBusquedaInternet(query);
};



// ==========================================
// 🧪 MODO DE PRUEBAS: SIMULADOR (Integrado en app.js)
// ==========================================

// Asignamos la función a 'window' para poder llamarla desde la consola
window.simularBus = function() {
    
    // 1. Verificar si hay ruta activa (Ahora sí puede leer la variable interna)
    if (!rutaCompletaPlan || rutaCompletaPlan.length === 0) {
        alert("⚠️ Primero inicia una ruta de navegación (Pon inicio y destino).");
        return;
    }

    // 2. Buscar si la ruta tiene un tramo de BUS
    const pasoBus = rutaCompletaPlan.find(p => p.tipo === 'bus');
    if (!pasoBus) {
        alert("🚶 Tu ruta es solo de caminata. Elige un destino más lejos para usar bus.");
        return;
    }

    const nombreRuta = pasoBus.ruta.properties.id;
    console.log(`🚌 Iniciando simulación para: ${nombreRuta}`);

    // 3. Configurar coordenadas de inicio (Un poco antes del paradero de subida)
    const coords = pasoBus.paraderoInicio.geometry.coordinates;
    // Truco: Retrocedemos un poco lat/lng para que venga "llegando"
    let lat = coords[1] - 0.006; 
    let lng = coords[0] - 0.006;

    // 4. Crear icono visual del bus
    const icono = L.divIcon({
        className: 'bus-simulado',
        html: `
            <div style="
                background: #d32f2f; 
                border: 2px solid white; 
                color: white; 
                width: 44px; height: 44px; 
                border-radius: 50%; 
                display: flex; align-items: center; justify-content: center; 
                font-weight: bold; font-size: 10px;
                box-shadow: 0 4px 15px rgba(211, 47, 47, 0.5);
                animation: palpitar 1s infinite;
            ">
                TEST
            </div>
            <style>@keyframes palpitar { 0% {transform:scale(1);} 50% {transform:scale(1.1);} 100% {transform:scale(1);} }</style>
        `,
        iconSize: [44, 44]
    });

    // Añadir al mapa (Variable 'map' accesible desde aquí)
    const marker = L.marker([lat, lng], {icon: icono}).addTo(map);

    // 5. Animación de movimiento
    let dist = 3000; // metros ficticios
    alert(`👀 ¡Mira el mapa! Un bus de prueba (${nombreRuta}) se acerca a tu paradero.`);

    const intervalo = setInterval(() => {
        // Mover en diagonal acercándose
        lat += 0.00015; 
        lng += 0.00015; 
        dist -= 50;
        
        marker.setLatLng([lat, lng]);

        // 6. Intentar actualizar panel ETA (Panel de información)
        const etaDiv = document.getElementById('eta-info');
        if (etaDiv) {
            etaDiv.style.display = 'block';
            etaDiv.innerHTML = `
                <div style="background:#e3f2fd; padding:12px; margin-top:10px; border-radius:12px; border:1px solid #90caf9; display:flex; align-items:center; gap:10px;">
                    <div style="font-size:20px;">🚍</div>
                    <div>
                        <strong style="color:#1565c0;">BUS DE PRUEBA</strong>
                        <div style="font-size:1.1em; font-weight:bold;">${Math.max(1, Math.ceil(dist/500))} min</div>
                        <small style="color:#555;">A ${dist} metros</small>
                    </div>
                </div>
            `;
        }

        // Finalizar
        if (dist <= 100) {
            clearInterval(intervalo);
            alert("✅ ¡El bus simulado llegó al paradero!");
            map.removeLayer(marker);
            if(etaDiv) etaDiv.style.display = 'none';
        }
    }, 800); // Actualiza cada 0.8 segundos
};