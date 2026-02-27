// js/navigationService.js
import { procesarAbordaje, reportarVelocidadUsuario, estadoFisico } from './walletService.js';
// ⚠️ IMPORTANTE: Necesitamos importar el mapa y los marcadores desde app.js o mapService.js para buscar los camiones físicos
import { marcadoresBuses } from './mapService.js'; 

// Estado de navegación
let puntoDePartida = null;
let distanciaRecorrida = 0;
let tiempoDetenido = 0;
let enMovimiento = false;
let ultimoCheck = null;
let ultimaPosicion = null;
let tiempoTotalViaje = 0;
let inicioViajeTimestamp = null;
let enModoTransbordo = false; 

// Variables globales para el filtro anti-cruces
let tiempoCercaDelBus = 0;
let busCandidatoAnterior = null;

const UMBRAL_VELOCIDAD_MOVIMIENTO = 1.0; 
const UMBRAL_DISTANCIA_FALLBACK = 3;   

export function startNavigation(puntoInicioGeoJSON) {
    puntoDePartida = puntoInicioGeoJSON;
    distanciaRecorrida = 0;
    tiempoDetenido = 0;
    enMovimiento = false;
    ultimoCheck = Date.now();
    ultimaPosicion = puntoDePartida;
    inicioViajeTimestamp = Date.now();
    tiempoTotalViaje = 0;
    enModoTransbordo = false; 
    console.log("NavigationService: Iniciado.");
}

export function stopNavigation() {
    puntoDePartida = null;
    ultimoCheck = null;
    ultimaPosicion = null;
    inicioViajeTimestamp = null;
    enModoTransbordo = false; 
    console.log("NavigationService: Detenido.");
}

export function activarModoTransbordo() {
    console.log("NavigationService: Modo Transbordo ACTIVADO.");
    enModoTransbordo = true;
}

/**
 * 🚌 FUNCIÓN REAL: Busca en el mapa qué camión físico está a menos de 15 metros del usuario.
 */
function encontrarBusAmenosDe15Metros(userPunto) {
    let busMasCercano = null;
    let distanciaMinima = 15; // Empezamos con el límite máximo de 15 metros

    if (!marcadoresBuses || marcadoresBuses.size === 0) return null;

    // Iteramos sobre todos los camiones vivos en el mapa
    marcadoresBuses.forEach((marker, unidadId) => {
        const latlng = marker.getLatLng();
        const busPunto = turf.point([latlng.lng, latlng.lat]);
        const distanciaMetros = turf.distance(userPunto, busPunto, { units: 'meters' });

        if (distanciaMetros < distanciaMinima) {
            distanciaMinima = distanciaMetros;
            
            // Extraemos la rutaId del popup del marcador (o la pasamos como opción)
            // Si en mapService.js no guardaste la rutaId en el marker, la leeremos de su clase o estado
            // Aquí asumo que la guardaremos en marker.options.rutaId
            busMasCercano = {
                unit_id: unidadId,
                rutaId: marker.options.rutaId || 'koox-desconocida',
                distancia: distanciaMetros
            };
        }
    });

    return busMasCercano;
}

/**
 * Actualiza el estado de la navegación basado en la nueva posición del usuario.
 * @param {Object} puntoUsuario - Nueva posición del usuario (GeoJSON Point)
 * @param {number | null} speed - Velocidad reportada por el GPS (en m/s)
 */
export function updatePosition(puntoUsuario, speed) {
    if (!puntoUsuario || !puntoUsuario.geometry || !puntoUsuario.geometry.coordinates) return null;

    const speedKmH = (speed || 0) * 3.6; 
    
    // 2. AVISO AL MONEDERO (Para liberar el candado al bajarse)
    reportarVelocidadUsuario(speedKmH);

    // --- LA LÓGICA DE ABORDAJE FUE TRASLADADA A APP.JS PARA EVITAR CONFLICTOS ---

    if (!puntoDePartida || !ultimoCheck || !ultimaPosicion) {
        return null;
    }

    const ahora = Date.now();
    const tiempoPasadoSegundos = (ahora - ultimoCheck) / 1000;
    const distanciaMovidaMetros = turf.distance(ultimaPosicion, puntoUsuario, { units: 'meters' });

    if (distanciaMovidaMetros > 1.0) {
        distanciaRecorrida += distanciaMovidaMetros;
    }

    tiempoTotalViaje = Math.floor((ahora - inicioViajeTimestamp) / 1000);

    let movimientoDetectado = false;
    
    if (speed !== null && speed !== undefined) {
        if (speed > UMBRAL_VELOCIDAD_MOVIMIENTO) {
            movimientoDetectado = true;
        }
    } else {
        if (distanciaMovidaMetros > UMBRAL_DISTANCIA_FALLBACK) {
            movimientoDetectado = true;
        }
    }

    if (movimientoDetectado) {
        enMovimiento = true;
        tiempoDetenido = 0; 
    } else {
        enMovimiento = false;
        if (!enModoTransbordo) {
            tiempoDetenido += tiempoPasadoSegundos; 
        }
    }
    
    ultimaPosicion = puntoUsuario;
    ultimoCheck = ahora;

    return {
        distanciaRecorrida: distanciaRecorrida,
        tiempoDetenido: Math.round(tiempoDetenido),
        enMovimiento: enMovimiento,
        tiempoTotalViaje: tiempoTotalViaje,
        enModoTransbordo: enModoTransbordo 
    };
}