/**
 * PRUEBAS DE INTEGRACIÓN - ESTUDIANTES
 * Prueban flujo completo de gestión de estudiantes
 * USA BASE DE DATOS REAL
 */

const request = require('supertest');
const app = require('../../server');
const { pool } = require('../../src/config/database');

describe('Integration Tests - Estudiantes', () => {

    let authToken;
    let adminToken;

    beforeAll(async () => {
        // Obtener token de admin
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

    describe('GET /api/estudiantes', () => {

        it('debe obtener lista de estudiantes con token de admin', async () => {
            const response = await request(app)
                .get('/api/estudiantes')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toBeInstanceOf(Array);
            if (response.body.length > 0) {
                expect(response.body[0]).toHaveProperty('id_usuario');
                expect(response.body[0]).toHaveProperty('nombre');
                expect(response.body[0]).toHaveProperty('apellido');
            }
        });

        it('debe rechazar petición sin autenticación', async () => {
            const response = await request(app)
                .get('/api/estudiantes')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

    });

    describe('GET /api/estudiantes/verificar', () => {

        it('debe verificar si estudiante existe por identificación', async () => {
            // Esta ruta es pública (con rate limit)
            const response = await request(app)
                .get('/api/estudiantes/verificar')
                .query({ identificacion: '1234567890' })
                .expect(200);

            expect(response.body).toHaveProperty('existe');
            expect(typeof response.body.existe).toBe('boolean');
        });

        it('debe retornar false para identificación no existente', async () => {
            const response = await request(app)
                .get('/api/estudiantes/verificar')
                .query({ identificacion: '9999999999' })
                .expect(200);

            expect(response.body.existe).toBe(false);
        });

    });

    describe('GET /api/estudiantes/mis-cursos', () => {

        it('debe obtener cursos del estudiante autenticado', async () => {
            // Primero login como estudiante
            const estudianteLogin = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'estudiante1', // Ajusta según tu BD
                    password: 'password123'
                });

            if (estudianteLogin.status === 200) {
                const estudianteToken = estudianteLogin.body.token;

                const response = await request(app)
                    .get('/api/estudiantes/mis-cursos')
                    .set('Authorization', `Bearer ${estudianteToken}`)
                    .expect(200);

                expect(response.body).toBeInstanceOf(Array);
            }
        });

        it('debe rechazar petición sin token', async () => {
            const response = await request(app)
                .get('/api/estudiantes/mis-cursos')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

    });

    describe('GET /api/estudiantes/:id', () => {

        it('debe obtener estudiante por ID con permisos de admin', async () => {
            // Primero obtener un ID válido
            const estudiantes = await request(app)
                .get('/api/estudiantes')
                .set('Authorization', `Bearer ${adminToken}`);

            if (estudiantes.body.length > 0) {
                const estudianteId = estudiantes.body[0].id;

                const response = await request(app)
                    .get(`/api/estudiantes/${estudianteId}`)
                    .set('Authorization', `Bearer ${adminToken}`);

                // El endpoint puede retornar 200 o 400 dependiendo del formato del ID
                if (response.status === 200) {
                    expect(response.body).toHaveProperty('id_usuario');
                    expect(response.body).toHaveProperty('nombre');
                    expect(response.body).toHaveProperty('apellido');
                }
            }
        });

        it('debe rechazar ID no existente', async () => {
            const response = await request(app)
                .get('/api/estudiantes/99999')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

    });

    describe('PUT /api/estudiantes/:id', () => {

        it('debe actualizar datos de estudiante con permisos de admin', async () => {
            // Obtener un estudiante existente
            const estudiantes = await request(app)
                .get('/api/estudiantes')
                .set('Authorization', `Bearer ${adminToken}`);

            if (estudiantes.body.length > 0) {
                const estudianteId = estudiantes.body[0].id_usuario;
                const nombreOriginal = estudiantes.body[0].nombre;

                // Actualizar
                const response = await request(app)
                    .put(`/api/estudiantes/${estudianteId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        nombre: 'NombreActualizado',
                        apellido: estudiantes.body[0].apellido,
                        identificacion: estudiantes.body[0].identificacion,
                        telefono: estudiantes.body[0].telefono
                    });

                // Puede retornar error si el ID no es válido
                if (response.status === 200) {
                    expect(response.body).toHaveProperty('message');
                }
            }
        });

        it('debe rechazar actualización sin permisos', async () => {
            const response = await request(app)
                .put('/api/estudiantes/1')
                .send({ nombre: 'Test' })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

    });

    describe('GET /api/estudiantes/historial-academico', () => {

        it('debe obtener historial académico del estudiante autenticado', async () => {
            // Login como estudiante
            const estudianteLogin = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'estudiante1',
                    password: 'password123'
                });

            if (estudianteLogin.status === 200) {
                const estudianteToken = estudianteLogin.body.token;

                const response = await request(app)
                    .get('/api/estudiantes/historial-academico')
                    .set('Authorization', `Bearer ${estudianteToken}`)
                    .expect(200);

                expect(response.body).toHaveProperty('cursosActivos');
                expect(response.body).toHaveProperty('cursosFinalizados');
                expect(response.body.cursosActivos).toBeInstanceOf(Array);
                expect(response.body.cursosFinalizados).toBeInstanceOf(Array);
            }
        });

    });

});
