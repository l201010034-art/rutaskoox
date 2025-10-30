// js/routeFinder.js

/**
 * Crea un Map { rutaId => Set[paraderos] } para búsquedas rápidas.
 */
export function crearMapaRutas(todasLasRutas, todosLosParaderos) {
    const mapRutaParaderos = new Map();
    todasLasRutas.forEach(ruta => {
        mapRutaParaderos.set(ruta.properties.id, new Set());
    });
    todosLosParaderos.forEach(paradero => {
        paradero.properties.rutas.forEach(rutaId => {
            if (mapRutaParaderos.has(rutaId)) {
                mapRutaParaderos.get(rutaId).add(paradero);
            }
        });
    });
    return mapRutaParaderos;
}

/**
 * Encuentra todas las rutas óptimas (menos transbordos) usando BFS.
 */
export function encontrarRutaCompleta(inicio, fin, todasLasRutas, mapRutaParaderos) {
    console.log(`Buscando todas las rutas desde "${inicio.properties.nombre}" hasta "${fin.properties.nombre}"`);
    
    let queue = [];
    let visitados = new Map(); // { paraderoNombre => numTramos }
    let solucionesEncontradas = [];
    let minTramosEncontrado = Infinity;
    let combinacionesEncontradas = new Set();
    const limiteTransbordos = 4; 

    const caminoBase = [{ tipo: 'caminar', paradero: inicio, texto: `Camina a: ${inicio.properties.nombre}` }];
    visitados.set(inicio.properties.nombre, 0);
    queue.push(caminoBase);
    
    while (queue.length > 0) {
        const caminoActual = queue.shift();
        
        const ultimoPaso = caminoActual[caminoActual.length - 1];
        const ultimoParadero = (ultimoPaso.tipo === 'caminar') ? ultimoPaso.paradero : ultimoPaso.paraderoFin;
        const numTramosBus = caminoActual.filter(p => p.tipo === 'bus').length;

        if (numTramosBus > minTramosEncontrado) continue;
        if (numTramosBus > limiteTransbordos) continue;

        if (ultimoParadero.properties.nombre === fin.properties.nombre) {
            let planFinal = [...caminoActual, { tipo: 'fin', paradero: fin, texto: "¡Llegaste a tu destino!" }];
            
            const buses = planFinal.filter(p => p.tipo === 'bus').map(p => p.ruta.properties.id);
            const combinacionKey = buses.join('->');

            if (numTramosBus < minTramosEncontrado) {
                minTramosEncontrado = numTramosBus; 
                solucionesEncontradas = [planFinal];
                combinacionesEncontradas.clear();
                combinacionesEncontradas.add(combinacionKey);
            
            } else if (numTramosBus === minTramosEncontrado) {
                if (!combinacionesEncontradas.has(combinacionKey)) {
                    solucionesEncontradas.push(planFinal);
                    combinacionesEncontradas.add(combinacionKey);
                }
            }
            continue;
        }

        const rutasDesdeTransbordo = ultimoParadero.properties.rutas;
        
        for (const rutaId of rutasDesdeTransbordo) {
            const rutaInfo = todasLasRutas.find(r => r.properties.id === rutaId);
            if (ultimoPaso.tipo === 'bus' && rutaInfo.properties.id === ultimoPaso.ruta.properties.id) continue;
            
            const paraderosEnRuta = mapRutaParaderos.get(rutaId);

            for (const nuevoParadero of paraderosEnRuta) {
                const tramosAVisitar = numTramosBus + 1;
                const tramosMejorConocido = visitados.get(nuevoParadero.properties.nombre);

                if (!tramosMejorConocido || tramosAVisitar <= tramosMejorConocido) {
                    visitados.set(nuevoParadero.properties.nombre, tramosAVisitar);
                    
                    const pasoTransbordo = (ultimoPaso.tipo === 'bus') ? 
                        { tipo: 'transbordo', paradero: ultimoParadero, texto: `En ${ultimoParadero.properties.nombre}, espera el siguiente camión.` } : null;

                    let nuevoCamino = [...caminoActual];
                    if (pasoTransbordo) nuevoCamino.push(pasoTransbordo);
                    
                    nuevoCamino.push({ 
                        tipo: 'bus', 
                        ruta: rutaInfo, 
                        paraderoInicio: ultimoParadero, 
                        paraderoFin: nuevoParadero,
                        texto: `Toma ${rutaInfo.properties.id} y baja en ${nuevoParadero.properties.nombre}`
                    });
                    
                    queue.push(nuevoCamino);
                }
            }
        }
    }
    
    console.log(`Búsqueda finalizada. Se encontraron ${solucionesEncontradas.length} rutas óptimas únicas.`);
    return solucionesEncontradas;
}

/**
 * Enlaza Paraderos a Rutas usando Turf.js
 */
export function linkParaderosARutas(paraderos, rutas) {
    const DISTANCIA_MAXIMA = 20;
    paraderos.forEach(paradero => {
        paradero.properties.rutas = []; 
        rutas.forEach(ruta => {
            // turf.js se accede globalmente desde el script en index.html
            const distancia = turf.pointToLineDistance(paradero, ruta, { units: 'meters' });
            if (distancia <= DISTANCIA_MAXIMA) {
                paradero.properties.rutas.push(ruta.properties.id);
            }
        });
    });
}