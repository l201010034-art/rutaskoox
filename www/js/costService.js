// js/costService.js
import { userSettings } from './settings.js';

// Tarifas Oficiales: [Viaje 1, Viaje 2, Viaje 3, Viaje 4+]
const TARIFAS = {
    general: [12.00, 6.00, 0.00, 0.00],
    preferencial: [6.00, 3.00, 0.00, 0.00]
};

const VENTANA_TRANSBORDO_MS = 90 * 60 * 1000;

/**
 * Calcula el costo total de una ruta basándose en el número de buses a tomar,
 * el tipo de tarjeta del usuario, y si ya trae un viaje previo activo.
 */
export function calcularCostoEstimado(numBuses) {
    const esPreferencial = userSettings.tarifaPreferencial;
    const tabla = esPreferencial ? TARIFAS.preferencial : TARIFAS.general;

    let viajesPrevios = 0;
    let aplicaTransbordoActivo = false;
    
    // Leemos la memoria del monedero
    try {
        const walletState = JSON.parse(localStorage.getItem('kooxWallet'));
        if (walletState && walletState.ultimoCobro) {
            const ahora = Date.now();
            if (ahora - walletState.ultimoCobro <= VENTANA_TRANSBORDO_MS) {
                viajesPrevios = walletState.viajesEnVentana || 0;
                if (viajesPrevios > 0) aplicaTransbordoActivo = true; // ⬅️ Detecta si trae viaje previo
            }
        }
    } catch(e) { console.warn("No se pudo leer el estado del monedero."); }

    let costoTotal = 0;
    let indiceTarifa = viajesPrevios;

    for (let i = 0; i < numBuses; i++) {
        if (indiceTarifa < tabla.length) {
            costoTotal += tabla[indiceTarifa];
        }
        indiceTarifa++;
    }

    // 🚀 AHORA DEVUELVE UN OBJETO CON AMBOS DATOS
    return { costoTotal, aplicaTransbordoActivo }; 
}

/**
 * Comprueba si el saldo actual alcanza para la ruta.
 */
export function checkSaldoParaRuta(costoEstimado) {
    let saldo = 0;
    try {
        const walletState = JSON.parse(localStorage.getItem('kooxWallet'));
        if (walletState) saldo = parseFloat(walletState.saldo) || 0;
    } catch(e) {}
    
    return saldo >= costoEstimado;
}

/**
 * Lanza la alerta amigable de recarga.
 */
export function advertirSaldoInsuficiente(costoEstimado) {
    let saldo = 0;
    try {
        const walletState = JSON.parse(localStorage.getItem('kooxWallet'));
        if (walletState) saldo = parseFloat(walletState.saldo) || 0;
    } catch(e) {}

    // Creamos un modal de sistema nativo, rápido y efectivo
    alert(`⚠️ Saldo Virtual Insuficiente\n\nEl costo de esta ruta será de aprox. $${costoEstimado.toFixed(2)}, pero tienes $${saldo.toFixed(2)}.\n\nRecuerda que puedes recargar tu tarjeta en puntos oficiales como Willys, Dunosusa u Oxxo.\n\n(Puedes continuar usando el mapa).`);
}