// js/locationService.js

/**
 * Obtiene la ubicación del usuario UNA VEZ.
 * @param {function} onSuccess - Callback con la posición (pos)
 * @param {function} onError - Callback con el error (err)
 */
export function getUbicacionUsuario(onSuccess, onError) {
    if (!navigator.geolocation) {
        onError({ message: "Geolocalización no soportada" });
        return;
    }
    navigator.geolocation.getCurrentPosition(onSuccess, onError);
}

/**
 * Inicia el rastreo EN VIVO de la ubicación del usuario.
 * @param {function} onUpdate - Callback con la nueva posición (pos)
 * @param {function} onError - Callback con el error (err)
 * @returns {number} El ID del rastreador (para detenerlo)
 */
export function iniciarWatchLocation(onUpdate, onError) {
    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    return navigator.geolocation.watchPosition(onUpdate, onError, options);
}

/**
 * Detiene el rastreo en vivo.
 * @param {number} watchId - El ID devuelto por iniciarWatchLocation
 */
export function detenerWatchLocation(watchId) {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
    }
}