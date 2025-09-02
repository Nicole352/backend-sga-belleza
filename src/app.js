const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Routes
const cursosRoutes = require('./routes/cursos');
const solicitudesRoutes = require('./routes/solicitudes');

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

// Rate limiting básico
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: {
    error: 'Demasiadas solicitudes, intenta de nuevo en 15 minutos'
  }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files para comprobantes
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SGA Belleza API'
  });
});

// Rutas API
app.use('/api/cursos', cursosRoutes);
app.use('/api/solicitudes', solicitudesRoutes);

module.exports = app;