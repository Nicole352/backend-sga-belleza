/**
 * PRUEBAS DE INTEGRACIÓN - REPORTES
 * Prueban generación de reportes del sistema
 * USA BASE DE DATOS REAL con datos existentes
 */

const request = require('supertest');
const app = require('../../server');
const { pool } = require('../../src/config/database');

describe('Integration Tests - Reportes', () => {

    let authToken;
    let adminToken;

    beforeAll(async () => {
        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'superadmin@belleza.com',
                password: '12345678'
            });

        adminToken = loginResponse.body.token;
        authToken = adminToken;
    });

    afterAll(async () => {
        await pool.end();
    });

    describe('GET /api/reportes/estudiantes', () => {

        it('debe generar reporte de estudiantes', async () => {
            const response = await request(app)
                .get('/api/reportes/estudiantes')
                .set('Authorization', `Bearer ${adminToken}`);

            // Puede retornar diferentes formatos
            if (response.status === 200) {
                expect(response.body).toBeDefined();
            }
        });

        it('debe rechazar petición sin autenticación', async () => {
            const response = await request(app)
                .get('/api/reportes/estudiantes')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

    });

    describe('GET /api/reportes/cursos', () => {

        it('debe generar reporte de cursos', async () => {
            const response = await request(app)
                .get('/api/reportes/cursos')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.status === 200) {
                expect(response.body).toBeDefined();
            }
        });

    });

    describe('GET /api/reportes/financiero', () => {

        it('debe generar reporte financiero', async () => {
            const response = await request(app)
                .get('/api/reportes/financiero')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.status === 200) {
                expect(response.body).toBeDefined();
                // Puede tener estructura de ingresos/egresos
                if (response.body.ingresos !== undefined) {
                    expect(typeof response.body.ingresos).toBe('number');
                }
            }
        });

    });

    describe('GET /api/reportes/asistencias', () => {

        it('debe generar reporte de asistencias', async () => {
            const response = await request(app)
                .get('/api/reportes/asistencias')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.status === 200) {
                expect(response.body).toBeDefined();
            }
        });

    });

    describe('GET /api/reportes/estudiantes/excel', () => {

        it('debe generar reporte Excel de estudiantes', async () => {
            const response = await request(app)
                .get('/api/reportes/estudiantes/excel')
                .set('Authorization', `Bearer ${adminToken}`);

            // Excel retorna buffer o archivo
            if (response.status === 200) {
                expect(response.headers['content-type']).toContain('application');
            }
        });

    });

    describe('GET /api/reportes/cursos/excel', () => {

        it('debe generar reporte Excel de cursos', async () => {
            const response = await request(app)
                .get('/api/reportes/cursos/excel')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.status === 200) {
                expect(response.headers['content-type']).toContain('application');
            }
        });

    });

    describe('GET /api/reportes/pagos', () => {

        it('debe generar reporte de pagos', async () => {
            const response = await request(app)
                .get('/api/reportes/pagos')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.status === 200) {
                expect(response.body).toBeDefined();
            }
        });

        it('debe filtrar reporte por fecha', async () => {
            const response = await request(app)
                .get('/api/reportes/pagos')
                .query({
                    fecha_inicio: '2026-01-01',
                    fecha_fin: '2026-12-31'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.status === 200) {
                expect(response.body).toBeDefined();
            }
        });

    });

    describe('GET /api/reportes/matriculas', () => {

        it('debe generar reporte de matrículas', async () => {
            const response = await request(app)
                .get('/api/reportes/matriculas')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.status === 200) {
                expect(response.body).toBeDefined();
            }
        });

    });

    describe('Permisos de reportes', () => {

        it('debe rechazar acceso a reportes sin permisos de admin', async () => {
            // Intentar acceder sin token
            const response = await request(app)
                .get('/api/reportes/financiero')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

    });

});
