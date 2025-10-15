const ReportesModel = require('../models/reportes.model');
const { generarPDFEstudiantes, generarPDFFinanciero, generarPDFCursos } = require('../services/reportesPdfService');
const { generarExcelEstudiantes, generarExcelFinanciero, generarExcelCursos } = require('../services/reportesExcelService');

const ReportesController = {
  /**
   * OBTENER REPORTE DE ESTUDIANTES (Vista previa)
   * GET /api/reportes/estudiantes
   */
  async getReporteEstudiantes(req, res) {
    try {
      const { fechaInicio, fechaFin, estado, idCurso } = req.query;

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
        idCurso: idCurso || null
      });

      // Obtener estadísticas
      const estadisticas = await ReportesModel.getEstadisticasEstudiantes({
        fechaInicio,
        fechaFin
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
            nombreCurso
          },
          total: datos.length
        }
      });
    } catch (error) {
      console.error('❌ Error en getReporteEstudiantes:', error);
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
      const { fechaInicio, fechaFin, estado, idCurso } = req.query;

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
        idCurso: idCurso || null
      });

      const estadisticas = await ReportesModel.getEstadisticasEstudiantes({
        fechaInicio,
        fechaFin
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
      console.error('❌ Error en descargarPDFEstudiantes:', error);
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
      const { fechaInicio, fechaFin, estado, idCurso } = req.query;

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
        idCurso: idCurso || null
      });

      const estadisticas = await ReportesModel.getEstadisticasEstudiantes({
        fechaInicio,
        fechaFin
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
        nombreCurso
      }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_Estudiantes_${fechaInicio}_${fechaFin}.xlsx`;

      // Enviar Excel
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('❌ Error en descargarExcelEstudiantes:', error);
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
      const { fechaInicio, fechaFin, tipoPago, estadoPago } = req.query;

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
        estadoPago: estadoPago || 'todos'
      });

      // Obtener estadísticas
      const estadisticas = await ReportesModel.getEstadisticasFinancieras({
        fechaInicio,
        fechaFin
      });

      res.json({
        success: true,
        data: {
          datos,
          estadisticas,
          filtros: {
            fechaInicio,
            fechaFin,
            tipoPago: tipoPago || 'todos',
            estadoPago: estadoPago || 'todos'
          },
          total: datos.length
        }
      });
    } catch (error) {
      console.error('❌ Error en getReporteFinanciero:', error);
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
      const { fechaInicio, fechaFin, tipoPago, estadoPago } = req.query;

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
        estadoPago: estadoPago || 'todos'
      });

      const estadisticas = await ReportesModel.getEstadisticasFinancieras({
        fechaInicio,
        fechaFin
      });

      // Generar PDF
      const pdfBuffer = await generarPDFFinanciero(datos, {
        fechaInicio,
        fechaFin,
        tipoPago: tipoPago || 'todos',
        estadoPago: estadoPago || 'todos'
      }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_Financiero_${fechaInicio}_${fechaFin}.pdf`;

      // Enviar PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('❌ Error en descargarPDFFinanciero:', error);
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
      const { fechaInicio, fechaFin, tipoPago, estadoPago } = req.query;

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
        estadoPago: estadoPago || 'todos'
      });

      const estadisticas = await ReportesModel.getEstadisticasFinancieras({
        fechaInicio,
        fechaFin
      });

      // Generar Excel
      const excelBuffer = await generarExcelFinanciero(datos, {
        fechaInicio,
        fechaFin,
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
      console.error('❌ Error en descargarExcelFinanciero:', error);
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
      const { fechaInicio, fechaFin } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas de inicio y fin son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteCursos({
        fechaInicio,
        fechaFin
      });

      // Obtener estadísticas
      const estadisticas = await ReportesModel.getEstadisticasCursos({
        fechaInicio,
        fechaFin
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
      console.error('❌ Error en getReporteCursos:', error);
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
      console.error('❌ Error en getCursosParaFiltro:', error);
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
      const { fechaInicio, fechaFin } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteCursos({ fechaInicio, fechaFin });
      const estadisticas = await ReportesModel.getEstadisticasCursos({ fechaInicio, fechaFin });

      // Generar PDF
      const pdfBuffer = await generarPDFCursos(datos, { fechaInicio, fechaFin }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_cursos_${fechaInicio}_${fechaFin}.pdf`;

      // Enviar PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('❌ Error descargando PDF de cursos:', error);
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
      const { fechaInicio, fechaFin } = req.query;

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
          success: false,
          message: 'Las fechas son obligatorias'
        });
      }

      // Obtener datos
      const datos = await ReportesModel.getReporteCursos({ fechaInicio, fechaFin });
      const estadisticas = await ReportesModel.getEstadisticasCursos({ fechaInicio, fechaFin });

      // Generar Excel
      const excelBuffer = await generarExcelCursos(datos, { fechaInicio, fechaFin }, estadisticas);

      // Nombre del archivo
      const nombreArchivo = `Reporte_cursos_${fechaInicio}_${fechaFin}.xlsx`;

      // Enviar Excel
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('❌ Error descargando Excel de cursos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar Excel de cursos',
        error: error.message
      });
    }
  }
};

module.exports = ReportesController;
