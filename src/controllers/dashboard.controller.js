const { pool } = require('../config/database');

// Obtener matrículas por mes (últimos 6 meses)
exports.getMatriculasPorMes = async (req, res) => {
  try {
    const [result] = await pool.execute(`
      SELECT 
        DATE_FORMAT(fecha_matricula, '%b') as mes,
        DATE_FORMAT(fecha_matricula, '%Y-%m') as mes_completo,
        COUNT(*) as total
      FROM matriculas
      WHERE fecha_matricula >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        AND estado = 'activo'
      GROUP BY mes_completo, mes
      ORDER BY mes_completo ASC
    `);

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mesActual = new Date().getMonth();
    const ultimos6Meses = [];
    
    for (let i = 5; i >= 0; i--) {
      const mesIndex = (mesActual - i + 12) % 12;
      ultimos6Meses.push(meses[mesIndex]);
    }

    const matriculasPorMes = ultimos6Meses.map(mes => {
      const data = result.find(r => r.mes === mes);
      return {
        mes,
        valor: data ? parseInt(data.total) : 0
      };
    });

    const maxValor = Math.max(...matriculasPorMes.map(m => m.valor), 1);
    const matriculasConAltura = matriculasPorMes.map(m => ({
      ...m,
      altura: `${Math.round((m.valor / maxValor) * 100)}%`
    }));

    res.json(matriculasConAltura);
  } catch (error) {
    console.error('Error obteniendo matrículas por mes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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
        pm.monto,
        pm.fecha_verificacion
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      WHERE pm.estado = 'verificado'
      ORDER BY pm.fecha_verificacion DESC
      LIMIT 2
    `);

    pagos.forEach(p => {
      actividades.push({
        tipo: 'pago',
        texto: `Pago verificado: ${p.nombre_completo} - $${parseFloat(p.monto).toFixed(2)}`,
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
      WHERE MONTH(fecha_solicitud) = MONTH(CURDATE())
        AND YEAR(fecha_solicitud) = YEAR(CURDATE())
    `);

    res.json(result[0]);
  } catch (error) {
    console.error('Error obteniendo estadísticas de solicitudes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = exports;
