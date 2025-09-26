const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

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

const app = express();

// Middlewares de seguridad básica
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

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

module.exports = app;