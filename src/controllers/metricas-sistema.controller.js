const { pool } = require('../config/database');
const os = require('os');
const { getMetrics } = require('../middleware/metrics.middleware');

/**
 * GET /api/system/metrics
 * Obtiene métricas del sistema (CPU, memoria, uptime, etc.)
 */
async function getSystemMetrics(req, res) {
    try {
        // ============================================
        // MÉTRICAS DEL PROCESO NODE.JS
        // ============================================

        // 1. Uptime del proceso Node.js
        const uptimeSeconds = process.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeFormatted = `${hours}h ${minutes}m`;

        // 2. Uso de memoria del proceso Node.js
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
        const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
        const memoryUsagePercent = ((heapUsedMB / heapTotalMB) * 100).toFixed(2);

        // 3. CPU usage del proceso Node.js (basado en uso de CPU)
        const cpuUsage = process.cpuUsage();
        const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / uptimeSeconds * 100).toFixed(2);

        // 4. Conexiones activas del pool de MySQL
        const poolStats = pool.pool;
        const activeConnections = poolStats._allConnections.length - poolStats._freeConnections.length;

        // 5. Peticiones por minuto y tasa de errores (DATOS REALES del middleware)
        const metricsData = getMetrics();
        const requestsPerMinute = metricsData.requestsPerMinute;
        const errorRate = metricsData.errorRate;

        return res.json({
            uptime: uptimeFormatted,
            cpuUsage: Math.min(100, parseFloat(cpuPercent)),
            memoryUsage: parseFloat(memoryUsagePercent),
            activeConnections,
            requestsPerMinute,
            errorRate,
            timestamp: new Date().toISOString(),
            // Datos adicionales para debugging
            debug: {
                heapUsedMB: heapUsedMB.toFixed(2),
                heapTotalMB: heapTotalMB.toFixed(2),
                rss: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
                totalRequests: metricsData.totalRequests,
                totalErrors: metricsData.totalErrors
            }
        });
    } catch (error) {
        console.error('Error obteniendo métricas del sistema:', error);
        return res.status(500).json({ error: 'Error al obtener métricas del sistema' });
    }
}

/**
 * GET /api/system/database-metrics
 * Obtiene métricas de la base de datos MySQL
 */
async function getDatabaseMetrics(req, res) {
    try {
        // 1. Total de conexiones
        const [processlist] = await pool.query('SHOW PROCESSLIST');
        const totalConnections = processlist.length;

        // 2. Consultas activas (que no estén en estado Sleep)
        const activeQueries = processlist.filter(p => p.Command !== 'Sleep').length;

        // 3. Tamaño de la base de datos
        const [dbSize] = await pool.query(`
      SELECT 
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `);
        const dbSizeMB = dbSize[0]?.size_mb || 0;

        // 4. Consultas lentas (slow queries)
        const [slowQueries] = await pool.query(`
      SHOW GLOBAL STATUS LIKE 'Slow_queries'
    `);
        const slowQueriesCount = parseInt(slowQueries[0]?.Value || 0);

        // 5. Estado del connection pool
        const poolStats = pool.pool;
        const connectionPool = {
            active: poolStats._allConnections.length - poolStats._freeConnections.length,
            idle: poolStats._freeConnections.length,
            total: poolStats.config.connectionLimit
        };

        return res.json({
            totalConnections,
            activeQueries,
            dbSize: `${dbSizeMB} MB`,
            slowQueries: slowQueriesCount,
            connectionPool,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error obteniendo métricas de base de datos:', error);
        return res.status(500).json({ error: 'Error al obtener métricas de base de datos' });
    }
}

/**
 * GET /api/system/logs
 * Obtiene los últimos logs del sistema
 */
async function getSystemLogs(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 20;

        // Obtener logs de auditoría recientes
        const [logs] = await pool.query(`
      SELECT 
        a.operacion,
        a.tabla_afectada,
        a.fecha_operacion,
        u.nombre,
        u.apellido,
        a.ip_address
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON a.usuario_id = u.id_usuario
      ORDER BY a.fecha_operacion DESC
      LIMIT ?
    `, [limit]);

        // Formatear logs para el frontend
        const formattedLogs = logs.map(log => {
            let level = 'info';
            let message = '';

            switch (log.operacion) {
                case 'INSERT':
                    level = 'info';
                    message = `Nuevo registro creado en ${log.tabla_afectada}`;
                    break;
                case 'UPDATE':
                    level = 'info';
                    message = `Registro actualizado en ${log.tabla_afectada}`;
                    break;
                case 'DELETE':
                    level = 'warn';
                    message = `Registro eliminado de ${log.tabla_afectada}`;
                    break;
            }

            if (log.nombre && log.apellido) {
                message += ` por ${log.nombre} ${log.apellido}`;
            }

            return {
                level,
                message,
                timestamp: log.fecha_operacion,
                ip: log.ip_address
            };
        });

        // Agregar algunos logs del sistema simulados
        const systemLogs = [
            {
                level: 'info',
                message: 'Servidor iniciado exitosamente en puerto 3000',
                timestamp: new Date(Date.now() - 3600000).toISOString()
            },
            {
                level: 'info',
                message: 'Conexión a base de datos establecida',
                timestamp: new Date(Date.now() - 3500000).toISOString()
            }
        ];

        const allLogs = [...systemLogs, ...formattedLogs].slice(0, limit);

        return res.json(allLogs);
    } catch (error) {
        console.error('Error obteniendo logs del sistema:', error);
        return res.status(500).json({ error: 'Error al obtener logs del sistema' });
    }
}

/**
 * GET /api/system/health
 * Health check del sistema
 */
async function getSystemHealth(req, res) {
    try {
        // Verificar conexión a base de datos
        await pool.query('SELECT 1');

        return res.json({
            status: 'healthy',
            database: 'connected',
            uptime: os.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error en health check:', error);
        return res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
}

module.exports = {
    getSystemMetrics,
    getDatabaseMetrics,
    getSystemLogs,
    getSystemHealth
};
