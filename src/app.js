const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Middleware de auditoría
const { auditoriaMiddleware } = require('./middleware/auditoria.middleware');

// Utilidad de inicialización
const inicializarTiposReportes = require('./utils/inicializarTiposReportes');

// Routes
const cursosRoutes = require('./routes/cursos');
const solicitudesRoutes = require('./routes/solicitudes');
const authRoutes = require('./routes/auth');
const adminsRoutes = require('./routes/admins');
const usersRoutes = require('./routes/users');
const rolesRoutes = require('./routes/roles');
const tiposCursosRoutes = require('./routes/tipos-cursos');
const aulasRoutes = require('./routes/aulas');
const estudiantesRoutes = require('./routes/estudiantes');
const docentesRoutes = require('./routes/docentes');
const pagosMenualesRoutes = require('./routes/pagos-mensuales');
const adminPagosRoutes = require('./routes/admin-pagos');
const asignacionesAulasRoutes = require('./routes/asignaciones-aulas');
const modulosRoutes = require('./routes/modulos');
const tareasRoutes = require('./routes/tareas');
const entregasRoutes = require('./routes/entregas');
const calificacionesRoutes = require('./routes/calificaciones');
const reportesRoutes = require('./routes/reportes');
const usuariosRoutes = require('./routes/usuarios');
const auditoriaRoutes = require('./routes/auditoria');

const app = express();

// Middlewares de seguridad básica
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compresión GZIP para todas las respuestas (reduce 70% el tamaño)
app.use(compression());

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://tudominio.com'] 
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173'],
  credentials: true
}));

// Nota: el rate limiting ahora es específico por ruta (ver middleware/rateLimit.js)

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de auditoría (debe ir después de body parsing)
app.use(auditoriaMiddleware);


// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SGA Belleza API'
  });
});

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/admins', adminsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/cursos', cursosRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/tipos-cursos', tiposCursosRoutes);
app.use('/api/aulas', aulasRoutes);
app.use('/api/estudiantes', estudiantesRoutes);
app.use('/api/docentes', docentesRoutes);
app.use('/api/pagos-mensuales', pagosMenualesRoutes);
app.use('/api/admin/pagos', adminPagosRoutes);
app.use('/api/asignaciones-aulas', asignacionesAulasRoutes);
app.use('/api/modulos', modulosRoutes);
app.use('/api/tareas', tareasRoutes);
app.use('/api/entregas', entregasRoutes);
app.use('/api/calificaciones', calificacionesRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/auditoria', auditoriaRoutes);

// Inicializar tipos de reportes al cargar el módulo
// Se ejecutará automáticamente cuando el servidor inicie
inicializarTiposReportes().catch(err => {
  console.error('Error en inicialización de tipos de reportes:', err);
});

module.exports = app;