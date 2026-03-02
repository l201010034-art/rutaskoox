// js/walletService.js
import { userSettings } from './settings.js'; // 🚀 ESTA ES LA LÍNEA QUE FALTA
// 🚀 VERSIÓN DEL MONEDERO (Cámbialo si en el futuro haces otra actualización masiva)
const VERSION_ACTUAL_MONEDERO = "2.0";

// 💾 Memoria a largo plazo (Se guarda en el celular)
let walletState = JSON.parse(localStorage.getItem('kooxWallet'));

// 🛡️ CONTROL DE VERSIONES: Si es un usuario viejo o no tiene la versión 2.0, formateamos su monedero
if (!walletState || walletState.version !== VERSION_ACTUAL_MONEDERO) {
    console.log("♻️ Actualizando monedero a la versión " + VERSION_ACTUAL_MONEDERO);
    walletState = {
        saldo: 0.00,
        viajesEnVentana: 0,
        ultimoCobro: 0,
        ultimaUnidadCobrada: null,
        tarjetaId: null,      
        tipoTarjeta: 'general',
        version: VERSION_ACTUAL_MONEDERO // ⬅️ Sello de la nueva versión
    };
    localStorage.setItem('kooxWallet', JSON.stringify(walletState));
    
    // También reseteamos el ajuste de tarifa por seguridad
    userSettings.tarifaPreferencial = false;
    localStorage.setItem('kooxSettings', JSON.stringify(userSettings));
}

export function obtenerDatosTarjeta() {
    return {
        id: walletState.tarjetaId,
        tipo: walletState.tipoTarjeta
    };
}

export function vincularTarjetaQR(id, tipo) {
    walletState.tarjetaId = id; // ⬅️ Asegúrate de que esta línea exista
    walletState.tipoTarjeta = tipo;
    
    if (tipo === 'estudiante' || tipo === 'discapacidad' || tipo === 'inapam') {
        userSettings.tarifaPreferencial = true;
    } else {
        userSettings.tarifaPreferencial = false;
    }
    
    localStorage.setItem('kooxSettings', JSON.stringify(userSettings));
    guardarWallet();
}

export function fijarSaldo(cantidad) {
    let nuevoSaldo = parseFloat(cantidad);
    if (isNaN(nuevoSaldo) || nuevoSaldo < 0) nuevoSaldo = 0;
    
    walletState.saldo = nuevoSaldo;
    guardarWallet();
}

// 🚶‍♂️ Estado físico en vivo (Se borra si cierra la app)
export let estadoFisico = {
    ancladoAUnidad: null,
    tiempoUltimaVezCaminando: Date.now()
};

export function recargarSaldo(cantidad) {
    walletState.saldo += parseFloat(cantidad);
    guardarWallet();
}

export function obtenerSaldo() {
    return walletState.saldo.toFixed(2);
}

function guardarWallet() {
    localStorage.setItem('kooxWallet', JSON.stringify(walletState));
    // Actualiza la UI si existe el elemento
    const uiSaldo = document.getElementById('ui-saldo-virtual');
    if (uiSaldo) uiSaldo.innerText = `$${obtenerSaldo()}`;
}

/**
 * 🚦 LIBERACIÓN DE CANDADO: Evalúa si el usuario ya se bajó del camión.
 */
export function reportarVelocidadUsuario(velocidadKmH) {
    if (velocidadKmH > 5) {
        // Va a velocidad de vehículo, reiniciamos el reloj de "caminando"
        estadoFisico.tiempoUltimaVezCaminando = Date.now();
    } else {
        // Va lento (< 5km/h). Si lleva 60 segundos así y estaba anclado a un bus:
        if (estadoFisico.ancladoAUnidad && (Date.now() - estadoFisico.tiempoUltimaVezCaminando > TIEMPO_DESCENSO_MS)) {
            console.log(`🚷 Descenso detectado de la unidad ${estadoFisico.ancladoAUnidad}. Candado liberado.`);
            estadoFisico.ancladoAUnidad = null; 
        }
    }
}

export function procesarAbordaje(rutaId, unidadId) {
    if (!walletState) return false;

    const ahora = Date.now();
    const VENTANA_TRANSBORDO_MS = 90 * 60 * 1000; // 90 minutos para transbordos

    // 1. Calcular en qué número de viaje del transbordo estamos
    if (walletState.ultimoCobro && (ahora - walletState.ultimoCobro <= VENTANA_TRANSBORDO_MS)) {
        walletState.viajesEnVentana += 1; // Es un transbordo activo
    } else {
        walletState.viajesEnVentana = 1; // Primer viaje del día o la ventana expiró
    }

    // 2. Determinar el costo según tarifas oficiales
    const esPreferencial = userSettings.tarifaPreferencial;
    // Tabla: [Viaje 1, Viaje 2, Viaje 3, Viaje 4+]
    const tarifas = esPreferencial ? [6.00, 3.00, 0.00, 0.00] : [12.00, 6.00, 0.00, 0.00];
    
    // El índice es el viaje actual menos 1 (Ej. Viaje 1 = Índice 0)
    const indiceTarifa = Math.min(walletState.viajesEnVentana - 1, 3);
    const costoViaje = tarifas[indiceTarifa];

    // 3. Validar Saldo
    if (walletState.saldo < costoViaje) {
        mostrarAlertaUI("Saldo Insuficiente", `Necesitas $${costoViaje.toFixed(2)}. Tu saldo es $${walletState.saldo.toFixed(2)}`);
        return false; // Bloquea el abordaje
    }

    // 4. Ejecutar el cobro
    walletState.saldo -= costoViaje;
    walletState.ultimoCobro = ahora;
    walletState.ultimaUnidadCobrada = unidadId;
    
    localStorage.setItem('kooxWallet', JSON.stringify(walletState));

    // 5. Notificar
    console.log(`💳 Cobro exitoso: $${costoViaje.toFixed(2)} por viaje #${walletState.viajesEnVentana} (Ruta ${rutaId})`);
    const tipoViaje = costoViaje === 0 ? "Transbordo Gratuito" : "Pasaje Pagado";
    mostrarAlertaUI(`✅ ${tipoViaje}`, `Unidad ${unidadId}. Saldo restante: $${walletState.saldo.toFixed(2)}`);
    
    return true; // Abordaje autorizado
}

async function mostrarAlertaUI(titulo, mensaje) {
    console.log(`[MONEDERO] ${titulo}: ${mensaje}`);
    try {
        await LocalNotifications.schedule({
            notifications: [{
                title: titulo,
                body: mensaje,
                id: Math.floor(Math.random() * 10000),
                schedule: { at: new Date(Date.now() + 1000) },
                sound: 'beep.wav'
            }]
        });
    } catch (e) { alert(`${titulo}\n${mensaje}`); }
}

export function desvincularTarjetaQR() {
    walletState.tarjetaId = null;
    walletState.tipoTarjeta = 'general';
    
    // Regresamos el cobro a pasaje normal ($12)
    userSettings.tarifaPreferencial = false;
    localStorage.setItem('kooxSettings', JSON.stringify(userSettings));
    
    guardarWallet();
}