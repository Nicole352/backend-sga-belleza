const { pool } = require('../config/database');

async function initTiposCursosTable() {
  try {
    // Check if tipos_cursos table exists
    const [tables] = await pool.execute(
      "SHOW TABLES LIKE 'tipos_cursos'"
    );
    
    if (tables.length === 0) {
      console.log('Creating tipos_cursos table...');
      
      // Create tipos_cursos table
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
      
      console.log('tipos_cursos table created successfully');
      
      // Insert some default data
      await pool.execute(`
        INSERT INTO tipos_cursos (nombre, descripcion, duracion_meses, precio_base, modalidad_pago, numero_clases, precio_por_clase, matricula_incluye_primera_clase, estado, card_key) VALUES
        ('Curso Básico', 'Curso introductorio para principiantes', 3, 150.00, 'mensual', 12, 50.00, TRUE, 'activo', 'curso-basico'),
        ('Curso Intermedio', 'Curso para estudiantes con conocimientos básicos', 4, 200.00, 'mensual', 16, 50.00, TRUE, 'activo', 'curso-intermedio'),
        ('Curso Avanzado', 'Curso para estudiantes avanzados', 6, 300.00, 'completo', 24, 12.50, TRUE, 'activo', 'curso-avanzado')
      `);
      
      console.log('Default tipos_cursos data inserted');
    } else {
      console.log('tipos_cursos table already exists');
    }
  } catch (error) {
    console.error('Error initializing tipos_cursos table:', error);
  }
}

// Initialize the database
async function initDatabase() {
  try {
    await initTiposCursosTable();
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Error during database initialization:', error);
  }
}

module.exports = initDatabase;