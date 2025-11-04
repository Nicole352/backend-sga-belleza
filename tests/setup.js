// Configuración global para tests
require('dotenv').config({ path: '.env.test' });

// Mock de console.log para tests limpios (opcional)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Mantener error y warn para debugging
  error: console.error,
  warn: console.warn,
};

// Timeout global para operaciones de BD
jest.setTimeout(10000);
