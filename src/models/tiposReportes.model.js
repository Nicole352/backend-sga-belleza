const { pool } = require('../config/database');

/**
 * MODELO PARA GESTIÓN DE TIPOS DE REPORTES Y REPORTES GENERADOS
 * Usa las tablas: tipos_reportes, reportes_generados, parametros_reporte
 */
const TiposReportesModel = {
  /**
   * Obtener todos los tipos de reportes disponibles
   */
  async getAllTiposReportes() {
    try {
      const query = `
        SELECT 
          id_tipo_reporte,
          nombre,
          descripcion,
          formato_salida,
          estado,
          fecha_creacion
        FROM tipos_reportes
        WHERE estado = 'activo'
        ORDER BY nombre
      `;
      
      const [rows] = await pool.query(query);
      return rows;
    } catch (error) {
      console.error('Error en getAllTiposReportes:', error);
      throw error;
    }
  },

  /**
   * Obtener un tipo de reporte por ID
   */
  async getTipoReporteById(idTipoReporte) {
    try {
      const query = `
        SELECT 
          id_tipo_reporte,
          nombre,
          descripcion,
          formato_salida,
          plantilla_query,
          estado
        FROM tipos_reportes
        WHERE id_tipo_reporte = ?
      `;
      
      const [rows] = await pool.query(query, [idTipoReporte]);
      return rows[0];
    } catch (error) {
      console.error('Error en getTipoReporteById:', error);
      throw error;
    }
  },

  /**
   * Crear un nuevo tipo de reporte
   */
  async createTipoReporte({ nombre, descripcion, formatoSalida, plantillaQuery }) {
    try {
      const query = `
        INSERT INTO tipos_reportes 
        (nombre, descripcion, formato_salida, plantilla_query, estado)
        VALUES (?, ?, ?, ?, 'activo')
      `;
      
      const [result] = await pool.query(query, [
        nombre,
        descripcion,
        formatoSalida,
        plantillaQuery
      ]);
      
      return result.insertId;
    } catch (error) {
      console.error('Error en createTipoReporte:', error);
      throw error;
    }
  },

  /**
   * Guardar un reporte generado en el historial
   */
  async guardarReporteGenerado({
    idTipoReporte,
    idGeneradoPor,
    archivoGenerado,
    formatoGenerado,
    parametros = {}
  }) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // 1. Insertar el reporte generado
      const queryReporte = `
        INSERT INTO reportes_generados 
        (id_tipo_reporte, id_generado_por, archivo_generado, formato_generado, estado, fecha_expiracion)
        VALUES (?, ?, ?, ?, 'completado', DATE_ADD(NOW(), INTERVAL 30 DAY))
      `;
      
      const [resultReporte] = await connection.query(queryReporte, [
        idTipoReporte,
        idGeneradoPor,
        archivoGenerado,
        formatoGenerado
      ]);

      const idReporte = resultReporte.insertId;

      // 2. Guardar los parámetros del reporte
      if (Object.keys(parametros).length > 0) {
        const queryParametros = `
          INSERT INTO parametros_reporte (id_reporte, clave, valor)
          VALUES ?
        `;
        
        const valoresParametros = Object.entries(parametros).map(([clave, valor]) => [
          idReporte,
          clave,
          typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
        ]);

        await connection.query(queryParametros, [valoresParametros]);
      }

      await connection.commit();
      return idReporte;
    } catch (error) {
      await connection.rollback();
      console.error('Error en guardarReporteGenerado:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Obtener historial de reportes generados
   */
  async getHistorialReportes({ idUsuario = null, idTipoReporte = null, limite = 50 }) {
    try {
      let query = `
        SELECT 
          rg.id_reporte,
          rg.id_tipo_reporte,
          rg.archivo_generado,
          rg.formato_generado,
          rg.fecha_generacion,
          rg.fecha_expiracion,
          rg.estado,
          tr.nombre as nombre_reporte,
          tr.descripcion as descripcion_reporte,
          CONCAT(u.nombre, ' ', u.apellido) as generado_por,
          u.email as email_generador
        FROM reportes_generados rg
        INNER JOIN tipos_reportes tr ON rg.id_tipo_reporte = tr.id_tipo_reporte
        INNER JOIN usuarios u ON rg.id_generado_por = u.id_usuario
        WHERE rg.estado = 'completado'
      `;

      const params = [];

      if (idUsuario) {
        query += ` AND rg.id_generado_por = ?`;
        params.push(idUsuario);
      }

      if (idTipoReporte) {
        query += ` AND rg.id_tipo_reporte = ?`;
        params.push(idTipoReporte);
      }

      query += ` ORDER BY rg.fecha_generacion DESC LIMIT ?`;
      params.push(limite);

      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error en getHistorialReportes:', error);
      throw error;
    }
  },

  /**
   * Obtener parámetros de un reporte generado
   */
  async getParametrosReporte(idReporte) {
    try {
      const query = `
        SELECT clave, valor
        FROM parametros_reporte
        WHERE id_reporte = ?
      `;
      
      const [rows] = await pool.query(query, [idReporte]);
      
      // Convertir a objeto
      const parametros = {};
      rows.forEach(row => {
        try {
          parametros[row.clave] = JSON.parse(row.valor);
        } catch {
          parametros[row.clave] = row.valor;
        }
      });
      
      return parametros;
    } catch (error) {
      console.error('Error en getParametrosReporte:', error);
      throw error;
    }
  },

  /**
   * Buscar si existe un reporte reciente con los mismos parámetros (caché)
   */
  async buscarReporteEnCache({ idTipoReporte, parametros, minutosValidez = 30 }) {
    try {
      // Buscar reportes recientes del mismo tipo
      const query = `
        SELECT 
          rg.id_reporte,
          rg.archivo_generado,
          rg.formato_generado,
          rg.fecha_generacion
        FROM reportes_generados rg
        WHERE rg.id_tipo_reporte = ?
          AND rg.estado = 'completado'
          AND rg.fecha_generacion >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
        ORDER BY rg.fecha_generacion DESC
        LIMIT 10
      `;

      const [reportes] = await pool.query(query, [idTipoReporte, minutosValidez]);

      // Verificar si alguno tiene los mismos parámetros
      for (const reporte of reportes) {
        const parametrosReporte = await this.getParametrosReporte(reporte.id_reporte);
        
        // Comparar parámetros
        if (JSON.stringify(parametrosReporte) === JSON.stringify(parametros)) {
          return reporte; // Encontrado en caché
        }
      }

      return null; // No encontrado en caché
    } catch (error) {
      console.error('Error en buscarReporteEnCache:', error);
      return null; // En caso de error, no usar caché
    }
  },

  /**
   * Limpiar reportes expirados
   */
  async limpiarReportesExpirados() {
    try {
      const query = `
        UPDATE reportes_generados
        SET estado = 'expirado'
        WHERE fecha_expiracion < NOW()
          AND estado = 'completado'
      `;
      
      const [result] = await pool.query(query);
      return result.affectedRows;
    } catch (error) {
      console.error('Error en limpiarReportesExpirados:', error);
      throw error;
    }
  },

  /**
   * Obtener estadísticas de reportes generados
   */
  async getEstadisticasReportes({ fechaInicio, fechaFin }) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_reportes,
          COUNT(DISTINCT id_generado_por) as usuarios_unicos,
          COUNT(DISTINCT id_tipo_reporte) as tipos_reportes_usados,
          tr.nombre as reporte_mas_usado,
          COUNT(*) as veces_generado
        FROM reportes_generados rg
        INNER JOIN tipos_reportes tr ON rg.id_tipo_reporte = tr.id_tipo_reporte
        WHERE DATE(rg.fecha_generacion) BETWEEN ? AND ?
          AND rg.estado = 'completado'
        GROUP BY tr.id_tipo_reporte, tr.nombre
        ORDER BY veces_generado DESC
        LIMIT 1
      `;

      const [rows] = await pool.query(query, [fechaInicio, fechaFin]);
      return rows[0] || {
        total_reportes: 0,
        usuarios_unicos: 0,
        tipos_reportes_usados: 0,
        reporte_mas_usado: 'N/A',
        veces_generado: 0
      };
    } catch (error) {
      console.error('Error en getEstadisticasReportes:', error);
      throw error;
    }
  }
};

module.exports = TiposReportesModel;
