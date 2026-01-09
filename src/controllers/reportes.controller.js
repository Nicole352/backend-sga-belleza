const ReportesModel = require('../models/reportes.model');
const TiposReportesModel = require('../models/tiposReportes.model');
const { generarPDFEstudiantes, generarPDFFinanciero, generarPDFCursos } = require('../services/reportesPdfService');
const { generarExcelEstudiantes, generarExcelFinanciero, generarExcelCursos } = require('../services/reportesExcelService');

const ReportesController = {
  /**
   * OBTENER REPORTE DE ESTUDIANTES (Vista previa)
   * GET /api/reportes/estudiantes
   */
  async getReporteEstudiantes(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, idCurso, horario } = req.query;

      // Validaciones
      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas de inicio y fin son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteEstudiantes({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        idCurso: idCurso || null,
        horario: horario || 'todos'
      });

      // Obtener estadísticas
      const estadisticas = await ReportesModel.getEstadisticasEstudiantes({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        idCurso: idCurso || null,
        horario: horario || 'todos'
      });

      // Obtener nombre del curso si se filtró
      let nombreCurso = null;
      if (idCurso) {
        const cursoEncontrado = datos.find(d => d.id_curso == idCurso);
        nombreCurso = cursoEncontrado ? cursoEncontrado.nombre_curso : null;
      }

      res.json({
        success: true,
        data: {
          datos,
          estadisticas,
          filtros: {
            fechaInicio,
            fechaFin,
            estado: estado || 'todos',
            idCurso: idCurso || null,
            horario: horario || 'todos',
            nombreCurso
          },
          total: datos.length
        }
      });
    } catch (error) {
      console.error('Error en getReporteEstudiantes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte de estudiantes',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR REPORTE DE ESTUDIANTES EN PDF
   * GET /api/reportes/estudiantes/pdf
   */
  async descargarPDFEstudiantes(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, idCurso, horario } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteEstudiantes({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        idCurso: idCurso || null,
        horario: horario || 'todos'
      });

      const estadisticas = await ReportesModel.getEstadisticasEstudiantes({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        idCurso: idCurso || null,
        horario: horario || 'todos'
      });

      // Obtener nombre del curso
      let nombreCurso = null;
      if (idCurso) {
        const cursoEncontrado = datos.find(d => d.id_curso == idCurso);
        nombreCurso = cursoEncontrado ? cursoEncontrado.nombre_curso : null;
      }

      // Generar PDF
      const pdfBuffer = await generarPDFEstudiantes(datos, {
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        horario: horario || 'todos',
        nombreCurso
      }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_Estudiantes_${fechaInicio}_${fechaFin}.pdf`;

      // Enviar PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error en descargarPDFEstudiantes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar PDF de estudiantes',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR REPORTE DE ESTUDIANTES EN EXCEL
   * GET /api/reportes/estudiantes/excel
   */
  async descargarExcelEstudiantes(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, idCurso, horario } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteEstudiantes({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        idCurso: idCurso || null,
        horario: horario || 'todos'
      });

      const estadisticas = await ReportesModel.getEstadisticasEstudiantes({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        idCurso: idCurso || null,
        horario: horario || 'todos'
      });

      // Obtener nombre del curso y fechas reales
      let nombreCurso = null;
      let fechasParaEncabezado = { fechaInicio, fechaFin };

      if (idCurso && datos.length > 0) {
        const cursoEncontrado = datos.find(d => d.id_curso == idCurso);
        if (cursoEncontrado) {
          nombreCurso = cursoEncontrado.nombre_curso;
          // Usar las fechas del curso filtrado
          fechasParaEncabezado = {
            fechaInicio: cursoEncontrado.fecha_inicio?.split('T')[0] || fechaInicio,
            fechaFin: cursoEncontrado.fecha_fin?.split('T')[0] || fechaFin
          };
        }
      } else if (datos.length > 0) {
        // Si no hay filtro de curso, usar el rango de todos los cursos en los datos
        const fechasReales = datos.map(d => ({
          inicio: d.fecha_inicio,
          fin: d.fecha_fin
        }));
        const fechaMasAntiguaInicio = fechasReales.reduce((min, d) =>
          d.inicio < min ? d.inicio : min, fechasReales[0].inicio);
        const fechaMasTardiaFin = fechasReales.reduce((max, d) =>
          d.fin > max ? d.fin : max, fechasReales[0].fin);

        fechasParaEncabezado = {
          fechaInicio: fechaMasAntiguaInicio?.split('T')[0] || fechaInicio,
          fechaFin: fechaMasTardiaFin?.split('T')[0] || fechaFin
        };
      }

      // Generar Excel
      const excelBuffer = await generarExcelEstudiantes(datos, {
        ...fechasParaEncabezado,
        estado: estado || 'todos',
        horario: horario || 'todos',
        nombreCurso
      }, estadisticas);

      // Nombre del archivo
      let nombreArchivo = `Reporte_Estudiantes_${fechaInicio}_${fechaFin}.xlsx`;

      // Si es el rango por defecto (2020-2030), usar un nombre más amigable
      if (fechaInicio === '2020-01-01' && fechaFin === '2030-12-31') {
        const hoy = new Date().toISOString().split('T')[0];
        nombreArchivo = `Reporte_Estudiantes_General_${hoy}.xlsx`;
      }

      // Enviar Excel
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error en descargarExcelEstudiantes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar Excel de estudiantes',
        error: error.message
      });
    }
  },

  /**
   * OBTENER REPORTE FINANCIERO (Vista previa)
   * GET /api/reportes/financiero
   */
  async getReporteFinanciero(req, res) {
    try {
      const { fechaInicio, fechaFin, tipoPago, estadoPago, idCurso, estadoCurso, metodoPago, horario } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas de inicio y fin son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteFinanciero({
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos',
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      });

      // Obtener estadísticas financieras
      const estadisticasFinancieras = await ReportesModel.getEstadisticasFinancieras({
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos',
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      });

      // Obtener estadísticas de cursos (para el resumen detallado)
      const estadisticasCursos = await ReportesModel.getEstadisticasCursos({
        fechaInicio,
        fechaFin,
        idCurso: idCurso || null,
        estado: estadoCurso || 'todos',
        horario: horario || 'todos'
      });

      // Combinar estadísticas
      const estadisticas = {
        ...estadisticasFinancieras,
        ...estadisticasCursos
      };

      res.json({
        success: true,
        data: {
          datos,
          estadisticas,
          filtros: {
            fechaInicio,
            fechaFin,
            tipoPago: tipoPago || 'todos',
            estadoPago: estadoPago || 'todos',
            idCurso: idCurso || null,
            estadoCurso: estadoCurso || 'todos',
            metodoPago: metodoPago || 'todos',
            horario: horario || 'todos'
          },
          total: datos.length
        }
      });
    } catch (error) {
      console.error('Error en getReporteFinanciero:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte financiero',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR REPORTE FINANCIERO EN PDF
   * GET /api/reportes/financiero/pdf
   */
  async descargarPDFFinanciero(req, res) {
    try {
      const { fechaInicio, fechaFin, tipoPago, estadoPago, idCurso, estadoCurso, metodoPago, horario } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteFinanciero({
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos',
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      });

      const estadisticasFinancieras = await ReportesModel.getEstadisticasFinancieras({
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos',
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      });

      const estadisticasCursos = await ReportesModel.getEstadisticasCursos({
        fechaInicio,
        fechaFin,
        idCurso: idCurso || null,
        estado: estadoCurso || 'todos',
        horario: horario || 'todos'
      });

      const estadisticas = {
        ...estadisticasFinancieras,
        ...estadisticasCursos
      };

      // Generar PDF
      const pdfBuffer = await generarPDFFinanciero(datos, {
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos',
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_Financiero_${fechaInicio}_${fechaFin}.pdf`;

      // Enviar PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error en descargarPDFFinanciero:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar PDF financiero',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR REPORTE FINANCIERO EN EXCEL
   * GET /api/reportes/financiero/excel
   */
  async descargarExcelFinanciero(req, res) {
    try {
      const { fechaInicio, fechaFin, tipoPago, estadoPago, idCurso, estadoCurso, metodoPago, horario } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteFinanciero({
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos',
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      });

      const estadisticas = await ReportesModel.getEstadisticasFinancieras({
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos',
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      });

      // Para Estado de Cuenta: obtener TODOS los pagos sin filtro de estado
      // Esto asegura que se calculen correctamente las cuotas pendientes
      const datosSinFiltroEstado = await ReportesModel.getReporteFinanciero({
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: 'todos', // SIN filtro de estado
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      });

      // Determinar fechas para el encabezado
      let fechasParaEncabezado = { fechaInicio, fechaFin };

      console.log('🔍 DEBUG Financiero - idCurso recibido:', idCurso);
      console.log('🔍 DEBUG Financiero - Total datos:', datos.length);

      if (idCurso && datos.length > 0) {
        // Si hay filtro de curso, usar las fechas del curso
        const cursoEncontrado = datos.find(d => d.id_curso == idCurso);
        console.log('🔍 DEBUG Financiero - Curso encontrado:', cursoEncontrado ? 'SÍ' : 'NO');

        if (cursoEncontrado) {
          console.log('🔍 DEBUG Financiero - Fecha inicio curso:', cursoEncontrado.fecha_inicio);
          console.log('🔍 DEBUG Financiero - Fecha fin curso:', cursoEncontrado.fecha_fin);

          // Convertir Date a string YYYY-MM-DD
          const fechaInicioStr = cursoEncontrado.fecha_inicio instanceof Date
            ? cursoEncontrado.fecha_inicio.toISOString().split('T')[0]
            : (typeof cursoEncontrado.fecha_inicio === 'string' ? cursoEncontrado.fecha_inicio.split('T')[0] : fechaInicio);

          const fechaFinStr = cursoEncontrado.fecha_fin instanceof Date
            ? cursoEncontrado.fecha_fin.toISOString().split('T')[0]
            : (typeof cursoEncontrado.fecha_fin === 'string' ? cursoEncontrado.fecha_fin.split('T')[0] : fechaFin);

          fechasParaEncabezado = {
            fechaInicio: fechaInicioStr,
            fechaFin: fechaFinStr
          };

          console.log('✅ Fechas actualizadas para encabezado:', fechasParaEncabezado);
        }
      } else if (datos.length > 0) {
        // Si no hay filtro de curso, usar el rango de todos los cursos en los datos
        const cursosUnicos = new Map();
        datos.forEach(d => {
          if (d.id_curso && d.fecha_inicio && d.fecha_fin) {
            cursosUnicos.set(d.id_curso, {
              inicio: d.fecha_inicio instanceof Date ? d.fecha_inicio : new Date(d.fecha_inicio),
              fin: d.fecha_fin instanceof Date ? d.fecha_fin : new Date(d.fecha_fin)
            });
          }
        });

        if (cursosUnicos.size > 0) {
          const fechasReales = Array.from(cursosUnicos.values());
          const fechaMasAntiguaInicio = fechasReales.reduce((min, d) =>
            d.inicio < min ? d.inicio : min, fechasReales[0].inicio);
          const fechaMasTardiaFin = fechasReales.reduce((max, d) =>
            d.fin > max ? d.fin : max, fechasReales[0].fin);

          fechasParaEncabezado = {
            fechaInicio: fechaMasAntiguaInicio.toISOString().split('T')[0],
            fechaFin: fechaMasTardiaFin.toISOString().split('T')[0]
          };
        }
      }

      console.log('📊 Fechas finales para Excel:', fechasParaEncabezado);

      // Generar Excel: datos filtrados para "Pagos Detallados", datos completos para "Estado de Cuenta"
      const excelBuffer = await generarExcelFinanciero(datos, datosSinFiltroEstado, {
        ...fechasParaEncabezado,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos'
      }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_Financiero_${fechaInicio}_${fechaFin}.xlsx`;

      // Enviar Excel
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error en descargarExcelFinanciero:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar Excel financiero',
        error: error.message
      });
    }
  },

  /**
   * OBTENER REPORTE DE CURSOS (Vista previa)
   * GET /api/reportes/cursos
   */
  async getReporteCursos(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, ocupacion, horario } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas de inicio y fin son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteCursos({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        ocupacion: ocupacion || 'todos',
        horario: horario || 'todos'
      });

      // Obtener estadísticas
      const estadisticas = await ReportesModel.getEstadisticasCursos({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        horario: horario || 'todos',
        ocupacion: ocupacion || 'todos'
      });

      res.json({
        success: true,
        data: {
          datos,
          estadisticas,
          filtros: {
            fechaInicio,
            fechaFin
          },
          total: datos.length
        }
      });
    } catch (error) {
      console.error('Error en getReporteCursos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte de cursos',
        error: error.message
      });
    }
  },

  /**
   * OBTENER LISTA DE CURSOS PARA FILTROS
   * GET /api/reportes/cursos-filtro
   */
  async getCursosParaFiltro(req, res) {
    try {
      const cursos = await ReportesModel.getCursosParaFiltro();

      res.json({
        success: true,
        data: cursos
      });
    } catch (error) {
      console.error('Error en getCursosParaFiltro:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener cursos',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR REPORTE DE CURSOS EN PDF
   * GET /api/reportes/cursos/pdf
   */
  async descargarPDFCursos(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, ocupacion, horario } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteCursos({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        ocupacion: ocupacion || 'todos',
        horario: horario || 'todos'
      });
      const estadisticas = await ReportesModel.getEstadisticasCursos({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        horario: horario || 'todos',
        ocupacion: ocupacion || 'todos'
      });

      // Generar PDF
      const pdfBuffer = await generarPDFCursos(datos, {
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        ocupacion: ocupacion || 'todos',
        horario: horario || 'todos'
      }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_cursos_${fechaInicio}_${fechaFin}.pdf`;

      // Enviar PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error descargando PDF de cursos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar PDF de cursos',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR REPORTE DE CURSOS EN EXCEL
   * GET /api/reportes/cursos/excel
   */
  async descargarExcelCursos(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, ocupacion, horario } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteCursos({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        ocupacion: ocupacion || 'todos',
        horario: horario || 'todos'
      });
      const estadisticas = await ReportesModel.getEstadisticasCursos({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        horario: horario || 'todos',
        ocupacion: ocupacion || 'todos'
      });

      // Si hay datos y es un solo curso, usar sus fechas para el encabezado
      let fechasParaEncabezado = { fechaInicio, fechaFin };
      if (datos.length > 0) {
        // Obtener rango real de fechas de los cursos en los datos
        const fechasReales = datos.map(c => ({
          inicio: c.fecha_inicio,
          fin: c.fecha_fin
        }));
        const fechaMasAntiguaInicio = fechasReales.reduce((min, c) =>
          c.inicio < min ? c.inicio : min, fechasReales[0].inicio);
        const fechaMasTardiaFin = fechasReales.reduce((max, c) =>
          c.fin > max ? c.fin : max, fechasReales[0].fin);

        fechasParaEncabezado = {
          fechaInicio: fechaMasAntiguaInicio?.split('T')[0] || fechaInicio,
          fechaFin: fechaMasTardiaFin?.split('T')[0] || fechaFin
        };
      }

      // Generar Excel
      const excelBuffer = await generarExcelCursos(datos, {
        ...fechasParaEncabezado,
        estado: estado || 'todos',
        ocupacion: ocupacion || 'todos',
        horario: horario || 'todos'
      }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_cursos_${fechaInicio}_${fechaFin}.xlsx`;

      // Enviar Excel
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error descargando Excel de cursos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar Excel de cursos',
        error: error.message
      });
    }
  },

  // ========================================
  // NUEVAS FUNCIONES CON SISTEMA DE TABLAS
  // ========================================

  /**
   * OBTENER TODOS LOS TIPOS DE REPORTES DISPONIBLES
   * GET /api/reportes/tipos
   */
  async getTiposReportes(req, res) {
    try {
      const tipos = await TiposReportesModel.getAllTiposReportes();

      res.json({
        success: true,
        data: tipos
      });
    } catch (error) {
      console.error('Error en getTiposReportes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener tipos de reportes',
        error: error.message
      });
    }
  },

  /**
   * OBTENER HISTORIAL DE REPORTES GENERADOS
   * GET /api/reportes/historial
   */
  async getHistorialReportes(req, res) {
    try {
      const { idTipoReporte, limite = 50 } = req.query;
      const idUsuario = req.user?.id_usuario; // Del middleware de autenticación

      const historial = await TiposReportesModel.getHistorialReportes({
        idUsuario,
        idTipoReporte: idTipoReporte || null,
        limite: parseInt(limite)
      });

      res.json({
        success: true,
        data: historial
      });
    } catch (error) {
      console.error('Error en getHistorialReportes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener historial de reportes',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR EXCEL DE ESTUDIANTES CON HISTORIAL
   * GET /api/reportes/estudiantes/excel-v2
   */
  async descargarExcelEstudiantesV2(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, idCurso, horario } = req.query;
      const idUsuario = req.user?.id_usuario;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Parámetros del reporte
      const parametros = {
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        idCurso: idCurso || null,
        horario: horario || 'todos'
      };

      // Buscar en caché (reportes generados en los últimos 30 minutos)
      const reporteEnCache = await TiposReportesModel.buscarReporteEnCache({
        idTipoReporte: 1, // ID del reporte de estudiantes
        parametros,
        minutosValidez: 30
      });

      if (reporteEnCache) {
        console.log('Reporte encontrado en caché');
        // TODO: Aquí deberías leer el archivo del sistema de archivos
        // Por ahora, regeneramos
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteEstudiantes(parametros);
      const estadisticas = await ReportesModel.getEstadisticasEstudiantes({
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        idCurso: idCurso || null,
        horario: horario || 'todos'
      });

      // Obtener nombre del curso
      let nombreCurso = null;
      if (idCurso) {
        const cursoEncontrado = datos.find(d => d.id_curso == idCurso);
        nombreCurso = cursoEncontrado ? cursoEncontrado.nombre_curso : null;
      }

      // Generar Excel
      const excelBuffer = await generarExcelEstudiantes(datos, {
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        horario: horario || 'todos',
        nombreCurso
      }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_Estudiantes_${fechaInicio}_${fechaFin}.xlsx`;

      // SNAPSHOT: Calcular resumen para el historial
      const snapshotData = {
        ...parametros,
        _snapshot_total_estudiantes: datos.length,
        _snapshot_nuevos_inscritos: estadisticas.total_estudiantes || 0
      };

      // Guardar en historial
      await TiposReportesModel.guardarReporteGenerado({
        idTipoReporte: 1, // Reporte de Estudiantes
        idGeneradoPor: idUsuario,
        archivoGenerado: nombreArchivo,
        formatoGenerado: 'xlsx',
        parametros: snapshotData
      });

      // Enviar Excel
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error en descargarExcelEstudiantesV2:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar Excel de estudiantes',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR EXCEL FINANCIERO CON HISTORIAL
   * GET /api/reportes/financiero/excel-v2
   */
  async descargarExcelFinancieroV2(req, res) {
    try {
      const { fechaInicio, fechaFin, tipoPago, estadoPago, idCurso, estadoCurso, metodoPago, horario } = req.query;
      const idUsuario = req.user?.id_usuario;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      const parametros = {
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos',
        idCurso: idCurso || null,
        estadoCurso: estadoCurso || 'todos',
        metodoPago: metodoPago || 'todos',
        horario: horario || 'todos'
      };

      // Obtener datos CON filtros (para hoja 1: Pagos Detallados)
      const datos = await ReportesModel.getReporteFinanciero(parametros);
      console.log('DEBUG: Datos Financieros encontrados (con filtros):', datos.length);

      // Obtener datos SIN filtro de estadoPago (para hoja 2: Estado de Cuenta)
      // Pero manteniendo otros filtros como curso, fechas, horario, etc.
      const datosSinFiltroEstado = await ReportesModel.getReporteFinanciero({
        ...parametros,
        estadoPago: 'todos' // SIN filtro de estado de pago
      });
      console.log('DEBUG: Datos Financieros encontrados (sin filtro de estado):', datosSinFiltroEstado.length);

      // Obtener estadísticas financieras
      const estadisticas = await ReportesModel.getEstadisticasFinancieras(parametros);

      // Determinar fechas para el encabezado
      let fechasParaEncabezado = { fechaInicio, fechaFin };

      console.log('🔍 DEBUG FinancieroV2 - idCurso recibido:', idCurso);
      console.log('🔍 DEBUG FinancieroV2 - Total datos:', datos.length);

      if (idCurso && datos.length > 0) {
        // Si hay filtro de curso, usar las fechas del curso
        const cursoEncontrado = datos.find(d => d.id_curso == idCurso);
        console.log('🔍 DEBUG FinancieroV2 - Curso encontrado:', cursoEncontrado ? 'SÍ' : 'NO');

        if (cursoEncontrado) {
          console.log('🔍 DEBUG FinancieroV2 - Fecha inicio curso:', cursoEncontrado.fecha_inicio);
          console.log('🔍 DEBUG FinancieroV2 - Fecha fin curso:', cursoEncontrado.fecha_fin);

          // Convertir Date a string YYYY-MM-DD
          const fechaInicioStr = cursoEncontrado.fecha_inicio instanceof Date
            ? cursoEncontrado.fecha_inicio.toISOString().split('T')[0]
            : (typeof cursoEncontrado.fecha_inicio === 'string' ? cursoEncontrado.fecha_inicio.split('T')[0] : fechaInicio);

          const fechaFinStr = cursoEncontrado.fecha_fin instanceof Date
            ? cursoEncontrado.fecha_fin.toISOString().split('T')[0]
            : (typeof cursoEncontrado.fecha_fin === 'string' ? cursoEncontrado.fecha_fin.split('T')[0] : fechaFin);

          fechasParaEncabezado = {
            fechaInicio: fechaInicioStr,
            fechaFin: fechaFinStr
          };

          console.log('✅ Fechas actualizadas para encabezado:', fechasParaEncabezado);
        }
      } else if (datos.length > 0) {
        // Si no hay filtro de curso, usar el rango de todos los cursos en los datos
        const cursosUnicos = new Map();
        datos.forEach(d => {
          if (d.id_curso && d.fecha_inicio && d.fecha_fin) {
            cursosUnicos.set(d.id_curso, {
              inicio: d.fecha_inicio instanceof Date ? d.fecha_inicio : new Date(d.fecha_inicio),
              fin: d.fecha_fin instanceof Date ? d.fecha_fin : new Date(d.fecha_fin)
            });
          }
        });

        if (cursosUnicos.size > 0) {
          const fechasReales = Array.from(cursosUnicos.values());
          const fechaMasAntiguaInicio = fechasReales.reduce((min, d) =>
            d.inicio < min ? d.inicio : min, fechasReales[0].inicio);
          const fechaMasTardiaFin = fechasReales.reduce((max, d) =>
            d.fin > max ? d.fin : max, fechasReales[0].fin);

          fechasParaEncabezado = {
            fechaInicio: fechaMasAntiguaInicio.toISOString().split('T')[0],
            fechaFin: fechaMasTardiaFin.toISOString().split('T')[0]
          };
        }
      }

      console.log('📊 Fechas finales para Excel:', fechasParaEncabezado);

      // Generar Excel con datos filtrados y datos sin filtro de estado
      const excelBuffer = await generarExcelFinanciero(datos, datosSinFiltroEstado, {
        ...parametros,
        ...fechasParaEncabezado
      }, estadisticas);

      // Nombre del archivo usando las fechas del encabezado (con timestamp para evitar caché)
      const timestamp = new Date().getTime();
      const nombreArchivo = `Reporte_Financiero_${fechasParaEncabezado.fechaInicio}_${fechasParaEncabezado.fechaFin}_${timestamp}.xlsx`;

      console.log('📥 Nombre del archivo a descargar:', nombreArchivo);

      // SNAPSHOT: Calcular resumen para el historial
      const totalMonto = datos.reduce((sum, item) => sum + (parseFloat(item.monto) || 0), 0);
      const snapshotData = {
        ...parametros,
        _snapshot_total_transacciones: datos.length,
        _snapshot_monto_total: totalMonto.toFixed(2),
        _snapshot_monto_pendiente: estadisticas.ingresos_pendientes || 0
      };

      // Guardar en historial
      await TiposReportesModel.guardarReporteGenerado({
        idTipoReporte: 2, // Reporte Financiero
        idGeneradoPor: idUsuario,
        archivoGenerado: nombreArchivo,
        formatoGenerado: 'xlsx',
        parametros: snapshotData
      });

      // Enviar Excel
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error en descargarExcelFinancieroV2:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar Excel financiero',
        error: error.message
      });
    }
  },

  /**
   * DESCARGAR EXCEL DE CURSOS CON HISTORIAL
   * GET /api/reportes/cursos/excel-v2
   */
  async descargarExcelCursosV2(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, ocupacion, horario } = req.query;
      const idUsuario = req.user?.id_usuario;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      const parametros = {
        fechaInicio,
        fechaFin,
        estado: estado || 'todos',
        ocupacion: ocupacion || 'todos',
        horario: horario || 'todos'
      };

      // Obtener datos
      const datos = await ReportesModel.getReporteCursos(parametros);
      const estadisticas = await ReportesModel.getEstadisticasCursos(parametros);

      // Generar Excel
      const excelBuffer = await generarExcelCursos(datos, parametros, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_Cursos_${fechaInicio}_${fechaFin}.xlsx`;

      // SNAPSHOT: Calcular resumen para el historial
      const promedioOcupacion = datos.reduce((sum, c) => sum + (parseFloat(c.porcentaje_ocupacion) || 0), 0) / (datos.length || 1);

      const snapshotData = {
        ...parametros,
        _snapshot_total_cursos: datos.length,
        _snapshot_promedio_ocupacion: promedioOcupacion.toFixed(1)
      };

      // Guardar en historial
      await TiposReportesModel.guardarReporteGenerado({
        idTipoReporte: 3, // Reporte de Cursos
        idGeneradoPor: idUsuario,
        archivoGenerado: nombreArchivo,
        formatoGenerado: 'xlsx',
        parametros: snapshotData
      });

      // Enviar Excel
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error en descargarExcelCursosV2:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar Excel de cursos',
        error: error.message
      });
    }
  },

  /**
   * OBTENER ESTADÍSTICAS DE REPORTES GENERADOS
   * GET /api/reportes/estadisticas
   */
  async getEstadisticasReportes(req, res) {
    try {
      const { fechaInicio, fechaFin } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      const estadisticas = await TiposReportesModel.getEstadisticasReportes({
        fechaInicio,
        fechaFin
      });

      res.json({
        success: true,
        data: estadisticas
      });
    } catch (error) {
      console.error('Error en getEstadisticasReportes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estadísticas de reportes',
        error: error.message
      });
    }
  },

  /**
   * OBTENER RANGO DE FECHAS DINÁMICO
   * GET /api/reportes/rango-fechas
   */
  async getRangoFechasDinamico(req, res) {
    try {
      const rango = await ReportesModel.getRangoFechasDinamico();

      res.json({
        success: true,
        data: rango
      });
    } catch (error) {
      console.error('Error al obtener rango de fechas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener rango de fechas dinámico',
        error: error.message
      });
    }
  }
};

module.exports = ReportesController;
