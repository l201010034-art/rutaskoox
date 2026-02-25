// js/statusEngine.js

let flotaActiva = new Map(); // unidadId -> { speed, lastUpdate, rutaId }
let rutasMonitorizadas = new Set();
let tiempoInicioRuta = 0;
let motorInterval = null;

export function iniciarMotorInteligente(rutasIds) {
    flotaActiva.clear();
    rutasMonitorizadas = new Set(Array.isArray(rutasIds) ? rutasIds : [rutasIds]);
    tiempoInicioRuta = Date.now();
    
    if (motorInterval) clearInterval(motorInterval);
    motorInterval = setInterval(evaluarEscenario, 4000); 
    renderizarBanner({ tipo: 'status-ok' }); 
}

export function detenerMotorInteligente() {
    if (motorInterval) clearInterval(motorInterval);
    flotaActiva.clear();
    rutasMonitorizadas.clear();
    renderizarBanner({ tipo: 'status-ok' });
}

// 🧠 AHORA RECIBE EL ID DE LA RUTA
export function registrarLatidoBusMotor(unidadId, velocidadKmH, rutaId) {
    flotaActiva.set(unidadId, { 
        speed: velocidadKmH, 
        rutaId: rutaId,
        lastUpdate: Date.now() 
    });
}

function evaluarEscenario() {
    const ahora = new Date();
    const hora = ahora.getHours();
    
    // Asumimos que el servicio termina a las 10 PM fines de semana y 11 PM entre semana
    const limiteCierre = (ahora.getDay() === 0 || ahora.getDay() === 6) ? 22 : 24; 

    // 1. Limpiar buses desconectados (2 minutos sin señal)
    const limiteTiempo = ahora.getTime() - 120000;
    for (const [id, datos] of flotaActiva.entries()) {
        if (datos.lastUpdate < limiteTiempo) flotaActiva.delete(id);
    }

    // --- REGLA 1: APAGADO GENERAL (Madrugada) ---
    if (hora >= limiteCierre || hora < 5) {
        renderizarBanner({ 
            tipo: 'status-nocturno', 
            icon: 'ri-moon-clear-line', 
            texto: 'Servicio finalizado por hoy' 
        });
        return; // Detiene la evaluación
    }

    // Contamos cuántos buses hay POR CADA RUTA
    let conteoPorRuta = {};
    rutasMonitorizadas.forEach(r => conteoPorRuta[r] = 0);
    
    flotaActiva.forEach(datos => {
        if (conteoPorRuta[datos.rutaId] !== undefined) {
            conteoPorRuta[datos.rutaId]++;
        }
    });

    // --- REGLA 2: ALERTAS POR RUTA (Cero unidades o Última unidad) ---
    for (const [rutaId, cantidad] of Object.entries(conteoPorRuta)) {
        if (!rutaId || rutaId === 'undefined') continue;
        
        const nombreLimpio = String(rutaId).replace('koox-', '').toUpperCase();

        // A. Alerta Roja: La ruta está completamente muerta
        if (cantidad === 0 && (Date.now() - tiempoInicioRuta > 8000)) {
            renderizarBanner({ 
                tipo: 'status-critico', 
                icon: 'ri-alert-line', 
                texto: `La ruta ${nombreLimpio} no tiene unidades activas.` 
            });
            return; 
        }

        // B. Alerta Morada: ¡ÚLTIMA UNIDAD! (Súper útil en las noches)
        if (cantidad === 1 && (Date.now() - tiempoInicioRuta > 8000)) {
            // Solo lo mostramos como crítico si ya es tarde (después de las 7 PM)
            if (hora >= 19) {
                renderizarBanner({ 
                    tipo: 'status-nocturno', 
                    icon: 'ri-alarm-warning-fill', 
                    texto: `¡Corre! Es la ÚLTIMA unidad de la ruta ${nombreLimpio}.` 
                });
                return;
            } else {
                // Si es de día, solo es servicio limitado
                renderizarBanner({ 
                    tipo: 'status-trafico', 
                    icon: 'ri-error-warning-line', 
                    texto: `Servicio muy limitado en ruta ${nombreLimpio} (1 unidad).` 
                });
                return;
            }
        }
    }

    // --- REGLA 3: TRÁFICO DENSO (Evaluación general) ---
    let velocidadTotal = 0;
    let detenidos = 0;
    
    flotaActiva.forEach(datos => {
        velocidadTotal += datos.speed;
        if (datos.speed < 8) detenidos++; 
    });

    const numBusesActivos = flotaActiva.size;
    
    if (numBusesActivos >= 3) {
        const velocidadPromedio = velocidadTotal / numBusesActivos;
        if (velocidadPromedio < 15 && detenidos >= (numBusesActivos / 2)) {
            renderizarBanner({ 
                tipo: 'status-trafico', 
                icon: 'ri-traffic-light-fill', 
                texto: 'Tráfico denso detectado: Posibles retrasos' 
            });
            return; 
        }
    }

    // --- TODO EN ORDEN ---
    renderizarBanner({ tipo: 'status-ok' });
}

function renderizarBanner(estado) {
    let banner = document.getElementById('banner-inteligente-koox');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'banner-inteligente-koox';
        
        // 🚀 CAMBIO CLAVE: Lo sacamos del 'map' y lo anclamos al 'body'
        document.body.appendChild(banner); 
    }

    if (estado.tipo === 'status-ok') {
        banner.classList.remove('visible');
        return;
    }
    banner.className = `${estado.tipo} visible`;
    banner.innerHTML = `<i class="${estado.icon}" style="font-size: 1.2em;"></i> <span>${estado.texto}</span>`;
}