const { pool } = require('../config/database');

// Helper para construir filtros de fecha según el período
// Las fechas están guardadas en UTC, convertir a zona horaria de Ecuador (UTC-5) para filtrar
const getDateFilter = (dateColumn, period = 'all') => {
  // Convertir de UTC a Ecuador (UTC-5 = -05:00)
  const ecuadorDate = `CONVERT_TZ(${dateColumn}, '+00:00', '-05:00')`;

  switch (period) {
    case 'today':
      return `AND DATE(${ecuadorDate}) = CURDATE()`;
    case 'week':
      return `AND ${ecuadorDate} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
    case 'month':
      return `AND MONTH(${ecuadorDate}) = MONTH(CURDATE()) AND YEAR(${ecuadorDate}) = YEAR(CURDATE())`;
    case 'year':
      return `AND YEAR(${ecuadorDate}) = YEAR(CURDATE())`;
    case 'all':
    default:
      return '';
  }
};

// Helper para filtro de curso
const getCourseFilter = (courseFilter = 'all', tablealias = '') => {
  if (courseFilter !== 'all') {
    const prefix = tablealias ? `${tablealias}.` : '';
    return `AND ${prefix}id_tipo_curso = ${parseInt(courseFilter)}`;
  }
  return '';
};


// Obtener matrículas por mes (últimos 6 meses)
exports.getMatriculasPorMes = async (req, res) => {
  try {
    const [result] = await pool.execute(`
      SELECT 
        MONTH(CONVERT_TZ(fecha_matricula, '+00:00', '-05:00')) as mes_numero,
        YEAR(CONVERT_TZ(fecha_matricula, '+00:00', '-05:00')) as anio,
        DATE_FORMAT(CONVERT_TZ(fecha_matricula, '+00:00', '-05:00'), '%Y-%m') as mes_completo,
        COUNT(*) as total
      FROM matriculas
      WHERE fecha_matricula >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        AND estado = 'activa'
      GROUP BY mes_completo, mes_numero, anio
      ORDER BY mes_completo ASC
    `);

    const mesesEspanol = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const fechaActual = new Date();
    const mesActual = fechaActual.getMonth(); // 0-11
    const anioActual = fechaActual.getFullYear();

    const ultimos6Meses = [];

    // Generar los últimos 6 meses con año
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(anioActual, mesActual - i, 1);
      const mesIndex = fecha.getMonth(); // 0-11
      const anio = fecha.getFullYear();
      ultimos6Meses.push({
        mes: mesesEspanol[mesIndex],
        mesNumero: mesIndex + 1, // 1-12
        anio: anio
      });
    }

    // Mapear los datos reales con los últimos 6 meses
    const matriculasPorMes = ultimos6Meses.map(mesInfo => {
      const data = result.find(r => r.mes_numero === mesInfo.mesNumero && r.anio === mesInfo.anio);
      return {
        mes: mesInfo.mes,
        valor: data ? parseInt(data.total) : 0
      };
    });

    // Calcular altura relativa para el gráfico
    const maxValor = Math.max(...matriculasPorMes.map(m => m.valor), 1);
    const matriculasConAltura = matriculasPorMes.map(m => ({
      ...m,
      altura: `${Math.round((m.valor / maxValor) * 100)}%`
    }));

    console.log(' Matrículas por mes:', matriculasConAltura);

    res.json(matriculasConAltura);
  } catch (error) {
    console.error('Error obteniendo matrículas por mes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener pagos pendientes de verificación
exports.getPagosPendientesVerificacion = async (req, res) => {
  try {
    const period = req.query.period || 'all';
    let dateFilter = '';

    switch (period) {
      case 'today':
        dateFilter = "AND DATE(CONVERT_TZ(fecha_pago, '+00:00', '-05:00')) = CURDATE()";
        break;
      case 'week':
        dateFilter = "AND CONVERT_TZ(fecha_pago, '+00:00', '-05:00') >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        break;
      case 'month':
        dateFilter = "AND MONTH(CONVERT_TZ(fecha_pago, '+00:00', '-05:00')) = MONTH(CURDATE()) AND YEAR(CONVERT_TZ(fecha_pago, '+00:00', '-05:00')) = YEAR(CURDATE())";
        break;
      case 'year':
        dateFilter = "AND YEAR(CONVERT_TZ(fecha_pago, '+00:00', '-05:00')) = YEAR(CURDATE())";
        break;
      default:
        dateFilter = "";
    }

    const [result] = await pool.execute(`
      SELECT COUNT(*) as total_pendientes
      FROM pagos_mensuales
      WHERE estado = 'pagado'
      ${dateFilter}
    `);

    res.json({
      total_pendientes: parseInt(result[0].total_pendientes)
    });
  } catch (error) {
    console.error('Error obteniendo pagos pendientes de verificación:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener tendencias de ingresos dinámicamente
exports.getIngresosTendencias = async (req, res) => {
  try {
    const period = req.query.period || 'month';
    const course = req.query.course || 'all';

    const courseJoin = course !== 'all' ? 'INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula INNER JOIN cursos c ON m.id_curso = c.id_curso' : '';
    const courseFilter = getCourseFilter(course, 'c');

    let query = '';
    let groupBy = '';
    let dateFormat = '';
    let timeLabels = [];

    // Configurar consulta según el período
    if (period === 'today') {
      // Por horas (00-23) - Convertir de UTC a Ecuador (UTC-5)
      const ecuadorDate = `CONVERT_TZ(pm.fecha_verificacion, '+00:00', '-05:00')`;
      query = `
        SELECT 
          HOUR(${ecuadorDate}) as etiqueta_num,
          DATE_FORMAT(${ecuadorDate}, '%H:00') as etiqueta,
          COALESCE(SUM(pm.monto), 0) as total_ingresos
        FROM pagos_mensuales pm
        ${courseJoin}
        WHERE pm.estado = 'verificado'
          AND DATE(${ecuadorDate}) = CURDATE()
          ${courseFilter}
        GROUP BY etiqueta_num, etiqueta
        ORDER BY etiqueta_num ASC
      `;

      // Generar horas 8am - 8pm (o todas si prefieres)
      for (let i = 0; i < 24; i++) {
        timeLabels.push({ etiqueta: `${i}:00`, valor: 0, orden: i });
      }

    } else if (period === 'week') {
      // Por días (Lun-Dom o últimos 7 días) - Convertir de UTC a Ecuador (UTC-5)
      const ecuadorDate = `CONVERT_TZ(pm.fecha_verificacion, '+00:00', '-05:00')`;
      query = `
SELECT
DATE(${ecuadorDate}) as fecha_completa,
  DAYNAME(${ecuadorDate}) as etiqueta,
  COALESCE(SUM(pm.monto), 0) as total_ingresos
        FROM pagos_mensuales pm
        ${courseJoin}
        WHERE pm.estado = 'verificado'
          AND ${ecuadorDate} >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          ${courseFilter}
        GROUP BY fecha_completa, etiqueta
        ORDER BY fecha_completa ASC
      `;

      // Generar últimos 7 días con nombres Completos (MySQL DAYNAME devuelve en inglés, lo mapeamos)
      const daysMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = daysMap[d.getDay()];
        timeLabels.push({ etiqueta: dayName, valor: 0, fecha: d.toISOString().split('T')[0] });
      }

    } else if (period === 'month') {
      // Por semanas (Semana 1, Semana 2...) - Convertir de UTC a Ecuador (UTC-5)
      const ecuadorDate = `CONVERT_TZ(pm.fecha_verificacion, '+00:00', '-05:00')`;
      query = `
SELECT
WEEK(${ecuadorDate}, 1) - WEEK(DATE_SUB(${ecuadorDate}, INTERVAL DAYOFMONTH(${ecuadorDate}) - 1 DAY), 1) + 1 as semana_num,
  CONCAT('Semana ', WEEK(${ecuadorDate}, 1) - WEEK(DATE_SUB(${ecuadorDate}, INTERVAL DAYOFMONTH(${ecuadorDate}) - 1 DAY), 1) + 1) as etiqueta,
  COALESCE(SUM(pm.monto), 0) as total_ingresos
        FROM pagos_mensuales pm
        ${courseJoin}
        WHERE pm.estado = 'verificado'
          AND MONTH(${ecuadorDate}) = MONTH(CURDATE())
          AND YEAR(${ecuadorDate}) = YEAR(CURDATE())
          ${courseFilter}
        GROUP BY semana_num, etiqueta
        ORDER BY semana_num ASC
       `;

      for (let i = 1; i <= 5; i++) {
        timeLabels.push({ etiqueta: `Semana ${i}`, valor: 0 });
      }

    } else if (period === 'year') {
      // Filtro Año actual: Enero - Diciembre - Convertir de UTC a Ecuador (UTC-5)
      const ecuadorDate = `CONVERT_TZ(pm.fecha_verificacion, '+00:00', '-05:00')`;
      query = `
SELECT
MONTH(${ecuadorDate}) as mes_num,
  COALESCE(SUM(pm.monto), 0) as total_ingresos
        FROM pagos_mensuales pm
        ${courseJoin}
        WHERE pm.estado = 'verificado'
          AND YEAR(${ecuadorDate}) = YEAR(CURDATE())
          ${courseFilter}
        GROUP BY mes_num
        ORDER BY mes_num ASC
  `;

      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      meses.forEach((m, i) => timeLabels.push({ etiqueta: m, valor: 0, orden: i + 1 }));

    } else {
      // Default / All: Mostrar últimos 12 meses o histórico
      query = `
        SELECT 
          DATE_FORMAT(pm.fecha_verificacion, '%Y-%m') as mes_anio,
          DATE_FORMAT(pm.fecha_verificacion, '%b %y') as etiqueta, 
          COALESCE(SUM(pm.monto), 0) as total_ingresos
        FROM pagos_mensuales pm
        ${courseJoin}
        WHERE pm.estado = 'verificado'
          ${courseFilter}
        GROUP BY mes_anio, etiqueta
        ORDER BY mes_anio ASC
        LIMIT 12
       `;
    }

    // Ejecutar consulta
    const [rows] = await pool.execute(query);

    // Mapear resultados
    let datosFinales = [];
    if (period === 'today') {
      datosFinales = timeLabels.map(plantilla => {
        const encontrado = rows.find(r => r.etiqueta_num === plantilla.orden);
        return { ...plantilla, valor: encontrado ? parseFloat(encontrado.total_ingresos) : 0 };
      }).filter((_, i) => i >= 8 && i <= 20);
    } else if (period === 'week') {
      datosFinales = timeLabels.map(plantilla => {
        const encontrado = rows.find(r => {
          return r.fecha_completa.toISOString().split('T')[0] === plantilla.fecha;
        });
        return { mes: plantilla.etiqueta, valor: encontrado ? parseFloat(encontrado.total_ingresos) : 0 };
      });
    } else if (period === 'month') {
      datosFinales = timeLabels.map(plantilla => {
        const encontrado = rows.find(r => r.etiqueta === plantilla.etiqueta);
        return { mes: plantilla.etiqueta, valor: encontrado ? parseFloat(encontrado.total_ingresos) : 0 };
      });
    } else if (period === 'year') {
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      datosFinales = timeLabels.map(plantilla => {
        const encontrado = rows.find(r => r.mes_num === plantilla.orden);
        return { mes: plantilla.etiqueta, valor: encontrado ? parseFloat(encontrado.total_ingresos) : 0 };
      });
    } else {
      // Para 'all', generar los últimos 12 meses para asegurar que el gráfico se vea bien incluso con huecos
      const ultimos12Meses = [];
      const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = `${mesesNombres[d.getMonth()]} ${d.getFullYear()}`;
        const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        ultimos12Meses.push({ etiqueta: label, valor: 0, key: key });
      }

      datosFinales = ultimos12Meses.map(plantilla => {
        const encontrado = rows.find(r => r.mes_anio === plantilla.key);
        return { mes: plantilla.etiqueta, valor: encontrado ? parseFloat(encontrado.total_ingresos) : 0 };
      });
    }

    // Calcular estadísticas
    const totalIngresos = datosFinales.reduce((sum, d) => sum + d.valor, 0);
    const promedio = datosFinales.length > 0 ? totalIngresos / datosFinales.length : 0;
    const maxDato = datosFinales.reduce((max, d) => d.valor > max.valor ? d : max, datosFinales[0] || { mes: '-', valor: 0 });

    res.json({
      datos: datosFinales.map(d => ({ mes: d.mes || d.etiqueta, valor: d.valor })), // Estandarizar clave 'mes' para el frontend
      promedio: Math.round(promedio * 100) / 100,
      total: Math.round(totalIngresos * 100) / 100,
      mes_mayor: { mes: maxDato.mes || maxDato.etiqueta, valor: maxDato.valor }
    });

  } catch (error) {
    console.error('Error obteniendo tendencias:', error);
    // Fallback a seguro
    res.json({ datos: [], promedio: 0, total: 0, mes_mayor: { mes: '-', valor: 0 } });
  }
};

// Obtener actividad reciente
exports.getActividadReciente = async (req, res) => {
  try {
    const actividades = [];

    // Últimas matrículas (últimas 2)
    const [matriculas] = await pool.execute(`
      SELECT 
        CONCAT(u.nombre, ' ', u.apellido) as nombre_completo,
        c.nombre as curso_nombre,
        m.fecha_matricula
      FROM matriculas m
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE m.estado = 'activo'
      ORDER BY m.fecha_matricula DESC
      LIMIT 2
    `);

    matriculas.forEach(m => {
      actividades.push({
        tipo: 'matricula',
        texto: `Nueva matrícula: ${m.nombre_completo} en ${m.curso_nombre}`,
        fecha: m.fecha_matricula,
        icono: 'UserPlus',
        color: '#10b981'
      });
    });

    // Últimos pagos verificados (últimos 2)
    const [pagos] = await pool.execute(`
      SELECT 
        CONCAT(u.nombre, ' ', u.apellido) as nombre_completo,
        c.nombre as curso_nombre,
        pm.monto,
        pm.fecha_verificacion
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE pm.estado = 'verificado'
      ORDER BY pm.fecha_verificacion DESC
      LIMIT 2
    `);

    pagos.forEach(p => {
      actividades.push({
        tipo: 'pago',
        texto: `Pago verificado: ${p.nombre_completo} - ${parseFloat(p.monto).toFixed(2)} (${p.curso_nombre})`,
        fecha: p.fecha_verificacion,
        icono: 'DollarSign',
        color: '#f59e0b'
      });
    });

    // Últimos cursos creados (último 1)
    const [cursos] = await pool.execute(`
      SELECT 
        nombre,
        fecha_creacion
      FROM cursos
      WHERE estado = 'activo'
      ORDER BY fecha_creacion DESC
      LIMIT 1
    `);

    cursos.forEach(c => {
      actividades.push({
        tipo: 'curso',
        texto: `Nuevo curso creado: ${c.nombre}`,
        fecha: c.fecha_creacion,
        icono: 'BookOpen',
        color: '#3b82f6'
      });
    });

    // Ordenar por fecha descendente
    actividades.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Calcular tiempo relativo
    const actividadesConTiempo = actividades.slice(0, 5).map(act => {
      const fecha = new Date(act.fecha);
      const ahora = new Date();
      const diffMs = ahora - fecha;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHoras = Math.floor(diffMs / 3600000);
      const diffDias = Math.floor(diffMs / 86400000);

      let tiempo;
      if (diffMins < 60) {
        tiempo = `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
      } else if (diffHoras < 24) {
        tiempo = `Hace ${diffHoras} hora${diffHoras !== 1 ? 's' : ''}`;
      } else {
        tiempo = `Hace ${diffDias} día${diffDias !== 1 ? 's' : ''}`;
      }

      return {
        texto: act.texto,
        tiempo,
        icono: act.icono,
        color: act.color
      };
    });

    res.json(actividadesConTiempo);
  } catch (error) {
    console.error('Error obteniendo actividad reciente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener estadísticas de pagos
exports.getEstadisticasPagos = async (req, res) => {
  try {
    const [result] = await pool.execute(`
      SELECT 
        COUNT(*) as total_pagos,
        SUM(CASE WHEN estado = 'verificado' THEN 1 ELSE 0 END) as pagos_verificados,
        SUM(CASE WHEN estado = 'pagado' THEN 1 ELSE 0 END) as pagos_pendientes_verificacion,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pagos_pendientes,
        SUM(CASE WHEN estado = 'vencido' THEN 1 ELSE 0 END) as pagos_vencidos,
        SUM(CASE WHEN estado = 'verificado' THEN monto ELSE 0 END) as monto_total_verificado,
        SUM(CASE WHEN estado IN ('pendiente', 'vencido') THEN monto ELSE 0 END) as monto_total_pendiente
      FROM pagos_mensuales
    `);

    res.json(result[0]);
  } catch (error) {
    console.error('Error obteniendo estadísticas de pagos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener cursos con más matrículas (Top 5) para gráfico de pastel
exports.getCursosTopMatriculas = async (req, res) => {
  try {
    const [result] = await pool.execute(`
      SELECT 
        c.nombre as nombre_curso,
        COUNT(m.id_matricula) as total_matriculas
      FROM cursos c
      LEFT JOIN matriculas m ON c.id_curso = m.id_curso AND m.estado = 'activa'
      WHERE c.estado IN ('activo', 'planificado')
      GROUP BY c.id_curso, c.nombre
      HAVING total_matriculas > 0
      ORDER BY total_matriculas DESC
      LIMIT 5
    `);

    const colores = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

    const cursosConColor = result.map((curso, index) => ({
      nombre_curso: curso.nombre_curso,
      total_matriculas: parseInt(curso.total_matriculas),
      color: colores[index % colores.length]
    }));

    res.json(cursosConColor);
  } catch (error) {
    console.error('Error obteniendo cursos top:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener ingresos del período seleccionado
exports.getIngresosMesActual = async (req, res) => {
  try {
    const period = req.query.period || 'month';
    const course = req.query.course || 'all';

    const dateFilter = getDateFilter('pm.fecha_verificacion', period);
    const courseJoin = course !== 'all' ? 'INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula INNER JOIN cursos c ON m.id_curso = c.id_curso' : '';
    const courseFilter = getCourseFilter(course, 'c');

    const [result] = await pool.execute(`
      SELECT 
        COALESCE(SUM(pm.monto), 0) as ingresos_periodo
      FROM pagos_mensuales pm
      ${courseJoin}
      WHERE pm.estado = 'verificado'
        ${dateFilter}
        ${courseFilter}
    `);

    // Calcular período anterior para comparación
    let dateFilterAnterior = '';
    if (period === 'today') {
      dateFilterAnterior = 'AND DATE(pm.fecha_verificacion) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
    } else if (period === 'week') {
      dateFilterAnterior = 'AND pm.fecha_verificacion >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND pm.fecha_verificacion < DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (period === 'month') {
      dateFilterAnterior = 'AND MONTH(pm.fecha_verificacion) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(pm.fecha_verificacion) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))';
    } else if (period === 'year') {
      dateFilterAnterior = 'AND YEAR(pm.fecha_verificacion) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 YEAR))';
    } else {
      dateFilterAnterior = '';
    }

    const [resultAnterior] = await pool.execute(`
      SELECT 
        COALESCE(SUM(pm.monto), 0) as ingresos_anterior
      FROM pagos_mensuales pm
      ${courseJoin}
      WHERE pm.estado = 'verificado'
        ${dateFilterAnterior}
        ${courseFilter}
    `);

    const ingresosActual = parseFloat(result[0].ingresos_periodo);
    const ingresosAnterior = parseFloat(resultAnterior[0].ingresos_anterior);

    const porcentajeCambio = ingresosAnterior > 0
      ? ((ingresosActual - ingresosAnterior) / ingresosAnterior) * 100
      : 0;

    res.json({
      ingresos_mes_actual: ingresosActual,
      ingresos_mes_anterior: ingresosAnterior,
      porcentaje_cambio: Math.round(porcentajeCambio)
    });
  } catch (error) {
    console.error('Error obteniendo ingresos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener estadísticas de estudiantes (activos/inactivos y retención)
exports.getEstadisticasEstudiantes = async (req, res) => {
  try {
    const [totalEstudiantes] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante'
    `);

    const [estudiantesActivos] = await pool.execute(`
      SELECT COUNT(DISTINCT m.id_estudiante) as total
      FROM matriculas m
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      WHERE m.estado = 'activa' AND u.estado = 'activo'
    `);

    const [estudiantesGraduados] = await pool.execute(`
      SELECT COUNT(DISTINCT m.id_estudiante) as total
      FROM matriculas m
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE c.estado = 'finalizado'
        AND m.estado = 'activa'
    `);

    const [estudiantesInscritos] = await pool.execute(`
      SELECT COUNT(DISTINCT m.id_estudiante) as total
      FROM matriculas m
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE c.estado IN ('activo', 'finalizado')
    `);

    const [estudiantesGraduadosTotal] = await pool.execute(`
      SELECT COUNT(DISTINCT id_estudiante) as total
      FROM estudiante_curso
      WHERE estado = 'graduado'
    `);

    const [aprobadosReprobados] = await pool.execute(`
      SELECT 
        SUM(CASE WHEN estado = 'aprobado' THEN 1 ELSE 0 END) as aprobados,
        SUM(CASE WHEN estado IN ('aprobado', 'reprobado') THEN 1 ELSE 0 END) as total_evaluados
      FROM estudiante_curso
    `);

    const [ocupacionData] = await pool.execute(`
      SELECT 
        SUM(cupos_disponibles) as disponibles,
        SUM(capacidad_maxima) as total_capacidad
      FROM cursos
      WHERE estado = 'activo'
    `);

    const total = parseInt(totalEstudiantes[0].total);
    const activos = parseInt(estudiantesActivos[0].total);
    const inactivos = total - activos;
    const graduados = parseInt(estudiantesGraduados[0].total); // actual en cursos finalizados
    const inscritos = parseInt(estudiantesInscritos[0].total);
    const graduadosHistorico = parseInt(estudiantesGraduadosTotal[0].total);

    // Tasas dinámicas
    const aprobados = parseInt(aprobadosReprobados[0].aprobados || 0);
    const totalEvaluados = parseInt(aprobadosReprobados[0].total_evaluados || 0);
    const tasaAprobacion = totalEvaluados > 0 ? Math.round((aprobados / totalEvaluados) * 100) : 0;

    const tasaGraduacion = total > 0 ? Math.round((graduadosHistorico / total) * 100) : 0;

    const capacidadTotal = parseInt(ocupacionData[0].total_capacidad || 0);
    const cuposDisponibles = parseInt(ocupacionData[0].disponibles || 0);
    const matriculadosActivos = capacidadTotal - cuposDisponibles;
    const tasaOcupacion = capacidadTotal > 0 ? Math.round((matriculadosActivos / capacidadTotal) * 100) : 0;

    const tasaRetencion = inscritos > 0
      ? Math.round((graduados / inscritos) * 100)
      : 0;

    const porcentajeActivos = total > 0
      ? Math.round((activos / total) * 100)
      : 0;

    res.json({
      total_estudiantes: total,
      estudiantes_activos: activos,
      estudiantes_inactivos: inactivos,
      porcentaje_activos: porcentajeActivos,
      tasa_retencion: tasaRetencion,
      tasa_aprobacion: tasaAprobacion,
      tasa_graduacion: tasaGraduacion,
      tasa_ocupacion: tasaOcupacion
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de estudiantes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener estadísticas de solicitudes
exports.getEstadisticasSolicitudes = async (req, res) => {
  try {
    const [result] = await pool.execute(`
      SELECT 
        COUNT(*) as total_solicitudes,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as solicitudes_pendientes,
        SUM(CASE WHEN estado = 'aprobado' THEN 1 ELSE 0 END) as solicitudes_aprobadas,
        SUM(CASE WHEN estado = 'rechazado' THEN 1 ELSE 0 END) as solicitudes_rechazadas
      FROM solicitudes_matricula
      WHERE MONTH(CONVERT_TZ(fecha_solicitud, '+00:00', '-05:00')) = MONTH(CURDATE())
        AND YEAR(CONVERT_TZ(fecha_solicitud, '+00:00', '-05:00')) = YEAR(CURDATE())
    `);

    res.json(result[0]);
  } catch (error) {
    console.error('Error obteniendo estadísticas de solicitudes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};



// Obtener próximos vencimientos (7 días)
exports.getProximosVencimientos = async (req, res) => {
  try {
    const [result] = await pool.execute(`
      SELECT 
        pm.id_pago,
        pm.numero_cuota,
        pm.monto,
        pm.fecha_vencimiento,
        DATEDIFF(pm.fecha_vencimiento, CURDATE()) as dias_restantes,
        CONCAT(u.nombre, ' ', u.apellido) as nombre_estudiante,
        c.nombre as nombre_curso
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE pm.estado = 'pendiente'
        AND pm.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      ORDER BY pm.fecha_vencimiento ASC
      LIMIT 100
    `);

    const vencimientos = result.map(v => ({
      id_pago: v.id_pago,
      numero_cuota: v.numero_cuota,
      monto: parseFloat(v.monto),
      fecha_vencimiento: v.fecha_vencimiento,
      dias_restantes: v.dias_restantes,
      nombre_estudiante: v.nombre_estudiante,
      nombre_curso: v.nombre_curso
    }));

    res.json(vencimientos);
  } catch (error) {
    console.error('Error obteniendo próximos vencimientos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = exports;

