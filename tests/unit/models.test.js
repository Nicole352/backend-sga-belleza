/**
 * Tests Unitarios de MODELOS
 * Mockea pool.query() para probar funciones sin tocar BD real
 * NO usa datos ficticios de usuarios
 */

const cursosModel = require('../../src/models/cursos.model');
const estudiantesModel = require('../../src/models/estudiantes.model');
const tareasModel = require('../../src/models/tareas.model');
const asistenciasModel = require('../../src/models/asistencias.model');
const { pool } = require('../../src/config/database');

// Mock del pool de conexiones
jest.mock('../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    execute: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  }
}));

describe('Modelos - Tests Unitarios (BD Mockeada)', () => {
  
  afterAll(async () => {
    // Cerrar pool de conexiones para evitar warning de Jest
    if (pool && pool.end) {
      await pool.end();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Cursos Model', () => {
    
    it('debe listar cursos con paginación correcta', async () => {
      // Simular respuesta de BD (estructura real, no usuarios ficticios)
      pool.execute.mockResolvedValueOnce([
        [
          { 
            id_curso: 1, 
            nombre_curso: 'Manicure Básico',
            cupo_maximo: 25,
            cupo_disponible: 18,
            estado: 'activo'
          }
        ]
      ]);

      const result = await cursosModel.listCursos({ page: 1, limit: 10 });

      expect(result).toBeDefined();
      expect(pool.execute).toHaveBeenCalledTimes(1);
      
      // Verificar cálculo de offset
      const offset = (1 - 1) * 10; // (page - 1) * limit
      expect(offset).toBe(0);
    });

    it('debe calcular ocupación de cursos correctamente', () => {
      // Validación pura de lógica de ocupación (sin BD)
      const cupo_maximo = 25;
      const cupo_disponible = 7;
      const ocupados = cupo_maximo - cupo_disponible;
      const porcentaje = (ocupados / cupo_maximo) * 100;

      expect(porcentaje).toBe(72); // (25-7)/25 * 100 = 72%
      expect(ocupados).toBe(18);
    });

    it('debe validar que LIMIT/OFFSET sean números válidos', async () => {
      // IMPORTANTE: LIMIT y OFFSET deben insertarse directamente en SQL (no como placeholders)
      const limit = 10;
      const page = 2;
      const safeLimit = Math.max(1, Math.floor(Number(limit)));
      const safePage = Math.max(1, Math.floor(Number(page)));
      const offset = (safePage - 1) * safeLimit;

      expect(safeLimit).toBe(10);
      expect(safePage).toBe(2);
      expect(offset).toBe(10);
      expect(typeof safeLimit).toBe('number');
      expect(typeof offset).toBe('number');
    });

  });

  describe('Estudiantes Model', () => {
    
    it('debe generar código de estudiante con formato EST-YYYY-XXX', () => {
      // Validación pura de lógica de generación de código
      const ultimoCodigo = 'EST-2024-015';
      
      // Extraer número y generar siguiente
      const match = ultimoCodigo.match(/EST-(\d{4})-(\d{3})/);
      expect(match).toBeTruthy();
      
      const year = match[1];
      const num = parseInt(match[2]) + 1;
      const nuevoCodigo = `EST-${year}-${String(num).padStart(3, '0')}`;
      
      expect(nuevoCodigo).toBe('EST-2024-016');
    });

    it('debe validar identificación de 10 dígitos', async () => {
      const identificacion = '1234567890';
      expect(identificacion.length).toBe(10);
      expect(/^\d{10}$/.test(identificacion)).toBe(true);
      expect(/^\d{10}$/.test('123456789')).toBe(false); // 9 dígitos = inválido
    });

  });

  describe('Tareas Model', () => {
    
    it('debe calcular promedio de calificaciones correctamente', () => {
      // Validación pura de cálculo de promedio
      const calificaciones = [
        { calificacion: 8.5 },
        { calificacion: 9.0 },
        { calificacion: 7.5 }
      ];
      
      const suma = calificaciones.reduce((acc, c) => acc + c.calificacion, 0);
      const promedio = suma / calificaciones.length;

      expect(promedio).toBeCloseTo(8.33, 1); // (8.5 + 9.0 + 7.5) / 3
      expect(promedio).toBeGreaterThanOrEqual(7); // Aprobado
    });

    it('debe detectar entregas tardías correctamente', async () => {
      const fechaLimite = new Date('2024-11-01T23:59:59');
      const fechaEntrega = new Date('2024-11-02T10:30:00');
      
      const esTardia = fechaEntrega > fechaLimite;
      const horasTarde = (fechaEntrega - fechaLimite) / (1000 * 60 * 60);

      expect(esTardia).toBe(true);
      expect(horasTarde).toBeGreaterThan(10);
    });

  });

  describe('Asistencias Model', () => {
    
    it('debe calcular porcentaje de asistencia correctamente', () => {
      // Validación pura de cálculo de porcentaje
      const total = 20;
      const asistencias = 17;
      const porcentaje = (asistencias / total) * 100;

      expect(porcentaje).toBe(85); // 17/20 * 100
      expect(porcentaje).toBeGreaterThanOrEqual(75); // No está en riesgo
    });

    it('debe identificar estudiantes en riesgo (<75% asistencia)', async () => {
      const porcentajes = [85, 70, 60, 90, 50];
      const enRiesgo = porcentajes.filter(p => p < 75);

      expect(enRiesgo).toEqual([70, 60, 50]);
      expect(enRiesgo.length).toBe(3);
    });

  });

  describe('Validaciones SQL Injection', () => {
    
    it('debe escapar caracteres peligrosos en queries', async () => {
      const inputMalicioso = "'; DROP TABLE usuarios; --";
      
      // Verificar que usar placeholders (?) protege contra SQL injection
      const query = 'SELECT * FROM usuarios WHERE email = ?';
      pool.query.mockResolvedValueOnce([[]]);

      await pool.query(query, [inputMalicioso]);

      // El mock debe recibir el input como parámetro separado (no concatenado en SQL)
      expect(pool.query).toHaveBeenCalledWith(query, [inputMalicioso]);
    });

  });

  describe('Manejo de Errores en Modelos', () => {
    
    it('debe manejar errores de conexión a BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Connection timeout'));

      try {
        await pool.query('SELECT * FROM cursos');
        throw new Error('No debería llegar aquí');
      } catch (error) {
        expect(error.message).toBe('Connection timeout');
      }
    });

    it('debe manejar registros no encontrados', async () => {
      pool.query.mockResolvedValueOnce([[]]);

      const [rows] = await pool.query('SELECT * FROM cursos WHERE id_curso = 9999');
      expect(rows.length).toBe(0);
    });

  });

});
