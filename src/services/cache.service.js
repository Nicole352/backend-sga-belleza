const NodeCache = require('node-cache');

/**
 * Servicio centralizado de caché en memoria
 * Usado para optimizar endpoints de alta frecuencia
 */

// Caché para cursos disponibles (TTL: 10 segundos)
const cursosCache = new NodeCache({
    stdTTL: 10,           // 10 segundos de vida
    checkperiod: 15,      // Verificar cada 15s para limpiar expirados
    useClones: false      // No clonar objetos (mejor performance)
});

// Caché para tipos de cursos (TTL: 60 segundos)
const tiposCursosCache = new NodeCache({
    stdTTL: 60,
    checkperiod: 70,
    useClones: false
});

/**
 * Obtener cursos disponibles desde caché
 * @returns {Array|null} Cursos o null si no existe en caché
 */
const getCursosDisponibles = () => {
    return cursosCache.get('cursos_disponibles');
};

/**
 * Guardar cursos disponibles en caché
 * @param {Array} cursos - Array de cursos
 */
const setCursosDisponibles = (cursos) => {
    cursosCache.set('cursos_disponibles', cursos);
    console.log('Caché actualizado: cursos_disponibles');
};

/**
 * Invalidar caché de cursos disponibles
 * Se llama cuando cambian los cupos (aprobar/rechazar solicitud)
 */
const invalidateCursosDisponibles = () => {
    cursosCache.del('cursos_disponibles');
    console.log('Caché invalidado: cursos_disponibles');
};

/**
 * Obtener tipos de cursos desde caché
 * @returns {Array|null} Tipos de cursos o null si no existe en caché
 */
const getTiposCursos = () => {
    return tiposCursosCache.get('tipos_cursos');
};

/**
 * Guardar tipos de cursos en caché
 * @param {Array} tipos - Array de tipos de cursos
 */
const setTiposCursos = (tipos) => {
    tiposCursosCache.set('tipos_cursos', tipos);
    console.log('Caché actualizado: tipos_cursos');
};

/**
 * Obtener estadísticas de caché
 * @returns {Object} Estadísticas de hit/miss
 */
const getStats = () => {
    return {
        cursos: cursosCache.getStats(),
        tiposCursos: tiposCursosCache.getStats()
    };
};

/**
 * Limpiar todos los cachés
 */
const flushAll = () => {
    cursosCache.flushAll();
    tiposCursosCache.flushAll();
    console.log('Todos los cachés limpiados');
};

module.exports = {
    getCursosDisponibles,
    setCursosDisponibles,
    invalidateCursosDisponibles,
    getTiposCursos,
    setTiposCursos,
    getStats,
    flushAll
};
