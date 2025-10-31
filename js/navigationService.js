// js/navigationService.js

// Umbral en metros. Si el usuario se mueve menos que esto,
// se considera que está "detenido" (esperando el camión).
const UMBRAL_MOVIMIENTO = 15; // 15 metros

let posicionAnterior = null;
let distanciaRecorridaTotal = 0; // en metros
let tiempoDetenido = 0; // en segundos
let enMovimiento = false;
let temporizador = null; // Referencia al setInterval
let tiempoTotalViaje = 0; // <-- NUEVA VARIABLE

function onTick() {
    // Incrementamos el tiempo total del viaje SIN CONDICIONES
    tiempoTotalViaje++;

    // Incrementamos el tiempo de espera SÓLO SI no se mueve
    if (!enMovimiento) {
        tiempoDetenido++;
    }
}

/**
 * Inicia la sesión de navegación.
 */
export function startNavigation(puntoInicio) {
    posicionAnterior = puntoInicio;
    distanciaRecorridaTotal = 0;
    tiempoDetenido = 0;
    tiempoTotalViaje = 0; // <-- RESETEAR
    enMovimiento = false; 
    
    if (temporizador) clearInterval(temporizador);
    temporizador = setInterval(onTick, 1000);
    console.log("NavigationService: Iniciado.");
}

/**
 * Detiene la sesión de navegación.
 */
export function stopNavigation() {
    if (temporizador) clearInterval(temporizador);
    temporizador = null;
    posicionAnterior = null;
    console.log("NavigationService: Detenido.");
    // No reseteamos los contadores aquí, para poder ver el resumen
}

/**
 * Actualiza el estado de navegación con una nueva coordenada.
 */
export function updatePosition(puntoActual) {
    // ... (Cálculo de distancia y 'enMovimiento' ... ¡sin cambios!) ...
    if (!posicionAnterior) { /* ... */ }
    const distanciaDelta = turf.distance(posicionAnterior, puntoActual, { units: 'meters' });
    distanciaRecorridaTotal += distanciaDelta;
    if (distanciaDelta < UMBRAL_MOVIMIENTO) {
        enMovimiento = false;
    } else {
        enMovimiento = true;
        tiempoDetenido = 0; 
    }
    posicionAnterior = puntoActual;

    // Devolvemos el estado actual para que app.js lo muestre
    return {
        distanciaRecorrida: distanciaRecorridaTotal,
        tiempoDetenido: tiempoDetenido,
        tiempoTotalViaje: tiempoTotalViaje, // <-- DEVOLVER NUEVO VALOR
        enMovimiento: enMovimiento
    };
}