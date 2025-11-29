const cron = require('node-cron');
const { pool } = require('../config/database');
const { finalizarCalificacionesCurso } = require('../models/cursos.model');

/**
 * Cron job para finalizar automáticamente cursos que han pasado su fecha_fin
 * Se ejecuta diariamente a las 2:00 AM (hora de Ecuador)
 */

console.log('Inicializando cron job de finalización automática de cursos...');

// Ejecutar todos los días a las 2:00 AM
cron.schedule('0 2 * * *', async () => {
    try {
        console.log('\n=== VERIFICACIÓN DE CURSOS A FINALIZAR ===');
        console.log(`Fecha/Hora: ${new Date().toLocaleString('es-EC')}`);

        // Buscar cursos activos cuya fecha_fin ya pasó
        const [cursosVencidos] = await pool.execute(`
      SELECT 
        id_curso, 
        nombre, 
        fecha_fin,
        DATEDIFF(CURDATE(), fecha_fin) as dias_vencidos
      FROM cursos
      WHERE estado = 'activo' 
        AND fecha_fin < CURDATE()
      ORDER BY fecha_fin ASC
    `);

        if (cursosVencidos.length === 0) {
            console.log('✓ No hay cursos pendientes de finalizar');
            return;
        }

        console.log(`📚 Cursos a finalizar: ${cursosVencidos.length}\n`);

        for (const curso of cursosVencidos) {
            try {
                console.log(`Procesando: ${curso.nombre} (ID: ${curso.id_curso})`);
                console.log(`  Fecha fin: ${curso.fecha_fin.toISOString().split('T')[0]}`);
                console.log(`  Días vencidos: ${curso.dias_vencidos}`);

                // Finalizar calificaciones
                const resultado = await finalizarCalificacionesCurso(curso.id_curso);
                console.log(`  ✓ ${resultado.mensaje}`);

                // Actualizar estado del curso a 'finalizado'
                await pool.execute(
                    'UPDATE cursos SET estado = ? WHERE id_curso = ?',
                    ['finalizado', curso.id_curso]
                );
                console.log(`  ✓ Curso marcado como FINALIZADO\n`);

            } catch (error) {
                console.error(`  ✗ Error finalizando curso ${curso.id_curso}:`, error.message);
            }
        }

        console.log('=== FINALIZACIÓN AUTOMÁTICA COMPLETADA ===\n');

    } catch (error) {
        console.error('Error en cron job de finalización de cursos:', error);
    }
}, {
    timezone: 'America/Guayaquil'
});

console.log('✓ Cron job configurado: Ejecución diaria a las 2:00 AM (Ecuador)');

// Ejecutar verificación inicial al iniciar el servidor (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
    console.log('\n[DESARROLLO] Ejecutando verificación inicial...\n');

    setTimeout(async () => {
        try {
            const [cursosVencidos] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM cursos
        WHERE estado = 'activo' AND fecha_fin < CURDATE()
      `);

            console.log(`Cursos activos con fecha_fin vencida: ${cursosVencidos[0].total}`);

            if (cursosVencidos[0].total > 0) {
                console.log('💡 Tip: Estos cursos se finalizarán automáticamente a las 2:00 AM');
            }

            console.log('✓ Verificación inicial completada\n');
        } catch (error) {
            console.error('Error en verificación inicial:', error.message);
        }
    }, 2000);
}

module.exports = {};
