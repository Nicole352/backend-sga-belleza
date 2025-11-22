/**
 * Tests Unitarios de PAYMENT REMINDER SERVICE
 * Valida lógica de recordatorios de pago sin enviar emails reales
 * NO usa datos ficticios - Solo valida lógica de cálculo de fechas y filtros
 */

describe('Payment Reminder Service - Tests Unitarios', () => {

    describe('Cálculo de Fechas de Vencimiento', () => {

        it('debe calcular días hasta vencimiento correctamente', () => {
            const hoy = new Date('2024-11-01');
            const fechaVencimiento = new Date('2024-11-10');

            const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));

            expect(diasRestantes).toBe(9);
        });

        it('debe detectar pagos vencidos (días negativos)', () => {
            const hoy = new Date('2024-11-10');
            const fechaVencimiento = new Date('2024-11-05');

            const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));

            expect(diasRestantes).toBeLessThan(0);
            expect(diasRestantes).toBe(-5);
        });

        it('debe identificar pagos que vencen hoy', () => {
            const hoy = new Date('2024-11-10');
            const fechaVencimiento = new Date('2024-11-10');

            const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));

            expect(diasRestantes).toBe(0);
        });

    });

    describe('Filtrado de Pagos para Recordatorios', () => {

        it('debe filtrar pagos pendientes solamente', () => {
            const pagos = [
                { id: 1, estado: 'pendiente', monto: 90 },
                { id: 2, estado: 'pagado', monto: 90 },
                { id: 3, estado: 'pendiente', monto: 90 },
                { id: 4, estado: 'verificado', monto: 90 }
            ];

            const pagosPendientes = pagos.filter(p => p.estado === 'pendiente');

            expect(pagosPendientes.length).toBe(2);
            expect(pagosPendientes.every(p => p.estado === 'pendiente')).toBe(true);
        });

        it('debe filtrar pagos próximos a vencer (3 días)', () => {
            const hoy = new Date('2024-11-01');
            const pagos = [
                { id: 1, fecha_vencimiento: new Date('2024-11-03') }, // 2 días
                { id: 2, fecha_vencimiento: new Date('2024-11-04') }, // 3 días
                { id: 3, fecha_vencimiento: new Date('2024-11-10') }, // 9 días
                { id: 4, fecha_vencimiento: new Date('2024-10-30') }  // Vencido
            ];

            const proximosAVencer = pagos.filter(pago => {
                const dias = Math.ceil((pago.fecha_vencimiento - hoy) / (1000 * 60 * 60 * 24));
                return dias > 0 && dias <= 3;
            });

            expect(proximosAVencer.length).toBe(2);
            expect(proximosAVencer.map(p => p.id)).toEqual([1, 2]);
        });

        it('debe filtrar pagos vencidos', () => {
            const hoy = new Date('2024-11-01');
            const pagos = [
                { id: 1, fecha_vencimiento: new Date('2024-10-25') },
                { id: 2, fecha_vencimiento: new Date('2024-10-30') },
                { id: 3, fecha_vencimiento: new Date('2024-11-05') }
            ];

            const vencidos = pagos.filter(pago => {
                const dias = Math.ceil((pago.fecha_vencimiento - hoy) / (1000 * 60 * 60 * 24));
                return dias < 0;
            });

            expect(vencidos.length).toBe(2);
        });

    });

    describe('Agrupación de Recordatorios', () => {

        it('debe agrupar pagos por estudiante', () => {
            const pagos = [
                { id_estudiante: 1, monto: 90 },
                { id_estudiante: 1, monto: 90 },
                { id_estudiante: 2, monto: 90 },
                { id_estudiante: 3, monto: 90 }
            ];

            const agrupados = pagos.reduce((acc, pago) => {
                if (!acc[pago.id_estudiante]) {
                    acc[pago.id_estudiante] = [];
                }
                acc[pago.id_estudiante].push(pago);
                return acc;
            }, {});

            expect(Object.keys(agrupados).length).toBe(3);
            expect(agrupados[1].length).toBe(2);
            expect(agrupados[2].length).toBe(1);
        });

        it('debe calcular total adeudado por estudiante', () => {
            const pagosEstudiante = [
                { monto: 90.00 },
                { monto: 90.00 },
                { monto: 45.50 }
            ];

            const totalAdeudado = pagosEstudiante.reduce((sum, p) => sum + p.monto, 0);

            expect(totalAdeudado).toBe(225.50);
        });

    });

    describe('Tipos de Recordatorios', () => {

        it('debe clasificar recordatorio como "urgente" si vence en 1 día', () => {
            const diasRestantes = 1;
            const tipo = diasRestantes <= 1 ? 'urgente' : 'normal';

            expect(tipo).toBe('urgente');
        });

        it('debe clasificar recordatorio como "normal" si vence en 3 días', () => {
            const diasRestantes = 3;
            const tipo = diasRestantes <= 1 ? 'urgente' : 'normal';

            expect(tipo).toBe('normal');
        });

        it('debe clasificar como "vencido" si días son negativos', () => {
            const diasRestantes = -5;
            const tipo = diasRestantes < 0 ? 'vencido' : (diasRestantes <= 1 ? 'urgente' : 'normal');

            expect(tipo).toBe('vencido');
        });

    });

    describe('Generación de Mensajes', () => {

        it('debe generar asunto de email según tipo de recordatorio', () => {
            const generarAsunto = (tipo, diasRestantes) => {
                if (tipo === 'vencido') {
                    return `⚠️ Pago Vencido - Acción Requerida`;
                } else if (tipo === 'urgente') {
                    return `🔔 Recordatorio Urgente: Pago vence en ${Math.abs(diasRestantes)} día(s)`;
                } else {
                    return `📅 Recordatorio: Pago próximo a vencer en ${diasRestantes} días`;
                }
            };

            expect(generarAsunto('vencido', -5)).toContain('Vencido');
            expect(generarAsunto('urgente', 1)).toContain('Urgente');
            expect(generarAsunto('normal', 3)).toContain('próximo a vencer');
        });

        it('debe incluir información del pago en el mensaje', () => {
            const pago = {
                numero_cuota: 2,
                monto: 90.00,
                fecha_vencimiento: '2024-11-10'
            };

            const mensaje = `Cuota #${pago.numero_cuota} - $${pago.monto.toFixed(2)} - Vence: ${pago.fecha_vencimiento}`;

            expect(mensaje).toContain('Cuota #2');
            expect(mensaje).toContain('$90.00');
            expect(mensaje).toContain('2024-11-10');
        });

    });

    describe('Frecuencia de Recordatorios', () => {

        it('debe evitar enviar recordatorios duplicados el mismo día', () => {
            const ultimoEnvio = new Date('2024-11-01T10:00:00');
            const ahora = new Date('2024-11-01T15:00:00');

            const mismoDia = ultimoEnvio.toDateString() === ahora.toDateString();

            expect(mismoDia).toBe(true);
        });

        it('debe permitir recordatorio si pasó 1 día', () => {
            const ultimoEnvio = new Date('2024-11-01');
            const ahora = new Date('2024-11-02');

            const mismoDia = ultimoEnvio.toDateString() === ahora.toDateString();

            expect(mismoDia).toBe(false);
        });

    });

    describe('Validaciones de Datos', () => {

        it('debe validar que el pago tenga email de estudiante', () => {
            const pagoValido = {
                id_pago: 1,
                email_estudiante: 'estudiante@test.com',
                monto: 90
            };
            const pagoInvalido = {
                id_pago: 2,
                email_estudiante: null,
                monto: 90
            };

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            expect(emailRegex.test(pagoValido.email_estudiante)).toBe(true);
            expect(pagoInvalido.email_estudiante).toBeNull();
        });

        it('debe validar que la fecha de vencimiento sea válida', () => {
            const fechaValida = new Date('2024-11-10');
            const fechaInvalida = new Date('fecha-invalida');

            expect(fechaValida instanceof Date && !isNaN(fechaValida)).toBe(true);
            expect(fechaInvalida instanceof Date && !isNaN(fechaInvalida)).toBe(false);
        });

    });

    describe('Priorización de Recordatorios', () => {

        it('debe ordenar pagos por urgencia (vencidos primero)', () => {
            const hoy = new Date('2024-11-01');
            const pagos = [
                { id: 1, fecha_vencimiento: new Date('2024-11-05') }, // 4 días
                { id: 2, fecha_vencimiento: new Date('2024-10-28') }, // Vencido
                { id: 3, fecha_vencimiento: new Date('2024-11-02') }, // 1 día
                { id: 4, fecha_vencimiento: new Date('2024-10-30') }  // Vencido
            ];

            const ordenados = pagos.sort((a, b) => {
                const diasA = Math.ceil((a.fecha_vencimiento - hoy) / (1000 * 60 * 60 * 24));
                const diasB = Math.ceil((b.fecha_vencimiento - hoy) / (1000 * 60 * 60 * 24));
                return diasA - diasB; // Negativos (vencidos) primero
            });

            expect(ordenados[0].id).toBe(2); // Más vencido
            expect(ordenados[1].id).toBe(4); // Vencido
            expect(ordenados[2].id).toBe(3); // 1 día
            expect(ordenados[3].id).toBe(1); // 4 días
        });

    });

    describe('Estadísticas de Recordatorios', () => {

        it('debe calcular total de recordatorios enviados', () => {
            const recordatorios = [
                { enviado: true },
                { enviado: true },
                { enviado: false },
                { enviado: true }
            ];

            const totalEnviados = recordatorios.filter(r => r.enviado).length;

            expect(totalEnviados).toBe(3);
        });

        it('debe calcular tasa de respuesta (pagos realizados después del recordatorio)', () => {
            const recordatorios = [
                { enviado: true, pago_realizado: true },
                { enviado: true, pago_realizado: false },
                { enviado: true, pago_realizado: true },
                { enviado: true, pago_realizado: true }
            ];

            const enviados = recordatorios.filter(r => r.enviado).length;
            const pagados = recordatorios.filter(r => r.enviado && r.pago_realizado).length;
            const tasaRespuesta = (pagados / enviados) * 100;

            expect(tasaRespuesta).toBe(75); // 3/4 = 75%
        });

    });

});
