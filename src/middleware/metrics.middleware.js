// Contadores globales para métricas en tiempo real
const metrics = {
    requests: {
        total: 0,
        lastMinute: [],
        errors: 0
    },
    startTime: Date.now()
};

// Middleware para contar peticiones
function metricsMiddleware(req, res, next) {
    const startTime = Date.now();

    // Incrementar contador total
    metrics.requests.total++;

    // Agregar timestamp para cálculo de peticiones por minuto
    const now = Date.now();
    metrics.requests.lastMinute.push(now);

    // Limpiar timestamps antiguos (más de 1 minuto)
    metrics.requests.lastMinute = metrics.requests.lastMinute.filter(
        timestamp => now - timestamp < 60000
    );

    // Interceptar respuesta para detectar errores
    const originalSend = res.send;
    res.send = function (data) {
        // Contar errores (status >= 400)
        if (res.statusCode >= 400) {
            metrics.requests.errors++;
        }

        // Restaurar función original
        res.send = originalSend;
        return originalSend.call(this, data);
    };

    next();
}

// Función para obtener métricas
function getMetrics() {
    const now = Date.now();
    const requestsLastMinute = metrics.requests.lastMinute.filter(
        timestamp => now - timestamp < 60000
    ).length;

    const errorRate = metrics.requests.total > 0
        ? ((metrics.requests.errors / metrics.requests.total) * 100).toFixed(2)
        : '0.00';

    return {
        requestsPerMinute: requestsLastMinute,
        totalRequests: metrics.requests.total,
        totalErrors: metrics.requests.errors,
        errorRate: parseFloat(errorRate)
    };
}

// Función para resetear métricas (útil para testing)
function resetMetrics() {
    metrics.requests.total = 0;
    metrics.requests.lastMinute = [];
    metrics.requests.errors = 0;
    metrics.startTime = Date.now();
}

module.exports = {
    metricsMiddleware,
    getMetrics,
    resetMetrics
};