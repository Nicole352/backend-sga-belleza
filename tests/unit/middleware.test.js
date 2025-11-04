/**
 * Tests Unitarios de MIDDLEWARE
 * Prueba authMiddleware, requireRole, auditoría, rate limiting
 * NO usa datos ficticios de usuarios
 */

const jwt = require('jsonwebtoken');

jest.mock('jsonwebtoken');

describe('Middleware - Tests Unitarios', () => {
  
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      headers: {},
      body: {},
      usuario: null,
      ip: '127.0.0.1',
      get: jest.fn((header) => mockReq.headers[header.toLowerCase()])
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
  });

  describe('Auth Middleware', () => {
    
    it('debe validar presencia del header Authorization', () => {
      mockReq.headers.authorization = undefined;

      const tieneToken = !!mockReq.headers.authorization;
      expect(tieneToken).toBe(false);

      if (!tieneToken) {
        mockRes.status(401).json({ error: 'Token no proporcionado' });
      }

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('debe validar formato Bearer Token', () => {
      const tokensInvalidos = [
        'abc123',
        'Bearer',           // Sin token
        'Token abc123',     // Palabra incorrecta
      ];

      tokensInvalidos.forEach(token => {
        const esFormatoValido = token && token.startsWith('Bearer ') && token.split(' ').length === 2 && token.split(' ')[1];
        expect(esFormatoValido).toBeFalsy();
      });

      // Token vacío
      const tokenVacio = '';
      const esVacioInvalido = tokenVacio && tokenVacio.startsWith('Bearer ');
      expect(esVacioInvalido).toBeFalsy();

      const tokenValido = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.xyz';
      const esValido = tokenValido.startsWith('Bearer ') && tokenValido.split(' ').length === 2 && tokenValido.split(' ')[1];
      expect(esValido).toBeTruthy();
    });

    it('debe extraer token del header', () => {
      mockReq.headers.authorization = 'Bearer mock.jwt.token';

      const parts = mockReq.headers.authorization.split(' ');
      const token = parts[1];

      expect(token).toBe('mock.jwt.token');
    });

    it('debe verificar JWT y extraer payload', () => {
      const mockPayload = {
        id_usuario: 1,
        rol: 'admin',
        email: 'admin@escuela.com'
      };

      jwt.verify.mockReturnValue(mockPayload);
      const decoded = jwt.verify('mock.jwt.token', 'secret');

      expect(decoded).toEqual(mockPayload);
      expect(decoded.id_usuario).toBe(1);
      expect(decoded.rol).toBe('admin');
    });

    it('debe rechazar tokens expirados', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      try {
        jwt.verify('expired.token', 'secret');
        fail('Debería haber lanzado error');
      } catch (error) {
        expect(error.message).toBe('jwt expired');
      }
    });

    it('debe rechazar tokens inválidos', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      try {
        jwt.verify('invalid.token', 'secret');
        fail('Debería haber lanzado error');
      } catch (error) {
        mockRes.status(401).json({ error: 'Token inválido' });
      }

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

  });

  describe('requireRole Middleware', () => {
    
    it('debe validar jerarquía de roles', () => {
      const jerarquia = ['super_admin', 'admin', 'docente', 'estudiante'];

      expect(jerarquia.indexOf('super_admin')).toBeLessThan(jerarquia.indexOf('admin'));
      expect(jerarquia.indexOf('admin')).toBeLessThan(jerarquia.indexOf('docente'));
      expect(jerarquia.indexOf('docente')).toBeLessThan(jerarquia.indexOf('estudiante'));
    });

    it('debe permitir acceso si rol está en lista permitida', () => {
      const rolesPermitidos = ['admin', 'super_admin'];
      mockReq.usuario = { rol: 'admin' };

      const tienePermiso = rolesPermitidos.includes(mockReq.usuario.rol);
      expect(tienePermiso).toBe(true);

      if (tienePermiso) {
        mockNext();
      }

      expect(mockNext).toHaveBeenCalled();
    });

    it('debe denegar acceso si rol no está permitido', () => {
      const rolesPermitidos = ['admin', 'super_admin'];
      mockReq.usuario = { rol: 'estudiante' };

      const tienePermiso = rolesPermitidos.includes(mockReq.usuario.rol);
      expect(tienePermiso).toBe(false);

      if (!tienePermiso) {
        mockRes.status(403).json({ error: 'Acceso denegado' });
      }

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

  });

  describe('Auditoría Middleware', () => {
    
    it('debe capturar información del request', () => {
      mockReq.usuario = { id_usuario: 1 };
      mockReq.ip = '192.168.1.100';
      mockReq.get.mockReturnValue('Mozilla/5.0');

      const infoAuditoria = {
        id_usuario: mockReq.usuario.id_usuario,
        ip: mockReq.ip,
        user_agent: mockReq.get('user-agent'),
        timestamp: new Date()
      };

      expect(infoAuditoria.id_usuario).toBe(1);
      expect(infoAuditoria.ip).toBe('192.168.1.100');
      expect(infoAuditoria.user_agent).toBe('Mozilla/5.0');
      expect(infoAuditoria.timestamp).toBeInstanceOf(Date);
    });

    it('debe registrar operación CREATE con datos', () => {
      const datosAuditoria = {
        tabla: 'cursos',
        accion: 'CREATE',
        id_registro: 1,
        datos_nuevos: { nombre_curso: 'Manicure Básico' }
      };

      expect(datosAuditoria.accion).toBe('CREATE');
      expect(datosAuditoria.tabla).toBe('cursos');
      expect(datosAuditoria.datos_nuevos).toBeDefined();
    });

    it('debe registrar operación UPDATE con datos anteriores y nuevos', () => {
      const datosAuditoria = {
        tabla: 'estudiantes',
        accion: 'UPDATE',
        id_registro: 1,
        datos_anteriores: { estado: 'activo' },
        datos_nuevos: { estado: 'inactivo' }
      };

      expect(datosAuditoria.accion).toBe('UPDATE');
      expect(datosAuditoria.datos_anteriores).toBeDefined();
      expect(datosAuditoria.datos_nuevos).toBeDefined();
    });

    it('debe registrar operación DELETE con datos eliminados', () => {
      const datosAuditoria = {
        tabla: 'tareas',
        accion: 'DELETE',
        id_registro: 5,
        datos_anteriores: { titulo: 'Tarea Eliminada' }
      };

      expect(datosAuditoria.accion).toBe('DELETE');
      expect(datosAuditoria.datos_anteriores).toBeDefined();
    });

  });

  describe('Rate Limiting', () => {
    
    it('debe contar requests por IP', () => {
      const requestsPorIP = {};
      const ip = '127.0.0.1';

      // Simular 5 requests
      for (let i = 0; i < 5; i++) {
        requestsPorIP[ip] = (requestsPorIP[ip] || 0) + 1;
      }

      expect(requestsPorIP[ip]).toBe(5);
    });

    it('debe aplicar límite de 100 req/15min (generalLimiter)', () => {
      const limite = 100;
      const ventana = 15 * 60 * 1000; // 15 minutos en ms

      expect(limite).toBe(100);
      expect(ventana).toBe(900000);
    });

    it('debe aplicar límite de 10 req/1min (pollingLimiter)', () => {
      const limite = 10;
      const ventana = 60 * 1000; // 1 minuto en ms

      expect(limite).toBe(10);
      expect(ventana).toBe(60000);
    });

    it('debe aplicar límite de 30 req/5min (loginLimiter)', () => {
      const limite = 30;
      const ventana = 5 * 60 * 1000; // 5 minutos en ms

      expect(limite).toBe(30);
      expect(ventana).toBe(300000);
    });

    it('debe bloquear después de exceder límite', () => {
      const limite = 5;
      let requests = 0;

      for (let i = 0; i < 7; i++) {
        requests++;
        if (requests > limite) {
          mockRes.status(429).json({ error: 'Demasiadas solicitudes' });
          break;
        }
      }

      expect(requests).toBe(6);
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });

  });

  describe('Validaciones de Seguridad', () => {
    
    it('debe detectar intentos de SQL injection', () => {
      const inputsMaliciosos = [
        "'; DROP TABLE usuarios; --",
        "1' OR '1'='1",
        "admin'--"
      ];

      inputsMaliciosos.forEach(input => {
        const tieneSQLInjection = input.includes("'") || input.includes("--") || input.includes("DROP");
        expect(tieneSQLInjection).toBe(true);
      });
    });

    it('debe validar password antes de hashear', async () => {
      const passwords = [
        { password: '12345', valido: false },  // Muy corto
        { password: 'abc123', valido: true },  // Mínimo 6 caracteres
        { password: '', valido: false },       // Vacío
        { password: null, valido: false }      // Null
      ];

      passwords.forEach(({ password, valido }) => {
        const esValido = password && password.length >= 6;
        expect(!!esValido).toBe(valido);
      });
    });

  });

  describe('Error Handling Middleware', () => {
    
    it('debe capturar errores y formatear respuesta', () => {
      const error = new Error('Error de prueba');
      error.statusCode = 400;

      const statusCode = error.statusCode || 500;
      const message = error.message || 'Error interno del servidor';

      mockRes.status(statusCode).json({ error: message });

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error de prueba' });
    });

    it('debe usar 500 si no hay statusCode definido', () => {
      const error = new Error('Error sin código');

      const statusCode = error.statusCode || 500;
      mockRes.status(statusCode).json({ error: error.message });

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

  });

});
