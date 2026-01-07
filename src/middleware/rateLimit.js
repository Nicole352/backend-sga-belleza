const rateLimit = require('express-rate-limit');

// Rate limiting para APIs generales
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 2000, // 2000 solicitudes por ventana de tiempo por IP
  message: {
    error: 'Demasiadas solicitudes, intenta de nuevo en 15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting más estricto para endpoints específicos
const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // aumentado de 30 a 100 requests por minuto por IP
  message: {
    error: 'Demasiadas solicitudes, intenta de nuevo en 1 minuto'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting para polling (MÁS ESTRICTO - evita colapso)
const pollingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 120, // aumentado de 10 a 120 requests por minuto (2 cada segundo)
  message: {
    error: 'Demasiadas solicitudes de polling, reduce la frecuencia'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting específico para login (más permisivo pero seguro)
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 30, // 30 intentos por IP en 5 min
  message: {
    error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // No contar inicios de sesión exitosos contra el límite
});

module.exports = {
  generalLimiter,
  strictLimiter,
  pollingLimiter,
  loginLimiter
};
