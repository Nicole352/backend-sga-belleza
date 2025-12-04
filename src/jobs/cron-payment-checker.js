const cron = require('node-cron');
const PaymentReminderService = require('../services/payment-reminder.service');

/**
 * Cron Job para verificación diaria de pagos vencidos
 * Se ejecuta todos los días a las 8:00 AM (hora del servidor)
 * 
 * Formato cron: minuto hora día mes día_semana
 * '0 8 * * *' = 8:00 AM todos los días
 */

console.log('Inicializando cron job de verificación de pagos...');

// Ejecutar todos los días a las 8:00 AM
cron.schedule('0 8 * * *', async () => {
    console.log('\n========================================');
    console.log('CRON JOB: Verificación de Pagos Vencidos');
    console.log('========================================');
    console.log('Fecha/Hora:', new Date().toLocaleString('es-EC'));

    try {
        // 1. Verificar y listar cuotas vencidas
        await PaymentReminderService.checkOverduePayments();

        // 2. Enviar recordatorios a estudiantes
        await PaymentReminderService.sendPaymentReminders();

        // 3. Bloquear cuentas con 2+ cuotas vencidas
        await PaymentReminderService.blockAccountsWithOverduePayments();

        console.log('\n✓ Verificación completada exitosamente');
        console.log('========================================\n');
    } catch (error) {
        console.error('\n✗ Error en verificación de pagos:', error);
        console.log('========================================\n');
    }
}, {
    scheduled: true,
    timezone: "America/Guayaquil" // Zona horaria de Ecuador
});

console.log('✓ Cron job configurado: Ejecución diaria a las 8:00 AM (Ecuador)');

// OPCIONAL: Ejecutar inmediatamente al iniciar el servidor (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
    console.log('\n[DESARROLLO] Ejecutando verificación inicial...\n');

    setTimeout(async () => {
        try {
            await PaymentReminderService.checkOverduePayments();
            await PaymentReminderService.sendPaymentReminders();
            await PaymentReminderService.blockAccountsWithOverduePayments();
            console.log('\n✓ Verificación inicial completada\n');
        } catch (error) {
            console.error('\n✗ Error en verificación inicial:', error, '\n');
        }
    }, 5000); // Esperar 5 segundos después de iniciar el servidor
}

module.exports = cron;
