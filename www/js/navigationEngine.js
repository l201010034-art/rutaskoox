// js/navigationEngine.js

export const NavEngine = {
    state: {
        activa: false,
        modo: 'manual', // 'live' o 'manual'
        rutaPlan: [],
        pasoActual: 0
    },

    ui: {}, // Referencias al DOM

    // Inicializa el motor
    start: function(rutaCompleta, tieneGPS) {
        this.state.activa = true;
        this.state.rutaPlan = rutaCompleta;
        this.state.pasoActual = 0;
        this.state.modo = tieneGPS ? 'live' : 'manual';

        // Mapear elementos del DOM
        this.ui = {
            hud: document.getElementById('hud-navegacion'),
            barraProgreso: document.getElementById('hud-progress-bar'),
            icono: document.getElementById('hud-icon'),
            instruccion: document.getElementById('hud-instruccion'),
            detalles: document.getElementById('hud-detalles'),
            estadoLive: document.getElementById('hud-estado-live'),
            controlesManuales: document.getElementById('hud-controles-manuales'),
            btnSiguiente: document.getElementById('btnNavSiguiente'),
            btnAnterior: document.getElementById('btnNavAnterior'),
            btnFinalizar: document.getElementById('btnNavFinalizar'),
            btnCerrar: document.getElementById('btnCerrarHud')
        };

        this.prepararUI();
        this.renderPaso(0);
        
        // Mostrar el HUD
        this.ui.hud.classList.remove('oculto');
        
        console.log(`🚀 Motor de Navegación Iniciado en Modo: ${this.state.modo.toUpperCase()}`);
    },

    prepararUI: function() {
        // Mostrar/Ocultar controles según el modo (El Failsafe)
        if (this.state.modo === 'live') {
            this.ui.controlesManuales.classList.add('oculto');
            this.ui.estadoLive.classList.remove('oculto');
        } else {
            this.ui.controlesManuales.classList.remove('oculto');
            this.ui.estadoLive.classList.add('oculto');
            
            // Aviso visual de que estamos offline
            this.ui.icono.style.backgroundColor = '#f8f9fa';
        }

        // Asignar eventos a los botones si estamos en manual
        this.ui.btnSiguiente.onclick = () => this.avanzarManual();
        this.ui.btnAnterior.onclick = () => this.retrocederManual();
        this.ui.btnFinalizar.onclick = () => this.finalizar();
        this.ui.btnCerrar.onclick = () => this.detener();
    },

    renderPaso: function(indice) {
        const paso = this.state.rutaPlan[indice];
        if (!paso) return;

        // 1. Configurar Ícono y Textos
        let iconoEmoji = '🔄';
        let colorFondo = '#fff3cd'; // Amarillo transbordo por defecto

        if (paso.tipo === 'bus') {
            iconoEmoji = '🚌';
            colorFondo = '#e3f2fd'; // Azul
            this.ui.detalles.textContent = `Baja en: ${paso.paraderoFin.properties.nombre}`;
        } else if (paso.tipo === 'caminar') {
            iconoEmoji = '🚶‍♂️';
            colorFondo = '#e8f5e9'; // Verde
            this.ui.detalles.textContent = `Aprox. ${paso.tiempoEstimadoMin || 1} min`;
        } else {
            this.ui.detalles.textContent = "Espera tu siguiente ruta";
        }

        this.ui.icono.textContent = iconoEmoji;
        // Solo pintamos colores bonitos si estamos en modo Live (Internet/GPS)
        if (this.state.modo === 'live') {
            this.ui.icono.style.backgroundColor = colorFondo;
        }

        // Instrucción principal limpiecita (sin la distancia, esa va en detalles)
        let textoPrincipal = paso.texto.split('(')[0].trim();
        this.ui.instruccion.textContent = textoPrincipal;

        // 2. Progreso
        const porcentaje = ((indice + 1) / this.state.rutaPlan.length) * 100;
        this.ui.barraProgreso.style.width = `${porcentaje}%`;

        // 3. Lógica de botones (Solo si es manual)
        if (this.state.modo === 'manual') {
            const esUltimo = indice === this.state.rutaPlan.length - 1;
            this.ui.btnSiguiente.style.display = esUltimo ? 'none' : 'flex';
            this.ui.btnAnterior.disabled = (indice === 0);
            
            if (esUltimo) {
                this.ui.btnFinalizar.classList.remove('oculto');
            } else {
                this.ui.btnFinalizar.classList.add('oculto');
            }
        }

        // Despachar evento para que app.js dibuje el mapa
        document.dispatchEvent(new CustomEvent('nav-engine-step', { detail: { indice } }));
    },

    avanzarManual: function() {
        if (this.state.pasoActual < this.state.rutaPlan.length - 1) {
            this.state.pasoActual++;
            this.renderPaso(this.state.pasoActual);
        }
    },

    retrocederManual: function() {
        if (this.state.pasoActual > 0) {
            this.state.pasoActual--;
            this.renderPaso(this.state.pasoActual);
        }
    },

    // Esta función la llamará app.js cuando el GPS detecte que avanzaste
    autoAvanzar: function() {
        if (this.state.modo !== 'live') return;
        
        if (this.state.pasoActual < this.state.rutaPlan.length - 1) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // 📳 Haptic!
            this.state.pasoActual++;
            this.renderPaso(this.state.pasoActual);
        } else {
            this.finalizar();
        }
    },

    finalizar: function() {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
        alert("🏁 ¡Llegaste a tu destino!");
        this.detener();
    },

    detener: function() {
        this.state.activa = false;
        if(this.ui.hud) this.ui.hud.classList.add('oculto');
        document.dispatchEvent(new CustomEvent('nav-engine-stopped'));
    },
    
    // Para actualizar el texto de "A 500m" o "Esperando" en tiempo real
    actualizarHUDLive: function(textoTiempo, textoEstado, claseEstado) {
        if (this.state.modo !== 'live' || !this.state.activa) return;
        
        const spanTiempo = document.getElementById('hud-tiempo-viaje');
        const badgeEstado = document.getElementById('hud-estado-movimiento');
        
        if(spanTiempo) spanTiempo.textContent = textoTiempo;
        
        if(badgeEstado) {
            badgeEstado.textContent = textoEstado;
            badgeEstado.className = `status-item badge-estado ${claseEstado}`;
        }
    }
};