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
    const limiteCierre = (ahora.getDay() === 0 || ahora.getDay() === 6) ? 22 : 23; 

    // 1. Limpiar buses desconectados (2 minutos sin señal)
    const limiteTiempo = ahora.getTime() - 120000;
    for (const [id, datos] of flotaActiva.entries()) {
        if (datos.lastUpdate < limiteTiempo) flotaActiva.delete(id);
    }

    if (hora >= limiteCierre || hora < 5) {
        renderizarBanner({ tipo: 'status-critico', icon: 'ri-moon-clear-line', texto: 'Servicio finalizado por hoy' });
        return;
    }

    // --- EL ESCÁNER DE VIAJE (Pre-Flight Check) ---
    // Contamos cuántos buses hay POR CADA RUTA que necesita el usuario
    let conteoPorRuta = {};
    rutasMonitorizadas.forEach(r => conteoPorRuta[r] = 0);
    
    flotaActiva.forEach(datos => {
        if (conteoPorRuta[datos.rutaId] !== undefined) {
            conteoPorRuta[datos.rutaId]++;
        }
    });

 // ... dentro de evaluarEscenario(), en la parte del Escáner de Viaje ...
    
    for (const [rutaId, cantidad] of Object.entries(conteoPorRuta)) {
        // 🛡️ SEGURO: Ignoramos si la ruta es undefined o nula
        if (!rutaId || rutaId === 'undefined') continue;

        if (cantidad === 0 && (Date.now() - tiempoInicioRuta > 8000)) {
            const nombreLimpio = String(rutaId).replace('koox-', '').toUpperCase();
            renderizarBanner({ 
                tipo: 'status-critico', 
                icon: 'ri-alert-line', 
                texto: `La ruta ${nombreLimpio} no tiene unidades activas.` 
            });
            return; 
        }
    }

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