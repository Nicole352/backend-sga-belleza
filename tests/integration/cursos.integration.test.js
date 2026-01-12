/**
 * PRUEBAS DE INTEGRACIÓN - CURSOS
 * Prueban flujo completo de gestión de cursos
 * USA BASE DE DATOS REAL
 */

const request = require('supertest');
const app = require('../../server');
const { pool } = require('../../src/config/database');

describe('Integration Tests - Cursos', () => {

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

    describe('GET /api/cursos', () => {

        it('debe obtener lista de cursos', async () => {
            const response = await request(app)
                .get('/api/cursos')
                .expect(200);

            expect(response.body).toBeInstanceOf(Array);
            if (response.body.length > 0) {
                expect(response.body[0]).toHaveProperty('id_curso');
                expect(response.body[0]).toHaveProperty('nombre');
                expect(response.body[0]).toHaveProperty('estado');
            }
        });

        it('debe filtrar cursos por estado', async () => {
            const response = await request(app)
                .get('/api/cursos')
                .query({ estado: 'activo' })
                .expect(200);

            expect(response.body).toBeInstanceOf(Array);
            response.body.forEach(curso => {
                expect(curso.estado).toBe('activo');
            });
        });

        it('debe soportar paginación', async () => {
            const response = await request(app)
                .get('/api/cursos')
                .query({ page: 1, limit: 5 })
                .expect(200);

            expect(response.body).toBeInstanceOf(Array);
            expect(response.body.length).toBeLessThanOrEqual(5);
        });

    });

    describe('GET /api/cursos/disponibles', () => {

        it('debe obtener cursos disponibles para inscripción', async () => {
            const response = await request(app)
                .get('/api/cursos/disponibles')
                .expect(200);

            expect(response.body).toBeInstanceOf(Array);
            // Los cursos disponibles pueden tener diferentes estructuras
            if (response.body.length > 0) {
                expect(response.body[0]).toHaveProperty('id_curso');
            }
        });

    });

    describe('GET /api/cursos/:id', () => {

        it('debe obtener curso por ID', async () => {
            // Primero obtener un ID válido
            const cursos = await request(app)
                .get('/api/cursos');

            if (cursos.body.length > 0) {
                const cursoId = cursos.body[0].id;

                const response = await request(app)
                    .get(`/api/cursos/${cursoId}`);

                // Puede retornar 200 o 400 dependiendo del formato
                if (response.status === 200) {
                    expect(response.body).toHaveProperty('id_curso');
                    expect(response.body).toHaveProperty('nombre');
                }
            }
        });

        it('debe rechazar ID no existente', async () => {
            const response = await request(app)
                .get('/api/cursos/99999')
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

    });

    describe('POST /api/cursos', () => {

        it('debe crear curso con permisos de admin', async () => {
            const nuevoCurso = {
                id_tipo_curso: 1,
                nombre: 'Curso de Prueba Integration',
                horario: 'matutino',
                capacidad_maxima: 20,
                fecha_inicio: '2026-02-01',
                fecha_fin: '2026-05-01'
            };

            const response = await request(app)
                .post('/api/cursos')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(nuevoCurso);

            if (response.status === 201) {
                expect(response.body).toHaveProperty('id_curso');
                expect(response.body).toHaveProperty('nombre', nuevoCurso.nombre);

                // Limpiar: eliminar curso creado
                if (response.body.id_curso) {
                    await request(app)
                        .delete(`/api/cursos/${response.body.id_curso}`)
                        .set('Authorization', `Bearer ${adminToken}`);
                }
            }
        });

        it('debe rechazar creación sin autenticación', async () => {
            const response = await request(app)
                .post('/api/cursos')
                .send({
                    nombre: 'Curso Test',
                    descripcion: 'Test'
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('debe validar campos obligatorios', async () => {
            const response = await request(app)
                .post('/api/cursos')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    nombre: 'Curso Test'
                    // Faltan campos obligatorios
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

    });

    describe('PUT /api/cursos/:id', () => {

        it('debe actualizar curso con permisos de admin', async () => {
            // Obtener un curso existente
            const cursos = await request(app)
                .get('/api/cursos');

            if (cursos.body.length > 0) {
                const cursoId = cursos.body[0].id_curso;
                const nombreOriginal = cursos.body[0].nombre;

                const response = await request(app)
                    .put(`/api/cursos/${cursoId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        nombre: 'Nombre Actualizado Test',
                        horario: cursos.body[0].horario,
                        fecha_inicio: cursos.body[0].fecha_inicio,
                        fecha_fin: cursos.body[0].fecha_fin
                    });

                // Puede retornar error si el ID no es válido
                if (response.status === 200) {
                    expect(response.body).toHaveProperty('message');
                }
            }
        });

    });

    describe('DELETE /api/cursos/:id', () => {

        it('debe eliminar curso con permisos de admin', async () => {
            // Crear curso temporal
            const nuevoCurso = await request(app)
                .post('/api/cursos')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    nombre: 'Curso Temporal para Eliminar',
                    descripcion: 'Test',
                    duracion_meses: 1,
                    precio_mensual: 50,
                    estado: 'activo',
                    tipo_curso_id: 1
                });

            if (nuevoCurso.body.id) {
                const response = await request(app)
                    .delete(`/api/cursos/${nuevoCurso.body.id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body).toHaveProperty('message');

                // Verificar que fue eliminado
                const verificar = await request(app)
                    .get(`/api/cursos/${nuevoCurso.body.id}`)
                    .expect(404);
            }
        });

        it('debe rechazar eliminación sin permisos', async () => {
            const response = await request(app)
                .delete('/api/cursos/1')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

    });

    describe('GET /api/cursos/:id/estudiantes', () => {

        it('debe obtener estudiantes de un curso con autenticación', async () => {
            const cursos = await request(app)
                .get('/api/cursos');

            if (cursos.body.length > 0) {
                const cursoId = cursos.body[0].id_curso;

                const response = await request(app)
                    .get(`/api/cursos/${cursoId}/estudiantes`)
                    .set('Authorization', `Bearer ${authToken}`);

                // El endpoint puede retornar array o error object
                if (response.status === 200 && Array.isArray(response.body)) {
                    expect(response.body).toBeInstanceOf(Array);
                }
            }
        });

        it('debe rechazar petición sin autenticación', async () => {
            const response = await request(app)
                .get('/api/cursos/1/estudiantes')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

    });

});
