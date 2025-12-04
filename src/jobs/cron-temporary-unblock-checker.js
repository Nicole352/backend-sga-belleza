const cron = require('node-cron');
const TemporaryUnblockService = require('../services/temporary-unblock.service');

/**
 * Cron job para verificar desbloqueos temporales expirados
 * Se ejecuta cada hora
 */

console.log('Inicializando cron job de verificación de desbloqueos temporales...');

// Ejecutar cada hora
cron.schedule('0 * * * *', async () => {
    try {
        console.log('\n=== VERIFICACIÓN DE DESBLOQUEOS TEMPORALES ===');
        console.log(`Fecha/Hora: ${new Date().toLocaleString('es-EC')}`);

        const rebloqueados = await TemporaryUnblockService.checkExpiredUnblocks();

        if (rebloqueados > 0) {
            console.log(`✓ ${rebloqueados} cuenta(s) re-bloqueada(s) por expiración`);
        } else {
            console.log('✓ No hay desbloqueos temporales expirados');
        }

        console.log('=== VERIFICACIÓN COMPLETADA ===\n');
    } catch (error) {
        console.error('Error en cron job de desbloqueos temporales:', error);
    }
}, {
    timezone: 'America/Guayaquil'
});

console.log('✓ Cron job configurado: Verificación cada hora');

// Ejecutar verificación inicial al iniciar el servidor (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
    console.log('\n[DESARROLLO] Ejecutando verificación inicial de desbloqueos temporales...\n');

    setTimeout(async () => {
        try {
            const { pool } = require('../config/database');
            const [temporales] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM usuarios
        WHERE desbloqueo_temporal = TRUE
      `);

            console.log(`Desbloqueos temporales activos: ${temporales[0].total}`);

            if (temporales[0].total > 0) {
                const [proximos] = await pool.execute(`
          SELECT 
            nombre, 
            apellido,
            expira_desbloqueo,
            TIMESTAMPDIFF(HOUR, NOW(), expira_desbloqueo) as horas_restantes
          FROM usuarios
          WHERE desbloqueo_temporal = TRUE
          ORDER BY expira_desbloqueo ASC
        `);

                console.log('\nPróximos a expirar:');
                proximos.forEach(u => {
                    console.log(`  - ${u.nombre} ${u.apellido}: ${u.horas_restantes}h restantes`);
                });
            }

            console.log('✓ Verificación inicial completada\n');
        } catch (error) {
            console.error('Error en verificación inicial:', error.message);
        }
    }, 3000);
}

module.exports = {};
