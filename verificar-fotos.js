// Script para verificar las fotos de perfil en la base de datos
const { pool } = require('./src/config/database');

async function verificarFotos() {
    try {
        console.log('🔍 Verificando fotos de perfil en la base de datos...\n');

        // Obtener todos los usuarios con foto
        const [usuariosConFoto] = await pool.execute(`
      SELECT 
        id_usuario,
        cedula,
        nombre,
        apellido,
        foto_perfil_url,
        foto_perfil_public_id
      FROM usuarios
      WHERE foto_perfil_url IS NOT NULL
      ORDER BY id_usuario
    `);

        console.log(`📊 Total de usuarios con foto de perfil: ${usuariosConFoto.length}\n`);

        if (usuariosConFoto.length > 0) {
            console.log('👤 Usuarios con foto de perfil:');
            console.log('─'.repeat(100));

            usuariosConFoto.forEach(user => {
                console.log(`ID: ${user.id_usuario} | ${user.nombre} ${user.apellido} (${user.cedula})`);
                console.log(`   URL: ${user.foto_perfil_url}`);
                console.log(`   Public ID: ${user.foto_perfil_public_id || 'N/A'}`);
                console.log('─'.repeat(100));
            });
        } else {
            console.log('⚠️  No hay usuarios con foto de perfil en la base de datos.');
        }

        // Verificar específicamente el usuario 8
        console.log('\n🔎 Verificando usuario ID 8 específicamente...\n');
        const [usuario8] = await pool.execute(`
      SELECT 
        id_usuario,
        cedula,
        nombre,
        apellido,
        foto_perfil_url,
        foto_perfil_public_id
      FROM usuarios
      WHERE id_usuario = 8
    `);

        if (usuario8.length > 0) {
            const user = usuario8[0];
            console.log('✅ Usuario 8 encontrado:');
            console.log(`   Nombre: ${user.nombre} ${user.apellido}`);
            console.log(`   Cédula: ${user.cedula}`);
            console.log(`   Foto URL: ${user.foto_perfil_url || 'NO TIENE FOTO'}`);
            console.log(`   Public ID: ${user.foto_perfil_public_id || 'N/A'}`);
        } else {
            console.log('❌ Usuario 8 no encontrado en la base de datos');
        }

        await pool.end();
        console.log('\n✅ Verificación completada');
    } catch (error) {
        console.error('❌ Error al verificar fotos:', error);
        await pool.end();
        process.exit(1);
    }
}

verificarFotos();
