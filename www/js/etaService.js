// js/etaService.js

/**
 * MÓDULO DE ETA MASIVO (Con Matemática Circular y Auto-Limpieza)
 */

let etasGlobales = {}; // { paraderoId: { rutaId: { etaMinutos, unidad, actualizado, distanciaMetros } } }

export function limpiarETAs() {
    etasGlobales = {};
    document.querySelectorAll('.eta-live-badge').forEach(el => el.innerHTML = '');
}

/**
 * Calcula el tiempo faltante de un bus hacia múltiples paraderos.
 */
export function procesarETAMasivo(bus, busPunto, rutaGeoJSON, paraderos, rutaId) {
    if (!bus || !busPunto || !rutaGeoJSON || !paraderos) return;
    
    const unidadId = bus.unit_id;
    const unidadNumero = bus.unit_number || unidadId;
    const velocidadReal = bus.status === 5 ? 0 : Math.min(parseFloat(bus.speed) / 3.6 || 0, 22.2);

    const puntoBusEnRuta = turf.nearestPointOnLine(rutaGeoJSON, busPunto);
    const distBusKm = puntoBusEnRuta.properties.location;

    paraderos.forEach(paradero => {
        const paraderoId = paradero.properties.originalIndex;
        const puntoParaderoEnRuta = turf.nearestPointOnLine(rutaGeoJSON, paradero.geometry.coordinates);
        const distParaderoKm = puntoParaderoEnRuta.properties.location;

        const distanciaFaltanteKm = distParaderoKm - distBusKm;

        // 🛡️ REGLA TOPOLÓGICA: Solo tomamos en cuenta buses que VAN hacia el paradero
        if (distanciaFaltanteKm > -0.05) {
            const distanciaMetros = distanciaFaltanteKm * 1000;
            const etaMinutos = velocidadReal > 1.0 ? Math.round((distanciaMetros / velocidadReal) / 60) : null;

            // --- LÓGICA INTEGRADA DE ACTUALIZACIÓN ---
            if (!etasGlobales[paraderoId]) etasGlobales[paraderoId] = {};
            
            const busPrevio = etasGlobales[paraderoId][rutaId];
            
            // Solo actualizamos si es la misma unidad que ya seguíamos, 
            // o si esta nueva unidad está MÁS CERCA que la anterior.
            if (!busPrevio || busPrevio.unidad === unidadNumero || distanciaMetros < busPrevio.distanciaMetros) {
                etasGlobales[paraderoId][rutaId] = {
                    etaMinutos: etaMinutos,
                    unidad: unidadNumero,
                    distanciaMetros: distanciaMetros,
                    actualizado: Date.now()
                };
            }

        } else {
            // --- LÓGICA INTEGRADA DE ELIMINACIÓN ---
            // Si el bus ya pasó, lo eliminamos de este paradero específico
            if (etasGlobales[paraderoId] && etasGlobales[paraderoId][rutaId] && etasGlobales[paraderoId][rutaId].unidad === unidadNumero) {
                delete etasGlobales[paraderoId][rutaId];
            }
        }
    });

    // Refrescamos la UI después de procesar todos los paraderos
    limpiarETAsCaducos();
    actualizarUIDeETAs();
}

/**
 * Auto-limpieza: Borra los ETAs de los camiones que ya pasaron el paradero o perdieron conexión.
 */
function limpiarETAsCaducos() {
    const ahora = Date.now();
    for (const pid in etasGlobales) {
        for (const rutaId in etasGlobales[pid]) {
            // Si pasaron 15 segundos y el bus no actualizó este ETA, es que ya pasó o se apagó
            if (ahora - etasGlobales[pid][rutaId].actualizado > 15000) {
                delete etasGlobales[pid][rutaId];
            }
        }
        // Si el paradero se quedó sin camiones próximos, limpiamos su texto visual
        if (Object.keys(etasGlobales[pid]).length === 0) {
            delete etasGlobales[pid];
            document.querySelectorAll(`.eta-contenedor-${pid}`).forEach(c => c.innerHTML = '');
        }
    }
}

/**
 * Inyecta los tiempos calculados en el HTML de los paraderos.
 */
function actualizarUIDeETAs() {
    for (const [pid, rutas] of Object.entries(etasGlobales)) {
        const contenedores = document.querySelectorAll(`.eta-contenedor-${pid}`);
        if (contenedores.length > 0) {
            let html = '';
            for (const [rutaId, info] of Object.entries(rutas)) {
                // Si va muy lento (tráfico), mostramos los metros en lugar de un "0 min" o nulo
                const textoTiempo = info.etaMinutos !== null ? `Llega en ${info.etaMinutos} min` : `A ${info.distanciaMetros.toFixed(0)}m`;
                
                html += `<div style="color: #d97706; font-size: 0.85em; font-weight: bold; margin-top: 3px; background: #fef3c7; padding: 2px 6px; border-radius: 4px; display: inline-block;">
                            <i class="ri-timer-flash-line"></i> ${rutaId.replace('koox-','')}: ${textoTiempo} <small>(U-${info.unidad})</small>
                         </div><br>`;
            }
            contenedores.forEach(c => c.innerHTML = html);
        }
    }
}