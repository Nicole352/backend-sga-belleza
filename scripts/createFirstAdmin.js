/**
 * Script para crear el primer usuario administrador del sistema
 * Ejecutar con: npm run setup
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/database');

async function createFirstAdmin() {
  try {
    console.log('🚀 Iniciando creación del primer administrador...');

    // 1. Verificar conexión a la base de datos
    const connection = await pool.getConnection();
    console.log('✅ Conectado a la base de datos');

    // 2. Verificar si ya existe un superadmin
    const [existingAdmins] = await connection.execute(`
      SELECT u.*, r.nombre_rol 
      FROM usuarios u 
      JOIN roles r ON u.id_rol = r.id_rol 
      WHERE r.nombre_rol = 'superadmin'
    `);

    if (existingAdmins.length > 0) {
      console.log('⚠️  Ya existe un superadministrador en el sistema:');
      console.log(`   Email: ${existingAdmins[0].email}`);
      console.log(`   Nombre: ${existingAdmins[0].nombre} ${existingAdmins[0].apellido}`);
      connection.release();
      return;
    }

    // 3. Crear rol superadmin si no existe
    await connection.execute(`
      INSERT IGNORE INTO roles (nombre_rol, descripcion, estado) 
      VALUES ('superadmin', 'Super Administrador del sistema con acceso total', 'activo')
    `);

    // 4. Obtener el ID del rol superadmin
    const [roleRows] = await connection.execute(
      'SELECT id_rol FROM roles WHERE nombre_rol = ? LIMIT 1',
      ['superadmin']
    );

    if (roleRows.length === 0) {
      throw new Error('No se pudo crear o encontrar el rol superadmin');
    }

    const roleId = roleRows[0].id_rol;

    // 5. Datos del primer administrador
    const adminData = {
      cedula: '0000000001',
      nombre: 'Super',
      apellido: 'Administrador',
      email: 'admin@bellezaacademia.edu',
      telefono: '+593999999999',
      password: 'Admin123!',  // Cambiar después del primer login
      fecha_nacimiento: '1990-01-01',
      direccion: 'Guayaquil, Ecuador',
      genero: 'otro'
    };

    // 6. Hashear la contraseña
    const passwordHash = await bcrypt.hash(adminData.password, 10);

    // 7. Insertar el usuario administrador
    const [result] = await connection.execute(`
      INSERT INTO usuarios (
        cedula, nombre, apellido, email, telefono, password, 
        fecha_nacimiento, direccion, genero, id_rol, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')
    `, [
      adminData.cedula,
      adminData.nombre,
      adminData.apellido,
      adminData.email,
      adminData.telefono,
      passwordHash,
      adminData.fecha_nacimiento,
      adminData.direccion,
      adminData.genero,
      roleId
    ]);

    console.log('✅ Primer administrador creado exitosamente!');
    console.log('');
    console.log('📋 CREDENCIALES DE ACCESO:');
    console.log('   Email:', adminData.email);
    console.log('   Contraseña:', adminData.password);
    console.log('   Rol: superadmin');
    console.log('');
    console.log('⚠️  IMPORTANTE:');
    console.log('   - Cambia la contraseña después del primer login');
    console.log('   - Accede al sistema en: http://localhost:5173/login');
    console.log('   - Una vez dentro, ve a /dashboard para ser redirigido automáticamente');
    console.log('');

    connection.release();

    // 8. Verificar que se creó correctamente
    const [verification] = await pool.execute(`
      SELECT u.*, r.nombre_rol 
      FROM usuarios u 
      JOIN roles r ON u.id_rol = r.id_rol 
      WHERE u.id_usuario = ?
    `, [result.insertId]);

    if (verification.length > 0) {
      console.log('✅ Verificación exitosa - Usuario creado con ID:', result.insertId);
    }

  } catch (error) {
    console.error('❌ Error creando el primer administrador:', error.message);
    
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('⚠️  El email o cédula ya están registrados en el sistema');
    }
    
    // Si hay error de conexión
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 SOLUCIÓN: Asegúrate de que MySQL esté corriendo y las credenciales en .env sean correctas');
    }
  } finally {
    await pool.end();
  }
}

// Ejecutar el script
if (require.main === module) {
  createFirstAdmin()
    .then(() => {
      console.log('🏁 Script completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = createFirstAdmin;