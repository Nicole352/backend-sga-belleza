const { pool } = require('../config/database');

async function initTiposCursosTable() {
  try {
    // Verificar si la tabla tipos_cursos existe
    const [tables] = await pool.execute(
      "SHOW TABLES LIKE 'tipos_cursos'"
    );

    if (tables.length === 0) {
      console.log('Creando tabla tipos_cursos...');

      // Crear tabla tipos_cursos
      await pool.execute(`
        CREATE TABLE tipos_cursos (
          id_tipo_curso INT AUTO_INCREMENT PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL UNIQUE,
          descripcion TEXT,
          duracion_meses INT,
          precio_base DECIMAL(10,2),
          modalidad_pago ENUM('mensual', 'completo') DEFAULT 'mensual',
          numero_clases INT,
          precio_por_clase DECIMAL(10,2),
          matricula_incluye_primera_clase BOOLEAN DEFAULT TRUE,
          estado ENUM('activo', 'inactivo') DEFAULT 'activo',
          card_key VARCHAR(100) UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      console.log('Tabla tipos_cursos creada exitosamente');

      // Insertar datos por defecto
      await pool.execute(`
        INSERT INTO tipos_cursos (nombre, descripcion, duracion_meses, precio_base, modalidad_pago, numero_clases, precio_por_clase, matricula_incluye_primera_clase, estado, card_key) VALUES
        ('Curso Básico', 'Curso introductorio para principiantes', 3, 150.00, 'mensual', 12, 50.00, TRUE, 'activo', 'curso-basico'),
        ('Curso Intermedio', 'Curso para estudiantes con conocimientos básicos', 4, 200.00, 'mensual', 16, 50.00, TRUE, 'activo', 'curso-intermedio'),
        ('Curso Avanzado', 'Curso para estudiantes avanzados', 6, 300.00, 'completo', 24, 12.50, TRUE, 'activo', 'curso-avanzado')
      `);

      console.log('Datos por defecto de tipos_cursos insertados');
    } else {
      console.log('La tabla tipos_cursos ya existe');
    }
  } catch (error) {
    console.error('Error inicializando tabla tipos_cursos:', error);
  }
}

async function ensureEstudiantePromocionDecisionColumns() {
  try {
    const [tableExists] = await pool.execute(
      "SHOW TABLES LIKE 'estudiante_promocion'"
    );

    if (tableExists.length === 0) {
      console.warn('Tabla estudiante_promocion no existe aún, omitiendo validación de columnas');
      return;
    }

    const [decisionColumn] = await pool.execute(
      "SHOW COLUMNS FROM estudiante_promocion LIKE 'decision_estudiante'"
    );

    const [fechaColumn] = await pool.execute(
      "SHOW COLUMNS FROM estudiante_promocion LIKE 'fecha_decision'"
    );

    if (!decisionColumn.length) {
      console.log('Agregando columna decision_estudiante a estudiante_promocion...');
      await pool.execute(`
        ALTER TABLE estudiante_promocion
        ADD COLUMN decision_estudiante ENUM('pendiente','continuar','rechazar') DEFAULT 'pendiente' AFTER fecha_inicio_cobro
      `);
      console.log('Columna decision_estudiante creada');
    }

    if (!fechaColumn.length) {
      console.log('Agregando columna fecha_decision a estudiante_promocion...');
      await pool.execute(`
        ALTER TABLE estudiante_promocion
        ADD COLUMN fecha_decision DATETIME NULL AFTER decision_estudiante
      `);
      console.log('Columna fecha_decision creada');
    }
  } catch (error) {
    console.error('Error asegurando columnas de decisión en estudiante_promocion:', error);
  }
}

// Inicializar la base de datos
async function initDatabase() {
  try {
    await initTiposCursosTable();
    await ensureEstudiantePromocionDecisionColumns();
    console.log('Inicialización de base de datos completada');
  } catch (error) {
    console.error('Error durante la inicialización de base de datos:', error);
  }
}

module.exports = initDatabase;