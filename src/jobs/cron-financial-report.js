const cron = require('node-cron');
const ReportesModel = require('../models/reportes.model');
const { generarExcelFinanciero } = require('../services/reportesExcelService');
const { enviarReporteFinancieroAutomatico } = require('../services/emailService');
const { getActiveAdmins } = require('../models/admins.model');

/**
 * Cron Job para envío automático de reporte financiero diario
 * Se ejecuta todos los días a las 12:00 AM (medianoche)
 * 
 * Formato cron: minuto hora día mes día_semana
 * '0 0 * * *' = 12:00 AM (medianoche) todos los días
 */

console.log('Inicializando cron job de reporte financiero automático...');

// Ejecutar todos los días a las 12:00 AM (medianoche)
cron.schedule('0 0 * * *', async () => {
    console.log('\n========================================');
    console.log('CRON JOB: Reporte Financiero Automático');
    console.log('========================================');
    console.log('Fecha/Hora:', new Date().toLocaleString('es-EC'));

    try {
        // 1. Calcular fechas: día anterior completo
        const hoy = new Date();
        const ayer = new Date(hoy);
        ayer.setDate(hoy.getDate() - 1);

        // Formatear fechas como YYYY-MM-DD
        const fechaInicio = ayer.toISOString().split('T')[0];
        const fechaFin = ayer.toISOString().split('T')[0];

        console.log(`📅 Período del reporte: ${fechaInicio} (día completo)`);

        // 2. Obtener administradores activos
        const admins = await getActiveAdmins();

        if (!admins || admins.length === 0) {
            console.warn('⚠️ No hay administradores activos para enviar el reporte');
            console.log('========================================\n');
            return;
        }

        const adminEmails = admins.map(admin => admin.email);
        console.log(`📧 Administradores destinatarios: ${adminEmails.length}`);
        console.log(`   ${adminEmails.join(', ')}`);

        // 3. Obtener datos financieros COMPLETOS (sin filtros)
        const parametros = {
            fechaInicio,
            fechaFin,
            tipoPago: 'todos',
            estadoPago: 'todos',
            idCurso: null,
            estadoCurso: 'todos',
            metodoPago: 'todos',
            horario: 'todos'
        };

        console.log('📊 Obteniendo datos financieros...');
        const datos = await ReportesModel.getReporteFinanciero(parametros);

        // Datos sin filtro de estado para la hoja "Estado de Cuenta"
        const datosSinFiltroEstado = await ReportesModel.getReporteFinanciero({
            ...parametros,
            estadoPago: 'todos'
        });

        const estadisticas = await ReportesModel.getEstadisticasFinancieras(parametros);

        console.log(`   Total de registros: ${datos.length}`);
        console.log(`   Ingresos totales: $${estadisticas.ingresos_totales || 0}`);
        console.log(`   Pagos verificados: ${estadisticas.pagos_verificados || 0}`);
        console.log(`   Pagos pendientes: ${estadisticas.pagos_pendientes || 0}`);

        // 4. Generar Excel
        console.log('📄 Generando archivo Excel...');
        const excelBuffer = await generarExcelFinanciero(
            datos,
            datosSinFiltroEstado,
            {
                fechaInicio,
                fechaFin,
                tipoPago: 'todos',
                estadoPago: 'todos'
            },
            estadisticas
        );

        console.log(`   ✓ Excel generado: ${(excelBuffer.length / 1024).toFixed(2)} KB`);

        // 5. Enviar emails a todos los administradores
        console.log('📤 Enviando emails...');
        const resultado = await enviarReporteFinancieroAutomatico(
            adminEmails,
            excelBuffer,
            {
                fechaInicio,
                fechaFin,
                totalRegistros: datos.length,
                ingresosTotales: estadisticas.ingresos_totales || 0,
                pagosVerificados: estadisticas.pagos_verificados || 0,
                pagosPendientes: estadisticas.pagos_pendientes || 0
            }
        );

        if (resultado.success) {
            console.log('   ✓ Emails enviados exitosamente');
        } else {
            console.error('   ✗ Error enviando emails:', resultado.error);
        }

        console.log('\n✓ Reporte financiero automático completado exitosamente');
        console.log('========================================\n');
    } catch (error) {
        console.error('\n✗ Error en reporte financiero automático:', error);
        console.error('Stack trace:', error.stack);
        console.log('========================================\n');
    }
}, {
    scheduled: true,
    timezone: "America/Guayaquil" // Zona horaria de Ecuador
});

console.log('✓ Cron job configurado: Ejecución diaria a las 12:00 AM (medianoche - Ecuador)');

// OPCIONAL: Ejecutar inmediatamente al iniciar el servidor (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
    console.log('\n[DESARROLLO] Ejecutando reporte financiero de prueba en 10 segundos...\n');

    setTimeout(async () => {
        try {
            console.log('\n========================================');
            console.log('PRUEBA: Reporte Financiero Automático');
            console.log('========================================');

            // Usar el día de ayer para la prueba
            const hoy = new Date();
            const ayer = new Date(hoy);
            ayer.setDate(hoy.getDate() - 1);

            const fechaInicio = ayer.toISOString().split('T')[0];
            const fechaFin = ayer.toISOString().split('T')[0];

            console.log(`📅 Período de prueba: ${fechaInicio}`);

            const admins = await getActiveAdmins();
            if (!admins || admins.length === 0) {
                console.warn('⚠️ No hay administradores activos');
                return;
            }

            const adminEmails = admins.map(admin => admin.email);
            console.log(`📧 Enviando a: ${adminEmails.join(', ')}`);

            const parametros = {
                fechaInicio,
                fechaFin,
                tipoPago: 'todos',
                estadoPago: 'todos',
                idCurso: null,
                estadoCurso: 'todos',
                metodoPago: 'todos',
                horario: 'todos'
            };

            const datos = await ReportesModel.getReporteFinanciero(parametros);
            const datosSinFiltroEstado = await ReportesModel.getReporteFinanciero({
                ...parametros,
                estadoPago: 'todos'
            });
            const estadisticas = await ReportesModel.getEstadisticasFinancieras(parametros);

            console.log(`📊 Registros encontrados: ${datos.length}`);

            const excelBuffer = await generarExcelFinanciero(
                datos,
                datosSinFiltroEstado,
                { fechaInicio, fechaFin, tipoPago: 'todos', estadoPago: 'todos' },
                estadisticas
            );

            const resultado = await enviarReporteFinancieroAutomatico(
                adminEmails,
                excelBuffer,
                {
                    fechaInicio,
                    fechaFin,
                    totalRegistros: datos.length,
                    ingresosTotales: estadisticas.ingresos_totales || 0,
                    pagosVerificados: estadisticas.pagos_verificados || 0,
                    pagosPendientes: estadisticas.pagos_pendientes || 0
                }
            );

            console.log(resultado.success ? '✓ Prueba completada' : '✗ Error en prueba:', resultado.error);
            console.log('========================================\n');
        } catch (error) {
            console.error('✗ Error en prueba:', error);
        }
    }, 10000); // 10 segundos
}

module.exports = cron;
