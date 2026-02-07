const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const EstudiantesModel = require('../models/estudiantes.model');
const PromocionesModel = require('../models/promociones.model');
const { enviarEmailBienvenidaEstudiante, enviarConfirmacionMatricula } = require('../services/emailService');
const { generarComprobantePagoMensual } = require('../services/pdfService');
const { registrarAuditoria } = require('../utils/auditoria');
const ExcelJS = require('exceljs');

// Función para generar username único
async function generateUniqueUsername(nombre, apellido) {
  try {
    // Extraer iniciales del nombre (todas las palabras)
    const nombreParts = nombre.trim().split(' ').filter(part => part.length > 0);
    const inicialesNombre = nombreParts.map(part => part.charAt(0).toLowerCase()).join('');

    // Extraer primer apellido
    const apellidoParts = apellido.trim().split(' ').filter(part => part.length > 0);
    const primerApellido = apellidoParts[0]?.toLowerCase() || '';

    // Crear username base
    const baseUsername = inicialesNombre + primerApellido;

    // Verificar si el username ya existe (en columna usuarios.username)
    const [existingUsers] = await pool.execute(
      'SELECT COUNT(*) as count FROM usuarios WHERE username = ?',
      [baseUsername]
    );

    if (existingUsers[0].count === 0) {
      return baseUsername;
    }

    // Si existe, buscar el siguiente número disponible (usernameX)
    let counter = 2;
    while (counter <= 99) {
      const numberedUsername = baseUsername + counter;
      const [checkUsers] = await pool.execute(
        'SELECT COUNT(*) as count FROM usuarios WHERE username = ?',
        [numberedUsername]
      );

      if (checkUsers[0].count === 0) {
        return numberedUsername;
      }
      counter++;
    }

    // Fallback si no se puede generar
    return baseUsername + Math.floor(Math.random() * 1000);
  } catch (error) {
    console.error('Error generando username:', error);
    // Fallback en caso de error
    const inicialesNombre = nombre.charAt(0).toLowerCase();
    const primerApellido = apellido.split(' ')[0]?.toLowerCase() || '';
    return inicialesNombre + primerApellido + Math.floor(Math.random() * 100);
  }
}

exports.createEstudianteFromSolicitud = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id_solicitud, aprobado_por } = req.body;

    if (!id_solicitud || !aprobado_por) {
      return res.status(400).json({
        error: 'Se requiere id_solicitud y aprobado_por'
      });
    }

    // 1. Obtener datos de la solicitud
    const [solicitudes] = await connection.execute(`
      SELECT 
        s.*,
        tc.nombre AS tipo_curso_nombre
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      WHERE s.id_solicitud = ? AND s.estado = 'pendiente'
    `, [id_solicitud]);

    if (solicitudes.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: 'Solicitud no encontrada o ya procesada'
      });
    }

    const solicitud = solicitudes[0];

    // Normalizar campos NULL (pueden venir como undefined desde MySQL)
    solicitud.comprobante_pago_url = solicitud.comprobante_pago_url || null;
    solicitud.comprobante_pago_public_id = solicitud.comprobante_pago_public_id || null;
    solicitud.recibido_por = solicitud.recibido_por || null;
    solicitud.numero_comprobante = solicitud.numero_comprobante || null;
    solicitud.banco_comprobante = solicitud.banco_comprobante || null;
    solicitud.fecha_transferencia = solicitud.fecha_transferencia || null;
    solicitud.metodo_pago = solicitud.metodo_pago || null;

    // 2. Verificar si es estudiante existente o nuevo
    let id_estudiante;
    let username = null;
    let passwordTemporal = null;
    let esEstudianteExistente = false;

    if (solicitud.id_estudiante_existente) {
      // CASO 1: Estudiante YA existe en el sistema (inscripción a nuevo curso)
      console.log('Estudiante existente detectado, ID:', solicitud.id_estudiante_existente);
      id_estudiante = solicitud.id_estudiante_existente;
      esEstudianteExistente = true;

      // Verificar que el estudiante existe y está activo
      const [estudianteCheck] = await connection.execute(`
        SELECT u.id_usuario, u.username, u.estado
        FROM usuarios u
        INNER JOIN roles r ON u.id_rol = r.id_rol
        WHERE u.id_usuario = ? AND r.nombre_rol = 'estudiante'
      `, [id_estudiante]);

      if (estudianteCheck.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Estudiante no encontrado o no válido'
        });
      }

      if (estudianteCheck[0].estado !== 'activo') {
        await connection.rollback();
        return res.status(400).json({
          error: 'El estudiante no está activo en el sistema'
        });
      }

      username = estudianteCheck[0].username;

    } else {
      // CASO 2: Estudiante NUEVO (flujo original)

      // Verificar que no exista ya un usuario con esa cédula
      const [existingUser] = await connection.execute(
        'SELECT id_usuario FROM usuarios WHERE cedula = ?',
        [solicitud.identificacion_solicitante]
      );

      if (existingUser.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Ya existe un usuario con esa cédula'
        });
      }
    }

    // 3. Solo crear usuario si es estudiante NUEVO
    if (!esEstudianteExistente) {
      // Obtener el rol de estudiante
      const [roles] = await connection.execute(
        'SELECT id_rol FROM roles WHERE nombre_rol = ?',
        ['estudiante']
      );

      let id_rol_estudiante;
      if (roles.length === 0) {
        // Crear rol estudiante si no existe
        const [roleResult] = await connection.execute(
          'INSERT INTO roles (nombre_rol, descripcion, estado) VALUES (?, ?, ?)',
          ['estudiante', 'Estudiante del sistema', 'activo']
        );
        id_rol_estudiante = roleResult.insertId;
      } else {
        id_rol_estudiante = roles[0].id_rol;
      }

      // 4. Generar username único
      username = await generateUniqueUsername(
        solicitud.nombre_solicitante,
        solicitud.apellido_solicitante
      );

      // 5. Guardar email personal del solicitante
      const emailEstudiante = solicitud.email_solicitante || null;

      // 6. Generar contraseña temporal (documento) con bcrypt
      passwordTemporal = solicitud.identificacion_solicitante;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(passwordTemporal, salt);

      // 7. Crear usuario estudiante
      const [userResult] = await connection.execute(`
        INSERT INTO usuarios (
          cedula, nombre, apellido, fecha_nacimiento, telefono, email, username,
          direccion, contacto_emergencia, genero, password, password_temporal, id_rol, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        solicitud.identificacion_solicitante,
        solicitud.nombre_solicitante,
        solicitud.apellido_solicitante,
        solicitud.fecha_nacimiento_solicitante,
        solicitud.telefono_solicitante,
        emailEstudiante,
        username,
        solicitud.direccion_solicitante,
        solicitud.contacto_emergencia,
        solicitud.genero_solicitante,
        hashedPassword,
        passwordTemporal,
        id_rol_estudiante,
        'activo'
      ]);

      id_estudiante = userResult.insertId;
      console.log('Nuevo estudiante creado, ID:', id_estudiante);
    }

    // 8. Crear matrícula automáticamente
    const codigoMatricula = `MAT-${Date.now()}-${id_estudiante}`;

    // Obtener el curso asociado al tipo de curso de la solicitud CON EL HORARIO CORRECTO
    console.log(' Buscando curso con horario:', solicitud.horario_preferido);
    const [cursosDisponibles] = await connection.execute(`
      SELECT 
        c.id_curso, 
        c.horario,
        c.capacidad_maxima,
        COALESCE(
          (SELECT COUNT(*) FROM matriculas m WHERE m.id_curso = c.id_curso AND m.estado = 'activa'), 0
        ) + COALESCE(
          (SELECT COUNT(*) FROM solicitudes_matricula s 
           WHERE s.id_curso = c.id_curso 
           AND s.estado = 'pendiente'
           AND s.id_solicitud != ?), 0
        ) AS cupos_ocupados,
        c.capacidad_maxima - (
          COALESCE(
            (SELECT COUNT(*) FROM matriculas m WHERE m.id_curso = c.id_curso AND m.estado = 'activa'), 0
          ) + COALESCE(
            (SELECT COUNT(*) FROM solicitudes_matricula s 
             WHERE s.id_curso = c.id_curso 
             AND s.estado = 'pendiente'
             AND s.id_solicitud != ?), 0
          )
        ) AS cupos_reales_disponibles
      FROM cursos c
      WHERE c.id_tipo_curso = ? 
        AND c.horario = ?
        AND c.estado IN ('activo', 'planificado')
      HAVING cupos_reales_disponibles > 0
      ORDER BY c.fecha_inicio ASC 
      LIMIT 1
    `, [id_solicitud, id_solicitud, solicitud.id_tipo_curso, solicitud.horario_preferido]);

    let id_curso = null;
    if (cursosDisponibles.length > 0) {
      id_curso = cursosDisponibles[0].id_curso;
      console.log('Curso encontrado:', id_curso, 'Horario:', cursosDisponibles[0].horario, 'Cupos libres:', cursosDisponibles[0].cupos_reales_disponibles);
    } else {
      await connection.rollback();
      return res.status(400).json({
        error: `No hay cursos disponibles con horario ${solicitud.horario_preferido} para el tipo de curso seleccionado. Por favor, crea un curso con este horario primero.`
      });
    }

    if (id_curso) {
      // Obtener email del estudiante (existente o nuevo)
      let emailParaMatricula;
      if (esEstudianteExistente) {
        const [estudianteData] = await connection.execute(
          'SELECT email FROM usuarios WHERE id_usuario = ?',
          [id_estudiante]
        );
        emailParaMatricula = estudianteData[0]?.email || `${username}@estudiante.belleza.com`;
      } else {
        const emailEstudiante = solicitud.email_solicitante || null;
        emailParaMatricula = emailEstudiante || `${username}@estudiante.belleza.com`;
      }

      const [matriculaResult] = await connection.execute(`
        INSERT INTO matriculas (
          codigo_matricula, id_solicitud, id_tipo_curso, id_estudiante, 
          id_curso, monto_matricula, email_generado, creado_por, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activa')
      `, [
        codigoMatricula,
        id_solicitud,
        solicitud.id_tipo_curso,
        id_estudiante,
        id_curso,
        solicitud.monto_matricula || 0,
        emailParaMatricula,
        aprobado_por
      ]);

      const id_matricula = matriculaResult.insertId;
      console.log('Matrícula creada:', codigoMatricula, 'ID:', id_matricula);

      // *** INSERTAR EN ESTUDIANTE_CURSO PARA REPORTES (si no existe) ***
      await connection.execute(`
        INSERT IGNORE INTO estudiante_curso (id_estudiante, id_curso, fecha_inscripcion, estado)
        VALUES (?, ?, NOW(), 'activo')
      `, [id_estudiante, id_curso]);
      console.log('Estudiante agregado a estudiante_curso para reportes');
      console.log('Los cupos del curso ya fueron actualizados al crear la solicitud');
      console.log('Generando cuotas para matrícula:', id_matricula);

      // Obtener información completa del tipo de curso
      const [tipoCurso] = await connection.execute(`
        SELECT 
          duracion_meses, 
          precio_base,
          modalidad_pago,
          numero_clases,
          precio_por_clase,
          matricula_incluye_primera_clase
        FROM tipos_cursos 
        WHERE id_tipo_curso = ?
      `, [solicitud.id_tipo_curso]);

      console.log('Tipo de curso encontrado:', tipoCurso);

      if (tipoCurso.length > 0) {
        const tipoCursoData = tipoCurso[0];
        const modalidadPago = tipoCursoData.modalidad_pago || 'mensual';

        console.log('Debug - Modalidad de pago:', modalidadPago);

        if (modalidadPago === 'clases') {
          // ========================================
          // MODALIDAD POR CLASES
          // ========================================
          const numeroClases = tipoCursoData.numero_clases;
          const precioPorClase = parseFloat(tipoCursoData.precio_por_clase);

          console.log('Debug - Generando cuotas por CLASES:', {
            numeroClases,
            precioPorClase,
            id_matricula
          });

          // Generar cuotas por clases
          const fechaInicio = new Date();

          // Calcular intervalo entre clases basado en la duración del curso
          // Si el curso dura 8 semanas (56 días) y tiene 16 clases, cada clase es cada 3.5 días
          const duracionSemanas = 8; // Duración estándar en semanas
          const diasTotales = duracionSemanas * 7;
          const diasPorClase = Math.floor(diasTotales / numeroClases);

          console.log(`Intervalo calculado: ${diasPorClase} días por clase (${numeroClases} clases en ${duracionSemanas} semanas)`);

          for (let i = 1; i <= numeroClases; i++) {
            // Fecha de vencimiento: distribuir clases uniformemente en la duración del curso
            const fechaVencimiento = new Date(fechaInicio);
            fechaVencimiento.setDate(fechaInicio.getDate() + (i - 1) * diasPorClase);

            // Monto: primera clase = $50 (matrícula), resto = precio por clase
            const montoCuota = i === 1 ? 50.00 : precioPorClase;

            console.log(`Creando cuota clase ${i}:`, {
              id_matricula,
              numero_cuota: i,
              monto: montoCuota,
              fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0]
            });

            if (i === 1) {
              // Primera clase VERIFICADA (matrícula pagada)
              await connection.execute(`
                INSERT INTO pagos_mensuales (
                  id_matricula, numero_cuota, monto, fecha_vencimiento, 
                  fecha_pago, metodo_pago, numero_comprobante, banco_comprobante, 
                  fecha_transferencia, recibido_por, comprobante_pago_url, 
                  comprobante_pago_public_id, verificado_por, fecha_verificacion, 
                  estado, observaciones
                ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'verificado', ?)
              `, [
                id_matricula, i, montoCuota, fechaVencimiento.toISOString().split('T')[0],
                solicitud.metodo_pago, solicitud.numero_comprobante, solicitud.banco_comprobante,
                solicitud.fecha_transferencia, solicitud.recibido_por, solicitud.comprobante_pago_url,
                solicitud.comprobante_pago_public_id, aprobado_por, `Matrícula pagada - Clase ${i} de ${numeroClases}`
              ]);
              console.log(`Cuota clase #${i} creada con estado VERIFICADO`);
            } else {
              // Demás clases en pendiente
              await connection.execute(`
                INSERT INTO pagos_mensuales (
                  id_matricula, numero_cuota, monto, fecha_vencimiento, estado, metodo_pago, observaciones
                ) VALUES (?, ?, ?, ?, 'pendiente', 'transferencia', ?)
              `, [
                id_matricula, i, montoCuota, fechaVencimiento.toISOString().split('T')[0],
                `Clase ${i} de ${numeroClases} - Pago individual por clase`
              ]);
              console.log(`Cuota clase #${i} creada con estado PENDIENTE`);
            }
          }

          console.log(`${numeroClases} clases generadas exitosamente para matrícula: ${id_matricula}`);

        } else {
          // ========================================
          // MODALIDAD MENSUAL (LÓGICA ORIGINAL)
          // ========================================
          const duracionMeses = tipoCursoData.duracion_meses;
          const precioMensual = tipoCursoData.precio_base / duracionMeses;

          console.log('Debug - Generando cuotas MENSUALES:', {
            duracionMeses,
            precioMensual,
            id_matricula
          });

          const fechaAprobacion = new Date();
          const diaAprobacion = fechaAprobacion.getDate();

          // Calcular cuántas cuotas cubre el monto pagado
          const MONTO_BASE = 90;
          const montoPagado = parseFloat(solicitud.monto_matricula) || MONTO_BASE;
          const numeroCuotasACubrir = Math.floor(montoPagado / MONTO_BASE);

          console.log(`Monto pagado: $${montoPagado} → Cubre ${numeroCuotasACubrir} cuota(s)`);

          for (let i = 1; i <= duracionMeses; i++) {
            const fechaVencimiento = new Date(fechaAprobacion);

            if (i === 1) {
              fechaVencimiento.setDate(diaAprobacion);
            } else {
              fechaVencimiento.setMonth(fechaAprobacion.getMonth() + (i - 1));
              fechaVencimiento.setDate(diaAprobacion);
            }

            // Marcar como verificado las primeras N cuotas según el monto pagado
            const esCuotaCubierta = i <= numeroCuotasACubrir;
            const esPrimeraCuota = i === 1;

            if (esCuotaCubierta) {
              // Cuotas cubiertas por el pago inicial
              let observacionesCuota = '';
              if (esPrimeraCuota) {
                observacionesCuota = `Pago inicial de matrícula: $${montoPagado.toFixed(2)} (cubre ${numeroCuotasACubrir} cuota(s))`;
              } else {
                observacionesCuota = `Cubierto por pago inicial de matrícula (cuota #1)`;
              }

              await connection.execute(`
                INSERT INTO pagos_mensuales (
                  id_matricula, numero_cuota, monto, fecha_vencimiento, 
                  fecha_pago, metodo_pago, numero_comprobante, banco_comprobante,
                  fecha_transferencia, recibido_por, comprobante_pago_url,
                  comprobante_pago_public_id, verificado_por, fecha_verificacion, 
                  estado, observaciones
                ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'verificado', ?)
              `, [
                id_matricula, i, MONTO_BASE,
                fechaVencimiento.toISOString().split('T')[0],
                solicitud.metodo_pago,
                esPrimeraCuota ? solicitud.numero_comprobante : null,
                esPrimeraCuota ? solicitud.banco_comprobante : null,
                esPrimeraCuota ? solicitud.fecha_transferencia : null,
                esPrimeraCuota ? solicitud.recibido_por : null,
                esPrimeraCuota ? solicitud.comprobante_pago_url : null,
                esPrimeraCuota ? solicitud.comprobante_pago_public_id : null,
                aprobado_por,
                observacionesCuota
              ]);

              console.log(`Cuota #${i} marcada como VERIFICADA (cubierta por pago inicial)`);
            } else {
              // Cuotas pendientes
              await connection.execute(`
                INSERT INTO pagos_mensuales (
                  id_matricula, numero_cuota, monto, fecha_vencimiento, estado, metodo_pago
                ) VALUES (?, ?, ?, ?, 'pendiente', 'transferencia')
              `, [id_matricula, i, MONTO_BASE, fechaVencimiento.toISOString().split('T')[0]]);

              console.log(`Cuota #${i} creada como PENDIENTE`);
            }
          }

          console.log('Cuotas mensuales generadas exitosamente para matrícula:', id_matricula);
        }
      } else {
        console.log('No se encontró tipo de curso para generar cuotas');
      }

      // Variable para almacenar el ID de la matrícula promocional (si existe)
      let id_matricula_promo = null;

      // ========================================
      // CREAR MATRÍCULA DEL CURSO PROMOCIONAL SI LA SOLICITUD TIENE PROMOCIÓN
      // ========================================
      if (solicitud.id_promocion_seleccionada) {
        console.log(`Solicitud tiene promoción ID: ${solicitud.id_promocion_seleccionada}`);

        // Obtener datos de la promoción
        const [promoRows] = await connection.execute(`
          SELECT p.id_curso_promocional, p.meses_gratis, p.nombre_promocion,
                 c.nombre as curso_nombre, c.horario as curso_horario
          FROM promociones p
          INNER JOIN cursos c ON p.id_curso_promocional = c.id_curso
          WHERE p.id_promocion = ?
        `, [solicitud.id_promocion_seleccionada]);

        if (promoRows.length > 0) {
          const promo = promoRows[0];
          console.log(`Creando matrícula del curso promocional: ${promo.curso_nombre} (ID: ${promo.id_curso_promocional})`);

          // Verificar si ya existe matrícula del curso promocional
          const [matriculaPromoExistente] = await connection.execute(`
            SELECT id_matricula FROM matriculas 
            WHERE id_estudiante = ? AND id_curso = ?
          `, [id_estudiante, promo.id_curso_promocional]);

          if (matriculaPromoExistente.length === 0) {
            // Generar código de matrícula para el curso promocional
            const codigoMatriculaPromo = `MAT-PROMO-${Date.now()}-${id_estudiante}`;

            // Obtener id_tipo_curso del curso promocional
            const [tipoCursoPromo] = await connection.execute(`
              SELECT id_tipo_curso FROM cursos WHERE id_curso = ?
            `, [promo.id_curso_promocional]);

            // Crear matrícula del curso promocional con monto 0 (gratis)
            const [resultMatriculaPromo] = await connection.execute(`
              INSERT INTO matriculas 
              (id_solicitud, id_tipo_curso, id_estudiante, id_curso, codigo_matricula, 
               fecha_matricula, monto_matricula, email_generado, estado, creado_por)
              VALUES (?, ?, ?, ?, ?, NOW(), 0, ?, 'activa', ?)
            `, [
              solicitud.id_solicitud,
              tipoCursoPromo[0].id_tipo_curso,
              id_estudiante,
              promo.id_curso_promocional,
              codigoMatriculaPromo,
              emailParaMatricula,
              aprobado_por
            ]);

            id_matricula_promo = resultMatriculaPromo.insertId;
            console.log(` Matrícula promocional creada: ${codigoMatriculaPromo} (ID: ${id_matricula_promo})`);

            // Agregar a estudiante_curso para reportes (si no existe)
            await connection.execute(`
              INSERT IGNORE INTO estudiante_curso (id_estudiante, id_curso, fecha_inscripcion, estado)
              VALUES (?, ?, NOW(), 'activo')
            `, [id_estudiante, promo.id_curso_promocional]);
            console.log(` Estudiante agregado a estudiante_curso para curso promocional`);

            // Obtener información del tipo de curso promocional para generar cuotas
            console.log(` Buscando tipo de curso con ID: ${tipoCursoPromo[0].id_tipo_curso}`);
            const [tipoCursoPromoInfo] = await connection.execute(`
              SELECT 
                duracion_meses, 
                precio_base,
                modalidad_pago,
                numero_clases,
                precio_por_clase
              FROM tipos_cursos 
              WHERE id_tipo_curso = ?
            `, [tipoCursoPromo[0].id_tipo_curso]);

            console.log(` Tipo de curso encontrado:`, tipoCursoPromoInfo);

            if (tipoCursoPromoInfo.length > 0) {
              const tipoCursoPromoData = tipoCursoPromoInfo[0];
              const mesesGratis = promo.meses_gratis || 0;
              const duracionTotal = tipoCursoPromoData.duracion_meses;
              const precioMensual = parseFloat(tipoCursoPromoData.precio_base) / duracionTotal;

              console.log(` Generando cuotas para curso promocional: ${mesesGratis} meses gratis de ${duracionTotal} total`);

              const fechaAprobacion = new Date();
              const diaAprobacion = fechaAprobacion.getDate();

              for (let i = 1; i <= duracionTotal; i++) {
                const fechaVencimiento = new Date(fechaAprobacion);
                fechaVencimiento.setMonth(fechaAprobacion.getMonth() + (i - 1));
                fechaVencimiento.setDate(diaAprobacion);

                // Las primeras cuotas (meses gratis) tienen monto 0
                const montoCuota = i <= mesesGratis ? 0 : precioMensual;

                if (i <= mesesGratis) {
                  // Cuota GRATIS (Promocional) - Heredar datos de pago y marcar como PROMOCIÓN
                  await connection.execute(`
                    INSERT INTO pagos_mensuales (
                      id_matricula, numero_cuota, monto, fecha_vencimiento, 
                      estado, metodo_pago, observaciones,
                      banco_comprobante, numero_comprobante, fecha_transferencia, recibido_por,
                      comprobante_pago_url, comprobante_pago_public_id,
                      verificado_por, fecha_verificacion, fecha_pago
                    ) VALUES (?, ?, ?, ?, 'verificado', 'PROMOCIÓN', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                  `, [
                    id_matricula_promo,
                    i,
                    montoCuota,
                    fechaVencimiento.toISOString().split('T')[0],
                    `Mes ${i} de ${mesesGratis} - PROMOCIONAL GRATIS`,
                    solicitud.banco_comprobante,
                    `PROMO-${id_matricula_promo}-${i}`,
                    solicitud.fecha_transferencia,
                    solicitud.recibido_por,
                    solicitud.comprobante_pago_url,
                    solicitud.comprobante_pago_public_id,
                    aprobado_por
                  ]);
                } else {
                  // Cuotas normales pendientes
                  await connection.execute(`
                    INSERT INTO pagos_mensuales (
                      id_matricula, numero_cuota, monto, fecha_vencimiento, estado, metodo_pago, observaciones
                    ) VALUES (?, ?, ?, ?, 'pendiente', 'transferencia', ?)
                  `, [
                    id_matricula_promo,
                    i,
                    montoCuota,
                    fechaVencimiento.toISOString().split('T')[0],
                    `Cuota mensual ${i}`
                  ]);
                }

                console.log(`${i <= mesesGratis ? '🎁' : '💰'} Cuota #${i}: ${montoCuota === 0 ? 'GRATIS (Promocional)' : `$${montoCuota.toFixed(2)}`}`);
              }

              console.log(` ${duracionTotal} cuotas generadas para curso promocional (${mesesGratis} gratis + ${duracionTotal - mesesGratis} normales)`);
            } else {
              console.log(` ERROR: No se encontró información del tipo de curso con ID: ${tipoCursoPromo[0].id_tipo_curso}`);
            }

            // Crear registro en estudiante_promocion
            await connection.execute(`
              INSERT INTO estudiante_promocion 
              (id_estudiante, id_promocion, id_matricula, horario_seleccionado, 
               acepto_promocion, meses_gratis_aplicados, fecha_inicio_cobro)
              VALUES (?, ?, ?, ?, 1, 0, DATE_ADD(NOW(), INTERVAL ? MONTH))
            `, [
              id_estudiante,
              solicitud.id_promocion_seleccionada,
              id_matricula_promo,
              solicitud.horario_preferido || promo.curso_horario,
              promo.meses_gratis || 1
            ]);
            console.log(`Registro de promoción creado para estudiante ${id_estudiante}`);

            // Incrementar cupos_utilizados de la promoción
            await connection.execute(`
              UPDATE promociones 
              SET cupos_utilizados = cupos_utilizados + 1 
              WHERE id_promocion = ?
                `, [solicitud.id_promocion_seleccionada]);
            console.log(`Cupo de promoción utilizado(ID: ${solicitud.id_promocion_seleccionada})`);

          } else {
            console.log(`Ya existe matrícula del curso promocional para este estudiante`);
          }
        } else {
          console.log(`No se encontró la promoción ID ${solicitud.id_promocion_seleccionada} `);
        }
      }

      // 9. Actualizar estado de la solicitud
      await connection.execute(`
      UPDATE solicitudes_matricula 
      SET estado = 'aprobado',
                verificado_por = ?,
                fecha_verificacion = NOW()
      WHERE id_solicitud = ?
                `, [aprobado_por, id_solicitud]);

      await connection.commit();

      // ========================================
      // EMITIR EVENTO DE WEBSOCKET - NUEVA MATRÍCULA APROBADA
      // ========================================
      try {
        const io = req.app.get('io');
        if (io) {
          // Emitir a todos los administradores
          io.to('rol_administrativo').emit('matricula_aprobada', {
            id_solicitud,
            id_estudiante,
            id_curso,
            nombre_estudiante: `${solicitud.nombre_solicitante} ${solicitud.apellido_solicitante} `,
            tipo_estudiante: esEstudianteExistente ? 'existente' : 'nuevo',
            timestamp: new Date().toISOString()
          });

          console.log(' Evento WebSocket emitido: matricula_aprobada');
        }
      } catch (socketError) {
        console.error('Error emitiendo evento WebSocket:', socketError);
        // No afecta el flujo principal
      }

      // Registrar auditoría - Creación de estudiante (solo si es nuevo)
      if (!esEstudianteExistente) {
        await registrarAuditoria({
          tabla_afectada: 'usuarios',
          operacion: 'INSERT',
          id_registro: id_estudiante,
          usuario_id: aprobado_por,
          datos_anteriores: null,
          datos_nuevos: {
            cedula: solicitud.identificacion_solicitante,
            nombre: solicitud.nombre_solicitante,
            apellido: solicitud.apellido_solicitante,
            email: solicitud.email_solicitante,
            username: username,
            telefono: solicitud.telefono_solicitante,
            rol: 'estudiante',
            estado: 'activo',
            desde_solicitud: id_solicitud,
            curso_matriculado: id_curso
          },
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      }

      // Registrar auditoría - Aprobación de solicitud
      await registrarAuditoria({
        tabla_afectada: 'solicitudes_matricula',
        operacion: 'UPDATE',
        id_registro: id_solicitud,
        usuario_id: aprobado_por,
        datos_anteriores: {
          estado: 'pendiente',
          codigo_solicitud: solicitud.codigo_solicitud
        },
        datos_nuevos: {
          estado: 'aprobado',
          verificado_por: aprobado_por,
          codigo_solicitud: solicitud.codigo_solicitud,
          nombre_solicitante: solicitud.nombre_solicitante,
          apellido_solicitante: solicitud.apellido_solicitante,
          monto_matricula: solicitud.monto_matricula,
          metodo_pago: solicitud.metodo_pago
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      // 10. GENERAR PDFs Y ENVIAR EMAILS (para TODOS los estudiantes, nuevos y existentes)
      setImmediate(async () => {
        try {
          const datosEstudiante = {
            nombres: solicitud.nombre_solicitante,
            apellidos: solicitud.apellido_solicitante,
            cedula: solicitud.identificacion_solicitante,
            email: solicitud.email_solicitante
          };

          // Generar PDFs SOLO de las matrículas recién creadas (curso principal + curso promocional si aplica)
          const pdfComprobantes = [];
          try {
            // Construir lista de IDs de matrículas recién creadas
            const matriculasIds = [id_matricula];
            if (id_matricula_promo) {
              matriculasIds.push(id_matricula_promo);
            }

            console.log(`📄 Buscando primeros pagos de las matrículas recién creadas: [${matriculasIds.join(', ')}]`);

            // Obtener SOLO los primeros pagos de las matrículas recién creadas
            const [primerosPagos] = await pool.execute(`
            SELECT
            pm.id_pago as id_pago_mensual,
              pm.monto,
              pm.fecha_pago,
              pm.metodo_pago,
              pm.numero_cuota,
              pm.numero_comprobante,
              pm.banco_comprobante,
              pm.fecha_transferencia,
              DATE_FORMAT(pm.fecha_pago, '%Y-%m') as mes_pago,
              c.nombre as nombre_curso,
              m.id_matricula
            FROM pagos_mensuales pm
            INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
            INNER JOIN cursos c ON m.id_curso = c.id_curso
            WHERE m.id_matricula IN (${matriculasIds.map(() => '?').join(',')})
              AND pm.numero_cuota = 1
              AND pm.estado = 'verificado'
            ORDER BY pm.fecha_pago DESC
          `, matriculasIds);

            console.log(`📄 Encontrados ${primerosPagos.length} primeros pagos verificados para generar PDFs`);

            // Generar un PDF por cada primer pago (curso principal + curso promocional)
            for (const pago of primerosPagos) {
              const datosPago = pago;
              const datosCurso = {
                nombre_curso: datosPago.nombre_curso
              };

              // Generar PDF del comprobante
              const pdfBuffer = await generarComprobantePagoMensual(datosEstudiante, datosPago, datosCurso);

              pdfComprobantes.push({
                buffer: pdfBuffer,
                nombreCurso: datosPago.nombre_curso
              });

              console.log(`✅ PDF generado para: ${datosPago.nombre_curso}`);
            }

            console.log(`📎 Total de PDFs generados: ${pdfComprobantes.length}`);
          } catch (pdfError) {
            console.error('Error generando PDFs de comprobantes (continuando sin PDFs):', pdfError);
          }

          // ESTUDIANTES NUEVOS: Email con credenciales + PDFs
          if (!esEstudianteExistente && passwordTemporal) {
            const credenciales = {
              username: username,
              password: passwordTemporal
            };

            await enviarEmailBienvenidaEstudiante(datosEstudiante, credenciales, pdfComprobantes);
            console.log('✉️ Email de bienvenida (con credenciales) enviado a:', solicitud.email_solicitante);
            if (pdfComprobantes.length > 0) {
              console.log(`📄 ${pdfComprobantes.length} PDF(s) incluido(s) en el email:`);
              pdfComprobantes.forEach(pdf => console.log(`   - ${pdf.nombreCurso}`));
            }
          }
          // ESTUDIANTES EXISTENTES: Email de confirmación con PDFs (sin credenciales)
          else if (esEstudianteExistente) {
            await enviarConfirmacionMatricula(datosEstudiante, pdfComprobantes, false);
            console.log('✉️ Email de confirmación de matrícula enviado a:', solicitud.email_solicitante);
            if (pdfComprobantes.length > 0) {
              console.log(`📄 ${pdfComprobantes.length} PDF(s) incluido(s) en el email:`);
              pdfComprobantes.forEach(pdf => console.log(`   - ${pdf.nombreCurso}`));
            }
          }

        } catch (emailError) {
          console.error('Error enviando email (no afecta la creación):', emailError);
        }
      });

      // Respuesta diferente según si es nuevo o existente
      if (esEstudianteExistente) {
        res.json({
          success: true,
          message: 'Nueva matrícula creada para estudiante existente',
          tipo: 'estudiante_existente',
          estudiante: {
            id_usuario: id_estudiante,
            identificacion: solicitud.identificacion_solicitante,
            username: username
          }
        });
      } else {
        res.json({
          success: true,
          message: 'Estudiante creado exitosamente',
          tipo: 'estudiante_nuevo',
          estudiante: {
            id_usuario: id_estudiante,
            identificacion: solicitud.identificacion_solicitante,
            nombre: solicitud.nombre_solicitante,
            apellido: solicitud.apellido_solicitante,
            email: solicitud.email_solicitante,
            username: username,
            password_temporal: passwordTemporal
          }
        });
      }

    }
  } catch (error) {
    await connection.rollback();
    console.error('Error creando estudiante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  } finally {
    connection.release();
  }
};

exports.getEstudiantes = async (req, res) => {
  try {
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      search: req.query.search || '',
      estado: req.query.estado || '',
      estadoCurso: req.query.estadoCurso || '',
      tipoCurso: req.query.tipoCurso || ''
    };

    console.log('📊 Filtros estudiantes:', filters, '| Total esperado desde BD');

    const result = await EstudiantesModel.getAll(filters);
    const { estudiantes, total } = result;

    // Obtener cursos inscritos para cada estudiante
    for (const estudiante of estudiantes) {
      try {
        const [cursos] = await pool.execute(`
              SELECT
              c.id_curso,
                c.nombre,
                c.codigo_curso,
                c.horario,
                m.estado
          FROM matriculas m
          INNER JOIN cursos c ON c.id_curso = m.id_curso
          WHERE m.id_estudiante = ?
                ORDER BY m.fecha_matricula DESC
        `, [estudiante.id_usuario]);

        estudiante.cursos = cursos;
      } catch (err) {
        console.error(`Error obteniendo cursos del estudiante ${estudiante.id_usuario}: `, err);
        estudiante.cursos = [];
      }
    }

    // Contar estudiantes activos (total, no solo de la pagina)
    const [[{ totalActivos }]] = await pool.execute(`
      SELECT COUNT(*) as totalActivos
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' AND u.estado = 'activo'
    `);

    console.log('Total estudiantes en BD:', total, '| Activos:', totalActivos);
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Total-Activos', String(totalActivos));
    res.json(estudiantes);

  } catch (error) {
    console.error('Error obteniendo estudiantes:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

exports.getMisCursos = async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;

    if (!id_usuario) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea estudiante
    const isEstudiante = await EstudiantesModel.isEstudiante(id_usuario);

    if (!isEstudiante) {
      return res.status(403).json({ error: 'Acceso denegado. Solo estudiantes pueden acceder a esta información.' });
    }

    // Obtener cursos matriculados usando el modelo (incluye docente, aula y horario)
    const todosCursos = await EstudiantesModel.getMisCursos(id_usuario);

    // FILTRAR: Solo devolver cursos ACTIVOS (no finalizados)
    // Un curso está ACTIVO si:
    // - El estado del curso NO es 'finalizado' ni 'cancelado', Y
    // - La fecha de fin NO ha pasado (es hoy o futura)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Normalizar a medianoche para comparación justa

    const cursosActivos = todosCursos.filter(curso => {
      const fechaFin = new Date(curso.fecha_fin);
      fechaFin.setHours(0, 0, 0, 0); // Normalizar a medianoche

      // Excluir solo cursos finalizados (cancelado = matrículas cerradas, curso sigue activo)
      if (curso.estado === 'finalizado') {
        return false;
      }

      // Excluir cursos cuya fecha de fin ya pasó
      if (fechaFin < hoy) {
        return false;
      }

      // Incluir cursos activos o planificados con fecha futura
      return true;
    });

    console.log(`Cursos activos - Usuario ${id_usuario}: ${cursosActivos.length} de ${todosCursos.length} total`);

    res.json(cursosActivos);

  } catch (error) {
    console.error('Error obteniendo cursos del estudiante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// GET /api/estudiantes/historial-academico - Obtener historial académico (cursos activos y finalizados)
exports.getHistorialAcademico = async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;

    if (!id_usuario) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea estudiante
    const isEstudiante = await EstudiantesModel.isEstudiante(id_usuario);

    if (!isEstudiante) {
      return res.status(403).json({ error: 'Acceso denegado. Solo estudiantes pueden acceder a esta información.' });
    }

    // Obtener todos los cursos (activos y finalizados)
    const todosCursos = await EstudiantesModel.getMisCursos(id_usuario);

    // Separar cursos activos y finalizados basándose en la fecha_fin Y el estado del curso
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Normalizar a medianoche para comparación justa

    const cursosActivos = [];
    const cursosFinalizados = [];

    todosCursos.forEach(curso => {
      const fechaFin = new Date(curso.fecha_fin);
      fechaFin.setHours(0, 0, 0, 0); // Normalizar a medianoche

      // Un curso está FINALIZADO si:
      // 1. El estado del curso es 'finalizado' o 'cancelado', O
      // 2. La fecha de fin ya pasó (es menor que hoy)
      const estaFinalizado = curso.estado === 'finalizado' ||
        fechaFin < hoy;

      // Un curso está ACTIVO si:
      // - El estado es 'activo' o 'planificado', Y
      // - La fecha de fin NO ha pasado (es hoy o futura)

      if (estaFinalizado) {
        cursosFinalizados.push(curso);
      } else {
        cursosActivos.push(curso);
      }
    });

    console.log(`Historial académico - Usuario ${id_usuario}: ${cursosActivos.length} activos, ${cursosFinalizados.length} finalizados`);

    res.json({
      activos: cursosActivos,
      finalizados: cursosFinalizados,
      total: todosCursos.length
    });

  } catch (error) {
    console.error('Error obteniendo historial académico:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

exports.getEstudianteById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const [estudiantes] = await pool.execute(`
              SELECT
              u.id_usuario,
                u.cedula as identificacion,
                u.nombre,
                u.apellido,
                u.username,
                u.email,
                u.telefono,
                u.fecha_nacimiento,
                u.genero,
                u.direccion,
                u.estado,
                u.fecha_registro,
                u.fecha_ultima_conexion,
                (
                  SELECT contacto_emergencia
                  FROM solicitudes_matricula s
                  WHERE s.identificacion_solicitante = u.cedula
                  AND s.estado = 'aprobado'
                  AND s.contacto_emergencia IS NOT NULL
                  AND s.contacto_emergencia != ''
                  ORDER BY s.fecha_solicitud DESC LIMIT 1
                ) as contacto_emergencia
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' AND u.id_usuario = ?
                `, [id]);

    if (estudiantes.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    res.json(estudiantes[0]);

  } catch (error) {
    console.error('Error obteniendo estudiante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

exports.updateEstudiante = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const {
      nombre,
      apellido,
      telefono,
      fecha_nacimiento,
      genero,
      direccion,
      estado,
      contacto_emergencia
    } = req.body;

    // Verificar que el estudiante existe
    const [existing] = await pool.execute(`
      SELECT u.id_usuario 
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' AND u.id_usuario = ?
                `, [id]);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    // Actualizar datos en la tabla usuarios
    await pool.execute(`
      UPDATE usuarios 
      SET nombre = ?, apellido = ?, telefono = ?,
                fecha_nacimiento = ?, genero = ?, direccion = ?, estado = ?
                  WHERE id_usuario = ?
                    `, [nombre, apellido, telefono, fecha_nacimiento, genero, direccion, estado, id]);

    // Si se proporciona contacto_emergencia, actualizar en la tabla solicitudes_matricula
    if (contacto_emergencia !== undefined) {
      // Obtener la cédula del estudiante
      const [userData] = await pool.execute(`
        SELECT cedula FROM usuarios WHERE id_usuario = ?
                `, [id]);

      if (userData.length > 0) {
        const cedula = userData[0].cedula;

        // Actualizar el contacto de emergencia en la solicitud aprobada más reciente
        await pool.execute(`
          UPDATE solicitudes_matricula 
          SET contacto_emergencia = ?
                WHERE identificacion_solicitante = ? AND estado = 'aprobado'
          ORDER BY fecha_solicitud DESC
          LIMIT 1
                `, [contacto_emergencia, cedula]);
      }
    }

    res.json({ success: true, message: 'Estudiante actualizado exitosamente' });

  } catch (error) {
    console.error('Error actualizando estudiante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

exports.getEstudiantesRecientes = async (req, res) => {
  try {
    const [estudiantes] = await pool.execute(`
              SELECT
              u.id_usuario,
                u.username,
                u.cedula,
                u.nombre,
                u.apellido,
                u.password_temporal,
                u.fecha_registro,
                r.nombre_rol
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante'
      ORDER BY u.fecha_registro DESC
      LIMIT 3
    `);

    res.json({
      message: 'Estudiantes recientes (últimos 3)',
      estudiantes: estudiantes.map(est => ({
        id_usuario: est.id_usuario,
        username: est.username,
        cedula: est.cedula,
        nombre: `${est.nombre} ${est.apellido} `,
        password_temporal: est.password_temporal,
        fecha_registro: est.fecha_registro,
        login_info: {
          username: est.username,
          password: est.password_temporal || est.cedula
        }
      }))
    });

  } catch (error) {
    console.error('Error obteniendo estudiantes recientes:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// Obtener pagos mensuales del estudiante autenticado
exports.getMisPagosMenuales = async (req, res) => {
  try {
    const id_estudiante = req.user?.id_usuario;

    if (!id_estudiante) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea estudiante
    const [userCheck] = await pool.execute(`
      SELECT u.id_usuario, r.nombre_rol 
      FROM usuarios u 
      JOIN roles r ON u.id_rol = r.id_rol 
      WHERE u.id_usuario = ?
                `, [id_estudiante]);

    if (userCheck.length === 0 || userCheck[0].nombre_rol !== 'estudiante') {
      return res.status(403).json({ error: 'Acceso denegado. Solo estudiantes pueden acceder a esta información.' });
    }

    // Obtener pagos mensuales del estudiante
    const [pagos] = await pool.execute(`
      SELECT
              pm.id_pago,
                pm.id_matricula,
                pm.numero_cuota,
                pm.monto,
                pm.fecha_vencimiento,
                pm.fecha_pago,
                pm.numero_comprobante,
                pm.banco_comprobante,
                pm.fecha_transferencia,
                pm.metodo_pago,
                pm.estado,
                pm.observaciones,
                c.nombre as curso_nombre,
                c.codigo_curso,
                tc.nombre as tipo_curso_nombre,
                m.codigo_matricula
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      WHERE m.id_estudiante = ?
                ORDER BY pm.fecha_vencimiento ASC, pm.numero_cuota ASC
                  `, [id_estudiante]);

    res.json(pagos);

  } catch (error) {
    console.error('Error obteniendo pagos mensuales del estudiante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// Verificar si estudiante existe por cédula/pasaporte
exports.verificarEstudiante = async (req, res) => {
  try {
    const { identificacion } = req.query;

    if (!identificacion || !identificacion.trim()) {
      return res.status(400).json({ error: 'Identificación es requerida' });
    }

    // Buscar estudiante por cédula en tabla usuarios con rol estudiante
    const [usuarios] = await pool.execute(`
              SELECT
              u.id_usuario,
                u.cedula as identificacion,
                u.nombre,
                u.apellido,
                u.email,
                u.telefono,
                u.fecha_nacimiento,
                u.genero,
                u.direccion,
                u.estado,
                r.nombre_rol
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' 
        AND u.cedula = ?
                AND u.estado = 'activo'
                  `, [identificacion.trim().toUpperCase()]);

    if (usuarios.length === 0) {
      return res.json({
        existe: false,
        mensaje: 'Estudiante no encontrado en el sistema'
      });
    }

    const estudiante = usuarios[0];

    // Obtener cursos matriculados
    const [cursos] = await pool.execute(`
              SELECT
              c.nombre as curso_nombre,
                tc.nombre as tipo_curso_nombre,
                m.estado as estado_matricula,
                m.fecha_matricula
      FROM matriculas m
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      WHERE m.id_estudiante = ?
                ORDER BY m.fecha_matricula DESC
                  `, [estudiante.id_usuario]);

    return res.json({
      existe: true,
      estudiante: {
        id_usuario: estudiante.id_usuario,
        identificacion: estudiante.identificacion,
        nombre: estudiante.nombre,
        apellido: estudiante.apellido,
        email: estudiante.email,
        telefono: estudiante.telefono,
        fecha_nacimiento: estudiante.fecha_nacimiento,
        genero: estudiante.genero,
        direccion: estudiante.direccion
      },
      cursos_matriculados: cursos,
      mensaje: 'Estudiante encontrado en el sistema'
    });

  } catch (error) {
    console.error('Error verificando estudiante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// Generar reporte Excel de estudiantes
exports.generarReporteExcel = async (req, res) => {
  try {
    // Obtener filtros de la query
    const { search = '', estado = '', estadoCurso = '', tipoCurso = '' } = req.query;

    // Construir consulta dinamica con filtros
    let baseSql = `
      SELECT DISTINCT
        u.id_usuario,
        u.cedula as identificacion,
        u.nombre,
        u.apellido,
        u.username,
        u.email,
        u.telefono,
        u.fecha_nacimiento,
        u.genero,
        u.direccion,
        u.estado,
        u.fecha_registro,
        (
          SELECT contacto_emergencia
          FROM solicitudes_matricula s
          WHERE s.identificacion_solicitante = u.cedula
          AND s.estado = 'aprobado'
          AND s.contacto_emergencia IS NOT NULL
          AND s.contacto_emergencia != ''
          ORDER BY s.fecha_solicitud DESC LIMIT 1
        ) as contacto_emergencia,
        CASE
          WHEN LENGTH(u.cedula) > 10 THEN 'Extranjero'
          ELSE 'Ecuatoriano'
        END as tipo_documento
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      LEFT JOIN matriculas mat ON mat.id_estudiante = u.id_usuario
      LEFT JOIN cursos cur ON cur.id_curso = mat.id_curso
      WHERE r.nombre_rol = 'estudiante'
    `;

    const params = [];

    if (estado) {
      baseSql += ` AND u.estado = ?`;
      params.push(estado);
    }

    if (estadoCurso) {
      if (estadoCurso === 'activo') {
        baseSql += ` AND cur.estado IN ('activo', 'cancelado')`;
      } else {
        baseSql += ` AND cur.estado = ?`;
        params.push(estadoCurso);
      }
    }

    if (tipoCurso) {
      baseSql += ` AND cur.id_tipo_curso = ?`;
      params.push(parseInt(tipoCurso));
    }

    if (search) {
      baseSql += ` AND (u.nombre LIKE ? OR u.apellido LIKE ? OR u.cedula LIKE ? OR u.email LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    baseSql += ` ORDER BY u.fecha_registro DESC`;

    // 1. Obtener estudiantes filtrados
    const [estudiantes] = await pool.execute(baseSql, params);

    // 2. Obtener cursos por estudiante
    const [cursosEstudiantes] = await pool.execute(`
              SELECT
              ec.id_estudiante,
                c.nombre as curso_nombre,
                c.codigo_curso,
                c.horario,
                tc.nombre as tipo_curso
      FROM estudiante_curso ec
      INNER JOIN cursos c ON c.id_curso = ec.id_curso
      INNER JOIN tipos_cursos tc ON tc.id_tipo_curso = c.id_tipo_curso
      ORDER BY ec.id_estudiante, c.nombre
                `);

    // Mapear cursos por estudiante
    const cursosMap = {};
    cursosEstudiantes.forEach(curso => {
      if (!cursosMap[curso.id_estudiante]) {
        cursosMap[curso.id_estudiante] = [];
      }
      cursosMap[curso.id_estudiante].push(curso);
    });

    // 3. Obtener estadísticas generales
    const [estadisticas] = await pool.execute(`
              SELECT
              COUNT(*) as total_estudiantes,
                COUNT(CASE WHEN u.estado = 'activo' THEN 1 END) as activos,
                COUNT(CASE WHEN u.estado = 'inactivo' THEN 1 END) as inactivos,
                COUNT(CASE WHEN u.genero = 'masculino' THEN 1 END) as masculinos,
                COUNT(CASE WHEN u.genero = 'femenino' THEN 1 END) as femeninos,
                COUNT(CASE WHEN LENGTH(u.cedula) > 10 THEN 1 END) as extranjeros,
                COUNT(CASE WHEN LENGTH(u.cedula) <= 10 THEN 1 END) as ecuatorianos
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante'
                `);

    // 4. Obtener distribución por curso
    const [distribucionCursos] = await pool.execute(`
              SELECT
              c.codigo_curso,
                c.nombre as curso_nombre,
                tc.nombre as tipo_curso,
                c.horario,
                COUNT(ec.id_estudiante) as total_estudiantes
      FROM cursos c
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = c.id_tipo_curso
      LEFT JOIN estudiante_curso ec ON ec.id_curso = c.id_curso
      GROUP BY c.id_curso, c.codigo_curso, c.nombre, tc.nombre, c.horario
      HAVING total_estudiantes > 0
      ORDER BY total_estudiantes DESC
    `);

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SGA Belleza';
    workbook.created = new Date();

    // ========== HOJA 1: LISTADO DE ESTUDIANTES ==========
    // ========== HOJA 1: LISTADO DE ESTUDIANTES ==========
    const sheet1 = workbook.addWorksheet('Estudiantes', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9, // A4 horizontal
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Título Dinámico (Fila 1)
    sheet1.mergeCells(1, 1, 1, 15);
    const titleCell1 = sheet1.getCell(1, 1);
    titleCell1.value = 'REPORTE DE ESTUDIANTES';
    titleCell1.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 25;

    // Info Dinámica (Fila 2)
    sheet1.mergeCells(2, 1, 2, 15);
    const infoCell1 = sheet1.getCell(2, 1);
    const infoText1 = `Generado el: ${new Date().toLocaleString('es-EC')} | Total Registros: ${estudiantes.length}`;
    infoCell1.value = infoText1.toUpperCase();
    infoCell1.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCell1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet1.getRow(2).height = 35;

    // Fila 3 vacía

    // Encabezados Hoja 1 en la Fila 4
    const headers = [
      '#', 'IDENTIFICACIÓN', 'APELLIDOS', 'NOMBRES', 'EMAIL', 'TELÉFONO',
      'FECHA NACIMIENTO', 'GÉNERO', 'TIPO DOCUMENTO', 'CONTACTO EMERGENCIA',
      'CURSO', 'HORARIO', 'USERNAME', 'ESTADO', 'FECHA REGISTRO'
    ];

    const headerRow = sheet1.getRow(4);
    headerRow.height = 35;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    // Configurar anchos de columna
    const colWidths = [5, 25, 20, 20, 30, 15, 18, 12, 18, 25, 25, 15, 15, 12, 20];
    colWidths.forEach((w, i) => {
      sheet1.getColumn(i + 1).width = w;
    });

    // Preparar datos planos para el reporte (desglosando cursos)
    const datosPlanos = [];
    estudiantes.forEach(est => {
      const cursos = cursosMap[est.id_usuario] || [];

      if (cursos.length > 0) {
        cursos.forEach(curso => {
          datosPlanos.push({
            ...est,
            curso_nombre: curso.curso_nombre,
            curso_horario: curso.horario,
            tiene_curso: true
          });
        });
      } else {
        // Estudiante sin cursos
        datosPlanos.push({
          ...est,
          curso_nombre: 'SIN CURSOS',
          curso_horario: 'N/A',
          tiene_curso: false
        });
      }
    });

    // Agregar datos con numeración, agrupación y MERGE de celdas
    let estudianteAnterior = null;
    let numeroEstudiante = 0;
    let filaInicioEstudiante = 5;
    let currentRow = 5;

    datosPlanos.forEach((dato, index) => {
      const esNuevoEstudiante = estudianteAnterior !== dato.id_usuario;
      const esUltimoRegistro = index === datosPlanos.length - 1;
      const siguienteEsDiferente = esUltimoRegistro || datosPlanos[index + 1].id_usuario !== dato.id_usuario;

      if (esNuevoEstudiante) {
        numeroEstudiante++;
        filaInicioEstudiante = currentRow;
      }

      const row = sheet1.addRow([
        esNuevoEstudiante ? numeroEstudiante : '',
        esNuevoEstudiante ? dato.identificacion : '',
        esNuevoEstudiante ? dato.apellido.toUpperCase() : '',
        esNuevoEstudiante ? dato.nombre.toUpperCase() : '',
        esNuevoEstudiante ? dato.email.toLowerCase() : '',
        esNuevoEstudiante ? (dato.telefono || 'N/A').toUpperCase() : '',
        esNuevoEstudiante ? (dato.fecha_nacimiento ? new Date(dato.fecha_nacimiento) : 'N/A') : '',
        esNuevoEstudiante ? (dato.genero ? dato.genero.toUpperCase() : 'N/A') : '',
        esNuevoEstudiante ? dato.tipo_documento.toUpperCase() : '',
        esNuevoEstudiante ? (dato.contacto_emergencia || 'N/A').toUpperCase() : '',
        dato.curso_nombre.toUpperCase(),
        dato.curso_horario.toUpperCase(),
        esNuevoEstudiante ? dato.username.toLowerCase() : '',
        esNuevoEstudiante ? dato.estado.toUpperCase() : '',
        esNuevoEstudiante ? new Date(dato.fecha_registro) : ''
      ]);

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };

        // Formatos específicos
        if (colNumber === 1 || colNumber === 2 || colNumber === 7 || colNumber === 8 || colNumber === 9 || colNumber === 12 || colNumber === 14 || colNumber === 15) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        if (colNumber === 7 && cell.value instanceof Date) {
          cell.numFmt = 'DD/MM/YYYY';
        }
        if (colNumber === 15 && cell.value instanceof Date) {
          cell.numFmt = 'DD/MM/YYYY HH:MM';
        }
      });

      // Si el siguiente estudiante es diferente o es el último, hacer MERGE de celdas
      if (siguienteEsDiferente && currentRow > filaInicioEstudiante) {
        const columnasMerge = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'M', 'N', 'O'];
        columnasMerge.forEach(col => {
          try {
            sheet1.mergeCells(`${col}${filaInicioEstudiante}:${col}${currentRow}`);
            const cell = sheet1.getCell(`${col}${filaInicioEstudiante}`);
            cell.alignment = {
              horizontal: cell.alignment?.horizontal || 'left',
              vertical: 'middle'
            };
          } catch (e) {
            // Ignorar errores
          }
        });
      }

      estudianteAnterior = dato.id_usuario;
      currentRow++;
    });

    // ========== HOJA 2: RESUMEN ESTADÍSTICO ==========
    const sheet2 = workbook.addWorksheet('Resumen Estadístico', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9, // A4 horizontal
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      }
    });

    // Título Dinámico (Fila 1)
    sheet2.mergeCells(1, 1, 1, 6);
    const titleCell2 = sheet2.getCell(1, 1);
    titleCell2.value = 'REPORTE ESTADÍSTICO DE ESTUDIANTES';
    titleCell2.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(1).height = 25;

    // Info Dinámica (Fila 2)
    sheet2.mergeCells(2, 1, 2, 6);
    const infoCell2 = sheet2.getCell(2, 1);
    const infoText2 = `Generado el: ${new Date().toLocaleString('es-EC')}`;
    infoCell2.value = infoText2.toUpperCase();
    infoCell2.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCell2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet2.getRow(2).height = 35;

    const stats = estadisticas[0];
    const total = stats.total_estudiantes;

    // Sección 1: Resumen General
    sheet2.mergeCells(4, 1, 4, 3);
    const sectionTitle1 = sheet2.getCell(4, 1);
    sectionTitle1.value = 'RESUMEN GENERAL';
    sectionTitle1.font = { bold: true, size: 11, color: { argb: 'FF000000' }, name: 'Calibri' };
    sectionTitle1.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(4).height = 25;

    // Encabezados
    const headerRowStats = sheet2.getRow(6);
    headerRowStats.height = 35;
    ['CATEGORÍA', 'CANTIDAD', 'PORCENTAJE'].forEach((h, i) => {
      const cell = headerRowStats.getCell(i + 1);
      cell.value = h.toUpperCase();
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos generales
    const datosGenerales = [
      { categoria: 'TOTAL ESTUDIANTES', cantidad: total },
      { categoria: 'ACTIVOS', cantidad: stats.activos },
      { categoria: 'INACTIVOS', cantidad: stats.inactivos },
      { categoria: 'MASCULINO', cantidad: stats.masculinos },
      { categoria: 'FEMENINO', cantidad: stats.femeninos },
      { categoria: 'ECUATORIANOS', cantidad: stats.ecuatorianos },
      { categoria: 'EXTRANJEROS', cantidad: stats.extranjeros }
    ];

    let rowNum = 7;
    datosGenerales.forEach(dato => {
      const r = sheet2.getRow(rowNum);
      const catCell = r.getCell(1);
      const cantCell = r.getCell(2);
      const porcCell = r.getCell(3);

      catCell.value = dato.categoria.toUpperCase();
      cantCell.value = Number(dato.cantidad);
      porcCell.value = total > 0 ? (Number(dato.cantidad) / total) : 0;

      [catCell, cantCell, porcCell].forEach(c => {
        c.font = {
          name: 'Calibri',
          size: 10,
          color: { argb: 'FF000000' },
          bold: c === catCell // Negrita solo para la celda de categoría
        };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        c.alignment = { vertical: 'middle', horizontal: 'left' };
      });

      cantCell.alignment = { horizontal: 'center' };
      porcCell.alignment = { horizontal: 'center' };
      porcCell.numFmt = '0.0%';

      rowNum++;
    });

    // Sección 2: Distribución por Curso
    const startRowDistribucion = rowNum + 2;
    sheet2.mergeCells(startRowDistribucion, 1, startRowDistribucion, 4);
    const sectionTitle2 = sheet2.getCell(startRowDistribucion, 1);
    sectionTitle2.value = 'DISTRIBUCIÓN POR CURSO';
    sectionTitle2.font = { bold: true, size: 11, color: { argb: 'FF000000' }, name: 'Calibri' };
    sectionTitle2.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(startRowDistribucion).height = 25;

    const headerRowCursos = sheet2.getRow(startRowDistribucion + 2);
    headerRowCursos.height = 35;
    ['CÓDIGO', 'CURSO', 'HORARIO', 'ESTUDIANTES'].forEach((h, i) => {
      const cell = headerRowCursos.getCell(i + 1);
      cell.value = h.toUpperCase();
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    let cursoRowNum = startRowDistribucion + 3;
    distribucionCursos.forEach(curso => {
      const r = sheet2.getRow(cursoRowNum);
      const codCell = r.getCell(1);
      const curCell = r.getCell(2);
      const horCell = r.getCell(3);
      const estCell = r.getCell(4);

      codCell.value = curso.codigo_curso.toUpperCase();
      curCell.value = curso.curso_nombre.toUpperCase();
      horCell.value = curso.horario.toUpperCase();
      estCell.value = Number(curso.total_estudiantes);

      [codCell, curCell, horCell, estCell].forEach(c => {
        c.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        c.alignment = { vertical: 'middle', horizontal: 'left' };
      });

      codCell.alignment = { horizontal: 'center' };
      horCell.alignment = { horizontal: 'center' };
      estCell.alignment = { horizontal: 'center' };

      cursoRowNum++;
    });

    // Ajustar anchos
    sheet2.getColumn(1).width = 20;
    sheet2.getColumn(2).width = 40;
    sheet2.getColumn(3).width = 25;
    sheet2.getColumn(4).width = 15;

    // Generar archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const fecha = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename = Reporte_Estudiantes_${fecha}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error('Error generando reporte Excel:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};
