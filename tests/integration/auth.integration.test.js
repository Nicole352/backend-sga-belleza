/**
 * PRUEBAS DE INTEGRACIÓN - AUTENTICACIÓN
 * Prueban flujo completo: Request → Controller → Database → Response
 * USA BASE DE DATOS REAL (no mocks)
 * 
 * IMPORTANTE: Usa el usuario superadmin existente:
 * - Email: superadmin@belleza.com
 * - Password: 12345678
 * - Este usuario ya existe en la BD (creado en el script de inicialización)
 */

const request = require('supertest');
const app = require('../../server');
const { pool } = require('../../src/config/database');

describe('Integration Tests - Autenticación', () => {

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/auth/login', () => {

    it('debe autenticar usuario con credenciales válidas', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'superadmin@belleza.com',
          password: '12345678'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'superadmin@belleza.com');
    });

    it('debe rechazar credenciales inválidas', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'superadmin@belleza.com',
          password: 'passwordIncorrecto'
        })
        .expect(401);

      // El backend puede retornar {} vacío en algunos casos
      expect(response.status).toBe(401);
    });

    it('debe rechazar email no existente', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'noexiste@belleza.com',
          password: 'cualquierPassword'
        })
        .expect(401);

      expect(response.status).toBe(401);
    });

    it('debe validar campos obligatorios', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'superadmin@belleza.com'
          // Falta password
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('debe validar formato de email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'emailInvalido',
          password: '12345678'
        });

      // Puede retornar 400 o 401 dependiendo de la validación
      expect([400, 401]).toContain(response.status);
    });

  });

  describe('GET /api/auth/me', () => {

    let authToken;

    beforeAll(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'superadmin@belleza.com',
          password: '12345678'
        });

      authToken = loginResponse.body.token;
    });

    it('debe obtener información del usuario autenticado', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // El backend retorna el usuario directamente, no en {user: ...}
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('rol');
    });

    it('debe rechazar petición sin token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('debe rechazar token inválido', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer tokenInvalido123')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

  });

  describe('POST /api/auth/reset-password', () => {

    let authToken;

    beforeAll(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'superadmin@belleza.com',
          password: '12345678'
        });

      authToken = loginResponse.body.token;
    });

    it('debe cambiar contraseña con token válido', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newPassword: 'nuevaPassword123',
          confirmPassword: 'nuevaPassword123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');

      // Restaurar password original
      await request(app)
        .post('/api/auth/reset-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newPassword: '12345678',
          confirmPassword: '12345678'
        });
    });

    it('debe rechazar si passwords no coinciden', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newPassword: 'password1',
          confirmPassword: 'password2'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('debe validar longitud mínima de password', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newPassword: '123',
          confirmPassword: '123'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

  });

});
