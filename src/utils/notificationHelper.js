/**
 * Helper para enviar notificaciones WebSocket en tiempo real
 */
const NotificacionesModel = require('../models/notificaciones.model');

/**
 * Emitir notificación a un usuario específico
 * @param {Object} app - Express app con io y userSockets
 * @param {Number} userId - ID del usuario destinatario
 * @param {String} evento - Nombre del evento
 * @param {Object} data - Datos de la notificación
 */
const emitirNotificacionUsuario = (app, userId, evento, data) => {
  const io = app.get('io');
  const userSockets = app.get('userSockets');

  if (!io) {
    console.warn('Socket.IO no está inicializado');
    return;
  }

  // Emitir a la room del usuario
  io.to(`user_${userId}`).emit(evento, data);

  // Log para debugging
  console.log(`Notificación enviada: ${evento} -> Usuario ${userId}`);
  console.log('Datos:', JSON.stringify(data, null, 2));
};

/**
 * Emitir notificación a múltiples usuarios
 * @param {Object} app - Express app con io
 * @param {Array} userIds - Array de IDs de usuarios
 * @param {String} evento - Nombre del evento
 * @param {Object} data - Datos de la notificación
 */
const emitirNotificacionMultiple = (app, userIds, evento, data) => {
  const io = app.get('io');

  if (!io) {
    console.warn('Socket.IO no está inicializado');
    return;
  }

  userIds.forEach(userId => {
    io.to(`user_${userId}`).emit(evento, data);
  });

  console.log(`Notificación enviada: ${evento} -> ${userIds.length} usuarios`);
};

/**
 * Emitir notificación broadcast (a todos los usuarios de uno o varios roles)
 * @param {Object} app - Express app con io
 * @param {String|Array} roles - 'admin', ['admin', 'administrativo'], etc.
 * @param {String} evento - Nombre del evento
 * @param {Object} data - Datos de la notificación
 */
const emitirNotificacionRol = (app, roles, evento, data) => {
  const io = app.get('io');

  if (!io) {
    console.warn('Socket.IO no está inicializado');
    return;
  }

  // Convertir a array si es string
  const rolesArray = Array.isArray(roles) ? roles : [roles];

  console.log(`Preparando broadcast del evento '${evento}' a las siguientes salas:`);

  // Emitir a cada role
  rolesArray.forEach(rol => {
    const roomName = `rol_${rol}`;
    io.to(roomName).emit(evento, data);
    console.log(`Sala: ${roomName}`);
  });

  console.log(`Total de salas notificadas: ${rolesArray.length}`);
  console.log(`Datos enviados:`, JSON.stringify(data, null, 2));
};

/**
 * Emitir notificación de nuevo pago pendiente (para ADMIN)
 * @param {Object} req - Request object con req.app
 */
const notificarNuevoPagoPendiente = async (req, pagoData, estudianteData) => {
  const payload = {
    id_pago: pagoData.id_pago,
    estudiante_nombre: `${estudianteData.nombre} ${estudianteData.apellido}`,
    monto: pagoData.monto,
    numero_cuota: pagoData.numero_cuota,
    curso_nombre: pagoData.curso_nombre,
    fecha: new Date()
  };

  console.log(`Notificando nuevo pago pendiente a administradores`);
  console.log(`Payload:`, JSON.stringify(payload, null, 2));

  // 1. GUARDAR EN BASE DE DATOS (para usuarios desconectados)
  try {
    const adminIds = await NotificacionesModel.obtenerUsuariosPorRol('administrativo');
    if (adminIds.length > 0) {
      await NotificacionesModel.crearNotificacionMultiple(
        adminIds,
        'Nuevo pago pendiente',
        `${estudianteData.nombre} ${estudianteData.apellido} - ${pagoData.curso_nombre} - Cuota #${pagoData.numero_cuota}`,
        'info'
      );
    }
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET (para usuarios conectados)
  emitirNotificacionRol(req.app, ['administrativo', 'admin'], 'nuevo_pago_pendiente', payload);
};

/**
 * Notificar a un estudiante cuando su pago es verificado
 * @param {Object} req - Request object con req.app
 * @param {Number} idEstudiante - ID del estudiante
 * @param {Object} pagoData - Datos { id_pago, numero_cuota, monto }
 */
const notificarPagoVerificado = async (req, idEstudiante, pagoData) => {
  console.log(`Notificando pago verificado al estudiante ${idEstudiante}`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    await NotificacionesModel.crearNotificacion(
      idEstudiante,
      'Pago Verificado',
      `Tu pago de la cuota #${pagoData.numero_cuota} del curso ${pagoData.curso_nombre} ha sido verificado.`,
      'success'
    );
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionUsuario(req.app, idEstudiante, 'pago_verificado_estudiante', {
    id_pago: pagoData.id_pago,
    numero_cuota: pagoData.numero_cuota,
    monto: pagoData.monto,
    curso_nombre: pagoData.curso_nombre,
    admin_nombre: pagoData.admin_nombre,
    fecha_verificacion: new Date()
  });
};

/**
 * Notificar a estudiantes cuando se crea una nueva tarea
 * @param {Object} req - Request object con req.app
 * @param {Array} idsEstudiantes - Array de IDs de estudiantes
 * @param {Object} tareaData - Datos de la tarea { id_tarea, titulo, descripcion, fecha_entrega, id_curso, curso_nombre }
 */
const notificarNuevaTarea = async (req, idsEstudiantes, tareaData) => {
  const data = {
    id_tarea: tareaData.id_tarea,
    id_modulo: tareaData.id_modulo,
    titulo_tarea: tareaData.titulo,
    descripcion: tareaData.descripcion,
    fecha_entrega: tareaData.fecha_entrega,
    id_curso: tareaData.id_curso,
    curso_nombre: tareaData.curso_nombre,
    docente_nombre: tareaData.docente_nombre,
    fecha: new Date()
  };

  console.log(`Notificando nueva tarea "${tareaData.titulo}" a ${idsEstudiantes.length} estudiantes`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    if (idsEstudiantes.length > 0) {
      await NotificacionesModel.crearNotificacionMultiple(
        idsEstudiantes,
        'Nueva Tarea',
        `Nueva tarea "${tareaData.titulo}" en el curso ${tareaData.curso_nombre}`,
        'info'
      );
    }
  } catch (error) {
    console.error('Error guardando notificaciones en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionMultiple(req.app, idsEstudiantes, 'nueva_tarea', data);
};

/**
 * Notificar a un estudiante cuando su tarea es calificada
 * @param {Object} req - Request object con req.app
 * @param {Number} idEstudiante - ID del estudiante
 * @param {Object} tareaData - Datos { id_tarea, titulo, nota, id_curso, docente_nombre, curso_nombre }
 */
const notificarTareaCalificada = async (req, idEstudiante, tareaData) => {
  console.log(`Notificando tarea calificada al estudiante ${idEstudiante}`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    await NotificacionesModel.crearNotificacion(
      idEstudiante,
      'Tarea Calificada',
      `Tu tarea "${tareaData.titulo}" ha sido calificada con ${tareaData.nota}`,
      'success'
    );
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionUsuario(req.app, idEstudiante, 'tarea_calificada', {
    id_tarea: tareaData.id_tarea,
    tarea_titulo: tareaData.titulo,
    nota: tareaData.nota,
    id_curso: tareaData.id_curso,
    docente_nombre: tareaData.docente_nombre,
    curso_nombre: tareaData.curso_nombre,
    fecha: new Date()
  });
};

/**
 * Notificar a un docente cuando un estudiante entrega una tarea
 * @param {Object} req - Request object con req.app
 * @param {Number} idDocente - ID del docente
 * @param {Object} tareaData - Datos { id_tarea, titulo }
 * @param {Object} estudianteData - Datos { id_usuario, nombre, apellido }
 */
const notificarTareaEntregada = async (req, idDocente, tareaData, estudianteData) => {
  console.log(`Notificando entrega de tarea al docente ${idDocente}`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    await NotificacionesModel.crearNotificacion(
      idDocente,
      'Tarea Entregada',
      `El estudiante ${estudianteData.nombre} ${estudianteData.apellido} ha entregado la tarea "${tareaData.titulo}"`,
      'info'
    );
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionUsuario(req.app, idDocente, 'tarea_entregada', {
    id_tarea: tareaData.id_tarea,
    tarea_titulo: tareaData.titulo,
    estudiante_nombre: `${estudianteData.nombre} ${estudianteData.apellido}`,
    id_estudiante: estudianteData.id_usuario,
    fecha: new Date()
  });
};

/**
 * Notificar a estudiantes cuando se crea un nuevo módulo
 * @param {Object} req - Request object con req.app
 * @param {Array} idsEstudiantes - Array de IDs de estudiantes
 * @param {Object} moduloData - Datos del módulo { id_modulo, nombre_modulo, curso_nombre, id_curso, descripcion, fecha_inicio }
 */
const notificarNuevoModulo = async (req, idsEstudiantes, moduloData) => {
  const data = {
    id_modulo: moduloData.id_modulo,
    nombre_modulo: moduloData.nombre_modulo,
    descripcion: moduloData.descripcion || '',
    id_curso: moduloData.id_curso,
    curso_nombre: moduloData.curso_nombre,
    docente_nombre: moduloData.docente_nombre,
    fecha_inicio: moduloData.fecha_inicio || null,
    fecha: new Date()
  };

  console.log(`Notificando nuevo módulo "${moduloData.nombre_modulo}" a ${idsEstudiantes.length} estudiantes`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    if (idsEstudiantes.length > 0) {
      await NotificacionesModel.crearNotificacionMultiple(
        idsEstudiantes,
        'Nuevo Módulo',
        `Nuevo módulo "${moduloData.nombre_modulo}" en el curso ${moduloData.curso_nombre}`,
        'info'
      );
    }
  } catch (error) {
    console.error('Error guardando notificaciones en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionMultiple(req.app, idsEstudiantes, 'nuevo_modulo', data);
};

/**
 * Emitir notificación de módulo actualizado
 * @param {Object} req - Request object con req.app
 * @param {Array} idsEstudiantes - Array de IDs de estudiantes
 * @param {Object} moduloData - Datos del módulo { id_modulo, nombre_modulo, curso_nombre, id_curso }
 */
const notificarModuloActualizado = async (req, idsEstudiantes, moduloData) => {
  const data = {
    id_modulo: moduloData.id_modulo,
    nombre_modulo: moduloData.nombre_modulo,
    id_curso: moduloData.id_curso,
    curso_nombre: moduloData.curso_nombre,
    fecha: new Date()
  };

  console.log(`Notificando módulo actualizado "${moduloData.nombre_modulo}" a ${idsEstudiantes.length} estudiantes`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    if (idsEstudiantes.length > 0) {
      await NotificacionesModel.crearNotificacionMultiple(
        idsEstudiantes,
        'Módulo Actualizado',
        `El módulo "${moduloData.nombre_modulo}" del curso ${moduloData.curso_nombre} ha sido actualizado`,
        'info'
      );
    }
  } catch (error) {
    console.error('Error guardando notificaciones en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionMultiple(req.app, idsEstudiantes, 'modulo_actualizado', data);
};

/**
 * Emitir notificación de nueva matrícula en curso (para docente)
 */
const notificarNuevaMatriculaCurso = async (app, idDocente, estudiante, curso) => {
  // 1. GUARDAR EN BASE DE DATOS
  try {
    await NotificacionesModel.crearNotificacion(
      idDocente,
      'Nueva Matrícula',
      `Nuevo estudiante matriculado en ${curso.nombre_curso}: ${estudiante.nombres} ${estudiante.apellidos}`,
      'info'
    );
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionUsuario(app, idDocente, 'nueva_matricula_curso', {
    id_estudiante: estudiante.id_estudiante,
    estudiante_nombre: `${estudiante.nombres} ${estudiante.apellidos}`,
    id_curso: curso.id_curso,
    curso_nombre: curso.nombre_curso,
    fecha: new Date()
  });
};

/**
 * Notificar a administradores sobre una nueva solicitud de matrícula
 * @param {Object} req - Request object con req.app
 * @param {Object} solicitudData - Datos de la solicitud { id_solicitud, nombre, apellido, curso_nombre }
 */
const notificarNuevaSolicitudMatricula = async (req, solicitudData) => {
  console.log(`Notificando nueva solicitud de matrícula a administradores`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    const adminIds = await NotificacionesModel.obtenerUsuariosPorRol('administrativo');
    if (adminIds.length > 0) {
      await NotificacionesModel.crearNotificacionMultiple(
        adminIds,
        'Nueva Solicitud',
        `Nueva solicitud de matrícula de ${solicitudData.nombre} ${solicitudData.apellido} para el curso ${solicitudData.curso_nombre}`,
        'info'
      );
    }
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionRol(req.app, 'administrativo', 'nueva_solicitud_matricula', {
    id_solicitud: solicitudData.id_solicitud,
    nombre_solicitante: solicitudData.nombre,
    apellido_solicitante: solicitudData.apellido,
    curso: solicitudData.curso_nombre,
    email: solicitudData.email,
    fecha: new Date()
  });
};

/**
 * Notificar a administradores sobre matrículas pendientes
 * @param {Object} req - Request object con req.app
 * @param {Number} cantidadPendientes - Cantidad de matrículas pendientes
 */
const notificarMatriculasPendientes = async (req, cantidadPendientes) => {
  console.log(`Notificando ${cantidadPendientes} matrículas pendientes a administradores`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    const adminIds = await NotificacionesModel.obtenerUsuariosPorRol('administrativo');
    if (adminIds.length > 0) {
      await NotificacionesModel.crearNotificacionMultiple(
        adminIds,
        'Matrículas Pendientes',
        `Tienes ${cantidadPendientes} ${cantidadPendientes === 1 ? 'matrícula' : 'matrículas'} pendiente(s) de aprobación`,
        'warning'
      );
    }
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionRol(req.app, 'administrativo', 'matriculas_pendientes', {
    cantidad_pendientes: cantidadPendientes,
    mensaje: `Tienes ${cantidadPendientes} ${cantidadPendientes === 1 ? 'matrícula' : 'matrículas'} pendiente(s) de aprobación`,
    fecha: new Date()
  });
};

/**
 * Notificar a docente cuando estudiante entrega tarea
 * @param {Object} req - Request object con req.app
 * @param {Number} idDocente - ID del docente
 * @param {Object} entregaData - Datos de la entrega { id_tarea, titulo_tarea, id_estudiante, nombre_estudiante, apellido_estudiante }
 */
const notificarTareaEntregadaDocente = async (req, idDocente, entregaData) => {
  console.log(`Notificando tarea entregada al docente ${idDocente}`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    await NotificacionesModel.crearNotificacion(
      idDocente,
      'Tarea Entregada',
      `El estudiante ${entregaData.nombre_estudiante} ${entregaData.apellido_estudiante} ha entregado la tarea "${entregaData.titulo_tarea}"`,
      'info'
    );
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionUsuario(req.app, idDocente, 'tarea_entregada_docente', {
    id_tarea: entregaData.id_tarea,
    id_modulo: entregaData.id_modulo,
    tarea_titulo: entregaData.titulo_tarea,
    curso_nombre: entregaData.curso_nombre,
    id_estudiante: entregaData.id_estudiante,
    estudiante_nombre: `${entregaData.nombre_estudiante} ${entregaData.apellido_estudiante}`,
    fecha_entrega: new Date()
  });
};

/**
 * Notificar a docente sobre tareas pendientes por calificar
 * @param {Object} req - Request object con req.app
 * @param {Number} idDocente - ID del docente
 * @param {Object} tareaData - Datos { id_tarea, titulo_tarea, cantidad_entregas_pendientes }
 */
const notificarTareasPorCalificar = async (req, idDocente, tareaData) => {
  console.log(`Notificando tareas por calificar al docente ${idDocente}`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    await NotificacionesModel.crearNotificacion(
      idDocente,
      'Tareas por Calificar',
      `${tareaData.cantidad_entregas_pendientes} ${tareaData.cantidad_entregas_pendientes === 1 ? 'entrega' : 'entregas'} pendiente(s) de calificar en "${tareaData.titulo_tarea}"`,
      'warning'
    );
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionUsuario(req.app, idDocente, 'tareas_por_calificar', {
    id_tarea: tareaData.id_tarea,
    tarea_titulo: tareaData.titulo_tarea,
    cantidad_entregas: tareaData.cantidad_entregas_pendientes,
    mensaje: `${tareaData.cantidad_entregas_pendientes} ${tareaData.cantidad_entregas_pendientes === 1 ? 'entrega' : 'entregas'} pendiente(s) de calificar`,
    fecha: new Date()
  });
};

/**
 * Emitir notificación de matrícula aprobada (para estudiante)
 */
const notificarMatriculaAprobada = async (req, idEstudiante, matriculaData) => {
  console.log(`Notificando matrícula aprobada al estudiante ${idEstudiante}`);

  // 1. GUARDAR EN BASE DE DATOS
  try {
    await NotificacionesModel.crearNotificacion(
      idEstudiante,
      'Matrícula Aprobada',
      `Tu matrícula en el curso "${matriculaData.curso_nombre}" ha sido aprobada.`,
      'success'
    );
  } catch (error) {
    console.error('Error guardando notificación en BD:', error);
  }

  // 2. ENVIAR POR WEBSOCKET
  emitirNotificacionUsuario(req.app, idEstudiante, 'matricula_aprobada', {
    id_matricula: matriculaData.id_matricula,
    id_curso: matriculaData.id_curso,
    curso_nombre: matriculaData.curso_nombre,
    fecha_aprobacion: new Date()
  });
};

module.exports = {
  emitirNotificacionUsuario,
  emitirNotificacionMultiple,
  emitirNotificacionRol,
  notificarNuevoPagoPendiente,
  notificarPagoVerificado,
  notificarNuevaTarea,
  notificarTareaCalificada,
  notificarTareaEntregada,
  notificarNuevoModulo,
  notificarModuloActualizado,
  notificarNuevaMatriculaCurso,
  notificarMatriculaAprobada,
  notificarNuevaSolicitudMatricula,
  notificarMatriculasPendientes,
  notificarTareaEntregadaDocente,
  notificarTareasPorCalificar
};
